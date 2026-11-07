// perf-compare.test.mjs — qa:perf reads a k6 or Locust run, checks each endpoint against the dev
// contract's x-perf budget and the run against its baseline. A run under every threshold but 40 %
// slower than the last one must fail; an endpoint the contract does not budget must be listed,
// never passed; one slow endpoint is localized, most of them systemic. The k6 summary has the shape
// handleSummary writes; the Locust CSV has the columns of `locust --csv` (2.x).
// Run: node --test "tests/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
process.env.QA_RUN_LOG = 'off';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'perf-compare.mjs');
const pc = await import(pathToFileURL(SCRIPT).href);

/** A k6 handleSummary JSON: total plus the {name:…} submetrics a per-endpoint threshold creates. */
function k6({ p95 = 200, fail = 0, rps = 20, count = 1200, eps = {} } = {}) {
  const metrics = {
    http_req_duration: { values: { 'p(95)': p95 } },
    http_req_failed: { values: { rate: fail } },
    http_reqs: { values: { rate: rps, count } },
  };
  for (const [name, e] of Object.entries(eps)) {
    metrics[`http_req_duration{name:${name}}`] = { values: { 'p(95)': e.p95 } };
    metrics[`http_req_failed{name:${name}}`] = { values: { rate: e.fail ?? 0 } };
    metrics[`http_reqs{name:${name}}`] = { values: { rate: e.rps ?? 5, count: e.count ?? 300 } };
  }
  return { metrics };
}

const LOCUST = [
  'Type,Name,Request Count,Failure Count,Median Response Time,Average Response Time,Min Response Time,Max Response Time,Average Content Size,Requests/s,Failures/s,50%,66%,75%,80%,90%,95%,98%,99%,99.9%,99.99%,100%',
  'GET,listPosts,600,6,90,110,40,900,4000,10.0,0.1,90,100,110,120,150,210,300,400,800,900,900',
  'GET,"getPost, by slug",400,0,120,140,50,700,9000,6.7,0.0,120,130,140,150,190,260,320,380,600,700,700',
  ',Aggregated,1000,6,100,120,40,900,6000,16.7,0.1,100,110,120,130,170,240,310,390,700,900,900',
].join('\n');

const CONTRACT = {
  paths: {
    '/api/v1/posts': { get: { operationId: 'listPosts', 'x-perf': { p95_ms: 300, max_queries: 3, max_payload_kb: 160 } } },
    '/api/v1/posts/{slug}': { get: { operationId: 'getPost', 'x-perf': { p95_ms: 300 } } },
    '/api/v1/categories': { get: { operationId: 'listCategories', 'x-perf': { p95_ms: 200 } } },
  },
};

test('k6: total and per-endpoint numbers come from the summary and its {name:} submetrics', () => {
  const r = pc.fromK6(k6({ p95: 250, fail: 0.002, rps: 18, eps: { listPosts: { p95: 210, fail: 0.01 } } }));
  assert.equal(r.tool, 'k6');
  assert.deepEqual(r.total, { p95_ms: 250, error_rate: 0.002, rps: 18, count: 1200 });
  assert.deepEqual(r.endpoints.listPosts, { p95_ms: 210, error_rate: 0.01, rps: 5, count: 300 });
});

test('locust: the Aggregated row is the total, quoted names survive, error rate = failures / requests', () => {
  const r = pc.fromLocustCsv(LOCUST);
  assert.equal(r.tool, 'locust');
  assert.equal(r.total.p95_ms, 240);
  assert.equal(r.total.error_rate, 0.006);
  assert.equal(r.endpoints.listPosts.error_rate, 0.01);
  assert.ok(r.endpoints['getPost, by slug'], 'a quoted name with a comma is one column');
  assert.throws(() => pc.fromLocustCsv('Name,foo\nx,1'), /not a Locust stats CSV/);
});

