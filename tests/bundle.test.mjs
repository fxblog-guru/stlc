// Bundle self-lint: the shape of the bundle itself — names, sizes, wiring, citations, counts.
//
// lint-qa.mjs checks the artifacts a project writes; selfcheck.sh proves that lint can fail. This
// file checks the bundle: every command, agent and skill is named by the convention, stays inside
// its context budget, refers only to things that exist, cites only contract sections that exist,
// and the README's counts match the files on disk. Run: node --test "tests/*.test.mjs"
//
// Set STLC_BUNDLE_ROOT to lint a different checkout (the mutation check in CONTRIBUTING.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync, mkdtempSync, cpSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// Script runs in tests are not usage: keep them out of the run log (lib/runlog.mjs).
process.env.QA_RUN_LOG = 'off';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.STLC_BUNDLE_ROOT ?? join(here, '..'));
const { indexSections } = await import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'contracts.mjs')).href);

// ---------------------------------------------------------------------------------------------
// Budgets. Change them here, deliberately, and say why in CHANGELOG.md (CONTRIBUTING.md § Size budgets).
// ---------------------------------------------------------------------------------------------
const BUDGET = {
  commandDescriptionChars: 120, // the / menu; user-invoked, so disable-model-invocation keeps it out of the listing
  agentDescriptionChars: 220, // always in the agent listing
  skillDescriptionChars: 200, // always in the skill listing (~1% of context is shared by all skills)
  listingChars: 8000, // every skill + agent description together
  commandWords: 1200, // deltas only — the protocol holds the rest
  agentWords: 1600,
  skillLines: 500, // past that, move reference material to references/
  protocolWords: 950, // qa-phase-protocol is loaded once per session and stays resident
  agentPreloads: 0, // `skills:` injects the full file on every spawn, whatever the type asked for — every agent invokes its skill by name
};

// Commands that delegate to nobody by design.
const NO_DELEGATE = new Set(['qa-help', 'qa-status', 'qa-feedback']);

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const PROTOCOL = /^qa-[a-z]+-protocol$/;
// Skill-shaped names, for the dangling-reference check (verb-ing-object).
const SKILL_SHAPED = /^(analyzing|building|checking|clarifying|curating|designing|estimating|executing|generating|grounding|healing|improving|maintaining|managing|planning|publishing|reporting|resolving|reviewing|running|summarizing|tracking)-[a-z0-9-]+$/;

function frontmatter(text) {
  const m = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  let key = null;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv) { key = kv[1]; fm[key] = kv[2] === '' ? [] : kv[2].replace(/^"(.*)"$/, '$1'); continue; }
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && key && Array.isArray(fm[key])) fm[key].push(item[1]);
  }
  return fm;
}
const words = (t) => t.split(/\s+/).filter(Boolean).length;
const lines = (t) => t.replace(/\r\n/g, '\n').split('\n').length;
// CRLF folded on read: a Windows checkout (core.autocrlf) must test exactly as the Linux CI does.
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n?/g, '\n');
const list = (dir, pred = () => true) => (existsSync(dir) ? readdirSync(dir).filter(pred) : []);

const commands = list(join(ROOT, 'commands'), (f) => f.endsWith('.md')).map((f) => ({ name: f.replace(/\.md$/, ''), path: join(ROOT, 'commands', f) }));
const agents = list(join(ROOT, 'agents'), (f) => f.endsWith('.md')).map((f) => ({ name: f.replace(/\.md$/, ''), path: join(ROOT, 'agents', f) }));
const skills = list(join(ROOT, 'skills'), (d) => existsSync(join(ROOT, 'skills', d, 'SKILL.md'))).map((d) => ({ name: d, path: join(ROOT, 'skills', d, 'SKILL.md') }));
const skillNames = new Set(skills.map((s) => s.name));
const agentNames = new Set(agents.map((a) => a.name));

// ---------------------------------------------------------------------------------------------
test('the bundle has its parts, its governance files and the shared protocol', () => {
  assert.ok(commands.length >= 25, `expected the command set, found ${commands.length}`);
  assert.ok(agents.length >= 9, `expected the agent set, found ${agents.length}`);
  assert.ok(skills.length >= 38, `expected the skill set, found ${skills.length}`);
  assert.ok(skillNames.has('qa-phase-protocol'), 'skills/qa-phase-protocol/SKILL.md is missing');
  for (const f of ['LICENSE', 'VERSION', 'CHANGELOG.md', 'CONTRIBUTING.md', 'UPGRADE.md', 'SECURITY.md', 'README.md', 'CONTRACTS.md', 'PROJECT-PROFILE.md', 'settings.json', '.gitignore', 'docs/user-guide.md', 'docs/roadmap.md', 'docs/testing-coverage-map.md', 'docs/skill-sources.md']) {
    assert.ok(existsSync(join(ROOT, f)), `${f} is missing at the bundle root`);
  }
  assert.match(read(join(ROOT, 'VERSION')).trim(), /^\d+\.\d+\.\d+$/, 'VERSION is not semver');
  const fm = frontmatter(read(join(ROOT, 'CONTRACTS.md')));
  assert.equal(fm?.bundle, 'agentic-fx-qa', 'CONTRACTS.md front matter must name the bundle');
  assert.match(String(fm?.schema ?? ''), /^\d+$/, 'CONTRACTS.md front matter must carry a schema number');
});

// Versions -------------------------------------------------------------------------------------
// `afx` compares the installed VERSION with the latest one, and the board shows the builder's
// constant, so every place a version is written must agree, or an update notice tells a lie.

/** The released `## [x.y.z]` headings of a Keep-a-Changelog file, newest first, each with its body. */
function releases(text) {
  const out = [];
  for (const part of text.split(/^## /m).slice(1)) {
    const m = part.match(/^\[(\d+)\.(\d+)\.(\d+)\]/);
    if (m) out.push({ version: `${m[1]}.${m[2]}.${m[3]}`, major: Number(m[1]), body: part });
    else assert.match(part, /^\[Unreleased\]/, `CHANGELOG heading "## ${part.split('\n')[0]}" is neither [x.y.z] nor [Unreleased]`);
  }
  return out;
}

test('versions: VERSION, the latest CHANGELOG release, GENERATOR_VERSION, the README line and the state fixtures agree', () => {
  const version = read(join(ROOT, 'VERSION')).trim();
  const changelog = read(join(ROOT, 'CHANGELOG.md'));
  const rel = releases(changelog);
  assert.ok(rel.length, 'CHANGELOG.md has no released version heading');
  assert.equal(rel[0].version, version, 'VERSION differs from the latest released CHANGELOG heading ([Unreleased] may sit above it)');
  assert.match(changelog, new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\] — \\d{4}-\\d{2}-\\d{2}$`, 'm'), `CHANGELOG heading for ${version} is not "## [${version}] — YYYY-MM-DD"`);
  const unreleasedAt = changelog.search(/^## \[Unreleased\]/m);
  if (unreleasedAt >= 0) assert.ok(unreleasedAt < changelog.indexOf(`## [${version}]`), '[Unreleased] must sit above the latest release');
  const builder = read(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'build-state.mjs')).match(/export const GENERATOR_VERSION = '([^']+)'/);
  assert.ok(builder, 'build-state.mjs no longer declares GENERATOR_VERSION');
  assert.equal(builder[1], version, 'build-state.mjs GENERATOR_VERSION differs from VERSION');
  const badge = read(join(ROOT, 'README.md')).match(/\*\*v(\d+\.\d+\.\d+)\*\*/);
  assert.ok(badge, 'README.md lost its **vX.Y.Z** version line');
  assert.equal(badge[1], version, 'README.md version line differs from VERSION');
  for (const f of ['tests/fixture/qa/state.json', 'editor/vscode-stlc/src/test/fixtures/rich/qa/state.json']) {
    assert.equal(JSON.parse(read(join(ROOT, f))).generator_version, version, `${f} carries another generator_version than VERSION`);
  }
});

// A release that says "better" with no measurement is an impression (docs/benchmark.md). From 2.3.0
// on, the latest release either commits its score or says, in the entry itself, why it has none.
export function benchmarkProblem(entry, version, exists) {
  const [maj, min] = version.split('.').map(Number);
  if (maj < 2 || (maj === 2 && min < 3)) return null;
  if (exists(`docs/bench/bench-${version}.json`)) return null;
  if (/^Benchmark: not run — \S.{10,}$/m.test(entry)) return null;
  return `CHANGELOG ${version}: commit docs/bench/bench-${version}.json (npm run qa:bench -- score) or add "Benchmark: not run — <reason>" to the entry`;
}

