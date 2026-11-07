#!/usr/bin/env node
/**
 * run-plan.mjs — run plans (CONTRACTS §19): a named, saved selection of cases across types that
 * you pick and execute, locally or in CI. Run from the QA root (`.stlc/`, or `qa/` on an older project).
 *
 *   node scripts/shared/run-plan.mjs list
 *   node scripts/shared/run-plan.mjs resolve <name> [--check]
 *   node scripts/shared/run-plan.mjs run <name> [--env <env>] [--shard i/n] [--workers n] [--dry-run]
 *                                    [--last-failed] [--run-dir <dir>] [--no-writeback] [-- <playwright args>]
 *   node scripts/shared/run-plan.mjs merge <name> --run-dir <dir> [--no-writeback]
 *   node scripts/shared/run-plan.mjs standard [--release <id> --features a,b] [--dry-run]
 *   node scripts/shared/run-plan.mjs ci-info <name> [--env <env>] [--github-output]
 *   node scripts/shared/run-plan.mjs ci-gitlab <name> --out <file> [--env <env>]
 *
 * resolve   reads cases/** (header + tags), every plan's traceability (a feature's own rows AND its
 *           `re-verify:` rows) and the quarantine ledger, and rewrites the plan's `## Resolved cases`
 *           table. Exit 1 when a selected case has no script and is not @manual.
 * run       groups the resolved cases by runner — ONE `playwright test` for every Playwright tier
 *           (`--grep` of the exact Case IDs, `--project` setup + api + web-<target> per browser +
 *           desktop-electron, chosen by each case's platforms — CONTRACTS §20), k6 per
 *           performance script, the ZAP baseline per security `.conf` — and refuses security and
 *           performance on an environment PROJECT-PROFILE §Environments does not authorize.
 *           Evidence: runs/plans/<name>/<run-id>/ (summary.md, junit.xml, results.json, run.json).
 *           Then the traceability run columns of every slug the cases belong to (executing-tests
 *           Step 6 — Last run · Status · Report, nothing else). Exit 1 on any ❌ or ⛔.
 * merge     CI: folds the shards' blob reports and run.json files into one summary + junit.
 * standard  writes or refreshes the standard set: full · smoke · regression · feature-<slug> per
 *           planned feature · release-<id> (with --release/--features). Keeps a human's
 *           description / env / owner / shards / workers / browsers.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  loadWorkspace, loadRunPlan, listRunPlanNames, resolvePlan, resolvedSection, withResolvedSection,
  resolvedIdsIn, countsByType, parseRunPlan, RUN_PLAN_DIR, TYPE_ORDER, NAME_RE,
} from './lib/run-plan-model.mjs';
import { handoffCommand, platformLabel, toProjectName } from './lib/platforms.mjs';
import { runnerLabel, runnerOf, wrapperCommand } from './lib/runners.mjs';
import { repoPath, rootPrefix, workspaceRoot } from './lib/root.mjs';
import { trackRun } from './lib/runlog.mjs';
import { redact } from './lib/redact.mjs';
import { logActivity, runEvent } from './lib/activity.mjs';

trackRun(import.meta.url);

// QA_ROOT_DIR, else the working directory (npm runs from the root), else lib/root.mjs (CONTRACTS §2).
const ROOT = workspaceRoot();
/** The root's own name (`.stlc`, `qa`): the prefix of every project-relative path this writes. */
const ROOT_NAME = rootPrefix(ROOT);
const argv = process.argv.slice(2);
const dd = argv.indexOf('--');
const passthrough = dd >= 0 ? argv.slice(dd + 1) : [];
const args = dd >= 0 ? argv.slice(0, dd) : argv;
const [cmd, name] = args;
const flag = (n) => args.includes(n);
const opt = (n, d = undefined) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const today = () => new Date().toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, '0');
const runIdNow = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`; };
const die = (msg, code = 2) => { console.error(msg); process.exit(code); };
const rel = (p) => p.replace(/\\/g, '/');

function usage() {
  console.log('usage: run-plan.mjs list | resolve <name> [--check] | run <name> [--env e] [--shard i/n] [--dry-run] [--last-failed] | merge <name> --run-dir <dir> | standard [--release id --features a,b] | ci-info <name> | ci-gitlab <name> --out <file>');
  process.exit(2);
}

function needName() {
  if (!name || !NAME_RE.test(name)) die(`run-plan: a run-plan name (lowercase-kebab) is required — see \`node scripts/shared/run-plan.mjs list\``);
}

/** Load + validate + resolve one plan; exits 2 on contract errors. */
function load(ws, planName, { allowUnscripted = false } = {}) {
  const plan = loadRunPlan(ws, planName);
  if (plan.errors.length) die(`${plan.path}: invalid run plan\n  - ${plan.errors.join('\n  - ')}`);
  const res = resolvePlan(ws, plan.fm);
  if (res.errors.length && !allowUnscripted) die(`${plan.path}: cannot run\n  - ${res.errors.join('\n  - ')}`, 1);
  return { plan, res };
}

/** The env a run uses: --env, else the plan's env, else the profile default, else uat. */
function pickEnv(ws, fm) {
  const fromProfile = ws.profile ? [...ws.profile.envs].find(([, v]) => v.isDefault)?.[0] : null;
  return opt('--env') ?? fm.env ?? fromProfile ?? 'uat';
}

/** CONTRACTS §9.5: security and performance only on an env §Environments authorizes. */
function authorization(ws, env, type) {
  if (!ws.profile) return { ok: false, why: 'PROJECT-PROFILE.md not found — authorization for this env cannot be confirmed' };
  const row = ws.profile.envs.get(env);
  if (!row) return { ok: false, why: `env \`${env}\` is not listed in PROJECT-PROFILE §Environments` };
  return row[type] ? { ok: true } : { ok: false, why: `PROJECT-PROFILE §Environments does not authorize ${type} testing on \`${env}\`` };
}

