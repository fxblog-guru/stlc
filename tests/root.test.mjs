// root.test.mjs — the QA root (CONTRACTS §2): one resolver, both path prefixes, and the migration.
//
// A new project keeps the QA root in `.stlc/`; one installed before 2.1 keeps `qa/`. Every test
// here runs the real scripts against a copy of the reference fixture, so a script that still
// assumes `qa/` fails here rather than in a project.   Run: node --test "tests/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// Script runs in tests are not usage: keep them out of the run log (lib/runlog.mjs).
process.env.QA_RUN_LOG = 'off';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WS = join(ROOT, 'workspace', 'qa');
const SHARED = join(WS, 'scripts', 'shared');
const FIXTURE = join(ROOT, 'tests', 'fixture', 'qa');
const lib = (p) => import(pathToFileURL(join(SHARED, p)).href);
const { findRoot, locateRef, normalizeRef, profileRoot, repoPath, stripRoot, workspaceRoot } = await lib('lib/root.mjs');
const { buildState } = await lib('build-state.mjs');
const { plan, rewireText, rewriteDoc, setProfileRoot } = await lib('migrate-root.mjs');
const { parseDoc, hashArtifact } = await lib('lib/doc.mjs');

const TODAY = { QA_LINT_TODAY: '2026-09-15' };
const NOENV = { QA_ROOT: '', QA_ROOT_DIR: '' };
const PROFILE = (line) => `# PROJECT-PROFILE.md\n\n## Project\n\n- **Name:** \`demo\`\n${line}\n- **Artifact language:** \`en\` (default)\n`;
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? (n === 'node_modules' ? [] : walk(join(d, n))) : [join(d, n)]));
const env = (extra = {}) => ({ ...process.env, ...NOENV, ...TODAY, ...extra });
const node = (cwd, script, args = [], extra = {}) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', env: env(extra) });