test('versions: the latest release has a committed benchmark or says why it was not run', () => {
  const [latest] = releases(read(join(ROOT, 'CHANGELOG.md')));
  const exists = (p) => existsSync(join(ROOT, p));
  assert.equal(benchmarkProblem(latest.body, latest.version, exists), null, benchmarkProblem(latest.body, latest.version, exists) ?? '');
  // The check must be able to fail: a bare entry, a reason-less line, and a file that is not there.
  assert.match(benchmarkProblem('### Added\n- x\n', '2.3.0', () => false), /not run/);
  assert.match(benchmarkProblem('Benchmark: not run — \n', '2.3.0', () => false), /not run/);
  assert.equal(benchmarkProblem('### Added\n', '2.3.0', (p) => p === 'docs/bench/bench-2.3.0.json'), null);
  assert.equal(benchmarkProblem('### Added\n', '2.2.1', () => false), null, 'older releases predate the rule');
});

test('versions: CHANGELOG headings descend, and every new MAJOR has ### Breaking and an UPGRADE.md section', () => {
  const rel = releases(read(join(ROOT, 'CHANGELOG.md')));
  const upgrade = existsSync(join(ROOT, 'UPGRADE.md')) ? read(join(ROOT, 'UPGRADE.md')) : '';
  const num = (v) => v.split('.').map(Number);
  for (let i = 0; i < rel.length - 1; i++) {
    const [a, b] = [num(rel[i].version), num(rel[i + 1].version)];
    const newer = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    assert.ok(newer > 0, `CHANGELOG: ${rel[i].version} is listed above ${rel[i + 1].version} but is not newer`);
    if (rel[i].major > rel[i + 1].major) {
      assert.match(rel[i].body, /^### Breaking\b/m, `CHANGELOG ${rel[i].version} is a MAJOR and has no "### Breaking" subsection`);
      assert.match(upgrade, new RegExp(`^## ${rel[i].major}\\.0\\.0 \\(MAJOR`, 'm'), `UPGRADE.md has no "## ${rel[i].major}.0.0 (MAJOR, from …)" section`);
    }
  }
});

test('UPGRADE.md: the steps, the template and a rollback; README and CONTRIBUTING point to it', () => {
  const upgrade = read(join(ROOT, 'UPGRADE.md'));
  for (const s of ['afx outdated', 'afx update --bundle qa', 'npm ci', 'npm run qa:lint', 'npx tsc', 'afx update --bundle qa --ref v']) {
    assert.ok(upgrade.includes(s), `UPGRADE.md no longer says \`${s}\``);
  }
  assert.match(upgrade, /^## Template\b/m, 'UPGRADE.md lost its template section');
  assert.match(read(join(ROOT, 'README.md')), /^## Staying up to date$/m, 'README lost "Staying up to date"');
  assert.match(read(join(ROOT, 'README.md')), /\(UPGRADE\.md\)/, 'README does not link UPGRADE.md');
  const contributing = read(join(ROOT, 'CONTRIBUTING.md'));
  assert.match(contributing, /### Breaking/, 'CONTRIBUTING does not state the MAJOR rule');
  assert.match(contributing, /tag `vX\.Y\.Z` \*\*on `main`\*\*/, 'CONTRIBUTING does not say where the release tag goes');
});

test('the SessionStart hook runs status.mjs --brief, which prints the update notice', () => {
  const settings = JSON.parse(read(join(ROOT, 'settings.json')));
  const cmds = (settings.hooks?.SessionStart ?? []).flatMap((h) => h.hooks.map((x) => x.command));
  assert.ok(cmds.some((c) => /node "\$r\/scripts\/shared\/status\.mjs" --brief/.test(c)), 'SessionStart no longer runs status.mjs --brief');
  // Every hook finds the QA root the way lib/root.mjs does: QA_ROOT, then .stlc/, then qa/ (CONTRACTS §2).
  for (const ev of ['PostToolUse', 'Stop', 'SessionStart']) {
    const c = settings.hooks[ev][0].hooks[0].command;
    assert.match(c, /for r in "\$\{QA_ROOT:-\.stlc\}" \.stlc qa; do/, `${ev}: the hook does not look in QA_ROOT, .stlc/ and qa/`);
  }
  const status = read(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'status.mjs'));
  assert.match(status, /from '\.\/update-notice\.mjs'/, 'status.mjs does not use update-notice.mjs');
});

test('naming: commands are qa-<kebab>, agents and skills are kebab, names match files, nothing is both', () => {
  for (const c of commands) {
    assert.match(c.name, /^qa-/, `command ${c.name} must start with qa-`);
    assert.match(c.name, KEBAB, `command ${c.name} is not lowercase kebab-case`);
  }
  for (const a of agents) {
    assert.match(a.name, KEBAB, `agent ${a.name} is not lowercase kebab-case`);
    const fm = frontmatter(read(a.path));
    assert.ok(fm, `${a.name}: no front matter`);
    assert.equal(fm.name, a.name, `${a.name}: front matter name "${fm.name}" differs from the file name`);
  }
  for (const s of skills) {
    assert.match(s.name, KEBAB, `skill ${s.name} is not lowercase kebab-case`);
    const fm = frontmatter(read(s.path));
    assert.ok(fm, `${s.name}: no front matter`);
    assert.equal(fm.name, s.name, `${s.name}: front matter name "${fm.name}" differs from the directory name`);
    if (!PROTOCOL.test(s.name)) {
      assert.match(s.name.split('-')[0], /ing$/, `${s.name}: a skill is named <verb-ing>-<object>, e.g. designing-api-cases`);
    }
  }
  for (const a of agents) assert.ok(!skillNames.has(a.name), `${a.name} is both an agent and a skill`);
});

test('descriptions: one short trigger line each, commands user-invoked, the whole listing fits the budget', () => {
  let listing = 0;
  for (const c of commands) {
    const fm = frontmatter(read(c.path));
    assert.ok(fm?.description, `${c.name}: no description`);
    assert.ok(fm.description.length <= BUDGET.commandDescriptionChars, `${c.name}: description is ${fm.description.length} chars (max ${BUDGET.commandDescriptionChars})`);
    assert.equal(fm['disable-model-invocation'], 'true', `${c.name}: commands are user-invoked; set disable-model-invocation: true so the description leaves the always-on listing`);
  }
  for (const a of agents) {
    const fm = frontmatter(read(a.path));
    assert.ok(fm?.description, `${a.name}: no description`);
    assert.ok(fm.description.length <= BUDGET.agentDescriptionChars, `${a.name}: description is ${fm.description.length} chars (max ${BUDGET.agentDescriptionChars})`);
    assert.ok(!/\n/.test(fm.description), `${a.name}: description must be one line`);
    listing += fm.description.length;
  }
  for (const s of skills) {
    const fm = frontmatter(read(s.path));
    assert.ok(fm?.description, `${s.name}: no description`);
    assert.ok(fm.description.length <= BUDGET.skillDescriptionChars, `${s.name}: description is ${fm.description.length} chars (max ${BUDGET.skillDescriptionChars})`);
    listing += fm.description.length;
  }
  assert.ok(listing <= BUDGET.listingChars, `skill + agent descriptions total ${listing} chars (max ${BUDGET.listingChars})`);
});

test('sizes: commands carry deltas, skills stay under 500 lines, agents preload at most two skills', () => {
  for (const c of commands) {
    const text = read(c.path);
    assert.ok(words(text) <= BUDGET.commandWords, `${c.name}: ${words(text)} words (max ${BUDGET.commandWords}) — move shared procedure into qa-phase-protocol`);
  }
  for (const a of agents) {
    const text = read(a.path);
    assert.ok(words(text) <= BUDGET.agentWords, `${a.name}: ${words(text)} words (max ${BUDGET.agentWords})`);
    const fm = frontmatter(text);
    const preloads = Array.isArray(fm.skills) ? fm.skills.length : 0;
    assert.ok(preloads <= BUDGET.agentPreloads, `${a.name}: preloads ${preloads} skills; each is injected in full on every spawn — invoke by name instead`);
    for (const s of fm.skills ?? []) assert.ok(skillNames.has(s), `${a.name}: preloads unknown skill ${s}`);
  }
  for (const s of skills) {
    const text = read(s.path);
    assert.ok(lines(text) <= BUDGET.skillLines, `${s.name}: ${lines(text)} lines (max ${BUDGET.skillLines}) — move reference material to references/`);
  }
  const protocol = read(join(ROOT, 'skills', 'qa-phase-protocol', 'SKILL.md'));
  assert.ok(words(protocol) <= BUDGET.protocolWords, `qa-phase-protocol: ${words(protocol)} words (max ${BUDGET.protocolWords})`);
});

test('wiring: every command follows the protocol and names an existing agent or skill', () => {
  for (const c of commands) {
    const text = read(c.path);
    assert.match(text, /`qa-phase-protocol`/, `${c.name}: does not follow qa-phase-protocol`);
    if (NO_DELEGATE.has(c.name)) continue;
    const agentsNamed = [...text.matchAll(/`([a-z][a-z0-9-]*)` agent/g)].map((m) => m[1]);
    const skillsNamed = [...text.matchAll(/`([a-z][a-z0-9-]*)`/g)].map((m) => m[1]).filter((n) => skillNames.has(n) && !PROTOCOL.test(n));
    assert.ok(agentsNamed.length + skillsNamed.length >= 1, `${c.name}: names no agent ("\`<name>\` agent") and no skill`);
    for (const a of agentsNamed) assert.ok(agentNames.has(a), `${c.name}: delegates to unknown agent ${a}`);
  }
});

test('wiring: every skill-shaped name mentioned in a command, agent or skill exists', () => {
  const files = [...commands, ...agents, ...skills].map((x) => x.path);
  const problems = [];
  for (const p of files) {
    const text = read(p);
    for (const m of text.matchAll(/`([a-z][a-z0-9-]*)`/g)) {
      const name = m[1];
      if (SKILL_SHAPED.test(name) && !skillNames.has(name)) problems.push(`${p.slice(ROOT.length + 1)}: \`${name}\``);
    }
  }
  assert.deepEqual([...new Set(problems)], [], `references to skills that do not exist:\n  ${[...new Set(problems)].join('\n  ')}`);
});

// Links into the installed project (`../../../qa/…`) point outside the bundle and are not checked.
test('wiring: every relative markdown link from a skill into the bundle resolves to a file', () => {
  const problems = [];
  for (const s of skills) {
    for (const m of read(s.path).matchAll(/\]\(([^)\s#]+\.md)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/.test(m[1]) || !resolve(dirname(s.path), m[1]).startsWith(join(ROOT, 'skills'))) continue;
      if (!existsSync(join(dirname(s.path), m[1]))) problems.push(`${s.path.slice(ROOT.length + 1)}: ${m[1]}`);
    }
  }
  assert.deepEqual(problems, [], `relative links to missing files:\n  ${problems.join('\n  ')}`);
});

test('citations: every numeric §N / §N.M cited anywhere resolves to a section of CONTRACTS.md, and sections are in order', () => {
  const contract = read(join(ROOT, 'CONTRACTS.md'));
  const idx = indexSections(contract);
  const top = idx.filter((s) => s.level === 2).map((s) => Number(s.id));
  for (let i = 1; i < top.length; i++) assert.equal(top[i], top[i - 1] + 1, `CONTRACTS.md sections are not sequential: §${top[i - 1]} is followed by §${top[i]}`);
  const ids = new Set(idx.map((s) => s.id));
  const hasSubsections = (n) => idx.some((s) => s.level === 3 && s.id.startsWith(n + '.'));
  const files = [...commands, ...agents, ...skills].map((x) => x.path).concat([join(ROOT, 'README.md'), join(ROOT, 'PROJECT-PROFILE.md'), join(ROOT, 'workspace', 'CLAUDE.md'), join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'lint-qa.mjs')]);
  const bad = new Map();
  for (const p of files) {
    for (const m of read(p).matchAll(/§(\d+(?:\.\d+)?)/g)) {
      const id = m[1];
      const parent = id.split('.')[0];
      const ok = ids.has(id) || (id.includes('.') && ids.has(parent) && !hasSubsections(parent));
      if (!ok) bad.set(`§${id}`, (bad.get(`§${id}`) ?? []).concat(p.slice(ROOT.length + 1)));
    }
  }
  assert.equal(bad.size, 0, `citations with no section:\n  ${[...bad].map(([k, v]) => `${k} in ${[...new Set(v)].join(', ')}`).join('\n  ')}`);
});

test('README counts match the files on disk', () => {
  const readme = read(join(ROOT, 'README.md'));
  const claimed = (part) => Number((readme.match(new RegExp(`^\\| \`${part}/\` \\| (\\d+) \\|`, 'm')) ?? [])[1]);
  assert.equal(claimed('agents'), agents.length, `README claims ${claimed('agents')} agents, disk has ${agents.length}`);
  assert.equal(claimed('commands'), commands.length, `README claims ${claimed('commands')} commands, disk has ${commands.length}`);
  assert.equal(claimed('skills'), skills.length, `README claims ${claimed('skills')} skills, disk has ${skills.length}`);
});

test('the workspace scripts and templates the skills rely on exist', () => {
  for (const s of ['scripts/shared/lint-qa.mjs', 'scripts/shared/case-score.mjs', 'scripts/shared/lib/case-quality.mjs', 'scripts/shared/contracts.mjs', 'scripts/shared/build-state.mjs', 'scripts/shared/status.mjs', 'scripts/shared/update-notice.mjs', 'scripts/shared/lint-on-write.mjs', 'scripts/shared/lib/doc.mjs', 'scripts/shared/verdict-upload.mjs', 'scripts/shared/run-plan.mjs', 'scripts/shared/profile.mjs', 'scripts/shared/triage.mjs', 'scripts/shared/bash-guard.mjs', 'scripts/shared/bench.mjs', 'scripts/shared/lib/redact.mjs', 'scripts/shared/http/http-log.ts', 'scripts/shared/lib/run-plan-model.mjs', 'scripts/unit/coverage-summary.mjs', 'scripts/unit/run-unit.sh', 'scripts/mobile/run-mobile.sh', 'scripts/performance/run-k6.sh', 'scripts/security/zap-baseline.sh', 'scripts/shared/lib/platforms.mjs', 'scripts/shared/config/platforms.ts', 'scripts/shared/fixtures/electron.fixture.ts', 'scripts/shared/ui/layout.ts', 'scripts/shared/ui/visual.ts', 'playwright.config.ts', 'eslint.config.mjs', 'package.json']) {
    const p = join(ROOT, 'workspace', 'qa', s);
    assert.ok(existsSync(p) && statSync(p).size > 0, `workspace/qa/${s} is missing`);
  }
  for (const t of ['_templates/analysis.md', '_templates/test-plan.md', '_templates/strategy.md', '_templates/exploratory.md', '_templates/report.md', '_templates/signoff.md', '_templates/defect.md', '_templates/case-review.md', '_templates/case-review-checklist.md', '_templates/clarifications.md', '_templates/impact.md', '_templates/estimate.md', 'docs/test-data.md', '_templates/case-api.md', '_templates/case-integration.md', '_templates/case-e2e.md', '_templates/case-security.md', '_templates/case-performance.md', '_templates/case-unit.md', '_templates/case-accessibility.md', '_templates/case-mobile.md', '_templates/case-ui.md', '_templates/case-data.md']) {
    assert.ok(existsSync(join(ROOT, 'workspace', 'qa', t)), `workspace/qa/${t} is missing`);
  }
  const pkg = JSON.parse(read(join(ROOT, 'workspace', 'qa', 'package.json')));
  for (const r of ['test:e2e', 'test:api', 'test:integration', 'test:perf', 'test:security', 'test:unit', 'test:a11y', 'test:ui', 'test:ui:update', 'test:mobile', 'test:smoke', 'test:regression', 'test:quarantined', 'heal:check', 'qa:lint', 'qa:score', 'verdict:upload']) {
    assert.ok(pkg.scripts?.[r], `qa/package.json lacks runner ${r} (executing-tests calls it by name)`);
  }
});

test('CI templates: GitLab and GitHub both exist, pin the Playwright of package.json, shard, merge and run only-changed', () => {
  const pkg = JSON.parse(read(join(ROOT, 'workspace', 'qa', 'package.json')));
  const pinned = pkg.devDependencies?.['@playwright/test'];
  assert.match(pinned ?? '', /^\d+\.\d+\.\d+$/, `qa/package.json must pin @playwright/test exactly (found ${pinned}) — the CI image is built for one version`);
  // @axe-core/playwright peers on playwright-core >=1.0.0: unpinned, a fresh install pulls the newest
  // core beside the runner's own and tsc fails on two Page types. Same version, exactly.
  assert.equal(pkg.devDependencies?.['playwright-core'], pinned, `qa/package.json must pin playwright-core to ${pinned} (the @playwright/test version)`);
  for (const f of ['.gitlab-ci.qa.yml', 'github-qa.yml']) {
    const p = join(ROOT, 'workspace', 'qa', 'ci', f);
    assert.ok(existsSync(p), `workspace/qa/ci/${f} is missing`);
    const text = read(p);
    const images = [...text.matchAll(/mcr\.microsoft\.com\/playwright:v([\d.]+)/g)].map((m) => m[1]);
    assert.ok(images.length > 0, `${f}: no mcr.microsoft.com/playwright image`);
    assert.deepEqual([...new Set(images)], [pinned], `${f}: Playwright image ${[...new Set(images)].join(', ')} ≠ @playwright/test ${pinned} in package.json`);
    for (const [what, re] of [
      ['sharding', /--shard=/],
      ['blob reports per shard', /PW_BLOB/],
      ['merge-reports into html + junit', /merge-reports --reporter html,junit/],
      ['--only-changed on MR/PR', /--only-changed=/],
      ['--shuffle', /--shuffle/],
      ['--fail-on-flaky-tests', /--fail-on-flaky-tests/],
      ['QA_RUN_ID per job', /QA_RUN_ID:/],
      ['the env file from CI variables', /ci\/write-env\.mjs/],
      ['the verdict upload', /verdict-upload\.mjs/],
    ]) assert.match(text, re, `${f}: no ${what}`);
  }
  assert.ok(existsSync(join(ROOT, 'workspace', 'qa', 'ci', 'write-env.mjs')), 'workspace/qa/ci/write-env.mjs is missing');
});

test('CI templates: both platforms run run plans (CONTRACTS §19) — a manual plan job, sharded, merged, and smoke/regression from their plans', () => {
  const gl = read(join(ROOT, 'workspace', 'qa', 'ci', '.gitlab-ci.qa.yml'));
  const gh = read(join(ROOT, 'workspace', 'qa', 'ci', 'github-qa.yml'));
  for (const [f, text] of [['.gitlab-ci.qa.yml', gl], ['github-qa.yml', gh]]) {
    for (const [what, re] of [
      ['the run-plan runner', /run-plan\.mjs run "\$RUN_PLAN"|run-plan\.mjs ci-gitlab "\$RUN_PLAN"/],
      ['the smoke job runs the smoke plan when present', /run-plans\/smoke\.md \]; then node scripts\/shared\/run-plan\.mjs run smoke/],
      ['the regression job runs the regression plan when present', /run-plans\/regression\.md \]; then node scripts\/shared\/run-plan\.mjs run regression .*--shard/],
      ['the tag-grep fallback', /else npm run test:smoke/],
    ]) assert.match(text, re, `${f}: no ${what}`);
  }
  // GitLab: Run pipeline → RUN_PLAN, a generated child pipeline sharded by the plan, schedules allowed.
  assert.match(gl, /^  RUN_PLAN: ""/m, '.gitlab-ci.qa.yml: no RUN_PLAN variable');
  assert.match(gl, /^qa:plan:generate:/m, '.gitlab-ci.qa.yml: no qa:plan:generate job');
  assert.match(gl, /^qa:plan:\n[\s\S]*?trigger:[\s\S]*?artifact: \.stlc\/run-plan-pipeline\.yml/m, '.gitlab-ci.qa.yml: qa:plan does not trigger the generated child pipeline');
  assert.match(gl, /if: \$RUN_PLAN && \(\$CI_PIPELINE_SOURCE == "web" \|\| \$CI_PIPELINE_SOURCE == "schedule"/, '.gitlab-ci.qa.yml: the plan job is not manual/scheduled-only');
  // GitHub: workflow_dispatch suite=plan + a plan input, the plan's shards as the matrix, one merged report.
  assert.match(gh, /options: \[[^\]]*\bplan\b[^\]]*\]/, 'github-qa.yml: workflow_dispatch suite has no `plan` option');
  assert.match(gh, /^      plan:\n        description:/m, 'github-qa.yml: no `plan` workflow_dispatch input');
  for (const job of ['plan-prepare', 'plan', 'plan-report']) assert.match(gh, new RegExp(`^  ${job}:`, 'm'), `github-qa.yml: no ${job} job`);
  assert.match(gh, /shardIndex: \$\{\{ fromJSON\(needs\.plan-prepare\.outputs\.shard_list\) \}\}/, 'github-qa.yml: plan shards do not come from the plan');
  for (const [f, text] of [['generated GitLab child', read(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'run-plan.mjs'))], ['github-qa.yml', gh]]) {
    assert.match(text, /run-plan\.mjs merge/, `${f}: no merge of the plan's shards`);
    assert.match(text, /PW_BLOB/, `${f}: plan shards write no blob reports`);
  }
  // The child pipeline the GitLab job generates shards, merges and uploads the same way.
  const rp = read(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'run-plan.mjs'));
  for (const [what, re] of [['parallel: <shards>', /`  parallel: \$\{i\.shards\}`/], ['--shard per job', /--shard "\$CI_NODE_INDEX\/\$CI_NODE_TOTAL"/], ['merge-reports html,junit', /'merge-reports', '--reporter', 'html,junit,json'/], ['verdict upload', /verdict-upload\.mjs/], ['write-env', /ci\/write-env\.mjs/]]) {
    assert.match(rp, re, `run-plan.mjs ci-gitlab: no ${what}`);
  }
  const pkg = JSON.parse(read(join(ROOT, 'workspace', 'qa', 'package.json')));
  for (const r of ['qa:plan:list', 'qa:plan:resolve', 'qa:plan:run']) assert.ok(pkg.scripts?.[r], `qa/package.json lacks ${r}`);
});

