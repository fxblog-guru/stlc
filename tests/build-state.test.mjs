// build-state.test.mjs — the derived read model (CONTRACTS §17) and the two hooks that use it.
// Run: node --test "tests/*.test.mjs"
//
// Every scenario below is a defect the first version shipped with: module folders and the shared
// layer counted as features, the estimate read as the plan, one env check stamped on every feature,
// quarantine attributed by guessing the slug from the case id, and a lint hook that could not fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildState, PHASES } from '../workspace/qa/scripts/shared/build-state.mjs';
// Script runs in tests are not usage: keep them out of the run log (lib/runlog.mjs).
process.env.QA_RUN_LOG = 'off';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'tests', 'fixture', 'qa');
const SHARED = join(ROOT, 'workspace', 'qa', 'scripts', 'shared');
process.env.QA_LINT_TODAY = '2026-09-15';

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'qa-state-'));
  cpSync(FIXTURE, join(dir, 'qa'), { recursive: true });
  return { dir, qa: join(dir, 'qa'), done: () => rmSync(dir, { recursive: true, force: true }) };
}
const put = (p, text) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
};

test('the reference fixture derives the state CONTRACTS §17 describes', () => {
  const state = buildState(FIXTURE);
  assert.equal(state.schema, 1);
  assert.match(state.source_hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(state.slugs.map((s) => s.slug), ['orders']);
  assert.equal(state.types_enabled, null, 'no profile next to the fixture: unknown, not invented');

  const s = state.slugs[0];
  assert.ok(PHASES.includes(s.phase));
  assert.equal(s.phase, 'Report');
  assert.equal(s.plan, 'qa/plans/orders/2026-09-01-test-plan.md');
  assert.deepEqual(s.traceability, { total_cases: 11, scripted: 7, last_run_pass: 2, last_run_fail: 2, blocked: 1, not_run: 6 });
  assert.deepEqual(s.types.mobile, { cases: 2, scripted: 2, pass: 0, fail: 0, blocked: 1 });

  assert.equal(s.report.overall, 'fail');
  assert.equal(s.report.shipped_sha, '8556e8f');
  assert.equal(s.report.gates[0].gate, 'Functional');
  assert.equal(s.report.gates[0].verdict, 'fail');
  // The mobile run 2026-09-10-1040 is in the traceability table but not in the report's runs.
  assert.equal(s.report.stale, true);
  assert.deepEqual(s.report.newer_runs, ['2026-09-10-1040']);

  assert.deepEqual(s.defects.items.map((d) => `${d.id}:${d.severity}:${d.origin}`), ['DEF-orders-001:High:INTERNAL', 'DEF-orders-003:High:ESCAPED']);
  assert.equal(s.quarantine.active, 1);
  assert.equal(s.quarantine.items[0].expired, false);
  assert.equal(s.signoff.recommendation, 'NO-GO');
});

test('the committed fixture state.json is what the builder derives today', () => {
  const run = spawnSync(process.execPath, [join(SHARED, 'build-state.mjs'), '--root', FIXTURE, '--check'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});

test('a fresh install has no features: shared-layer folders, templates and module folders are not slugs', () => {
  assert.deepEqual(buildState(join(ROOT, 'workspace', 'qa')).slugs, []);
});

test('retro, metrics, env checks and module folders never become features', () => {
  const t = scratch();
  try {
    put(join(t.qa, 'reports', 'retro', '2026-09-20-retro.md'), '# retro\n');
    put(join(t.qa, 'reports', 'metrics', '2026-09-20-metrics.md'), '# metrics\n');
    put(join(t.qa, 'runs', 'env-checks', 'uat', '2026-09-10-0900', 'readiness.md'), '# r\n');
    put(join(t.qa, 'cases', 'api', 'order-lines', 'TC-API-ORDER-LINES-001-x.md'), '# x\n**Feature:** orders\n');
    put(join(t.qa, 'scripts', 'shared', 'http', 'client.ts'), '');
    assert.deepEqual(buildState(t.qa).slugs.map((s) => s.slug), ['orders']);
  } finally {
    t.done();
  }
});

test('the plan is the newest *-test-plan.md, not a later strategy or estimate', () => {
  const t = scratch();
  try {
    put(join(t.qa, 'plans', 'orders', '2026-09-03-estimate.md'), '# Estimate — orders\n');
    put(join(t.qa, 'plans', 'orders', '2026-09-04-strategy.md'), '# Strategy — orders\n');
    const s = buildState(t.qa).slugs[0];
    assert.equal(s.plan, 'qa/plans/orders/2026-09-01-test-plan.md');
    assert.equal(s.traceability.total_cases, 11);
  } finally {
    t.done();
  }
});

test('env checks are per environment, newest run, with the per-type verdict lines', () => {
  const t = scratch();
  try {
    const base = join(t.qa, 'runs', 'env-checks');
    put(join(base, 'uat', '2026-09-09-0900', 'readiness.md'), 'e2e: NOT READY — no BASE_URL\n');
    put(join(base, 'uat', '2026-09-10-0900', 'readiness.md'), '- `e2e`: READY\n- `performance`: BLOCKED — not authorized on uat\n');
    put(join(base, 'dev', '2026-09-10-0800', 'readiness.md'), 'api: READY\n');
    const state = buildState(t.qa);
    assert.deepEqual(state.environments.map((e) => `${e.env}@${e.run_id}`), ['dev@2026-09-10-0800', 'uat@2026-09-10-0900']);
    assert.deepEqual(state.environments[1].verdicts, { e2e: 'READY', performance: 'BLOCKED' });
    assert.equal(state.slugs[0].env_check, undefined, 'an env check is not a property of a feature');
  } finally {
    t.done();
  }
});

test('quarantine attaches through the traceability table, not by guessing a slug from the case id', () => {
  const t = scratch();
  try {
    // A module that is not the slug: TC-E2E-ORDER-LINES-002 belongs to `orders` because its plan lists it.
    const plan = join(t.qa, 'plans', 'orders', '2026-09-01-test-plan.md');
    const text = readFileSync(plan, 'utf8').replace(
      '| REQ-001 | TC-MOB-ORDERS-001 |',
      '| REQ-002 | TC-E2E-ORDER-LINES-002 | e2e | order-lines | P2 | ✅ | — | — | — |\n| REQ-001 | TC-MOB-ORDERS-001 |',
    );
    writeFileSync(plan, text);
    const ledger = join(t.qa, 'regression', 'quarantine.md');
    writeFileSync(ledger, `${readFileSync(ledger, 'utf8').trimEnd()}\n| TC-E2E-ORDER-LINES-002 | 2026-09-12 | 2026-09-14 | timing | 2026-09-11-0900 | — | — |\n`);
    const q = buildState(t.qa).slugs[0].quarantine;
    assert.deepEqual(q.items.map((i) => `${i.case_id}:${i.expired}`), ['TC-E2E-ORDERS-001:false', 'TC-E2E-ORDER-LINES-002:true']);
    assert.equal(q.expired, 1);
    assert.equal(q.nearest_expiry, '2026-09-14');
  } finally {
    t.done();
  }
});

test('phases follow the /qa-status ladder: Analyze → Plan → Design → Script → Run → Report → Signed-off', () => {
  const t = scratch();
  try {
    put(join(t.qa, 'analysis', 'billing', '2026-09-01-analysis.md'), '# QA Analysis — billing\n');
    put(join(t.qa, 'plans', 'refunds', '2026-09-01-test-plan.md'), '# Test Plan — refunds — 2026-09-01\n');
    put(join(t.qa, 'reviews', 'orders', '2026-09-05-case-review.md'), '**Verdict:** REVISE FIRST   **Reviewer:** test-planner\n');
    const signoff = join(t.qa, 'reports', 'release', '2026-09', '2026-09-12-signoff.md');
    writeFileSync(signoff, readFileSync(signoff, 'utf8').replace(/^recommendation: NO-GO/m, 'recommendation: GO'));
    const by = Object.fromEntries(buildState(t.qa).slugs.map((s) => [s.slug, s]));
    assert.equal(by.billing.phase, 'Analyze');
    assert.equal(by.refunds.phase, 'Plan');
    assert.equal(by.orders.phase, 'Signed-off');
    assert.equal(by.orders.review.verdict, 'REVISE FIRST');
    assert.equal(by.orders.review.stale, null, 'reviews carry no hashes yet: staleness is unknown, not false');
  } finally {
    t.done();
  }
});

test('hooks: the Stop builder is silent where there is no QA root', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-none-'));
  try {
    const run = spawnSync(process.execPath, [join(SHARED, 'build-state.mjs'), '--quiet'], { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout + run.stderr, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('hooks: lint-on-write blocks a broken QA artifact and ignores everything outside qa/', () => {
  const t = scratch();
  const hook = (file) =>
    spawnSync(process.execPath, [join(SHARED, 'lint-on-write.mjs')], {
      cwd: t.dir,
      input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: file } }),
      encoding: 'utf8',
    });
  try {
    const plan = join(t.qa, 'plans', 'orders', '2026-09-01-test-plan.md');
    assert.equal(hook(plan).status, 0, 'the pristine fixture plan is clean');
    writeFileSync(plan, readFileSync(plan, 'utf8').replace('## Traceability (Requirement ↔ Case)', '## Traceability'));
    const bad = hook(plan);
    assert.equal(bad.status, 2, `a broken plan must block: ${bad.stdout}${bad.stderr}`);
    assert.match(bad.stderr, /plans\/orders\/2026-09-01-test-plan\.md/);
    put(join(t.dir, 'src', 'app.ts'), 'export {}\n');
    assert.equal(hook(join(t.dir, 'src', 'app.ts')).status, 0, 'application code is not the hook’s business');
  } finally {
    t.done();
  }
});

test('§18: a case review records what it judged, and goes stale when a case changes under it', () => {
  const t = scratch();
  try {
    const before = buildState(t.qa).slugs[0].review;
    assert.equal(before.verdict, 'REVISE FIRST');
    assert.equal(before.reviewed, 1);
    assert.equal(before.stale, false, 'nothing changed since the review');

    const judged = join(t.qa, 'cases', 'api', 'orders', 'TC-API-ORDERS-001-create-order-contract.md');
    writeFileSync(judged, `${readFileSync(judged, 'utf8')}\n- an extra step the reviewer never saw\n`);
    const after = buildState(t.qa).slugs[0].review;
    assert.equal(after.stale, true, 'the body of a reviewed case changed');
    assert.deepEqual(after.changed, ['qa/cases/api/orders/TC-API-ORDERS-001-create-order-contract.md']);
  } finally {
    t.done();
  }
});

test('§18: an env check records its inputs, and goes stale when one changes', () => {
  const t = scratch();
  try {
    const before = buildState(t.qa).environments[0];
    assert.deepEqual(before.verdicts, { api: 'READY', e2e: 'READY', performance: 'BLOCKED' });
    assert.equal(before.stale, false);

    // The front matter is authoritative; a body line that disagrees does not change the verdict.
    const readiness = join(t.qa, 'runs', 'env-checks', 'uat', '2026-09-10-0900', 'readiness.md');
    writeFileSync(readiness, readFileSync(readiness, 'utf8').replace('`e2e: READY`', '`e2e: NOT READY`'));
    assert.equal(buildState(t.qa).environments[0].verdicts.e2e, 'READY', 'front matter wins over the body');

    writeFileSync(join(t.qa, '.env.uat.example'), 'BASE_URL=\nAPI_TOKEN=\nNEW_SERVICE_URL=\n');
    const after = buildState(t.qa).environments[0];
    assert.equal(after.stale, true);
    assert.deepEqual(after.changed, ['qa/.env.uat.example']);
  } finally {
    t.done();
  }
});

test('§18: staleness is unknown, not false, for a verdict that recorded no hashes', () => {
  const t = scratch();
  try {
    const review = join(t.qa, 'reviews', 'orders', '2026-09-05-case-review.md');
    // CRLF folded first: a Windows checkout (core.autocrlf=true) must exercise the same mutation.
    writeFileSync(review, readFileSync(review, 'utf8').replace(/\r\n/g, '\n').replace(/reviewed:\n(  - .*\n)+/, ''));
    const r = buildState(t.qa).slugs[0].review;
    assert.equal(r.stale, null, 'no reviewed list: cannot tell, so do not claim it is current');
    assert.equal(r.reviewed, 0);
  } finally {
    t.done();
  }
});

test('§18: a front-matter verdict that contradicts the body is no verdict at all', () => {
  const t = scratch();
  try {
    const review = join(t.qa, 'reviews', 'orders', '2026-09-05-case-review.md');
    writeFileSync(review, readFileSync(review, 'utf8').replace(/^verdict: REVISE FIRST$/m, 'verdict: READY FOR /qa-script'));
    assert.equal(buildState(t.qa).slugs[0].review.verdict, null);
  } finally {
    t.done();
  }
});
