// pr-scan.test.mjs — the testing-PR scanner (/qa-review-pr) against a scratch git repository:
// a clean test PR must scan quiet, and each seeded defect must raise its own finding. A rule that
// cannot fail here is a rule nobody can trust in a review. Run: node --test "tests/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// Script runs in tests are not usage: keep them out of the run log (lib/runlog.mjs).
process.env.QA_RUN_LOG = 'off';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { scan } = await import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'pr-scan.mjs')).href);
const { parseDoc } = await import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'lib', 'doc.mjs')).href);

const CASE = 'qa/cases/api/orders/TC-API-ORDERS-001-create-order.md';
const SPEC = 'qa/scripts/api/orders/TC-API-ORDERS-001-create-order.spec.ts';
const CASE_BODY = [
  '# TC-API-ORDERS-001 — [Orders · API] Create order — Buyer creates an order → 201 with the order',
  '',
  '**Feature:** orders',
  '**Tags:** @api @p1',
  '',
  '## Objective', 'A buyer can create an order.', '',
  '## Technique', '- equivalence-partitioning → positive', '',
  '## Isolation', 'creates: order · cleans: order · actor: pool · lock: none', '',
  '## Preconditions', '[DATA:sku-active]', '',
  '## Steps', '1. POST /orders with sku A1 → 201', '2. GET the order → sku A1', '',
  '## Expected Result', 'The order exists with sku A1.', '',
  '## Data', 'sku A1', '',
].join('\n');
const SPEC_BODY = [
  "import { test, expect } from '../../shared/fixtures';",
  "test('TC-API-ORDERS-001', async ({ as }) => {",
  "  await test.step('Step 1: create', async () => {",
  "    const res = await as('buyer').post('/orders', { data: { sku: 'A1' } });",
  '    expect(res.status()).toBe(201);',
  '  });',
  "  await test.step('Step 2: read back', async () => {",
  "    expect((await (await as('buyer').get('/orders/1')).json()).sku).toBe('A1');",
  '  });',
  '});',
  '',
].join('\n');

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'qa-prscan-'));
  const sh = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  const put = (p, t) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), t); };
  sh('init', '-q', '-b', 'main');
  sh('config', 'user.email', 'qa@example.test');
  sh('config', 'user.name', 'QA');
  sh('config', 'core.autocrlf', 'false');
  put(CASE, CASE_BODY);
  put(SPEC, SPEC_BODY);
  put('qa/playwright.config.ts', 'export default { retries: 0, failOnFlakyTests: true };\n');
  put('qa/scripts/shared/meta.ts', 'export const meta = 1;\n');
  put('src/app.ts', 'export const app = 1;\n');
  sh('add', '-A');
  sh('commit', '-qm', 'base');
  sh('checkout', '-qb', 'feature');
  const commit = (msg = 'test(orders): change the orders cases') => { sh('add', '-A'); sh('commit', '-qm', msg, '--allow-empty'); };
  return { dir, put, sh, commit, rm: (p) => unlinkSync(join(dir, p)), done: () => rmSync(dir, { recursive: true, force: true }) };
}
const ids = (r) => r.findings.map((f) => f.id);
const run = (r) => scan({ base: 'main', head: 'HEAD', cwd: r.dir });

test('a clean test PR (a new case with its mirrored script) scans quiet', () => {
  const r = repo();
  try {
    r.put('qa/cases/api/orders/TC-API-ORDERS-002-reject-empty-sku.md', CASE_BODY.replace(/001/g, '002'));
    r.put('qa/scripts/api/orders/TC-API-ORDERS-002-reject-empty-sku.spec.ts', SPEC_BODY.replace(/001/g, '002'));
    r.commit();
    const s = run(r);
    assert.deepEqual(ids(s), []);
    assert.equal(s.cases.added, 1);
    assert.equal(s.scripts.added, 1);
  } finally { r.done(); }
});

test('assertions removed from a spec are High, even when the file still passes', () => {
  const r = repo();
  try {
    const weakened = SPEC_BODY.replace(/^.*\.sku\)\.toBe\('A1'\);\n/m, '');
    assert.notEqual(weakened, SPEC_BODY, 'the fixture lost its read-back assertion line');
    r.put(SPEC, weakened);
    r.commit();
    const f = run(r).findings.find((x) => x.id === 'QPR-ASSERT-LOST');
    assert.ok(f, 'QPR-ASSERT-LOST not raised');
    assert.equal(f.severity, 'High');
  } finally { r.done(); }
});