test('contracts.mjs slices by section and refuses unknown ones', async () => {
  const { slice } = await import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'contracts.mjs')).href);
  const contract = read(join(ROOT, 'CONTRACTS.md'));
  const r = slice(contract, ['3', '9.6', '99']);
  assert.match(r.text, /^## 3\. /m);
  assert.match(r.text, /^## 9\. /m);
  assert.deepEqual(r.missing, ['99']);
  assert.ok(words(r.text) < words(contract) / 3, 'slicing must cost a fraction of the whole file');
});

test('the VS Code board: CI builds the folder that exists, and its ids match its name', () => {
  const ci = read(join(ROOT, '.gitlab-ci.yml'));
  const dir = /^editor:\s*\n(?:.*\n)*?\s+- cd (editor\/[\w-]+)\s*$/m.exec(ci)?.[1];
  assert.ok(dir, '.gitlab-ci.yml has an editor job that cd-s into editor/<name>');
  assert.ok(existsSync(join(ROOT, dir, 'package.json')), `${dir}/package.json — the editor job builds a folder that is not there`);
  assert.equal(dir, 'editor/vscode-stlc', 'the board is editor/vscode-stlc (renamed from vscode-qa in 0.2.0)');
  const pkg = JSON.parse(read(join(ROOT, dir, 'package.json')));
  assert.equal(pkg.name, 'vscode-stlc');
  assert.equal(pkg.repository?.directory, dir);
  const ids = [...pkg.contributes.commands.map((c) => c.command), ...Object.keys(pkg.contributes.configuration.properties)];
  for (const id of ids) assert.match(id, /^stlc\./, `${id}: every command and setting id is stlc.*`);
  // CHANGELOG keeps the rename as history; the live docs must point at the new folder.
  for (const f of ['README.md', 'CONTRACTS.md']) assert.doesNotMatch(read(join(ROOT, f)), /editor\/vscode-qa\b/, `${f} still links editor/vscode-qa`);
});

