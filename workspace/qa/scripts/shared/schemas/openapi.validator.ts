// openapi.validator.ts — response shapes are asserted against the OpenAPI document, never against
// a hand-typed shape (generating-api-script rule 12). Loads OPENAPI_SPEC once (YAML or JSON,
// path relative to the QA root or a URL), registers the whole document with Ajv so internal $refs
// resolve, and compiles one validator per (operationId, status).
//   await expectSchema(res, 'createOrder', 201);
// Contract drift: properties present in the body but absent from the schema are reported
// (`unknownProperties`) and fail the assertion when the schema forbids them or when
// `strict: true` is passed — the default for contract/drift cases.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect } from '@playwright/test';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { ErrorObject, ValidateFunction } from 'ajv';
import { parse as parseYaml } from 'yaml';

type Json = Record<string, unknown>;

interface Loaded {
  doc: Json;
  ajv: Ajv;
}

let loaded: Loaded | undefined;
const compiled = new Map<string, { validate: ValidateFunction; schema: Json | undefined }>();

const SPEC_ID = 'openapi';

async function loadSpec(): Promise<Loaded> {
  if (loaded) return loaded;
  const location = process.env.OPENAPI_SPEC ?? 'docs/openapi.yaml';
  let text: string;
  if (/^https?:\/\//.test(location)) {
    const res = await fetch(location);
    if (!res.ok) throw new Error(`OPENAPI_SPEC ${location} → HTTP ${res.status}`);
    text = await res.text();
  } else {
    try {
      text = readFileSync(resolve(process.cwd(), location), 'utf8');
    } catch {
      throw new Error(`OpenAPI document not found at OPENAPI_SPEC=${location} (<qa-root>/.env.<env>) — a case that asserts schemas needs the spec declared in PROJECT-PROFILE §Application under test`);
    }
  }
  const doc = (location.endsWith('.json') || text.trim().startsWith('{') ? JSON.parse(text) : parseYaml(text)) as Json;
  const version = String(doc.openapi ?? doc.swagger ?? '');
  // OpenAPI 3.1 = JSON Schema 2020-12; 3.0 = a draft-07-like dialect with `nullable`.
  const ajv = version.startsWith('3.1')
    ? new Ajv2020({ strict: false, allErrors: true, validateFormats: true })
    : new Ajv({ strict: false, allErrors: true, validateFormats: true });
  addFormats(ajv);
  ajv.addSchema(doc, SPEC_ID);
  loaded = { doc, ajv };
  return loaded;
}

/** JSON-pointer escape for a path segment. */
const esc = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');

function findOperation(doc: Json, operationId: string): { path: string; method: string; op: Json } {
  const paths = (doc.paths ?? {}) as Record<string, Record<string, Json>>;
  for (const [path, item] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(item)) {
      if (op && typeof op === 'object' && op.operationId === operationId) return { path, method, op };
    }
  }
  throw new Error(`operationId "${operationId}" not found in the OpenAPI document — check the spec (or the case cites an endpoint the spec does not describe: COVERAGE-GAP)`);
}

function responseSchemaPointer(doc: Json, operationId: string, status: number): { pointer: string; schema: Json | undefined } {
  const { path, method, op } = findOperation(doc, operationId);
  const responses = (op.responses ?? {}) as Record<string, Json>;
  const key = responses[String(status)] ? String(status) : responses[`${String(status)[0]}XX`] ? `${String(status)[0]}XX` : responses.default ? 'default' : undefined;
  if (!key) throw new Error(`${operationId}: no response documented for status ${status} (documented: ${Object.keys(responses).join(', ') || 'none'})`);
  const content = (responses[key].content ?? {}) as Record<string, Json>;
  const mediaType = Object.keys(content).find((m) => /json/i.test(m));
  if (!mediaType) return { pointer: '', schema: undefined }; // documented as body-less (204) or non-JSON
  const schema = content[mediaType].schema as Json | undefined;
  const pointer = `#/paths/${esc(path)}/${method}/responses/${key}/content/${esc(mediaType)}/schema`;
  return { pointer, schema };
}

async function validatorFor(operationId: string, status: number) {
  const key = `${operationId}:${status}`;
  const hit = compiled.get(key);
  if (hit) return hit;
  const { doc, ajv } = await loadSpec();
  const { pointer, schema } = responseSchemaPointer(doc, operationId, status);
  const validate = pointer ? ajv.compile({ $ref: `${SPEC_ID}${pointer}` }) : ajv.compile({});
  const entry = { validate, schema };
  compiled.set(key, entry);
  return entry;
}

