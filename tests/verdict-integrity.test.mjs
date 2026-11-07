// verdict-integrity.test.mjs — CONTRACTS §31. A verdict is a claim about one system; each rule here
// catches one way it stops being true while every check around it stays green. Every rule is shown
// failing on its shape and passing on the honest one.
// Run: node --test "tests/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
process.env.QA_RUN_LOG = 'off';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED = join(ROOT, 'workspace', 'qa', 'scripts', 'shared');
const T = await import(pathToFileURL(join(SHARED, 'lib', 'target.mjs')).href);
const I = await import(pathToFileURL(join(SHARED, 'lib', 'integrity.mjs')).href);
const D = await import(pathToFileURL(join(SHARED, 'delta.mjs')).href);
const guard = await import(pathToFileURL(join(SHARED, 'heal-guard.mjs')).href);

const PROFILE = (rows) => `# Profile\n\n## Environments\n\n| Env | Purpose |\n|---|---|\n| uat | runs |\n\n### Target identity\n\n| Env | Component | Kind | Probe | Read | Expect |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n\nCredentials live elsewhere.\n\n### Something else\n\n| A | B |\n|---|---|\n| x | y |\n`;

// ── declarations ──────────────────────────────────────────────────────────────────────────────────
test('target rows: only the one table, filtered by env, * applies everywhere', () => {
  const text = PROFILE(['| uat | api | code | GET ${API_URL}/version | json:commit | shipped-sha |', '| * | flags | config | FILE flags.json | sha256 | recorded |', '| prod | api | code | GET x | raw | recorded |']);
  assert.equal(T.targetRows(text).length, 3, 'the later sub-section table never joins');
  assert.deepEqual(T.declaredProbes(text, 'uat').map((r) => r.component), ['api', 'flags']);
  assert.deepEqual(T.declaredProbes(text, 'prod').map((r) => r.component), ['flags', 'api']);
  assert.deepEqual(T.declarationErrors(T.targetRows(text)[0]), []);
});