test('test.only, an unconditional skip, a sleep, force, networkidle and a weak assertion are each caught', () => {
  const r = repo();
  try {
    r.put(SPEC, SPEC_BODY + [
      "test.only('x', async () => { expect(1).toBe(1); });",
      "test.skip('y', async () => { expect(1).toBe(1); });",
      "test('z', async ({ page }) => { await page.waitForTimeout(500); await page.click('#a', { force: true }); await page.waitForLoadState('networkidle'); expect(page).toBeTruthy(); });",
      '',
    ].join('\n'));
    r.commit();
    const got = ids(run(r));
    for (const id of ['QPR-ONLY', 'QPR-SKIP', 'QPR-SLEEP', 'QPR-FORCE', 'QPR-NETWORKIDLE', 'QPR-WEAK-ASSERT']) assert.ok(got.includes(id), `${id} not raised (got ${got.join(', ')})`);
  } finally { r.done(); }
});

test('a conditional skip with a reason is the honest-gap idiom, not a finding', () => {
  const r = repo();
  try {
    r.put(SPEC, SPEC_BODY + "test.skip(!process.env.DB_CONNECTION, 'no database in this environment');\n");
    r.commit();
    assert.ok(!ids(run(r)).includes('QPR-SKIP'));
  } finally { r.done(); }
});

test('a script with no case, and a case deleted under a live script, are both caught', () => {
  const r = repo();
  try {
    r.put('qa/scripts/api/orders/TC-API-ORDERS-009-orphan.spec.ts', SPEC_BODY.replace(/001/g, '009'));
    r.rm(CASE);
    r.commit();
    const got = ids(run(r));
    assert.ok(got.includes('QPR-NO-CASE'));
    assert.ok(got.includes('QPR-ORPHAN-SCRIPT'));
  } finally { r.done(); }
});

test('a Case ID that already belonged to another case on the base is reported for renumbering', () => {
  const r = repo();
  try {
    r.put('qa/cases/api/orders/TC-API-ORDERS-001-cancel-order.md', CASE_BODY.replace('Create', 'Cancel'));
    r.commit();
    const got = ids(run(r));
    assert.ok(got.includes('QPR-ID-REUSED'));
    assert.ok(got.includes('QPR-DUP-ID'));
  } finally { r.done(); }
});

test('a hand-added quarantine tag, a shipped kit edit and a loosened runner are caught', () => {
  const r = repo();
  try {
    r.put(CASE, CASE_BODY.replace('@api @p1', '@api @p1 @quarantined:2026-12-01'));
    r.put('qa/scripts/shared/meta.ts', 'export const meta = 2;\n');
    r.put('qa/playwright.config.ts', 'export default { retries: 2, failOnFlakyTests: true };\n');
    r.commit();
    const got = ids(run(r));
    for (const id of ['QPR-QUARANTINE-TAG', 'QPR-KIT-EDIT', 'QPR-CONFIG-LOOSENED']) assert.ok(got.includes(id), `${id} not raised`);
  } finally { r.done(); }
});

test('a case edited after a review hashed it makes that review STALE; an unchanged hash does not', () => {
  const r = repo();
  try {
    const hash = parseDoc(CASE_BODY).bodyHash;
    r.put('qa/reviews/orders/2026-09-05-case-review.md', `---\nslug: orders\ndate: 2026-09-05\nverdict: READY FOR /qa-script\nreviewed:\n  - path: ${CASE}\n    sha256: ${hash}\n---\n\n# Case review\n`);
    r.commit();
    assert.ok(!ids(run(r)).includes('QPR-REVIEW-STALE'), 'an untouched case reported stale');
    r.put(CASE, CASE_BODY + '2. GET /orders/{id}\n');
    r.commit();
    assert.ok(ids(run(r)).includes('QPR-REVIEW-STALE'));
  } finally { r.done(); }
});

test('application code in a test PR, and an .env file, are flagged', () => {
  const r = repo();
  try {
    r.put('src/app.ts', 'export const app = 2;\n');
    r.put('qa/.env.uat', 'BASE_URL=x\n');
    r.commit();
    const got = ids(run(r));
    assert.ok(got.includes('QPR-APP-CODE'));
    assert.ok(got.includes('QPR-ENV'));
  } finally { r.done(); }
});

// ---- "does not break" and "right format" -------------------------------------------------------

test('a case in the wrong format is caught: H1, title shape, missing sections, no priority', () => {
  const r = repo();
  try {
    r.put('qa/cases/api/orders/TC-API-ORDERS-002-bad.md', '# TC-API-ORDERS-002 orders thing\n\n**Tags:** @api\n\n## Steps\n1. do it\n');
    r.put('qa/scripts/api/orders/TC-API-ORDERS-002-bad.spec.ts', SPEC_BODY.replace(/001/g, '002'));
    r.commit();
    const got = ids(run(r));
    for (const id of ['QPR-CASE-H1', 'QPR-CASE-SECTIONS', 'QPR-CASE-PRIORITY']) assert.ok(got.includes(id), `${id} not raised (got ${got.join(', ')})`);
    r.put('qa/cases/api/orders/TC-API-ORDERS-002-bad.md', CASE_BODY.replace(/001/g, '002').replace('[Orders · API] Create order — Buyer creates an order → 201 with the order', 'Create an order'));
    r.commit();
    assert.ok(ids(run(r)).includes('QPR-CASE-TITLE'));
  } finally { r.done(); }
});

