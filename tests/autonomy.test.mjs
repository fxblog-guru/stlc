// autonomy.mjs — an unattended QA run stops at every hard stop whatever the mode, and runs a
// security or load test only on an environment PROJECT-PROFILE §Environments authorises.
//   node --test tests/autonomy.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'autonomy.mjs');
const { HARD, envAuthorized, mode } = await import(pathToFileURL(SCRIPT).href);
const PROFILE = readFileSync(join(ROOT, 'PROJECT-PROFILE.md'), 'utf8');
const RUN = '20261022-130000-beef';

function project(autonomy) {
  const dir = mkdtempSync(join(tmpdir(), 'qa-auto-'));
  mkdirSync(join(dir, '.stlc'), { recursive: true });
  writeFileSync(join(dir, 'PROJECT-PROFILE.md'), PROFILE);
  const env = { ...process.env, QA_AUTONOMY: autonomy, QA_BUDGET_TOKENS: '', QA_BUDGET_MINUTES: '', ACTIVITY_LOG: '', QA_RUN_LOG: 'off' };
  const run = (...a) => spawnSync(process.execPath, [SCRIPT, ...a, '--run', RUN, '--root', join(dir, '.stlc')], { cwd: dir, encoding: 'utf8', env });
  return { dir, root: join(dir, '.stlc'), run, env };
}

test('mode: QA_AUTONOMY, else the profile line, else off', () => {
  assert.equal(mode('', {}), 'off');
  assert.equal(mode('- **Autonomy:** `assisted`', {}), 'assisted');
  assert.equal(mode('- **Autonomy:** `assisted`', { QA_AUTONOMY: 'full' }), 'full');
  assert.equal(mode('', { QA_AUTONOMY: 'nope' }), 'off');
});

test('envAuthorized reads the §Environments table: uat yes, dev no for load, prod never', () => {
  assert.equal(envAuthorized(PROFILE, 'uat', 'Security testing authorized'), true);
  assert.equal(envAuthorized(PROFILE, 'dev', 'Performance testing authorized'), false);
  assert.equal(envAuthorized(PROFILE, 'prod', 'Security testing authorized'), false);
  assert.equal(envAuthorized(PROFILE, 'staging', 'Security testing authorized'), false, 'an env the table lacks is not authorised');
});

test('every hard stop exits 3 in full mode, the sign-off 4, and each is an activity event that needs a human', () => {
  const p = project('full');
  p.run('start', '--by', 'Luan Nguyen');
  for (const [action, cls] of Object.entries(HARD)) assert.equal(p.run('check', action).status, cls === 'sign-off' ? 4 : 3, action);
  assert.equal(p.run('check', 'security-scan', '--env', 'prod').status, 3);
  assert.equal(p.run('check', 'perf-load', '--env', 'dev').status, 3);
  assert.equal(p.run('check', 'security-scan', '--env', 'uat').status, 0);
  assert.equal(p.run('check', 'run-suite').status, 0);
  const events = readFileSync(join(p.root, 'logs', 'activity.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(events.length, Object.keys(HARD).length + 2);
  assert.ok(events.every((e) => e.kind === 'stop' && e.source === 'stlc' && e.needs));
  rmSync(p.dir, { recursive: true, force: true });
});

test('merge-main stays stopped while a sign-off is provisional; a budget over its cap stops everything', () => {
  const p = project('full');
  p.run('start', '--by', 'Luan Nguyen');
  p.run('check', 'release-signoff');
  assert.match(p.run('check', 'merge-main').stdout, /provisional/);
  const capped = (...a) => spawnSync(process.execPath, [SCRIPT, ...a, '--run', RUN, '--root', p.root], { cwd: p.dir, encoding: 'utf8', env: { ...p.env, QA_BUDGET_TOKENS: '100' } });
  assert.equal(capped('budget', '--tokens', '150').status, 3);
  assert.equal(capped('check', 'run-suite').status, 3);
  rmSync(p.dir, { recursive: true, force: true });
});

test('start refuses an agent name; report lists the stops and who started the run', () => {
  const p = project('full');
  assert.equal(p.run('start', '--by', 'claude').status, 2);
  p.run('start', '--by', 'Luan Nguyen');
  p.run('check', 'file-defect');
  p.run('report');
  const text = readFileSync(join(p.root, 'runs', RUN, 'report.md'), 'utf8');
  assert.match(text, /Started by Luan Nguyen, mode `full`/);
  assert.match(text, /\| file-defect \| outward \| stopped \|/);
  rmSync(p.dir, { recursive: true, force: true });
});

// The CI job is the only place a run acts outward: it may push its own branch and open a Draft MR.
test('qa:autonomy opens a Draft MR from its own branch and never merges or pushes the default branch', () => {
  const ci = readFileSync(join(ROOT, 'workspace', 'qa', 'ci', '.gitlab-ci.qa.yml'), 'utf8');
  const job = ci.slice(ci.indexOf('qa:autonomy:'));
  assert.match(job, /autonomy\.mjs start --run "\$RUN" --by "\$QA_STARTED_BY"/);
  assert.match(job, /autonomy\.mjs report --run "\$RUN"/);
  assert.match(job, /HEAD:qa-autonomy\//);
  assert.match(job, /title:`Draft: /);
  for (const banned of [/merge_requests\/[^\s]*\/merge/, /git push[^\n]*\b(main|master|\$CI_DEFAULT_BRANCH)\b/, /auto_merge|merge_when_pipeline_succeeds/]) assert.doesNotMatch(job, banned, String(banned));
  const steps = readFileSync(join(ROOT, 'skills', 'qa-phase-protocol', 'references', 'autonomy.md'), 'utf8');
  for (const a of [...Object.keys(HARD), 'security-scan', 'perf-load']) assert.match(steps, new RegExp(a), `autonomy.md does not check ${a}`);
});

// Review: CI cds into .stlc, so the script must take the cwd as the root, not look for .stlc below it.
test('run from inside the QA root, the run lands in that root, not a .stlc below it', () => {
  const p = project('full');
  const inside = (...a) => spawnSync(process.execPath, [SCRIPT, ...a, '--run', RUN], { cwd: p.root, encoding: 'utf8', env: p.env });
  assert.equal(inside('start', '--by', 'Luan Nguyen').status, 0);
  assert.ok(readFileSync(join(p.root, 'runs', RUN, 'run.json'), 'utf8').includes('Luan Nguyen'));
  rmSync(p.dir, { recursive: true, force: true });
});

test('a torn line in stops.jsonl is skipped; resolve writes the pass that clears the run from Needs you', () => {
  const p = project('full');
  p.run('start', '--by', 'Luan Nguyen');
  p.run('check', 'release-signoff', '--slug', 'orders');
  writeFileSync(join(p.root, 'runs', RUN, 'stops.jsonl'), readFileSync(join(p.root, 'runs', RUN, 'stops.jsonl'), 'utf8') + '{"at":"2026');
  assert.match(p.run('check', 'merge-main', '--slug', 'orders').stdout, /provisional/);
  assert.equal(p.run('report').status, 0);
  assert.equal(p.run('resolve', '--by', 'Luan Nguyen').status, 0);
  const events = readFileSync(join(p.root, 'logs', 'activity.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const stop = events.find((e) => e.needs);
  const clear = events.at(-1);
  assert.equal(clear.outcome, 'pass');
  assert.equal(clear.slug, stop.slug);
  assert.equal(clear.link, stop.link, 'same slug and link, so openNeeds clears the stop');
  assert.match(stop.link, /runs\/20261022-130000-beef\/report\.md$/);
  rmSync(p.dir, { recursive: true, force: true });
});