/** What a run would execute: the Playwright invocation + the k6 and ZAP steps. */
function buildRunSet(ws, fm, res, env, shard) {
  const pwCases = res.selected.filter((c) => c.runners.some((r) => r.runner === 'playwright'));
  const k6 = res.selected.flatMap((c) => c.runners.filter((r) => r.runner === 'k6').map((r) => ({ id: c.id, script: r.script })));
  const zap = res.selected.flatMap((c) => c.runners.filter((r) => r.runner === 'zap').map((r) => ({ id: c.id, script: r.script })));
  // Wrapper runners (lib/runners.mjs — Maestro …): one invocation per runner × platform, with every
  // selected case on it.
  const wrapBy = new Map();
  for (const c of res.selected) for (const r of c.runners.filter((x) => x.wrapper)) {
    const key = `${r.runner}|${r.platform}`;
    (wrapBy.get(key) ?? wrapBy.set(key, { runner: r.runner, platform: r.platform, ids: [] }).get(key)).ids.push(c.id);
  }
  const wrappers = [...wrapBy.values()];
  const manual = res.selected.filter((c) => c.manual).map((c) => c.id);
  const refusals = [];
  if (res.selected.some((c) => c.type === 'security' && !c.manual)) {
    const a = authorization(ws, env, 'security');
    if (!a.ok) refusals.push(`security: ${a.why} — pick an authorized env (--env) or exclude the type`);
  }
  if (k6.length) {
    const a = authorization(ws, env, 'performance');
    if (!a.ok) refusals.push(`performance: ${a.why} — pick an authorized env (--env) or exclude the type`);
  }
  // Platforms decide the projects (CONTRACTS §20): a browser-tier case on `web` runs on every
  // web-<target>, one on windows/macos (runner playwright-electron) on desktop-electron; the HTTP
  // tiers run once on `api`. Platforms on other runners are listed as handoff, never dropped.
  const BROWSER_TYPES = ['e2e', 'accessibility', 'ui'];
  const pwPlatforms = (c) => c.runners.filter((r) => r.runner === 'playwright').flatMap((r) => r.platforms ?? []);
  const browserTier = pwCases.some((c) => BROWSER_TYPES.includes(c.type) && (pwPlatforms(c).includes('web') || pwPlatforms(c).length === 0));
  const desktopTier = pwCases.some((c) => BROWSER_TYPES.includes(c.type) && pwPlatforms(c).some((p) => p === 'windows' || p === 'macos'));
  const httpTier = pwCases.some((c) => ['api', 'integration', 'security'].includes(c.type));
  const named = (Array.isArray(fm.browsers) && fm.browsers.length ? fm.browsers : (process.env.PW_PROJECTS ?? 'chromium').split(',')).map((s) => toProjectName(String(s).trim())).filter(Boolean);
  const webProjects = named.filter((n) => n.startsWith('web-'));
  const browsers = webProjects.length ? webProjects : ['web-chromium'];
  const projects = ['setup', ...(httpTier ? ['api'] : []), ...(browserTier ? browsers : []), ...(desktopTier ? ['desktop-electron'] : [])];
  const platforms = [...new Set([...(httpTier ? ['api'] : []), ...(browserTier ? ['web'] : []), ...pwCases.flatMap(pwPlatforms)])];
  const handoff = res.selected.flatMap((c) => c.runners.filter((r) => r.runner === 'handoff').map((r) => ({ id: c.id, platform: r.platform, via: r.via, script: r.script, command: handoffCommand(r.platform, r.via) })));
  const ids = [...new Set(pwCases.map((c) => c.id))];
  // Exact Case IDs as whole words of the title: TC-API-ORDERS-001 never matches TC-API-ORDERS-0010
  // or a file path (`…/TC-API-ORDERS-001-create.spec.ts` is preceded by `/`, followed by `-`).
  const grep = ids.length ? `(?:^|\\s)(?:${ids.join('|')})(?=\\s|$)` : null;
  // Non-Playwright runners are not sharded: they run once, on shard 1 (or an unsharded run).
  const firstShard = !shard || shard.startsWith('1/');
  return { pwCases, ids, grep, projects, browsers, platforms, handoff, k6: firstShard ? k6 : [], zap: firstShard ? zap : [], wrappers: firstShard ? wrappers : [], manual, refusals };
}

function gitSha() {
  const fromCi = process.env.CI_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (fromCi) return fromCi.slice(0, 12);
  const r = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '—';
}

function playwrightCli() {
  try { return createRequire(join(ROOT, 'package.json')).resolve('@playwright/test/cli'); } catch { return null; }
}

/** Per-case outcome from a Playwright JSON report: Map(id → { status, reason }) + setupFailed. */
function outcomesFromJson(file) {
  const out = new Map();
  let setupFailed = false;
  if (!existsSync(file)) return { out, setupFailed, missing: true };
  const report = JSON.parse(readFileSync(file, 'utf8'));
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        if (t.projectName === 'setup') { if (t.status === 'unexpected') setupFailed = true; continue; }
        const id = (t.annotations ?? []).find((a) => a.type === 'case')?.description ?? /\b(TC-[A-Z0-9]+-[A-Z0-9-]+-\d{3})\b/.exec(spec.title)?.[1];
        if (!id) continue;
        const prev = out.get(id) ?? { pass: 0, fail: 0, skip: 0, why: null, byProject: {} };
        const proj = (prev.byProject[t.projectName] ??= { pass: 0, fail: 0, skip: 0 });
        if (t.status === 'expected') { prev.pass += 1; proj.pass += 1; }
        else if (t.status === 'skipped') { prev.skip += 1; proj.skip += 1; prev.why ??= (t.annotations ?? []).find((a) => a.type === 'skip')?.description ?? null; }
        else { prev.fail += 1; proj.fail += 1; } // unexpected · flaky (retries are 0, so flaky means FLAKY triage — still ❌)
        out.set(id, prev);
      }
    }
    for (const s of suite.suites ?? []) visit(s);
  };
  for (const s of report.suites ?? []) visit(s);
  return { out, setupFailed, missing: false };
}

