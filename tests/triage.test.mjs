// triage.test.mjs — qa:triage pre-triages a failed run (executing-tests Step 4, /qa-triage). Every
// hint rule must fire on its evidence and only there; failures with one cause must be one group,
// distinct causes must not merge; history and defects must name what they find. The reports below
// have the shape Playwright's JSON reporter writes (checked against a real 1.64 run).
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
const tri = await import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'triage.mjs')).href);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
/** One failed (or passed) test as the JSON reporter writes it. */
function spec(id, { error = '', status = 'unexpected', results, project = 'api', file = 'scripts/api/orders/x.spec.ts', line = 10, http, network, steps } = {}) {
  const attachments = [];
  if (http) attachments.push({ name: 'http-log', contentType: 'application/json', body: b64(http) });
  if (network) attachments.push({ name: 'network', contentType: 'application/json', body: b64(network) });
  attachments.push({ name: 'trace', contentType: 'application/zip', path: `runs/api/orders/r/test-results/${id}/trace.zip` });
  const fail = { status: 'failed', error: { message: error, location: { file, line, column: 3 } }, errors: [{ message: error }], steps: steps ?? [], attachments };
  return { title: `${id} — t`, file, line, tests: [{ projectName: project, status, annotations: [], results: results ?? (status === 'expected' ? [{ status: 'passed', attachments: [] }] : [fail]) }] };
}
const report = (...specs) => ({ suites: [{ title: 'x', file: 'x', specs }] });

const one = (s) => tri.failuresFromJson(report(s)).failures[0];
const hintOf = (s) => tri.hint(one(s));

test('hint: each rule fires on its own evidence', () => {
  assert.equal(hintOf(spec('TC-API-ORDERS-001', { project: 'setup', file: 'scripts/setup/auth.setup.ts', error: 'Error: login failed' })).token, 'SETUP/ENV');
  assert.equal(hintOf(spec('TC-API-ORDERS-001', { error: 'Error: apiRequestContext.get: connect ECONNREFUSED 127.0.0.1:8080' })).token, 'SETUP/ENV');
  assert.equal(hintOf(spec('TC-API-ORDERS-001', { error: 'Error: no actor "owner" — add TEST_USER_OWNER to <qa-root>/.env.qa' })).token, 'SETUP/ENV');
  const flaky = spec('TC-API-ORDERS-001', { status: 'flaky', error: 'Error: x' });
  flaky.tests[0].results.push({ status: 'passed', attachments: [] });
  assert.equal(hintOf(flaky).token, 'FLAKY');
  assert.deepEqual(pick(hintOf(spec('TC-API-ORDERS-001', { error: 'Error: expect(received).toBe(expected)\n\nExpected: 201\nReceived: 500', http: [{ method: 'POST', url: 'http://h/orders', status: 500 }] }))), { token: 'FUNCTIONAL', strength: 'strong' });
  assert.deepEqual(pick(hintOf(spec('TC-E2E-ORDERS-001', { project: 'web-chromium', error: "Error: locator.click: Timeout 15000ms exceeded.\nwaiting for getByTestId('save')", network: [{ method: 'GET', url: 'http://h/api/orders/12', status: 502 }] }))), { token: 'FUNCTIONAL', strength: 'strong' });
  assert.equal(hintOf(spec('TC-E2E-ORDERS-001', { error: 'Error: the server logged errors during this test (attached: server-log)' })).token, 'FUNCTIONAL');
  assert.equal(hintOf(spec('TC-E2E-ORDERS-001', { error: 'Error: the page raised errors the case does not expect' })).token, 'FUNCTIONAL');
  assert.deepEqual(pick(hintOf(spec('TC-API-ORDERS-001', { error: "TypeError: Cannot read properties of undefined (reading 'id')" }))), { token: 'SCRIPT', strength: 'strong' });
  assert.deepEqual(pick(hintOf(spec('TC-E2E-ORDERS-001', { error: "Error: locator.click: Timeout 15000ms exceeded.\nwaiting for getByTestId('save')" }))), { token: 'SCRIPT', strength: 'weak' });
  assert.deepEqual(pick(hintOf(spec('TC-API-ORDERS-001', { error: 'Error: expect(received).toBe(expected)\n\nExpected: 42\nReceived: 41' }))), { token: 'FUNCTIONAL', strength: 'weak' });
  assert.equal(hintOf(spec('TC-API-ORDERS-001', { error: 'Test timeout of 30000ms exceeded.' })).token, null);
  assert.equal(hintOf(spec('TC-API-ORDERS-001', { error: 'Error: something odd' })).token, null);
});
const pick = (h) => ({ token: h.token, strength: h.strength });

