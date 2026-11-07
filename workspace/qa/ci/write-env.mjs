#!/usr/bin/env node
// write-env.mjs — materialise <qa-root>/.env.$QA_ENV from CI variables, identically on GitLab and GitHub.
// Run from the QA root (.stlc/ or qa/):  node ci/write-env.mjs
//
// Sources, later wins:
//   1. process.env                      GitLab CI/CD variables arrive here
//   2. QA_CI_VARS_JSON  (JSON object)   GitHub: `${{ toJSON(vars) }}`    — plain configuration
//   3. QA_CI_SECRETS_JSON (JSON object) GitHub: `${{ toJSON(secrets) }}` — masked by the runner
// Only the keys the runners read are written (KEYS below + every TEST_USER_<NAME>/TEST_PASSWORD_<NAME>);
// names are the contract in <qa-root>/.env.example. Values are NEVER printed — only key names and a count.
// QA_RUN_ID is not written here: the job sets it in the environment (pipeline/run id + job/shard),
// and dotenv never overrides a variable the environment already has.
import { writeFileSync } from 'node:fs';

const KEYS = [
  // application under test
  'BASE_URL', 'API_BASE_URL', 'OPENAPI_SPEC', 'TEST_ID_ATTRIBUTE', 'DB_CONNECTION',
  // auth (scripts/shared/config/env.ts)
  'AUTH_MODE', 'AUTH_LOGIN_PATH', 'AUTH_USER_FIELD', 'AUTH_PASSWORD_FIELD', 'AUTH_TOKEN_PATH',
  'AUTH_CSRF_PATH', 'AUTH_CSRF_HEADER', 'AUTH_ID_PATH', 'AUTH_SIGN_IN_CONCURRENCY', 'API_TOKEN',
  // actors: named (TEST_USER*/TEST_PASSWORD* matched below) and the per-worker pool
  'TEST_POOL_USER', 'TEST_POOL_PASSWORD', 'TEST_POOL_SIZE', 'TEST_POOL_PER_WORKER',
  // browsers, a11y, non-functional
  'PW_PROJECTS', 'PW_PLATFORMS', 'PW_CHANNEL', 'PW_WORKERS', 'PW_VIDEO', 'A11Y_FAIL_ON',
  'ELECTRON_APP_PATH', 'ELECTRON_APP_ARGS', 'UI_MAX_DIFF_PIXEL_RATIO', 'UI_VIEWPORTS',
  'PERF_TARGET_URL', 'PERF_VUS', 'PERF_DURATION', 'ZAP_TARGET_URL',
  // run behaviour
  'QA_KEEP_ON_FAIL',
];
const ACTOR = /^TEST_(USER|PASSWORD)(_[A-Z0-9_]+)?$/;

const parse = (name) => {
  const raw = process.env[name];
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch {
    console.error(`${name} is not valid JSON — ignored`);
    return {};
  }
};
const source = { ...process.env, ...parse('QA_CI_VARS_JSON'), ...parse('QA_CI_SECRETS_JSON') };

const quote = (v) => {
  if (!/[\s#"'`\\$]/.test(v)) return v;
  return v.includes("'") ? JSON.stringify(v) : `'${v}'`;
};

const lines = [];
const written = [];
for (const [k, v] of Object.entries(source).sort(([a], [b]) => a.localeCompare(b))) {
  if (!(KEYS.includes(k) || ACTOR.test(k))) continue;
  if (typeof v !== 'string' || v.trim() === '') continue;
  if (/[\r\n]/.test(v)) {
    console.error(`${k} contains a line break — not written (fix the CI variable)`);
    process.exitCode = 1;
    continue;
  }
  lines.push(`${k}=${quote(v.trim())}`);
  written.push(k);
}

const qaEnv = process.env.QA_ENV || 'uat';
const file = `.env.${qaEnv}`;
writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
console.log(`${file}: ${written.length} keys (${written.join(', ') || 'none'}) — values not shown`);