// ---------------------------------------------------------------------------------------------
// Platforms (CONTRACTS §20) and the `ui` type — the wiring a run on another machine depends on.
// Electron cannot be downloaded everywhere, so the desktop project is proven by its wiring here and
// by the golden's skip-with-reason; nothing below launches a browser or an app.
// ---------------------------------------------------------------------------------------------
const platformsLib = () => import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'lib', 'platforms.mjs')).href);

test('platforms: the linter table and the runtime table agree, and the profile declares §Platforms byte-exact', async () => {
  const lib = await platformsLib();
  const ts = read(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'config', 'platforms.ts'));
  for (const [id, p] of Object.entries(lib.BUILTIN)) {
    assert.match(ts, new RegExp(`\\b${id}: \\{ label: '${p.label}', kind: '${p.kind}', runner: '${p.runner}' \\}`), `config/platforms.ts disagrees with lib/platforms.mjs on ${id}`);
  }
  const profile = read(join(ROOT, 'PROJECT-PROFILE.md'));
  assert.ok(profile.includes('## Platforms\n'), 'PROJECT-PROFILE.md has no ## Platforms section');
  assert.ok(profile.includes(lib.PLATFORMS_COLUMNS), `PROJECT-PROFILE §Platforms columns are not byte-exact (${lib.PLATFORMS_COLUMNS})`);
  assert.ok(profile.includes('## Browsers & devices'), '§Browsers & devices stays as a pointer for one minor version');
  const parsed = lib.parsePlatforms(profile);
  assert.deepEqual(parsed.problems, []);
  assert.equal(parsed.legacy, false);
  assert.deepEqual([...parsed.platforms.keys()].sort(), ['android', 'api', 'ios', 'macos', 'web', 'windows']);
  assert.match(read(join(ROOT, 'CONTRACTS.md')), /^## 20\. Platforms/m, 'CONTRACTS.md has no §20 Platforms');
});

