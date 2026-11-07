#!/usr/bin/env node
/**
 * bench.mjs — score what the bundle produced in one QA root, so two versions of the bundle can be
 * compared on numbers instead of impressions (docs/benchmark.md, CONTRACTS §26).
 *
 *   npm run qa:bench -- score [--root <qa root>] [--label <name>] [--out <file.json>]
 *                             [--task <id>] [--condition lessons|no-lessons] [--costs <phase-costs.json>]
 *   npm run qa:bench -- export [--root <qa root>] [--condition lessons|no-lessons] [--version v] [--out <file.json>]
 *   npm run qa:bench -- compare <before.json> <after.json> [--reason "<why worse is acceptable>"]
 *
 * Every measure is read from files the bundle already writes; nothing is judged by a model:
 *
 *   first_pass   features whose FIRST case review (reviews/<slug>/*-case-review.md, earliest date)
 *                said `READY FOR /qa-script`, with a 95 % Wilson interval: a designer that gets it
 *                right first time costs one review
 *   flaky        failure entries in runs/**\/failures.md classified FLAKY, over all classified entries,
 *                with a Wilson interval; plus the cases measured flaky in a stability.md and the
 *                quarantine rows not yet released
 *   escapes      rows in defects/ESCAPES.md, and how many still have Backfill `pending`
 *   repeated     harvest signals (qa:learn harvest), and how many no lesson covers yet: the number the
 *                learning loop exists to lower
 *   lessons      active lessons, and how many are established
 *   repeat_errors failures that came back after an active lesson about them (qa:learn ladder)
 *   tokens, duration_s  per phase, from --costs only: the harness meters cost, the QA root does not,
 *                so a phase with no measured value is null — a guessed cost would look like a result
 *
 * `compare` prints the change in each and exits 1 when the later score is worse: first_pass or flaky
 * moved with non-overlapping intervals, more escapes without backfill, or more uncovered repeats —
 * unless `--reason` says why. A release that gets worse with a written reason is a decision; without
 * one it is a regression nobody looked at. An interval that overlaps is reported as "not measurable
 * at this sample size", never as better or worse.
 *
 * `export` writes one record per feature as a bundle-bench file (schema 1), the paired form a comparer tests.
 *
 * score, and compare when not worse, exit 0; compare worse without --reason exits 1; 2 is a usage error.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { harvest, loadLessons, parseFailures, repeats } from './learnings.mjs';
import { trackRun } from './lib/runlog.mjs';
import { workspaceRoot } from './lib/root.mjs';
import { parseSizing } from './lib/sizing.mjs';

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}
const round = (x) => Math.round(x * 1000) / 1000;

/** 95 % Wilson score interval for k successes in n, as [low, high]; [0, 1] when n is 0. */
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
const share = (k, n) => {
  const [lo, hi] = wilson(k, n);
  return { k, of: n, rate: n ? round(k / n) : null, ci95: [round(lo), round(hi)] };
};

/** The first case review of each feature: its verdict (§18 vocabulary). */
export function firstReviews(root) {
  const out = new Map();
  const dir = join(root, 'reviews');
  if (!existsSync(dir)) return out;
  for (const slug of readdirSync(dir)) {
    if (slug.startsWith('_') || !statSync(join(dir, slug)).isDirectory()) continue;
    const files = readdirSync(join(dir, slug)).filter((f) => /^\d{4}-\d{2}-\d{2}(?:-\d{4})?-case-review\.md$/.test(f)).sort();
    if (!files.length) continue;
    const text = readFileSync(join(dir, slug, files[0]), 'utf8');
    const verdict = (/^verdict:\s*(.+?)\s*$/m.exec(text) ?? /\*\*Verdict:\*\*\s*(READY FOR \/qa-script|REVISE FIRST)/.exec(text) ?? [])[1] ?? null;
    out.set(slug, verdict);
  }
  return out;
}

export const BUNDLE = 'agentic-fx-qa';
export const PHASES = ['analyze', 'plan', 'design', 'script', 'run', 'report'];
const CONDITIONS = ['lessons', 'no-lessons'];

/** `{ <phase>: { tokens, duration_s } }` → two per-phase maps; anything not a finite number is null. */
export function phaseCosts(costs = {}) {
  const pick = (ph, k) => (Number.isFinite(costs?.[ph]?.[k]) ? costs[ph][k] : null);
  return {
    tokens: Object.fromEntries(PHASES.map((ph) => [ph, pick(ph, 'tokens')])),
    duration_s: Object.fromEntries(PHASES.map((ph) => [ph, pick(ph, 'duration_s')])),
  };
}

/** The newest plan's `estimate_tokens` per slug, summed: what the work was sized at before it ran. */
function estimated(root) {
  let sum = 0;
  let any = false;
  const dir = join(root, 'plans');
  if (!existsSync(dir)) return null;
  for (const slug of readdirSync(dir)) {
    if (slug.startsWith('_') || !statSync(join(dir, slug)).isDirectory()) continue;
    const plan = readdirSync(join(dir, slug)).filter((f) => /^\d{4}-\d{2}-\d{2}-test-plan\.md$/.test(f)).sort().at(-1);
    const n = plan ? Number(parseSizing(readFileSync(join(dir, slug, plan), 'utf8'))?.estimate_tokens) : NaN;
    if (Number.isFinite(n)) { sum += n; any = true; }
  }
  return any ? sum : null;
}