/** Verdict per selected case — the §3 Status vocabulary. */
function verdicts(run, pw) {
  const v = new Map();
  for (const id of run.manual) v.set(id, { status: 'manual', detail: 'not run (@manual)' });
  for (const id of run.pwIds ?? []) {
    if (pw.setupFailed) { v.set(id, { status: '⛔ blocked — setup project failed (SETUP/ENV)', detail: 'setup failed' }); continue; }
    if (pw.missing) { v.set(id, { status: '⛔ blocked — no Playwright results', detail: 'no results.json' }); continue; }
    const o = pw.out.get(id);
    if (!o && run.lastFailed) continue; // --last-failed re-ran only the previous failures
    if (!o) v.set(id, { status: '⛔ blocked — no test carried this Case ID', detail: 'no result' });
    else if (o.fail) v.set(id, { status: '❌', detail: `${o.fail} failed / ${o.pass} passed` });
    // A test.skip (or a skipped step) is ⛔ with its declared reason — a case that did not fully run
    // is never ✅ (§3) — but, as in Playwright, a declared skip does not fail the run.
    else if (o.skip) v.set(id, { status: `⛔ blocked — skipped: ${o.why ?? 'no reason given'}`, detail: `${o.skip} skipped${o.pass ? `, ${o.pass} passed` : ''}`, declared: true });
    else v.set(id, { status: '✅', detail: `${o.pass} passed` });
  }
  // A case whose only platforms run elsewhere (android/ios/appium-desktop/other:*) is ⛔ awaiting
  // handoff — declared, so it does not fail the run, and never ✅ (CONTRACTS §11, §15, §20).
  for (const h of run.handoff ?? []) {
    if (v.has(h.id)) continue;
    v.set(h.id, { status: '⛔ blocked — awaiting handoff', detail: `${h.platform}: ${h.command}`, declared: true, handoff: true });
  }
  // Wrapper runners write the results contract (lib/runners.mjs): Case ID → pass/fail/skip. Per
  // case, the platforms combine worst-first — ❌ over ⛔ over ✅ — so a case is ✅ only when it passed
  // on every platform it ran on; no report at all is ⛔ SETUP/ENV, never ✅.
  const rank = (st) => (st === '❌' ? 2 : st.startsWith('⛔') ? 1 : 0);
  for (const m of run.wrappers ?? []) {
    const tag = platformLabel(m.platform);
    const who = runnerLabel(m.runner);
    for (const id of m.ids) {
      const o = m.results?.cases?.[id];
      let now;
      if (!m.results || m.results.noReport) now = { status: `⛔ blocked — ${who} wrote no report on ${tag} (SETUP/ENV)`, detail: `${tag}: exit ${m.exit}` };
      else if (!o) now = { status: `⛔ blocked — no ${who} test carried this Case ID on ${tag}`, detail: `${tag}: no result` };
      else if (o.fail) now = { status: '❌', detail: `${tag}: ${o.message ?? 'failed'}` };
      else if (o.skip) now = { status: `⛔ blocked — skipped on ${tag}`, detail: `${tag}: skipped`, declared: true };
      else now = { status: '✅', detail: `${tag}: passed` };
      const prev = v.get(id);
      if (!prev) { v.set(id, now); continue; }
      const worse = rank(now.status) > rank(prev.status) ? now : prev;
      v.set(id, { ...worse, detail: `${prev.detail}; ${now.detail}` });
    }
  }
  for (const s of [...(run.k6 ?? []), ...(run.zap ?? [])]) {
    const prev = v.get(s.id);
    const now = s.exit === 0 ? '✅' : '❌';
    if (!prev || prev.status === '✅') v.set(s.id, { status: now, detail: `${s.runner} exit ${s.exit}` });
  }
  return v;
}

/**
 * The traceability write-back of executing-tests Step 6, for each slug touched: the run columns of
 * every row naming the case (own and re-verify rows), nothing else. Returns the plan paths written.
 */
function writeBack(ws, selected, v, runId, reportPath) {
  const bySlug = new Map();
  for (const c of selected) for (const s of c.slugs) if (v.has(c.id) && v.get(c.id).status !== 'manual' && !v.get(c.id).handoff) (bySlug.get(s) ?? bySlug.set(s, []).get(s)).push(c.id);
  const written = [];
  for (const [slug, ids] of bySlug) {
    const p = ws.plans.get(slug)?.path;
    if (!p) continue;
    const full = join(ROOT, p);
    const lines = readFileSync(full, 'utf8').replace(/\r\n?/g, '\n').split('\n');
    const start = lines.findIndex((l) => l.trim() === '## Traceability (Requirement ↔ Case)');
    if (start < 0) continue;
    let changed = false;
    for (let i = start + 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (/^## /.test(t)) break;
      if (!t.startsWith('|')) continue;
      const cells = t.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.length !== 9 || !ids.includes(cells[1])) continue;
      if (cells[7].startsWith('⊘ deprecated')) continue;
      cells[6] = runId; cells[7] = v.get(cells[1]).status; cells[8] = reportPath;
      lines[i] = `| ${cells.join(' | ')} |`;
      changed = true;
    }
    if (changed) { writeFileSync(full, lines.join('\n')); written.push(p); }
  }
  return written;
}

/** The project a Playwright result came from → the platform it proves (CONTRACTS §20). */
function platformOfProject(name, c) {
  if (name === 'api') return 'api';
  if (name.startsWith('web-')) return 'web';
  if (name === 'desktop-electron') return (c.platforms ?? []).find((p) => p === 'windows' || p === 'macos') ?? 'windows';
  return null;
}