test('platforms: playwright.config names projects per platform and wires desktop-electron to the electron fixture', () => {
  const cfg = read(join(ROOT, 'workspace', 'qa', 'playwright.config.ts'));
  assert.match(cfg, /name: `web-\$\{t\}`/, 'web projects are not named web-<target>');
  assert.match(cfg, /name: DESKTOP_ELECTRON_PROJECT, testMatch: BROWSER_TIERS, grep: DESKTOP_GREP/, 'no desktop-electron project selecting the desktop specs');
  assert.ok(cfg.includes('const DESKTOP_GREP = /@platform:(windows|macos)\\b/;'), 'the desktop project does not select @platform:windows|macos specs');
  assert.match(cfg, /grep: WEB_GREP/, 'the web projects do not exclude other-platform specs');
  assert.match(cfg, /const selection = selectPlatforms\(\);/, 'projects are not driven by PW_PLATFORMS / PW_PROJECTS');
  assert.ok(cfg.includes("snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{projectName}/{testFilePath}/{arg}{ext}'"), 'snapshot paths do not include the OS platform and the project');
  for (const re of [/animations: 'disabled'/, /caret: 'hide'/, /UI_MAX_DIFF_PIXEL_RATIO/]) assert.match(cfg, re);
  const fx = read(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'fixtures', 'electron.fixture.ts'));
  assert.match(fx, /_electron\.launch\(\{ executablePath/, 'the electron fixture does not launch from ELECTRON_APP_PATH');
  assert.match(fx, /testInfo\.skip\(!executablePath, ELECTRON_SKIP_REASON\)/, 'without ELECTRON_APP_PATH a desktop spec must skip with a declared reason');
  assert.match(fx, /delete env\.ELECTRON_RUN_AS_NODE/);
  assert.match(read(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'fixtures', 'index.ts')), /mergeTests\(ui, electron\)/);
  assert.match(read(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'meta.ts')), /`@platform:\$\{p\}`/, 'caseMeta does not tag @platform:<id>');
});

test('platforms: selection reads PW_PLATFORMS with PW_PROJECTS as the alias; routing and type rules', async () => {
  const ts = read(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'config', 'platforms.ts'));
  for (const re of [/env\.PW_PLATFORMS/, /env\.PW_PROJECTS/, /`web-\$\{p\}`/, /name === DESKTOP_ELECTRON_PROJECT/, /PW_PLATFORMS \/ PW_PROJECTS name unknown/]) assert.match(ts, re);
  const lib = await platformsLib();
  const profile = lib.parsePlatforms(read(join(ROOT, 'PROJECT-PROFILE.md')));
  assert.deepEqual(lib.projectsFor('web', profile), ['web-chromium']);
  assert.deepEqual(lib.projectsFor('windows', profile), ['desktop-electron']);
  assert.deepEqual(lib.projectsFor('api', profile), ['api']);
  assert.deepEqual(lib.projectsFor('android', profile), [], 'android runs in the mobile repo, never in a Playwright project');
  assert.equal(lib.toProjectName('chromium'), 'web-chromium');
  assert.equal(lib.platformLabel('other:kiosk-pos'), 'Kiosk Pos');
  assert.equal(lib.typePlatformProblem('mobile', 'web', profile)?.level, 'error');
  assert.equal(lib.typePlatformProblem('ui', 'api', profile)?.level, 'error');
  assert.equal(lib.typePlatformProblem('api', 'web', profile)?.level, 'warn');
  assert.equal(lib.typePlatformProblem('e2e', 'windows', profile), null);
  const legacy = lib.parsePlatforms('## Browsers & devices\n\n| Project | Engine / device | Tier | Default | Used for |\n|---|---|---|---|---|\n| `chromium` | Desktop Chrome | gate | yes | x |\n| `firefox` | Desktop Firefox | nightly | no | x |\n');
  assert.equal(legacy.legacy, true, 'a profile without §Platforms reads the 1.0 way');
  assert.deepEqual(legacy.platforms.get('web').targets.map((t) => t.target), ['chromium', 'firefox']);
});

// One registry (lib/types.mjs) feeds every script. What cannot import it is held to it here, and
// the message names the copy that drifted, so adding a type fails loudly until every copy has it.
test('type registry: every copy of the type list agrees with lib/types.mjs', async () => {
  const reg = await import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'lib', 'types.mjs')).href);
  const stems = reg.TYPES.map((t) => reg.TYPE_STEM[t]);
  assert.equal(new Set(stems).size, stems.length, 'two types share a stem');
  const contractStems = read(join(ROOT, 'CONTRACTS.md')).match(/TYPE ∈ `([A-Z0-9 ]+)`/)[1].split(' ');
  assert.deepEqual([...contractStems].sort(), [...stems].sort(), 'CONTRACTS §1 stem list differs from the registry');
  const pub = read(join(ROOT, 'skills', 'publishing-test-cases', 'scripts', 'lib.mjs')).match(/export const TYPES = \[([^\]]+)\]/)[1].match(/'([a-z0-9]+)'/g).map((x) => x.slice(1, -1));
  assert.deepEqual([...pub].sort(), [...reg.TYPES].sort(), 'skills/publishing-test-cases/scripts/lib.mjs TYPES differs from the registry');
  const profile = read(join(ROOT, 'PROJECT-PROFILE.md'));
  const taxonomy = read(join(ROOT, 'workspace', 'qa', 'docs', 'tag-taxonomy.md'));
  for (const t of reg.TYPES) {
    assert.match(profile, new RegExp(`^\\| \`${t}\` \\| (yes|no) \\|`, 'm'), `PROJECT-PROFILE §Test types has no ${t} row`);
    assert.ok(taxonomy.includes(`\`@${t}\``), `tag-taxonomy.md has no @${t}`);
    assert.ok(existsSync(join(ROOT, 'workspace', 'qa', '_templates', `case-${t === 'e2e' ? 'e2e' : t}.md`)), `no _templates/case-${t}.md`);
    assert.ok(existsSync(join(ROOT, 'agents', `${reg.AGENT_OF[t]}.md`)), `${t}: agent ${reg.AGENT_OF[t]} does not exist`);
    for (const c of ['qa-design', 'qa-script']) assert.match(read(join(ROOT, 'commands', `${c}.md`)), new RegExp(`\\| ${t} \\| \``), `commands/${c}.md has no routing row for ${t}`);
    assert.match(read(join(ROOT, 'commands', 'qa-run.md')), new RegExp(`^\\| ${t} \\| `, 'm'), `commands/qa-run.md has no runner row for ${t}`);
  }
  // No script may carry its own literal list again.
  for (const f of ['lint-qa.mjs', 'case-score.mjs', 'sizing.mjs', 'build-state.mjs', 'coverage-map.mjs', 'changed-modules.mjs', 'renumber-case.mjs', 'lib/sizing.mjs', 'lib/run-plan-model.mjs'])
    assert.doesNotMatch(read(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', f)), /API\|INT\|E2E|'unit', 'api', 'integration'|"unit", "api", "integration"/, `${f} carries its own type list; import lib/types.mjs`);
});

