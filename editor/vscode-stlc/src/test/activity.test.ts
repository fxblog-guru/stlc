/**
 * The shared activity format, read side. vscode-sdlc, vscode-eval and vscode-qa-standup carry the
 * same cases against their copy of activity.ts. The tests below them cover what this board builds
 * from the log: Activity, Findings, Decisions (the clarification sheet) and Needs you.
 */

import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ActivityEvent, isEvent, openNeeds, parseActivity } from '../activity';
import { LiveReader, classify, parseClarifications } from '../live';
import { loadState } from '../model';
import { buildViewModel, decisionList, findingList, needsYou } from '../viewmodel';
import { RICH_FIXTURE, copyProject, write } from './helpers';

const ev = (over: Partial<ActivityEvent>): ActivityEvent => ({ v: 1, at: '2026-10-22T09:00:00Z', source: 'stlc', kind: 'run', slug: 'demo', outcome: 'pass', title: 'Run plan demo: 1 pass', link: null, needs: null, ...over });

test('parseActivity keeps valid lines newest first and skips torn or foreign ones', () => {
  const text = [
    JSON.stringify(ev({ at: '2026-10-22T08:00:00Z', title: 'older' })),
    '{"v":1,"at":"2026-10-22T09',
    JSON.stringify({ ...ev({}), v: 2 }),
    JSON.stringify(ev({ at: '2026-10-22T10:00:00Z', title: 'newer' })),
    '',
  ].join('\n');
  assert.deepEqual(parseActivity(text).map((e) => e.title), ['newer', 'older']);
});

test('isEvent refuses each broken field', () => {
  assert.ok(isEvent(ev({})));
  for (const bad of [{ at: '2026-10-22 09:00' }, { source: 'jira' }, { kind: 'commit' }, { outcome: 'ok' }, { title: '' }, { needs: 'coffee' }]) {
    assert.equal(isEvent({ ...ev({}), ...bad }), false, JSON.stringify(bad));
  }
});

test('openNeeds: a need stays until a later pass for the same slug and link clears it', () => {
  const events = [
    ev({ at: '2026-10-22T11:00:00Z', kind: 'decision', title: 'DEC-004 answered', outcome: 'pass', slug: 'demo', link: 'x' }),
    ev({ at: '2026-10-22T10:00:00Z', kind: 'decision', title: 'DEC-004 assumed', outcome: 'info', needs: 'confirm-dec', link: 'x' }),
    ev({ at: '2026-10-22T09:30:00Z', kind: 'gate', title: 'G5 ui PASS', needs: 'approve-ui', link: 'g5.md' }),
    ev({ at: '2026-10-22T09:00:00Z', kind: 'gate', title: 'G5 ui PASS (older)', needs: 'approve-ui', link: 'g5.md' }),
    ev({ at: '2026-10-22T08:00:00Z', kind: 'stop', title: 'stopped at merge', outcome: 'stopped', needs: 'merge', slug: 'other' }),
  ];
  const open = openNeeds(events);
  assert.deepEqual(open.map((n) => `${n.slug} ${n.need}`), ['demo approve-ui', 'other merge'], 'DEC-004 is cleared, G5 listed once');
});

// ---- what the board builds from the log --------------------------------------------------------------

const SHEET = `# Clarifications — orders

### Q-001 [BLOCKING] — Is a zero-quantity line allowed?
**QA assumes meanwhile:** rejected with 422 — **cost if wrong:** 3 cases
<!-- When answered: **Status:** ANSWERED — <answer> (YYYY-MM-DD, <who>) -->
**Status:** OPEN

### Q-002 [NON-BLOCKING] — Which currency rounds half-up?
**QA assumes meanwhile:** all of them — **cost if wrong:** 1 case
**Status:** OPEN

### Q-003 [NON-BLOCKING] — Max lines per order?
**Status:** ANSWERED — 200 (2026-10-20, PO)

<!-- ### Q-999 [BLOCKING] — a commented-out example is no question -->
`;

test('clarifications: open blocking, assumed (open with an assumption), answered; open first', () => {
  const qs = parseClarifications(SHEET);
  assert.deepEqual(qs.map((q) => `${q.id} ${q.status} ${q.blocking}`), ['Q-001 open true', 'Q-002 open false', 'Q-003 answered false']);
  assert.equal(qs[2].answer, '200 (2026-10-20, PO)');
  const d = decisionList([...qs].reverse());
  assert.deepEqual(d.map((x) => `${x.id} ${x.status}`), ['Q-001 open', 'Q-002 assumed', 'Q-003 answered']);
  assert.equal(d[1].note, 'all of them');
  assert.equal(classify('qa/analysis/orders/2026-10-20-clarifications.md'), 'clarify');
  assert.equal(classify('qa/logs/activity.jsonl'), 'activity');
  assert.equal(classify('qa/logs/runs.jsonl'), null);
});

