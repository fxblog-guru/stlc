#!/usr/bin/env node
/**
 * triage.mjs — a failed run, pre-triaged: where each failure happened, which failures share one cause,
 * a suggested class with its reason, and whether it is new or known (/qa-triage, executing-tests Step 4).
 * Read-only over the evidence; it never edits a test, a case or a defect.
 *
 *   npm run qa:triage -- <run dir> [--json] [--root <qa root>]
 *
 * Reads <run dir>/results.json (Playwright JSON reporter), else junit.xml, and for every failure:
 *   where      spec file:line and the failing test.step, the error's first line, Expected/Received
 *   evidence   the attachment paths (trace, screenshot, video, http-log, network, server-log)
 *   group      failures with one cause are one group: a 5xx on the same endpoint, the same environment
 *              error, else the same error shape at the same place. Triage one case per group.
 *   hint       a suggested CONTRACTS §5 token with the rule that fired and a strength:
 *                strong  the evidence decides it (setup failed, host unreachable, the server answered 5xx,
 *                        the server logged errors, a pass on the re-run, a TypeError in the spec)
 *                weak    a lean the agent must confirm on the trace (a locator timeout, a value mismatch)
 *              A hint is never the classification: failures.md carries the token the agent decided.
 *   history    the same case in the earlier runs beside this one: new (passed last run), failing since
 *              <run>, or no history; and the defects that name the case (OPEN → known, CLOSED → re-open?)
 *   ids        the request id and trace id of the call that broke (the http-log's 5xx, else 4xx, else
 *              the last call), and any trace_id the server-log lines carry — what to search the
 *              server's logs and traces for. QA_TRACE_URL (`{trace_id}`) makes the trace a link.
 *
 * Writes <run dir>/triage.md (largest group first) or --json to stdout. Exit 0; 2 when there is no input.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { ANY_CASE_ID, junitOutcomes } from './lib/junit.mjs';
import { errorShape } from './learnings.mjs';
import { trackRun } from './lib/runlog.mjs';
import { logActivity, runContext, triageEvents } from './lib/activity.mjs';
import { repoPath, workspaceRoot } from './lib/root.mjs';
import { redact } from './lib/redact.mjs';

const FAILED = new Set(['unexpected', 'flaky']);
const strip = (s) => String(s ?? '').replace(/\u001b\[[0-9;]*m/g, '');
const firstLine = (s) => strip(s).split('\n').map((l) => l.trim()).find(Boolean) ?? '';
const lineOf = (s, label) => (new RegExp(`^\\s*${label}:\\s*(.+)$`, 'm').exec(strip(s)) ?? [])[1]?.trim() ?? null;
const posix = (p) => p.replace(/\\/g, '/');

/** /orders/8812/items?x=1 → /orders/‹id›/items — so one endpoint is one group whatever the ids. */
export const endpointShape = (url) => {
  let path = String(url);
  try { path = new URL(url).pathname; } catch { path = path.split('?')[0]; }
  return path.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/‹id›').replace(/\/\d+(?=\/|$)/g, '/‹id›');
};

// ---- read -----------------------------------------------------------------------------------------------

function decodeAttachment(a) {
  if (a.path && existsSync(a.path)) { try { return readFileSync(a.path, 'utf8'); } catch { return null; } }
  if (a.body) { try { return Buffer.from(a.body, 'base64').toString('utf8'); } catch { return null; } }
  return null;
}

/** The deepest test.step that carries an error — the step the case was on when it failed. */
function failingStep(steps = []) {
  for (const s of steps) {
    if (!s.error) continue;
    return failingStep(s.steps) ?? s.title;
  }
  return null;
}