test('data type: the runner treats silence as red and needs a clean mutation run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'run-data-'));
  const wrapper = join(ROOT, 'workspace', 'qa', 'scripts', 'data', 'run-data.mjs');
  const run = (results, extra = []) => {
    if (results !== null) writeFileSync(join(dir, 'rr.json'), JSON.stringify({ results }));
    try { execFileSync(process.execPath, [wrapper, '--repo', dir, '--cmd', 'node -e 0', '--results', 'rr.json', ...extra], { env: { ...process.env, RUN_DIR: join(dir, 'run'), QA_RUN_LOG: 'off' }, stdio: 'pipe' }); return 0; }
    catch (e) { return e.status; }
  };
  try {
    assert.equal(run(null), 2, 'no result file must be SETUP/ENV');
    assert.equal(run([]), 2, 'zero tests must be SETUP/ENV');
    assert.equal(run([{ unique_id: 'test.a', status: 'pass' }, { unique_id: 'test.b', status: 'skipped' }]), 2, 'a skipped test must be SETUP/ENV');
    assert.equal(run([{ unique_id: 'test.a', status: 'pass' }, { unique_id: 'test.b', status: 'fail', message: 'Got 1 result' }]), 1, 'a failing test must fail the run');
    assert.equal(run([{ unique_id: 'test.a', status: 'pass' }], ['--mutate', 'node -e "console.log(\'3/4 mutants killed\')"']), 1, 'a surviving mutant must fail the run');
    assert.equal(run([{ unique_id: 'test.a', status: 'pass' }], ['--mutate', 'node -e "console.log(\'4/4 mutants killed\')"']), 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ui type: listed everywhere a type list exists', () => {
  const w = (p) => read(join(ROOT, 'workspace', 'qa', p));
  assert.ok(read(join(ROOT, 'CONTRACTS.md')).includes('TYPE ∈ `API INT E2E SEC PERF UNIT A11Y MOB UI DATA`'));
  assert.match(read(join(ROOT, 'PROJECT-PROFILE.md')), /^\| `ui` \| yes \|/m);
  assert.match(read(join(ROOT, 'PROJECT-PROFILE.md')), /^## UI testing/m);
  assert.ok(w('eslint.config.mjs').includes('scripts/{api,integration,e2e,security,accessibility,ui}/**/*.spec.ts'));
  assert.ok(w('scripts/shared/lib/types.mjs').includes("ui: { stem: 'UI'"));
  assert.ok(w('scripts/shared/lib/types.mjs').includes("sections: ['## Screen states', '## Viewports', '## Visual baseline', '## Layout rules']"));
  assert.match(w('scripts/shared/lib/run-plan-model.mjs'), /RUNNABLE_TYPES = \[[^\]]*'ui'\]/);
  assert.ok(w('docs/tag-taxonomy.md').includes('`@ui`'));
  assert.ok(w('docs/tag-taxonomy.md').includes('`@platform:<id>`'));
  assert.ok(read(join(ROOT, 'docs', 'testing-coverage-map.md')).includes('type `ui` (`TC-UI`)'));
  for (const c of ['qa-design', 'qa-script']) assert.ok(read(join(ROOT, 'commands', `${c}.md`)).includes('accessibility|ui|mobile|data|all'), `${c} --type has no ui`);
  assert.ok(read(join(ROOT, 'commands', 'qa-run.md')).includes('| ui | `npm run test:ui`'));
  for (const s of ['designing-ui-cases', 'generating-ui-script']) assert.ok(lines(read(join(ROOT, 'skills', s, 'SKILL.md'))) <= 300, `${s} is over 300 lines`);
  const layout = w('scripts/shared/ui/layout.ts');
  for (const f of ['expectNoHorizontalScroll', 'expectNoOverflow', 'expectNoOverlap', 'expectTouchTargets']) assert.ok(layout.includes(`export async function ${f}(`), `ui/layout.ts lacks ${f}`);
});

test('CI templates: platform matrix variable, manual ui-baselines and desktop jobs on both platforms', () => {
  const gl = read(join(ROOT, 'workspace', 'qa', 'ci', '.gitlab-ci.qa.yml'));
  const gh = read(join(ROOT, 'workspace', 'qa', 'ci', 'github-qa.yml'));
  for (const [f, t] of [['.gitlab-ci.qa.yml', gl], ['github-qa.yml', gh]]) {
    assert.match(t, /PW_PLATFORMS: web,api/, `${f}: no PW_PLATFORMS matrix variable`);
    assert.match(t, /npm run test:ui:update/, `${f}: no ui baseline job`);
    assert.match(t, /--project setup desktop-electron/, `${f}: no desktop job`);
  }
  assert.match(gl, /^qa:desktop:[\s\S]*?tags: \[desktop-runner\]/m);
  assert.match(gh, /runs-on: \[self-hosted, desktop\]/);
  assert.match(read(join(ROOT, 'workspace', 'qa', 'ci', 'README.md')), /## Platform and browser matrix/);
});

// ---------------------------------------------------------------------------------------------
// Maestro (CONTRACTS §15 Maestro, §20 Runner `maestro`): the runner vocabulary, the JUnit mapping and
// the run-plan routing. The lint rules are mutation-tested in selfcheck.sh; nothing here needs a device.
// ---------------------------------------------------------------------------------------------
const maestroLib = () => import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'lib', 'maestro.mjs')).href);

test('maestro: the runner is in both platform tables, the profile, the contract and the npm scripts', async () => {
  const lib = await platformsLib();
  assert.ok(lib.RUNNERS.includes('maestro'), 'lib/platforms.mjs RUNNERS lacks maestro');
  assert.ok(!lib.PLAYWRIGHT_RUNNERS.includes('maestro'), 'maestro is not a Playwright runner');
  assert.match(read(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'config', 'platforms.ts')), /'playwright-electron' \| 'maestro' \|/);
  assert.match(read(join(ROOT, 'PROJECT-PROFILE.md')), /`maestro` \(mobile flows run from/);
  assert.match(read(join(ROOT, 'CONTRACTS.md')), /\*\*Maestro \(Runner `maestro`, §20\)/);
  const pkg = JSON.parse(read(join(ROOT, 'workspace', 'qa', 'package.json')));
  assert.equal(pkg.scripts['test:mobile:maestro'], 'node scripts/mobile/run-maestro.mjs');
  for (const f of ['README.md', 'config.yaml', 'flows/launch-clean.yaml', 'flows/sign-in.yaml', 'flows/network.yaml', 'flows/cleanup.yaml', 'scripts/run-context.js', 'scripts/actor.js', 'scripts/api.js', 'scripts/cleanup.js', 'scripts/unique.js', 'elements/app.js']) {
    assert.ok(existsSync(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'maestro', f)), `the Maestro kit lacks ${f}`);
  }
  assert.ok(existsSync(join(ROOT, 'skills', 'generating-mobile-script', 'references', 'maestro-flows.md')));
});

test('maestro: the kit never writes a raw id or a literal timeout, and every kit path it names exists', async () => {
  const { parseFlow, fromElementMap, fromTimeouts, resolveRef } = await maestroLib();
  const dir = join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'maestro', 'flows');
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.yaml'))) {
    const p = join(dir, name).replace(/\\/g, '/');
    const f = parseFlow(read(p));
    assert.equal(f.appId, '${APP_ID}', `${name}: appId`);
    for (const i of f.ids) assert.ok(fromElementMap(i.value), `${name}:${i.line} raw id ${i.value}`);
    for (const t of f.timeouts) assert.ok(fromTimeouts(t.value), `${name}:${t.line} literal timeout ${t.value}`);
    for (const r of f.refs) assert.ok(existsSync(resolveRef(p, r.path)), `${name}: ${r.path} does not exist`);
  }
});

test('maestro: JUnit maps to Case IDs by the flow name; unnamed tests are reported, not guessed', async () => {
  const { junitOutcomes } = await maestroLib();
  const xml = '<testsuites><testsuite>'
    + '<testcase name="TC-MOB-ORDERS-002 — [Orders · Android, iOS] x → y" time="1"/>'
    + '<testcase name="TC-MOB-ORDERS-003 — z"><failure message="Assertion is false: &quot;Open&quot; is visible"/></testcase>'
    + '<testcase name="TC-MOB-ORDERS-0030 — not the same id"/>'
    + '<testcase name="login smoke"/>'
    + '</testsuite></testsuites>';
  const { out, unmapped } = junitOutcomes(xml);
  assert.deepEqual(out.get('TC-MOB-ORDERS-002'), { pass: 1, fail: 0, skip: 0, message: null });
  assert.equal(out.get('TC-MOB-ORDERS-003').fail, 1);
  assert.equal(out.get('TC-MOB-ORDERS-003').message, 'Assertion is false: "Open" is visible');
  assert.equal(out.get('TC-MOB-ORDERS-003').pass, 0, 'a 4-digit id must not count as TC-MOB-ORDERS-003');
  // NNN is 3 digits (CONTRACTS §1): a 4-digit id is no Case ID, so it is unmapped, never folded into -003.
  assert.deepEqual(unmapped, ['TC-MOB-ORDERS-0030 — not the same id', 'login smoke']);
});

test("maestro: the device log yields the app's crashes and ANRs, and never another app's", async () => {
  const { crashesOf } = await import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'lib', 'device-log.mjs')).href);
  const log = [
    '10-16 09:00:01.100  1200  1200 I ActivityManager: Start proc 4242:com.example.app/u0a1',
    '10-16 09:00:05.200  4242  4242 E AndroidRuntime: FATAL EXCEPTION: main',
    '10-16 09:00:05.200  4242  4242 E AndroidRuntime: Process: com.example.app, PID: 4242',
    '10-16 09:00:05.200  4242  4242 E AndroidRuntime: java.lang.IllegalStateException: order has no lines',
    '10-16 09:00:06.000  5555  5555 E AndroidRuntime: FATAL EXCEPTION: main',
    '10-16 09:00:06.000  5555  5555 E AndroidRuntime: Process: com.other.app, PID: 5555',
    '10-16 09:00:07.000  1200  1300 E ActivityManager: ANR in com.example.app (com.example.app/.OrdersActivity)',
    '10-16 09:00:07.000  1200  1300 E ActivityManager: PID: 4243',
    '10-16 09:00:07.000  1200  1300 E ActivityManager: Reason: Input dispatching timed out',
    '10-16 09:00:08.000  4300  4300 F DEBUG   : pid: 4300, tid: 4300, name: RenderThread  >>> com.example.app <<<',
    '10-16 09:00:08.000  4300  4300 F DEBUG   : signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0',
    '10-16 09:00:09.000  1200  1300 E ActivityManager: ANR in com.example.app.helper',
    '10-16 09:00:09.500  6000  6000 F DEBUG   : pid: 6000, tid: 6000, name: main  >>> com.other.app <<<',
  ].join(String.fromCharCode(13, 10)); // CRLF: an adb log pulled on Windows
  const found = crashesOf(log, 'com.example.app');
  assert.deepEqual(found.map((c) => [c.kind, c.line, c.title]), [
    ['java', 2, 'java.lang.IllegalStateException: order has no lines'],
    ['anr', 7, 'Reason: Input dispatching timed out'],
    ['native', 10, 'signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0'],
  ], 'another app, and an app id that only starts with ours, are not our crashes');
  assert.match(found[0].excerpt, /^10-16 09:00:05\.200 .*FATAL EXCEPTION/);
  assert.deepEqual(crashesOf('', 'com.example.app'), []);
  assert.deepEqual(crashesOf(log, ''), []);
});

