/**
 * Tests for loading the index and for the view model: the ten-step pipeline, the platform × type
 * matrix derivation, the run plans panel, the latest run and its triage, the KPI numbers, the
 * "what next" list and the version pill. They run against the bundle's own fixture (the one
 * build-state.test.mjs pins) and a richer one in src/test/fixtures/rich.
 *
 * Run with: npm run compile && npm test
 */

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { CaseHeader, LiveReader } from '../live';
import { QaState, findProjectRoots, loadState, phaseIndex, resolveInProject, resolveStatePath } from '../model';
import { BoardVM, DEFAULT_PLATFORMS, FeatureVM, activeFeature, buildViewModel, deriveMatrix, platformsOf } from '../viewmodel';
import { BUNDLE_FIXTURE, RICH_FIXTURE, copyProject, write } from './helpers';

type OkVM = Extract<BoardVM, { ok: true }>;

function board(src: string, opts: { dismissedUpdate?: string } = {}): OkVM {
  const root = copyProject(src);
  const r = loadState(root, 'qa/state.json');
  assert.ok(r.ok, 'fixture loads');
  const vm = buildViewModel(r, { live: new LiveReader('qa').snapshot(root, r.state), watching: true, addonVersion: '0.2.0', now: 0, ...opts });
  assert.ok(vm.ok);
  return vm;
}
const feature = (vm: OkVM, slug: string): FeatureVM => {
  const f = vm.features.find((x) => x.slug === slug);
  assert.ok(f, `feature ${slug}`);
  return f;
};
const step = (f: FeatureVM, key: string) => f.steps.find((s) => s.key === key)!;
const cell = (f: FeatureVM, p: string, t: string) => f.matrix.cells.find((c) => c.platform === p && c.type === t)!;

// ---- loading --------------------------------------------------------------------------------------

test('loadState reads the bundle fixture', () => {
  const r = loadState(BUNDLE_FIXTURE, 'qa/state.json');
  assert.ok(r.ok);
  assert.equal(r.state.slugs[0].slug, 'orders');
  assert.equal(r.state.slugs[0].phase, 'Report');
  assert.equal(r.projectRoot, BUNDLE_FIXTURE);
});

test('loadState says why when the index is missing, malformed or of another schema', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stlc-load-'));
  const missing = loadState(root, 'qa/state.json');
  assert.equal(missing.ok, false);
  assert.match(missing.ok ? '' : missing.reason, /No QA state index/);
  fs.mkdirSync(path.join(root, 'qa'));
  fs.writeFileSync(path.join(root, 'qa/state.json'), '{');
  assert.match((loadState(root, 'qa/state.json') as { reason: string }).reason, /not valid JSON/);
  fs.writeFileSync(path.join(root, 'qa/state.json'), JSON.stringify({ schema: 2, slugs: [] }));
  assert.match((loadState(root, 'qa/state.json') as { reason: string }).reason, /Unsupported QA state schema 2/);
});

test('resolveStatePath: the setting, else .stlc/ when it exists, else qa/, else .stlc/ — and a qa/ project below a parent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stlc-statepath-'));
  assert.equal(resolveStatePath(root, ''), '.stlc/state.json', 'nothing there: the new default');
  fs.mkdirSync(path.join(root, 'qa'));
  assert.equal(resolveStatePath(root, undefined), 'qa/state.json', 'an existing qa/ project keeps working');
  fs.mkdirSync(path.join(root, '.stlc'));
  assert.equal(resolveStatePath(root, ''), '.stlc/state.json', 'both: .stlc wins, as lib/root.mjs');
  assert.equal(resolveStatePath(root, 'tests/qa/state.json'), 'tests/qa/state.json', 'a set path wins');
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'stlc-statepath-parent-'));
  write(parent, 'app/qa/state.json', '{}');
  assert.equal(resolveStatePath(parent, ''), 'qa/state.json', 'a qa/ project under the workspace is not shadowed');
});

test('loadState reads an index under .stlc/', () => {
  const root = copyProject(BUNDLE_FIXTURE);
  fs.renameSync(path.join(root, 'qa'), path.join(root, '.stlc'));
  const rel = resolveStatePath(root, '');
  assert.equal(rel, '.stlc/state.json');
  const r = loadState(root, rel);
  assert.ok(r.ok);
  assert.equal(r.state.slugs[0].slug, 'orders');
  const missing = loadState(fs.mkdtempSync(path.join(os.tmpdir(), 'stlc-none-')), '.stlc/state.json');
  assert.match(missing.ok ? '' : missing.detail ?? '', /node \.stlc\/scripts\/shared\/build-state\.mjs/, 'the hint names the root it looked in');
});

