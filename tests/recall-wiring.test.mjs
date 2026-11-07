// recall-wiring.test.mjs — every authoring phase reads the lessons for its phase before it writes,
// and no reviewer is handed them (CONTRACTS §23). The protocol carries the step once, so every
// /qa-* command inherits it; the reference file says what to do with each kind of output.
// Run: node --test "tests/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.STLC_BUNDLE_ROOT ?? join(here, '..'));
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const PROTOCOL = 'skills/qa-phase-protocol/SKILL.md';
const RECALL = 'skills/qa-phase-protocol/references/recall.md';

/** The numbered preflight steps of §1, as text. */
const preflight = () => (/## 1\. Before anything[^\n]*\n([\s\S]*?)\n## 2\./.exec(read(PROTOCOL)) ?? [])[1] ?? '';

test('the protocol preflight recalls lessons with the skill as the key, and links the reference', () => {
  const steps = preflight();
  assert.ok(steps, 'qa-phase-protocol lost its "## 1. Before anything" section');
  const step = steps.split(/\n(?=\d+\. )/).find((s) => /qa:learn -- recall/.test(s));
  assert.ok(step, 'no preflight step runs `qa:learn -- recall`: authoring phases would never read lessons');
  assert.match(step, /--skill <skill>/, 'recall must be keyed by the skill the phase invokes');
  assert.match(step, /\bshow\b/, 'recall is two steps: the index, then `show` for the relevant hits');
  assert.match(step, /[Nn]ever to a reviewer/, 'the step must say a reviewer is not given lessons');
  assert.match(step, /references\/recall\.md/, 'the step must link references/recall.md');
});

test('the recall reference says what to do with each output, and keeps reviewers clean', () => {
  assert.ok(existsSync(join(ROOT, RECALL)), `${RECALL} is missing`);
  const text = read(RECALL);
  for (const out of ['No lesson applies.', 'WARN', 'withheld', 'never stops a phase']) assert.ok(text.includes(out), `${RECALL} does not handle "${out}"`);
  assert.match(text, /\*\*The reviewer is not given the lessons\.\*\*/);
  for (const r of ['reviewing-cases', 'reviewing-unit-tests', 'reviewing-test-pull-requests']) assert.ok(text.includes(r), `${RECALL} does not name ${r}`);
  for (const cmd of ['recall', 'show']) {
    const pkg = JSON.parse(read('workspace/qa/package.json'));
    assert.ok(pkg.scripts['qa:learn'], 'qa:learn runner missing');
    assert.match(text, new RegExp(`npm run qa:learn -- ${cmd}`));
  }
});

test('the orchestrator passes lessons to authors and never to a review dispatch', () => {
  const orch = read('agents/qa-orchestrator.md');
  assert.match(orch, /`Lessons: <paths>`/);
  assert.match(orch, /a review\s+dispatch never does/);
  for (const r of ['skills/reviewing-cases/SKILL.md', 'skills/reviewing-unit-tests/SKILL.md', 'skills/reviewing-test-pull-requests/SKILL.md']) {
    assert.doesNotMatch(read(r), /qa:learn -- (recall|show)/, `${r} reads lessons: a primed reviewer stops seeing what is wrong this time`);
  }
});
