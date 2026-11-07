#!/usr/bin/env node
// run.mjs — proves the shipped Playwright kit by running the golden specs against the demo app.
// Assembles a throwaway project: workspace/qa (the kit, exactly as `afx install` ships it) + the
// golden overlay (tests/golden/qa: one module's endpoints, service, factory, page object, fixture
// and specs per tier), points it at tests/demo-app, installs deps, and runs:
//   1. heal:check (tsc + eslint) on the assembled project — the golden files obey the lint
//   2. the suite at --workers=N, then again with --shuffle, then as 3 shards — all must pass
//   2b. bug hunting: the fuzz, model, server-watch and UI-risk specs pass on the clean app (step 6
//      then seeds each bug); the whole golden suite runs with the serverWatch fixture on
//   3. run plans (CONTRACTS §19): `projects-release` resolves to exactly its expected ids (--dry-run),
//      then runs through run-plan.mjs and writes its verdicts back into the demo plan; `smoke` runs too;
//      `full` runs as 2 blob shards (the CI path) and merges into one summary + junit
//   4. the `ui` type: baselines are written into the temp project (--update-snapshots=missing), a
//      second pass compares and must pass; then the mutation proof — the demo app restarted with
//      DEMO_UI_MUTATION=wide-buttons must FAIL the visual baselines and the 320 px layout check
//   5. platforms (CONTRACTS §20): the desktop-electron project is listed when PW_PLATFORMS names
//      windows, and its spec skips with the declared ELECTRON_APP_PATH reason (Electron is not
//      required here — it cannot be downloaded on every machine)
//   6. seeded bugs: the demo app restarts once per DEMO_BUG and the matching bug-hunting spec must go
//      red, asserted from results.json with the mechanism's evidence (last: every restart is buggy)
// The suite runs with UI specs excluded until step 4 has written their baselines.
// Usage: node tests/golden/run.mjs [--workers 6] [--keep] [--quick] [--channel msedge]
//   --quick  one full run only (no shuffle/shards) · --keep  leave the temp project for inspection
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const WORKERS = Number(opt('--workers', 6));
const PORT = Number(opt('--port', 4391));
const CHANNEL = opt('--channel', process.env.PW_CHANNEL ?? '');

// The VS Code extension host leaks ELECTRON_RUN_AS_NODE into children; Playwright's browsers die on it.
delete process.env.ELECTRON_RUN_AS_NODE;

const dir = mkdtempSync(join(tmpdir(), 'qa-golden-'));
const qa = join(dir, 'qa');
console.log(`golden project: ${qa}`);
cpSync(join(ROOT, 'workspace', 'qa'), qa, { recursive: true, filter: (p) => !/[\\/](node_modules|runs|\.auth)([\\/]|$)/.test(p) });
cpSync(join(HERE, 'qa'), qa, { recursive: true });
cpSync(join(ROOT, 'tests', 'demo-app', 'openapi.yaml'), join(qa, 'docs', 'openapi.yaml'));
// The profile run-plan.mjs reads (installed at <project>/.claude/): which types are enabled, and that
// `golden` authorizes security testing — without it the plan's security case is refused (§9.5).
mkdirSync(join(dir, '.claude'), { recursive: true });
writeFileSync(join(dir, '.claude', 'PROJECT-PROFILE.md'), [
  '## Test types', '', '| Type | Enabled | Tool (default) | Output |', '|---|---|---|---|',
  ...['api', 'integration', 'e2e', 'security', 'accessibility', 'ui'].map((t) => `| \`${t}\` | yes | Playwright | qa/ |`),
  '| `performance` | no | k6 | qa/ |', '',
  '## Platforms', '', '| Platform | Kind | Runner | Targets | Tier | Enabled |', '|---|---|---|---|---|---|',
  '| `web` | web | playwright | chromium (gate) | gate | yes |',
  '| `api` | service | playwright-request | api | gate | yes |',
  '| `windows` | desktop | playwright-electron | electron | nightly | yes |', '',
  '## Environments', '', '| Env | Purpose | Security testing authorized | Performance testing authorized |', '|---|---|---|---|',
  '| `golden` (default) | the demo app | yes | no |', '',
].join('\n'));