test('findProjectRoots finds nested projects and skips dot folders', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stlc-roots-'));
  for (const p of ['app-a/qa', 'app-b/qa', '.claude/worktrees/x/qa']) {
    fs.mkdirSync(path.join(root, p), { recursive: true });
    fs.writeFileSync(path.join(root, p, 'state.json'), '{}');
  }
  const found = findProjectRoots(root, 'qa/state.json').map((p) => path.basename(p.root)).sort();
  assert.deepEqual(found, ['app-a', 'app-b']);
});

test('every QA project under a parent workspace is listed newest first; copies, deps and inner folders are not', () => {
  // A large workspace (agentic-fx) holds several projects on the bundle, some nested a few levels down.
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'stlc-many-'));
  const now = Date.now() / 1000;
  const index = (dir: string, project: string, mtime: number): void => {
    write(parent, `${dir}/qa/state.json`, JSON.stringify({ schema: 1, project, generated_at: new Date().toISOString(), slugs: [] }));
    fs.utimesSync(path.join(parent, dir, 'qa', 'state.json'), mtime, mtime);
  };
  index('a', 'a', now - 3600);
  index('group/deep/b', 'b', now - 60);
  // Inside project a: its own code, not another project.
  index('a/packages/inner', 'inner', now - 30);
  // Agent worktree copies, git internals and dependencies are never projects.
  index('.claude/worktrees/agent-x', 'worktree', now);
  index('.git/x', 'git', now);
  index('node_modules/pkg', 'dep', now);
  index('c/node_modules/pkg', 'dep2', now);
  // Run plans but no index yet: listed only when asked for, marked not indexed.
  write(parent, 'fresh/qa/run-plans/smoke.md', '# smoke\n');
  fs.utimesSync(path.join(parent, 'fresh/qa/run-plans/smoke.md'), now - 600, now - 600);
  // A run-plans folder with no plan in it is nothing.
  fs.mkdirSync(path.join(parent, 'empty/qa/run-plans'), { recursive: true });

  const indexed = findProjectRoots(parent, 'qa/state.json');
  assert.deepEqual(
    indexed.map((p) => p.root),
    [path.join(parent, 'group', 'deep', 'b'), path.join(parent, 'a')],
  );
  assert.ok(indexed.every((p) => p.indexed));

  const all = findProjectRoots(parent, 'qa/state.json', { runPlansDir: 'qa/run-plans' });
  assert.deepEqual(
    all.map((p) => [path.relative(parent, p.root).split(path.sep).join('/'), p.indexed]),
    [
      ['group/deep/b', true],
      ['fresh', false],
      ['a', true],
    ],
  );

  // An explicit choice wins over the newest index; a run-plans-only choice says to build the index.
  const chosen = loadState(parent, 'qa/state.json', path.join(parent, 'a'));
  assert.ok(chosen.ok);
  assert.equal(chosen.state.project, 'a');
  assert.equal(chosen.projectRoot, path.join(parent, 'a'));
  const fresh = loadState(parent, 'qa/state.json', path.join(parent, 'fresh'));
  assert.equal(fresh.ok, false);
  assert.equal(fresh.projectRoot, path.join(parent, 'fresh'));
  assert.match(fresh.ok ? '' : fresh.detail ?? '', /build-state\.mjs/);
  // Unchosen: the newest index.
  assert.equal(loadState(parent, 'qa/state.json').projectRoot, path.join(parent, 'group', 'deep', 'b'));
});

