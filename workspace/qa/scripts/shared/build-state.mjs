#!/usr/bin/env node
/**
 * build-state.mjs — derive <qa-root>/state.json from the QA artifacts (CONTRACTS §17).
 *
 * Pure derivation: it reads what the pipeline wrote and never judges it. Every rule it applies is
 * one CONTRACTS already states (where a slug lives, which plan is current, what a traceability
 * Status means); anything it cannot read is reported as null, never guessed.
 *
 * Usage (from the project root, or with --root):
 *   node <qa-root>/scripts/shared/build-state.mjs [--root <qa-root>] [--check] [--quiet]
 *   node <qa-root>/scripts/shared/build-state.mjs --hash <path> [<path>...]
 *
 * The root is lib/root.mjs's (CONTRACTS §2): --root, QA_ROOT, PROJECT-PROFILE `QA root`, then
 * `.stlc/` or `qa/`, whichever exists. QA_LINT_TODAY=YYYY-MM-DD fixes "today" (quarantine expiry),
 * the same switch the linter uses, so fixtures derive the same state on any day.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { hashArtifact, readDoc } from './lib/doc.mjs';
import { locateRef, rootFromArgv } from './lib/root.mjs';
import { TYPES } from './lib/types.mjs';

export const GENERATOR_VERSION = '2.5.0';
export const SCHEMA = 1;

/** The pipeline stages a slug moves through — the same ladder `/qa-status` prints. */
export const PHASES = ['Analyze', 'Plan', 'Design', 'Script', 'Run', 'Report', 'Signed-off'];
export { TYPES };

const TRACE_COLUMNS = '| Req | Case ID | Type | Module | Priority | Scripted | Last run | Status | Report |';
const GATE_COLUMNS = '| Gate | Target | Actual | Verdict | Evidence |';
const CONDITION_COLUMNS = '| # | Condition | Owner | Due | Evidence |';
const QUARANTINE_COLUMNS = '| Case ID | Since | Until | Reason | Evidence | Ticket | Released |';

// Folders under these parents that are NOT slugs (CONTRACTS §2): release sign-offs, portfolio
// metrics and retrospectives live beside the per-slug report folders; env checks beside the
// per-type run folders. `cases/` and `scripts/` are never read for slugs at all — their folders
// are MODULES (`cases/<type>/[<surface>/]<module>/`), and a module is not a feature.
const NOT_A_SLUG = { reports: new Set(['release', 'metrics', 'retro', 'coverage']), reviews: new Set(['_pr']) };
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const RUN_ID_RE = /^\d{4}-\d{2}-\d{2}-\d{4}$/;
const DATED = (suffix) => new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${suffix}\\.md$`);

// ---------------------------------------------------------------------------------------------
// Small readers
// ---------------------------------------------------------------------------------------------

const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const dirs = (p) => (isDir(p) ? readdirSync(p).filter((n) => isDir(join(p, n))) : []);
const files = (p, re) => (isDir(p) ? readdirSync(p).filter((n) => re.test(n) && !isDir(join(p, n))).sort() : []);
const latest = (p, re) => files(p, re).at(-1) ?? null;
const cell = (s) => String(s ?? '').replace(/[`*]/g, '').trim();
const dash = (s) => (s === '' || s === '—' || s === '-' ? null : s);

/** Rows of the table whose header line is byte-exact `columns`, as arrays of trimmed cells. */
function tableRows(text, columns) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((l) => l.trim() === columns);
  if (start === -1) return [];
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    const t = line.trim();
    if (!t.startsWith('|')) break;
    const cells = t.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    rows.push(cells);
  }
  return rows;
}

const listOf = (v) => (Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)]);

// ---------------------------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------------------------

