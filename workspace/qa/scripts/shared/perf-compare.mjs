#!/usr/bin/env node
/**
 * perf-compare.mjs — what a performance run means beyond "the thresholds held" (/qa-run, /qa-report).
 * Read-only over the evidence, except the baseline it promotes on --update.
 *
 *   npm run qa:perf -- <run dir> [--case <TC-PERF-…>] [--contract <openapi.yaml>]
 *                      [--baseline <file>] [--update] [--json]
 *                      [--p95-pct 10] [--error-pp 0.5] [--rps-pct 10]
 *
 * Reads the run's `result.json` (the shared perf-result/v1 schema every template writes,
 * generating-perf-script/references/perf-result.schema.json), else a k6 `summary.json`
 * (handleSummary) or a Locust `*_stats.csv`, and checks two things the thresholds cannot:
 *   budget       each endpoint's p95 against the dev contract's `x-perf.p95_ms` for the operation the
 *                request is tagged with (`name` = operationId). The dev bundle wrote the budget at G4;
 *                a script whose thresholds drifted from it still gets caught here.
 *   regression   the run against the case's committed baseline: p95 up more than --p95-pct, the
 *                error rate up more than --error-pp points, or throughput down more than --rps-pct.
 *                A build 40 % slower than the last one can still be under every threshold.
 * Each degraded endpoint is listed, and the verdict says whether the slowdown is systemic (most
 * endpoints) or localized (a few) — the first question of a performance RCA.
 *
 * Baseline: <qa-root>/baselines/performance/<Case ID>.json, committed. Promote a run only after the
 * report that cites it is signed off (--update); no baseline yet → "no baseline", never a pass.
 * Verdict: FAIL on a budget breach or a regression; NOT EVALUABLE when neither check could run (no
 * contract and no baseline), because a run nobody compared is not a pass; else PASS, naming what
 * was not checked. Writes <run dir>/perf-verdict.md (or --json to stdout). Exit 0 on PASS, 1 on
 * FAIL or NOT EVALUABLE, 2 on a usage or evidence error.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { trackRun } from './lib/runlog.mjs';
import { workspaceRoot } from './lib/root.mjs';
import { redact } from './lib/redact.mjs';

export const DEFAULT_LIMITS = { p95Pct: 10, errorPp: 0.5, rpsPct: 10 };
const TOTAL = '(total)';
// More than half the measured endpoints degraded = the whole system, not one code path.
const SYSTEMIC_SHARE = 0.5;

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** k6's handleSummary JSON → { total, endpoints: { name: { p95_ms, error_rate, rps, count } } }. */
export function fromK6(summary) {
  const m = summary?.metrics ?? {};
  const v = (k) => m[k]?.values ?? {};
  const total = {
    p95_ms: num(v('http_req_duration')['p(95)']),
    error_rate: num(v('http_req_failed').rate),
    rps: num(v('http_reqs').rate),
    count: num(v('http_reqs').count),
  };
  const endpoints = {};
  // Per-endpoint numbers exist only as submetrics, which k6 emits for the tags a threshold names.
  for (const [key, metric] of Object.entries(m)) {
    const hit = /^(http_req_duration|http_req_failed|http_reqs)\{name:([^}]+)\}$/.exec(key);
    if (!hit) continue;
    const e = (endpoints[hit[2]] ??= {});
    if (hit[1] === 'http_req_duration') e.p95_ms = num(metric.values?.['p(95)']);
    if (hit[1] === 'http_req_failed') e.error_rate = num(metric.values?.rate);
    if (hit[1] === 'http_reqs') { e.rps = num(metric.values?.rate); e.count = num(metric.values?.count); }
  }
  return { tool: 'k6', total, endpoints };
}