test('with a project selected under a parent workspace, every path resolves under that project', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'stlc-sel-'));
  const selected = path.join(parent, 'apps', 'shop');
  fs.cpSync(copyProject(RICH_FIXTURE), selected, { recursive: true });
  // A decoy at the workspace root with its own manifest and notice: must never be read.
  write(parent, '.claude/.agentic-fx.json', JSON.stringify({ qa: { version: '9.9.9' } }));
  write(parent, '.claude/.agentic-fx-updates.json', JSON.stringify({ bundles: { qa: { installed: '9.9.9', latest: '10.0.0', kind: 'major', command: 'nope' } } }));

  const r = loadState(parent, 'qa/state.json', selected);
  assert.ok(r.ok);
  assert.equal(r.projectRoot, selected);
  const vm = buildViewModel(r, { live: new LiveReader('qa').snapshot(r.projectRoot, r.state), addonVersion: '0.3.0' });
  assert.ok(vm.ok);
  // The update pill reads the selected project's .claude files.
  assert.equal(vm.version.bundle, '2.0.3');
  assert.equal(vm.version.update?.latest, '2.1.0');

  // Run plans, run summaries, reports, traces and defect links all exist under the selected root.
  const rels = [
    ...vm.runPlans.map((p) => p.path),
    ...vm.runs.flatMap((x) => [x.summaryPath, x.failuresPath, x.htmlReport, ...x.traces]),
    ...vm.features.flatMap((f) => [f.report?.path, f.review?.path, ...f.defects.items.map((d) => d.path), ...f.steps.map((s) => s.path)]),
  ].filter((p): p is string => !!p);
  assert.ok(rels.length > 10, `enough links to check (${rels.length})`);
  for (const rel of rels) {
    const abs = resolveInProject(r.projectRoot, rel);
    assert.ok(abs, `resolvable: ${rel}`);
    assert.ok(abs.startsWith(selected + path.sep), `${rel} under the selected project`);
    assert.ok(fs.existsSync(abs), `${rel} exists under the selected project`);
  }
  // The run-plan terminal's cwd is the selected project's qa folder.
  assert.equal(resolveInProject(r.projectRoot, 'qa'), path.join(selected, 'qa'));
  // Nothing escapes the project.
  for (const bad of ['../x', 'qa/../../x', '/etc/passwd', 'C:\\x', '\\\\server\\x', '']) assert.equal(resolveInProject(selected, bad), undefined, bad);
});

test('phaseIndex follows the /qa-status ladder', () => {
  assert.equal(phaseIndex('Analyze'), 0);
  assert.equal(phaseIndex('Report'), 5);
  assert.equal(phaseIndex('Signed-off'), 6);
});

// ---- pipeline -------------------------------------------------------------------------------------

test('bundle fixture pipeline: review REVISE FIRST, report stale, sign-off NO-GO, env partly ready', () => {
  const f = feature(board(BUNDLE_FIXTURE), 'orders');
  assert.deepEqual(
    f.steps.map((s) => `${s.key}:${s.state}`),
    ['knowledge:idle', 'analyze:pass', 'plan:pass', 'design:pass', 'review:changes', 'script:partial', 'env:partial', 'run:failed', 'report:stale', 'signoff:failed'],
  );
  assert.equal(step(f, 'review').word, 'revise first');
  assert.equal(step(f, 'signoff').word, 'NO-GO');
  assert.match(step(f, 'report').detail, /2026-09-10-1040/);
  assert.equal(f.current, 'review', 'the first step that has not passed');
});

test('rich fixture pipelines: a GO feature, a running one and a stale review', () => {
  const vm = board(RICH_FIXTURE);
  const inv = feature(vm, 'invoices');
  assert.ok(inv.steps.filter((s) => s.key !== 'knowledge' && s.key !== 'env').every((s) => s.state === 'pass'), 'every invoices step passed');
  assert.equal(step(inv, 'signoff').word, 'GO');
  assert.equal(step(inv, 'knowledge').state, 'pass', 'two compiled wiki cards');
  const proj = feature(vm, 'projects');
  assert.equal(step(proj, 'review').state, 'stale');
  assert.match(step(proj, 'review').detail, /TC-API-PROJECTS-001/);
  assert.equal(step(proj, 'script').state, 'idle');
  const ord = feature(vm, 'orders');
  assert.equal(step(ord, 'review').word, 'passed (unhashed)', 'a verdict with no hashes is not claimed fresh');
  assert.equal(step(ord, 'run').state, 'failed');
  assert.equal(step(ord, 'env').state, 'partial', 'mobile NOT READY on uat');
});