/** Per platform × type: a cell per case × platform, from the Playwright projects and the handoff list. */
function platformMatrix(selected, v, pw, handoff) {
  const cells = new Map(); // `${platform}|${type}` → { pass, fail, blocked, handoff }
  const bump = (p, t, k) => { const key = `${p}|${t}`; const c = cells.get(key) ?? { pass: 0, fail: 0, blocked: 0, handoff: 0 }; c[k] += 1; cells.set(key, c); };
  for (const c of selected) {
    if (c.manual) continue;
    const o = pw?.out?.get(c.id);
    const seen = new Set();
    for (const [proj, r] of Object.entries(o?.byProject ?? {})) {
      const p = platformOfProject(proj, c);
      if (!p) continue;
      seen.add(`${p}|${proj}`);
      bump(p, c.type, r.fail ? 'fail' : r.skip ? 'blocked' : 'pass');
    }
    for (const h of handoff.filter((x) => x.id === c.id)) bump(h.platform, c.type, 'handoff');
    if (!seen.size && !handoff.some((x) => x.id === c.id) && v.get(c.id)) {
      const s = v.get(c.id).status;
      for (const p of c.platforms ?? ['—']) bump(p, c.type, s === '✅' ? 'pass' : s === '❌' ? 'fail' : 'blocked');
    }
  }
  const platforms = [...new Set([...cells.keys()].map((k) => k.split('|')[0]))].sort();
  const types = TYPE_ORDER.filter((t) => [...cells.keys()].some((k) => k.endsWith(`|${t}`)));
  const fmt = (c) => (c ? [c.pass && `${c.pass} ✅`, c.fail && `${c.fail} ❌`, c.blocked && `${c.blocked} ⛔`, c.handoff && `${c.handoff} handoff`].filter(Boolean).join(' · ') || '—' : '—');
  return [
    `| Platform | ${types.join(' | ')} |`,
    `|---|${types.map(() => '---').join('|')}|`,
    ...platforms.map((p) => `| ${platformLabel(p)} (\`${p}\`) | ${types.map((t) => fmt(cells.get(`${p}|${t}`))).join(' | ')} |`),
  ];
}

function summaryMd(meta, selected, v, pw = null) {
  const rows = [];
  const types = TYPE_ORDER.filter((t) => selected.some((c) => c.type === t));
  for (const t of types) {
    const cs = selected.filter((c) => c.type === t);
    const n = (pred) => cs.filter((c) => pred(v.get(c.id)?.status ?? '')).length;
    rows.push(`| ${t} | ${cs.length} | ${n((s) => s === '✅')} | ${n((s) => s === '❌')} | ${n((s) => s.startsWith('⛔'))} | ${n((s) => s === 'manual')} |`);
  }
  const quarantined = selected.filter((c) => c.quarantinedUntil);
  return [
    `# Run plan ${meta.plan} — ${meta.runId}`,
    '',
    `**Run plan:** ${meta.plan} (\`${meta.planPath}\`)  **Env:** ${meta.env}  **Git SHA:** ${meta.sha}  **QA_RUN_ID:** ${meta.qaRunId}`,
    `**Started:** ${meta.started}  **Finished:** ${meta.finished}  **Shards:** ${meta.shards}  **Browsers:** ${meta.browsers}`,
    `**Slugs written back:** ${meta.slugs.length ? meta.slugs.join(', ') : '— (none)'}`,
    '',
    '## Counts by type',
    '',
    '| Type | Selected | Pass | Fail | Blocked | Manual |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
    '## Platforms × types',
    '',
    ...platformMatrix(selected, v, pw, meta.handoff ?? []),
    '',
    ...(meta.handoff?.length ? ['Staged / handed off (run by their own runner, results via /qa-ingest):', '', ...meta.handoff.map((h) => `- ${h.id} · ${platformLabel(h.platform)} — ${h.command}`), ''] : []),
    '## Cases',
    '',
    '| Case ID | Type | Platform | Feature | Status | Detail |',
    '|---|---|---|---|---|---|',
    ...selected.map((c) => `| ${c.id} | ${c.type} | ${(c.platforms ?? []).join(', ') || '—'} | ${c.feature ?? '—'} | ${v.get(c.id)?.status ?? '⛔ blocked — not run'} | ${v.get(c.id)?.detail ?? '—'} |`),
    '',
    `quarantined (excluded from gate): ${quarantined.length ? quarantined.map((c) => `${c.id} → ${c.quarantinedUntil}`).join(', ') : 'none'}`,
    '',
    '## Runners',
    '',
    ...meta.runners.map((r) => `- ${r}`),
    '',
    'Failures are triaged by executing-tests Step 4 into `failures.md` (FUNCTIONAL · SCRIPT · SETUP/ENV · FLAKY).',
    '',
  ].join('\n');
}

// ── commands ────────────────────────────────────────────────────────────────

function cmdList() {
  const ws = loadWorkspace(ROOT);
  const names = listRunPlanNames(ROOT);
  if (!names.length) { console.log('No run plans under run-plans/ — /qa-run-plan --standard writes the standard set.'); return; }
  console.log('| Run plan | Cases | By type | Env | Shards | Resolved table | Description |');
  console.log('|---|---|---|---|---|---|---|');
  let bad = 0;
  for (const n of names) {
    const plan = loadRunPlan(ws, n);
    if (plan.errors.length) { bad += 1; console.log(`| ${n} | — | INVALID: ${plan.errors[0]} | — | — | — | — |`); continue; }
    const res = resolvePlan(ws, plan.fm);
    const by = Object.entries(countsByType(res.selected)).map(([t, c]) => `${t} ${c.total}`).join(' · ') || '—';
    const ids = resolvedIdsIn(plan.text);
    const fresh = ids === null ? 'missing' : ids.join() === res.selected.map((c) => c.id).join() ? 'current' : 'STALE';
    console.log(`| ${n} | ${res.selected.length}${res.errors.length ? ` (${res.errors.length} unscripted)` : ''} | ${by} | ${plan.fm.env ?? 'default'} | ${plan.fm.shards ?? 1} | ${fresh} | ${plan.fm.description ?? ''} |`);
  }
  if (bad) process.exit(1);
}