test('target rows: every malformed cell is named', () => {
  const [row] = T.targetRows(PROFILE(['| uat | api | build | POST /x | xpath:/a | always |']));
  const e = T.declarationErrors(row).join(' ');
  for (const want of ['Kind `build`', 'Probe `POST /x`', 'Read `xpath:/a`', 'Expect `always`']) assert.match(e, new RegExp(want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

// ── reading an identity: a value or an error, never a guess ───────────────────────────────────────
test('extract: json path, regex, raw, sha256 — and empty is an error, not an identity', () => {
  assert.deepEqual(T.extract('{"build":{"commit":"9f8e7d6a"}}', 'json:build.commit'), { value: '9f8e7d6a' });
  assert.deepEqual(T.extract('{"commit":""}', 'json:commit'), { error: 'commit is empty' });
  assert.match(T.extract('<html>', 'json:commit').error, /not JSON/);
  assert.match(T.extract('{"a":1}', 'json:commit').error, /no commit/);
  assert.deepEqual(T.extract('<meta name="build" content="2.4.1+9f8e7d6">', 'regex:content="([^"]+)"'), { value: '2.4.1+9f8e7d6' });
  assert.match(T.extract('nothing', 'regex:v(\\d+)').error, /did not match/);
  assert.deepEqual(T.extract('  v1.2.3\nsecond', 'raw'), { value: 'v1.2.3' });
  assert.match(T.extract('   ', 'raw').error, /empty/);
  const a = T.extract('{"x":1}\r\n', 'sha256'), b = T.extract('{"x":1}\n', 'sha256');
  assert.equal(a.value, b.value, 'line endings do not change a config identity');
  assert.notEqual(T.extract('{"x":2}\n', 'sha256').value, a.value);
});

test('sameIdentity: commit prefixes, commits inside versions, everything else exact', () => {
  assert.ok(T.sameIdentity('8556e8f0c1d2', '8556e8f'));
  assert.ok(T.sameIdentity('8556E8F', '8556e8f0c1'));
  assert.ok(!T.sameIdentity('8556e8f', '8556e80'));
  assert.ok(T.sameIdentity('2.4.1+9f8e7d6a', '9f8e7d6'), 'a version string that carries the commit');
  assert.ok(!T.sameIdentity('2.4.1+1111111', '9f8e7d6'));
  assert.ok(T.sameIdentity('1.188.0 (4021)', '1.188.0 (4021)'));
  assert.ok(!T.sameIdentity('1.188.0', '1.188'));
  assert.ok(!T.sameIdentity(null, '8556e8f'));
});

test('run verdict: the wrong system stops the run; an unreadable pin cannot vouch', () => {
  const c = (status, expected = 'x') => ({ status, expected });
  assert.equal(T.runVerdict([]), 'UNVERIFIED', 'nothing declared — nothing can say which system');
  assert.equal(T.runVerdict([c('MATCH'), c('MISMATCH')]), 'NOT_DEPLOYED');
  assert.equal(T.runVerdict([c('MATCH'), c('UNREAD')]), 'UNVERIFIED');
  assert.equal(T.runVerdict([c('MATCH'), c('RECORDED', null)]), 'MATCH');
  assert.equal(T.runVerdict([c('RECORDED', null)]), 'UNPINNED');
  assert.equal(T.runVerdict([c('RECORDED', null), c('UNREAD', null)]), 'UNVERIFIED');
  assert.equal(T.componentStatus({ observed: 'a', expected: null }), 'RECORDED');
  assert.equal(T.componentStatus({ observed: null, error: 'x', expected: 'a' }), 'UNREAD');
});

test('expected: --expect wins, then the plan commit for shipped-sha rows only', () => {
  const row = { component: 'api', expect: 'shipped-sha' };
  assert.equal(T.expectedFor(row, { shippedSha: 'abc1234' }), 'abc1234');
  assert.equal(T.expectedFor(row, { shippedSha: 'abc1234', overrides: { api: 'def5678' } }), 'def5678');
  assert.equal(T.expectedFor({ component: 'flags', expect: 'recorded' }, { shippedSha: 'abc1234' }), null);
  assert.equal(T.expectedFor(row, { shippedSha: '—' }), null);
  assert.equal(T.shippedShaOf('**Change type:** x **Shipped SHA:** 8556e8f **Analysis:**'), '8556e8f');
  assert.equal(T.shippedShaOf('**Shipped SHA:** —'), null);
});

test('identity diff: an absent or unread side is unknown, never "same"', () => {
  const a = { components: [{ component: 'api', kind: 'code', observed: 'aaaaaaa', status: 'MATCH' }, { component: 'flags', kind: 'config', observed: 'f1', status: 'RECORDED' }] };
  const b = { components: [{ component: 'api', kind: 'code', observed: 'aaaaaaa1', status: 'MATCH' }, { component: 'flags', kind: 'config', observed: 'f2', status: 'RECORDED' }, { component: 'db', kind: 'schema', observed: null, status: 'UNREAD' }] };
  const d = Object.fromEntries(T.identityDiff(a, b).map((x) => [x.component, x.change]));
  assert.deepEqual(d, { api: 'same', flags: 'changed', db: 'unknown' });
  assert.deepEqual(T.identityDiff(null, null), []);
});

// ── qa:target against a real HTTP server, a file and a command ────────────────────────────────────
function run(args, { cwd, env = {} }) {
  return new Promise((res) => {
    const p = spawn(process.execPath, [join(SHARED, 'target.mjs'), ...args], { cwd, env: { ...process.env, QA_RUN_LOG: 'off', ...env } });
    let out = '', errOut = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (errOut += d));
    p.on('close', (code) => res({ code, out, err: errOut }));
  });
}

test('qa:target: MATCH, NOT_DEPLOYED, UNVERIFIED — and target.json says which system', async () => {
  let commit = '8556e8f0c1d2e3';
  let status = 200;
  const server = createServer((req, res) => {
    if (req.url === '/version') { res.writeHead(status, { 'content-type': 'application/json', 'x-build': '4021' }); res.end(JSON.stringify({ commit })); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), 'qa-target-'));
  try {
    mkdirSync(join(dir, 'plans', 'orders'), { recursive: true });
    writeFileSync(join(dir, 'plans', 'orders', '2026-09-01-test-plan.md'), '# Plan\n**Change type:** feature **Shipped SHA:** 8556e8f **Analysis:** x\n');
    writeFileSync(join(dir, '.env.uat'), `API_URL=${url}\n`);
    writeFileSync(join(dir, 'flags.json'), '{"newCheckout":true}\n');
    const profile = join(dir, 'PROFILE.md');
    writeFileSync(profile, PROFILE([
      '| uat | api | code | GET ${API_URL}/version | json:commit | shipped-sha |',
      '| uat | client | client | HEADER ${API_URL}/version x-build | raw | recorded |',
      '| * | flags | config | FILE flags.json | sha256 | recorded |',
      `| uat | schema | schema | CMD node -e "console.log('migration 0042')" | regex:migration (\\d+) | recorded |`,
    ]));
    const env = { QA_PROFILE: profile, QA_TARGET_TIMEOUT_MS: '3000' };
    const out = join(dir, 'runs', 'e2e', 'orders', '2026-09-10-1005');

    let r = await run(['--env', 'uat', '--plan', 'orders', '--out', out], { cwd: dir, env });
    assert.equal(r.code, 0, r.out + r.err);
    const t = JSON.parse(readFileSync(join(out, 'target.json'), 'utf8'));
    assert.equal(t.verdict, 'MATCH');
    assert.equal(t.shipped_sha, '8556e8f');
    const by = Object.fromEntries(t.components.map((c) => [c.component, c]));
    assert.equal(by.api.status, 'MATCH');
    assert.equal(by.client.observed, '4021');
    assert.equal(by.schema.observed, '0042');
    assert.match(by.flags.observed, /^[0-9a-f]{16}$/);
    assert.ok(by.api.origin && !JSON.stringify(t).includes('127.0.0.1'), 'the host is a hash, never its name');

    commit = '1111111aaaa';
    r = await run(['--env', 'uat', '--plan', 'orders'], { cwd: dir, env });
    assert.equal(r.code, 1, 'a different build is NOT_DEPLOYED');
    assert.match(r.out, /NOT_DEPLOYED/);

    status = 503;
    r = await run(['--env', 'uat', '--plan', 'orders'], { cwd: dir, env });
    assert.equal(r.code, 2, 'an unreadable pinned component is UNVERIFIED, never MATCH');
    assert.match(r.out, /UNREAD\s+api.*HTTP 503/);

    status = 200; commit = '8556e8f0c1d2e3';
    r = await run(['--env', 'uat'], { cwd: dir, env });
    assert.equal(r.code, 0);
    assert.match(r.out, /UNPINNED/, 'no plan, no --expect: recorded only');

    r = await run(['--env', 'uat', '--expect', 'api=8556e8f', '--expect', 'cdn=abc'], { cwd: dir, env });
    assert.equal(r.code, 2, 'an expectation with no probe cannot be verified');

    writeFileSync(join(dir, '.env.uat'), '');
    r = await run(['--env', 'uat', '--plan', 'orders'], { cwd: dir, env });
    assert.equal(r.code, 2);
    assert.match(r.out, /API_URL not set/);

    writeFileSync(profile, PROFILE(['| uat | api | build | GET x | raw | recorded |']));
    r = await run(['--env', 'uat'], { cwd: dir, env });
    assert.equal(r.code, 3, 'a malformed declaration is refused, not half-probed');

    writeFileSync(profile, '# no table\n');
    r = await run(['--env', 'uat'], { cwd: dir, env });
    assert.equal(r.code, 2, 'no declaration — UNVERIFIED');
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── qa:delta ──────────────────────────────────────────────────────────────────────────────────────
test('delta classes: new, known, fixed, flaky, gone', () => {
  const m = (o) => new Map(Object.entries(o));
  const rows = D.compare(
    m({ A: { pass: 0, fail: 1, skip: 0 }, B: { pass: 0, fail: 1, skip: 0 }, C: { pass: 1, fail: 0, skip: 0 }, E: { pass: 1, fail: 1, skip: 0 }, F: { pass: 1, fail: 0, skip: 0 }, G: { pass: 0, fail: 0, skip: 1 }, H: { pass: 1, fail: 0, skip: 0 } }),
    m({ A: { pass: 1, fail: 0, skip: 0 }, B: { pass: 0, fail: 1, skip: 0 }, C: { pass: 0, fail: 1, skip: 0 }, D: { pass: 1, fail: 0, skip: 0 }, E: { pass: 1, fail: 0, skip: 0 }, G: { pass: 1, fail: 0, skip: 0 }, H: { pass: 1, fail: 0, skip: 0 } }),
  );
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.id, r.class])), { A: 'NEW-FAIL', B: 'STILL-FAILING', C: 'FIXED', D: 'GONE', E: 'FLAKY', F: 'NEW', G: 'SKIPPED', H: 'STEADY' });
});

test('delta hints: an unchanged system points away from the product', () => {
  const same = [{ component: 'api', kind: 'code', change: 'same' }, { component: 'flags', kind: 'config', change: 'same' }];
  const cfg = [{ component: 'api', kind: 'code', change: 'same' }, { component: 'flags', kind: 'config', change: 'changed' }];
  assert.match(D.hint('NEW-FAIL', same), /did not change.*test, its data or the environment/);
  assert.match(D.hint('FIXED', same), /not a fix/);
  assert.match(D.hint('NEW-FAIL', cfg), /flags \[config\]/);
  assert.match(D.hint('NEW-FAIL', []), /unknown/);
  assert.match(D.hint('NEW-FAIL', [{ component: 'api', kind: 'code', change: 'unknown' }]), /unknown/);
  assert.equal(D.hint('STEADY', same), null);
});

test('qa:delta CLI: finds the previous run, reads junit + target.json, writes delta.md', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-delta-'));
  try {
    const junit = (cases) => `<testsuites>${cases.map(([id, ok]) => `<testcase name="${id} — t">${ok ? '' : '<failure message="x"/>'}</testcase>`).join('')}</testsuites>`;
    const tj = (sha) => JSON.stringify({ verdict: 'UNPINNED', components: [{ component: 'api', kind: 'code', observed: sha, status: 'RECORDED' }] });
    const a = join(dir, 'runs', 'api', 'orders', '2026-09-10-1000'), b = join(dir, 'runs', 'api', 'orders', '2026-09-11-0900');
    mkdirSync(a, { recursive: true }); mkdirSync(b, { recursive: true });
    writeFileSync(join(a, 'junit.xml'), junit([['TC-API-ORDERS-001', true], ['TC-API-ORDERS-002', false]]));
    writeFileSync(join(b, 'junit.xml'), junit([['TC-API-ORDERS-001', false], ['TC-API-ORDERS-002', true]]));
    writeFileSync(join(a, 'target.json'), tj('aaaaaaa'));
    writeFileSync(join(b, 'target.json'), tj('aaaaaaa'));
    assert.equal(D.previousRun(b), a);
    const code = await new Promise((res) => spawn(process.execPath, [join(SHARED, 'delta.mjs'), b], { env: { ...process.env, QA_RUN_LOG: 'off' }, stdio: 'ignore' }).on('close', res));
    assert.equal(code, 0);
    const md = readFileSync(join(b, 'delta.md'), 'utf8');
    assert.match(md, /NEW-FAIL 1 · STILL-FAILING 0 · FLAKY 0 · FIXED 1/);
    assert.match(md, /\| api \| code \| aaaaaaa \| aaaaaaa \| same \|/);
    assert.match(md, /TC-API-ORDERS-001 \| pass \| fail \| the system did not change/);
    assert.match(md, /TC-API-ORDERS-002 \| fail \| pass \| passed without any change to the system/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── integrity rules ───────────────────────────────────────────────────────────────────────────────
test('swallowed reads: every shape that turns "could not read" into a value', () => {
  for (const line of [
    "const n = await rows.count().catch(() => 0);",
    "const v = await el.isVisible().catch(() => false);",
    "const t = await el.innerText().catch(() => '');",
    "const b = await res.json().catch(() => ({}));",
    "const l = await api.list().catch((e) => []);",
    "const x = await read().catch(err => { return null; });",
    "await thing().catch(() => {});",
    "await thing().catch(() => undefined);",
  ]) assert.equal(I.swallowedReads(line).length, 1, line);
  assert.equal(I.swallowedReads("const n = await rows.count();").length, 0);
  assert.equal(I.swallowedReads("await settle().catch(() => null); // unknown-ok: waits only").length, 0);
  assert.equal(I.swallowedReads("// unknown-ok: polling, the next read throws\nawait p.catch(() => null);").length, 0);
  assert.equal(I.swallowedReads("// e.g. count().catch(() => 0) is wrong").length, 0, 'comments are prose');
  assert.equal(I.swallowedReads("await x.catch((e) => { throw new Error(`read failed: ${e}`); });").length, 0, 'rethrowing is honest');
  assert.equal(I.swallowedReads("await x.catch(() => 0) // unknown-ok:").length, 1, 'the reason is required');
});

test('empty steps: a title is not a performed step', () => {
  assert.equal(I.emptySteps("await test.step('Step 2: open', async () => {});").length, 1);
  assert.equal(I.emptySteps("await test.step('Step 2: open', async () => { // TODO\n });").length, 1);
  assert.equal(I.emptySteps("await test.step('Step 2: open', async () => { console.log('x'); });").length, 1);
  assert.equal(I.emptySteps("await test.step('Step 2: open', async () => { await page.goto('/'); });").length, 0);
});

test('target gate: pass only when every run reached the report commit', () => {
  const m = (sha = '8556e8f') => ({ verdict: 'MATCH', shipped_sha: sha, components: [] });
  assert.equal(I.targetGate('8556e8f', [{ id: 'a', target: m() }, { id: 'b', target: m('8556e8f0c1') }]).verdict, 'pass');
  assert.equal(I.targetGate('8556e8f', [{ id: 'a', target: m() }, { id: 'b', target: null }]).verdict, 'not evaluable');
  assert.equal(I.targetGate('8556e8f', [{ id: 'a', target: { verdict: 'UNVERIFIED' } }]).verdict, 'not evaluable');
  assert.equal(I.targetGate('8556e8f', [{ id: 'a', target: { verdict: 'UNPINNED' } }]).verdict, 'not evaluable');
  assert.equal(I.targetGate('8556e8f', [{ id: 'a', target: { verdict: 'NOT_DEPLOYED' } }, { id: 'b', target: null }]).verdict, 'fail');
  assert.equal(I.targetGate('8556e8f', [{ id: 'a', target: m('1111111') }]).verdict, 'fail', 'last week\'s build cannot vouch for this one');
  assert.equal(I.targetGate('8556e8f', [{ id: 'a', target: { verdict: 'MATCH', components: [{ status: 'MATCH', expected: '8556e8f' }] } }]).verdict, 'pass', 'an --expect pin of the same commit');
  assert.equal(I.targetGate('8556e8f', []).verdict, 'not evaluable');
});

const DEF = ({ status = 'CLOSED', origin = 'INTERNAL', kase = 'TC-API-ORDERS-001', req = 'REQ-001', res = 'fixed (verified 2026-09-10-1010)', rec = '- 2026-09-05-0900 · uat · 2026-09-05', ver = '- 2026-09-10-1010 · uat · TC-API-ORDERS-001 ✅ · 2026-09-10', expected = '' } = {}) =>
  `# DEF-orders-002 — x\n**Status:** ${status}   **Severity:** High (x)   **Raised:** 2026-09-05   **Closed:** 2026-09-10\n**Origin:** ${origin}   **Feature:** orders   **Case:** ${kase}   **REQ:** ${req}   **Env:** uat   **Run:** 2026-09-05-0900\n**Resolution:** ${res}\n## Steps to reproduce\n## Expected (verbatim from the case)\n${expected}\n## Actual (verbatim from the run output)\n## Evidence\n## Impact\n## Recurrence\n${rec}\n## Verification\n${ver}\n`;

test('defect guard: a fix closes on a guard, on a different system', () => {
  assert.deepEqual(I.defectGuardProblems(DEF()), [], 'legacy lines without target are accepted');
  assert.match(I.defectGuardProblems(DEF({ kase: '—' })).join(), /without a \*\*Case:\*\*/);
  assert.match(I.defectGuardProblems(DEF({ rec: '- r1 · uat · d · target 8556e8f', ver: '- r2 · uat · TC ✅ · d · target 8556e8f0' })).join(), /same system/);
  assert.deepEqual(I.defectGuardProblems(DEF({ rec: '- r1 · uat · d · target 8556e8f', ver: '- r2 · uat · TC ✅ · d · target 9a0b1c2' })), []);
  assert.deepEqual(I.defectGuardProblems(DEF({ status: 'OPEN', res: '—', kase: '—' })), [], 'an open escape may wait for its case');
});

test('exploratory defect: no oracle, no defect', () => {
  assert.match(I.defectGuardProblems(DEF({ origin: 'EXPLORATORY', req: '—', status: 'OPEN', res: '—' })).join(), /names no oracle/);
  assert.deepEqual(I.defectGuardProblems(DEF({ origin: 'EXPLORATORY', req: '—', status: 'OPEN', res: '—', expected: 'Totals keep two decimals — BR-014' })), []);
  assert.deepEqual(I.defectGuardProblems(DEF({ origin: 'EXPLORATORY', req: 'REQ-003', status: 'OPEN', res: '—' })), []);
});

test('attribution: FUNCTIONAL needs precondition, control and repro on the page', () => {
  const ok = '## TC-1\n- class: FUNCTIONAL\n- attribution: precondition held (step 4) · control n/a — read-only · repro curl in Evidence\n';
  assert.deepEqual(I.attributionProblems(ok), []);
  assert.match(I.attributionProblems('## TC-1\n- class: FUNCTIONAL\n').join(), /precondition, control, repro/);
  assert.match(I.attributionProblems('## TC-1\n- FUNCTIONAL\n- attribution: precondition held · repro x\n').join(), /\(control\)/);
  assert.deepEqual(I.attributionProblems('## TC-2\n- class: SCRIPT\n'), [], 'only FUNCTIONAL accuses the product');
});

// ── heal guard: the oracle never moves in the same change as the test it judges ───────────────────
const SPEC = 'scripts/api/orders/TC-API-ORDERS-001-create-order.spec.ts';
const SPEC_TEXT = (total) => `import { test, expect } from '@playwright/test';\ntest('TC-API-ORDERS-001 — create', async ({ request }) => {\n  const res = await request.post('/orders');\n  expect((await res.json()).total).toBe(${total});\n});\n`;
const CASE = (total) => `# TC-API-ORDERS-001 — create\n## Objective\nx\n## Steps\n1. Create an order of 2 × 5.00 → Expected: total ${total}\n## Expected Result\nTotal is ${total}.\n`;

test('heal guard: editing the case and the spec together is an oracle move', () => {
  const opts = (extra = {}) => ({
    caseOf: () => ({ path: 'cases/api/orders/TC-API-ORDERS-001-create-order.md', text: CASE('9.99') }),
    caseBefore: () => ({ path: 'cases/api/orders/TC-API-ORDERS-001-create-order.md', text: CASE('10.00') }),
    ...extra,
  });
  const f = guard.review([{ path: SPEC, before: SPEC_TEXT('10.00'), after: SPEC_TEXT('9.99') }], opts());
  const oracle = f.find((x) => x.kind === 'oracle');
  assert.ok(oracle && !oracle.allowed, 'the moved oracle is blocked');
  const exp = f.find((x) => x.kind === 'expected');
  assert.ok(exp && !exp.allowed, 'and the spec is judged by the case as it stood before');

  const ok = guard.review([{ path: SPEC, before: SPEC_TEXT('10.00'), after: SPEC_TEXT('9.99') }], opts({ reviewed: () => 'reviewed in reviews/orders/2026-09-12-case-review.md' }));
  assert.ok(ok.every((x) => x.allowed), 'a READY review of the new body approves both');

  const same = guard.review([{ path: SPEC, before: SPEC_TEXT('10.00'), after: SPEC_TEXT('10.00').replace("'/orders'", "'/v2/orders'") }], opts({ caseBefore: () => ({ path: 'c', text: CASE('9.99') }) }));
  assert.ok(!same.some((x) => x.kind === 'oracle'), 'an unchanged oracle is no finding');

  const typo = guard.review([{ path: SPEC, before: SPEC_TEXT('10.00'), after: SPEC_TEXT('10.00') }], opts({ caseBefore: () => ({ path: 'c', text: CASE('9.99').replace('# TC-API-ORDERS-001 — create', '# TC-API-ORDERS-001 — create an order') }), caseOf: () => ({ path: 'c', text: CASE('9.99') }) }));
  assert.ok(!typo.some((x) => x.kind === 'oracle'), 'a title edit outside Steps/Expected is not an oracle move');
});

test('heal guard: a review approves only the body it hashed', () => {
  const review = (verdict, sha) => `---\nslug: orders\ndate: 2026-09-12\nverdict: ${verdict}\nreviewed:\n  - path: .stlc/cases/api/orders/TC-API-ORDERS-001-create-order.md\n    sha256: ${sha}\n---\n# Review\n`;
  const p = 'cases/api/orders/TC-API-ORDERS-001-create-order.md';
  assert.ok(guard.reviewedBody(review('READY FOR /qa-script', 'abc123'), p, 'abc123'));
  assert.ok(!guard.reviewedBody(review('READY FOR /qa-script', 'abc123'), p, 'def456'), 'a review of the old wording');
  assert.ok(!guard.reviewedBody(review('REVISE FIRST', 'abc123'), p, 'abc123'), 'only READY approves');
});