/** Resolve a local `$ref` inside the loaded document (for the drift walk). */
function deref(doc: Json, schema: Json | undefined): Json | undefined {
  let s = schema;
  for (let i = 0; s && typeof s.$ref === 'string' && i < 10; i++) {
    const ref = s.$ref as string;
    if (!ref.startsWith('#/')) return s;
    s = ref.slice(2).split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
      .reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Json)[k] : undefined), doc) as Json | undefined;
  }
  return s;
}

/** Properties present in `value` that the schema does not declare — the contract-drift signal.
 *  Walks objects and arrays; `allOf` members are merged; for `oneOf`/`anyOf` the branch that
 *  leaves the fewest undeclared properties is the one the value was meant to match. */
export function unknownProperties(doc: Json, schema: Json | undefined, value: unknown, at = '$'): string[] {
  const s = deref(doc, schema);
  if (!s || value === null || typeof value !== 'object') return [];
  const branches = ((s.oneOf ?? s.anyOf) as Json[] | undefined) ?? [];
  if (branches.length) {
    return branches
      .map((b) => unknownProperties(doc, b, value, at))
      .reduce((best, cur) => (cur.length < best.length ? cur : best));
  }
  if (Array.isArray(value)) {
    const items = s.items as Json | undefined;
    return value.flatMap((v, i) => unknownProperties(doc, items, v, `${at}[${i}]`));
  }
  const declared: Record<string, Json> = {};
  const collect = (x: Json | undefined) => {
    const d = deref(doc, x);
    if (!d) return;
    Object.assign(declared, (d.properties as Record<string, Json>) ?? {});
    for (const m of (d.allOf as Json[]) ?? []) collect(m);
  };
  collect(s);
  if (s.additionalProperties === true || (typeof s.additionalProperties === 'object' && s.additionalProperties)) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(value as Json)) {
    if (!(k in declared)) { out.push(`${at}.${k}`); continue; }
    out.push(...unknownProperties(doc, declared[k], v, `${at}.${k}`));
  }
  return out;
}

export interface SchemaOptions {
  /** fail on properties the schema does not declare (default true — contract drift is a finding) */
  strict?: boolean;
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? []).map((e) => `${e.instancePath || '$'} ${e.message ?? ''}${e.params ? ` ${JSON.stringify(e.params)}` : ''}`).join('\n');
}

/** Assert that `res.body` validates against the spec's schema for (operationId, status). */
export async function expectSchema(
  res: { status: number; body: unknown },
  operationId: string,
  status: number,
  opts: SchemaOptions = {},
): Promise<void> {
  const strict = opts.strict ?? true;
  const { validate, schema } = await validatorFor(operationId, status);
  expect(res.status, `${operationId}: expected HTTP ${status} before validating its schema`).toBe(status);
  const valid = validate(res.body);
  expect(valid, `${operationId} ${status}: body does not match the OpenAPI schema\n${formatErrors(validate.errors)}`).toBe(true);
  if (strict && schema) {
    const drift = unknownProperties((await loadSpec()).doc, schema, res.body);
    expect(drift, `${operationId} ${status}: contract drift — properties not in the spec: ${drift.join(', ')}`).toEqual([]);
  }
}

/** The loaded OpenAPI document (for generic walkers such as shared/fuzz/openapi-fuzz.ts). */
export async function openApiDocument(): Promise<Json> {
  return (await loadSpec()).doc;
}

/** Resolve a local `$ref` (and nested ones) inside the loaded document. */
export async function resolveRef(schema: Json | undefined): Promise<Json | undefined> {
  return deref((await loadSpec()).doc, schema);
}

/** Non-asserting check of any response against the spec: is the status documented for the
 *  operation, and does the body validate (+ no undeclared properties)? Never throws for an
 *  undocumented status — that is itself the finding. */
export async function responseFindings(operationId: string, res: { status: number; body: unknown }): Promise<string[]> {
  const { doc } = await loadSpec();
  let entry;
  try {
    entry = await validatorFor(operationId, res.status);
  } catch (e) {
    return [String((e as Error).message)];
  }
  const out: string[] = [];
  if (!entry.validate(res.body)) out.push(`body does not match the schema for ${res.status}: ${formatErrors(entry.validate.errors).replace(/\n/g, '; ')}`);
  if (entry.schema) {
    const drift = unknownProperties(doc, entry.schema, res.body);
    if (drift.length) out.push(`properties not in the spec: ${drift.join(', ')}`);
  }
  return out;
}

/** Non-asserting variant for table-driven rows that collect findings before asserting. */
export async function schemaErrors(res: { body: unknown }, operationId: string, status: number): Promise<string[]> {
  const { validate } = await validatorFor(operationId, status);
  return validate(res.body) ? [] : formatErrors(validate.errors).split('\n');
}