test('maestro: the runner captures the device log and fails a run whose app crashed', () => {
  const src = read(join(ROOT, 'workspace', 'qa', 'scripts', 'mobile', 'run-maestro.mjs'));
  assert.match(src, /adb\(\['logcat', '-c'\]\)/, "the log is cleared before the run, so an old crash is not this run's");
  assert.match(src, /adb\(\['logcat', '-d'/, 'the log is dumped after the run');
  assert.match(src, /deviceLog, crashes \}/, 'results.json carries deviceLog and crashes');
  assert.match(src, /crashes\.length && !results\.exit \? 1/, 'a crash fails a run whose flows all passed');
});

test('maestro: a run plan runs a flow on a maestro platform and lists a spec-only case as handoff', async () => {
  const model = await import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'lib', 'run-plan-model.mjs')).href);
  const profile = { platforms: new Map([['android', { runner: 'maestro', kind: 'mobile', enabled: true }], ['ios', { runner: 'appium-wdio', kind: 'mobile', enabled: true }]]) };
  const flowCase = { type: 'mobile', platforms: ['android', 'ios'], scripts: ['scripts/mobile/orders/TC-MOB-ORDERS-002-x.yaml'] };
  assert.deepEqual(model.runnersOf(flowCase, profile).map((r) => `${r.runner}:${r.platform}`), ['maestro:android', 'handoff:ios']);
  const specCase = { type: 'mobile', platforms: ['android'], scripts: ['scripts/mobile/orders/TC-MOB-ORDERS-001-x.spec.ts'] };
  const [r] = model.runnersOf(specCase, profile);
  assert.equal(r.runner, 'handoff', 'a case with no flow cannot run on Maestro');
  const lib = await platformsLib();
  assert.match(lib.handoffCommand('android', 'maestro'), /no Maestro flow yet/);
});

test('maestro: the fixture carries the shipped kit byte for byte (it is what an install has)', () => {
  const kit = join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'maestro');
  const fx = join(ROOT, 'tests', 'fixture', 'qa', 'scripts', 'shared', 'maestro');
  const files = (d, base = d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? files(join(d, n), base) : [join(d, n).slice(base.length + 1)]));
  for (const f of files(kit)) assert.equal(read(join(fx, f)), read(join(kit, f)), `fixture copy of shared/maestro/${f} drifted — cp -R workspace/qa/scripts/shared/maestro/. tests/fixture/qa/scripts/shared/maestro/`);
});

// Runners (lib/runners.mjs): one registry entry is the whole wiring. Every vocabulary list derives
// from it, and a wrapper runner added to the registry routes, prints and judges with no other edit.
test('runners: the registry is the one runner vocabulary — platforms, the TS type and the profile agree with it', async () => {
  const reg = await import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'lib', 'runners.mjs')).href);
  const lib = await platformsLib();
  assert.deepEqual(lib.RUNNERS, reg.RUNNER_IDS);
  assert.deepEqual(lib.PLAYWRIGHT_RUNNERS, reg.PLAYWRIGHT_ENGINE);
  const ts = read(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'config', 'platforms.ts'));
  const tsIds = [...(/export type PlatformRunner = ([^;]+);/.exec(ts)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(tsIds, reg.RUNNER_IDS, 'config/platforms.ts PlatformRunner disagrees with lib/runners.mjs');
  const profile = read(join(ROOT, 'PROJECT-PROFILE.md'));
  for (const id of reg.RUNNER_IDS) assert.ok(profile.includes(`\`${id}\``), `PROJECT-PROFILE.md does not describe runner \`${id}\``);
  for (const id of reg.WRAPPER_ENGINE) {
    const r = reg.RUNNER_REGISTRY[id];
    assert.ok(existsSync(join(ROOT, 'workspace', 'qa', r.wrapper)), `${id}: wrapper ${r.wrapper} does not exist`);
    assert.ok(r.types.length && r.ext && r.evidence && r.idPattern, `${id}: a wrapper runner names types, ext, evidence and idPattern`);
  }
});

test('runners: a new wrapper runner needs only its registry entry to be routed and listed', async () => {
  const reg = await import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'lib', 'runners.mjs')).href);
  const model = await import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'lib', 'run-plan-model.mjs')).href);
  reg.RUNNER_REGISTRY['selenium-java'] = { label: 'Selenium (Java)', engine: 'wrapper', language: 'Java', types: ['e2e'], ext: '.java', wrapper: 'scripts/e2e/run-selenium.mjs', evidence: 'e2e', idPattern: /^(TC-E2E-[A-Z0-9-]+?-\d{3})\b/ };
  try {
    const profile = { platforms: new Map([['web', { runner: 'selenium-java', kind: 'web', enabled: true }]]) };
    const c = { type: 'e2e', platforms: ['web'], scripts: ['scripts/e2e/orders/TC-E2E-ORDERS-001-x.java'] };
    assert.deepEqual(model.runnersOf(c, profile), [{ runner: 'selenium-java', wrapper: true, platform: 'web', script: c.scripts[0] }]);
    const noScript = model.runnersOf({ ...c, scripts: ['scripts/e2e/orders/TC-E2E-ORDERS-001-x.spec.ts'] }, profile);
    assert.equal(noScript[0].runner, 'handoff', 'a case with no script for the runner is listed, never run on the wrong one');
    assert.match(reg.handoffLine('web', 'selenium-java'), /no Selenium \(Java\) script for this case yet/);
    assert.deepEqual(reg.wrapperCommand('selenium-java', 'web', 'uat', ['TC-E2E-ORDERS-001']), ['node', 'scripts/e2e/run-selenium.mjs', '--platform', 'web', '--env', 'uat', '--cases', 'TC-E2E-ORDERS-001']);
  } finally { delete reg.RUNNER_REGISTRY['selenium-java']; }
});

test('runners: any JUnit report maps to Case IDs by the start of the test name', async () => {
  const { junitOutcomes, resultsOf } = await import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'lib', 'junit.mjs')).href);
  const j = junitOutcomes('<testsuite><testcase name="TC-E2E-ORDERS-001 — x"/><testcase name="TC-API-ORDERS-002 y"><skipped/></testcase><testcase name="shouldWork"/></testsuite>');
  assert.equal(j.out.get('TC-E2E-ORDERS-001').pass, 1);
  assert.equal(j.out.get('TC-API-ORDERS-002').skip, 1);
  assert.deepEqual(j.unmapped, ['shouldWork']);
  assert.equal(resultsOf(null, { exit: 1 }).noReport, true);
});

// Coverage map (CONTRACTS §22): covered / total over surfaces the application owns, read from files.
// The fixture's numbers are asserted exactly, so a matching change that moves them fails here.
// Machine setup (lib/tooling.mjs): the tool plan is a function of the profile, never a fixed list.
const toolingLib = () => import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'lib', 'tooling.mjs')).href);

test('setup: the tool plan follows enabled types and platform runners', async () => {
  const { toolingPlan } = await toolingLib();
  const P = (rows) => new Map(rows.map(([id, kind, runner, enabled]) => [id, { id, kind, runner, enabled }]));
  const ids = (plan, need) => plan.filter((t) => !need || t.need === need).map((t) => t.id).sort();

  const apiOnly = toolingPlan({ types: ['api'], platforms: P([['api', 'service', 'playwright-request', true]]) }, { os: 'win' });
  assert.deepEqual(ids(apiOnly, 'required'), ['deps', 'envFile', 'node'], 'an api-only project needs no browsers, k6, docker or mobile tools');

  const full = toolingPlan({
    types: ['e2e', 'performance', 'security', 'mobile', 'unit'],
    platforms: P([['web', 'web', 'playwright', true], ['android', 'mobile', 'maestro', true], ['ios', 'mobile', 'appium-wdio', false]]),
    unitFrameworks: ['csharp / xunit', 'typescript / vitest'],
  }, { os: 'win' });
  assert.deepEqual(ids(full, 'required'), ['adb', 'browsers', 'deps', 'docker', 'dotnet', 'envFile', 'java', 'k6', 'maestro', 'node']);
  assert.deepEqual(ids(full, 'optional'), ['allure', 'mobileMcp', 'playwrightCli']);
  assert.ok(!full.some((t) => t.id === 'xcrun' || t.id === 'appium'), 'a disabled ios platform adds nothing');
  assert.match(full.find((t) => t.id === 'adb').install, /^winget /, 'the install command is the one for this OS');
  assert.deepEqual(full.find((t) => t.id === 'deps').for.slice(0, 2), ['lint, runners, run plans', 'e2e']);

  const appium = toolingPlan({ types: ['mobile'], platforms: P([['ios', 'mobile', 'appium-wdio', true]]) }, { os: 'linux' });
  assert.deepEqual(ids(appium, 'required'), ['appium', 'deps', 'envFile', 'node', 'xcrun']);
  assert.match(appium.find((t) => t.id === 'xcrun').install, /needs macOS/, 'iOS off a Mac is explained, not a command');
  assert.ok(!appium.some((t) => t.id === 'maestro'), 'appium-wdio does not pull Maestro');

  const mobileOff = toolingPlan({ types: ['api'], platforms: P([['android', 'mobile', 'maestro', true]]) });
  assert.ok(!mobileOff.some((t) => t.id === 'maestro'), 'an enabled platform of a disabled type adds nothing');
});

