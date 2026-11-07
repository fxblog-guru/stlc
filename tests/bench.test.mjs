// bench.test.mjs — qa:bench scores a QA root from files it already has, and `compare` refuses a
// worse version unless a reason is written (CONTRACTS §26, docs/benchmark.md).
// Run: node --test "tests/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
process.env.QA_RUN_LOG = 'off';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BENCH = join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'bench.mjs');
const { wilson, score, compare, exportTasks } = await import(pathToFileURL(BENCH).href);
const run = (args, cwd) => spawnSync(process.execPath, [BENCH, ...args], { cwd, encoding: 'utf8', env: { ...process.env, QA_RUN_LOG: 'off' } });

test('wilson: the textbook values, and [0, 1] with no data', () => {
  const [lo, hi] = wilson(8, 10);
  assert.ok(Math.abs(lo - 0.49) < 0.005 && Math.abs(hi - 0.943) < 0.005, `${lo} ${hi}`);
  assert.deepEqual(wilson(0, 0), [0, 1]);
});

test('score reads the reference fixture: first review, escapes, quarantine — and writes nothing there', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'stlc-bench-'));
  try {
    cpSync(join(ROOT, 'tests', 'fixture', 'qa'), join(tmp, 'qa'), { recursive: true });
    const s = score(join(tmp, 'qa'), { label: 'fixture' });
    assert.deepEqual([s.features, s.first_pass.k, s.first_pass.of], [1, 0, 1], 'the fixture review says REVISE FIRST');
    assert.deepEqual(s.escapes, { total: 1, unbackfilled: 1 });
    assert.equal(s.flaky.quarantined, 1, 'one ledger row is not released');
    assert.equal(s.lessons.active, 0);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

function qaRoot({ reviews = [], flaky = 0, other = 0, escapes = 0 }) {
  const root = mkdtempSync(join(tmpdir(), 'stlc-bench-root-'));
  reviews.forEach((v, i) => {
    mkdirSync(join(root, 'reviews', `f${i}`), { recursive: true });
    writeFileSync(join(root, 'reviews', `f${i}`, '2026-09-01-case-review.md'), `---\nverdict: ${v}\n---\n`);
    // A later review never changes the first-pass number.
    writeFileSync(join(root, 'reviews', `f${i}`, '2026-09-09-case-review.md'), '---\nverdict: READY FOR /qa-script\n---\n');
  });
  const blocks = [];
  for (let i = 0; i < flaky; i++) blocks.push(`## TC-E2E-ORDERS-${String(i + 1).padStart(3, '0')} — t\n- **Error:** e${i}\n- **Suspected cause:** FLAKY\n`);
  for (let i = 0; i < other; i++) blocks.push(`## TC-API-ORDERS-${String(i + 1).padStart(3, '0')} — t\n- **Error:** x${i}\n- **Suspected cause:** FUNCTIONAL\n`);
  mkdirSync(join(root, 'runs', 'e2e', 'orders', '2026-09-10-1000'), { recursive: true });
  writeFileSync(join(root, 'runs', 'e2e', 'orders', '2026-09-10-1000', 'failures.md'), `# Failures\n\n${blocks.join('\n')}`);
  mkdirSync(join(root, 'defects'), { recursive: true });
  writeFileSync(join(root, 'defects', 'ESCAPES.md'), `| DEF | Feature | Reported | Phase missed | Type missed | Backfill | Status |\n|---|---|---|---|---|---|---|\n${Array.from({ length: escapes }, (_, i) => `| DEF-orders-00${i + 1} | orders | 2026-09-12 | DESIGN | unit | pending | OPEN |`).join('\n')}\n`);
  return root;
}

test('compare: exits 1 on a worse version, 0 with --reason, 0 when the change is within the noise', () => {
  const dirs = [];
  const save = (name, opts) => { const r = qaRoot(opts); dirs.push(r); const out = join(r, `${name}.json`); assert.equal(run(['score', '--root', '.', '--label', name, '--out', out], r).status, 0); return out; };
  try {
    const good = save('v1', { reviews: Array(20).fill('READY FOR /qa-script'), flaky: 1, other: 19 });
    const bad = save('v2', { reviews: [...Array(4).fill('READY FOR /qa-script'), ...Array(16).fill('REVISE FIRST')], flaky: 15, other: 5, escapes: 2 });
    const close = save('v3', { reviews: [...Array(19).fill('READY FOR /qa-script'), 'REVISE FIRST'], flaky: 2, other: 18 });

    const worse = run(['compare', good, bad]);
    assert.equal(worse.status, 1, worse.stdout);
    assert.match(worse.stdout, /WORSE {2}first_pass fell/);
    assert.match(worse.stdout, /WORSE {2}flaky rose/);
    assert.match(worse.stdout, /WORSE {2}more escaped defects with no closing case/);

    const accepted = run(['compare', good, bad, '--reason', 'new suite on a harder product']);
    assert.equal(accepted.status, 0);
    assert.match(accepted.stdout, /accepted: new suite on a harder product/);

    const noise = run(['compare', good, close]);
    assert.equal(noise.status, 0, noise.stdout);
    assert.match(noise.stdout, /not measurable at this sample size/);

    assert.equal(run(['compare', bad, good]).status, 0, 'an improvement must not fail');
    assert.equal(run(['nonsense']).status, 2);
  } finally { for (const d of dirs) rmSync(d, { recursive: true, force: true }); }
});

test('score carries the comparer fields; cost is null unless measured; compare fails when repeat errors rise', () => {
  const root = mkdtempSync(join(tmpdir(), 'stlc-bench-fields-'));
  try {
    const s = score(root, { task: 'orders', condition: 'no-lessons', version: '2.3.0', costs: { plan: { tokens: 1200, duration_s: 40 }, run: { tokens: 'lots' } } });
    for (const k of ['task_id', 'bundle', 'version', 'condition', 'first_pass', 'repeat_errors', 'tokens', 'duration_s', 'lessons_active']) assert.ok(k in s, `no ${k}`);
    assert.deepEqual([s.task_id, s.bundle, s.version, s.condition, s.repeat_errors], ['orders', 'agentic-fx-qa', '2.3.0', 'no-lessons', 0]);
    assert.deepEqual([s.tokens.plan, s.duration_s.plan, s.tokens.run, s.tokens.design], [1200, 40, null, null], 'an unmeasured or non-numeric cost is null, never guessed');
    assert.throws(() => score(root, { condition: 'half' }), /condition must be/);
    assert.deepEqual([s.estimate_tokens, s.actual_tokens, s.cost_vs_estimate], [null, null, null], 'no plan, partly metered: nothing to compare');
    const fix = mkdtempSync(join(tmpdir(), 'stlc-bench-est-'));
    cpSync(join(ROOT, 'tests', 'fixture', 'qa'), join(fix, 'qa'), { recursive: true });
    const all = Object.fromEntries(['analyze', 'plan', 'design', 'script', 'run', 'report'].map((p) => [p, { tokens: 70000, duration_s: 60 }]));
    const m = score(join(fix, 'qa'), { costs: all });
    rmSync(fix, { recursive: true, force: true });
    assert.deepEqual([m.estimate_tokens, m.actual_tokens, m.cost_vs_estimate], [420000, 420000, 1], 'actual against the sized estimate');
    const { worse } = compare({ ...s, repeat_errors: 1 }, { ...s, repeat_errors: 3 });
    assert.ok(worse.some((w) => /more repeat errors/.test(w)), worse.join('; '));
    assert.deepEqual(compare({ ...s, repeat_errors: 3 }, { ...s, repeat_errors: 1 }).worse, []);
    const old = { ...s };
    delete old.repeat_errors;
    assert.deepEqual(compare(old, { ...s, repeat_errors: 5 }).worse, [], 'an older score with no repeat_errors is not evaluable, never zero');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('compare treats a side with no data as not evaluable, never as worse', () => {
  const empty = score(mkdtempSync(join(tmpdir(), 'stlc-bench-empty-')));
  const { worse, lines } = compare(empty, empty);
  assert.deepEqual(worse, []);
  assert.ok(lines.some((l) => /not evaluable/.test(l)));
});

test('docs/benchmark.md describes the measures the script scores', () => {
  const doc = readFileSync(join(ROOT, 'docs', 'benchmark.md'), 'utf8');
  for (const m of ['first_pass', 'flaky', 'escapes', 'repeated', 'lessons', 'Wilson', '--reason', 'npm run qa:bench']) assert.ok(doc.includes(m), `docs/benchmark.md does not mention ${m}`);
});

test('export: one record per feature in the bundle-bench schema; the first review decides first_pass', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'stlc-bench-export-'));
  try {
    cpSync(join(ROOT, 'tests', 'fixture', 'qa'), join(tmp, 'qa'), { recursive: true });
    const doc = exportTasks(join(tmp, 'qa'), { condition: 'no-lessons', version: '2.3.0' });
    assert.deepEqual([doc.schema, doc.condition, doc.version], [1, 'no-lessons', '2.3.0']);
    assert.deepEqual(doc.tasks.map((t) => [t.task_id, t.first_pass]), [['orders', false]], 'the fixture review says REVISE FIRST');
    for (const t of doc.tasks) assert.deepEqual([t.repeat_errors, t.tokens, t.duration_s], [null, null, null], 'not measured per feature: null, never split by a guess');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

// The comparer lives in the ai-eval bundle; when it is checked out (beside this repo, or at AI_EVAL_DIR) the export must load in it.
const COMPARER = join(process.env.AI_EVAL_DIR ?? join(ROOT, '..', 'ai-eval'), 'workspace', 'evals', 'scripts', 'compare_bench.py');
test('export: the ai-eval comparer accepts it', { skip: !existsSync(COMPARER) && 'ai-eval comparer not found' }, () => {
  const tmp = mkdtempSync(join(tmpdir(), 'stlc-bench-cmp-'));
  try {
    cpSync(join(ROOT, 'tests', 'fixture', 'qa'), join(tmp, 'qa'), { recursive: true });
    const out = join(tmp, 'a.json');
    writeFileSync(out, `${JSON.stringify(exportTasks(join(tmp, 'qa'), { condition: 'lessons' }))}\n`);
    const r = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-I', COMPARER, out, out], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    assert.equal(r.status, 3, `one paired feature is NOT-EVALUABLE, not a schema error: ${r.stdout}${r.stderr}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