test('perf-result/v1: the shared schema is read first, and a wrong schema is refused', () => {
  const schema = JSON.parse(readFileSync(join(ROOT, 'skills', 'generating-perf-script', 'references', 'perf-result.schema.json'), 'utf8'));
  assert.equal(schema.properties.schema.const, 'perf-result/v1');
  const doc = {
    schema: 'perf-result/v1',
    run: { tool: 'gatling' },
    total: { requests: 900, failures: 9, error_rate: 0.01, rps: 15, p95_ms: 240 },
    endpoints: { listPosts: { requests: 600, failures: 0, error_rate: 0, rps: 10, p95_ms: 210 } },
  };
  const r = pc.fromResult(doc);
  assert.equal(r.tool, 'gatling');
  assert.deepEqual(r.total, { p95_ms: 240, error_rate: 0.01, rps: 15, count: 900 });
  assert.equal(r.endpoints.listPosts.p95_ms, 210);
  assert.throws(() => pc.fromResult({ ...doc, schema: 'perf-result/v0' }), /not perf-result\/v1/);
  const dir = mkdtempSync(join(tmpdir(), 'qa-perf-res-'));
  try {
    writeFileSync(join(dir, 'result.json'), JSON.stringify(doc));
    writeFileSync(join(dir, 'summary.json'), JSON.stringify(k6({ p95: 999 })));
    assert.equal(pc.readRun(dir).total.p95_ms, 240, 'result.json wins over a tool-native summary');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('budget: over, within, and an unbudgeted endpoint is listed as "no budget", never passed', () => {
  const run = pc.fromK6(k6({ eps: { listPosts: { p95: 290 }, getPost: { p95: 340 }, searchPosts: { p95: 900 } } }));
  const rows = Object.fromEntries(pc.checkBudgets(run, pc.budgetsFrom(CONTRACT)).map((b) => [b.name, b.verdict]));
  assert.deepEqual(rows, { listPosts: 'within', getPost: 'over', searchPosts: 'no budget' });
  assert.equal(pc.verdictOf({ budgets: pc.checkBudgets(run, pc.budgetsFrom(CONTRACT)) }).ok, false);
});

test('regression: under every threshold but 40 % slower than the baseline fails', () => {
  const base = pc.fromK6(k6({ p95: 200 }));
  const cur = pc.fromK6(k6({ p95: 280 }));
  const rows = pc.compareRuns(cur, base);
  assert.deepEqual(rows[0].regressed, ['p95']);
  assert.equal(Math.round(rows[0].p95.pct), 40);
  assert.equal(pc.verdictOf({ comparison: rows }).ok, false);
});

test('regression: each limit is exclusive at its edge, and errors and throughput count too', () => {
  const base = pc.fromK6(k6({ p95: 200, fail: 0.001, rps: 20 }));
  assert.deepEqual(pc.compareRuns(pc.fromK6(k6({ p95: 220, fail: 0.006, rps: 18 })), base)[0].regressed, []);
  assert.deepEqual(pc.compareRuns(pc.fromK6(k6({ p95: 221, fail: 0.001, rps: 20 })), base)[0].regressed, ['p95']);
  assert.deepEqual(pc.compareRuns(pc.fromK6(k6({ p95: 200, fail: 0.007, rps: 20 })), base)[0].regressed, ['errors']);
  assert.deepEqual(pc.compareRuns(pc.fromK6(k6({ p95: 200, fail: 0.001, rps: 17.9 })), base)[0].regressed, ['throughput']);
  assert.deepEqual(pc.compareRuns(pc.fromK6(k6({ p95: 300 })), base, { p95Pct: 60, errorPp: 0.5, rpsPct: 10 })[0].regressed, []);
});

test('spread: one slow endpoint of four is localized, three of four is systemic', () => {
  const eps = (slow) => Object.fromEntries(['a', 'b', 'c', 'd'].map((n, i) => [n, { p95: i < slow ? 400 : 100 }]));
  const base = pc.fromK6(k6({ eps: eps(0) }));
  assert.equal(pc.spread(pc.compareRuns(pc.fromK6(k6({ eps: eps(1) })), base)), 'localized');
  assert.equal(pc.spread(pc.compareRuns(pc.fromK6(k6({ p95: 400, eps: eps(3) })), base)), 'systemic');
  assert.equal(pc.spread(pc.compareRuns(base, base)), 'none');
});

test('verdict: nothing compared is NOT EVALUABLE, a partial check passes but names what it skipped', () => {
  const run = pc.fromK6(k6({ eps: { listPosts: { p95: 200 }, searchPosts: { p95: 900 } } }));
  assert.equal(pc.verdictOf({ budgets: null, comparison: null }).state, 'not evaluable');
  assert.equal(pc.verdictOf({ budgets: pc.checkBudgets(run, {}), comparison: null }).state, 'not evaluable', 'a contract that budgets none of the endpoints judged nothing');
  const partial = pc.verdictOf({ budgets: pc.checkBudgets(run, pc.budgetsFrom(CONTRACT)), comparison: null });
  assert.equal(partial.state, 'pass');
  assert.deepEqual(partial.unchecked, ['searchPosts (no budget)', 'baseline (none yet)']);
});

test('cli: writes perf-verdict.md, exits 1 on a regression, promotes a baseline, and never passes a missing one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-perf-'));
  try {
    const run = join(dir, 'runs', 'performance', 'blog', 'r1');
    mkdirSync(run, { recursive: true });
    const baseline = join(dir, 'baselines', 'TC-PERF-POSTS-001.json');
    const contract = join(dir, 'openapi.json');
    writeFileSync(contract, JSON.stringify(CONTRACT));
    const cli = (...a) => spawnSync(process.execPath, [SCRIPT, run, '--baseline', baseline, '--contract', contract, ...a], { encoding: 'utf8', env: { ...process.env, QA_ROOT_DIR: dir } });

    writeFileSync(join(run, 'summary.json'), JSON.stringify(k6({ p95: 200, eps: { listPosts: { p95: 200 } } })));
    let r = cli();
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(readFileSync(join(run, 'perf-verdict.md'), 'utf8'), /No baseline at[\s\S]*Not checked: baseline \(none yet\)/);
    r = spawnSync(process.execPath, [SCRIPT, run, '--baseline', baseline], { encoding: 'utf8' });
    assert.equal(r.status, 1, 'no contract and no baseline must not exit 0');
    assert.match(r.stdout, /NOT EVALUABLE/);

    assert.equal(cli('--update').status, 0);
    assert.ok(existsSync(baseline));

    writeFileSync(join(run, 'summary.json'), JSON.stringify(k6({ p95: 260, eps: { listPosts: { p95: 260 } } })));
    r = cli();
    assert.equal(r.status, 1, 'a 30 % slower run under budget must still fail');
    assert.match(readFileSync(join(run, 'perf-verdict.md'), 'utf8'), /FAIL — 0 endpoint\(s\) over budget · 2 regressed row\(s\)/);

    assert.equal(spawnSync(process.execPath, [SCRIPT, join(dir, 'empty')], { encoding: 'utf8' }).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