test('a newer run file turns the run step to running, marked inferred, without changing the index', () => {
  const root = copyProject(RICH_FIXTURE);
  const r = loadState(root, 'qa/state.json');
  assert.ok(r.ok);
  const later = new Date(Date.parse(r.state.generated_at) + 60_000);
  const dir = path.join(root, 'qa/runs/api/projects/2026-10-14-1000');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'summary.md'), '| Case ID | Status |\n|---|---|\n| TC-API-PROJECTS-001 | ✅ |\n');
  fs.utimesSync(path.join(dir, 'summary.md'), later, later);
  fs.utimesSync(dir, later, later);
  const vm = buildViewModel(r, { live: new LiveReader('qa').snapshot(root, r.state) });
  assert.ok(vm.ok);
  const proj = vm.features.find((f) => f.slug === 'projects')!;
  const run = step(proj, 'run');
  assert.equal(run.state, 'running');
  assert.match(run.live?.note ?? '', /^Inferred/);
  assert.equal(proj.cases.passed, 0, 'counts stay the builder’s until the rebuild');
  assert.equal(cell(proj, 'api', 'api').live, true, 'the matrix cell shows the newer verdict, marked live');
  assert.equal(cell(proj, 'api', 'api').state, 'pass', 'its one api case passed in the newer run');
  assert.equal(vm.live.ahead, true);
});

// ---- platform matrix ------------------------------------------------------------------------------

test('platformsOf: the case header wins; otherwise the type default, marked inferred', () => {
  const h = (platforms: string[]): CaseHeader => ({ id: 'TC-X-001', type: 'e2e', platforms, platformSource: platforms.length ? 'header' : null });
  assert.deepEqual(platformsOf('e2e', h(['web', 'windows'])), { platforms: ['web', 'windows'], inferred: false });
  assert.deepEqual(platformsOf('api', undefined), { platforms: ['api'], inferred: true });
  assert.deepEqual(platformsOf('integration', h([])), { platforms: ['api'], inferred: true });
  assert.deepEqual(platformsOf('security', undefined).platforms, ['api']);
  assert.deepEqual(platformsOf('e2e', undefined).platforms, ['web']);
  assert.deepEqual(platformsOf('accessibility', undefined).platforms, ['web']);
  assert.deepEqual(platformsOf('mobile', undefined).platforms, ['android', 'ios']);
  assert.deepEqual(platformsOf('e2e', h(['Desktop-Web', 'tv'])).platforms, ['web', 'other:tv'], 'unknown platforms are other:*');
  assert.deepEqual(DEFAULT_PLATFORMS.api, ['api']);
});

test('deriveMatrix: worst verdict wins, partial when some ran, disabled types, re-verify rows counted once', () => {
  const headers = new Map<string, CaseHeader>([
    ['TC-E2E-A-001', { id: 'TC-E2E-A-001', type: 'e2e', platforms: ['web', 'windows'], platformSource: 'header' }],
  ]);
  const m = deriveMatrix(
    [
      { caseId: 'TC-API-A-001', type: 'api', status: '✅' },
      { caseId: 'TC-API-A-002', type: 'api', status: '—' },
      { caseId: 'TC-API-A-001', type: 'api', status: '✅' }, // a re-verify row: same case
      { caseId: 'TC-E2E-A-001', type: 'e2e', status: '❌' },
      { caseId: 'TC-MOB-A-001', type: 'mobile', status: '⛔ blocked — awaiting handoff' },
      { caseId: 'TC-PERF-A-001', type: 'performance', status: '—' },
    ],
    headers,
    ['api', 'e2e', 'mobile'],
  );
  const c = (p: string, t: string) => m.cells.find((x) => x.platform === p && x.type === t)!;
  assert.equal(c('api', 'api').state, 'partial');
  assert.equal(c('api', 'api').counts.total, 2, 'the re-verify row is the same case');
  assert.equal(c('api', 'api').inferred, true);
  assert.equal(c('web', 'e2e').state, 'fail');
  assert.equal(c('windows', 'e2e').state, 'fail');
  assert.equal(c('web', 'e2e').inferred, false);
  assert.equal(c('android', 'mobile').state, 'handoff');
  assert.equal(c('ios', 'mobile').state, 'handoff');
  assert.equal(c('api', 'performance').state, 'disabled');
  assert.equal(c('ios', 'api').state, 'none');
  assert.equal(m.inferred, true);
  assert.deepEqual(m.platforms.filter((p) => p.used).map((p) => p.id), ['web', 'android', 'ios', 'windows', 'api']);
});