/** Playwright JSON → failures [{ id, title, project, file, line, step, error, attempts, passedOnRetry, attachments, http, network, serverLog }]. */
export function failuresFromJson(report) {
  const out = [];
  let notRun = 0;
  const walk = (suite, file) => {
    for (const s of suite.suites ?? []) walk(s, s.file ?? file);
    for (const spec of suite.specs ?? []) {
      const id = (ANY_CASE_ID.exec(spec.title) ?? [])[1] ?? null;
      for (const t of spec.tests ?? []) {
        const results = t.results ?? [];
        if (t.status === 'skipped') { if (results.some((r) => r.status === 'skipped' && !(t.annotations ?? []).some((a) => a.type === 'skip'))) notRun += 1; continue; }
        if (!FAILED.has(t.status)) continue;
        const bad = results.find((r) => r.status !== 'passed' && r.status !== 'skipped') ?? results[0] ?? {};
        const err = bad.error ?? bad.errors?.[0] ?? {};
        const message = strip(err.message ?? '');
        const loc = err.location ?? (bad.errors ?? []).find((e) => e.location)?.location ?? null;
        const attachments = (bad.attachments ?? []).map((a) => ({ name: a.name, path: a.path ?? null, text: ['http-log', 'network', 'server-log'].includes(a.name) ? decodeAttachment(a) : null }));
        const json = (name) => { const a = attachments.find((x) => x.name === name); if (!a?.text) return []; try { return JSON.parse(a.text); } catch { return []; } };
        out.push({
          id,
          title: spec.title,
          project: t.projectName ?? '',
          file: posix(loc?.file ?? spec.file ?? file ?? ''),
          line: loc?.line ?? spec.line ?? null,
          step: failingStep(bad.steps),
          error: message,
          attempts: results.length,
          passedOnRetry: t.status === 'flaky' || results.some((r) => r.status === 'passed'),
          attachments: attachments.map(({ name, path }) => ({ name, path })),
          http: json('http-log'),
          network: json('network'),
          serverLog: attachments.find((a) => a.name === 'server-log')?.text ?? null,
          annotations: (t.annotations ?? []).concat(spec.annotations ?? []),
        });
      }
    }
  };
  for (const s of report.suites ?? []) walk(s, s.file);
  return { failures: out, notRun };
}

/** JUnit carries no location, steps or attachments — the groups and hints are coarser. */
export function failuresFromJunit(xml) {
  const failures = [];
  for (const [id, o] of junitOutcomes(xml).out) {
    if (!o.fail) continue;
    failures.push({ id, title: id, project: '', file: '', line: null, step: null, error: o.message ?? '', attempts: o.fail + o.pass, passedOnRetry: o.pass > 0, attachments: [], http: [], network: [], serverLog: null, annotations: [] });
  }
  return { failures, notRun: 0 };
}

export function readRun(runDir) {
  const json = join(runDir, 'results.json');
  const junit = join(runDir, 'junit.xml');
  if (existsSync(json)) return { source: 'results.json', ...failuresFromJson(JSON.parse(readFileSync(json, 'utf8'))) };
  if (existsSync(junit)) return { source: 'junit.xml', ...failuresFromJunit(readFileSync(junit, 'utf8')) };
  return null;
}

// ---- hint -----------------------------------------------------------------------------------------------

const UNREACHABLE = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|socket hang up|getaddrinfo|net::ERR_(CONNECTION|NAME_NOT_RESOLVED|ADDRESS_UNREACHABLE|INTERNET_DISCONNECTED|CERT)|self[- ]signed certificate|unable to verify the first certificate|browserType\.launch|Executable doesn't exist/i;
const CONFIG = /no actor "|TEST_USER|\.env\.|storageState|ENOENT[^\n]*\.auth|is not set|requireApiBaseURL|missing (env|environment)/i;
const SPEC_BUG = /^(TypeError|ReferenceError|SyntaxError)\b|Cannot find module|is not a function|Cannot read propert(y|ies) of (undefined|null)/m;
const LOCATOR = /waiting for (locator|getBy)|locator\.\w+: Timeout|strict mode violation|resolved to \d+ elements|toBeVisible|toHaveCount|element\(s\) not found/i;
const VALUE = /\bExpected\b[\s\S]*\bReceived\b/;
const SERVER_LOG = /the server logged errors during this test/;
const PAGE_ERRORS = /the page raised errors the case does not expect/;

