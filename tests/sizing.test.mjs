// sizing.test.mjs — the token levers are mechanisms, so each is held by a test that fails when the
// lever is removed: fan-out narrows to sized ∩ enabled types, a spawn past the class budget is refused,
// ids and traceability rows come from a script, reviewers get a brief, and light agents run on sonnet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'sizing.mjs');
const S = await import(pathToFileURL(SCRIPT).href);
const PLAN = 'plans/orders/2026-09-01-test-plan.md';
const env = { ...process.env, QA_RUN_LOG: 'off' };
delete env.ELECTRON_RUN_AS_NODE;

function project({ profileTypes = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'stlc-size-'));
  cpSync(join(ROOT, 'tests', 'fixture', 'qa'), join(dir, 'qa'), { recursive: true });
  if (profileTypes) {
    const rows = profileTypes.map(([t, on]) => `| \`${t}\` | ${on ? 'yes' : 'no'} | x | x |`).join('\n');
    writeFileSync(join(dir, 'PROJECT-PROFILE.md'), `## Test types\n\n| Type | Enabled | Tool | Output |\n|---|---|---|---|\n${rows}\n`);
  }
  return { dir, qa: join(dir, 'qa') };
}
const run = (qa, args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: qa, encoding: 'utf8', env });
const setTypes = (qa, types) => {
  const p = join(qa, PLAN);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/^- types: .*$/m, `- types: ${types}`));
};