/** The bundle version that last derived this root (state.json), never the one that happens to run the scorer. */
function rootVersion(root) {
  try { return JSON.parse(readFileSync(join(root, 'state.json'), 'utf8')).generator_version ?? null; } catch { return null; }
}

/** Actual against sized: the ratio is null unless every phase was metered, because a partial sum would flatter it. */
export function vsEstimate(tokens, estimate) {
  const vals = Object.values(tokens);
  const actual = vals.every((v) => v !== null) ? vals.reduce((a, b) => a + b, 0) : null;
  return { estimate_tokens: estimate, actual_tokens: actual, cost_vs_estimate: actual !== null && estimate ? Math.round((actual / estimate) * 100) / 100 : null };
}

export function score(root, { label = null, task = null, condition = null, costs = {}, version = null } = {}) {
  if (condition !== null && !CONDITIONS.includes(condition)) throw new Error(`condition must be ${CONDITIONS.join(' | ')}`);
  const reviews = firstReviews(root);
  const judged = [...reviews.values()].filter(Boolean);
  const passed = judged.filter((v) => v === 'READY FOR /qa-script').length;

  const entries = [];
  const measured = new Set();
  for (const p of walk(join(root, 'runs'))) {
    const name = basename(p);
    if (name === 'failures.md') entries.push(...parseFailures(readFileSync(p, 'utf8'), dirname(p)).filter((e) => e.cause));
    if (name === 'stability.md') for (const m of readFileSync(p, 'utf8').matchAll(/^\| (TC-[A-Z0-9-]+) \|[^|]*\|[^|]*\|[^|]*\| flaky \|/gm)) measured.add(m[1]);
  }
  const quarantine = join(root, 'regression', 'quarantine.md');
  const active = existsSync(quarantine)
    ? readFileSync(quarantine, 'utf8').split('\n').filter((l) => /^\| TC-/.test(l) && /\|\s*—\s*\|\s*$/.test(l)).length
    : 0;

  const escapesFile = join(root, 'defects', 'ESCAPES.md');
  const escapeRows = existsSync(escapesFile) ? readFileSync(escapesFile, 'utf8').split('\n').filter((l) => /^\| DEF-/.test(l)) : [];
  const pending = escapeRows.filter((l) => (l.split('|')[6] ?? '').trim() === 'pending').length;

  const lessons = loadLessons(root);
  const signals = harvest(root, { lessons });
  const live = lessons.filter((l) => l.fm?.status === 'active');
  return {
    task_id: task ?? label,
    bundle: BUNDLE,
    version: version ?? rootVersion(root),
    // The arm of an A/B run; when unstated, what the root had loaded is the condition it ran under.
    condition: condition ?? (live.length ? 'lessons' : 'no-lessons'),
    lessons_active: live.length,
    repeat_errors: repeats(root, { lessons }).reduce((n, r) => n + r.repeats, 0),
    ...phaseCosts(costs),
    ...vsEstimate(phaseCosts(costs).tokens, estimated(root)),
    label,
    features: reviews.size,
    first_pass: share(passed, judged.length),
    flaky: { ...share(entries.filter((e) => e.cause === 'FLAKY').length, entries.length), measured: measured.size, quarantined: active },
    escapes: { total: escapeRows.length, unbackfilled: pending },
    repeated: { total: signals.length, uncovered: signals.filter((s) => !s.covered).length },
    lessons: { active: live.length, established: live.filter((l) => l.fm.confidence === 'established').length },
  };
}

/**
 * One record per feature in the bundle-bench schema an external comparer reads: the same feature
 * scored under two versions or two conditions is what a paired test needs, and a root total cannot
 * be paired. Repeat errors and cost are measured per run, not per feature, so they stay null here
 * rather than being split by a guess.
 */
export function exportTasks(root, { condition = null, version = null } = {}) {
  const s = score(root, { condition, version });
  const tasks = [...firstReviews(root).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([slug, v]) => ({
    task_id: slug,
    first_pass: v === null ? null : v === 'READY FOR /qa-script',
    repeat_errors: null,
    tokens: null,
    duration_s: null,
  }));
  return { schema: 1, bundle: s.bundle, version: s.version, condition: s.condition, tasks };
}

