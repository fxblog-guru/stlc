// openapi-fuzz.ts — schema-driven API fuzzing: walk every operation in OPENAPI_SPEC, derive hostile
// inputs from its own schemas, send them, and judge each response with an oracle that needs no
// expected values. Scripted cases check what the spec PREDICTS; this checks what the spec PROMISES
// for every input nobody wrote a row for.
//
//   inputs   per body property / query / path / header param: boundaries from the schema (minLength−1,
//            maxLength+1, minimum−1, maximum+1), enum outsiders and case mismatches, wrong types, null,
//            missing required, extra properties, huge strings, unicode / zero-width / RTL / emoji,
//            whitespace-only, malformed JSON, wrong content-type, wrong top-level type; for path ids an
//            unknown id, a malformed id, traversal; then ONE valid baseline request last.
//   oracle   never a 5xx · every 4xx is documented for the operation and its body validates against
//            the documented problem schema · every 2xx validates against the response schema (no
//            undeclared properties) · no stack trace, file path or internal field in any body.
//   replay   inputs come from a seeded PRNG (QA_FUZZ_SEED, default 1; `random` draws one) and are
//            capped at QA_FUZZ_MAX per operation per actor. Every finding prints the seed and the
//            exact request, so `QA_FUZZ_SEED=<n> npx playwright test <spec>` replays it.
//
// The spec that drives this (golden: scripts/api/_fuzz/TC-API-FUZZ-001-*.spec.ts) is generic: the
// only project-specific part is how path ids are obtained (a factory or a list call). Opt-in per
// operation lives in the case's `## Data` (`- fuzz-allow:` / `- fuzz-deny:`), read by fuzzSelection().
import { readFileSync } from 'node:fs';
import { openApiDocument, resolveRef, responseFindings } from '../schemas/openapi.validator';
import type { ApiClient, ApiResponse } from '../http/api.client';
import type { Prng } from '../data/prng';

type Json = Record<string, unknown>;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

export interface FuzzParam {
  name: string;
  in: 'path' | 'query' | 'header';
  required: boolean;
  schema: Json;
}

export interface FuzzOperation {
  operationId: string;
  method: string;
  /** the spec's path template, e.g. /projects/{projectId} */
  path: string;
  params: FuzzParam[];
  /** the JSON request body schema (resolved), when the operation takes one */
  body?: { schema: Json; required: boolean };
  /** false when the operation declares `security: []` (anonymous by design) */
  secured: boolean;
}

export interface FuzzInput {
  /** what was mutated and how — printed on a finding */
  label: string;
  path: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  /** the raw request body text (already serialized — malformed JSON included), or undefined */
  body?: string;
  /** true for the one well-formed baseline request */
  baseline?: boolean;
}

export interface FuzzFinding {
  operationId: string;
  actor: string;
  input: string;
  request: string;
  status: number;
  problems: string[];
  excerpt: string;
}

// ── the operations ──────────────────────────────────────────────────────────────────────────────

/** Every operation of the OpenAPI document, with $refs resolved one level deep. */
export async function fuzzOperations(): Promise<FuzzOperation[]> {
  const doc = await openApiDocument();
  const globalSecured = Array.isArray(doc.security) ? (doc.security as unknown[]).length > 0 : true;
  const out: FuzzOperation[] = [];
  for (const [path, item] of Object.entries((doc.paths ?? {}) as Record<string, Json>)) {
    const shared = ((item.parameters as Json[]) ?? []);
    for (const method of METHODS) {
      const op = item[method] as Json | undefined;
      if (!op || typeof op.operationId !== 'string') continue;
      const params: FuzzParam[] = [];
      for (const raw of [...shared, ...((op.parameters as Json[]) ?? [])]) {
        const p = (await resolveRef(raw)) ?? raw;
        if (!['path', 'query', 'header'].includes(String(p.in))) continue;
        params.push({ name: String(p.name), in: p.in as FuzzParam['in'], required: p.in === 'path' || p.required === true, schema: (await resolveRef(p.schema as Json)) ?? {} });
      }
      const content = ((op.requestBody as Json | undefined)?.content ?? {}) as Record<string, Json>;
      const media = Object.keys(content).find((m) => /json/i.test(m));
      const schema = media ? await deepResolve(content[media].schema as Json) : undefined;
      out.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path,
        params,
        body: schema ? { schema, required: (op.requestBody as Json).required === true } : undefined,
        secured: Array.isArray(op.security) ? (op.security as unknown[]).length > 0 : globalSecured,
      });
    }
  }
  return out;
}

