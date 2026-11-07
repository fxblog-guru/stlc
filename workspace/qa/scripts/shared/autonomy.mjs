#!/usr/bin/env node
// autonomy.mjs — the one place an unattended QA run asks "may I?" (CONTRACTS §21).
//
//   node scripts/shared/autonomy.mjs mode
//   node scripts/shared/autonomy.mjs start  --run <run-id> --by "<the human who turned it on>"
//   node scripts/shared/autonomy.mjs check  <action> --run <run-id> [--slug <slug>] [--env <env>]
//   node scripts/shared/autonomy.mjs budget --run <run-id> [--tokens <n>]
//   node scripts/shared/autonomy.mjs report --run <run-id>
//   node scripts/shared/autonomy.mjs resolve --run <run-id> --by "<the human who reviewed its stops>"
//
// The mode is QA_AUTONOMY, else PROJECT-PROFILE `Autonomy`, else `off`:
//   off       today's behaviour: every blocking question and every outward step goes to a human.
//   assisted  a `non-blocking` clarification is taken on its recommended answer; a blocking one is asked.
//   full      design → generate → run → report without asking, on the recommended answers.
//
// Hard stops hold in every mode. `check` exits 3 for each and records it (runs/<run-id>/stops.jsonl
// and an activity event, docs/activity-format.md), so the report and the addons show it:
//   outward    push-main · merge-main · file-defect (an outside tracker) · publish-results · delete-data
//   security   security-scan or perf-load against an env whose §Environments row does not say `yes`,
//              suppress-finding, quarantine-test (hides a failure from the suite)
//   sign-off   release-signoff                     (provisional, exit 4: the run goes on, merge waits)
//   budget     tokens or minutes over QA_BUDGET_TOKENS / QA_BUDGET_MINUTES
// Exit 0 allowed · 3 stop · 4 provisional · 2 usage.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { profileText, rootFromArgv, workspaceRoot } from './lib/root.mjs';

export const MODES = ['off', 'assisted', 'full'];
export const HARD = {
  'push-main': 'outward', 'merge-main': 'outward', 'file-defect': 'outward', 'publish-results': 'outward', 'delete-data': 'outward',
  'suppress-finding': 'security', 'quarantine-test': 'security',
  'release-signoff': 'sign-off',
};
/** Allowed only on an env whose §Environments column says `yes`. */
export const ENV_GATED = { 'security-scan': 'Security testing authorized', 'perf-load': 'Performance testing authorized' };
const RUN_ID = /^\d{8}-\d{6}-[0-9a-f]{4}$/;

export function mode(profile, env = process.env) {
  const line = /^- \*\*Autonomy:\*\*\s*`([a-z]+)`/m.exec(profile ?? '')?.[1];
  const raw = String(env.QA_AUTONOMY || line || 'off').toLowerCase();
  return MODES.includes(raw) ? raw : 'off';
}