export function buildState(qaRoot, now = new Date()) {
  const root = resolve(qaRoot);
  const today = /^\d{4}-\d{2}-\d{2}$/.test(process.env.QA_LINT_TODAY ?? '')
    ? process.env.QA_LINT_TODAY
    : now.toISOString().slice(0, 10);
  const ctx = { root, prefix: basename(root), hashed: new Map(), today };

  const profile = readProfile(root);
  const slugs = listSlugs(root).map((slug) => buildSlug(ctx, slug));
  attachQuarantine(ctx, slugs);
  attachSignoffs(ctx, slugs);
  for (const s of slugs) s.phase = derivePhase(s);

  const state = {
    schema: SCHEMA,
    generator_version: GENERATOR_VERSION,
    generated_at: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    source_hash: '',
    project: profile.name ?? basename(resolve(root, '..')),
    types_enabled: profile.types,
    environments: readEnvironments(ctx),
    slugs: slugs.map(({ _cases, _runIds, _hasRuns, ...rest }) => rest),
  };
  state.source_hash = createHash('sha256')
    .update([...ctx.hashed.values()].sort().join('\n'), 'utf8')
    .digest('hex');
  return state;
}

function track(ctx, full) {
  if (ctx.hashed.has(full)) return rel(ctx, full);
  ctx.hashed.set(full, `${rel(ctx, full)}:${hashArtifact(full)}`);
  return rel(ctx, full);
}

function rel(ctx, full) {
  return `${ctx.prefix}/${relative(ctx.root, full).replace(/\\/g, '/')}`;
}

/**
 * PROJECT-PROFILE.md: the installer puts it in `.claude/`; the bundle repo keeps it at its root.
 * `types` is null when no profile is found — the board then says "unknown", it does not invent a set.
 */
