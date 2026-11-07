// import-suite.test.mjs — qa:import takes stock of a suite that existed before stlc (CONTRACTS §29).
// It must read each tool's export by header name, fold step rows into their case, find duplicates
// without merging distinct cases, and link a script to a case only on real evidence: an ADO id is a
// bare number, and a bare number alone is every line number in the repo.
// Run: node --test "tests/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// Script runs in tests are not usage: keep them out of the run log (lib/runlog.mjs).
process.env.QA_RUN_LOG = 'off';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = await import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'import-suite.mjs')).href);

// Xray/TestRail style: one row per step, the case's own columns only on its first row.
const XRAY = [
  'Issue Key,Summary,Component,Priority,Action,Expected Result',
  'BILL-101,Refund a paid invoice,billing,High,Open the invoice,"The invoice shows ""Paid"""',
  ',,,,Click Refund,The status becomes Refunded',
  'BILL-102,Refund a paid invoice,billing,High,Open the invoice,"The invoice shows ""Paid"""',
  ',,,,Click Refund,The status becomes Refunded',
  'BILL-103,Export invoices to CSV,billing,Low,Click Export,works as expected',
  'BILL-104,Login with a locked account,auth,High,"Enter the user name\nand the password",',
].join('\r\n');

// ADO style JSON: numeric ids, steps as an array.
const ADO = JSON.stringify({ value: [
  { ID: 48211, Title: 'Create an order with two lines', 'Area Path': 'Shop\\Orders', Steps: [{ action: 'Add two lines', expected: 'Total is 30.00' }] },
  { ID: 48212, Title: 'Create an order with two line items', 'Area Path': 'Shop\\Orders', Steps: [{ action: 'Add two lines', expected: 'Total is 30.00' }] },
] });

test('csv: quotes, doubled quotes, newlines inside quotes and CRLF', () => {
  const rows = imp.parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\r\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"\nthere']]);
});

test('columns are found by header name, whatever the tool calls them', () => {
  const cols = imp.mapColumns(['Issue Key', 'Summary', 'Component', 'Action', 'Expected Result']);
  assert.equal(cols.id, 'Issue Key');
  assert.equal(cols.title, 'Summary');
  assert.equal(cols.module, 'Component');
  assert.equal(cols.step, 'Action');
  assert.equal(cols.expected, 'Expected Result');
  assert.equal(cols.priority, null);
  // Azure DevOps: "Test Step" is the step number, "Step Action" the text.
  const ado = imp.mapColumns(['ID', 'Title', 'Area Path', 'Test Step', 'Step Action', 'Step Expected']);
  assert.deepEqual([ado.module, ado.step, ado.expected], ['Area Path', 'Step Action', 'Step Expected']);
});