/** Locust's `<prefix>_stats.csv` → the same shape. The `Aggregated` row is the total. */
export function fromLocustCsv(text) {
  const rows = String(text).replace(/\r\n?/g, '\n').trim().split('\n').map(splitCsv);
  const head = rows.shift() ?? [];
  const col = (name) => head.indexOf(name);
  const [iName, iCount, iFail, iRps, iP95] = ['Name', 'Request Count', 'Failure Count', 'Requests/s', '95%'].map(col);
  if ([iName, iCount, iFail, iRps, iP95].includes(-1)) throw new Error('not a Locust stats CSV (missing Name, Request Count, Failure Count, Requests/s or 95%)');
  const endpoints = {};
  let total = null;
  for (const r of rows) {
    const count = num(r[iCount]) ?? 0;
    const e = { p95_ms: num(r[iP95]), error_rate: count ? (num(r[iFail]) ?? 0) / count : 0, rps: num(r[iRps]), count };
    if (r[iName] === 'Aggregated') total = e; else endpoints[r[iName]] = e;
  }
  if (!total) throw new Error('Locust stats CSV has no Aggregated row');
  return { tool: 'locust', total, endpoints };
}

function splitCsv(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** perf-result/v1 (any template) → the same shape; its numbers already cover the steady window. */
export function fromResult(doc) {
  if (doc?.schema !== 'perf-result/v1') throw new Error(`result.json is not perf-result/v1 (schema: ${doc?.schema ?? 'none'})`);
  const pick = (s) => ({ p95_ms: num(s?.p95_ms), error_rate: num(s?.error_rate), rps: num(s?.rps), count: num(s?.requests) });
  return {
    tool: doc.run?.tool ?? 'other',
    total: pick(doc.total),
    endpoints: Object.fromEntries(Object.entries(doc.endpoints ?? {}).map(([k, v]) => [k, pick(v)])),
  };
}

/** The run's measurements, from whichever tool wrote the run dir. The shared schema wins. */
export function readRun(runDir) {
  const shared = join(runDir, 'result.json');
  if (existsSync(shared)) return fromResult(JSON.parse(readFileSync(shared, 'utf8')));
  const k6 = join(runDir, 'summary.json');
  if (existsSync(k6)) return fromK6(JSON.parse(readFileSync(k6, 'utf8')));
  const csv = existsSync(runDir) ? readdirSync(runDir).find((f) => f.endsWith('_stats.csv')) : null;
  if (csv) return fromLocustCsv(readFileSync(join(runDir, csv), 'utf8'));
  return null;
}

/** operationId → p95_ms from an OpenAPI document's `x-perf` budgets. */
export function budgetsFrom(doc) {
  const out = {};
  for (const item of Object.values(doc?.paths ?? {})) {
    for (const op of Object.values(item ?? {})) {
      const p95 = num(op?.['x-perf']?.p95_ms);
      if (op?.operationId && p95 != null) out[op.operationId] = p95;
    }
  }
  return out;
}

/** Each measured endpoint against its budget. An endpoint the contract does not name is listed, not judged. */
export function checkBudgets(run, budgets) {
  return Object.entries(run.endpoints).map(([name, e]) => {
    const budget = budgets[name];
    if (budget == null) return { name, p95_ms: e.p95_ms, budget: null, verdict: 'no budget' };
    if (e.p95_ms == null) return { name, p95_ms: null, budget, verdict: 'not measured' };
    return { name, p95_ms: e.p95_ms, budget, verdict: e.p95_ms <= budget ? 'within' : 'over' };
  });
}

/** One row per metric: total and each endpoint both runs measured. */
export function compareRuns(cur, base, limits = DEFAULT_LIMITS) {
  const rows = [];
  const one = (name, c, b) => {
    if (!c || !b) return;
    const out = { name, regressed: [] };
    if (c.p95_ms != null && b.p95_ms != null) {
      out.p95 = { base: b.p95_ms, cur: c.p95_ms, pct: 100 * (c.p95_ms - b.p95_ms) / Math.max(b.p95_ms, 1) };
      if (out.p95.pct > limits.p95Pct) out.regressed.push('p95');
    }
    if (c.error_rate != null && b.error_rate != null) {
      out.errors = { base: b.error_rate, cur: c.error_rate, pp: 100 * (c.error_rate - b.error_rate) };
      if (out.errors.pp > limits.errorPp) out.regressed.push('errors');
    }
    // Throughput is judged on the total only: one endpoint's share moves with the journey mix.
    if (name === TOTAL && c.rps != null && b.rps != null) {
      out.rps = { base: b.rps, cur: c.rps, pct: 100 * (c.rps - b.rps) / Math.max(b.rps, 0.001) };
      if (out.rps.pct < -limits.rpsPct) out.regressed.push('throughput');
    }
    rows.push(out);
  };
  one(TOTAL, cur.total, base.total);
  for (const [name, c] of Object.entries(cur.endpoints)) one(name, c, base.endpoints?.[name]);
  return rows;
}

/** systemic | localized | none, from the endpoint rows (the total row is not an endpoint). */
export function spread(rows) {
  const eps = rows.filter((r) => r.name !== TOTAL);
  const bad = eps.filter((r) => r.regressed.length);
  if (!bad.length) return rows.some((r) => r.regressed.length) ? 'systemic' : 'none';
  return eps.length && bad.length / eps.length > SYSTEMIC_SHARE ? 'systemic' : 'localized';
}

export function verdictOf({ budgets, comparison }) {
  const over = (budgets ?? []).filter((b) => b.verdict === 'over');
  const regressed = (comparison ?? []).filter((r) => r.regressed.length);
  const judged = (budgets ?? []).some((b) => b.verdict === 'within' || b.verdict === 'over');
  const unchecked = [
    ...(budgets ? [] : ['budget (no contract)']),
    ...(budgets && !judged ? ['budget (no endpoint matched an x-perf operation)'] : []),
    ...(budgets ?? []).filter((b) => b.verdict === 'no budget' || b.verdict === 'not measured').map((b) => `${b.name} (${b.verdict})`),
    ...(comparison ? [] : ['baseline (none yet)']),
  ];
  const state = over.length || regressed.length ? 'fail' : !judged && !comparison ? 'not evaluable' : 'pass';
  return { state, ok: state === 'pass', over: over.length, regressed: regressed.length, spread: comparison ? spread(comparison) : null, unchecked };
}

const ms = (v) => (v == null ? '—' : `${Math.round(v)} ms`);
const pct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)} %`);
const rate = (v) => (v == null ? '—' : `${(v * 100).toFixed(2)} %`);

export function toMarkdown({ runDir, caseId, run, budgets, comparison, baselinePath, limits, verdict }) {
  const lines = [`# Performance verdict — ${caseId ?? basename(runDir)}`, ''];
  lines.push(`Tool: ${run.tool} · requests ${run.total.count ?? '—'} · p95 ${ms(run.total.p95_ms)} · errors ${rate(run.total.error_rate)} · ${run.total.rps == null ? '—' : run.total.rps.toFixed(1)} req/s`, '');
  lines.push('## Budget (dev contract `x-perf`)', '');
  if (!budgets) lines.push('Not checked: no contract given (`--contract`).');
  else if (!budgets.length) lines.push('Not checked: the run has no per-endpoint numbers. Tag every request with its operationId (`name`) and give each a threshold.');
  else {
    lines.push('| Endpoint | p95 | Budget | Verdict |', '|---|---|---|---|');
    for (const b of budgets) lines.push(`| ${b.name} | ${ms(b.p95_ms)} | ${ms(b.budget)} | ${b.verdict} |`);
  }
  lines.push('', '## Against the baseline', '');
  if (!comparison) lines.push(`No baseline at \`${baselinePath}\`. This run is not compared; promote a signed-off run with \`--update\`.`);
  else {
    lines.push(`Limits: p95 +${limits.p95Pct} % · errors +${limits.errorPp} pp · throughput −${limits.rpsPct} %.`, '');
    lines.push('| Endpoint | p95 base → now | Δ p95 | Errors base → now | Δ errors | Δ throughput | Regressed |', '|---|---|---|---|---|---|---|');
    for (const r of comparison) {
      lines.push(`| ${r.name} | ${ms(r.p95?.base)} → ${ms(r.p95?.cur)} | ${pct(r.p95?.pct)} | ${rate(r.errors?.base)} → ${rate(r.errors?.cur)} | ${r.errors ? `${r.errors.pp > 0 ? '+' : ''}${r.errors.pp.toFixed(2)} pp` : '—'} | ${pct(r.rps?.pct)} | ${r.regressed.join(', ') || '—'} |`);
    }
  }
  lines.push('', '## Verdict', '');
  if (verdict.state === 'fail') lines.push(`FAIL — ${verdict.over} endpoint(s) over budget · ${verdict.regressed} regressed row(s)${verdict.spread && verdict.spread !== 'none' ? ` · ${verdict.spread}` : ''}. Locate before filing: executing-tests/references/perf-triage.md.`);
  else if (verdict.state === 'not evaluable') lines.push('NOT EVALUABLE — nothing to compare this run with: give the dev contract (`--contract`) or promote a baseline (`--update`). Thresholds alone are not this verdict.');
  else lines.push('PASS — every judged endpoint within its budget, no regression against the baseline.');
  if (verdict.unchecked.length) lines.push('', `Not checked: ${verdict.unchecked.join(' · ')}.`);
  lines.push('');
  return lines.join('\n');
}