/** The suggested class: { token, strength, why, key } — `key` is what makes failures one group. */
export function hint(f) {
  const shape = errorShape(firstLine(f.error));
  const at = f.file ? `${basename(f.file)}:${f.line ?? '?'}` : '';
  const http5 = f.http.find((x) => x.status >= 500);
  const net5 = f.network.find((x) => (x.status ?? 0) >= 500);
  const netFail = f.network.find((x) => x.status === null);
  if (f.project === 'setup' || /(^|\/)scripts\/setup\//.test(f.file))
    return { token: 'SETUP/ENV', strength: 'strong', why: 'the setup project failed — every test that depends on it did not run', key: `setup · ${shape}` };
  if (UNREACHABLE.test(f.error))
    return { token: 'SETUP/ENV', strength: 'strong', why: `the environment is unreachable or the browser is missing (${(UNREACHABLE.exec(f.error) ?? [])[0]})`, key: `env · ${(UNREACHABLE.exec(f.error) ?? [])[0].toLowerCase()}` };
  if (CONFIG.test(f.error))
    return { token: 'SETUP/ENV', strength: 'strong', why: 'configuration or test account missing', key: `config · ${shape}` };
  if (f.passedOnRetry)
    return { token: 'FLAKY', strength: 'strong', why: `passed on an identical re-run (${f.attempts} attempts) — choose the flake-kind from the trace`, key: `flaky · ${shape} · ${at}` };
  if (SERVER_LOG.test(f.error) || f.serverLog)
    return { token: 'FUNCTIONAL', strength: 'strong', why: 'the server logged errors during the test (server-log attached)', key: `server-log · ${errorShape(firstLine(f.serverLog ?? f.error))}` };
  if (http5)
    return { token: 'FUNCTIONAL', strength: 'strong', why: `the server answered ${http5.status} to ${http5.method} ${endpointShape(http5.url)} (http-log)`, key: `5xx · ${http5.method} ${endpointShape(http5.url)} → ${http5.status}` };
  if (net5)
    return { token: 'FUNCTIONAL', strength: 'strong', why: `the page received ${net5.status} from ${net5.method} ${endpointShape(net5.url)} (network)`, key: `5xx · ${net5.method} ${endpointShape(net5.url)} → ${net5.status}` };
  if (PAGE_ERRORS.test(f.error))
    return { token: 'FUNCTIONAL', strength: 'strong', why: 'the page threw an uncaught error or logged console.error', key: `page-errors · ${at}` };
  if (SPEC_BUG.test(f.error))
    return { token: 'SCRIPT', strength: 'strong', why: 'the spec itself threw — a code error in the test, not an assertion', key: `spec · ${shape} · ${at}` };
  if (netFail)
    return { token: 'SETUP/ENV', strength: 'weak', why: `a request the page made failed (${netFail.failure} on ${endpointShape(netFail.url)}) — a service down, or a blocked third party`, key: `net-fail · ${endpointShape(netFail.url)}` };
  if (LOCATOR.test(f.error))
    return { token: 'SCRIPT', strength: 'weak', why: 'element not found or ambiguous, no server error seen — screenshot shows the right page → SCRIPT (/qa-heal); the page is wrong → FUNCTIONAL', key: `locator · ${shape} · ${at}` };
  if (VALUE.test(f.error)) {
    const received = lineOf(f.error, 'Received');
    return { token: 'FUNCTIONAL', strength: 'weak', why: 'the product returned a different value — confirm the Expected is the case\'s, not an assumption', key: `value · ${shape} · ${received ?? ''} · ${at}` };
  }
  if (/Test timeout of \d+ms exceeded/.test(f.error))
    return { token: null, strength: 'weak', why: 'the whole test timed out — read the trace for the step it hung on', key: `timeout · ${f.step ?? at}` };
  return { token: null, strength: 'weak', why: 'no rule matched — read the error and the trace', key: `other · ${shape} · ${at}` };
}

// ---- history --------------------------------------------------------------------------------------------

/** Per earlier run beside this one (oldest → newest): Map(caseId → 'pass' | 'fail'). */
export function priorRuns(runDir) {
  const parent = dirname(resolve(runDir));
  const me = basename(resolve(runDir));
  if (!existsSync(parent)) return [];
  return readdirSync(parent)
    .filter((n) => n < me && statSync(join(parent, n)).isDirectory())
    .sort()
    .map((n) => {
      const dir = join(parent, n);
      const seen = new Map();
      const json = join(dir, 'results.json');
      const junit = join(dir, 'junit.xml');
      if (existsSync(json)) {
        const walk = (s) => {
          for (const x of s.suites ?? []) walk(x);
          for (const spec of s.specs ?? []) {
            const id = (ANY_CASE_ID.exec(spec.title) ?? [])[1];
            if (!id) continue;
            for (const t of spec.tests ?? []) if (t.status !== 'skipped') seen.set(id, seen.get(id) === 'fail' || t.status !== 'expected' ? 'fail' : 'pass');
          }
        };
        try { for (const s of JSON.parse(readFileSync(json, 'utf8')).suites ?? []) walk(s); } catch { /* an unreadable run is no history */ }
      } else if (existsSync(junit)) {
        for (const [id, o] of junitOutcomes(readFileSync(junit, 'utf8')).out) if (o.pass + o.fail) seen.set(id, o.fail ? 'fail' : 'pass');
      }
      return { run: n, seen };
    })
    .filter((r) => r.seen.size);
}

export function historyOf(caseId, runs) {
  if (!caseId) return 'no case id';
  const mine = runs.filter((r) => r.seen.has(caseId));
  if (!mine.length) return 'no history';
  const last = mine[mine.length - 1];
  if (last.seen.get(caseId) === 'pass') return `new — passed in ${last.run}`;
  let since = last.run;
  for (let i = mine.length - 1; i >= 0 && mine[i].seen.get(caseId) === 'fail'; i--) since = mine[i].run;
  return `failing since ${since}`;
}

/** defects/**\/DEF-*.md → Map(caseId → [{ id, status }]). */
export function defectsByCase(root) {
  const out = new Map();
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/^DEF-.*\.md$/.test(n)) continue;
      const text = readFileSync(p, 'utf8');
      const id = (/^# (DEF-[A-Za-z0-9-]+?-\d{3})\b/m.exec(text) ?? [])[1];
      const status = (/\*\*Status:\*\*\s*(OPEN|CLOSED)/.exec(text) ?? [])[1];
      const cases = ((/\*\*Case:\*\*\s*([^*\n]+)/.exec(text) ?? [])[1] ?? '').match(/TC-[A-Z0-9-]+?-\d{3}/g) ?? [];
      for (const c of cases) out.set(c, [...(out.get(c) ?? []), { id, status, path: posix(relative(root, p)) }]);
    }
  };
  walk(join(root, 'defects'));
  return out;
}

