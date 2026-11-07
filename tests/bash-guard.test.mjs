// bash-guard.test.mjs — the PreToolUse Bash guard refuses what must never run unattended (CONTRACTS §25)
// and lets its look-alikes through. A denied command exits 2 (Claude Code refuses the call); a safe
// one exits 0. settings.json wires the hook and keeps a deny list beside it.
// Run: node --test "tests/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = join(ROOT, 'workspace', 'qa', 'scripts', 'shared', 'bash-guard.mjs');
const { denied } = await import(pathToFileURL(GUARD).href);

const hook = (command, tool_name = 'Bash') => spawnSync(process.execPath, [GUARD], { input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name, tool_input: { command } }), encoding: 'utf8' });

const DENIED = {
  'force-push': ['git push --force', 'git push -f origin main', 'git push origin main --force', 'git push origin +main', 'git push --force-with-lease origin feat/x'],
  'rm-root': ['rm -rf /', 'rm -rf ~', 'rm -rf ~/', 'rm -rf .', 'rm -rf ./', 'rm -rf *', 'rm -r -f /', 'rm -fr $HOME', 'sudo rm -rf / --no-preserve-root', 'bash -c "rm -rf ~"'],
  'drop-database': ['psql -c "DROP DATABASE orders"', 'mysql -e "drop schema shop"', 'echo "DROP DATABASE x" | psql'],
  truncate: ['psql -c "TRUNCATE orders"', 'mysql -e "truncate table users"', 'sqlite3 qa.db "TRUNCATE TABLE t"'],
  'reset-hard-remote': ['git reset --hard origin/main', 'git reset --hard upstream/develop'],
  'no-verify': ['git commit --no-verify -m x', 'git commit -m x --no-verify', 'git push --no-verify', 'git push origin main --no-verify'],
  'env-write': ['echo TOKEN=x > .env', 'echo A=1 >> .stlc/.env.uat', 'printf x | tee qa/.env.qa', "sed -i 's/a/b/' .env.prod", 'echo x > "./.env"'],
};

const ALLOWED = [
  'grep -rn TRUNCATE scripts/',
  'grep -i "drop table" docs/test-data.md',
  'cat .env.example',
  'cp .env.example .env.uat',
  'cp .stlc/.env.example .stlc/.env.qa',
  'echo x > .env.example',
  'echo x > config.env.ts',
  'rm -rf node_modules',
  'rm -rf ./test-results',
  'rm -rf runs/_adhoc/2026-09-10-1030',
  'git push origin feat/five-pillars',
  'git push -u origin feat/x',
  'git reset --hard HEAD~1',
  'git commit -m "verify the fix"',
  'git log --oneline -5',
  'npm run test:api',
];

test('every destructive command is denied by the rule it names', () => {
  for (const [id, cmds] of Object.entries(DENIED)) {
    for (const c of cmds) assert.equal(denied(c)?.id, id, `\`${c}\` should trip ${id}, got ${denied(c)?.id ?? 'nothing'}`);
  }
});

test('safe look-alikes pass', () => {
  for (const c of ALLOWED) assert.equal(denied(c), null, `\`${c}\` was blocked by ${denied(c)?.id}`);
});

test('the hook exits 2 with the reason on stderr for a denied command, 0 for a safe one', () => {
  for (const c of ['git push --force', 'rm -rf ~', 'psql -c "DROP DATABASE x"', 'psql -c "TRUNCATE t"', 'git reset --hard origin/main', 'git commit --no-verify -m x', 'echo x > .env']) {
    const r = hook(c);
    assert.equal(r.status, 2, `\`${c}\` exited ${r.status}`);
    assert.match(r.stderr, /blocked by the stlc bash guard \([a-z-]+\).*CONTRACTS §25/);
  }
  for (const c of ['grep TRUNCATE x.sql', 'cp .env.example .env.qa', 'git push origin main']) assert.equal(hook(c).status, 0, `\`${c}\` was blocked`);
  assert.equal(hook('rm -rf /', 'Write').status, 0, 'a non-Bash tool is not the guard\'s');
  assert.equal(spawnSync(process.execPath, [GUARD], { input: 'not json', encoding: 'utf8' }).status, 0, 'a bad payload must never block');
});

test('settings.json runs the guard before Bash, propagates its exit code, and keeps the deny list', () => {
  const settings = JSON.parse(readFileSync(join(ROOT, 'settings.json'), 'utf8'));
  const pre = (settings.hooks.PreToolUse ?? []).find((h) => h.matcher === 'Bash');
  assert.ok(pre, 'no PreToolUse Bash hook');
  const cmd = pre.hooks[0].command;
  assert.match(cmd, /for r in "\$\{QA_ROOT:-\.stlc\}" \.stlc qa; do/);
  assert.match(cmd, /node "\$r\/scripts\/shared\/bash-guard\.mjs"; exit \$\?/, 'the loop must exit with the guard\'s code, or exit 2 is lost');
  const deny = settings.permissions.deny;
  for (const d of ['Bash(git push --force*)', 'Bash(rm -rf /*)', 'Bash(rm -rf ~*)', 'Bash(git reset --hard origin/*)', 'Bash(git commit --no-verify*)', 'Write(.env)', 'Write(**/.env.uat)', 'Edit(**/.env)']) {
    assert.ok(deny.includes(d), `deny lacks ${d}`);
  }
  assert.ok(!deny.some((d) => /\.env\.example/.test(d)), '.env.example must stay writable');
  // Run the wired command through a shell from a project whose root is the bundle's workspace.
  const sh = spawnSync('bash', ['-c', cmd], { cwd: ROOT, env: { ...process.env, QA_ROOT: 'workspace/qa' }, input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push -f' } }), encoding: 'utf8' });
  assert.equal(sh.status, 2, `the wired hook exited ${sh.status}: ${sh.stderr}`);
});