function cmdResolve() {
  needName();
  const ws = loadWorkspace(ROOT);
  const { plan, res } = load(ws, name, { allowUnscripted: true });
  const next = withResolvedSection(plan.text, resolvedSection(res, today()));
  const stale = resolvedIdsIn(plan.text)?.join() !== res.selected.map((c) => c.id).join();
  if (flag('--check')) {
    console.log(stale ? `${plan.path}: Resolved cases table is STALE — run resolve ${name}` : `${plan.path}: Resolved cases table is current`);
    process.exit(stale || res.errors.length ? 1 : 0);
  }
  if (next !== plan.text.replace(/\r\n?/g, '\n')) writeFileSync(join(ROOT, plan.path), next);
  const by = Object.entries(countsByType(res.selected)).map(([t, c]) => `${t} ${c.total}`).join(' · ');
  console.log(`✓ ${plan.path}: ${res.selected.length} case(s)${by ? ` — ${by}` : ''}; excluded ${res.excluded.length}`);
  for (const c of res.selected) console.log(`  ${c.id}`);
  if (res.errors.length) { console.error(`✗ not runnable:\n  - ${res.errors.join('\n  - ')}`); process.exit(1); }
}

function cmdRun() {
  needName();
  const ws = loadWorkspace(ROOT);
  const { plan, res } = load(ws, name);
  const fm = plan.fm;
  const env = pickEnv(ws, fm);
  const shard = opt('--shard');
  if (shard && !/^\d+\/\d+$/.test(shard)) die('--shard takes i/n, e.g. 2/4');
  const set = buildRunSet(ws, fm, res, env, shard);
  const runId = runIdNow();
  const runDir = rel(opt('--run-dir') ?? `runs/plans/${name}/${runId}`);
  const qaRunId = process.env.QA_RUN_ID ?? `${runId}-${name}`;
  const workers = opt('--workers') ?? (fm.workers ? String(fm.workers) : null);
  const blob = process.env.PW_BLOB === '1';

  const pwArgs = set.grep ? ['test', '--grep', set.grep, '--project', ...set.projects, '--retries=0', ...(workers ? [`--workers=${workers}`] : []), ...(shard ? [`--shard=${shard}`] : [])] : null;
  if (pwArgs && flag('--last-failed')) {
    const prev = previousRunDir(name, runDir);
    if (!prev) die(`--last-failed: no earlier run of ${name} under runs/plans/${name}/`);
    pwArgs.push('--last-failed', '--last-failed-file', `${prev}/test-results/.last-run.json`);
  }
  if (pwArgs) pwArgs.push(...passthrough);

  console.log(`Run plan ${name} on ${env} — ${res.selected.length} case(s) resolved${shard ? `, shard ${shard}` : ''}`);
  for (const c of res.selected) console.log(`  ${c.id}${c.manual ? ' (manual — not run)' : ''}`);
  if (set.refusals.length) die(`✗ refused:\n  - ${set.refusals.join('\n  - ')}`);
  if (pwArgs) console.log(`playwright ${pwArgs.map((a) => (/[\s|()?:]/.test(a) ? JSON.stringify(a) : a)).join(' ')}  (PW_PLATFORMS=${set.platforms.join(',')} PW_PROJECTS=${set.browsers.join(',')})`);
  for (const h of set.handoff) console.log(`handoff: ${h.id} on ${h.platform} — ${h.command}`);
  for (const s of set.k6) console.log(`k6: bash scripts/performance/run-k6.sh ${s.script}`);
  for (const s of set.zap) console.log(`zap: bash scripts/security/zap-baseline.sh ${runDir}/security ${s.script}`);
  for (const w of set.wrappers) console.log(`${w.runner}: ${wrapperCommand(w.runner, w.platform, env, w.ids).join(' ')}`);
  console.log(`evidence: ${runDir}/`);
  if (flag('--dry-run')) return;
  if (!existsSync(join(ROOT, `.env.${env}`))) die(`✗ .env.${env} is missing — copy .env.example to .env.${env} and fill it (executing-tests Inputs 4)`);

  mkdirSync(join(ROOT, runDir), { recursive: true });
  const started = new Date().toISOString();
  const baseEnv = { ...process.env, QA_ENV: env, QA_RUN_ID: qaRunId, RUN_DIR: runDir };
  delete baseEnv.ELECTRON_RUN_AS_NODE; // VS Code's extension host leaks it; browsers die on it
  const runners = [];
  let pwExit = null;
  if (pwArgs) {
    const cli = playwrightCli();
    if (!cli) die('✗ @playwright/test is not installed in this QA root — npm install first');
    const pwProjects = [...set.browsers, ...(set.projects.includes('desktop-electron') ? ['desktop-electron'] : [])];
    const r = spawnSync(process.execPath, [cli, ...pwArgs], { cwd: ROOT, stdio: 'inherit', env: { ...baseEnv, PW_PROJECTS: pwProjects.join(','), PW_PLATFORMS: set.platforms.join(',') } });
    pwExit = r.status ?? 1;
    runners.push(`playwright (${set.ids.length} case ids, projects ${set.projects.join(' ')}${shard ? `, shard ${shard}` : ''}) → exit ${pwExit}`);
  }
  const nonfunctional = [];
  for (const [kind, list, wrapper] of [['k6', set.k6, 'scripts/performance/run-k6.sh'], ['zap', set.zap, 'scripts/security/zap-baseline.sh']]) {
    for (const s of list) {
      const dir = `${runDir}/${kind === 'k6' ? 'performance' : 'security'}/${s.id}`;
      mkdirSync(join(ROOT, dir), { recursive: true });
      const r = spawnSync('bash', kind === 'k6' ? [wrapper, s.script] : [wrapper, dir, s.script], { cwd: ROOT, stdio: 'inherit', env: { ...baseEnv, RUN_DIR: dir } });
      const exit = r.status ?? 1;
      nonfunctional.push({ id: s.id, runner: kind, script: s.script, exit });
      runners.push(`${kind} ${s.script} → exit ${exit} (${dir}/)`);
    }
  }
  const wrapperRuns = [];
  for (const w of set.wrappers) {
    const dir = `${runDir}/${runnerOf(w.runner).evidence}`;
    const [, script, ...rest] = wrapperCommand(w.runner, w.platform, env, w.ids);
    const r = spawnSync(process.execPath, [script, ...rest], { cwd: ROOT, stdio: 'inherit', env: { ...baseEnv, RUN_DIR: dir } });
    const resultsPath = join(ROOT, dir, w.platform, 'results.json');
    const results = existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, 'utf8')) : null;
    wrapperRuns.push({ runner: w.runner, platform: w.platform, ids: w.ids, exit: r.status ?? 1, results });
    runners.push(`${w.runner} ${w.platform} (${w.ids.length} case(s)) → exit ${r.status ?? 1} (${dir}/${w.platform}/)`);
  }
  const run = {
    plan: name, planPath: plan.path, env, runId, qaRunId, sha: gitSha(), shard: shard ?? null, started, finished: new Date().toISOString(),
    browsers: set.browsers, platforms: set.platforms, handoff: set.handoff, selected: res.selected.map((c) => c.id), pwIds: set.ids, manual: set.manual, lastFailed: flag('--last-failed'),
    k6: nonfunctional.filter((x) => x.runner === 'k6'), zap: nonfunctional.filter((x) => x.runner === 'zap'), wrappers: wrapperRuns, pwExit, runners,
  };
  writeFileSync(join(ROOT, runDir, 'run.json'), JSON.stringify(run, null, 2) + '\n');
  if (blob) {
    console.log(`blob report written to ${runDir}/blob — merge with: node scripts/shared/run-plan.mjs merge ${name} --run-dir <parent dir>`);
    process.exit(pwExit || nonfunctional.some((x) => x.exit) || wrapperRuns.some((x) => x.exit) ? 1 : 0);
  }
  finish(ws, res.selected, [run], runDir, run);
}