test('a script whose test.step count no longer matches its case is caught', () => {
  const r = repo();
  try {
    r.put(CASE, CASE_BODY.replace('2. GET the order → sku A1\n', '2. GET the order → sku A1\n3. DELETE the order → 204\n'));
    r.commit();
    assert.ok(ids(run(r)).includes('QPR-STEP-MISMATCH'));
  } finally { r.done(); }
});

test('removing a shared export another spec still imports is High', () => {
  const r = repo();
  try {
    r.put('qa/scripts/shared/data/unique.ts', 'export function uniqueName(p: string) { return p; }\n');
    r.put(SPEC, `import { uniqueName } from '../../shared/data/unique';\n${SPEC_BODY}`);
    r.commit('test(orders): add uniqueName');
    r.sh('checkout', '-q', 'main');
    r.sh('merge', '-q', '--ff-only', 'feature');
    r.sh('checkout', '-q', 'feature');
    r.put('qa/scripts/shared/data/unique.ts', 'export function makeName(p: string) { return p; }\n');
    r.commit();
    const f = run(r).findings.find((x) => x.id === 'QPR-EXPORT-REMOVED');
    assert.equal(f?.severity, 'High', JSON.stringify(f));
    assert.match(f.message, /uniqueName/);
  } finally { r.done(); }
});

test('a test branch that will not merge, and wip / non-conventional commits, are caught', () => {
  const r = repo();
  try {
    r.put(SPEC, SPEC_BODY.replace("sku: 'A1'", "sku: 'B2'"));
    r.commit('wip');
    r.put(CASE, CASE_BODY + '\nnote\n');
    r.commit('Updated cases');
    r.sh('checkout', '-q', 'main');
    r.put(SPEC, SPEC_BODY.replace("sku: 'A1'", "sku: 'C3'"));
    r.commit('test(orders): change the sku on main');
    r.sh('checkout', '-q', 'feature');
    const s = scan({ base: 'main', head: 'HEAD', cwd: r.dir, branch: 'my_branch' });
    for (const id of ['QPR-CONFLICTS', 'QPR-BEHIND', 'QPR-COMMIT-WIP', 'QPR-COMMIT-FORMAT', 'QPR-BRANCH-NAME']) assert.ok(ids(s).includes(id), `${id} not raised (got ${ids(s).join(', ')})`);
  } finally { r.done(); }
});

// ---- the QA root (CONTRACTS §2): .stlc/ by default, qa/ kept ------------------------------------

test('a .stlc/ project scans like a qa/ one: its cases, scripts, kit, .env and a review that still records qa/ paths', () => {
  const r = repo();
  try {
    r.sh('mv', 'qa', '.stlc');
    r.commit('chore(qa): move the QA root to .stlc');
    r.sh('checkout', '-q', 'main');
    r.sh('merge', '-q', '--ff-only', 'feature');
    r.sh('checkout', '-qb', 'feature-2');
    const S = (p) => p.replace(/^qa\//, '.stlc/');
    // A review written before the move: its path still says qa/ (§2 — both prefixes name the root).
    r.put('.stlc/reviews/orders/2026-09-05-case-review.md', `---\nslug: orders\ndate: 2026-09-05\nverdict: READY FOR /qa-script\nreviewed:\n  - path: ${CASE}\n    sha256: ${parseDoc(CASE_BODY).bodyHash}\n---\n\n# Case review\n`);
    r.commit();
    r.sh('checkout', '-q', 'main');
    r.sh('merge', '-q', '--ff-only', 'feature-2');
    r.sh('checkout', '-qb', 'feature-3');
    r.put(S(CASE), CASE_BODY + '2. GET /orders/{id}\n');
    r.put('.stlc/scripts/api/orders/TC-API-ORDERS-009-orphan.spec.ts', SPEC_BODY.replace(/001/g, '009'));
    r.put('.stlc/scripts/shared/meta.ts', 'export const meta = 2;\n');
    r.put('.stlc/.env.uat', 'BASE_URL=x\n');
    r.commit();
    const s = run(r);
    const got = ids(s);
    for (const id of ['QPR-REVIEW-STALE', 'QPR-NO-CASE', 'QPR-KIT-EDIT', 'QPR-ENV']) assert.ok(got.includes(id), `${id} not raised under .stlc/ (got ${got.join(', ')})`);
    assert.ok(!got.includes('QPR-APP-CODE'), '.stlc/ files are QA files, not application code');
    assert.equal(s.root, '.stlc');
    assert.equal(s.cases.changed, 1);
  } finally { r.done(); }
});
