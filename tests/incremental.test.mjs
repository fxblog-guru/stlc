// incremental.test.mjs — the helpers a NEW feature needs when it lands on modules that already have
// tests: change-based selection (changed-modules.mjs) and id-collision repair (renumber-case.mjs).
// Run: node --test "tests/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readImpactMap, selectChanged, readCases } from '../workspace/qa/scripts/shared/changed-modules.mjs';
import { planRenumber, applyRenumber } from '../workspace/qa/scripts/shared/renumber-case.mjs';
// Script runs in tests are not usage: keep them out of the run log (lib/runlog.mjs).
process.env.QA_RUN_LOG = 'off';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'tests', 'fixture', 'qa');
const SHARED = join(ROOT, 'workspace', 'qa', 'scripts', 'shared');

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'qa-inc-'));
  cpSync(FIXTURE, join(dir, 'qa'), { recursive: true });
  return { qa: join(dir, 'qa'), done: () => rmSync(dir, { recursive: true, force: true }) };
}

const MAP = `# Impact map

| BR | Module | Endpoint / Screen | TC | Last verified | Notes |
|---|---|---|---|---|---|
| BR-001 | orders | backend:src/Orders/OrderTotal.cs#Compute @ a1b2c3d | TC-API-ORDERS-001 | 2026-09-10 | — |
| BR-002 | billing | backend:src/Billing/Invoice.cs#Issue @ a1b2c3d · screen Invoice | TC-API-BILLING-001 | — | — |
| BR-003 | ? | ? | — | — | — |
`;

test('changed-modules: a cited file and its folder map to the module; the rest is UNMAPPED, never guessed', () => {
  const rows = readImpactMap(MAP);
  const r = selectChanged({
    rows,
    changed: ['src/Orders/OrderTotal.cs', 'src/Orders/Discount.cs', 'docs/README.md', ''],
    cases: [{ id: 'TC-E2E-ORDERS-001', module: 'orders' }, { id: 'TC-INT-ORDERS-001', module: 'orders', deprecated: true }],
  });
  assert.deepEqual(r.tags, ['@orders']);
  assert.equal(r.grep, '@orders');
  assert.deepEqual(r.modules[0].via, ['dir', 'file']);
  assert.deepEqual(r.cases, ['TC-API-ORDERS-001', 'TC-E2E-ORDERS-001'], 'impact-map TC ∪ module cases, deprecated left out');
  assert.deepEqual(r.unmapped, ['docs/README.md']);
});

test('changed-modules: a changed spec selects its case directly; --layer filters citations', () => {
  const rows = readImpactMap(MAP);
  const spec = selectChanged({ rows, changed: ['qa/scripts/api/billing/TC-API-BILLING-002-void.spec.ts'] });
  assert.deepEqual(spec.cases, ['TC-API-BILLING-002']);
  assert.equal(spec.grep, null);
  const other = selectChanged({ rows, changed: ['src/Billing/Invoice.cs'], layer: 'frontend' });
  assert.deepEqual(other.modules, []);
  assert.deepEqual(other.unmapped, ['src/Billing/Invoice.cs']);
});

test('changed-modules: CLI reads the fixture map from stdin', () => {
  const run = spawnSync(process.execPath, [join(SHARED, 'changed-modules.mjs'), '--stdin', '--json'], {
    cwd: FIXTURE, input: 'src/Orders/OrderTotal.cs\n', encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  const r = JSON.parse(run.stdout);
  assert.deepEqual(r.tags, ['@orders']);
  assert.ok(r.cases.length === readCases(FIXTURE).length, 'every orders case is selected');
});

test('renumber-case: moves the case and its script, rewrites its traceability row, flags the ambiguous refs', () => {
  const t = scratch();
  try {
    const plan = planRenumber(t.qa, 'cases/api/orders/TC-API-ORDERS-001-create-order-contract.md');
    assert.equal(plan.newId, 'TC-API-ORDERS-002');
    applyRenumber(plan);
    const moved = join(t.qa, 'cases/api/orders/TC-API-ORDERS-002-create-order-contract.md');
    assert.ok(existsSync(moved));
    assert.match(readFileSync(moved, 'utf8'), /^# TC-API-ORDERS-002 /m);
    assert.ok(existsSync(join(t.qa, 'scripts/api/orders/TC-API-ORDERS-002-create-order-contract.spec.ts')));
    const tp = readFileSync(join(t.qa, 'plans/orders/2026-09-01-test-plan.md'), 'utf8');
    assert.match(tp, /\| REQ-001 \| TC-API-ORDERS-002 \| api \|/);
    assert.ok(plan.manual.some((m) => m.includes('impact-map.md')), 'the impact-map TC cell is for a person to decide');
    const lint = spawnSync(process.execPath, [join(SHARED, 'lint-qa.mjs')], { cwd: t.qa, encoding: 'utf8', env: { ...process.env, QA_LINT_TODAY: '2026-09-15' } });
    assert.match(lint.stdout, /0 error\(s\)/, lint.stdout);
    assert.match(lint.stdout, /TC TC-API-ORDERS-001 in row BR-001\/orders has no case file/, 'the stale map cell is surfaced, not silently kept');
  } finally {
    t.done();
  }
});

test('renumber-case: refuses a taken id and a changed module', () => {
  const t = scratch();
  try {
    assert.throws(() => planRenumber(t.qa, 'cases/api/orders/TC-API-ORDERS-001-create-order-contract.md', 'TC-API-ORDERS-001'), /equals|taken/);
    assert.throws(() => planRenumber(t.qa, 'cases/api/orders/TC-API-ORDERS-001-create-order-contract.md', 'TC-API-BILLING-001'), /keep the type and module/);
  } finally {
    t.done();
  }
});