/** Summary + write-back + exit code for one finished run (local) or merged shards (CI). */
function finish(ws, selected, runs, runDir, meta) {
  const pw = outcomesFromJson(join(ROOT, runDir, 'results.json'));
  const merged = { manual: meta.manual, pwIds: meta.pwIds, lastFailed: meta.lastFailed, handoff: meta.handoff ?? [], k6: runs.flatMap((r) => r.k6 ?? []), zap: runs.flatMap((r) => r.zap ?? []), wrappers: runs.flatMap((r) => r.wrappers ?? []) };
  if (!merged.pwIds.length) pw.missing = false;
  const v = verdicts(merged, pw);
  const report = `${repoPath(ROOT, runDir)}/`;
  const slugs = flag('--no-writeback') ? [] : writeBack(ws, selected, v, meta.runId, report);
  const md = summaryMd({
    plan: meta.plan, planPath: meta.planPath, runId: meta.runId, env: meta.env, sha: meta.sha, qaRunId: meta.qaRunId,
    started: meta.started, finished: new Date().toISOString(), shards: runs.length > 1 ? runs.length : (meta.shard ?? '1'),
    browsers: meta.browsers.join(', '), slugs: slugs.map((p) => p.split('/')[1]), runners: runs.flatMap((r) => r.runners), handoff: meta.handoff ?? [],
  }, selected, v, pw);
  writeFileSync(join(ROOT, runDir, 'summary.md'), redact(md)); // a blocked reason can quote a secret (§25)
  // Exit 1 on ❌ and on a ⛔ the run did not declare (setup failed, no results, an id no test carried).
  const vals = [...v.values()];
  const fail = vals.filter((x) => x.status === '❌').length;
  const blocked = vals.filter((x) => x.status.startsWith('⛔')).length;
  const bad = fail + vals.filter((x) => x.status.startsWith('⛔') && !x.declared).length;
  const pass = vals.filter((x) => x.status === '✅').length;
  logActivity(ROOT, [runEvent({ plan: meta.plan, runId: meta.runId, pass, fail, blocked, manual: meta.manual.length, link: repoPath(ROOT, `${runDir}/summary.md`) })]);
  console.log(`\n${bad ? '✗' : '✓'} run plan ${meta.plan}: ${pass} pass · ${fail} fail · ${blocked} blocked · ${meta.manual.length} manual — ${runDir}/summary.md`);
  for (const [id, x] of v) if (x.status.startsWith('⛔')) console.log(`  ⛔ ${id} — ${x.status.replace(/^⛔ blocked — /, '')}`);
  for (const p of slugs) console.log(`✓ traceability run columns updated in ${p}`);
  process.exit(bad || runs.some((r) => r.pwExit) ? 1 : 0);
}

function previousRunDir(planName, current) {
  const dir = join(ROOT, 'runs', 'plans', planName);
  if (!existsSync(dir)) return null;
  const prior = readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory() && `runs/plans/${planName}/${d}` !== current).sort();
  return prior.length ? `runs/plans/${planName}/${prior.at(-1)}` : null;
}

function cmdMerge() {
  needName();
  const runDir = opt('--run-dir');
  if (!runDir) die('merge needs --run-dir <dir holding shard-*/>');
  const ws = loadWorkspace(ROOT);
  const { plan, res } = load(ws, name);
  const shardDirs = readdirSync(join(ROOT, runDir)).filter((d) => /^shard-\d+$/.test(d)).sort();
  const runs = shardDirs.map((d) => join(ROOT, runDir, d, 'run.json')).filter(existsSync).map((p) => JSON.parse(readFileSync(p, 'utf8')));
  if (!runs.length) die(`merge: no shard-*/run.json under ${runDir}`);
  const blobs = join(ROOT, runDir, 'blobs');
  mkdirSync(blobs, { recursive: true });
  for (const d of shardDirs) {
    const b = join(ROOT, runDir, d, 'blob');
    if (existsSync(b)) for (const f of readdirSync(b)) cpSync(join(b, f), join(blobs, f));
  }
  const cli = playwrightCli();
  if (cli && readdirSync(blobs).length) {
    const r = spawnSync(process.execPath, [cli, 'merge-reports', '--reporter', 'html,junit,json', blobs], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'],
      env: { ...process.env, PLAYWRIGHT_HTML_OUTPUT_DIR: `${runDir}/html-report`, PLAYWRIGHT_HTML_OPEN: 'never', PLAYWRIGHT_JUNIT_OUTPUT_FILE: `${runDir}/junit.xml`, PLAYWRIGHT_JSON_OUTPUT_FILE: `${runDir}/results.json` },
    });
    if (r.status !== 0) die('merge-reports failed', 1);
  }
  const first = runs[0];
  finish(ws, res.selected, runs, rel(runDir), { ...first, planPath: plan.path, shard: `${runs.length}` });
}