test('deriveMatrix: types_enabled null means unknown, so nothing is drawn disabled; ui follows e2e', () => {
  const m = deriveMatrix([{ caseId: 'TC-UI-A-001', type: 'ui', status: '✅' }], new Map(), null);
  assert.ok(!m.cells.some((c) => c.state === 'disabled'));
  assert.equal(m.cells.find((c) => c.platform === 'web' && c.type === 'ui')?.state, 'pass');
  const e = deriveMatrix([{ caseId: 'TC-UI-A-001', type: 'ui', status: '✅' }], new Map(), ['e2e']);
  assert.equal(e.types.find((t) => t.id === 'ui')?.enabled, true);
});

test('rich fixture matrix: mixed platforms from headers, tags and sections, the rest inferred', () => {
  const ord = feature(board(RICH_FIXTURE), 'orders');
  assert.equal(cell(ord, 'web', 'e2e').state, 'fail', 'TC-E2E-ORDERS-001 failed on web');
  assert.equal(cell(ord, 'windows', 'e2e').state, 'pass', 'only TC-E2E-ORDERS-002 names windows');
  assert.equal(cell(ord, 'windows', 'ui').state, 'pass');
  assert.equal(cell(ord, 'macos', 'ui').state, 'pass');
  assert.equal(cell(ord, 'web', 'ui').state, 'none', 'the ui case names its platforms; web is not one');
  assert.equal(cell(ord, 'android', 'mobile').state, 'handoff');
  assert.equal(cell(ord, 'ios', 'mobile').state, 'handoff', 'ios: one handoff, one pass');
  assert.equal(cell(ord, 'api', 'api').state, 'pass');
  assert.equal(cell(ord, 'api', 'api').inferred, true);
  assert.equal(cell(ord, 'api', 'integration').state, 'fail');
  assert.equal(cell(ord, 'api', 'security').state, 'not-run');
  assert.equal(cell(ord, 'web', 'accessibility').state, 'blocked');
  assert.equal(cell(ord, 'api', 'performance').state, 'disabled', 'performance is off in the profile');
  assert.equal(cell(ord, 'other:code', 'unit').state, 'pass');
});

test('bundle fixture matrix without live files falls back to the index per-type counts, all inferred', () => {
  const r = loadState(BUNDLE_FIXTURE, 'qa/state.json');
  assert.ok(r.ok);
  const vm = buildViewModel(r, {});
  assert.ok(vm.ok);
  const f = vm.features[0];
  assert.equal(cell(f, 'web', 'e2e').state, 'fail');
  assert.equal(cell(f, 'web', 'accessibility').state, 'fail');
  assert.equal(cell(f, 'android', 'mobile').state, 'blocked');
  assert.equal(cell(f, 'api', 'api').state, 'pass');
  assert.equal(cell(f, 'api', 'security').state, 'not-run');
  assert.ok(f.matrix.inferred);
});

// ---- KPIs, defects, quarantine, coverage, gates ---------------------------------------------------

test('KPI numbers come from the index; coverage from the saved qa:score output', () => {
  const ord = feature(board(RICH_FIXTURE), 'orders');
  assert.deepEqual(ord.cases, { designed: 12, scripted: 10, passed: 6, failed: 2, blocked: 2, notRun: 2 });
  assert.equal(ord.lastRun.rate, 60);
  assert.equal(ord.lastRun.runId, '2026-10-13-1000');
  assert.equal(ord.defects.open, 2);
  assert.equal(ord.defects.bySeverity.Critical, 1);
  assert.equal(ord.quarantine.active, 2);
  assert.equal(ord.quarantine.expired, 1);
  assert.equal(ord.quarantine.nearest, '2026-10-10');
  assert.equal(ord.coverage.state, 'gaps');
  assert.deepEqual(ord.coverage.gaps, ['orders/REQ-001/error-contract', 'orders/REQ-004/negative']);
  const inv = feature(board(RICH_FIXTURE), 'invoices');
  assert.equal(inv.coverage.state, 'ok', 'a score file with no gap for this slug');
});

test('no coverage-score file: the tile says to run npm run qa:score, never 0 gaps', () => {
  const f = feature(board(BUNDLE_FIXTURE), 'orders');
  assert.equal(f.coverage.state, 'unknown');
  assert.equal(f.coverage.hint, 'run npm run qa:score');
});