test('setup: unit frameworks come from §Unit testing, and the command and npm script are wired', async () => {
  const { unitFrameworks, unitTool } = await toolingLib();
  assert.deepEqual(unitFrameworks(read(join(ROOT, 'PROJECT-PROFILE.md'))), ['csharp / xunit', 'typescript / vitest']);
  assert.deepEqual(['csharp / xunit', 'python / pytest', 'kotlin / junit5', 'typescript / jest', 'rust / cargo'].map(unitTool), ['dotnet', 'python', 'maven', 'node', null]);
  const pkg = JSON.parse(read(join(ROOT, 'workspace', 'qa', 'package.json')));
  assert.equal(pkg.scripts['qa:setup'], 'node scripts/shared/setup-check.mjs');
  assert.match(read(join(ROOT, 'commands', 'qa-setup.md')), /`preparing-test-tooling`/);
});

test('coverage map: every dimension is covered/total from a file, and a missing denominator is not measurable', () => {
  const script = join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'coverage-map.mjs');
  const run = (cwd, extra = []) => JSON.parse(execFileSync(process.execPath, [script, '--json', ...extra], { cwd, encoding: 'utf8', env: { ...process.env, QA_LINT_TODAY: '2026-09-15' } }));
  const fx = join(ROOT, 'tests', 'fixture', 'qa');
  const j = run(fx);
  const d = Object.fromEntries(j.dimensions.map((x) => [x.key, x]));
  const got = (k) => `${d[k].covered}/${d[k].total}`;
  assert.equal(got('requirements'), '5/5');
  assert.equal(got('ac'), '3/3');
  assert.equal(got('api'), '1/5', 'POST /orders is the only operation an api case names');
  // The ## API operations table: operation → its api cases. The method is part of the match.
  const out = join(tmpdir(), 'cov-ops.md');
  execFileSync(process.execPath, [script, '--out', out], { cwd: fx, env: { ...process.env, QA_LINT_TODAY: '2026-09-15' }, stdio: 'pipe' });
  const opRows = read(out).split(/\r?\n/).filter((l) => /^\| (GET|POST|PUT|PATCH|DELETE) \//.test(l));
  const ops = Object.fromEntries(opRows.map((l) => { const c = l.split('|').map((x) => x.trim()); return [c[1], c[3]]; }));
  rmSync(out, { force: true });
  assert.equal(ops['POST /orders'], 'TC-API-ORDERS-001');
  assert.equal(ops['GET /orders'], '—', 'the method is part of the operation: a POST case does not cover GET');
  assert.equal(ops['GET /orders/{id}'], '—');
  assert.equal(got('api-authz'), '1/5', 'GET /admin/orders, via TC-SEC-ORDERS-001');
  assert.equal(got('screens-e2e'), '1/3');
  assert.equal(got('screens-a11y'), '2/3');
  assert.equal(got('rules'), '1/1');
  assert.equal(got('automation-p01'), '7/10'); // TC-DATA-ORDERS-001 is a scripted P0
  assert.equal(d['req-type'].pct, null, 'the fixture analysis has no §5 matrix: not measurable, never 0 %');
  assert.match(d['req-type'].note, /§5/);
  const api = j.types.find((t) => t.type === 'api');
  assert.equal(api.surface, '1/5 operations');
  assert.match(j.types.find((t) => t.type === 'unit').surface, /orders 92\.0% lines/);

  // Without a spec the API dimensions say why, and are never a number.
  const tmp = mkdtempSync(join(tmpdir(), 'cov-'));
  cpSync(fx, tmp, { recursive: true });
  rmSync(join(tmp, 'docs', 'openapi.yaml'));
  const n = Object.fromEntries(run(tmp).dimensions.map((x) => [x.key, x]));
  assert.equal(n.api.pct, null);
  assert.match(n.api.note, /no OpenAPI spec/);
  rmSync(tmp, { recursive: true, force: true });
});

test('coverage map: --strict fails on a requirement with no case, and the report lints as a non-slug folder', () => {
  const script = join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'coverage-map.mjs');
  const tmp = mkdtempSync(join(tmpdir(), 'cov-'));
  cpSync(join(ROOT, 'tests', 'fixture', 'qa'), tmp, { recursive: true });
  const env = { ...process.env, QA_LINT_TODAY: '2026-09-15' };
  execFileSync(process.execPath, [script, '--strict'], { cwd: tmp, env, stdio: 'pipe' });
  assert.ok(existsSync(join(tmp, 'reports', 'coverage', '2026-09-15-coverage.md')));
  const rep = read(join(tmp, 'reports', 'coverage', '2026-09-15-coverage.md'));
  for (const h of ['## Summary', '## Coverage by dimension', '## Coverage by test type', '## API operations', '## Screens', '## Unit code coverage', '## Gaps', '## Sources']) assert.ok(rep.includes(`\n${h}\n`), `report lacks ${h}`);
  const lint = execFileSync(process.execPath, [join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'lint-qa.mjs')], { cwd: tmp, env, encoding: 'utf8' });
  assert.match(lint, /0 error\(s\)/);
  assert.doesNotMatch(lint, /reports\/coverage/);
  // Add a requirement with no case: --strict must now fail.
  const an = join(tmp, 'analysis', 'orders', '2026-09-01-analysis.md');
  writeFileSync(an, read(an).replace('| REQ-001 | Creating an order', '| REQ-009 | A paid order cannot be deleted | orders | functional | docs/orders.md:L40 | — |\n| REQ-001 | Creating an order'));
  const plan = join(tmp, 'plans', 'orders', '2026-09-01-test-plan.md');
  assert.throws(() => execFileSync(process.execPath, [script, '--strict', '--json'], { cwd: tmp, env, stdio: 'pipe' }), 'REQ-009 has no case');
  assert.ok(existsSync(plan));
  rmSync(tmp, { recursive: true, force: true });
});

// Token diet: the profile is printed by section, never read whole, and the printer flags placeholders.
test('profile: no file asks for a full Read of PROJECT-PROFILE.md; profile.mjs slices it and flags placeholders', async () => {
  const offenders = [...commands, ...agents, ...skills].filter((x) => /Read `\.claude\/PROJECT-PROFILE\.md`( first|\. )/.test(read(x.path))).map((x) => x.name);
  assert.deepEqual(offenders, [], `full profile reads — print the sections with profile.mjs instead: ${offenders.join(', ')}`);
  const lib = await import(pathToFileURL(join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'profile.mjs')).href);
  const profile = read(join(ROOT, 'PROJECT-PROFILE.md'));
  const one = lib.print(profile, ['Test types']);
  assert.match(one.text, /^## Test types/);
  assert.doesNotMatch(one.text, /^## Environments/m, 'the next section leaked into the slice');
  assert.ok(one.text.length < profile.length / 5, 'a one-section slice is not much smaller than the file');
  assert.deepEqual(lib.print(profile, ['unit test']).missing, [], 'a heading prefix does not resolve');
  assert.deepEqual(lib.print(profile, ['No such section']).missing, ['No such section']);
  assert.ok(lib.print(profile, ['Project']).holes.some((h) => /§Project line \d+ `<your product name>`/.test(h)), 'the template placeholder in §Project is not flagged');
  assert.deepEqual(lib.print('## A\n- **x:** `value`\n## B\n', ['A']).holes, [], 'a filled value is flagged as a placeholder');
  // After the dash a line documents its options; `<none>` is the value "none" — neither is a hole.
  assert.deepEqual(lib.print('## A\n- **Class:** `fix` — `<initiative | change | fix>`, the default\n- **Prefixes:** `<none>` — none added\n## B\n', ['A']).holes, [], 'documented options or <none> flagged as placeholders');
  assert.equal(lib.print('## A\n- **Blueprint:** `<path to the ADR>` — written at G2\n| `prod` | `<not hosted yet>` |\n## B\n', ['A']).holes.length, 2, 'an unfilled setting or table cell is not flagged');
  // Every § a profile-first line names must be a section the printer can find.
  const idx = lib.sections(profile.split('\n'));
  const unknown = new Set();
  for (const x of [...commands, ...agents, ...skills]) {
    for (const line of read(x.path).split('\n').filter((l) => l.includes('profile.mjs'))) {
      for (const m of line.matchAll(/`§([A-Z][A-Za-z &]+?)`/g)) if (!lib.find(idx, m[1])) unknown.add(`${x.name}: §${m[1]}`);
    }
  }
  assert.deepEqual([...unknown], [], 'profile sections named that profile.mjs cannot find');
});