async function deepResolve(schema: Json | undefined, depth = 0): Promise<Json | undefined> {
  const s = await resolveRef(schema);
  if (!s || depth > 6) return s;
  const props = s.properties as Record<string, Json> | undefined;
  if (!props) return s;
  const resolved: Record<string, Json> = {};
  for (const [k, v] of Object.entries(props)) resolved[k] = (await deepResolve(v, depth + 1)) ?? {};
  return { ...s, properties: resolved };
}

// ── opt-in from the case file ──────────────────────────────────────────────────────────────────

/** Read `- fuzz-allow: a, b | *` and `- fuzz-deny: c (reason), d` from the case's `## Data`. */
export function fuzzSelection(casePath: string): { allowed: (operationId: string) => boolean; allow: string[]; deny: string[] } {
  const text = readFileSync(casePath, 'utf8').replace(/\r\n?/g, '\n');
  const data = text.split(/^## Data\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  const list = (key: string) =>
    (data.match(new RegExp(`^- ${key}:\\s*(.+)$`, 'm'))?.[1] ?? '')
      .replace(/\([^)]*\)/g, '').split(',').map((s) => s.trim().replace(/`/g, '')).filter(Boolean);
  const allow = list('fuzz-allow');
  const deny = list('fuzz-deny');
  if (!allow.length) throw new Error(`${casePath}: ## Data has no \`- fuzz-allow:\` line (operationIds, or * for every operation)`);
  return { allow, deny, allowed: (id) => (allow.includes('*') || allow.includes(id)) && !deny.includes(id) };
}

// ── inputs ─────────────────────────────────────────────────────────────────────────────────────

const HUGE = 'x'.repeat(100_000);
const ZERO_WIDTH = 'a​‌‍﻿b';
const RTL_EMOJI = 'مرحبا ‮👩‍💻🎉';
const UNICODE = 'Zürich – 東京 – ѐ';

const types = (s: Json): string[] => (Array.isArray(s.type) ? (s.type as string[]) : s.type ? [String(s.type)] : []);
const nullable = (s: Json) => types(s).includes('null') || s.nullable === true;

/** A valid value for a schema — the base every mutation starts from. */
export function validValue(s: Json, prng: Prng): unknown {
  if (Array.isArray(s.enum) && s.enum.length) return prng.pick(s.enum as unknown[]);
  const t = types(s).filter((x) => x !== 'null')[0] ?? (s.properties ? 'object' : 'string');
  if (t === 'string') {
    if (s.format === 'uuid') return prng.uuid();
    if (s.format === 'date-time') return '2026-01-02T03:04:05Z';
    if (s.format === 'email') return `fuzz.${prng.int(1000, 9999)}@example.test`;
    const min = Number(s.minLength ?? 1);
    const max = Math.min(Number(s.maxLength ?? 24), 24);
    return `fz${prng.int(100000, 999999)}`.padEnd(Math.max(min, 1), 'z').slice(0, Math.max(max, min, 1));
  }
  if (t === 'integer' || t === 'number') return Math.max(Number(s.minimum ?? 1), Math.min(Number(s.maximum ?? 10), prng.int(1, 10)));
  if (t === 'boolean') return true;
  if (t === 'array') return [];
  if (t === 'object') {
    const o: Json = {};
    for (const [k, v] of Object.entries((s.properties ?? {}) as Record<string, Json>)) o[k] = validValue(v, prng);
    return o;
  }
  return null;
}

/** Hostile values for one schema, labelled. Never values the schema accepts by construction. */
export function hostileValues(s: Json, prng: Prng): { label: string; value: unknown }[] {
  const out: { label: string; value: unknown }[] = [];
  const t = types(s).filter((x) => x !== 'null')[0] ?? 'string';
  if (!nullable(s)) out.push({ label: 'null', value: null });
  if (Array.isArray(s.enum) && s.enum.length) {
    const first = String(s.enum[0]);
    out.push({ label: 'enum outsider', value: `${first}-not-in-enum` });
    if (first.toUpperCase() !== first) out.push({ label: 'enum case mismatch', value: first.toUpperCase() });
  }
  if (t === 'string') {
    const min = s.minLength === undefined ? undefined : Number(s.minLength);
    const max = s.maxLength === undefined ? undefined : Number(s.maxLength);
    const base = String(validValue(s, prng));
    if (min !== undefined && min > 0) out.push({ label: `length ${min - 1} (minLength − 1)`, value: base.slice(0, 0).padEnd(min - 1, 'a') });
    if (min !== undefined) out.push({ label: `length ${min} (minLength)`, value: base.padEnd(min, 'a').slice(0, Math.max(min, 1)) });
    if (max !== undefined) {
      out.push({ label: `length ${max} (maxLength)`, value: base.padEnd(max, 'm').slice(0, max) });
      out.push({ label: `length ${max + 1} (maxLength + 1)`, value: base.padEnd(max + 1, 'm').slice(0, max + 1) });
    }
    out.push({ label: 'huge string (100 000 chars)', value: HUGE });
    out.push({ label: 'whitespace only', value: ' \t ' });
    out.push({ label: 'unicode', value: `${base} ${UNICODE}`.slice(0, max ?? 200) });
    out.push({ label: 'zero-width characters', value: ZERO_WIDTH });
    out.push({ label: 'RTL override + emoji', value: RTL_EMOJI });
    if (s.format === 'uuid') out.push({ label: 'not a uuid', value: 'not-a-uuid' });
    out.push({ label: 'wrong type: number', value: 12345 });
    out.push({ label: 'wrong type: object', value: { nested: true } });
  } else if (t === 'integer' || t === 'number') {
    if (s.minimum !== undefined) out.push({ label: `minimum − 1 (${Number(s.minimum) - 1})`, value: Number(s.minimum) - 1 });
    if (s.maximum !== undefined) out.push({ label: `maximum + 1 (${Number(s.maximum) + 1})`, value: Number(s.maximum) + 1 });
    if (t === 'integer') out.push({ label: 'fraction', value: 1.5 });
    out.push({ label: 'wrong type: string', value: 'abc' });
    out.push({ label: 'huge number', value: 1e308 });
  } else if (t === 'boolean') {
    out.push({ label: 'wrong type: string', value: 'yes' });
  } else {
    out.push({ label: 'wrong type: string', value: 'abc' });
  }
  out.push({ label: 'wrong type: array', value: ['a'] });
  return out;
}

const asParam = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

/** Every input for one operation (mutations first, the valid baseline LAST — it may delete the
 *  parent), sampled down to `max` with the PRNG. `ids` = valid path ids; `seedBody` = an optional
 *  valid body from a factory (unique names) instead of a schema-generated one. */
export function fuzzInputs(op: FuzzOperation, prng: Prng, max: number, ids: Record<string, string>, seedBody?: Json): FuzzInput[] {
  const path: Record<string, string> = {};
  for (const p of op.params.filter((x) => x.in === 'path')) path[p.name] = ids[p.name] ?? String(validValue(p.schema, prng));
  const query: Record<string, string> = {};
  for (const p of op.params.filter((x) => x.in === 'query' && x.required)) query[p.name] = asParam(validValue(p.schema, prng));
  const body = op.body ? ((seedBody ?? validValue(op.body.schema, prng)) as Json) : undefined;
  const base = (): FuzzInput => ({ label: '', path: { ...path }, query: { ...query }, headers: op.body ? { 'Content-Type': 'application/json' } : {}, body: body === undefined ? undefined : JSON.stringify(body) });
  const mut: FuzzInput[] = [];
  const add = (label: string, f: (i: FuzzInput) => void) => { const i = base(); i.label = label; f(i); mut.push(i); };

  for (const p of op.params) {
    if (p.in === 'path') {
      add(`path ${p.name}: unknown id`, (i) => { i.path[p.name] = prng.uuid(); });
      add(`path ${p.name}: malformed id`, (i) => { i.path[p.name] = 'not-an-id'; });
      add(`path ${p.name}: traversal`, (i) => { i.path[p.name] = '../../etc/passwd'; });
      add(`path ${p.name}: very long`, (i) => { i.path[p.name] = 'z'.repeat(2048); });
      add(`path ${p.name}: unicode`, (i) => { i.path[p.name] = UNICODE; });
    } else if (p.in === 'query') {
      if (p.required) add(`query ${p.name}: missing (required)`, (i) => { delete i.query[p.name]; });
      for (const h of hostileValues(p.schema, prng).filter((x) => !/huge string/.test(x.label)))
        add(`query ${p.name}: ${h.label}`, (i) => { i.query[p.name] = asParam(h.value); });
    } else {
      // a header carries printable ASCII only (anything else is refused by the HTTP client, not the server)
      for (const h of hostileValues(p.schema, prng).filter((x) => ['string', 'number'].includes(typeof x.value) && String(x.value).length < 1000 && /^[\x20-\x7e]*$/.test(String(x.value))))
        add(`header ${p.name}: ${h.label}`, (i) => { i.headers[p.name] = String(h.value); });
      add(`header ${p.name}: garbage`, (i) => { i.headers[p.name] = '"\\"<>;,'; });
    }
  }
  add('query: unknown parameter', (i) => { i.query.fuzz_unknown = '1'; });

  if (op.body && body && typeof body === 'object') {
    const props = (op.body.schema.properties ?? {}) as Record<string, Json>;
    const required = (op.body.schema.required ?? []) as string[];
    for (const r of required) add(`body: missing required ${r}`, (i) => { const b = { ...body }; delete b[r]; i.body = JSON.stringify(b); });
    add('body: extra property', (i) => { i.body = JSON.stringify({ ...body, fuzz_extra: 'x' }); });
    for (const [k, s] of Object.entries(props))
      for (const h of hostileValues(s, prng)) add(`body.${k}: ${h.label}`, (i) => { i.body = JSON.stringify({ ...body, [k]: h.value }); });
    add('body: empty object', (i) => { i.body = '{}'; });
    add('body: null', (i) => { i.body = 'null'; });
    add('body: array', (i) => { i.body = JSON.stringify([body]); });
    add('body: a JSON string', (i) => { i.body = '"text"'; });
    add('body: malformed JSON', (i) => { i.body = '{"name": "unterminated'; });
    add('body: wrong content-type (text/plain)', (i) => { i.headers['Content-Type'] = 'text/plain'; });
    if (op.body.required) add('body: none', (i) => { i.body = undefined; });
  }
  const baseline = base();
  baseline.label = 'valid baseline';
  baseline.baseline = true;
  return [...prng.sample(mut, Math.max(0, max - 1)), baseline];
}

// ── the oracle ─────────────────────────────────────────────────────────────────────────────────

// A body must never carry a stack frame, a source path or an internal field.
const LEAK_PATTERNS: [RegExp, string][] = [
  [/\n\s+at [^\n]+\(?[^\n]*:\d+:\d+\)?/, 'stack frame'],
  [/Traceback \(most recent call last\)/, 'Python traceback'],
  [/node:internal|file:\/\/\//, 'runtime path'],
  [/[A-Za-z]:\\\\[^"]+\\\\|\/(home|usr|var|opt|srv|app)\/[\w.-]+\//, 'file system path'],
  [/\.(m?js|ts|py|java|cs|go|rb|php):\d+/, 'source location'],
  [/SQLSTATE|ORA-\d{5}|syntax error at or near|SQLITE_/, 'database error'],
];
const LEAK_KEYS = /^(stack|stacktrace|stack_trace|trace|exception|sql|query_text|password|password_hash|secret|internal)$/i;

function leakedKeys(v: unknown, at = '$'): string[] {
  if (!v || typeof v !== 'object') return [];
  if (Array.isArray(v)) return v.flatMap((x, i) => leakedKeys(x, `${at}[${i}]`));
  return Object.entries(v as Json).flatMap(([k, x]) => (LEAK_KEYS.test(k) ? [`${at}.${k}`] : []).concat(leakedKeys(x, `${at}.${k}`)));
}

/** The oracle: the problems with one response (empty = acceptable). */
export async function judge(op: FuzzOperation, res: ApiResponse<unknown>): Promise<string[]> {
  const problems: string[] = [];
  if (res.status >= 500) problems.push(`5xx: HTTP ${res.status} — the server failed on input it should refuse`);
  else if (res.status >= 400 || (res.status >= 200 && res.status < 300)) {
    const ct = res.headers['content-type'] ?? '';
    if (res.text && !/json/i.test(ct) && res.status !== 204) problems.push(`HTTP ${res.status} body is not JSON (content-type: ${ct || 'none'})`);
    else problems.push(...(await responseFindings(op.operationId, res)).map((p) => `HTTP ${res.status}: ${p}`));
  } else if (res.status >= 300) problems.push(`HTTP ${res.status}: a redirect on an API operation`);
  const text = res.text.replace(/\\n/g, '\n'); // a stack inside a JSON string arrives with escaped newlines
  for (const [re, what] of LEAK_PATTERNS) if (re.test(text)) problems.push(`leak: ${what} in the body`);
  for (const k of leakedKeys(res.body)) problems.push(`leak: internal field ${k} in the body`);
  return problems;
}

// ── one operation, end to end ──────────────────────────────────────────────────────────────────

export const fillPath = (template: string, values: Record<string, string>) =>
  template.replace(/\{([^}]+)\}/g, (_m, name: string) => encodeURIComponent(values[name] ?? ''));

/** Send every input as `client`; return the findings. `onCreated` sees every 2xx body so the spec
 *  can register cleanup for whatever a lenient server created. */
export async function fuzzOperation(opts: {
  op: FuzzOperation;
  client: ApiClient;
  actor: string;
  inputs: FuzzInput[];
  onCreated?: (op: FuzzOperation, body: unknown) => void;
}): Promise<FuzzFinding[]> {
  const findings: FuzzFinding[] = [];
  for (const input of opts.inputs) {
    const url = fillPath(opts.op.path, input.path);
    const res = await opts.client.request(opts.op.method, url, {
      params: Object.keys(input.query).length ? input.query : undefined,
      headers: input.headers,
      data: input.body,
    });
    if (res.status >= 200 && res.status < 300) opts.onCreated?.(opts.op, res.body);
    const problems = await judge(opts.op, res);
    if (problems.length) {
      const qs = new URLSearchParams(input.query).toString();
      findings.push({
        operationId: opts.op.operationId,
        actor: opts.actor,
        input: input.label,
        request: `${opts.op.method} ${url}${qs ? `?${qs}` : ''}${input.body === undefined ? '' : ` body=${input.body.slice(0, 160)}`}`,
        status: res.status,
        problems,
        excerpt: res.text.slice(0, 300),
      });
    }
  }
  return findings;
}

/** Cleanup for whatever a lenient server created: a 2xx from a POST on a collection whose body has
 *  an `id` registers `DELETE <collection>/{id}` — when the spec documents that operation. */
export function createdCleanup(ops: FuzzOperation[], client: ApiClient, cleanup: { add(label: string, undo: () => Promise<unknown>): void }) {
  return (op: FuzzOperation, body: unknown) => {
    const id = body && typeof body === 'object' ? (body as Json).id : undefined;
    if (op.method !== 'POST' || typeof id !== 'string') return;
    const del = ops.find((o) => o.method === 'DELETE' && new RegExp(`^${op.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\{[^}]+\\}$`).test(o.path));
    if (del) cleanup.add(`fuzz-created ${op.operationId} ${id}`, () => client.request('DELETE', `${op.path}/${encodeURIComponent(id)}`));
  };
}

export interface FuzzPlan {
  /** the operations to fuzz (already filtered by fuzzSelection) */
  ops: FuzzOperation[];
  client: ApiClient;
  actor: string;
  /** the run seed — printed with every finding (formatFindings) */
  seed: number;
  max: number;
  /** path parameter name → a fresh valid id (a factory or a list call); unknown names get a random uuid */
  ids: Record<string, () => Promise<string>>;
  /** operationId → a valid body from a factory (unique names); others get a schema-generated body */
  bodies?: Record<string, () => Record<string, unknown>>;
  /** register the undo of anything a 2xx created */
  onCreated?: (op: FuzzOperation, body: unknown) => void;
  /** the PRNG for one operation × actor stream: `(l) => new Prng(streamSeed(seed, l))` (data/prng.ts) */
  prngFor: (label: string) => Prng;
}

/** Fuzz every operation of a plan as one actor; return every finding. Each operation gets its own
 *  PRNG stream (seed × operationId × actor) and its own fresh parent ids. */
export async function fuzzAll(plan: FuzzPlan): Promise<FuzzFinding[]> {
  const findings: FuzzFinding[] = [];
  for (const op of plan.ops) {
    const ids: Record<string, string> = {};
    for (const p of op.params.filter((x) => x.in === 'path')) {
      const make = plan.ids[p.name];
      if (make) ids[p.name] = await make();
    }
    const prng = plan.prngFor(`${op.operationId}:${plan.actor}`);
    const inputs = fuzzInputs(op, prng, plan.max, ids, plan.bodies?.[op.operationId]?.());
    findings.push(...(await fuzzOperation({ op, client: plan.client, actor: plan.actor, inputs, onCreated: plan.onCreated })));
  }
  return findings;
}

/** A finding list as the failure message: seed first, so the run replays. */
export function formatFindings(findings: FuzzFinding[], seed: number, spec: string): string {
  return [
    `${findings.length} fuzz finding(s) — replay: QA_FUZZ_SEED=${seed} npx playwright test ${spec}`,
    ...findings.map((f, i) => `${i + 1}. [${f.operationId} as ${f.actor}] ${f.input}\n   ${f.request}\n   → ${f.problems.join('\n   → ')}\n   body: ${f.excerpt}`),
  ].join('\n');
}
