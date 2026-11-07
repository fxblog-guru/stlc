// deploy-impact.test.mjs — CONTRACTS §30: a plan that declares a database or API impact fails
// qa:lint until its planned cases prove every deploy check the declaration requires. The fixtures in
// tests/fixture-deploy/ are the declarations (sizing/) and one lint-clean case per check (cases/);
// each test copies the reference fixture, adds a declaration and some of the cases, and lints it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LINT = join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'lint-qa.mjs');
const FIX = join(ROOT, 'tests', 'fixture-deploy');
const D = await import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'lib', 'deploy-impact.mjs')).href);
const PLAN = 'plans/orders/2026-09-01-test-plan.md';
const env = { ...process.env, QA_RUN_LOG: 'off', QA_LINT_TODAY: '2026-09-15' };
delete env.ELECTRON_RUN_AS_NODE;

const SCHEMA = ['migration-round-trip', 'migration-volume', 'migration-integrity', 'n-1-compat', 'rollback-redeploy', 'post-deploy-verify', 'rollback-restore'];
const DATA = ['backup-restore', 'data-baseline', 'migration-resumable', 'migration-idempotent', 'data-verify-after', 'rollback-data', 'n-1-data'];
const API = ['api-old-client', 'api-cached-client', 'api-versioning', 'rollback-redeploy', 'post-deploy-verify'];

// Every fixture case, by the check it names: { check → { type, file, id } }.
const CASES = {};
for (const type of ['integration', 'api']) {
  for (const file of readdirSync(join(FIX, 'cases', type, 'orders'))) {
    const check = D.caseChecks(readFileSync(join(FIX, 'cases', type, 'orders', file), 'utf8'))[0];
    CASES[check] = { type, file, id: file.match(/^(TC-[A-Z]+-ORDERS-\d{3})-/)[1] };
  }
}

/** A copy of the reference fixture with the given sizing declarations and the cases for `checks`. */
function project(sizing = [], checks = [], { traced = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'stlc-deploy-'));
  const qa = join(dir, 'qa');
  cpSync(join(ROOT, 'tests', 'fixture', 'qa'), qa, { recursive: true });
  const plan = join(qa, PLAN);
  let t = readFileSync(plan, 'utf8');
  const lines = sizing.map((s) => readFileSync(join(FIX, 'sizing', `${s}.md`), 'utf8').trim()).join('\n');
  if (lines) t = t.replace(/^- spawns: .*$/m, `$&\n${lines}`);
  const rows = [];
  for (const k of checks) {
    const c = CASES[k];
    mkdirSync(join(qa, 'cases', c.type, 'orders'), { recursive: true });
    cpSync(join(FIX, 'cases', c.type, 'orders', c.file), join(qa, 'cases', c.type, 'orders', c.file));
    rows.push(`| REQ-001 | ${c.id} | ${c.type} | orders | P1 | ❌ | — | — | — |`);
  }
  // Appended after the table's last row, so every case is planned (or, untraced, deliberately not).
  if (traced && rows.length) t = t.replace(/(\| REQ-001 \| TC-DATA-ORDERS-001 [^\n]*)/, `$1\n${rows.join('\n')}`);
  writeFileSync(plan, t);
  return { dir, qa, plan };
}
const lint = (qa) => {
  const r = spawnSync(process.execPath, [LINT], { cwd: qa, encoding: 'utf8', env });
  return { status: r.status, out: r.stdout + r.stderr, deploy: (r.stdout.match(/deploy check `[a-z0-9-]+` has no planned case/g) ?? []).map((l) => l.match(/`(.+)`/)[1]).sort() };
};
const withProject = (args, fn) => { const p = project(...args); try { fn(p); } finally { rmSync(p.dir, { recursive: true, force: true }); } };
const uniq = (a) => [...new Set(a)].sort();
const edit = (path, fn) => writeFileSync(path, fn(readFileSync(path, 'utf8')));

test('fixture: one lint-clean case per deploy check, and every check has one', () => {
  assert.deepEqual(Object.keys(CASES).sort(), Object.keys(D.CHECKS).sort());
  withProject([['db-data', 'api'], Object.keys(D.CHECKS)], ({ qa }) => {
    const r = lint(qa);
    assert.equal(r.status, 0, r.out);
    assert.doesNotMatch(r.out, /cases\/(integration|api)\/orders\/TC-(INT|API)-ORDERS-1\d\d/, 'the deploy fixture cases raise no warning of their own');
  });
});

test('no impact: a plan without the key, or with `none`, passes and needs no deploy case', () => {
  withProject([[], []], ({ qa }) => { const r = lint(qa); assert.equal(r.status, 0, r.out); assert.deepEqual(r.deploy, []); });
  withProject([['none'], []], ({ qa }) => { const r = lint(qa); assert.equal(r.status, 0, r.out); assert.deepEqual(r.deploy, []); });
});

test('db, schema only: fails without the cases and names each missing check; passes with them', () => {
  withProject([['db-additive'], []], ({ qa }) => {
    const r = lint(qa);
    assert.equal(r.status, 1, r.out);
    assert.deepEqual(r.deploy, uniq(SCHEMA), 'a snapshot-restore rollback also needs rollback-restore; no data check is asked of an additive change');
  });
  withProject([['db-additive'], SCHEMA], ({ qa }) => { const r = lint(qa); assert.equal(r.status, 0, r.out); });
});

