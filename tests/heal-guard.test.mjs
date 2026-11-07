// heal-guard.test.mjs — the heal guard, the stability ranking and the lesson gate (CONTRACTS §23).
// Every way a heal can make a red test green without fixing it must be caught here, one change at a
// time, and a pure locator heal must pass. Run: node --test "tests/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED = join(ROOT, 'workspace', 'qa', 'scripts', 'shared');
const guard = await import(pathToFileURL(join(SHARED, 'heal-guard.mjs')).href);
const flaky = await import(pathToFileURL(join(SHARED, 'flaky.mjs')).href);
const learn = await import(pathToFileURL(join(SHARED, 'learnings.mjs')).href);

const SPEC = 'scripts/api/orders/TC-API-ORDERS-001-create-order.spec.ts';
const BEFORE = `import { test, expect } from '@playwright/test';
import { caseMeta } from '../../shared/meta';
// Script runs in tests are not usage: keep them out of the run log (lib/runlog.mjs).
process.env.QA_RUN_LOG = 'off';

test('TC-API-ORDERS-001 — create order → 201', caseMeta({ id: 'TC-API-ORDERS-001', type: 'api', module: 'orders', priority: 'P1', req: ['orders/REQ-001'] }), async ({ request }) => {
  await page.getByTestId('new-order').click();
  const res = await request.post('/orders', { data: { sku: 'A1', qty: 2 } });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body).toEqual({ sku: 'A1', qty: 2 });
  await expect(page.getByTestId('order-row')).toHaveCount(1);
});
`;
const CASE = { path: 'cases/api/orders/TC-API-ORDERS-001-create-order.md', text: '## Steps\n1. POST /orders with sku A1 qty 2 → 201\n## Expected Result\nThe order exists.' };
const OPEN = new Set(['DEF-orders-004']);
const verdict = (after, opts = {}) => guard.review([{ path: SPEC, before: BEFORE, after }], { openDefects: OPEN, caseOf: () => CASE, ...opts });
const blocked = (after, opts) => verdict(after, opts).filter((f) => !f.allowed);
const swap = (a, b) => { assert.ok(BEFORE.includes(a), `fixture lost "${a}"`); return BEFORE.replace(a, b); };

test('heal guard: an unchanged or reformatted spec is clean', () => {
  assert.deepEqual(verdict(BEFORE), []);
  assert.deepEqual(blocked(BEFORE.replace(/\n {2}/g, '\n    ') + '// a comment\n'), []);
});

test('heal guard: a locator heal is maintenance, allowed — in an assertion and in an action', () => {
  for (const after of [swap("getByTestId('order-row')", "getByRole('row', { name: 'A1' })"), swap("getByTestId('new-order')", "getByRole('button', { name: 'New order' })")]) {
    const f = verdict(after);
    assert.ok(f.length && f.every((x) => x.allowed), JSON.stringify(f));
  }
});