test('fanout: only the sized types the profile enables are spawned, one spawn per agent', () => {
  const { dir, qa } = project({ profileTypes: [['api', true], ['e2e', true], ['security', true], ['performance', false], ['mobile', false]] });
  try {
    setTypes(qa, 'api, e2e, performance');
    const r = S.fanout(qa, 'orders');
    assert.deepEqual(r.types, ['api', 'e2e'], 'performance is disabled, security was not sized: neither is spawned');
    assert.deepEqual(r.agents, { 'case-designer': ['api', 'e2e'] });
    const p = join(qa, PLAN);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/^- worth_testing: .*$/m, '- worth_testing: no — copy change'));
    assert.match(S.fanout(qa, 'orders').error, /not worth testing/);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/^## Sizing[\s\S]*?(?=^## 1\.)/m, ''));
    assert.match(S.fanout(qa, 'orders').error, /no ## Sizing/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('spawn: refused (exit 3) past the class budget unless the plan records a spawn_reason', () => {
  const { dir, qa } = project();
  try {
    const p = join(qa, PLAN);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/^- change_class: .*$/m, '- change_class: trivial').replace(/^- types: .*$/m, '- types: api'));
    assert.equal(run(qa, ['spawn', 'orders', '--agent', 'case-designer', '--phase', 'design']).status, 0);
    assert.equal(run(qa, ['spawn', 'orders', '--agent', 'automation-engineer', '--phase', 'script']).status, 0);
    const third = run(qa, ['spawn', 'orders', '--agent', 'case-designer', '--phase', 'design']);
    assert.equal(third.status, 3, third.stdout + third.stderr);
    assert.match(third.stderr, /passes the trivial budget of 2/);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/^- spawns: .*$/m, '$&\n- spawn_reason: the first design was rejected by review'));
    assert.equal(run(qa, ['spawn', 'orders', '--agent', 'case-designer', '--phase', 'design']).status, 0);
    assert.equal(readFileSync(join(qa, 'logs', 'spawns.jsonl'), 'utf8').trim().split('\n').length, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('estimate: prints the sizing lines and exits 3 over the profile budget', () => {
  const { dir, qa } = project();
  try {
    const ok = run(qa, ['estimate', 'orders', '--class', 'standard', '--types', 'api,e2e', '--reqs', '2']);
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /- estimate_tokens: \d+\n- spawns: 4/);
    writeFileSync(join(dir, 'PROJECT-PROFILE.md'), '**Token budget per run:** `1000`\n');
    const over = run(qa, ['estimate', 'orders', '--class', 'standard', '--types', 'api', '--reqs', '1']);
    assert.equal(over.status, 3);
    assert.match(over.stdout, /OVER — stop and ask/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('next-id and trace-upsert: an id and a row without reading the matrix', () => {
  const { dir, qa } = project();
  try {
    assert.equal(S.nextId(qa, 'accessibility', 'ORDERS'), 'TC-A11Y-ORDERS-003');
    assert.equal(S.nextId(qa, 'api', 'BILLING'), 'TC-API-BILLING-001');
    const plan = join(qa, PLAN);
    const before = readFileSync(plan, 'utf8');
    assert.equal(S.traceUpsert(plan, { req: 'REQ-001', caseId: 'TC-API-ORDERS-001', type: 'api', module: 'orders', priority: 'P0' }), 'exists');
    assert.equal(readFileSync(plan, 'utf8'), before, 'an existing row is left alone');
    assert.equal(S.traceUpsert(plan, { req: 'REQ-001', caseId: 'TC-API-ORDERS-002', type: 'api', module: 'orders', priority: 'P1' }), 'added');
    const rows = readFileSync(plan, 'utf8').split('\n').filter((l) => /^\| (REQ|re-verify)/.test(l));
    assert.equal(rows.at(-1), '| REQ-001 | TC-API-ORDERS-002 | api | orders | P1 | ❌ | — | — | — |', 'appended as the last row of the table');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('brief: a reviewer is pointed at changed cases, uncovered REQs and its lint findings — no bodies', () => {
  const { dir, qa } = project();
  try {
    const lint = '  ERROR cases/api/orders/TC-API-ORDERS-001-create-order-contract.md: x\n  WARN  plans/billing/2026-09-12-test-plan.md: y';
    const b = S.brief(qa, 'orders', { lint });
    assert.match(b, /## Changed since the last review \(\d+ of \d+\)/);
    assert.match(b, /- ERROR cases\/api\/orders\/TC-API-ORDERS-001/);
    assert.doesNotMatch(b, /billing/, 'another slug\'s findings are not this reviewer\'s');
    assert.doesNotMatch(b, /## Steps/, 'the brief never inlines a case body');
    assert.match(b, /## Requirements with no case/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Heavy = judgment over the whole feature (analysis, planning, review, orchestration); light =
// writing one case or script from a reviewed template. A light agent on opus pays for judgment it
// does not use.
const MODELS = {
  'qa-orchestrator': 'opus', 'doc-analyst': 'opus', 'test-planner': 'opus',
  'case-designer': 'sonnet', 'automation-engineer': 'sonnet', 'nonfunctional-engineer': 'sonnet',
  'unit-test-engineer': 'sonnet', 'mobile-test-engineer': 'sonnet', 'data-test-engineer': 'sonnet', 'qa-reporter': 'sonnet',
};
test('agents: light phases run on sonnet, heavy ones on opus, and every agent is classified', () => {
  const dir = join(ROOT, 'agents');
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert.deepEqual(files.map((f) => f.slice(0, -3)).sort(), Object.keys(MODELS).sort(), 'a new agent needs a model class here');
  for (const f of files) {
    const fm = /^---\n([\s\S]*?)\n---/.exec(readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n'))[1];
    assert.equal(/^model:\s*(\S+)/m.exec(fm)?.[1], MODELS[f.slice(0, -3)], `${f}: model`);
  }
});

test('commands: design and script fan out through sizing, review starts from the brief, designers mint ids by script', () => {
  const r = (p) => readFileSync(join(ROOT, p), 'utf8');
  for (const c of ['commands/qa-design.md', 'commands/qa-script.md']) {
    assert.match(r(c), /sizing\.mjs fanout <slug>/, `${c}: does not fan out through sizing`);
    assert.match(r(c), /sizing\.mjs spawn <slug>/, `${c}: does not record spawns`);
  }
  assert.match(r('commands/qa-review.md'), /sizing\.mjs brief/);
  assert.match(r('agents/case-designer.md'), /sizing\.mjs next-id/);
  assert.match(r('skills/planning-tests/SKILL.md'), /## Sizing/);
  // The routing tables of the commands and the script must agree, or fanout spawns the wrong agent.
  for (const [type, agent] of Object.entries(S.AGENT_OF)) assert.match(r('commands/qa-design.md'), new RegExp(`^\\| ${type} \\| \`${agent}\` \\|`, 'm'), `${type} → ${agent}`);
});