writeFileSync(join(qa, '.env.golden'), [
  `BASE_URL=http://127.0.0.1:${PORT}`,
  `API_BASE_URL=http://127.0.0.1:${PORT}/api`,
  'OPENAPI_SPEC=docs/openapi.yaml',
  'AUTH_MODE=session-csrf',
  'AUTH_LOGIN_PATH=/sign-in',
  'AUTH_USER_FIELD=email',
  'AUTH_PASSWORD_FIELD=password',
  'AUTH_CSRF_PATH=csrf_token',
  'AUTH_ID_PATH=me.id',
  'TEST_USER=owner@demo.test',
  'TEST_PASSWORD=owner-password',
  'TEST_USER_OWNER=owner@demo.test',
  'TEST_PASSWORD_OWNER=owner-password',
  'TEST_POOL_USER=user.{n:3}@demo.test',
  'TEST_POOL_PASSWORD=user-password-{n:3}',
  'TEST_POOL_SIZE=60',
  'TEST_POOL_PER_WORKER=2',
  ...(CHANNEL ? [`PW_CHANNEL=${CHANNEL}`, 'PW_VIDEO=off'] : []),
  '',
].join('\n'));

const sh = (cmd, a, extra = {}) => {
  const r = spawnSync(cmd, a, { cwd: qa, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, QA_ENV: 'golden', ...extra } });
  return r.status ?? 1;
};
// Like sh, but captures stdout (and still prints it) — for runs whose OUTPUT is the proof.
const shOut = (cmd, a, extra = {}) => {
  const r = spawnSync(cmd, a, { cwd: qa, encoding: 'utf8', shell: process.platform === 'win32', env: { ...process.env, QA_ENV: 'golden', ...extra }, maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(r.stdout ?? '');
  process.stderr.write(r.stderr ?? '');
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};
const SERVER_LOG = join(dir, 'demo-server.log');
const startServer = async (env = {}) => {
  const s = spawn(process.execPath, [join(ROOT, 'tests', 'demo-app', 'server.mjs'), String(PORT)], { stdio: 'ignore', env: { ...process.env, DEMO_BUG: '', DEMO_LOG: SERVER_LOG, ...env } });
  for (let i = 0; i < 50; i++) {
    const r = await fetch(`http://127.0.0.1:${PORT}/healthz`).catch(() => undefined);
    if (r?.ok) return s;
    await new Promise((res) => setTimeout(res, 100));
  }
  s.kill();
  throw new Error(`demo app did not start (${JSON.stringify(env)})`);
};
const stopServer = async (s) => {
  if (!s) return;
  s.kill();
  for (let i = 0; i < 50; i++) {
    const r = await fetch(`http://127.0.0.1:${PORT}/healthz`).catch(() => undefined);
    if (!r) return;
    await new Promise((res) => setTimeout(res, 100));
  }
};
// The `ui` specs need baselines first (step 4); every earlier run leaves them out.
const NO_UI = ['--grep-invert', '@ui'];

let server;
const results = [];
const step = (name, code) => {
  results.push({ name, ok: code === 0 });
  console.log(`\n── ${code === 0 ? 'PASS' : 'FAIL'}  ${name}\n`);
  return code === 0;
};

try {
  const lock = existsSync(join(qa, 'package-lock.json')) ? 'ci' : 'install';
  if (sh('npm', [lock, '--no-audit', '--no-fund', '--loglevel=error']) !== 0) throw new Error('npm install failed');
  step('heal:check (tsc + eslint) on kit + golden', sh('npm', ['run', 'heal:check']));

  // The demo app writes its structured log to SERVER_LOG and every run reads it through the kit's
  // serverWatch fixture (QA_SERVER_LOG), so the whole golden suite also proves "no server error".
  process.env.QA_SERVER_LOG = SERVER_LOG;
  server = await startServer();

  const pw = (label, extra, env = {}) =>
    step(label, sh('npx', ['playwright', 'test', `--workers=${WORKERS}`, ...extra], { QA_RUN_ID: `golden-${Date.now()}`, RUN_DIR: `runs/golden/${label.replace(/\W+/g, '-')}`, ...env }));

  pw(`full suite, ${WORKERS} workers`, NO_UI);

  // Bug hunting (designing-functional-cases Step 1b · TC-API-FUZZ-001 · model tests · serverWatch):
  // the new specs pass on the clean app, then each seeded bug turns EXACTLY its spec red. "Red" is
  // asserted from results.json — the run must fail, the expected test(s) must be among the failures,
  // and the failure text must carry the mechanism's evidence (the fuzz seed, the shrunk sequence,
  // the server-log excerpt) — never just printed.
  const HUNT = {
    fuzz: 'scripts/api/_fuzz/TC-API-FUZZ-001-openapi-operations.spec.ts',
    model: 'scripts/api/projects/TC-API-PROJECTS-003-membership-model.spec.ts',
    watch: 'scripts/api/projects/TC-API-PROJECTS-004-list-search.spec.ts',
    staleTabs: 'scripts/e2e/projects/TC-E2E-PROJECTS-005-two-tabs-stale-rename.spec.ts',
    doubleSubmit: 'scripts/e2e/projects/TC-E2E-PROJECTS-006-double-submit-create.spec.ts',
  };
  pw('bug hunting: new specs pass on the clean app', Object.values(HUNT));
  if (!flag('--quick')) {
    pw('shuffled order', ['--shuffle', ...NO_UI]);
    for (let i = 1; i <= 3; i++) pw(`shard ${i}/3`, [`--shard=${i}/3`, ...NO_UI]);
  }

  // ── the `ui` type: baselines, then a comparing pass that must pass ─────────────────────────
  // Pass 1 writes the missing baselines into THIS temp project (never into the repo: baselines are
  // per OS and per machine fonts — the CI image writes the committed set). Pass 2 compares.
  const UI = ['scripts/ui'];
  const shots = join(qa, 'scripts', '__screenshots__');
  // Playwright marks a test whose baseline it just wrote as failed ("writing actual"), so this pass is
  // judged by the files it wrote, and the second pass by its exit code.
  sh('npx', ['playwright', 'test', ...UI, `--workers=${WORKERS}`, '--update-snapshots=missing', '--reporter=line'], { QA_RUN_ID: `golden-ui-base-${Date.now()}`, RUN_DIR: 'runs/golden/ui-baselines' });
  const written = existsSync(shots) ? readdirSync(shots, { recursive: true }).filter((f) => String(f).endsWith('.png')) : [];
  console.log(`baselines: ${written.length} under scripts/__screenshots__/ (${[...new Set(written.map((f) => String(f).split(/[\\/]/).slice(0, 2).join('/')))].join(', ')})`);
  step('ui baselines: 7 PNGs under __screenshots__/<os>/web-chromium/ (6 list states × widths + 1 dialog)', written.length === 7 && written.every((f) => /[\\/]web-chromium[\\/]/.test(String(f))) ? 0 : 1);
  pw('ui second pass compares against the baselines and passes', UI);

  // ── the mutation proof: a CSS regression no functional test sees ──────────────────────────
  // The demo app restarts with wider button padding. The visual tests must fail (the baselines
  // differ) and the 320 px layout check must name the overflow. If either still passes, the ui
  // tier cannot fail and proves nothing.
  await stopServer(server);
  server = await startServer({ DEMO_UI_MUTATION: 'wide-buttons' });
  const mutated = shOut('npx', ['playwright', 'test', ...UI, `--workers=${WORKERS}`, '--reporter=list'], { QA_RUN_ID: `golden-mut-${Date.now()}`, RUN_DIR: 'runs/golden/ui-mutation' });
  // Only the numbered failure headers count (`  3) [web-chromium] › … row p320 …`): a list line of a
  // PASSING test names its row too. At 1280 px the wider buttons may stay under the 1 % pixel
  // threshold — that row may pass; the narrow ones must not.
  const failedHeader = (re) => mutated.out.split('\n').some((l) => /^\s+\d+\) \[web-chromium\]/.test(l) && re.test(l));
  const visualFailed = failedHeader(/TC-UI-PROJECTS-001 — row p320/) && failedHeader(/TC-UI-PROJECTS-001 — row e320/) && /Screenshot comparison failed|pixels \(ratio|pixels are different/.test(mutated.out);
  const layoutCaught = failedHeader(/TC-UI-PROJECTS-002/) && /(scrolls sideways|leaves the viewport|clips: content)/.test(mutated.out);
  if (!(mutated.code !== 0 && visualFailed && layoutCaught)) console.log(`mutation proof: exit ${mutated.code}, visual failed: ${visualFailed}, layout caught: ${layoutCaught}`);
  step('ui mutation (wide buttons): visual baselines fail AND the 320 px layout check reports the overflow', mutated.code !== 0 && visualFailed && layoutCaught ? 0 : 1);
  await stopServer(server);
  server = await startServer();

  // ── platforms: the desktop project is wired, and skips with its declared reason ────────────
  const pwList = shOut('npx', ['playwright', 'test', '--list', ...UI], { PW_PLATFORMS: 'web,api,windows' });
  const desktopListed = /\[desktop-electron\][^\n]*TC-UI-PROJECTS-004/.test(pwList.out) && !/\[web-chromium\][^\n]*TC-UI-PROJECTS-004/.test(pwList.out) && !/\[desktop-electron\][^\n]*TC-UI-PROJECTS-001/.test(pwList.out);
  step('platforms: PW_PLATFORMS=windows adds desktop-electron, which takes only the @platform:windows spec', desktopListed ? 0 : 1);
  const desk = shOut('npx', ['playwright', 'test', ...UI, '--project', 'setup', 'desktop-electron', '--reporter=list'], { PW_PLATFORMS: 'web,api,windows', ELECTRON_APP_PATH: '', QA_RUN_ID: `golden-desk-${Date.now()}`, RUN_DIR: 'runs/golden/desktop' });
  step('platforms: without ELECTRON_APP_PATH the desktop spec skips with the declared reason', desk.code === 0 && /1 skipped/.test(desk.out) ? 0 : 1);

  // Run plans: the resolver selects exactly the expected ids, and running the plan passes.
  const EXPECTED = ['TC-API-PROJECTS-001', 'TC-API-PROJECTS-002', 'TC-API-PROJECTS-003', 'TC-E2E-PROJECTS-001', 'TC-E2E-PROJECTS-002', 'TC-E2E-PROJECTS-003', 'TC-E2E-PROJECTS-005', 'TC-E2E-PROJECTS-006', 'TC-SEC-PROJECTS-001'];
  const dry = spawnSync(process.execPath, ['scripts/shared/run-plan.mjs', 'run', 'projects-release', '--dry-run'], { cwd: qa, encoding: 'utf8', env: { ...process.env, QA_ENV: 'golden' } });
  const listed = [...(dry.stdout ?? '').matchAll(/^ {2}(TC-[A-Z0-9-]+)$/gm)].map((m) => m[1]);
  const grepOk = EXPECTED.every((id) => (dry.stdout ?? '').includes(id)) && /--project setup api web-chromium/.test(dry.stdout ?? '');
  if (dry.status !== 0 || listed.join() !== EXPECTED.join() || !grepOk) console.log(dry.stdout, dry.stderr, `\nexpected ${EXPECTED.join(', ')}\ngot      ${listed.join(', ')}`);
  step('run plan projects-release --dry-run resolves the expected ids', dry.status === 0 && listed.join() === EXPECTED.join() && grepOk ? 0 : 1);
  const plan = (n) => step(`run plan ${n}`, sh('node', ['scripts/shared/run-plan.mjs', 'run', n, '--workers', String(WORKERS)], { QA_RUN_ID: `golden-plan-${n}-${Date.now()}` }));
  if (plan('projects-release')) {
    // executing-tests Step 6: every resolved case's row in the demo plan now carries ✅ and the run folder.
    const table = readFileSync(join(qa, 'plans', 'demo', '2026-10-01-test-plan.md'), 'utf8');
    const written = EXPECTED.filter((id) => new RegExp(`\\| ${id} \\|[^\\n]*\\| ✅ \\| qa/runs/plans/projects-release/`).test(table));
    if (written.length !== EXPECTED.length) console.log(`write-back missing for: ${EXPECTED.filter((id) => !written.includes(id)).join(', ')}`);
    step('run plan projects-release wrote ✅ back to the demo plan', written.length === EXPECTED.length ? 0 : 1);
  }
  plan('smoke');

  // The CI path: `full` in its 2 shards (blob reports, no write-back), then one merge → one summary.
  const base = `runs/ci/golden-plan-full`;
  let shardsOk = true;
  for (let i = 1; i <= 2; i++) {
    shardsOk = step(`run plan full, shard ${i}/2 (blob)`, sh('node', ['scripts/shared/run-plan.mjs', 'run', 'full', '--shard', `${i}/2`, '--run-dir', `${base}/shard-${i}`, '--no-writeback', '--workers', String(WORKERS)],
      { CI: '1', PW_BLOB: '1', QA_RUN_ID: `golden-full-${i}-${Date.now()}` })) && shardsOk;
  }
  if (shardsOk) {
    const merged = sh('node', ['scripts/shared/run-plan.mjs', 'merge', 'full', '--run-dir', base, '--no-writeback']);
    const summary = existsSync(join(qa, base, 'summary.md')) ? readFileSync(join(qa, base, 'summary.md'), 'utf8') : '';
    // 16 ✅ (13 + the three web ui cases), and two declared ⛔: the integration case (the demo app has
    // no DB) and the desktop ui case (no ELECTRON_APP_PATH) — a skip is never reported as a pass,
    // and a declared skip does not fail the run. The platform matrix shows web, api and windows.
    const ok = merged === 0 && existsSync(join(qa, base, 'junit.xml')) && (summary.match(/\| ✅ \|/g) ?? []).length === 16 &&
      /\| TC-INT-PROJECTS-001 \|[^\n]*\| ⛔ blocked — skipped: DB_CONNECTION is not set/.test(summary) &&
      /\| TC-UI-PROJECTS-004 \|[^\n]*\| ⛔ blocked — skipped: ELECTRON_APP_PATH is not set/.test(summary) &&
      /## Platforms × types/.test(summary) && /\| Windows \(`windows`\) \|/.test(summary) && /\| Web \(`web`\) \|/.test(summary);
    if (!ok) console.log(summary || `no ${base}/summary.md`);
    step('run plan full: shards merged into one summary (16 ✅, 2 declared ⛔, platform × type matrix) + junit', ok ? 0 : 1);
  }

  // ── seeded bugs: each one turns EXACTLY its bug-hunting spec red ─────────────────────────────
  // (last, because every restart below runs the demo app with a bug in it)
  const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, ''); // Playwright colours expect() diffs
  const outcome = (runDir) => {
    const failed = [];
    const walk = (suite) => {
      for (const s of suite.suites ?? []) walk(s);
      for (const spec of suite.specs ?? [])
        for (const t of spec.tests ?? [])
          if (t.results?.some((r) => r.status === 'failed' || r.status === 'timedOut'))
            failed.push({ title: spec.title, text: stripAnsi(t.results.map((r) => [r.error?.message ?? '', ...(r.attachments ?? []).filter((a) => a.body).map((a) => Buffer.from(a.body, 'base64').toString('utf8'))].join('\n')).join('\n')) });
    };
    const file = join(qa, runDir, 'results.json');
    if (existsSync(file)) walk(JSON.parse(readFileSync(file, 'utf8')));
    return failed;
  };
  const SEEDED = [
    { bug: 'double-submit', spec: HUNT.doubleSubmit, id: 'TC-E2E-PROJECTS-006', evidence: /(toHaveCount|toBe)[\s\S]*Expected: 1[\s\S]*Received: 2/ },
    { bug: 'stale-write', spec: HUNT.staleTabs, id: 'TC-E2E-PROJECTS-005', evidence: /Someone else changed this project/ },
    { bug: 'fuzz-500', spec: HUNT.fuzz, id: 'TC-API-FUZZ-001', evidence: /QA_FUZZ_SEED=\d+[\s\S]*whitespace only[\s\S]*5xx: HTTP 500/ },
    { bug: 'leak', spec: HUNT.fuzz, id: 'TC-API-FUZZ-001', evidence: /QA_FUZZ_SEED=\d+[\s\S]*leak: (stack frame|internal field \$\.stack)/ },
    { bug: 'member-count', spec: HUNT.model, id: 'TC-API-PROJECTS-003', evidence: /minimal sequence[\s\S]*grant\([\s\S]*grant\([\s\S]*member_count equals the members granted[\s\S]*QA_MODEL_SEED=\d+/ },
    { bug: 'silent-error', spec: HUNT.watch, id: 'TC-API-PROJECTS-004', evidence: /server logged errors[\s\S]*search index refresh failed/ },
  ];
  for (const s of SEEDED) {
    await stopServer(server);
    server = await startServer({ DEMO_BUG: s.bug });
    const runDir = `runs/golden/seeded-${s.bug}`;
    const code = sh('npx', ['playwright', 'test', '--workers=2', s.spec], { QA_RUN_ID: `golden-bug-${s.bug}-${Date.now()}`, RUN_DIR: runDir });
    const failed = outcome(runDir);
    const hit = failed.find((f) => f.title.startsWith(s.id) && s.evidence.test(f.text));
    if (!hit) console.log(`DEMO_BUG=${s.bug}: expected ${s.id} red with ${s.evidence}; exit ${code}, failed: ${failed.map((f) => f.title).join(' | ') || 'none'}`);
    step(`seeded DEMO_BUG=${s.bug} → ${s.id} red`, code !== 0 && hit ? 0 : 1);
  }
  // The watch is what catches silent-error: the same spec WITHOUT it passes (the bug is invisible to the API test).
  {
    const runDir = 'runs/golden/seeded-silent-error-unwatched';
    const code = sh('npx', ['playwright', 'test', '--workers=2', HUNT.watch], { QA_RUN_ID: `golden-bug-unwatched-${Date.now()}`, RUN_DIR: runDir, QA_SERVER_LOG: '' });
    step('seeded DEMO_BUG=silent-error without serverWatch → TC-API-PROJECTS-004 green (only the watch sees it)', code);
  }
} catch (e) {
  results.push({ name: String(e), ok: false });
} finally {
  await stopServer(server);
  if (!flag('--keep')) rmSync(dir, { recursive: true, force: true });
}

console.log('\nGolden summary');
for (const r of results) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}`);
process.exit(results.every((r) => r.ok) && results.length > 0 ? 0 : 1);
