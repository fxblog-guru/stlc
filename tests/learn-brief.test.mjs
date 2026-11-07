// learn-brief.test.mjs — the session-start learning brief (CONTRACTS §23): it says once what is new
// since the last session (signals not yet a lesson, cases newly measured flaky, new escapes, lessons
// written), says nothing when nothing is new, and never fails a session. Run: node --test "tests/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.QA_RUN_LOG = 'off';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEARN = join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'learnings.mjs');
const brief = (root, ...extra) => spawnSync(process.execPath, [LEARN, 'brief', '--root', root, ...extra], { cwd: dirname(root), encoding: 'utf8', env: { ...process.env, QA_RUN_LOG: 'off' } });

const failure = (id) => `## ${id} — t\n- **Error:** Timeout 5000ms exceeded\n- **Suspected cause:** FLAKY\n  flake-kind: timing\n`;
const ESCAPES = (rows) => `# Escaped defects\n\n| DEF | Feature | Reported | Phase missed | Type missed | Backfill | Status |\n|---|---|---|---|---|---|---|\n${rows.map((d) => `| ${d} | orders | 2026-09-12 | DESIGN | unit | pending | OPEN |`).join('\n')}\n`;

function project() {
  const base = mkdtempSync(join(tmpdir(), 'stlc-brief-'));
  const root = join(base, '.stlc');
  for (const run of ['2026-09-01-1000', '2026-09-02-1000']) {
    mkdirSync(join(root, 'runs', 'e2e', 'orders', run), { recursive: true });
    writeFileSync(join(root, 'runs', 'e2e', 'orders', run, 'failures.md'), failure('TC-E2E-ORDERS-001'));
  }
  mkdirSync(join(root, 'defects'), { recursive: true });
  writeFileSync(join(root, 'defects', 'ESCAPES.md'), ESCAPES([]));
  return { base, root };
}

test('first session names what is new; the second says nothing; a new escape and a new flake are said once', () => {
  const { base, root } = project();
  try {
    const first = brief(root);
    assert.equal(first.status, 0);
    assert.match(first.stdout, /Learning: 2 new signal\(s\) not yet a lesson — \/qa-learn/);
    assert.match(first.stdout, /recurring flake ×2 {2}TC-E2E-ORDERS-001/);
    assert.ok(JSON.parse(readFileSync(join(root, 'logs', 'learn-brief.json'), 'utf8')).signals.length, 'nothing remembered');

    assert.equal(brief(root).stdout, '', 'the same signal was announced twice');

    writeFileSync(join(root, 'defects', 'ESCAPES.md'), ESCAPES(['DEF-orders-003']));
    const run = join(root, 'runs', 'flaky', 'orders', '2026-09-03-1000');
    mkdirSync(run, { recursive: true });
    writeFileSync(join(run, 'stability.md'), '# Stability\n\n| Case ID | Project | Failed | Rate | Verdict | Errors |\n|---|---|---|---|---|---|\n| TC-E2E-ORDERS-002 | chromium | 3/20 | 15 % | flaky | timeout |\n');
    const third = brief(root);
    assert.match(third.stdout, /Escapes: 1 new in defects\/ESCAPES\.md — DEF-orders-003/);
    assert.match(third.stdout, /Flaky: 1 case\(s\) newly measured flaky — TC-E2E-ORDERS-002/);
    assert.equal(brief(root).stdout, '');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('--peek prints without remembering; a missing root or a corrupt memory never fails', () => {
  const { base, root } = project();
  try {
    assert.match(brief(root, '--peek').stdout, /new signal/);
    assert.match(brief(root, '--peek').stdout, /new signal/, '--peek wrote the memory');
    mkdirSync(join(root, 'logs'), { recursive: true });
    writeFileSync(join(root, 'logs', 'learn-brief.json'), '{not json');
    assert.equal(brief(root).status, 0);
    const none = brief(join(base, 'nowhere'));
    assert.deepEqual([none.status, none.stdout], [0, '']);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('SessionStart runs the brief after the posture, and it cannot fail the hook', () => {
  const settings = JSON.parse(readFileSync(join(ROOT, 'settings.json'), 'utf8'));
  const cmds = settings.hooks.SessionStart.flatMap((h) => h.hooks.map((x) => x.command));
  const i = cmds.findIndex((c) => /node "\$r\/scripts\/shared\/learnings\.mjs" brief --root "\$r" \|\| true/.test(c));
  assert.ok(i > 0, 'SessionStart does not run learnings.mjs brief after status.mjs');
  assert.match(cmds[i], /for r in "\$\{QA_ROOT:-\.stlc\}" \.stlc qa; do/);
});