function loadContract(path) {
  const text = readFileSync(path, 'utf8');
  if (path.endsWith('.json')) return JSON.parse(text);
  return createRequire(join(workspaceRoot(), 'package.json'))('yaml').parse(text);
}

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}

const VALUE_FLAGS = new Set(['--case', '--contract', '--baseline', '--p95-pct', '--error-pp', '--rps-pct']);

function main(argv) {
  const runDir = argv.find((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(argv[i - 1]));
  if (!runDir) { console.error('usage: npm run qa:perf -- <run dir> [--case <TC-PERF-…>] [--contract <openapi.yaml>] [--baseline <file>] [--update] [--json]'); return 2; }
  const run = readRun(runDir);
  if (!run) { console.error(`qa:perf — no result.json, summary.json (k6) or *_stats.csv (Locust) in ${runDir}`); return 2; }
  const caseId = flag(argv, '--case');
  const limits = {
    p95Pct: num(flag(argv, '--p95-pct')) ?? DEFAULT_LIMITS.p95Pct,
    errorPp: num(flag(argv, '--error-pp')) ?? DEFAULT_LIMITS.errorPp,
    rpsPct: num(flag(argv, '--rps-pct')) ?? DEFAULT_LIMITS.rpsPct,
  };
  const baselinePath = flag(argv, '--baseline') ?? (caseId ? join(workspaceRoot(), 'baselines', 'performance', `${caseId}.json`) : null);

  if (argv.includes('--update')) {
    if (!baselinePath) { console.error('qa:perf --update needs --case or --baseline'); return 2; }
    mkdirSync(dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, JSON.stringify({ run: runDir.replace(/\\/g, '/'), ...run }, null, 2) + '\n');
    console.log(`✓ Baseline promoted: ${baselinePath.replace(/\\/g, '/')}`);
    return 0;
  }

  const contractPath = flag(argv, '--contract');
  if (contractPath && !existsSync(contractPath)) { console.error(`qa:perf — no contract at ${contractPath}`); return 2; }
  const budgets = contractPath ? checkBudgets(run, budgetsFrom(loadContract(contractPath))) : null;
  const base = baselinePath && existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;
  const comparison = base ? compareRuns(run, base, limits) : null;
  const verdict = verdictOf({ budgets, comparison });
  const result = { runDir, caseId, run, budgets, comparison, baselinePath: baselinePath?.replace(/\\/g, '/') ?? '—', limits, verdict };

  if (argv.includes('--json')) process.stdout.write(redact(JSON.stringify(result, null, 2)) + '\n');
  else {
    const md = redact(toMarkdown(result));
    writeFileSync(join(runDir, 'perf-verdict.md'), md);
    console.log(md);
    console.log(`✓ Wrote ${join(runDir, 'perf-verdict.md').replace(/\\/g, '/')}`);
  }
  return verdict.ok ? 0 : 1;
}

const isMain = process.argv[1] && /(^|\/)perf-compare\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) trackRun(import.meta.url);
if (isMain) process.exit(main(process.argv.slice(2)));