test('hint: a 4xx the case provoked is not a server failure; a 5xx outranks the locator lean', () => {
  // A negative case expects 422; the http-log shows it. That is no reason to call it FUNCTIONAL.
  const neg = hintOf(spec('TC-API-ORDERS-002', { error: 'Error: expect(received).toBe(expected)\n\nExpected: 200\nReceived: 422', http: [{ method: 'POST', url: 'http://h/orders', status: 422 }] }));
  assert.equal(neg.strength, 'weak');
  assert.match(neg.why, /different value/);
});

test('group: one endpoint failing is one group whatever the ids; different causes stay apart', () => {
  const r = report(
    spec('TC-API-ORDERS-001', { error: 'Error: a\n\nExpected: 200\nReceived: 500', http: [{ method: 'GET', url: 'http://h/orders/11', status: 500 }] }),
    spec('TC-API-ORDERS-002', { error: 'Error: b\n\nExpected: 201\nReceived: 500', http: [{ method: 'GET', url: 'http://h/orders/9921?x=1', status: 500 }], line: 40 }),
    spec('TC-API-ORDERS-003', { error: 'Error: c', http: [{ method: 'GET', url: 'http://h/orders/0b8f3c1e-1111-2222-3333-444455556666', status: 500 }], line: 70 }),
    spec('TC-API-CART-001', { error: 'Error: connect ECONNREFUSED 10.0.0.1:443' }),
    spec('TC-API-CART-002', { error: 'Error: connect ECONNREFUSED 10.0.0.2:443', file: 'scripts/api/cart/y.spec.ts' }),
    spec('TC-API-CART-003', { error: 'Error: expect(received).toBe(expected)\n\nExpected: 3\nReceived: 2' }),
    spec('TC-API-CART-004', { error: 'Error: expect(received).toBe(expected)\n\nExpected: 3\nReceived: 2', line: 99 }),
    spec('TC-API-CART-005', { status: 'expected' }),
  );
  const dir = runDir(r);
  const t = tri.triage(dir.run, { root: dir.root });
  assert.equal(t.failed, 7);
  const sizes = t.groups.map((g) => g.members.length);
  assert.deepEqual(sizes, [3, 2, 1, 1], `groups: ${t.groups.map((g) => g.key).join(' | ')}`);
  assert.match(t.groups[0].key, /GET \/orders\/‹id› → 500/);
  // Two value mismatches at different lines are two places, never one group.
  assert.equal(t.groups.filter((g) => g.key.startsWith('value')).length, 2);
});