test('step rows fold into the case above; a case keeps its own id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'imp-'));
  try {
    writeFileSync(join(dir, 'x.csv'), XRAY);
    const { cases } = imp.toCases('jira', imp.readRecords(join(dir, 'x.csv')));
    assert.deepEqual(cases.map((c) => c.id), ['BILL-101', 'BILL-102', 'BILL-103', 'BILL-104']);
    assert.equal(cases[0].steps.length, 2);
    assert.equal(cases[0].steps[0].expected, 'The invoice shows "Paid"');
    assert.equal(cases[3].steps[0].action, 'Enter the user name\nand the password');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('quality flags: a missing Expected and a vague one are flagged, a good case is not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'imp-'));
  try {
    writeFileSync(join(dir, 'x.csv'), XRAY);
    const { cases } = imp.toCases('jira', imp.readRecords(join(dir, 'x.csv')));
    const flags = Object.fromEntries(cases.map((c) => [c.id, imp.flagsOf(c, true)]));
    assert.deepEqual(flags['BILL-101'], []);
    assert.ok(flags['BILL-103'].some((f) => f.startsWith('vague-expected')));
    assert.ok(flags['BILL-104'].includes('step-without-expected'));
    assert.ok(imp.flagsOf({ title: '', steps: [] }, true).includes('no-steps'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('duplicates: same title and steps is exact; close wording is near; distinct cases stay apart', () => {
  const mk = (id, title, action, module = 'm') => ({ id, title, module, steps: [{ action, expected: 'ok' }] });
  const d = imp.findDuplicates([
    mk('A', 'Refund a paid invoice', 'Open the invoice and click refund'),
    mk('B', 'refund a PAID invoice!', 'open the invoice and click refund'),
    mk('C', 'Create an order with two lines from the cart', 'Add two lines to the cart'),
    mk('D', 'Create an order with two lines from cart', 'Add two lines to the cart'),
    mk('E', 'Delete a customer with open orders', 'Delete the customer'),
    // Shares most words with C and D but is a different scenario: one line, not two.
    mk('F', 'Create an order with one line from the cart', 'Add one line to the cart'),
  ]);
  assert.deepEqual(d.exact, [{ id: 'B', dupOf: 'A' }]);
  assert.deepEqual(d.near.map((n) => [n.a, n.b]), [['C', 'D']]);
});

test('script links: a key, a TestRail C-id, a labelled ADO id and an exact title link; a bare number does not', () => {
  const cases = [
    { id: 'BILL-101', idFromSource: true, title: 'Refund a paid invoice', steps: [] },
    { id: 'C2041', idFromSource: true, title: 'Export to CSV', steps: [] },
    { id: '48211', idFromSource: true, title: 'Create an order', steps: [] },
    { id: 'jira#9', idFromSource: false, title: 'Login with a locked account', steps: [] },
  ];
  const files = {
    'a.spec.ts': "test('BILL-101 refund', async () => {});",
    'b.spec.ts': "// TestRail C2041\ntest('export', () => {});",
    'c.spec.ts': "test.info().annotations.push({ type: 'TestCase', description: '48211' }); // TestCase: 48211",
    'd_test.py': 'def test_login_with_a_locked_account():\n    pass',
    'e.spec.ts': "expect(total).toBe(48211); await page.waitForTimeout(48211);",
  };
  const { orphans } = imp.linkScripts(cases, Object.keys(files), (p) => files[p]);
  assert.deepEqual(cases.map((c) => c.scripts ?? []), [['a.spec.ts'], ['b.spec.ts'], ['c.spec.ts'], ['d_test.py']]);
  assert.deepEqual(orphans, ['e.spec.ts'], 'a bare number in code is not a case reference');
});

test('qa:import end to end: two sources, scripts, the inventory and a report with every heading in order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'imp-'));
  try {
    mkdirSync(join(dir, 'exports'));
    mkdirSync(join(dir, 'legacy', 'tests'), { recursive: true });
    writeFileSync(join(dir, 'exports', 'jira.csv'), XRAY);
    writeFileSync(join(dir, 'exports', 'ado.json'), ADO);
    // Names the duplicate BILL-102: the link must land on BILL-101, the case that is kept.
    writeFileSync(join(dir, 'legacy', 'tests', 'refund.spec.ts'), "test('BILL-102 refund', () => {});");
    writeFileSync(join(dir, 'legacy', 'tests', 'misc.spec.ts'), "test('something unrelated', () => {});");
    process.env.QA_LINT_TODAY = '2026-10-27';
    const out = imp.run(['--source', 'jira=exports/jira.csv', '--source', 'ado=exports/ado.json', '--scripts', 'legacy', '--json'], dir);
    const s = JSON.parse(out);
    assert.equal(s.cases, 6);
    assert.equal(s.exact, 1);
    assert.equal(s.near, 1);
    assert.equal(s.linked, 1);
    assert.equal(s.orphans, 1);
    const inv = readFileSync(join(dir, 'imported', 'inventory.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(inv.length, 6);
    assert.equal(inv.find((c) => c.id === '48211').module, 'Shop\\Orders');
    const report = readFileSync(join(dir, 'reports', 'import', '2026-10-27-import.md'), 'utf8');
    const heads = ['## Summary', '## By source', '## By module', '## Duplicates', '## Step quality', '## Automation links', '## Orphan scripts', '## Next steps'];
    let last = -1;
    for (const h of heads) { const i = report.indexOf(`\n${h}\n`); assert.ok(i > last, `${h} missing or out of order`); last = i; }
    assert.match(report, /\| BILL-102 \| BILL-101 \| exact \|/);
    assert.match(report, /\| BILL-101 \| `legacy\/tests\/refund\.spec\.ts` \|/);
    assert.match(report, /`legacy\/tests\/misc\.spec\.ts`/);
  } finally { delete process.env.QA_LINT_TODAY; rmSync(dir, { recursive: true, force: true }); }
});

test('qa:import refuses what it cannot read instead of reporting an empty suite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'imp-'));
  try {
    writeFileSync(join(dir, 'bad.csv'), 'Foo,Bar\n1,2\n');
    assert.throws(() => imp.run([], dir), /no --source/);
    assert.throws(() => imp.run(['--source', 'x=missing.csv'], dir), /does not exist/);
    assert.throws(() => imp.run(['--source', 'x=bad.csv'], dir), /no id or title column/);
    assert.throws(() => imp.run(['--source', 'Bad Name=bad.csv'], dir), /lowercase-kebab/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