/** Whether §Environments marks `env` authorised for `column` (`yes`, case-insensitive). */
export function envAuthorized(profile, envName, column) {
  const lines = String(profile ?? '').replace(/\r\n?/g, '\n').split('\n');
  const head = lines.findIndex((l) => l.startsWith('| Env |') && l.includes(column));
  if (head === -1 || !envName) return false;
  const cols = lines[head].split('|').map((c) => c.trim());
  const at = cols.indexOf(column);
  for (const l of lines.slice(head + 2)) {
    if (!l.startsWith('|')) break;
    const cells = l.split('|').map((c) => c.trim().replace(/`/g, ''));
    // `uat` (default): the env is the first word of its cell.
    if (cells[1].split(/\s+/)[0] === envName) return /^yes\b/i.test(cells[at] ?? '');
  }
  return false;
}

const runDir = (root, run) => join(root, 'runs', run);
/** The JSON lines of a file; a line torn by a crash is skipped, never fatal. */
const readLines = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/** One activity event in the shared format; never throws, never creates the root. */
function event(root, e, env = process.env) {
  if (env.ACTIVITY_LOG === 'off' || !existsSync(root)) return;
  try {
    mkdirSync(join(root, 'logs'), { recursive: true });
    appendFileSync(join(root, 'logs', 'activity.jsonl'), `${JSON.stringify({ v: 1, at: now(), source: 'stlc', link: null, run_id: null, needs: null, ...e })}\n`);
  } catch { /* the stop still stands; only its echo is lost */ }
}

function stop(root, run, slug, action, cls, outcome) {
  mkdirSync(runDir(root, run), { recursive: true });
  appendFileSync(join(runDir(root, run), 'stops.jsonl'), `${JSON.stringify({ at: now(), action, class: cls, slug, outcome })}\n`);
  event(root, { kind: 'stop', slug, outcome: 'stopped', title: `Stopped before ${action} (${cls}${outcome === 'provisional' ? ', provisional' : ''})`, run_id: run, link: reportLink(root, run), needs: cls === 'sign-off' ? 'sign-off' : 'review-stop' });
}

/** The run report, project-relative: the link every stop of the run carries, and what clears them. */
const reportLink = (root, run) => relative(resolve(root, '..'), join(runDir(root, run), 'report.md')).split(sep).join('/');

/**
 * `resolve`: a human has reviewed the run's stops (and signed what needed signing). Writes one
 * `pass` event per (slug, link) of its stops, which clears them from Needs you in every addon.
 */
export function resolveRun(root, run, by) {
  const f = join(runDir(root, run), 'stops.jsonl');
  const slugs = [...new Set((existsSync(f) ? readLines(f) : []).map((s) => s.slug ?? null))];
  for (const slug of slugs) event(root, { kind: 'stop', slug, outcome: 'pass', title: `Stops of run ${run} reviewed by ${by}`.slice(0, 120), run_id: run, link: reportLink(root, run) });
  return slugs.length;
}

export function budgetState(root, run, env = process.env, at = Date.now()) {
  const file = join(runDir(root, run), 'budget.json');
  const b = readJson(file, null) ?? { started: at, tokens: 0 };
  const maxT = Number(env.QA_BUDGET_TOKENS) || null;
  const maxM = Number(env.QA_BUDGET_MINUTES) || null;
  const minutes = (at - b.started) / 60000;
  const over = maxT && b.tokens > maxT ? `tokens ${b.tokens} > ${maxT}` : maxM && minutes > maxM ? `minutes ${Math.round(minutes)} > ${maxM}` : null;
  return { file, b, over, minutes };
}

const provisional = (root, run) => {
  const f = join(runDir(root, run), 'stops.jsonl');
  return existsSync(f) ? readLines(f).filter((s) => s.outcome === 'provisional') : [];
};

export function check(root, run, action, { slug = null, envName = null, profile = '', env = process.env } = {}) {
  const budget = budgetState(root, run, env);
  if (budget.over) { stop(root, run, slug, action, 'budget', 'stopped'); return { code: 3, why: `budget exceeded: ${budget.over}` }; }
  if (ENV_GATED[action]) {
    if (envAuthorized(profile, envName, ENV_GATED[action])) return { code: 0, why: `${envName} is authorised for it` };
    stop(root, run, slug, action, 'security', 'stopped');
    return { code: 3, why: `${envName ?? 'no env'} is not authorised (§Environments ${ENV_GATED[action]})` };
  }
  const cls = HARD[action];
  if (!cls) return { code: 0, why: 'not a hard stop' };
  if (cls === 'sign-off') { stop(root, run, slug, action, cls, 'provisional'); return { code: 4, why: 'a named human signs this; merge waits' }; }
  if (action === 'merge-main' && provisional(root, run).length) { stop(root, run, slug, action, cls, 'stopped'); return { code: 3, why: 'outward, and a sign-off is still provisional' }; }
  stop(root, run, slug, action, cls, 'stopped');
  return { code: 3, why: `${cls}: only a human does this` };
}

export function report(root, run) {
  const started = readJson(join(runDir(root, run), 'run.json'), {});
  const f = join(runDir(root, run), 'stops.jsonl');
  const stops = existsSync(f) ? readLines(f) : [];
  const out = [`# Autonomous QA run ${run}`, '', `Started by ${started.by ?? 'nobody recorded'}, mode \`${started.mode ?? 'unknown'}\`.`, '',
    'Results: see the run report under `reports/` this run wrote.', '', '## Stops', '', '| At | Action | Class | Outcome |', '|---|---|---|---|'];
  for (const s of stops) out.push(`| ${s.at} | ${s.action} | ${s.class} | ${s.outcome} |`);
  if (!stops.length) out.push('| — | — | — | none |');
  out.push('', 'Clarifications answered on their recommendation are marked `assumed` in the sheet and wait for a human.', '');
  mkdirSync(runDir(root, run), { recursive: true });
  writeFileSync(join(runDir(root, run), 'report.md'), out.join('\n'));
  return { stops: stops.length };
}

function main(argv) {
  const [verb, ...rest] = argv;
  const arg = (f) => (rest.indexOf(f) !== -1 ? rest[rest.indexOf(f) + 1] : undefined);
  // Inside the QA root (CI cds into .stlc) the root is the working directory, not a .stlc below it.
  const root = argv.includes('--root') ? rootFromArgv(argv) : workspaceRoot();
  const profile = profileText(resolve(root, '..'));
  if (verb === 'mode') { console.log(mode(profile)); return 0; }
  const run = arg('--run');
  if (!run || !RUN_ID.test(run)) { console.error('autonomy: --run <YYYYMMDD-HHMMSS-xxxx> is required'); return 2; }
  if (verb === 'start') {
    const by = arg('--by');
    if (!by || /^(agent|claude|ai|bot|user|admin)$/i.test(by.trim())) { console.error('autonomy start: --by names the human who turned autonomy on'); return 2; }
    mkdirSync(runDir(root, run), { recursive: true });
    writeFileSync(join(runDir(root, run), 'run.json'), JSON.stringify({ run, by, mode: mode(profile), started: now() }));
    writeFileSync(join(runDir(root, run), 'budget.json'), JSON.stringify({ started: Date.now(), tokens: 0 }));
    console.log(`run ${run} started by ${by}, mode ${mode(profile)}`);
    return 0;
  }
  if (verb === 'check') {
    const action = rest[0];
    if (!action || action.startsWith('--')) { console.error('autonomy check: name an action'); return 2; }
    const r = check(root, run, action, { slug: arg('--slug') ?? null, envName: arg('--env') ?? null, profile });
    console.log(`${r.code === 0 ? 'allowed' : r.code === 4 ? 'provisional' : 'STOP'}: ${action} — ${r.why}`);
    return r.code;
  }
  if (verb === 'budget') {
    const s = budgetState(root, run);
    s.b.tokens += Number(arg('--tokens') ?? 0) || 0;
    mkdirSync(runDir(root, run), { recursive: true });
    writeFileSync(s.file, JSON.stringify(s.b));
    const again = budgetState(root, run);
    console.log(again.over ? `over budget: ${again.over}` : `within budget: ${again.b.tokens} tokens`);
    return again.over ? 3 : 0;
  }
  if (verb === 'resolve') {
    const by = arg('--by');
    if (!by || /^(agent|claude|ai|bot|user|admin)$/i.test(by.trim())) { console.error('autonomy resolve: --by names the human who reviewed the stops'); return 2; }
    console.log(`resolved the stops of ${resolveRun(root, run, by)} slug(s)`);
    return 0;
  }
  if (verb === 'report') { const r = report(root, run); console.log(`report: ${r.stops} stop(s)`); return 0; }
  console.error('usage: autonomy.mjs mode | start | check <action> | budget | report — with --run <run-id>');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
