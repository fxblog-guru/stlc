/**
 * Tests for the realtime layer: which file events matter, how a burst becomes one redraw, how each
 * QA file is parsed (run plans, summaries, failures, case platforms, coverage score, the update
 * notice), and what a snapshot of a project reads.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  Debouncer,
  LiveReader,
  Throttle,
  Timers,
  classify,
  parseCaseHeader,
  parseCoverageScore,
  parseFailures,
  parseFrontMatter,
  parseManifestVersion,
  parseReflog,
  parseRunPlan,
  parseRunSummary,
  parseTraceability,
  parseUpdateNotice,
  relativeTime,
  verdictOf,
} from '../live';
import { loadState } from '../model';
import { BUNDLE_FIXTURE, RICH_FIXTURE, copyProject, touch, write } from './helpers';

function fakeTimers(): Timers & { advance(ms: number): void } {
  let now = 1_000_000;
  let seq = 0;
  const queue = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = ++seq;
      queue.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(h) {
      queue.delete(h as number);
    },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...queue.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        queue.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = until;
    },
  };
}

// ---- classify -------------------------------------------------------------------------------------

test('classify names every source the board watches', () => {
  assert.equal(classify('qa/state.json'), 'state');
  assert.equal(classify('qa/runs/e2e/orders/2026-10-12-0900/summary.md'), 'run');
  assert.equal(classify('qa\\runs\\plans\\orders-smoke\\2026-10-13-1000\\failures.md'), 'failures');
  assert.equal(classify('qa/runs/env-checks/uat/2026-10-12-0800/readiness.md'), 'run');
  assert.equal(classify('qa/reports/orders/2026-09-11-report.md'), 'report');
  assert.equal(classify('qa/reports/orders/coverage-score-2026-10-13.md'), 'report');
  assert.equal(classify('qa/defects/orders/DEF-orders-001-x.md'), 'defect');
  assert.equal(classify('qa/run-plans/orders-smoke.md'), 'run-plan');
  assert.equal(classify('qa/regression/quarantine.md'), 'quarantine');
  assert.equal(classify('qa/plans/orders/2026-10-01-test-plan.md'), 'plan');
  assert.equal(classify('qa/cases/e2e/orders/TC-E2E-ORDERS-001-x.md'), 'case');
  assert.equal(classify('.git/logs/HEAD'), 'git');
  assert.equal(classify('.claude/.agentic-fx-updates.json'), 'bundle');
  assert.equal(classify('.claude/.agentic-fx.json'), 'bundle');
  assert.equal(classify('VERSION'), 'bundle');
});

test('classify ignores what the board does not read, and agent copies', () => {
  assert.equal(classify('.claude/worktrees/x/qa/state.json'), null);
  assert.equal(classify('qa/.env.uat'), null);
  assert.equal(classify('qa/scripts/e2e/orders/x.spec.ts'), null);
  assert.equal(classify('src/app.ts'), null);
  assert.equal(classify('.git/objects/ab/cdef'), null);
  assert.equal(classify('qa/runs/e2e/orders'), null);
  assert.equal(classify('quality/state.json', 'quality'), 'state');
  assert.equal(classify('qa/state.json', 'quality'), null);
});

test('classify reads a .stlc root (a dot folder, CONTRACTS §2) and still ignores dot folders inside it', () => {
  assert.equal(classify('.stlc/state.json', '.stlc'), 'state');
  assert.equal(classify('.stlc/runs/e2e/orders/2026-10-12-0900/failures.md', '.stlc'), 'failures');
  assert.equal(classify('.stlc/cases/e2e/orders/TC-E2E-ORDERS-001-x.md', '.stlc'), 'case');
  assert.equal(classify('.stlc/.auth/uat/default.json', '.stlc'), null);
  assert.equal(classify('.stlc/reports/orders/.tmp/x.md', '.stlc'), null, 'a dot folder inside the root is scratch, even where a report would sit');
  assert.equal(classify('.claude/worktrees/x/.stlc/state.json', '.stlc'), null);
  assert.equal(classify('qa/state.json', '.stlc'), null);
});

test('a burst of events becomes one flush with every kind, bounded by maxWait', () => {
  const t = fakeTimers();
  const flushes: string[][] = [];
  const d = new Debouncer<string>((k) => flushes.push([...k].sort()), 300, t, 1500);
  d.push('run');
  t.advance(100);
  d.push('failures');
  t.advance(299);
  assert.equal(flushes.length, 0);
  t.advance(1);
  assert.deepEqual(flushes, [['failures', 'run']]);
  for (let n = 0; n < 10; n++) {
    d.push('run');
    t.advance(200);
  }
  assert.equal(flushes.length, 2, 'a file rewritten every 200 ms still redraws within maxWait');
  d.dispose();
});

test('relativeTime is the page clock', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  assert.equal(relativeTime(now - 10_000, now), 'just now');
  assert.equal(relativeTime(now - 5 * 60_000, now), '5 min ago');
  assert.equal(relativeTime(now - 3 * 3600_000, now), '3 h ago');
  assert.equal(relativeTime('2026-09-01T00:00:00Z', now), 'Sep 1');
  assert.equal(relativeTime('nonsense', now), '');
});

// ---- parsers --------------------------------------------------------------------------------------

test('front matter: scalars, lists, inline maps and one nested block', () => {
  const fm = parseFrontMatter('---\nname: x\nshards: 2\nretries: 0\nbrowsers: [chromium, firefox]\nverdicts: { api: READY, e2e: BLOCKED }\nselect:\n  features: [a, b]\n  types: [api]\nexclude:\n  quarantined: true\n---\nbody');
  assert.ok(fm);
  assert.equal(fm.name, 'x');
  assert.equal(fm.shards, 2);
  assert.deepEqual(fm.browsers, ['chromium', 'firefox']);
  assert.deepEqual(fm.verdicts, { api: 'READY', e2e: 'BLOCKED' });
  assert.deepEqual(fm.select, { features: ['a', 'b'], types: ['api'] });
  assert.deepEqual(fm.exclude, { quarantined: true });
  assert.equal(parseFrontMatter('no front matter'), null);
});

test('the bundle fixture run plan parses: name, description, resolved cases and the manual one', () => {
  const p = parseRunPlan(fs.readFileSync(path.join(BUNDLE_FIXTURE, 'qa/run-plans/orders-release.md'), 'utf8'));
  assert.equal(p.name, 'orders-release');
  assert.match(p.description, /Orders release check/);
  assert.equal(p.env, 'uat');
  assert.deepEqual(p.select, { features: ['orders'], types: ['api', 'accessibility'] });
  assert.equal(p.resolved, true);
  assert.deepEqual(p.cases.map((c) => c.id), ['TC-API-ORDERS-001', 'TC-A11Y-ORDERS-001', 'TC-A11Y-ORDERS-002']);
  assert.deepEqual(p.cases.map((c) => c.manual), [false, false, true]);
  assert.equal(p.cases[0].script, 'scripts/api/orders/TC-API-ORDERS-001-create-order-contract.spec.ts');
});

test('a run plan with no Resolved cases section is unresolved, not empty-and-fine', () => {
  const p = parseRunPlan('---\nname: nightly\ndescription: d\nselect:\n  suites: [regression]\n---\n\n# Run plan\n', 'fallback');
  assert.equal(p.name, 'nightly');
  assert.equal(p.resolved, false);
  assert.equal(p.cases.length, 0);
  assert.equal(parseRunPlan('# nothing', 'from-file').name, 'from-file');
});

test('traceability rows are read by header name from the plan', () => {
  const rows = parseTraceability(fs.readFileSync(path.join(BUNDLE_FIXTURE, 'qa/plans/orders/2026-09-01-test-plan.md'), 'utf8'));
  assert.equal(rows.length, 11);
  assert.equal(rows.find((r) => r.caseId === 'TC-DATA-ORDERS-001')?.type, 'data'); // the data type (CONTRACTS §28)
  const flow = rows.find((r) => r.caseId === 'TC-MOB-ORDERS-002'); // the Maestro flow (CONTRACTS §15)
  assert.equal(flow?.type, 'mobile');
  assert.equal(flow?.scripted, true);
  assert.equal(verdictOf(flow?.status ?? ''), 'not-run');
  const mob = rows.find((r) => r.caseId === 'TC-MOB-ORDERS-001');
  assert.ok(mob);
  assert.equal(mob.type, 'mobile');
  assert.equal(mob.scripted, true);
  assert.equal(verdictOf(mob.status), 'handoff');
  assert.equal(rows.find((r) => r.caseId === 'TC-INT-ORDERS-001')?.lastRun, null);
});

test('verdictOf reads the §3 Status vocabulary', () => {
  assert.equal(verdictOf('✅'), 'pass');
  assert.equal(verdictOf('❌'), 'fail');
  assert.equal(verdictOf('⛔ blocked — skipped: env down'), 'blocked');
  assert.equal(verdictOf('⛔ blocked — awaiting handoff'), 'handoff');
  assert.equal(verdictOf('manual'), 'manual');
  assert.equal(verdictOf('—'), 'not-run');
});

test('case platforms: header, then @platform tags, then the mobile ## Platforms section, else none', () => {
  assert.deepEqual(parseCaseHeader('# TC-E2E-X-001 — t\n**Type:** e2e\n**Platform:** web, windows\n')?.platforms, ['web', 'windows']);
  const tag = parseCaseHeader('# TC-UI-X-001 — t\n**Type:** ui\n**Tags:** @ui @platform:windows @platform:macos\n');
  assert.deepEqual(tag?.platforms, ['windows', 'macos']);
  assert.equal(tag?.platformSource, 'tag');
  const sec = parseCaseHeader('# TC-MOB-X-001 — t\n**Type:** mobile\n\n## Platforms\n- android\n- ios\n\n## Steps\n');
  assert.deepEqual(sec?.platforms, ['android', 'ios']);
  assert.equal(sec?.platformSource, 'section');
  const none = parseCaseHeader('# TC-API-X-001 — t\n**Type:** api\n');
  assert.deepEqual(none?.platforms, []);
  assert.equal(none?.platformSource, null);
  assert.equal(parseCaseHeader('# Not a case'), null);
});

test('a run-plan summary.md: plan, env, SHA, counts from the counts table, one row per case', () => {
  const s = parseRunSummary(fs.readFileSync(path.join(RICH_FIXTURE, 'qa/runs/plans/orders-smoke/2026-10-13-1000/summary.md'), 'utf8'));
  assert.equal(s.plan, 'orders-smoke');
  assert.equal(s.env, 'uat');
  assert.equal(s.sha, '3b9d0e1');
  assert.deepEqual(s.counts, { pass: 2, fail: 1, blocked: 0, manual: 0, total: 3 });
  assert.deepEqual(s.cases.map((c) => [c.id, c.verdict, c.feature]), [
    ['TC-API-ORDERS-001', 'pass', 'orders'],
    ['TC-API-ORDERS-002', 'pass', 'orders'],
    ['TC-INT-ORDERS-001', 'fail', 'orders'],
  ]);
});

test('a per-type summary with only a case table is counted from its rows', () => {
  const s = parseRunSummary('# Run\n\n| Case ID | Status |\n|---|---|\n| TC-A-001 | ✅ |\n| TC-A-002 | ❌ |\n| TC-A-003 | ⛔ blocked — awaiting handoff |\n');
  assert.deepEqual(s.counts, { pass: 1, fail: 1, blocked: 1, manual: 0, total: 3 });
});

test('failures.md: heading blocks and tables both yield a triage token; SETUP/ENV is spelled SETUP-ENV', () => {
  const blocks = parseFailures(fs.readFileSync(path.join(RICH_FIXTURE, 'qa/runs/e2e/orders/2026-10-12-0900/failures.md'), 'utf8'));
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].caseId, 'TC-E2E-ORDERS-001');
  assert.equal(blocks[0].triage, 'FUNCTIONAL');
  assert.match(blocks[0].error ?? '', /new order row never appeared/);
  const table = parseFailures(fs.readFileSync(path.join(RICH_FIXTURE, 'qa/runs/plans/orders-smoke/2026-10-13-1000/failures.md'), 'utf8'));
  assert.deepEqual(table.map((f) => [f.caseId, f.triage]), [['TC-INT-ORDERS-001', 'SETUP-ENV']]);
  const flaky = parseFailures('### TC-E2E-A-001\n- **Suspected cause:** FLAKY — passed on the identical re-run\n### TC-E2E-A-002\n- **Error:** boom\n');
  assert.deepEqual(flaky.map((f) => f.triage), ['FLAKY', null], 'an unclassified failure is not given a class');
});

test('coverage score: summary line and GAP lines; anything else is not a score', () => {
  const c = parseCoverageScore('case-score — 4 REQ(s), 2 blocking gap(s), 0 baselined, 1 advisory\n  GAP   orders/REQ-001/error-contract\n  GAP   orders/REQ-004/negative\n');
  assert.deepEqual(c, { reqs: 4, blocking: 2, gaps: ['orders/REQ-001/error-contract', 'orders/REQ-004/negative'] });
  assert.deepEqual(parseCoverageScore('case-score — 3 REQ(s), 0 blocking gap(s), 0 baselined, 0 advisory'), { reqs: 3, blocking: 0, gaps: [] });
  assert.equal(parseCoverageScore('# a report'), null);
});

// ---- update notice and manifest -------------------------------------------------------------------

test('update notice: the qa entry is read; kind is one of five words; the URL must be http(s)', () => {
  const n = parseUpdateNotice(fs.readFileSync(path.join(RICH_FIXTURE, '.claude/.agentic-fx-updates.json'), 'utf8'));
  assert.deepEqual(n, {
    checkedAt: '2026-10-14T08:00:00Z',
    installed: '2.0.3',
    latest: '2.1.0',
    kind: 'minor',
    command: 'afx update --bundle qa',
    changelogUrl: 'https://gitlab.com/agentic-fx/stlc/-/blob/main/CHANGELOG.md',
  });
  const odd = parseUpdateNotice(JSON.stringify({ bundles: { qa: { latest: '3.0.0', kind: 'huge', changelog_url: 'javascript:alert(1)' } } }));
  assert.equal(odd?.kind, 'unknown');
  assert.equal(odd?.changelogUrl, null);
  assert.equal(odd?.command, 'afx update --bundle qa', 'no source: the afx command');
  const npx = (extra: object) => parseUpdateNotice(JSON.stringify({ bundles: { qa: { latest: '3.0.0', kind: 'major', ...extra } } }))?.command;
  assert.equal(npx({ source: 'npm:agentic-fx@0.1.0' }), 'npx agentic-fx@latest update --bundle qa');
  assert.equal(npx({ source: 'npm:x', command: 'rm -rf ~' }), 'npx agentic-fx@latest update --bundle qa', 'the file never picks what runs');
  assert.equal(npx({ command: 'rm -rf ~' }), 'afx update --bundle qa', 'the file never picks what runs');
});

test('update notice: unreadable, malformed or without a qa entry is null (plain pill)', () => {
  assert.equal(parseUpdateNotice('{not json'), null);
  assert.equal(parseUpdateNotice('[]'), null);
  assert.equal(parseUpdateNotice(JSON.stringify({ bundles: { dev: { kind: 'major' } } })), null);
  assert.equal(parseUpdateNotice(JSON.stringify({ checked_at: 'x' })), null);
});

test('manifest version: the qa entry, or null', () => {
  assert.deepEqual(parseManifestVersion(JSON.stringify({ qa: { version: '2.0.3', commit: 'abc' } })), { version: '2.0.3', commit: 'abc' });
  assert.equal(parseManifestVersion(JSON.stringify({ qa: { claude: [] } })), null, 'a manifest from before versions were recorded');
  assert.equal(parseManifestVersion('nope'), null);
});

test('reflog: newest commits first, merges named, checkouts skipped', () => {
  const z = '0'.repeat(40);
  const a = 'a'.repeat(40);
  const b = 'b'.repeat(40);
  const text = [`${z} ${a} Dev <d@example.com> 1760000000 +0000\tcommit (initial): first`, `${a} ${b} Dev <d@example.com> 1760000100 +0000\tcheckout: moving from main to x`, `${a} ${b} Dev <d@example.com> 1760000200 +0000\tcommit: second`].join('\n');
  const c = parseReflog(text);
  assert.deepEqual(c.map((x) => x.subject), ['second', 'first']);
  assert.equal(c[0].sha, 'bbbbbbb');
});

// ---- snapshot -------------------------------------------------------------------------------------

test('snapshot of the rich fixture: runs, run plans with last run, coverage, bundle version and update', () => {
  const root = copyProject(RICH_FIXTURE);
  const r = loadState(root, 'qa/state.json');
  assert.ok(r.ok);
  const live = new LiveReader('qa').snapshot(root, r.state);
  assert.equal(live.ahead, false, 'nothing is newer than the index');
  assert.equal(live.runs[0].runId, '2026-10-13-1000');
  assert.equal(live.runs[0].kind, 'plan');
  assert.ok(live.runs.some((x) => x.htmlReport === 'qa/runs/e2e/orders/2026-10-12-0900/html-report/index.html'));
  const e2e = live.runs.find((x) => x.runId === '2026-10-12-0900');
  assert.deepEqual(e2e?.traces, ['qa/runs/e2e/orders/2026-10-12-0900/test-results/orders-create/trace.zip']);
  assert.deepEqual(live.runPlans.map((p) => [p.plan.name, p.lastRun?.runId ?? null]), [
    ['nightly-regression', null],
    ['orders-smoke', '2026-10-13-1000'],
    ['release-2026-10', null],
  ]);
  assert.deepEqual(live.coverage?.gaps, ['orders/REQ-001/error-contract', 'orders/REQ-004/negative']);
  assert.deepEqual(live.bundle, { version: '2.0.3', source: 'manifest', commit: '4f1c2ab' });
  assert.equal(live.update?.kind, 'minor');
  assert.equal(live.knowledgeCards, 2);
  assert.equal(live.cases.get('TC-UI-ORDERS-001')?.platforms.join(','), 'windows,macos');
  assert.equal(live.traceRows.get('orders')?.length, 12);
});

test('a run written after the index is inferred as running on its feature, and named in the feed', () => {
  const root = copyProject(RICH_FIXTURE);
  const r = loadState(root, 'qa/state.json');
  assert.ok(r.ok);
  const later = new Date(Date.parse(r.state.generated_at) + 3600_000);
  write(root, 'qa/runs/api/projects/2026-10-14-1000/summary.md', '| Case ID | Status |\n|---|---|\n| TC-API-PROJECTS-001 | ❌ |\n', later);
  write(root, 'qa/runs/api/projects/2026-10-14-1000/failures.md', '### TC-API-PROJECTS-001\n- **Suspected cause:** SCRIPT — wrong base URL\n', later);
  touch(path.join(root, 'qa/runs/api/projects/2026-10-14-1000'), later);
  const live = new LiveReader('qa').snapshot(root, r.state);
  assert.equal(live.ahead, true);
  const o = live.overlays.get('projects');
  assert.equal(o?.[0].step, 'run');
  assert.match(o?.[0].note ?? '', /^Inferred: run 2026-10-14-1000/);
  assert.equal(live.runs[0].runId, '2026-10-14-1000');
  assert.equal(live.runs[0].failures[0].triage, 'SCRIPT');
  assert.equal(live.activity[0].kind, 'failures');
});

test('no manifest version: VERSION is the fallback; no notice: update is null', () => {
  const root = copyProject(RICH_FIXTURE);
  fs.rmSync(path.join(root, '.claude/.agentic-fx.json'));
  fs.rmSync(path.join(root, '.claude/.agentic-fx-updates.json'));
  fs.writeFileSync(path.join(root, 'VERSION'), '1.4.0\n');
  const r = loadState(root, 'qa/state.json');
  assert.ok(r.ok);
  const live = new LiveReader('qa').snapshot(root, r.state);
  assert.deepEqual(live.bundle, { version: '1.4.0', source: 'VERSION', commit: null });
  assert.equal(live.update, null);
});

test('the bundle fixture reads too: its one run plan, no runs with summaries, no coverage file', () => {
  const root = copyProject(BUNDLE_FIXTURE);
  const r = loadState(root, 'qa/state.json');
  assert.ok(r.ok);
  const live = new LiveReader('qa').snapshot(root, r.state);
  assert.deepEqual(live.runPlans.map((p) => p.plan.name), ['orders-release']);
  assert.equal(live.coverage, null);
  assert.equal(live.cases.get('TC-MOB-ORDERS-001')?.platforms.join(','), 'android,ios');
});

test('the background rebuild runs at most once per interval, with one trailing run', async () => {
  const t = fakeTimers();
  let runs = 0;
  const th = new Throttle(async () => {
    runs++;
  }, 60_000, t);
  th.request();
  await Promise.resolve();
  assert.equal(runs, 1);
  th.request();
  th.request();
  th.request();
  await Promise.resolve();
  assert.equal(runs, 1, 'ran again inside the interval');
  t.advance(60_000);
  await new Promise((r) => setImmediate(r));
  assert.equal(runs, 2, 'the trailing request did not run');
  t.advance(600_000);
  await new Promise((r) => setImmediate(r));
  assert.equal(runs, 2, 'ran with nothing requested');
});