test('gates carry the Re-verify set flag; sign-off GO / NO-GO is copied verbatim', () => {
  const inv = feature(board(RICH_FIXTURE), 'invoices');
  assert.deepEqual(inv.gates.filter((g) => g.reverify).map((g) => g.gate), ['Re-verify set']);
  assert.equal(inv.signoff?.recommendation, 'GO');
  assert.equal(feature(board(BUNDLE_FIXTURE), 'orders').signoff?.recommendation, 'NO-GO');
});

// ---- runs, run plans ------------------------------------------------------------------------------

test('latest run: pass rate, every failure with its triage and the command to copy', () => {
  const vm = board(RICH_FIXTURE);
  const r = vm.latestRun!;
  assert.equal(r.runId, '2026-10-13-1000');
  assert.equal(r.where, 'plan orders-smoke');
  assert.equal(r.passRate, 67);
  assert.deepEqual(r.failures.map((f) => [f.caseId, f.triage, f.command]), [['TC-INT-ORDERS-001', 'SETUP-ENV', '/qa-env <env>']]);
  const e2e = vm.runs.find((x) => x.runId === '2026-10-12-0900')!;
  assert.deepEqual(e2e.failures.map((f) => [f.triage, f.command]), [['FUNCTIONAL', '/qa-defect orders']]);
  assert.equal(e2e.htmlReport, 'qa/runs/e2e/orders/2026-10-12-0900/html-report/index.html');
  assert.equal(e2e.traces.length, 1);
});

test('a failing case missing from failures.md still gets a row, marked not triaged', () => {
  const root = copyProject(RICH_FIXTURE);
  fs.rmSync(path.join(root, 'qa/runs/plans/orders-smoke/2026-10-13-1000/failures.md'));
  const r = loadState(root, 'qa/state.json');
  assert.ok(r.ok);
  const vm = buildViewModel(r, { live: new LiveReader('qa').snapshot(root, r.state) });
  assert.ok(vm.ok);
  assert.deepEqual(vm.latestRun?.failures.map((f) => [f.caseId, f.triage, f.command]), [['TC-INT-ORDERS-001', null, null]]);
});

test('run plans: counts by type and platform, last run, and the exact commands Run / Dry-run will type', () => {
  const vm = board(RICH_FIXTURE);
  const smoke = vm.runPlans.find((p) => p.name === 'orders-smoke')!;
  assert.equal(smoke.caseCount, 3);
  assert.deepEqual(smoke.byType, [{ id: 'api', n: 2 }, { id: 'integration', n: 1 }]);
  assert.deepEqual(smoke.byPlatform, [{ id: 'api', n: 3, inferred: true }]);
  assert.deepEqual(smoke.lastRun && { ok: smoke.lastRun.ok, pass: smoke.lastRun.pass, fail: smoke.lastRun.fail }, { ok: false, pass: 2, fail: 1 });
  assert.equal(smoke.runCommand, 'npm run qa:plan:run -- orders-smoke');
  assert.equal(smoke.dryRunCommand, 'npm run qa:plan:run -- orders-smoke --dry-run');
  const rel = vm.runPlans.find((p) => p.name === 'release-2026-10')!;
  assert.equal(rel.manual, 1);
  assert.equal(rel.lastRun, null);
  assert.deepEqual(rel.byPlatform.find((p) => p.id === 'macos'), { id: 'macos', n: 2, inferred: false }, 'ui + invoices e2e name macos');
  const nightly = vm.runPlans.find((p) => p.name === 'nightly-regression')!;
  assert.equal(nightly.resolved, false);
});

test('bundle fixture run plan: three cases, one manual, never run', () => {
  const p = board(BUNDLE_FIXTURE).runPlans[0];
  assert.equal(p.name, 'orders-release');
  assert.equal(p.caseCount, 3);
  assert.equal(p.manual, 1);
  assert.deepEqual(p.byType, [{ id: 'accessibility', n: 2 }, { id: 'api', n: 1 }]);
  assert.equal(p.lastRun, null);
});

// ---- actions --------------------------------------------------------------------------------------