test('db, data-changing: the schema set is not enough — backup, baseline, run, verify and rollback with data are required', () => {
  withProject([['db-data'], SCHEMA], ({ qa }) => {
    const r = lint(qa);
    assert.equal(r.status, 1, r.out);
    assert.deepEqual(r.deploy, uniq(DATA));
  });
  withProject([['db-data'], [...SCHEMA, ...DATA]], ({ qa }) => { const r = lint(qa); assert.equal(r.status, 0, r.out); });
});

test('api: fails without the cases; passes with them', () => {
  withProject([['api'], []], ({ qa }) => {
    const r = lint(qa);
    assert.equal(r.status, 1, r.out);
    assert.deepEqual(r.deploy, uniq(API), 'a deprecated change also needs api-versioning');
  });
  withProject([['api'], API], ({ qa }) => { const r = lint(qa); assert.equal(r.status, 0, r.out); });
});

test('a case counts only when it is planned and live: untraced or deprecated cases prove nothing', () => {
  withProject([['api'], API, { traced: false }], ({ qa }) => {
    assert.deepEqual(lint(qa).deploy, uniq(API), 'a case with no traceability row in the plan is not planned');
  });
  withProject([['api'], API], ({ qa, plan }) => {
    const c = CASES['api-old-client'];
    edit(join(qa, 'cases', 'api', 'orders', c.file), (t) => t.replace('@agentic:gen', '@deprecated:orders @agentic:gen'));
    edit(plan, (t) => t.replace(`| ${c.id} | api | orders | P1 | ❌ | — | — |`, `| ${c.id} | api | orders | P1 | ❌ | — | ⊘ deprecated |`));
    assert.deepEqual(lint(qa).deploy, ['api-old-client']);
  });
});

test('skips: a reason waives a check that does not apply; the way-back checks cannot be waived', () => {
  withProject([['api'], API.filter((k) => k !== 'api-cached-client')], ({ qa, plan }) => {
    assert.deepEqual(lint(qa).deploy, ['api-cached-client']);
    edit(plan, (t) => t.replace('- api_change: deprecated', '$&\n- deploy_skipped: api-cached-client — no browser client, the API serves the mobile app only'));
    const r = lint(qa);
    assert.equal(r.status, 0, r.out);
    edit(plan, (t) => t.replace('- deploy_skipped: api-cached-client — no browser client,', '- deploy_skipped: rollback-redeploy — we never roll back,'));
    assert.match(lint(qa).out, /`deploy_skipped:` `rollback-redeploy` cannot be skipped/);
  });
});

test('declarations that cannot ship are refused before any case is designed', () => {
  const bad = [
    [(t) => t.replace('- api_change: deprecated', '- api_change: breaking'), 'api', /a breaking change ships only behind a new version/],
    [(t) => t.replace(/^- backup: .*\n/m, ''), 'db-data', /`backup:` is missing/],
    [(t) => t.replace(/^- post_backup_writes: .*$/m, '- post_backup_writes: replay'), 'db-data', /`post_backup_writes:` is not/],
    [(t) => t.replace('- db_change: additive', '- db_change: contract'), 'db-additive', /`db_change: contract` names no release/],
    [(t) => t.replace(/^- data_change: .*\n/m, ''), 'db-additive', /`data_change:` is missing/],
    [(t) => t.replace(/^- rollback: .*\n/m, ''), 'db-additive', /`rollback:` is missing/],
    [(t) => t.replace('- deploy_impact: db', '- deploy_impact: database'), 'db-additive', /`deploy_impact:` `database` is not/],
    [(t) => t.replace(/^- worth_testing: .*$/m, '- worth_testing: no — config only'), 'api', /`worth_testing: no` but `deploy_impact:` names db or api/],
  ];
  for (const [mut, sizing, want] of bad) {
    withProject([[sizing], []], ({ qa, plan }) => {
      // An empty traceability table: the declaration is checked even before /qa-design.
      edit(plan, (t) => mut(t).replace(/^\| REQ-0\d\d \| TC-[^\n]*\n/gm, ''));
      const r = lint(qa);
      assert.equal(r.status, 1, `${want}: ${r.out}`);
      assert.match(r.out, want);
      assert.deepEqual(r.deploy, [], 'missing cases are not reported before the table has rows');
    });
  }
});

test('a case naming an unknown check is an error; a plan from 2026-11-03 without deploy_impact warns', () => {
  withProject([['api'], API], ({ qa, plan }) => {
    edit(join(qa, 'cases', 'api', 'orders', CASES['api-old-client'].file), (t) => t.replace('**Deploy check:** api-old-client', '**Deploy check:** api-old-client, old-clients'));
    assert.match(lint(qa).out, /`\*\*Deploy check:\*\*` `old-clients` is not a deploy check/);
  });
  withProject([[], []], ({ qa, plan }) => {
    renameSync(plan, plan.replace('2026-09-01', '2026-11-03'));
    const r = lint(qa);
    assert.match(r.out, /WARN .*## Sizing has no `deploy_impact:`/);
  });
});