// ── standard set ────────────────────────────────────────────────────────────

const FUNCTIONAL = ['api', 'integration', 'e2e', 'accessibility', 'ui'];

function standardSpecs(ws) {
  const enabled = (ws.profile?.types?.length ? ws.profile.types : TYPE_ORDER).filter((t) => !['unit', 'mobile'].includes(t));
  const defaultEnv = ws.profile ? [...ws.profile.envs].find(([, v]) => v.isDefault)?.[0] ?? 'uat' : 'uat';
  const authorized = (env, t) => (t === 'security' || t === 'performance' ? !!ws.profile?.envs.get(env)?.[t] : true);
  const specs = [
    { name: 'full', description: 'Every enabled type, every non-deprecated, non-quarantined case — the whole automated suite.', select: { types: enabled }, shards: 4 },
    { name: 'smoke', description: 'Curated @smoke cases (P0 journeys + api happy paths) — every MR/PR; budget ≤ 10 min.', select: { suites: ['smoke'], types: enabled.filter((t) => FUNCTIONAL.includes(t)) }, browsers: ['chromium'], shards: 1 },
    { name: 'regression', description: 'Curated @regression cases plus every P0/P1 case — nightly, sharded.', select: { suites: ['regression'], types: enabled.filter((t) => FUNCTIONAL.includes(t)) }, include: { priorities: ['P0', 'P1'], types: enabled.filter((t) => FUNCTIONAL.includes(t)) }, shards: 4 },
  ];
  for (const slug of ws.plans.keys()) {
    specs.push({ name: `feature-${slug}`, description: `Every case of feature ${slug}, its re-verify rows included — what /qa-run ${slug} runs.`, select: { features: [slug], types: enabled }, shards: 1 });
  }
  const release = opt('--release');
  if (release) {
    if (!NAME_RE.test(release)) die(`--release ${release}: use a lowercase-kebab id (e.g. 2026-10)`);
    const features = (opt('--features') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!features.length) die('--release needs --features a,b');
    for (const f of features) if (!ws.plans.has(f)) die(`--features: ${f} has no test plan under plans/${f}/`);
    const types = enabled.filter((t) => authorized(defaultEnv, t));
    const dropped = enabled.filter((t) => !types.includes(t));
    specs.push({
      name: `release-${release}`,
      description: `Release ${release}: ${features.join(', ')} with their re-verify rows, P0–P2${dropped.length ? `; ${dropped.join(' and ')} left out — not authorized on ${defaultEnv}` : ''}.`,
      select: { features, types, priorities: ['P0', 'P1', 'P2'] }, env: defaultEnv, shards: 2,
    });
  }
  return specs;
}

const yamlList = (xs) => `[${xs.join(', ')}]`;
function frontMatter(s, keep) {
  const lines = ['---', `name: ${s.name}`, `description: ${keep.description ?? s.description}`];
  const env = keep.env ?? s.env;
  if (env) lines.push(`env: ${env}`);
  if (keep.owner) lines.push(`owner: ${keep.owner}`);
  const group = (k, g) => { if (!g) return; lines.push(`${k}:`); for (const [kk, v] of Object.entries(g)) lines.push(`  ${kk}: ${Array.isArray(v) ? yamlList(v) : v}`); };
  group('select', s.select);
  group('include', s.include);
  lines.push('exclude:', '  quarantined: true');
  const browsers = keep.browsers ?? s.browsers;
  if (browsers) lines.push(`browsers: ${yamlList(browsers)}`);
  const workers = keep.workers ?? s.workers;
  if (workers) lines.push(`workers: ${workers}`);
  lines.push(`shards: ${keep.shards ?? s.shards}`, 'retries: 0', '---', '');
  return lines.join('\n');
}