test('what next restates recorded states with the documented command', () => {
  const vm = board(BUNDLE_FIXTURE);
  const a = feature(vm, 'orders').actions.map((x) => [x.kind, x.command]);
  assert.deepEqual(a, [
    ['changes', '/qa-review orders'],
    ['stale', '/qa-report orders'],
    ['defects', '/qa-defect orders --verify'],
    ['failed', null],
    ['continue', '/qa-signoff <release-id> orders'],
  ]);
  const rich = board(RICH_FIXTURE);
  assert.deepEqual(feature(rich, 'projects').actions.map((x) => x.command).slice(0, 1), ['/qa-review projects']);
  assert.ok(feature(rich, 'orders').actions.some((x) => x.kind === 'quarantine'), 'an expired quarantine row is named');
  assert.deepEqual(feature(rich, 'invoices').actions.map((x) => x.kind), ['done']);
});

test('a next_command in state.json leads the list', () => {
  const r = loadState(BUNDLE_FIXTURE, 'qa/state.json');
  assert.ok(r.ok);
  const state: QaState = { ...r.state, slugs: r.state.slugs.map((s) => ({ ...s, next_command: '/qa-run orders --type e2e' })) };
  const vm = buildViewModel({ ...r, state }, {});
  assert.ok(vm.ok);
  assert.deepEqual(vm.features[0].actions[0], { kind: 'next', title: 'Next command', detail: 'Named by the state builder for this feature.', command: '/qa-run orders --type e2e', path: null });
});

test('the status bar feature is the one furthest along still in flight', () => {
  assert.equal(activeFeature(board(RICH_FIXTURE))?.slug, 'orders', 'invoices is signed off');
});

// ---- version pill ---------------------------------------------------------------------------------

test('version pill: installed bundle from the manifest, and an amber update from the notice', () => {
  const v = board(RICH_FIXTURE).version;
  assert.equal(v.board, '0.2.0');
  assert.equal(v.bundle, '2.0.3');
  assert.equal(v.bundleSource, 'manifest');
  assert.deepEqual(v.update, { kind: 'minor', installed: '2.0.3', latest: '2.1.0', label: 'update 2.1.0', command: 'afx update --bundle qa', changelogUrl: 'https://gitlab.com/agentic-fx/stlc/-/blob/main/CHANGELOG.md' });
});

test('version pill: a dismissed version is plain; a major says MAJOR; none/unknown stay plain', () => {
  assert.equal(board(RICH_FIXTURE, { dismissedUpdate: '2.1.0' }).version.update, null);
  const root = copyProject(RICH_FIXTURE);
  const file = path.join(root, '.claude/.agentic-fx-updates.json');
  const set = (kind: string): OkVM => {
    fs.writeFileSync(file, JSON.stringify({ bundles: { qa: { installed: '2.0.3', latest: '3.0.0', kind } } }));
    const r = loadState(root, 'qa/state.json');
    assert.ok(r.ok);
    const vm = buildViewModel(r, { live: new LiveReader('qa').snapshot(root, r.state) });
    assert.ok(vm.ok);
    return vm;
  };
  assert.equal(set('major').version.update?.label, 'MAJOR update 3.0.0');
  assert.equal(set('none').version.update, null);
  assert.equal(set('unknown').version.update, null);
  fs.writeFileSync(file, '{broken');
  const r = loadState(root, 'qa/state.json');
  assert.ok(r.ok);
  const vm = buildViewModel(r, { live: new LiveReader('qa').snapshot(root, r.state) });
  assert.equal(vm.version.update, null, 'an unreadable notice is a plain pill');
});

test('a failed load still carries the board version', () => {
  const vm = buildViewModel({ ok: false, reason: 'No QA state index found.', statePath: 'x', projectRoot: 'x' }, { addonVersion: '0.2.0' });
  assert.equal(vm.ok, false);
  assert.equal(vm.version.board, '0.2.0');
});

test('a run folder with no summary yet is in flight; the latest run stays the newest finished one', () => {
  const root = copyProject(RICH_FIXTURE);
  fs.mkdirSync(path.join(root, 'qa/runs/e2e/projects/2026-10-15-0937'), { recursive: true });
  const r = loadState(root, 'qa/state.json');
  assert.ok(r.ok);
  const vm = buildViewModel(r, { live: new LiveReader('qa').snapshot(root, r.state) });
  assert.ok(vm.ok);
  assert.equal(vm.inFlight?.runId, '2026-10-15-0937');
  assert.equal(vm.inFlight?.counts, null);
  assert.equal(vm.latestRun?.runId, '2026-10-13-1000');
});