test('history: new since a passing run, failing since the first failing run, no history; defects by case', () => {
  const dir = runDir(report(
    spec('TC-API-ORDERS-001', { error: 'Error: x' }),
    spec('TC-API-ORDERS-002', { error: 'Error: x' }),
    spec('TC-API-ORDERS-003', { error: 'Error: x' }),
  ), {
    '2026-10-01-0900': report(spec('TC-API-ORDERS-001', { status: 'expected' }), spec('TC-API-ORDERS-002', { status: 'expected' })),
    '2026-10-02-0900': report(spec('TC-API-ORDERS-001', { status: 'expected' }), spec('TC-API-ORDERS-002', { error: 'Error: x' })),
    '2026-10-03-0900': report(spec('TC-API-ORDERS-001', { status: 'expected' }), spec('TC-API-ORDERS-002', { error: 'Error: x' })),
    '2026-10-09-0900': report(spec('TC-API-ORDERS-001', { error: 'Error: later run must not count' })),
  });
  mkdirSync(join(dir.root, 'defects', 'orders'), { recursive: true });
  writeFileSync(join(dir.root, 'defects', 'orders', 'DEF-orders-004-x.md'), '# DEF-orders-004 — x\n**Status:** OPEN   **Severity:** High (r)   **Raised:** 2026-10-02   **Closed:** —\n**Origin:** INTERNAL   **Feature:** orders   **Case:** TC-API-ORDERS-002   **REQ:** —   **Env:** qa   **Run:** 2026-10-02-0900\n');
  const t = tri.triage(dir.run, { root: dir.root });
  const by = Object.fromEntries(t.groups.flatMap((g) => g.members).map((m) => [m.case, m]));
  assert.equal(by['TC-API-ORDERS-001'].history, 'new — passed in 2026-10-03-0900');
  assert.equal(by['TC-API-ORDERS-002'].history, 'failing since 2026-10-02-0900');
  assert.equal(by['TC-API-ORDERS-003'].history, 'no history');
  assert.deepEqual(by['TC-API-ORDERS-002'].defects, ['DEF-orders-004 OPEN']);
  assert.deepEqual(by['TC-API-ORDERS-001'].defects, []);
});

test('markdown: largest group first, the representative carries where, step, expected/received and evidence', () => {
  const steps = [{ title: 'open order', steps: [] }, { title: 'check total', error: { message: 'x' }, steps: [{ title: 'expect.toBe', error: { message: 'x' }, steps: [] }] }];
  const dir = runDir(report(
    spec('TC-API-ORDERS-001', { error: '\u001b[2mError: total\u001b[22m\n\nExpected: \u001b[32m42\u001b[39m\nReceived: \u001b[31m41\u001b[39m', steps }),
    spec('TC-API-ORDERS-002', { error: 'Error: total\n\nExpected: 42\nReceived: 41' }),
    spec('TC-API-CART-001', { error: 'Error: connect ECONNREFUSED 10.0.0.1:443' }),
  ));
  const md = tri.toMarkdown(tri.triage(dir.run, { root: dir.root }));
  assert.match(md, /3 failed · 2 group\(s\)/);
  // The bigger group's key ("value · …") sorts after the smaller one's ("env · …"): size must win.
  assert.ok(md.indexOf('## G1 · FUNCTIONAL (weak) · 2 case(s)') >= 0 && md.indexOf('## G2 · SETUP/ENV') > 0, 'largest group is not first');
  assert.match(md, /step "expect\.toBe"/);
  assert.match(md, /\*\*Expected \/ Received:\*\* 42 \/ 41/);
  assert.doesNotMatch(md, /\u001b/, 'ANSI colour codes leaked into triage.md');
  assert.match(md, /trace: runs\/api\/orders\/r\/test-results\/TC-API-ORDERS-001\/trace\.zip/);
});

test('junit fallback and no input', () => {
  const root = mkdtempSync(join(tmpdir(), 'triage-'));
  const run = join(root, 'runs', 'api', 'orders', '2026-10-10-0900');
  mkdirSync(run, { recursive: true });
  assert.equal(tri.triage(run, { root }), null);
  writeFileSync(join(run, 'junit.xml'), '<testsuites><testsuite><testcase name="TC-API-ORDERS-001 — t"><failure message="connect ECONNREFUSED 1.2.3.4:80"/></testcase><testcase name="TC-API-ORDERS-002 — t"/></testsuite></testsuites>');
  const t = tri.triage(run, { root });
  assert.equal(t.source, 'junit.xml');
  assert.equal(t.failed, 1);
  assert.equal(t.groups[0].hint.token, 'SETUP/ENV');
  rmSync(root, { recursive: true, force: true });
});

test('endpointShape: numeric and uuid ids collapse, query strings drop', () => {
  assert.equal(tri.endpointShape('http://h/api/orders/123/items/9?x=1'), '/api/orders/‹id›/items/‹id›');
  assert.equal(tri.endpointShape('/v2/users/0b8f3c1e-1111-2222-3333-444455556666'), '/v2/users/‹id›');
  assert.equal(tri.endpointShape('/v2/users/me'), '/v2/users/me');
});