// ---- ids ------------------------------------------------------------------------------------------------

const TRACE_IN_LOG = /"?trace_?id"?\s*[:=]\s*"?([0-9a-f]{32})\b/gi;

/**
 * The server-side ids of a failure: { requestId, traceId, logTraces }. The call that broke is the
 * http-log's last 5xx, else its last 4xx, else its last call; a browser test has no http-log.
 */
export function idsOf(f) {
  const http = f.http ?? [];
  const pick = [...http].reverse().find((x) => x.status >= 500) ?? [...http].reverse().find((x) => x.status >= 400) ?? http.at(-1);
  const logTraces = [...new Set([...String(f.serverLog ?? '').matchAll(TRACE_IN_LOG)].map((m) => m[1].toLowerCase()))];
  return { requestId: pick?.ids?.requestId ?? null, traceId: pick?.ids?.traceId ?? logTraces[0] ?? null, logTraces };
}

/** `trace <id>`, linked when QA_TRACE_URL names where traces open. */
export function traceRef(id, url = process.env.QA_TRACE_URL) {
  return url ? `[${id}](${url.replaceAll('{trace_id}', id)})` : `\`${id}\``;
}

// ---- triage ---------------------------------------------------------------------------------------------

export function triage(runDir, { root = '.' } = {}) {
  const run = readRun(runDir);
  if (!run) return null;
  const runs = priorRuns(runDir);
  const defects = defectsByCase(root);
  // Playwright writes absolute paths; a relative one is under the QA root. Either way, print it from the root.
  const rel = (p) => (p ? posix(relative(resolve(root), resolve(root, p))) : p);
  const rows = run.failures.map((f) => {
    const h = hint(f);
    const known = (f.id && defects.get(f.id)) || [];
    return {
      case: f.id ?? f.title,
      project: f.project,
      where: f.file ? `${posix(relative(root, resolve(root, f.file)))}:${f.line ?? '?'}` : '—',
      step: f.step,
      error: firstLine(f.error),
      expected: lineOf(f.error, 'Expected'),
      received: lineOf(f.error, 'Received'),
      hint: h,
      history: historyOf(f.id, runs),
      defects: known.map((d) => `${d.id} ${d.status}`),
      ids: idsOf(f),
      evidence: f.attachments.filter((a) => a.path || ['http-log', 'network', 'server-log'].includes(a.name)).map((a) => `${a.name}${a.path ? `: ${rel(a.path)}` : ' (inline)'}`),
    };
  });
  const groups = new Map();
  for (const r of rows) groups.set(r.hint.key, [...(groups.get(r.hint.key) ?? []), r]);
  const ordered = [...groups.values()]
    .map((members) => ({ key: members[0].hint.key, hint: members[0].hint, members, representative: members[0] }))
    .sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));
  return { runDir: posix(runDir), source: run.source, failed: rows.length, notRun: run.notRun, priorRuns: runs.length, groups: ordered };
}