function cmdStandard() {
  const ws = loadWorkspace(ROOT);
  mkdirSync(join(ROOT, RUN_PLAN_DIR), { recursive: true });
  let unscripted = 0;
  for (const s of standardSpecs(ws)) {
    const path = join(ROOT, RUN_PLAN_DIR, `${s.name}.md`);
    let keep = {};
    let body = `\n# Run plan — ${s.name}\n\n${s.description}\n\nPart of the standard set (\`/qa-run-plan --standard\`): the selection below is regenerated; \`description\`, \`env\`, \`owner\`, \`browsers\`, \`workers\` and \`shards\` keep your edits. Run: \`/qa-run --plan ${s.name}\` · \`npm run qa:plan:run -- ${s.name}\`.\n`;
    if (existsSync(path)) {
      const old = parseRunPlan(readFileSync(path, 'utf8'));
      if (old.fm) keep = Object.fromEntries(['description', 'env', 'owner', 'browsers', 'workers', 'shards'].filter((k) => old.fm[k] !== undefined && old.fm[k] !== null).map((k) => [k, old.fm[k]]));
      body = old.body.replace(/\n## Resolved cases[\s\S]*$/, '\n');
    }
    const text = frontMatter(s, keep) + body.replace(/^\n?/, '\n');
    const parsed = parseRunPlan(text);
    const res = resolvePlan(ws, parsed.fm);
    unscripted += res.errors.length;
    const out = withResolvedSection(text, resolvedSection(res, today()));
    const by = Object.entries(countsByType(res.selected)).map(([t, c]) => `${t} ${c.total}`).join(' · ') || 'no cases yet';
    if (flag('--dry-run')) { console.log(`would write ${RUN_PLAN_DIR}/${s.name}.md — ${res.selected.length} case(s): ${by}`); continue; }
    writeFileSync(path, out);
    console.log(`✓ ${RUN_PLAN_DIR}/${s.name}.md — ${res.selected.length} case(s): ${by}${res.errors.length ? ` · ${res.errors.length} not scripted yet` : ''}`);
  }
  if (unscripted) console.log(`${unscripted} selected case(s) have no script yet — /qa-script, then resolve again; a plan with unscripted cases refuses to run.`);
}

// ── CI helpers ──────────────────────────────────────────────────────────────

function ciInfo(ws) {
  const { plan, res } = load(ws, name);
  const env = pickEnv(ws, plan.fm);
  const set = buildRunSet(ws, plan.fm, res, env, null);
  if (set.refusals.length) die(`✗ refused:\n  - ${set.refusals.join('\n  - ')}`);
  const shards = Math.max(1, plan.fm.shards ?? 1);
  return {
    plan, env, shards, browsers: set.browsers, platforms: set.platforms, needsBrowsers: set.projects.some((p) => p.startsWith('web-')),
    needsDesktop: set.projects.includes('desktop-electron'), handoff: set.handoff.length, needsK6: set.k6.length > 0, needsZap: set.zap.length > 0, cases: res.selected.length,
  };
}

function cmdCiInfo() {
  needName();
  const i = ciInfo(loadWorkspace(ROOT));
  const out = {
    shards: String(i.shards), shard_list: JSON.stringify(Array.from({ length: i.shards }, (_, k) => k + 1)), env: i.env,
    browsers: i.needsBrowsers ? i.browsers.join(' ') : '', platforms: i.platforms.join(' '), needs_desktop: String(i.needsDesktop), handoff: String(i.handoff),
    needs_k6: String(i.needsK6), needs_zap: String(i.needsZap), cases: String(i.cases),
  };
  for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
  if (flag('--github-output') && process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(out).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
}

/** A self-contained GitLab child pipeline: <shards> parallel jobs + one merge job. */
function cmdCiGitlab() {
  needName();
  const file = opt('--out');
  if (!file) die('ci-gitlab needs --out <file>');
  const i = ciInfo(loadWorkspace(ROOT));
  const image = process.env.PLAYWRIGHT_IMAGE ?? 'mcr.microsoft.com/playwright:v1.64.0-noble';
  const dir = `runs/ci/$CI_PARENT_PIPELINE_ID-plan-${name}`;
  const install = '    - if [ -f package-lock.json ]; then npm ci --prefer-offline --no-audit --no-fund; else npm install --no-audit --no-fund; fi';
  const k6 = i.needsK6 ? ['    - curl -fsSL "https://github.com/grafana/k6/releases/download/v${K6_VERSION}/k6-v${K6_VERSION}-linux-amd64.tar.gz" | tar xz -C /usr/local/bin --strip-components=1'] : [];
  const yml = [
    `# Generated by run-plan.mjs ci-gitlab ${name} — run plan ${i.plan.path}, ${i.cases} case(s), env ${i.env}.`,
    'variables:',
    `  QA_ENV: ${i.env}`,
    `  RUN_PLAN: ${name}`,
    `  PW_PROJECTS: ${i.browsers.join(',')}`,
    `  PW_PLATFORMS: ${i.platforms.join(',')}`,
    '  K6_VERSION: "0.54.0"',
    'stages: [run, report]',
    'qa:plan:shard:',
    '  stage: run',
    `  image: ${image}`,
    ...(i.shards > 1 ? [`  parallel: ${i.shards}`] : []),
    ...(i.needsZap ? ['  services: [docker:dind]'] : []),
    '  variables:',
    '    PW_BLOB: "1"',
    ...(i.needsZap ? ['    DOCKER_HOST: tcp://docker:2375'] : []),
    // GitLab does not expand ${VAR:-default} in `variables:`, and a job without `parallel` has no
    // CI_NODE_INDEX: one shard gets literal values.
    `    QA_RUN_ID: $CI_PARENT_PIPELINE_ID-plan${i.shards > 1 ? '$CI_NODE_INDEX' : '1'}`,
    `    RUN_DIR: ${dir}/shard-${i.shards > 1 ? '$CI_NODE_INDEX' : '1'}`,
    '  before_script:',
    `    - cd ${ROOT_NAME}`,
    install,
    ...k6,
    '    - node ci/write-env.mjs',
    '  script:',
    `    - node scripts/shared/run-plan.mjs run "$RUN_PLAN" --env "$QA_ENV" --run-dir "$RUN_DIR" --no-writeback ${i.shards > 1 ? '--shard "$CI_NODE_INDEX/$CI_NODE_TOTAL" ' : ''}-- --fail-on-flaky-tests`,
    '  artifacts:',
    '    when: always',
    `    paths: [${ROOT_NAME}/runs/]`,
    '    expire_in: 14 days',
    'qa:plan:report:',
    '  stage: report',
    `  image: ${image}`,
    '  when: always',
    '  variables:',
    `    RUN_DIR: ${dir}`,
    '  before_script:',
    `    - cd ${ROOT_NAME}`,
    install,
    '  script:',
    '    - node scripts/shared/run-plan.mjs merge "$RUN_PLAN" --run-dir "$RUN_DIR" --no-writeback',
    '  after_script:',
    `    - cd ${ROOT_NAME} && node scripts/shared/verdict-upload.mjs --run "$RUN_DIR" --type e2e --slug ci --env "$QA_ENV" --tag "plan-$RUN_PLAN" || true`,
    '  artifacts:',
    '    when: always',
    `    paths: [${ROOT_NAME}/runs/]`,
    '    reports:',
    `      junit: ${ROOT_NAME}/${dir}/junit.xml`,
    '    expire_in: 14 days',
    '',
  ].join('\n');
  writeFileSync(file, yml);
  console.log(`✓ ${file}: ${i.shards} shard(s), env ${i.env}, ${i.cases} case(s)`);
}

switch (cmd) {
  case 'list': cmdList(); break;
  case 'resolve': cmdResolve(); break;
  case 'run': cmdRun(); break;
  case 'merge': cmdMerge(); break;
  case 'standard': cmdStandard(); break;
  case 'ci-info': cmdCiInfo(); break;
  case 'ci-gitlab': cmdCiGitlab(); break;
  default: usage();
}
