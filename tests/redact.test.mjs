// redact.test.mjs — run evidence never carries a secret (CONTRACTS §25). The masker must hide API
// keys, bearer tokens and passwords in URLs wherever a failure message quotes them, leave ordinary
// failure text alone, and the scripts that write evidence (qa:triage, qa:flaky) must call it.
// Run: node --test "tests/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
process.env.QA_RUN_LOG = 'off';
process.env.ACTIVITY_LOG = 'off';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED = join(ROOT, 'workspace', 'qa', 'scripts', 'shared');
const { redact, redactFiles, MASK } = await import(pathToFileURL(join(SHARED, 'lib', 'redact.mjs')).href);

// Built at run time so no literal credential sits in the repository.
const KEY = ['sk', 'ant', 'api03', 'Zq7XcV9bN2mL4kJ8hG6fD1sA0pO'].join('-');
const GH = `ghp_${'a1B2c3D4e5F6g7H8i9J0'.repeat(2)}`;
const BEARER = `eyJhbGciOiJIUzI1NiJ9.${'eyJzdWIiOiIxMjM0NTY3ODkwIn0'}.${'SflKxwRJSMeKKF2QT4fwpMeJf36P'}`;
const SECRETS = [KEY, GH, BEARER, 'hunter2pass', 'Tok3nValue99'];

const SAMPLES = [
  `Error: apiRequestContext.post: 401 at https://alice:hunter2pass@api.example.test/orders`,
  `Authorization: Bearer ${BEARER}`,
  `request headers {"authorization":"Bearer ${BEARER}","x-api-key":"${KEY}"}`,
  `GET /orders?page=2&api_key=${KEY}&token=Tok3nValue99 → 403`,
  `body {"email":"a@b.test","password":"hunter2pass"}`,
  `cloned with ${GH}`,
  `login failed: password=hunter2pass for TEST_USER_OWNER`,
];

test('every secret shape in a failure message is masked, and the label stays readable', () => {
  for (const s of SAMPLES) {
    const out = redact(s);
    for (const secret of SECRETS) assert.ok(!out.includes(secret), `leaked ${secret.slice(0, 6)}… in: ${out}`);
    assert.ok(out.includes(MASK), `nothing masked in: ${out}`);
  }
  assert.match(redact(SAMPLES[0]), /https:\/\/alice:‹masked›@api\.example\.test\/orders/);
  assert.match(redact(SAMPLES[3]), /page=2&api_key=‹masked›&token=‹masked›/);
});

test('ordinary failure text is unchanged, and masking is idempotent', () => {
  const plain = [
    "Error: expect(received).toBe(expected) — Expected: 201 Received: 500",
    'TimeoutError: locator.click: Timeout 5000ms exceeded waiting for getByRole("button", { name: "Pay" })',
    'TC-API-ORDERS-001 · SETUP/ENV · no actor "owner" — add TEST_USER_OWNER to <qa-root>/.env.qa',
    'the password field shows "Required" when empty',
    'https://api.example.test/orders/8812?page=2',
  ];
  for (const s of plain) assert.equal(redact(s), s);
  for (const s of SAMPLES) assert.equal(redact(redact(s)), redact(s));
});

test('qa:redact rewrites the evidence files of a run dir in place, and only those', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stlc-redact-'));
  try {
    writeFileSync(join(dir, 'failures.md'), `## TC-API-ORDERS-001\n- **Error:** ${SAMPLES[0]}\n`);
    writeFileSync(join(dir, 'notes.txt'), SAMPLES[0]);
    const changed = redactFiles([dir]);
    assert.equal(changed.length, 1);
    assert.ok(!readFileSync(join(dir, 'failures.md'), 'utf8').includes('hunter2pass'));
    assert.ok(readFileSync(join(dir, 'notes.txt'), 'utf8').includes('hunter2pass'), 'a non-evidence file was touched');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Playwright JSON reporter shape, one failed test.
const report = (error) => ({ suites: [{ title: 'x', file: 'x', specs: [{ title: 'TC-API-ORDERS-001 — t', file: 'scripts/api/orders/x.spec.ts', line: 3, tests: [{ projectName: 'api', status: 'unexpected', annotations: [], results: [{ status: 'failed', error: { message: error }, errors: [{ message: error }], attachments: [] }] }] }] }] });

test('qa:triage and qa:flaky write no secret a failure message carried', () => {
  const root = mkdtempSync(join(tmpdir(), 'stlc-redact-run-'));
  try {
    const run = join(root, 'runs', 'api', 'orders', '2026-09-10-1030');
    mkdirSync(run, { recursive: true });
    writeFileSync(join(run, 'results.json'), JSON.stringify(report(`${SAMPLES[0]}\n${SAMPLES[2]}`)));
    for (const [script, out] of [['triage.mjs', 'triage.md'], ['flaky.mjs', 'stability.md']]) {
      const r = spawnSync(process.execPath, [join(SHARED, script), run, '--root', root], { cwd: root, encoding: 'utf8', env: { ...process.env, QA_ROOT_DIR: root } });
      const text = readFileSync(join(run, out), 'utf8');
      for (const secret of SECRETS) {
        assert.ok(!text.includes(secret), `${out} leaked ${secret.slice(0, 6)}…`);
        assert.ok(!r.stdout.includes(secret), `${script} stdout leaked ${secret.slice(0, 6)}…`);
      }
      assert.ok(text.includes(MASK), `${out}: nothing masked — did the failure reach the file?`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
