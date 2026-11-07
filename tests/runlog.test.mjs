// runlog.test.mjs — every kit script leaves one JSON line in <qa-root>/logs/runs.jsonl, whatever
// its exit path; never a secret, never a root it had to invent. Run: node --test "tests/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED = join(ROOT, 'workspace', 'qa', 'scripts', 'shared');
const { logRun, safeArgs, MAX_BYTES } = await import(pathToFileURL(join(SHARED, 'lib', 'runlog.mjs')).href);
const lines = (root) => readFileSync(join(root, 'logs', 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('one record: the §13.5 fields, the caller run id, secret flags redacted', () => {
  const root = mkdtempSync(join(tmpdir(), 'stlc-runlog-'));
  try {
    logRun(root, { script: 'triage', exit: 1 }, { env: { QA_RUN_ID: 'ci-77' }, argv: ['runs/api/x/1', '--pat', 'p4t', '--token=t0k'] });
    const [l] = lines(root);
    assert.deepEqual([l.service, l.event, l.level, l.run_id, l.slug, l.exit], ['stlc', 'script.run_completed', 'error', 'ci-77', 'runs/api/x/1', 1]);
    assert.doesNotMatch(JSON.stringify(l), /p4t|t0k/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('off, or no root: nothing written, nothing created; the file rolls past MAX_BYTES', () => {
  const missing = join(tmpdir(), `stlc-none-${process.pid}`);
  assert.equal(logRun(missing, { exit: 0 }), null);
  assert.equal(existsSync(missing), false);
  const root = mkdtempSync(join(tmpdir(), 'stlc-runlog-'));
  try {
    assert.equal(logRun(root, { exit: 0 }, { env: { QA_RUN_LOG: 'off' } }), null);
    assert.equal(existsSync(join(root, 'logs')), false);
    mkdirSync(join(root, 'logs'));
    writeFileSync(join(root, 'logs', 'runs.jsonl'), 'x'.repeat(MAX_BYTES + 1));
    logRun(root, { exit: 0 }, { env: {}, argv: [] });
    assert.ok(statSync(join(root, 'logs', 'runs.1.jsonl')).size > MAX_BYTES);
    assert.equal(lines(root).length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
  assert.deepEqual(safeArgs(['--password', 'p', '--api-key=k', 'a']), ['--password', '[REDACTED]', '--api-key=[REDACTED]', 'a']);
});

test('a real script run is logged with its exit code, including a usage error', () => {
  const root = mkdtempSync(join(tmpdir(), 'stlc-runlog-'));
  try {
    mkdirSync(join(root, 'cases'));
    const env = { ...process.env, QA_ROOT_DIR: root, QA_RUN_ID: 'gate-x', QA_RUN_LOG: '' };
    delete env.ELECTRON_RUN_AS_NODE;
    const r = spawnSync(process.execPath, [join(SHARED, 'triage.mjs')], { cwd: root, env, encoding: 'utf8' });
    assert.equal(r.status, 2);
    const [l] = lines(root);
    assert.deepEqual([l.script, l.exit, l.run_id, l.level], ['triage', 2, 'gate-x', 'error']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