// Each mutation is one way to turn a failing test green without fixing anything; each must block.
const MUST_BLOCK = [
  ['an assertion removed', swap('  expect(res.status()).toBe(201);\n', ''), 'removed'],
  ['a test removed', BEFORE.replace(/test\('TC[\s\S]*\}\);\n/, ''), 'removed'],
  ['exact → partial', swap('toEqual({ sku: \'A1\', qty: 2 })', 'toMatchObject({ sku: \'A1\' })'), 'weakened'],
  ['exact → presence', swap('expect(res.status()).toBe(201)', 'expect(res.status()).toBeTruthy()'), 'weakened'],
  ['moved under try/catch', swap('expect(res.status()).toBe(201);', 'try { expect(res.status()).toBe(201); } catch { /* */ }'), 'weakened'],
  ['moved under an if', swap('expect(res.status()).toBe(201);', 'if (res.ok()) expect(res.status()).toBe(201);'), 'weakened'],
  ['moved under &&', swap('expect(res.status()).toBe(201);', 'res.ok() && expect(res.status()).toBe(201);'), 'weakened'],
  ['moved after a return', swap('  expect(res.status()).toBe(201);', '  return;\n  expect(res.status()).toBe(201);'), 'weakened'],
  ['.catch() on the assertion', swap('await expect(page.getByTestId(\'order-row\')).toHaveCount(1);', 'await expect(page.getByTestId(\'order-row\')).toHaveCount(1).catch(() => {});'), 'weakened'],
  ['test.skip', swap("test('TC-API", "test.skip('TC-API"), 'suppressed'],
  ['test.fixme', swap("test('TC-API", "test.fixme('TC-API"), 'suppressed'],
  ['a hard wait', swap('  const body', '  await page.waitForTimeout(2000);\n  const body'), 'suppressed'],
  ['an explicit timeout', swap('toHaveCount(1)', 'toHaveCount(1, { timeout: 30000 })'), 'suppressed'],
  ['retries', swap('import { caseMeta }', "test.describe.configure({ retries: 3 });\nimport { caseMeta }"), 'suppressed'],
  ['a toPass retry loop', swap('  expect(res.status()).toBe(201);', '  await expect(async () => { expect(res.status()).toBe(201); }).toPass();'), 'suppressed'],
  ['test.fail with no defect', swap('  const res', "  test.fail(true, 'PRODUCT_BUG: broken');\n  const res"), 'suppressed'],
  ['test.fail with a closed defect', swap('  const res', "  test.fail(true, 'DEF-orders-001: old');\n  const res"), 'suppressed'],
  ['an expected value the case does not say', swap('toBe(201)', 'toBe(500)'), 'expected'],
  ['a not flipped', swap('expect(res.status()).toBe(201)', 'expect(res.status()).not.toBe(201)'), 'expected'],
  ['test data the case does not say', swap("data: { sku: 'A1', qty: 2 }", "data: { sku: 'A1', qty: 7 }"), 'data'],
];
for (const [name, after, kind] of MUST_BLOCK) {
  test(`heal guard blocks: ${name}`, () => {
    const b = blocked(after);
    assert.ok(b.some((f) => f.kind === kind), `expected a blocked ${kind}, got ${JSON.stringify(verdict(after))}`);
  });
}

test('heal guard: a test.fail naming an OPEN defect is allowed (the bug stays visible)', () => {
  assert.deepEqual(blocked(swap('  const res', "  test.fail(true, 'DEF-orders-004: count off by one');\n  const res")), []);
});

test('heal guard: an expected value moved TO what the case says is allowed, with the case as evidence', () => {
  const kase = { ...CASE, text: CASE.text.replace('→ 201', '→ 200') };
  const f = verdict(swap('toBe(201)', 'toBe(200)'), { caseOf: () => kase });
  assert.ok(f.length && f.every((x) => x.allowed), JSON.stringify(f));
  assert.match(f.find((x) => x.kind === 'expected').evidence, /follows cases\/api\/orders\//);
});

test('heal guard: a not flipped toward a value the case states is still blocked', () => {
  const kase = { ...CASE, text: CASE.text.replace('→ 201', '→ 200') };
  assert.ok(blocked(swap('expect(res.status()).toBe(201)', 'expect(res.status()).not.toBe(200)'), { caseOf: () => kase }).some((f) => f.kind === 'expected'));
});

test('heal guard: moving to another value the case also states, while the old one is still there, is blocked', () => {
  // The case says qty 2 AND 201: 201 → 2 uses a case literal but walks away from the one the case means.
  assert.ok(blocked(swap('toBe(201)', 'toBe(2)')).some((f) => f.kind === 'expected'));
});

test('heal guard: a literal is matched as a token, so 2 is not "in" 201', () => {
  assert.equal(guard.towardCase({ kind: 'expected', from: '201', to: '2' }, 'POST → 201'), false);
  assert.equal(guard.towardCase({ kind: 'expected', from: "'A1'", to: "'A10'" }, 'sku A10'), true);
  assert.equal(guard.towardCase({ kind: 'expected', from: "'A10'", to: "'A1'" }, 'sku A10'), false);
});

test('heal guard: --human unblocks an expected change but never a forbidden one', () => {
  assert.deepEqual(blocked(swap('toBe(201)', 'toBe(500)'), { human: 'Ana: 500 is the new contract' }), []);
  assert.ok(blocked(swap('  expect(res.status()).toBe(201);\n', ''), { human: 'Ana: fine' }).length);
});

test('heal guard: a spec deleted while its case lives is removed; deleted with its case is maintenance', () => {
  const del = (caseLives) => guard.review([{ path: SPEC, before: BEFORE, after: '' }], { caseLives: () => caseLives });
  assert.equal(del(true)[0].kind, 'removed');
  assert.equal(del(false)[0].allowed, true);
});

test('heal guard: retries raised in playwright.config.ts is suppressed', () => {
  const cfg = "export default defineConfig({ retries: 0, use: {} });";
  const f = guard.review([{ path: 'playwright.config.ts', before: cfg, after: cfg.replace('retries: 0', 'retries: 2') }]);
  assert.ok(f.some((x) => x.kind === 'suppressed' && !x.allowed), JSON.stringify(f));
});

test('heal guard: a schema change needs a human', () => {
  const f = guard.review([{ path: 'scripts/shared/schemas/order.ts', before: 'a', after: 'b' }]);
  assert.equal(f[0].kind, 'contract');
  assert.equal(f[0].allowed, false);
});

// ---- stability ------------------------------------------------------------------------------------------

test('flaky: stable, flaky and broken from a repeated Playwright JSON report; retries count as failures', () => {
  const t = (status, results) => ({ status, projectName: 'api', results });
  const report = { suites: [{ file: 'a.spec.ts', specs: [
    { title: 'TC-API-ORDERS-001 — ok', tests: [t('expected', [{ status: 'passed' }]), t('expected', [{ status: 'passed' }])] },
    { title: 'TC-API-ORDERS-002 — sometimes', tests: [t('expected', [{ status: 'passed' }]), t('flaky', [{ status: 'failed', error: { message: 'Error: timed out\n at x' } }, { status: 'passed' }]), t('unexpected', [{ status: 'failed', error: { message: 'Error: timed out' } }])] },
    { title: 'TC-API-ORDERS-003 — never', tests: [t('unexpected', [{ status: 'failed', error: { message: 'boom' } }]), t('unexpected', [{ status: 'failed' }])] },
    { title: 'TC-API-ORDERS-004 — skipped', tests: [t('skipped', [])] },
  ] }] };
  const rows = flaky.stability(flaky.recordsFromJson(report));
  const by = Object.fromEntries(rows.map((r) => [r.case, r]));
  assert.equal(by['TC-API-ORDERS-001'].verdict, 'stable');
  assert.equal(by['TC-API-ORDERS-002'].verdict, 'flaky');
  assert.equal(by['TC-API-ORDERS-002'].failures, 2);
  assert.deepEqual(by['TC-API-ORDERS-002'].errors, ['Error: timed out']);
  assert.equal(by['TC-API-ORDERS-003'].verdict, 'broken');
  assert.equal(by['TC-API-ORDERS-004'], undefined, 'a skip is not a run');
  assert.match(flaky.toMarkdown(rows, 'runs/flaky/orders/x'), /^\| TC-API-ORDERS-002 \| api \| 2\/3 \| 67 % \| flaky \|/m);
});

test('flaky: JUnit fallback counts each testcase as one attempt', () => {
  const xml = '<testsuite><testcase name="TC-API-ORDERS-002 — a"/><testcase name="TC-API-ORDERS-002 — a"><failure message="x"/></testcase></testsuite>';
  const [row] = flaky.stability(flaky.recordsFromJunit(xml));
  assert.equal(row.verdict, 'flaky');
  assert.equal(row.runs, 2);
});

// ---- lessons --------------------------------------------------------------------------------------------

const RUN1 = 'runs/e2e/orders/2026-10-01-0900';
const RUN2 = 'runs/e2e/orders/2026-10-02-0900';
const FAILURES = (n) => `# Failures

## TC-E2E-ORDERS-001 — scripts/e2e/orders/TC-E2E-ORDERS-001-a.spec.ts
- **Error:** \`toHaveCount(${n})\` — received ${n - 1}
- **Suspected cause:** FLAKY — passed on the immediate re-run
- flake-kind: data

## TC-E2E-ORDERS-002 — scripts/e2e/orders/TC-E2E-ORDERS-002-b.spec.ts
- **Error:** \`toHaveCount(${n + 2})\` — received ${n + 1}
- **Suspected cause:** FLAKY — passed on the immediate re-run
- flake-kind: data
`;
const LESSON = (over = {}) => {
  const fm = { id: 'LRN-SHARED-ORDER-DATA', title: 'Order counts flake when specs share seeded orders', status: 'active', confidence: 'established', applies_to: '[e2e, orders, generating-e2e-script]', evidence: `[${RUN1}/failures.md, ${RUN2}]`, probe: 'Why does an order count pass alone and fail in parallel?', created: '2026-10-02', updated: '2026-10-02', ...over };
  return `---\n${Object.entries(fm).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n# x\n\n- **Do:** create your own orders.\n- **Why:** two runs.\n`;
};

function scratch(lessons = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'qa-learn-'));
  for (const [run, n] of [[RUN1, 3], [RUN2, 7]]) {
    mkdirSync(join(dir, run), { recursive: true });
    writeFileSync(join(dir, run, 'failures.md'), FAILURES(n));
  }
  mkdirSync(join(dir, 'learnings'), { recursive: true });
  for (const [name, text] of Object.entries(lessons)) writeFileSync(join(dir, 'learnings', name), text);
  return dir;
}
const gate = (dir) => learn.checkLessons(learn.loadLessons(dir), { root: dir }).errors;

test('lessons: harvest finds repeated signals; a lesson citing the runs covers them', () => {
  const dir = scratch();
  try {
    const signals = learn.harvest(dir, { min: 2 });
    const kinds = new Set(signals.map((s) => s.signal));
    for (const k of ['recurring flake', 'flake pattern', 'recurring error']) assert.ok(kinds.has(k), `no ${k}: ${JSON.stringify(signals)}`);
    assert.ok(signals.every((s) => !s.covered));
    writeFileSync(join(dir, 'learnings', 'LRN-SHARED-ORDER-DATA.md'), LESSON());
    assert.ok(learn.harvest(dir, { min: 2 }).every((s) => s.covered));
    assert.equal(learn.harvest(dir, { min: 3 }).length, 0, 'two runs do not make a signal at min 3');
    writeFileSync(join(dir, 'learnings', 'LRN-SHARED-ORDER-DATA.md'), LESSON({ evidence: `[${RUN1}]`, confidence: 'provisional' }));
    assert.ok(learn.harvest(dir, { min: 2 }).every((s) => !s.covered), 'a lesson citing one of two runs does not cover the signal');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('lessons: a mistake back after its lesson is a repeat; at two repeat runs the lesson is proposed for promotion', () => {
  const dir = scratch({ 'LRN-SHARED-ORDER-DATA.md': LESSON() });
  const again = (run, text) => { mkdirSync(join(dir, run), { recursive: true }); writeFileSync(join(dir, run, 'failures.md'), text); };
  const row = () => learn.repeats(dir).find((r) => r.id === 'LRN-SHARED-ORDER-DATA');
  try {
    assert.deepEqual(row(), { id: 'LRN-SHARED-ORDER-DATA', repeats: 0, runs: [], promote: false }, 'the cited runs are the lesson, not repeats of it');
    again('runs/e2e/orders/2026-09-30-0900', FAILURES(4));
    assert.equal(row().repeats, 0, 'a run older than the lesson is not a repeat');
    again('runs/e2e/orders/2026-10-03-0900', FAILURES(5));
    assert.deepEqual([row().repeats, row().promote], [1, false]);
    again('runs/e2e/orders/2026-10-04-0900', '# Failures\n\n## TC-E2E-PAY-009 — x\n- **Error:** timeout\n- **Suspected cause:** SCRIPT\n');
    assert.equal(row().repeats, 1, 'an unrelated failure is not a repeat');
    again('runs/e2e/orders/2026-10-05-0900', FAILURES(9));
    assert.deepEqual([row().repeats, row().promote], [2, true]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('lessons: the gate accepts a well-formed lesson', () => {
  const dir = scratch({ 'LRN-SHARED-ORDER-DATA.md': LESSON() });
  try { assert.deepEqual(gate(dir), []); } finally { rmSync(dir, { recursive: true, force: true }); }
});

const MUST_REJECT = [
  ['established on one run', { evidence: `[${RUN1}/failures.md, ${RUN1}]` }, /established on 1 source/],
  ['evidence that does not exist', { evidence: '[runs/e2e/orders/2026-01-01-0000]', confidence: 'provisional' }, /does not exist/],
  ['no probe question mark', { probe: 'counts flake' }, /end it with "\?"/],
  ['a bad id', { id: 'lrn-x' }, /not LRN-<TOPIC>/],
  ['an unknown status', { status: 'draft' }, /active \| deprecated/],
  ['deprecated with no reason', { status: 'deprecated' }, /deprecated without/],
  ['a missing key', { applies_to: undefined }, /lacks `applies_to`/],
];
for (const [name, over, re] of MUST_REJECT) {
  test(`lessons: the gate rejects ${name}`, () => {
    const dir = scratch({ 'LRN-SHARED-ORDER-DATA.md': LESSON(over) });
    try { assert.ok(gate(dir).some((e) => re.test(e)), gate(dir).join('\n') || '(no error)'); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('lessons: a human statement may establish a lesson on one run', () => {
  const dir = scratch({ 'LRN-SHARED-ORDER-DATA.md': LESSON({ evidence: `[${RUN1}, "human: Ana — never share seeded orders"]` }) });
  try { assert.deepEqual(gate(dir), []); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('lessons: the gate rejects a near-duplicate of an active lesson', () => {
  const dir = scratch({ 'LRN-SHARED-ORDER-DATA.md': LESSON(), 'LRN-ORDER-COUNT-FLAKE.md': LESSON({ id: 'LRN-ORDER-COUNT-FLAKE' }) });
  try { assert.ok(gate(dir).some((e) => /near-duplicate/.test(e)), gate(dir).join('\n')); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('lessons: recall matches applies_to by type, module, skill and glob; deprecated ones never', () => {
  const dir = scratch({
    'LRN-SHARED-ORDER-DATA.md': LESSON(),
    'LRN-OLD.md': LESSON({ id: 'LRN-OLD', title: 'Something else entirely', probe: 'What else?', status: 'deprecated', reason: 'superseded' }),
    'LRN-API-AUTH.md': LESSON({ id: 'LRN-API-AUTH', title: 'Tokens expire mid suite', probe: 'Why 401 after ten minutes?', applies_to: '[api, generating-*]', confidence: 'provisional' }),
  });
  try {
    const ids = (q) => learn.recall(learn.loadLessons(dir), q).map((l) => l.fm.id);
    assert.deepEqual(ids({ type: 'e2e' }), ['LRN-SHARED-ORDER-DATA']);
    assert.deepEqual(ids({ module: 'orders' }), ['LRN-SHARED-ORDER-DATA']);
    assert.deepEqual(ids({ skill: 'generating-api-script' }), ['LRN-API-AUTH']);
    assert.deepEqual(ids({ type: 'mobile' }), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('lessons: recall ranks by terms matched, then established; show returns bodies by id', () => {
  const dir = scratch({
    'LRN-SHARED-ORDER-DATA.md': LESSON({ applies_to: '[e2e, orders]' }),
    'LRN-API-AUTH.md': LESSON({ id: 'LRN-API-AUTH', title: 'Tokens expire mid suite', probe: 'Why 401 after ten minutes?', applies_to: '[e2e, orders, generating-e2e-script]', confidence: 'provisional' }),
    'LRN-E2E-WAITS.md': LESSON({ id: 'LRN-E2E-WAITS', title: 'Wait on the response not the spinner', probe: 'Why does the row appear late?', applies_to: '[e2e]' }),
  });
  try {
    const lessons = learn.loadLessons(dir);
    const ids = (q) => learn.recall(lessons, q).map((l) => l.fm.id);
    assert.deepEqual(ids({ type: 'e2e', module: 'orders', skill: 'generating-e2e-script' }), ['LRN-API-AUTH', 'LRN-SHARED-ORDER-DATA', 'LRN-E2E-WAITS'], 'three terms beat two beat one, whatever the confidence');
    assert.deepEqual(ids({ type: 'e2e' }), ['LRN-E2E-WAITS', 'LRN-SHARED-ORDER-DATA', 'LRN-API-AUTH'], 'on a tie, established first, then id');
    const { found, missing } = learn.show(lessons, ['LRN-E2E-WAITS', 'LRN-NOPE']);
    assert.deepEqual(found.map((l) => l.fm.id), ['LRN-E2E-WAITS']);
    assert.deepEqual(missing, ['LRN-NOPE']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