/** A throwaway project with the fixture under `name`, the shipped kit and templates inside it. */
function project(name, { profile = null, kit = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'qa-root-'));
  const root = join(dir, name);
  cpSync(FIXTURE, root, { recursive: true });
  if (kit) {
    cpSync(SHARED, join(root, 'scripts', 'shared'), { recursive: true, filter: (s) => !s.includes('node_modules') });
    cpSync(join(WS, '_templates'), join(root, '_templates'), { recursive: true });
  }
  if (profile) {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'PROJECT-PROFILE.md'), PROFILE(profile));
  }
  return { dir, root, done: () => rmSync(dir, { recursive: true, force: true }) };
}
/** What a state says, with the root-prefixed paths reduced to their path inside the root. */
const shape = (s) => JSON.parse(JSON.stringify({ ...s, generated_at: null, source_hash: null, project: null }).replace(/"(?:\.stlc|qa)\//g, '"'));

// ---- the resolver -------------------------------------------------------------------------------

test('findRoot: --root, then QA_ROOT, then the profile, then the folder that exists (.stlc first), then .stlc', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-find-'));
  try {
    const e = {};
    assert.deepEqual(findRoot({ cwd: dir, env: e }), { root: resolve(dir, '.stlc'), name: '.stlc', source: 'default' }, 'nothing there: .stlc');
    mkdirSync(join(dir, 'qa'));
    assert.equal(findRoot({ cwd: dir, env: e }).name, 'qa', 'an existing qa/ is found');
    mkdirSync(join(dir, '.stlc'));
    assert.equal(findRoot({ cwd: dir, env: e }).name, '.stlc', 'both exist: .stlc wins');
    mkdirSync(join(dir, '.claude'));
    writeFileSync(join(dir, '.claude', 'PROJECT-PROFILE.md'), PROFILE('- **QA root:** `qa` — chosen'));
    assert.deepEqual(findRoot({ cwd: dir, env: e }), { root: resolve(dir, 'qa'), name: 'qa', source: 'profile' }, 'the profile beats the folders');
    assert.deepEqual(findRoot({ cwd: dir, env: { QA_ROOT: 'tests/qa' } }), { root: resolve(dir, 'tests/qa'), name: 'tests/qa', source: 'env' }, 'QA_ROOT beats the profile');
    assert.equal(findRoot({ cwd: dir, env: { QA_ROOT: 'tests/qa' }, explicit: 'x/y' }).root, resolve(dir, 'x/y'), '--root beats QA_ROOT');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('profileRoot: an untouched (default) is no choice; placeholders are ignored; ./ and / are trimmed', () => {
  assert.equal(profileRoot(PROFILE('- **QA root:** `.stlc` (default) — all testing artifacts')), null);
  assert.equal(profileRoot(PROFILE('- **QA root:** `qa/` (default) — all testing artifacts live under this folder.')), null, 'the 2.0 template line names no choice');
  assert.equal(profileRoot(PROFILE('- **QA root:** `qa/` — all testing artifacts')), 'qa');
  assert.equal(profileRoot(PROFILE('- **QA root:** `./.stlc/` — chosen')), '.stlc');
  assert.equal(profileRoot(PROFILE('- **QA root:** `<folder>`')), null);
  assert.equal(profileRoot('no profile'), null);
});

test('workspaceRoot: QA_ROOT_DIR, else the cwd when it is a QA root, else the project order', () => {
  const p = project('qa');
  try {
    assert.equal(workspaceRoot({ cwd: p.root, env: {} }), resolve(p.root), 'npm runs from the root');
    mkdirSync(join(p.root, '.stlc'));
    assert.equal(workspaceRoot({ cwd: p.root, env: {} }), resolve(p.root), 'inside a root, the cwd is the root — never a folder below it');
    assert.equal(workspaceRoot({ cwd: p.dir, env: {} }), resolve(p.root), 'from the project, the root it finds');
    assert.equal(workspaceRoot({ cwd: p.dir, env: { QA_ROOT_DIR: 'elsewhere' } }), resolve(p.dir, 'elsewhere'));
  } finally { p.done(); }
});

test('either prefix names the root; new paths carry the root\'s own prefix', () => {
  const root = join(tmpdir(), 'p', '.stlc');
  assert.equal(stripRoot('qa/cases/api/x.md'), 'cases/api/x.md');
  assert.equal(stripRoot('.stlc/cases/api/x.md'), 'cases/api/x.md');
  assert.equal(stripRoot('.claude/PROJECT-PROFILE.md'), '.claude/PROJECT-PROFILE.md', 'a project path is not under the root');
  assert.equal(stripRoot('qa-tools/x.md'), 'qa-tools/x.md');
  assert.equal(locateRef(root, 'qa/cases/x.md'), join(root, 'cases', 'x.md'));
  assert.equal(locateRef(root, '.stlc/cases/x.md'), join(root, 'cases', 'x.md'));
  assert.equal(locateRef(root, '.claude/PROJECT-PROFILE.md'), resolve(root, '..', '.claude', 'PROJECT-PROFILE.md'));
  assert.equal(locateRef(join(tmpdir(), 'p', 'testing'), 'testing/cases/x.md'), join(tmpdir(), 'p', 'testing', 'cases', 'x.md'), 'a custom root also resolves its own name');
  assert.equal(repoPath(root, 'runs/api/x/'), '.stlc/runs/api/x/');
  assert.equal(repoPath(join(tmpdir(), 'p', 'qa'), 'runs/api/x/'), 'qa/runs/api/x/');
  assert.equal(normalizeRef(root, 'qa/reports/orders/r.md'), '.stlc/reports/orders/r.md');
});

// ---- records with either prefix -----------------------------------------------------------------

test('dual prefix: the qa/-prefixed fixture under .stlc/ derives the same state, and a review and env check still hash', () => {
  const legacy = buildState(FIXTURE);
  const p = project('.stlc', { kit: false });
  try {
    const moved = buildState(p.root);
    assert.deepEqual(shape(moved), shape(legacy), 'the records still say qa/, and every one resolves under .stlc/');
    const s = moved.slugs[0];
    assert.equal(s.review.stale, false, 'the review hashed qa/cases/… and the case is found under .stlc/');
    assert.equal(moved.environments[0].stale, false, 'readiness `inputs: qa/.env.uat.example` resolves too');
    assert.equal(s.plan, '.stlc/plans/orders/2026-09-01-test-plan.md', 'state.json names the file where it is now');
    assert.ok(JSON.stringify(moved).includes('".stlc/') && !/"qa\//.test(JSON.stringify(moved)), 'no path in the new state says qa/');
  } finally { p.done(); }
});

test('dual prefix: a review that records .stlc/ paths is read under a qa/ root too', () => {
  const p = project('qa', { kit: false });
  try {
    const f = join(p.root, 'reviews', 'orders', '2026-09-05-case-review.md');
    writeFileSync(f, readFileSync(f, 'utf8').replace('  - path: qa/cases/', '  - path: .stlc/cases/'));
    assert.match(readFileSync(f, 'utf8'), /path: \.stlc\/cases\//);
    const r = buildState(p.root).slugs[0].review;
    assert.equal(r.stale, false, 'a .stlc/ path names the qa/ root');
    const judged = join(p.root, 'cases', 'api', 'orders', 'TC-API-ORDERS-001-create-order-contract.md');
    writeFileSync(judged, `${readFileSync(judged, 'utf8')}\n- a step the reviewer never saw\n`);
    assert.equal(buildState(p.root).slugs[0].review.stale, true, 'and it still goes stale: the path resolved, not skipped');
  } finally { p.done(); }
});

test('dual prefix: lint accepts a HANDOFF row with either prefix under either root, and refuses any other folder', () => {
  const p = project('.stlc', { kit: false });
  const lint = () => node(p.root, join(SHARED, 'lint-qa.mjs'));
  try {
    const hp = join(p.root, 'scripts', 'mobile', 'HANDOFF.md');
    const text = readFileSync(hp, 'utf8');
    assert.match(lint().stdout, /0 error\(s\)/, 'qa/scripts/mobile/… under .stlc/');
    writeFileSync(hp, text.replace('| qa/scripts/mobile/', '| .stlc/scripts/mobile/'));
    assert.match(lint().stdout, /0 error\(s\)/, '.stlc/scripts/mobile/… under .stlc/');
    writeFileSync(hp, text.replace('| qa/scripts/mobile/', '| other/scripts/mobile/'));
    const bad = lint();
    assert.match(bad.stdout, /Staged script must be under \.stlc\/scripts\/mobile\//, bad.stdout);
  } finally { p.done(); }
});

// ---- end to end ---------------------------------------------------------------------------------

test('end to end: on the fixture moved to .stlc/, the hooks and scripts find it with no --root', () => {
  const p = project('.stlc');
  try {
    const built = node(p.dir, join(p.root, 'scripts', 'shared', 'build-state.mjs'));
    assert.equal(built.status, 0, built.stderr);
    assert.ok(existsSync(join(p.root, 'state.json')) && !existsSync(join(p.dir, 'qa')), 'state.json is under .stlc/, nothing was written to qa/');
    const state = JSON.parse(readFileSync(join(p.root, 'state.json'), 'utf8'));
    assert.equal(state.slugs[0].report.path, '.stlc/reports/orders/2026-09-11-report.md');
    const check = node(p.dir, join(p.root, 'scripts', 'shared', 'build-state.mjs'), ['--check']);
    assert.equal(check.status, 0, check.stderr);

    const lint = node(p.root, join(p.root, 'scripts', 'shared', 'lint-qa.mjs'));
    assert.equal(lint.status, 0, lint.stdout);
    assert.match(lint.stdout, /0 error\(s\)/);

    const status = node(p.dir, join(p.root, 'scripts', 'shared', 'status.mjs'), ['--brief']);
    assert.match(status.stdout, /orders \[Report\]/, status.stdout + status.stderr);

    const hook = (file) => spawnSync(process.execPath, [join(p.root, 'scripts', 'shared', 'lint-on-write.mjs')], { cwd: p.dir, encoding: 'utf8', env: env(), input: JSON.stringify({ tool_input: { file_path: file } }) });
    const planFile = join(p.root, 'plans', 'orders', '2026-09-01-test-plan.md');
    assert.equal(hook(planFile).status, 0, 'the clean plan passes the hook');
    writeFileSync(planFile, readFileSync(planFile, 'utf8').replace('## Traceability (Requirement ↔ Case)', '## Traceability'));
    const bad = hook(planFile);
    assert.equal(bad.status, 2, `the hook must block a broken plan under .stlc/: ${bad.stdout}${bad.stderr}`);
    assert.match(bad.stderr, /in \.stlc\/plans\/orders\/2026-09-01-test-plan\.md/, 'and name it under .stlc/');
  } finally { p.done(); }
});

test('end to end: a profile that names qa keeps a project on qa/ even when .stlc/ appears', () => {
  const p = project('qa', { profile: '- **QA root:** `qa` — kept' });
  try {
    mkdirSync(join(p.dir, '.stlc'));
    const built = node(p.dir, join(p.root, 'scripts', 'shared', 'build-state.mjs'), ['--quiet']);
    assert.equal(built.status, 0, built.stderr);
    assert.ok(existsSync(join(p.root, 'state.json')));
    assert.ok(!existsSync(join(p.dir, '.stlc', 'state.json')));
  } finally { p.done(); }
});

test('run-plan writes the run\'s Report cell with the root\'s own prefix', () => {
  const p = project('.stlc');
  try {
    // A dry run resolves and prints; the write-back prefix is the same repoPath the run uses.
    const src = readFileSync(join(SHARED, 'run-plan.mjs'), 'utf8');
    assert.match(src, /const report = `\$\{repoPath\(ROOT, runDir\)\}\/`;/, 'the Report cell is written with the root\'s prefix');
    const gen = node(p.root, join(p.root, 'scripts', 'shared', 'run-plan.mjs'), ['ci-gitlab', 'orders-release', '--env', 'uat', '--out', join(p.dir, 'child.yml')]);
    assert.equal(gen.status, 0, gen.stdout + gen.stderr);
    const child = readFileSync(join(p.dir, 'child.yml'), 'utf8');
    assert.match(child, /^ {4}- cd \.stlc$/m, 'the generated child pipeline enters .stlc/');
    assert.match(child, /paths: \[\.stlc\/runs\/\]/);
    assert.doesNotMatch(child, /(^|[\s[])qa\//m, 'and never names qa/');
  } finally { p.done(); }
});

// ---- the migration ------------------------------------------------------------------------------

/** A qa/ project as installed before 2.1: profile, wiring, CI templates naming qa/, all committed. */
function gitProject() {
  const p = project('qa', { profile: '- **QA root:** `qa/` (default) — all testing artifacts live under this folder.' });
  const { dir, root } = p;
  cpSync(join(WS, 'ci'), join(root, 'ci'), { recursive: true });
  cpSync(join(WS, 'playwright.config.ts'), join(root, 'playwright.config.ts'));
  // The CI templates a 2.0 install carries name qa/.
  for (const f of ['.gitlab-ci.qa.yml', 'github-qa.yml']) {
    const ci = join(root, 'ci', f);
    writeFileSync(ci, rewireText(readFileSync(ci, 'utf8'), '.stlc', 'qa'));
  }
  writeFileSync(join(dir, 'package.json'), '{\n  "scripts": {\n    "qa:state": "node qa/scripts/shared/build-state.mjs",\n    "qa:lint": "cd qa && npm run qa:lint"\n  }\n}\n');
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n/qa/state.json\nqa/.env.*\n');
  writeFileSync(join(dir, '.gitlab-ci.yml'), "include:\n  - local: 'qa/ci/.gitlab-ci.qa.yml'\n");
  mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
  cpSync(join(root, 'ci', 'github-qa.yml'), join(dir, '.github', 'workflows', 'qa.yml'));
  const settings = JSON.parse(readFileSync(join(ROOT, 'settings.json'), 'utf8'));
  settings.permissions.allow = settings.permissions.allow.filter((a) => !a.includes('.stlc/'));
  writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify(settings, null, 2));
  writeFileSync(join(root, '.env.uat'), 'BASE_URL=https://uat.example.test\n'); // ignored: must move with the folder
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q');
  git('config', 'core.autocrlf', 'false');
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-qm', 'chore(qa): init');
  return { ...p, git };
}
const hashes = (root) => Object.fromEntries(walk(root).filter((f) => /\.(md|ya?ml|ts|js)$/.test(f) && !f.includes(`${join('scripts', 'shared')}`)).map((f) => [f.slice(root.length + 1).split('\\').join('/'), hashArtifact(f)]));

test('migrate-root: a dry run reports the plan and changes nothing', () => {
  const p = gitProject();
  try {
    const r = node(p.dir, join(p.root, 'scripts', 'shared', 'migrate-root.mjs'), ['--to', '.stlc']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /dry run/);
    assert.match(r.stdout, /git mv qa \.stlc/);
    assert.match(r.stdout, /package\.json: .*node \.stlc\/scripts\/shared\/build-state\.mjs/);
    assert.match(r.stdout, /\.claude\/settings\.json: .*\.stlc\/scripts\/shared\/lint-qa\.mjs/);
    assert.match(r.stdout, /qa\/ci\/\.gitlab-ci\.qa\.yml: - cd qa  →  - cd \.stlc/);
    assert.match(r.stdout, /kept\s+\d+ `qa\/` mention\(s\)/, 'hashed bodies are reported, not rewritten');
    assert.match(r.stdout, /TC-API-ORDERS-001-create-order-contract\.md \(\d+\) — its body is hashed/);
    assert.equal(p.git('status', '--porcelain'), '', 'nothing changed');
  } finally { p.done(); }
});

test('migrate-root --write: git mv, profile, unhashed records, wiring; no hash moves; same state; and back', () => {
  const p = gitProject();
  try {
    node(p.dir, join(p.root, 'scripts', 'shared', 'build-state.mjs'), ['--quiet']);
    const before = JSON.parse(readFileSync(join(p.root, 'state.json'), 'utf8'));
    const reviewedCase = 'cases/api/orders/TC-API-ORDERS-001-create-order-contract.md';
    const caseHash = hashArtifact(join(p.root, reviewedCase));

    const r = node(p.dir, join(p.root, 'scripts', 'shared', 'migrate-root.mjs'), ['--to', '.stlc', '--write']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const moved = join(p.dir, '.stlc');
    assert.ok(!existsSync(p.root) && existsSync(join(moved, 'cases')), 'the folder moved');
    assert.ok(existsSync(join(moved, '.env.uat')), 'the ignored .env.uat moved with it');
    assert.match(p.git('status', '--porcelain'), /^R[ M] qa\/cases\/api\/orders\/TC-API-ORDERS-001-create-order-contract\.md -> \.stlc\//m, 'git sees renames');

    assert.equal(hashArtifact(join(moved, reviewedCase)), caseHash, 'a reviewed case keeps its hash, so the review is not stale');
    assert.match(readFileSync(join(moved, reviewedCase), 'utf8'), /\*\*Plan:\*\* qa\/plans\//, '… because its qa/ body was kept');
    const review = readFileSync(join(moved, 'reviews', 'orders', '2026-09-05-case-review.md'), 'utf8');
    assert.match(review, /^ {2}- path: \.stlc\/cases\/api\/orders\//m, 'the review front matter moved');
    assert.match(review, /\*\*Plan:\*\* \.stlc\/plans\//, 'and its unhashed body too');
    assert.match(readFileSync(join(moved, 'plans', 'orders', '2026-09-01-test-plan.md'), 'utf8'), /\| \.stlc\/runs\/api\/orders\/2026-09-10-1000\/ \|/, 'the plan\'s Report cells moved');
    assert.match(readFileSync(join(moved, 'scripts', 'mobile', 'HANDOFF.md'), 'utf8'), /\| \.stlc\/scripts\/mobile\/orders\//);

    const after = JSON.parse(readFileSync(join(moved, 'state.json'), 'utf8'));
    assert.deepEqual(shape(after), shape(before), 'the derived state is the same, path for path');
    assert.match(before.slugs[0].plan, /^qa\//, 'the old index said qa/ …');
    assert.match(after.slugs[0].plan, /^\.stlc\//, '… the new one was rebuilt, not carried along');
    assert.equal(after.slugs[0].review.stale, false);
    assert.equal(after.environments[0].stale, false);

    assert.match(readFileSync(join(p.dir, '.claude', 'PROJECT-PROFILE.md'), 'utf8'), /^- \*\*QA root:\*\* `\.stlc`/m);
    assert.match(readFileSync(join(p.dir, 'package.json'), 'utf8'), /node \.stlc\/scripts\/shared\/build-state\.mjs/);
    assert.match(readFileSync(join(p.dir, 'package.json'), 'utf8'), /cd \.stlc && npm run qa:lint/);
    assert.match(readFileSync(join(p.dir, '.gitignore'), 'utf8'), /^\/\.stlc\/state\.json$/m);
    assert.match(readFileSync(join(p.dir, '.gitlab-ci.yml'), 'utf8'), /local: '\.stlc\/ci\/\.gitlab-ci\.qa\.yml'/);
    assert.match(readFileSync(join(p.dir, '.github', 'workflows', 'qa.yml'), 'utf8'), /working-directory: \.stlc$/m);
    assert.match(readFileSync(join(p.dir, '.claude', 'settings.json'), 'utf8'), /node \.stlc\/scripts\/shared\/lint-qa\.mjs/);
    const gl = readFileSync(join(moved, 'ci', '.gitlab-ci.qa.yml'), 'utf8');
    assert.match(gl, /^ {4}- cd \.stlc$/m);
    assert.match(gl, /\$CI_PROJECT_DIR\/\.stlc\/\.npm/);
    assert.doesNotMatch(gl, /(?<![\w./@-])qa\/(?!scripts\/shared\/migrate-root)/, 'no qa/ path is left in the CI template');

    const lint = node(moved, join(moved, 'scripts', 'shared', 'lint-qa.mjs'));
    assert.match(lint.stdout, /0 error\(s\)/, lint.stdout);

    const back = node(p.dir, join(moved, 'scripts', 'shared', 'migrate-root.mjs'), ['--to', 'qa', '--write']);
    assert.equal(back.status, 0, back.stdout + back.stderr);
    const again = JSON.parse(readFileSync(join(p.dir, 'qa', 'state.json'), 'utf8'));
    assert.deepEqual(shape(again), shape(before), 'and back again');
    assert.match(again.slugs[0].plan, /^qa\//);
    assert.match(readFileSync(join(p.dir, 'qa', 'ci', '.gitlab-ci.qa.yml'), 'utf8'), /^ {4}- cd qa$/m);
  } finally { p.done(); }
});

test('migrate-root --write outside git: a plain rename, ignored files included; a reviewed case with front matter keeps its body', () => {
  const p = project('qa');
  try {
    writeFileSync(join(p.root, '.env.uat'), 'BASE_URL=https://uat.example.test\n');
    mkdirSync(join(p.root, '.auth', 'uat'), { recursive: true });
    writeFileSync(join(p.root, '.auth', 'uat', 'default.json'), '{}');
    // A reviewed case that carries front matter naming the root: the front matter moves, its body may not.
    const reviewed = join(p.root, 'cases', 'api', 'orders', 'TC-API-ORDERS-001-create-order-contract.md');
    const hash = hashArtifact(reviewed);
    writeFileSync(reviewed, `---\nsource: qa/analysis/orders/2026-09-01-analysis.md\n---\n${readFileSync(reviewed, 'utf8')}`);
    assert.equal(hashArtifact(reviewed), hash, 'front matter is outside the hash');
    const r = node(p.dir, join(p.root, 'scripts', 'shared', 'migrate-root.mjs'), ['--to', '.stlc', '--write']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /rename qa \.stlc/);
    const moved = join(p.dir, '.stlc');
    assert.ok(!existsSync(p.root), 'nothing is left under qa/');
    assert.ok(existsSync(join(moved, '.env.uat')) && existsSync(join(moved, '.auth', 'uat', 'default.json')));
    const after = readFileSync(join(moved, 'cases', 'api', 'orders', 'TC-API-ORDERS-001-create-order-contract.md'), 'utf8');
    assert.match(after, /^source: \.stlc\/analysis\//m, 'its front matter moved');
    assert.match(after, /\*\*Plan:\*\* qa\/plans\//, 'its hashed body did not');
    assert.equal(JSON.parse(readFileSync(join(moved, 'state.json'), 'utf8')).slugs[0].review.stale, false);
  } finally { p.done(); }
});

test('migrate-root refuses a move with nowhere to go, and a target that already exists', () => {
  const p = project('qa');
  try {
    mkdirSync(join(p.dir, '.stlc'));
    assert.match(plan(p.dir, '.stlc').problems.join(), /\.stlc\/ already exists/);
    assert.match(plan(p.dir, 'qa').problems.join(), /qa\/ already exists/);
    assert.match(plan(p.dir, 'elsewhere').problems.join(), /--to is \.stlc or qa/);
    const r = node(p.dir, join(p.root, 'scripts', 'shared', 'migrate-root.mjs'), ['--to', '.stlc', '--write']);
    assert.equal(r.status, 1);
    const usage = node(p.dir, join(p.root, 'scripts', 'shared', 'migrate-root.mjs'), []);
    assert.equal(usage.status, 2);
  } finally { p.done(); }
});

test('rewriteDoc: front matter always, the body only when asked; the hash covers the body alone', () => {
  const text = '---\nslug: orders\nreviewed:\n  - path: qa/cases/a.md\n    sha256: 1\n---\n\nSee qa/plans/p.md and /qa-script, not x/qa/y.\n';
  const front = rewriteDoc(text, 'qa', '.stlc');
  assert.equal(front.front, 1);
  assert.equal(front.body, 0);
  assert.equal(front.bodyMentions, 1, 'the body mention is counted, not moved');
  assert.equal(parseDoc(front.text).bodyHash, parseDoc(text).bodyHash, 'front matter is outside the hash');
  const both = rewriteDoc(text, 'qa', '.stlc', { body: true });
  assert.match(both.text, /See \.stlc\/plans\/p\.md and \/qa-script, not x\/qa\/y\./, 'only path tokens move');
  assert.equal(both.body, 1);
  const crlf = rewriteDoc(text.replace(/\n/g, '\r\n'), 'qa', '.stlc', { body: true });
  assert.ok(crlf.text.includes('\r\n') && !/[^\r]\n/.test(crlf.text), 'line endings are kept');
});

test('rewireText: path tokens, `cd`, `working-directory:` and $VAR/ — never qa-, /qa- or @qa/', () => {
  const t = 'cd qa && npm ci\nworking-directory: qa\npaths: [qa/runs/]\nnpm_config_cache: $CI_PROJECT_DIR/qa/.npm\n/qa/state.json\nrun /qa-script and qa:lint and @qa/x and tests/golden/qa/y';
  assert.equal(rewireText(t, 'qa', '.stlc'), 'cd .stlc && npm ci\nworking-directory: .stlc\npaths: [.stlc/runs/]\nnpm_config_cache: $CI_PROJECT_DIR/.stlc/.npm\n/.stlc/state.json\nrun /qa-script and qa:lint and @qa/x and tests/golden/qa/y');
  assert.equal(rewireText(rewireText(t, 'qa', '.stlc'), '.stlc', 'qa'), t, 'and back, byte for byte');
});

test('setProfileRoot replaces the entry and its continuation lines, or adds one under ## Project', () => {
  const p = '## Project\n\n- **Name:** `x`\n- **QA root:** `qa/` (default) — all testing artifacts\n  live under this folder.\n- **Artifact language:** `en`\n';
  const out = setProfileRoot(p, '.stlc');
  assert.match(out, /^- \*\*QA root:\*\* `\.stlc`/m);
  assert.doesNotMatch(out, /live under this folder/);
  assert.match(out, /- \*\*Artifact language:\*\*/);
  assert.equal(profileRoot(out), '.stlc');
  const added = setProfileRoot('## Project\n\n- **Name:** `x`\n\n## Application under test\n', 'qa');
  assert.equal(profileRoot(added), 'qa');
  assert.ok(added.indexOf('QA root') < added.indexOf('## Application under test'));
});