/** { worse: [reasons], lines: [printable] } */
export function compare(a, b) {
  const worse = [];
  const lines = [];
  const d = (x, y) => (y - x >= 0 ? `+${y - x}` : `${y - x}`);
  const interval = (name, x, y, higherIsBetter) => {
    lines.push(`${name.padEnd(12)} ${x.rate ?? '—'} [${x.ci95.join(', ')}] (n=${x.of}) → ${y.rate ?? '—'} [${y.ci95.join(', ')}] (n=${y.of})`);
    if (!x.of || !y.of) { lines.push('             ↳ no data on one side: not evaluable'); return; }
    const below = y.ci95[1] < x.ci95[0];
    const above = y.ci95[0] > x.ci95[1];
    if (below || above) {
      const better = higherIsBetter ? above : below;
      if (better) lines.push('             ↳ improved: the intervals do not overlap');
      else worse.push(`${name} ${higherIsBetter ? 'fell' : 'rose'}: the later interval sits wholly ${higherIsBetter ? 'below' : 'above'} the earlier one`);
    } else lines.push('             ↳ the intervals overlap: not measurable at this sample size');
  };
  interval('first_pass', a.first_pass, b.first_pass, true);
  interval('flaky', a.flaky, b.flaky, false);
  lines.push(`             measured flaky ${a.flaky.measured} → ${b.flaky.measured}, quarantined ${a.flaky.quarantined} → ${b.flaky.quarantined}`);
  lines.push(`escapes      ${a.escapes.total} → ${b.escapes.total}, without backfill ${a.escapes.unbackfilled} → ${b.escapes.unbackfilled} (${d(a.escapes.unbackfilled, b.escapes.unbackfilled)})`);
  if (b.escapes.unbackfilled > a.escapes.unbackfilled) worse.push('more escaped defects with no closing case');
  lines.push(`repeated     ${a.repeated.total} → ${b.repeated.total}, uncovered ${a.repeated.uncovered} → ${b.repeated.uncovered} (${d(a.repeated.uncovered, b.repeated.uncovered)})`);
  if (b.repeated.uncovered > a.repeated.uncovered) worse.push('more repeated signals with no lesson');
  // Older score files have no repeat_errors: missing is not evaluable, never zero.
  const ra = a.repeat_errors ?? null;
  const rb = b.repeat_errors ?? null;
  lines.push(`repeat_errors ${ra ?? '—'} → ${rb ?? '—'}${ra !== null && rb !== null ? ` (${d(ra, rb)})` : ' (not evaluable)'}`);
  if (ra !== null && rb !== null && rb > ra) worse.push('more repeat errors: mistakes came back after their lesson');
  lines.push(`lessons      ${a.lessons.active} (${a.lessons.established} established) → ${b.lessons.active} (${b.lessons.established} established)`);
  return { worse, lines };
}

export function main(argv, { cwd = process.cwd() } = {}) {
  const VALUED = new Set(['--root', '--label', '--out', '--reason', '--task', '--condition', '--costs', '--version']);
  const pos = argv.filter((x, i) => !x.startsWith('--') && !(i > 0 && VALUED.has(argv[i - 1])));
  const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
  const [cmd] = pos;
  if (cmd === 'score') {
    const root = opt('--root') ? join(cwd, opt('--root')) : workspaceRoot({ cwd });
    if (opt('--condition') && !CONDITIONS.includes(opt('--condition'))) { console.error(`--condition must be ${CONDITIONS.join(' | ')}`); return 2; }
    const costs = opt('--costs') ? JSON.parse(readFileSync(join(cwd, opt('--costs')), 'utf8')) : {};
    const s = score(root, { label: opt('--label'), task: opt('--task'), condition: opt('--condition'), costs, version: opt('--version') });
    const text = `${JSON.stringify(s, null, 2)}\n`;
    if (opt('--out')) writeFileSync(opt('--out'), text);
    process.stdout.write(text);
    return 0;
  }
  if (cmd === 'export') {
    const root = opt('--root') ? join(cwd, opt('--root')) : workspaceRoot({ cwd });
    if (opt('--condition') && !CONDITIONS.includes(opt('--condition'))) { console.error(`--condition must be ${CONDITIONS.join(' | ')}`); return 2; }
    const text = `${JSON.stringify(exportTasks(root, { condition: opt('--condition'), version: opt('--version') }), null, 2)}\n`;
    if (opt('--out')) writeFileSync(opt('--out'), text);
    process.stdout.write(text);
    return 0;
  }
  if (cmd === 'compare' && pos.length === 3) {
    const [a, b] = pos.slice(1).map((p) => JSON.parse(readFileSync(p, 'utf8')));
    const { worse, lines } = compare(a, b);
    console.log(`qa:bench compare — ${a.label ?? pos[1]} → ${b.label ?? pos[2]}`);
    for (const l of lines) console.log(`  ${l}`);
    if (!worse.length) { console.log('  not worse on any gated measure'); return 0; }
    for (const w of worse) console.log(`  WORSE  ${w}`);
    if (opt('--reason')) { console.log(`  accepted: ${opt('--reason')}`); return 0; }
    console.log('  a version that scores worse ships only with --reason "<why>"');
    return 1;
  }
  console.error('usage: qa:bench -- score [--root r] [--label l] [--out f.json] [--task id] [--condition lessons|no-lessons] [--costs f.json] [--version v] | export [--condition c] [--version v] [--out f.json] | compare <before.json> <after.json> [--reason "<why>"]');
  return 2;
}

const isMain = process.argv[1] && /(^|\/)bench\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) trackRun(import.meta.url);
if (isMain) process.exit(main(process.argv.slice(2)));