function readProfile(root) {
  const candidates = [
    join(root, '..', '.claude', 'PROJECT-PROFILE.md'),
    join(root, '..', 'PROJECT-PROFILE.md'),
    join(root, 'PROJECT-PROFILE.md'),
  ];
  const path = candidates.find((p) => existsSync(p));
  if (!path) return { name: null, types: null };
  const text = readFileSync(path, 'utf8');
  const name = /\*\*Name:\*\*\s*`?([^`\n\r]+)`?/.exec(text)?.[1]?.trim() ?? null;
  const section = text.split(/^## /m).find((s) => s.startsWith('Test types')) ?? '';
  const types = [];
  for (const line of section.split('\n')) {
    const m = /^\|\s*`?([a-z0-9]+)`?\s*\|\s*(yes|no)\s*\|/i.exec(line.trim());
    if (m && TYPES.includes(m[1].toLowerCase()) && m[2].toLowerCase() === 'yes') types.push(m[1].toLowerCase());
  }
  return { name: name && !name.startsWith('<') ? name : null, types: TYPES.filter((t) => types.includes(t)) };
}

/** Slugs are the folder names CONTRACTS §2 keys by slug — never module folders, never templates. */
function listSlugs(root) {
  const found = new Set();
  for (const parent of ['analysis', 'plans', 'reports', 'defects', 'reviews', 'exploratory']) {
    for (const d of dirs(join(root, parent))) {
      if (SLUG_RE.test(d) && !NOT_A_SLUG[parent]?.has(d)) found.add(d);
    }
  }
  for (const type of TYPES) for (const d of dirs(join(root, 'runs', type))) if (SLUG_RE.test(d)) found.add(d);
  return [...found].sort();
}

function buildSlug(ctx, slug) {
  const plan = readPlan(ctx, slug);
  const report = readReport(ctx, slug, plan);
  const analysis = latest(join(ctx.root, 'analysis', slug), DATED('analysis'));
  const runDirs = TYPES.some((t) => dirs(join(ctx.root, 'runs', t, slug)).length > 0);
  return {
    slug,
    title: plan?.title ?? slug,
    phase: null,
    analysis: analysis ? track(ctx, join(ctx.root, 'analysis', slug, analysis)) : null,
    plan: plan?.path ?? null,
    report,
    review: readReview(ctx, slug),
    defects: readDefects(ctx, slug),
    quarantine: { active: 0, expired: 0, nearest_expiry: null, items: [] },
    signoff: null,
    traceability: plan?.traceability ?? null,
    types: plan?.types ?? {},
    _cases: plan?.cases ?? new Set(),
    _runIds: plan?.runIds ?? [],
    _hasRuns: runDirs,
  };
}

/** The same ladder as `/qa-status`, top rung first. */
function derivePhase(s) {
  if (s.signoff && (s.signoff.recommendation === 'GO' || s.signoff.recommendation === 'CONDITIONAL GO')) return 'Signed-off';
  if (s.report) return 'Report';
  const t = s.traceability;
  if (s._hasRuns || (t && t.total_cases - t.not_run > 0)) return 'Run';
  if (t && t.scripted > 0) return 'Script';
  if (t && t.total_cases > 0) return 'Design';
  if (s.plan) return 'Plan';
  return 'Analyze';
}

/** The current plan is the newest `YYYY-MM-DD-test-plan.md` — strategy and estimate files share the folder. */
function readPlan(ctx, slug) {
  const dir = join(ctx.root, 'plans', slug);
  const name = latest(dir, DATED('test-plan'));
  if (!name) return null;
  const full = join(dir, name);
  const path = track(ctx, full);
  const text = readFileSync(full, 'utf8');
  const title = /^#\s+Test Plan\s+—\s+([^—\n]+?)\s+—/m.exec(text)?.[1]?.trim() ?? null;

  const t = { total_cases: 0, scripted: 0, last_run_pass: 0, last_run_fail: 0, blocked: 0, not_run: 0 };
  const types = {};
  const cases = new Set();
  const runIds = [];
  for (const c of tableRows(text, TRACE_COLUMNS)) {
    if (c.length < 9) continue;
    const [, caseId, type, , , scripted, lastRun, status] = c.map(cell);
    cases.add(caseId);
    const k = (types[type] ??= { cases: 0, scripted: 0, pass: 0, fail: 0, blocked: 0 });
    t.total_cases += 1;
    k.cases += 1;
    if (scripted.includes('✅')) (t.scripted += 1), (k.scripted += 1);
    if (RUN_ID_RE.test(lastRun)) runIds.push(lastRun);
    if (status.startsWith('✅')) (t.last_run_pass += 1), (k.pass += 1);
    else if (status.startsWith('❌')) (t.last_run_fail += 1), (k.fail += 1);
    else if (status.startsWith('⛔')) (t.blocked += 1), (k.blocked += 1);
    else t.not_run += 1;
  }
  return { path, title, traceability: t, types, cases, runIds: runIds.sort() };
}

/**
 * The newest report (§16). `stale` is true when the traceability table records a run newer than
 * every run the report cites — the report no longer describes the latest evidence. It is null when
 * the report cites no runs, because then there is nothing to compare.
 */
function readReport(ctx, slug, plan) {
  const dir = join(ctx.root, 'reports', slug);
  const name = latest(dir, DATED('report'));
  if (!name) return null;
  const full = join(dir, name);
  const path = track(ctx, full);
  const doc = readDoc(full);
  const fm = doc.frontMatter ?? {};
  const runs = listOf(fm.runs).filter((r) => RUN_ID_RE.test(r)).sort();
  const newest = runs.at(-1) ?? null;
  const newer = newest ? (plan?.runIds ?? []).filter((r) => r > newest) : [];
  return {
    date: fm.date != null ? String(fm.date) : null,
    path,
    overall: fm.overall != null ? String(fm.overall) : null,
    shipped_sha: fm.shipped_sha != null ? String(fm.shipped_sha) : null,
    runs,
    gates: tableRows(doc.body, GATE_COLUMNS)
      .filter((c) => c.length >= 4)
      .map((c) => ({ gate: cell(c[0]), target: cell(c[1]), actual: cell(c[2]), verdict: cell(c[3]) })),
    stale: newest ? newer.length > 0 : null,
    newer_runs: [...new Set(newer)],
  };
}

/**
 * The newest case review and its verdict, verbatim from `**Verdict:**`. `stale` stays null until
 * reviews record the hashes of what they judged (docs/roadmap.md, gate logs) — not false, because
 * "not stale" is a claim this file cannot make yet.
 */
/**
 * A verdict is STALE when a file it recorded a hash for has changed or gone (CONTRACTS §18).
 * With no recorded hashes the staleness is unknown — null, never false: a bundle that cannot tell
 * says so rather than claiming the verdict still holds.
 *
 * @returns {{ stale: boolean | null, changed: string[] }}
 */
function checkHashes(ctx, entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length === 0) return { stale: null, changed: [] };
  const changed = [];
  for (const e of list) {
    const p = String(e?.path ?? '');
    const want = String(e?.sha256 ?? '');
    if (!p || !/^[0-9a-f]{64}$/.test(want)) return { stale: null, changed: [] };
    // Entries are written relative to the project root (`qa/…`, `.stlc/…`, `.claude/…`). Either
    // root prefix names the QA root, so a verdict recorded before a migration still resolves (§2).
    const full = locateRef(ctx.root, p);
    if (!existsSync(full) || hashArtifact(full) !== want) changed.push(p);
  }
  return { stale: changed.length > 0, changed };
}

function readReview(ctx, slug) {
  const dir = join(ctx.root, 'reviews', slug);
  const name = latest(dir, DATED('case-review'));
  if (!name) return null;
  const full = join(dir, name);
  const doc = readDoc(full);
  const fm = doc.frontMatter ?? {};
  const body = /\*\*Verdict:\*\*\s*(READY FOR \/qa-script|REVISE FIRST)/.exec(doc.body)?.[1] ?? null;
  const front = fm.verdict != null ? String(fm.verdict) : null;
  const { stale, changed } = checkHashes(ctx, fm.reviewed);
  return {
    date: fm.date != null ? String(fm.date) : name.slice(0, 10),
    // Front matter and body must agree (§18); when they do not, neither is the verdict.
    verdict: front && body && front !== body ? null : front ?? body,
    path: track(ctx, full),
    reviewed: Array.isArray(fm.reviewed) ? fm.reviewed.length : 0,
    stale,
    changed,
  };
}

function readDefects(ctx, slug) {
  const dir = join(ctx.root, 'defects', slug);
  const by_severity = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  const items = [];
  for (const name of files(dir, /^DEF-[a-z0-9-]+-\d{3}-.+\.md$/)) {
    const full = join(dir, name);
    const text = readFileSync(full, 'utf8');
    const head = /^#\s+(DEF-[a-z0-9-]+-\d{3})\s+—\s+(.*)$/m.exec(text);
    if (!head) continue;
    const status = /\*\*Status:\*\*\s*(OPEN|CLOSED)\b/.exec(text)?.[1] ?? null;
    const path = track(ctx, full);
    if (status !== 'OPEN') continue;
    const severity = /\*\*Severity:\*\*\s*(Critical|High|Medium|Low)\b/.exec(text)?.[1] ?? null;
    if (severity) by_severity[severity] += 1;
    const origin = /\*\*Origin:\*\*\s*(INTERNAL|ESCAPED|EXPLORATORY)\b/.exec(text)?.[1] ?? null;
    items.push({ id: head[1], severity, origin, title: head[2].trim(), path });
  }
  return { total_open: items.length, by_severity, items };
}

/** Unreleased ledger rows (§12), attached to the slug whose traceability table holds the case. */
function attachQuarantine(ctx, slugs) {
  const full = join(ctx.root, 'regression', 'quarantine.md');
  if (!existsSync(full)) return;
  track(ctx, full);
  for (const c of tableRows(readFileSync(full, 'utf8'), QUARANTINE_COLUMNS)) {
    if (c.length < 7) continue;
    const [caseId, since, until, reason, , ticket, released] = c.map(cell);
    if (dash(released)) continue;
    const item = { case_id: caseId, since, until, reason, ticket: dash(ticket), expired: until < ctx.today };
    for (const s of slugs) {
      if (!s._cases.has(caseId)) continue;
      const q = s.quarantine;
      q.items.push(item);
      q.active += 1;
      if (item.expired) q.expired += 1;
      if (!q.nearest_expiry || until < q.nearest_expiry) q.nearest_expiry = until;
    }
  }
}

/** The newest sign-off (§16) whose `features` names the slug. */
function attachSignoffs(ctx, slugs) {
  const releaseDir = join(ctx.root, 'reports', 'release');
  for (const release of dirs(releaseDir)) {
    if (release.startsWith('_')) continue;
    for (const name of files(join(releaseDir, release), DATED('signoff'))) {
      const full = join(releaseDir, release, name);
      const doc = readDoc(full);
      const fm = doc.frontMatter ?? {};
      const features = listOf(fm.features);
      const signoff = {
        release: fm.release != null ? String(fm.release) : release,
        date: fm.date != null ? String(fm.date) : name.slice(0, 10),
        recommendation: fm.recommendation != null ? String(fm.recommendation) : null,
        path: track(ctx, full),
        conditions: tableRows(doc.body, CONDITION_COLUMNS)
          .filter((c) => c.length >= 2 && dash(cell(c[1])))
          .map((c) => cell(c[1])),
      };
      for (const s of slugs) {
        if (!features.includes(s.slug)) continue;
        if (!s.signoff || `${signoff.date}${name}` > `${s.signoff.date}${basename(s.signoff.path)}`) s.signoff = signoff;
      }
    }
  }
}

/**
 * Env checks belong to an environment, not to a feature: the newest readiness report per env,
 * with its "Runnable verdict per enabled type" lines (`e2e: READY`, `performance: BLOCKED — …`).
 */
function readEnvironments(ctx) {
  const base = join(ctx.root, 'runs', 'env-checks');
  const out = [];
  for (const env of dirs(base)) {
    const runId = dirs(join(base, env)).filter((r) => RUN_ID_RE.test(r) && existsSync(join(base, env, r, 'readiness.md'))).sort().at(-1);
    if (!runId) continue;
    const full = join(base, env, runId, 'readiness.md');
    const doc = readDoc(full);
    const fm = doc.frontMatter ?? {};
    const verdicts = {};
    // Front matter wins (CONTRACTS §18); the body's "e2e: READY" lines are the fallback for a
    // report written before §18, and for anything the front matter leaves out.
    const front = fm.verdicts && typeof fm.verdicts === 'object' ? fm.verdicts : {};
    for (const t of TYPES) if (front[t] != null) verdicts[t] = String(front[t]);
    const re = new RegExp(`\\b(${TYPES.join('|')})\`?\\s*:\\s*(READY|NOT READY|BLOCKED)\\b`, 'g');
    for (const m of doc.body.matchAll(re)) verdicts[m[1]] ??= m[2];
    const { stale, changed } = checkHashes(ctx, fm.inputs);
    out.push({ env, run_id: runId, path: track(ctx, full), verdicts, stale, changed });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function runCli() {
  const args = process.argv.slice(2);

  if (args.includes('--hash')) {
    for (const p of args.slice(args.indexOf('--hash') + 1).filter((a) => !a.startsWith('--'))) {
      if (existsSync(p)) console.log(`${hashArtifact(p)}  ${p}`);
      else {
        console.error(`File not found: ${p}`);
        process.exitCode = 1;
      }
    }
    return;
  }

  const root = rootFromArgv(args);
  const quiet = args.includes('--quiet');

  // No QA root here (another QA root, a subfolder, a project without the bundle): nothing to
  // derive. Hooks call this every turn, so it must be silent, not an error.
  if (!isDir(root)) {
    if (!quiet) console.log(`build-state: no QA root at ${root} — nothing to derive.`);
    return;
  }

  const statePath = join(root, 'state.json');
  const state = buildState(root);

  if (args.includes('--check')) {
    if (!existsSync(statePath)) {
      console.error(`build-state --check: ${statePath} does not exist.`);
      process.exit(1);
    }
    const strip = (s) => JSON.stringify({ ...s, generated_at: null });
    if (strip(state) !== strip(JSON.parse(readFileSync(statePath, 'utf8')))) {
      console.error(`build-state --check: ${statePath} is out of date with current artifacts.`);
      process.exit(1);
    }
    if (!quiet) console.log(`build-state --check: ${statePath} matches.`);
    return;
  }

  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  if (!quiet) console.log(`build-state: ${state.slugs.length} slug(s) → ${statePath} (hash ${state.source_hash.slice(0, 8)})`);
}

const direct = process.argv[1] && /build-state(\.mjs)?$/.test(process.argv[1]);
if (direct) runCli();