test('findings: rated defects first, then flaky and new failures from the log, then quarantine', () => {
  const f = {
    defects: { open: 2, bySeverity: { Critical: 0, High: 0, Medium: 1, Low: 0, Unrated: 0 }, items: [{ id: 'DEF-o-002', severity: 'Medium' as const, origin: null, title: 'b', path: 'd2.md' }, { id: 'DEF-o-001', severity: 'Critical' as const, origin: null, title: 'a', path: 'd1.md' }] },
    quarantine: { active: 1, expired: 0, nearest: null, items: [{ caseId: 'TC-E2E-O-002', until: '2026-10-30', reason: 'late chips', ticket: null, expired: false }] },
  };
  const list = findingList(f, [
    ev({ kind: 'finding', outcome: 'fail', title: 'Flaky TC-API-O-001: failed 1 of 3 runs', link: 'qa/runs/flaky/o/r/stability.md' }),
    ev({ kind: 'finding', outcome: 'fail', title: 'Flaky TC-API-O-001: failed 1 of 3 runs', at: '2026-10-21T09:00:00Z' }),
    ev({ kind: 'finding', outcome: 'fail', title: 'New failure TC-API-O-004 (FUNCTIONAL)' }),
    ev({ kind: 'heal', outcome: 'fail', title: 'Heal refused: 1 blocked change in 1 file' }),
  ]);
  assert.deepEqual(list.map((x) => `${x.kind} ${x.id}`), ['defect DEF-o-001', 'defect DEF-o-002', 'flaky TC-API-O-001', 'failure TC-API-O-004', 'quarantine TC-E2E-O-002'], 'a finding said twice is listed once; a heal is not a finding');
  assert.equal(list[2].path, 'qa/runs/flaky/o/r/stability.md');
});

test('needsYou: questions to answer and confirm, a passed report with no sign-off, and the log; not twice', () => {
  const decisions = { list: decisionList(parseClarifications(SHEET)), path: 'qa/analysis/orders/c.md' };
  const report = { path: 'r.md', date: '2026-10-21', overall: 'pass', stale: false, newerRuns: [], sha: null };
  const needs = needsYou({ slug: 'orders', decisions, report, signoff: null }, [
    ev({ slug: 'orders', kind: 'stop', outcome: 'stopped', needs: 'review-stop', title: 'run stopped at the env check', link: 'x.md' }),
    ev({ slug: null, kind: 'stop', outcome: 'stopped', needs: 'push', title: 'project-wide push' }),
    ev({ slug: 'orders', kind: 'decision', outcome: 'info', needs: 'confirm-dec', title: 'Q-002 assumed' }),
    ev({ slug: 'invoices', kind: 'stop', outcome: 'stopped', needs: 'merge', title: 'not ours' }),
  ]);
  assert.deepEqual(needs.map((n) => n.need), ['answer-dec', 'confirm-dec', 'sign-off', 'review-stop', 'push']);
  assert.equal(needs[0].command, '/qa-clarify orders');
  assert.equal(needs[0].link, 'qa/analysis/orders/c.md');
  assert.equal(needsYou({ slug: 'orders', decisions: { list: [], path: null }, report: { ...report, stale: true }, signoff: null }, []).length, 0, 'a stale report asks for a new report, not a sign-off');
});

test('snapshot: the log reaches Activity, Findings and Needs you; a run already in the feed is not repeated', () => {
  const root = copyProject(RICH_FIXTURE);
  const r = loadState(root, 'qa/state.json');
  assert.ok(r.ok);
  const lines = [
    ev({ slug: 'orders', kind: 'finding', outcome: 'fail', title: 'Flaky TC-API-ORDERS-001: failed 2 of 10 runs', at: '2026-10-22T08:00:00Z' }),
    ev({ slug: null, kind: 'heal', outcome: 'pass', title: 'Heal allowed: 1 changed file passed the guard', at: '2026-10-22T08:30:00Z' }),
    ev({ slug: 'orders', kind: 'stop', outcome: 'stopped', needs: 'review-stop', title: 'Run stopped: env not ready', at: '2026-10-22T08:40:00Z' }),
  ];
  write(root, 'qa/logs/activity.jsonl', lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  write(root, 'qa/analysis/orders/2026-10-21-clarifications.md', SHEET);
  const live = new LiveReader('qa').snapshot(root, r.state);
  assert.equal(live.events.length, 3);
  const runId = live.runs[0]?.runId;
  assert.ok(runId, 'the rich fixture has runs');
  write(root, 'qa/logs/activity.jsonl', [...lines, ev({ slug: 'smoke', kind: 'run', run_id: runId, title: 'Run plan smoke: dup' })].map((l) => JSON.stringify(l)).join('\n') + '\n');
  const live2 = new LiveReader('qa').snapshot(root, r.state);
  assert.ok(live2.activity.some((a) => a.kind === 'heal'), 'the heal is in the feed');
  assert.ok(!live2.activity.some((a) => a.title === 'Run plan smoke: dup'), 'a run folder the feed shows is not said twice');
  const vm = buildViewModel(r, { live: live2, now: 0 });
  assert.ok(vm.ok);
  const orders = vm.features.find((f) => f.slug === 'orders')!;
  assert.ok(orders.findings.some((x) => x.kind === 'flaky'));
  assert.equal(orders.findings[0].severity, 'Critical', 'the Critical defect leads');
  assert.deepEqual(orders.needsYou.map((n) => n.need), ['answer-dec', 'confirm-dec', 'review-stop']);
  assert.deepEqual(orders.decisions.list.map((d) => d.id), ['Q-001', 'Q-002', 'Q-003']);
  assert.ok(orders.percentDone > 0 && orders.percentDone < 100, String(orders.percentDone));
});

test('a long id list in Needs you is a range, not a wall of ids', async () => {
  const { idSpan } = await import('../viewmodel');
  assert.equal(idSpan(['DEC-001', 'DEC-002']), 'DEC-001, DEC-002');
  assert.equal(idSpan(['DEC-009', 'DEC-010', 'DEC-011', 'DEC-033']), 'DEC-009 … DEC-033');
});