export function toMarkdown(t) {
  const cell = (s) => String(s ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const tok = (h) => (h.token ? `${h.token} (${h.strength})` : 'unclassified');
  const fresh = t.groups.flatMap((g) => g.members).filter((m) => m.history.startsWith('new')).length;
  const known = t.groups.flatMap((g) => g.members).filter((m) => m.defects.some((d) => d.endsWith('OPEN'))).length;
  const out = [
    `# Triage — ${t.runDir}`,
    '',
    `${t.failed} failed · ${t.groups.length} group(s) · ${fresh} new since the last run · ${known} on an OPEN defect` +
      (t.notRun ? ` · ${t.notRun} not run (a dependency failed)` : '') + ` · source ${t.source} · ${t.priorRuns} earlier run(s) compared`,
    '',
    'Hints are suggestions, never the classification: confirm one case per group on its trace, then write',
    'the CONTRACTS §5 token in failures.md. A strong hint is decided by the evidence; a weak one is a lean.',
    '',
  ];
  if (!t.groups.length) return [...out, 'No failures.', ''].join('\n');
  out.push('| # | Cases | Hint | Cause |', '|---|---|---|---|');
  t.groups.forEach((g, i) => out.push(`| G${i + 1} | ${g.members.length} | ${tok(g.hint)} | ${cell(g.hint.why)} |`));
  t.groups.forEach((g, i) => {
    const r = g.representative;
    out.push('', `## G${i + 1} · ${tok(g.hint)} · ${g.members.length} case(s)`, '');
    out.push(`- **Why:** ${g.hint.why}`);
    out.push(`- **Representative:** ${r.case}${r.project ? ` [${r.project}]` : ''} at \`${r.where}\`${r.step ? ` — step "${r.step}"` : ''}`);
    out.push(`- **Error:** ${r.error || '—'}`);
    if (r.expected || r.received) out.push(`- **Expected / Received:** ${r.expected ?? '—'} / ${r.received ?? '—'}`);
    if (r.evidence.length) out.push(`- **Evidence:** ${r.evidence.join(' · ')}`);
    const ids = [r.ids.requestId && `request \`${r.ids.requestId}\``, r.ids.traceId && `trace ${traceRef(r.ids.traceId)}`].filter(Boolean);
    if (ids.length) out.push(`- **Server side:** ${ids.join(' · ')} — search the service's logs and traces for these`);
    const traced = g.members.some((m) => m.ids.requestId || m.ids.traceId);
    out.push('', `| Case | Where | History | Defects |${traced ? ' Ids |' : ''}`, `|---|---|---|---|${traced ? '---|' : ''}`);
    const idCell = (m) => [m.ids.requestId, m.ids.traceId && `trace ${m.ids.traceId}`].filter(Boolean).join(' · ') || '—';
    for (const m of g.members) out.push(`| ${cell(m.case)} | ${cell(m.where)} | ${cell(m.history)} | ${cell(m.defects.join(', ') || '—')} |${traced ? ` ${cell(idCell(m))} |` : ''}`);
  });
  out.push('');
  return out.join('\n');
}

function main(argv) {
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const runDir = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--root');
  if (!runDir) { console.error('usage: npm run qa:triage -- <run dir> [--json] [--root <qa root>]'); return 2; }
  const t = triage(runDir, { root: opt('--root') ?? '.' });
  if (!t) { console.error(`qa:triage — no results.json or junit.xml in ${runDir}`); return 2; }
  if (argv.includes('--json')) { process.stdout.write(redact(JSON.stringify(t, null, 2)) + '\n'); return 0; }
  // A failure message quotes what the test saw, secrets included: mask before it is written (§25).
  const md = redact(toMarkdown(t));
  writeFileSync(join(runDir, 'triage.md'), md);
  const root = opt('--root') ?? workspaceRoot();
  const ctx = runContext(root, runDir);
  logActivity(root, triageEvents(t, { slug: ctx.slug, runId: ctx.runId, link: ctx.rel && repoPath(root, `${ctx.rel}/triage.md`) }));
  console.log(md);
  console.log(`✓ Wrote ${posix(join(runDir, 'triage.md'))}`);
  return 0;
}

const isMain = process.argv[1] && /(^|\/)triage\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) trackRun(import.meta.url);
if (isMain) process.exit(main(process.argv.slice(2)));