/** A QA root with runs/api/orders/<run>/results.json, plus earlier runs beside it. */
function runDir(current, earlier = {}) {
  const root = mkdtempSync(join(tmpdir(), 'triage-'));
  const parent = join(root, 'runs', 'api', 'orders');
  for (const [id, r] of Object.entries(earlier)) { mkdirSync(join(parent, id), { recursive: true }); writeFileSync(join(parent, id, 'results.json'), JSON.stringify(r)); }
  const run = join(parent, '2026-10-05-0900');
  mkdirSync(run, { recursive: true });
  writeFileSync(join(run, 'results.json'), JSON.stringify(current));
  process.on('exit', () => rmSync(root, { recursive: true, force: true }));
  return { root, run };
}
void readFileSync;

test('ids: the broken call names its request and trace; a server-log trace fills in; none → no column', () => {
  const tid = '4bf92f3577b34da6a3ce929d0e0e4736';
  const http = [
    { method: 'GET', url: 'http://h/orders', status: 200, ids: { requestId: 'r-ok-0001', traceId: 'a'.repeat(32) } },
    { method: 'POST', url: 'http://h/orders', status: 500, ids: { requestId: 'r-bad-0002', traceId: tid } },
    { method: 'GET', url: 'http://h/orders/1', status: 404, ids: { requestId: 'r-404-0003' } },
  ];
  const f = one(spec('TC-API-ORDERS-001', { error: 'Error: a\n\nExpected: 201\nReceived: 500', http }));
  assert.deepEqual(tri.idsOf(f), { requestId: 'r-bad-0002', traceId: tid, logTraces: [] });
  // No http-log (a browser test): the trace comes from the server's own line.
  assert.equal(tri.idsOf({ http: [], serverLog: `{"level":"error","trace_id":"${tid}","event":"x.y_failed"}` }).traceId, tid);
  assert.deepEqual(tri.idsOf({ http: [], serverLog: null }), { requestId: null, traceId: null, logTraces: [] });
  assert.equal(tri.traceRef(tid, 'https://t/{trace_id}'), `[${tid}](https://t/${tid})`);
  assert.equal(tri.traceRef(tid, ''), `\`${tid}\``);

  const dir = mkdtempSync(join(tmpdir(), 'stlc-ids-'));
  try {
    const run = join(dir, 'runs', 'api', 'orders', '20261020-0900');
    mkdirSync(run, { recursive: true });
    writeFileSync(join(run, 'results.json'), JSON.stringify(report(spec('TC-API-ORDERS-001', { error: 'Error: a\n\nExpected: 201\nReceived: 500', http }), spec('TC-API-ORDERS-009', { error: 'Error: something odd' }))));
    const md = tri.toMarkdown(tri.triage(run, { root: dir }));
    assert.match(md, /\*\*Server side:\*\* request `r-bad-0002` · trace `4bf92f3577b34da6a3ce929d0e0e4736`/);
    assert.match(md, /\| Ids \|/);
    const plain = md.split('## G').find((s) => s.includes('TC-API-ORDERS-009'));
    assert.doesNotMatch(plain, /Server side|\| Ids \|/, 'a group with no ids prints no ids');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('http-log correlation: the echoed request id and the traceparent trace id are kept', async () => {
  const log = await import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'http', 'http-log.ts')).href);
  const { header, traceId } = log.newTraceparent();
  assert.match(header, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  assert.deepEqual(log.correlation({ traceparent: header }, { 'x-request-id': 'srv-1234' }), { requestId: 'srv-1234', traceId });
  // The server's own traceparent (a gateway that restarted the trace) wins over the one we sent.
  const srv = '00-' + 'b'.repeat(32) + '-' + 'c'.repeat(16) + '-01';
  assert.equal(log.correlation({ traceparent: header }, { traceparent: srv }).traceId, 'b'.repeat(32));
  assert.deepEqual(log.correlation({}, {}), {});
});
