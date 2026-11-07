#!/usr/bin/env node
/**
 * setup-check.mjs — is this machine ready to test what the profile enables? (`npm run qa:setup`,
 * the `preparing-test-tooling` skill, `/qa-setup`).
 *
 * Reads PROJECT-PROFILE (§Test types, §Platforms, §Unit testing), builds the tool plan
 * (lib/tooling.mjs), probes each tool read-only, and prints one row per tool with the exact install
 * command for this OS. It installs nothing and never prints a value from .env.
 *
 * Usage (from the QA root):
 *   node scripts/shared/setup-check.mjs [--env uat] [--json]
 * Exit: 0 when every required tool is present, 1 when one is missing, 2 on a usage problem.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readPlatformProfile } from './lib/platforms.mjs';
import { toolingPlan, unitFrameworks } from './lib/tooling.mjs';
import { workspaceRoot } from './lib/root.mjs';
import { trackRun } from './lib/runlog.mjs';

trackRun(import.meta.url);

const ROOT = workspaceRoot();
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const env = opt('--env', process.env.QA_ENV || 'uat');
const os = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';

const profile = readPlatformProfile(ROOT);
if (!profile) { console.error('setup-check: no PROJECT-PROFILE.md next to the QA root — run `afx install` (or copy it to .claude/)'); process.exit(2); }
const plan = toolingPlan(
  { types: profile.types, platforms: profile.platforms, unitFrameworks: unitFrameworks(readFileSync(profile.path, 'utf8')) },
  { os, hasWikiInbox: existsSync(join(ROOT, 'wiki', 'inbox')) },
);

const run = (argv) => {
  const r = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', shell: os === 'win', timeout: 20000 });
  return r.status === 0 ? `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n')[0].slice(0, 60) : null;
};
const envVars = (() => {
  const p = join(ROOT, `.env.${env}`);
  if (!existsSync(p)) return null;
  const out = {};
  for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l); if (m && !l.trim().startsWith('#')) out[m[1]] = m[2].trim(); }
  return out;
})();

function browsers() {
  if (envVars?.PW_CHANNEL) return `channel ${envVars.PW_CHANNEL} (installed browser)`;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH
    || (os === 'win' ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'ms-playwright')
      : os === 'mac' ? join(homedir(), 'Library', 'Caches', 'ms-playwright') : join(homedir(), '.cache', 'ms-playwright'));
  const found = existsSync(cache) ? readdirSync(cache).filter((n) => /^(chromium|firefox|webkit)-\d+/.test(n)) : [];
  return found.length ? found.map((n) => n.split('-')[0]).filter((v, i, a) => a.indexOf(v) === i).join(', ') : null;
}
function mcpConfigured(name) {
  for (const p of [join(ROOT, '..', '.mcp.json'), join(homedir(), '.claude.json')]) {
    try { if (existsSync(p) && new RegExp(`"${name}"\\s*:`).test(readFileSync(p, 'utf8'))) return `configured (${p.includes('.mcp.json') ? 'project' : 'user'})`; } catch { /* unreadable: not configured */ }
  }
  return null;
}

const rows = plan.map((t) => {
  let found = null;
  if (t.id === 'envFile') found = envVars ? `.env.${env}` : null;
  else if (t.id === 'browsers') found = browsers();
  else if (t.mcp) found = mcpConfigured(t.mcp);
  else if (t.path) found = existsSync(join(ROOT, t.path)) ? 'installed' : null;
  else if (t.probe) found = run(t.probe) ?? (t.alt ? run(t.alt) : null);
  if (found && t.minMajor) { const major = Number((/(\d+)\./.exec(found) ?? [])[1]); if (major && major < t.minMajor) found = null; }
  return { ...t, found, status: found ? 'ok' : t.need === 'required' ? 'MISSING' : 'optional' };
});

// Devices are not tools: reported for mobile, never a failure here (/qa-env judges them per run).
const devices = rows.some((r) => r.id === 'adb' && r.found) ? (run(['adb', 'devices']) !== null ? spawnSync('adb', ['devices'], { encoding: 'utf8', shell: os === 'win' }).stdout.split('\n').filter((l) => /\tdevice$/.test(l)).length : 0) : null;

if (args.includes('--json')) {
  console.log(JSON.stringify({ env, os, types: profile.types, devices, tools: rows.map(({ id, label, need, for: why, status, found, install }) => ({ id, label, need, for: why, status, found, install })) }, null, 2));
} else {
  console.log(`qa:setup — ${os}, env ${env}, types: ${profile.types.join(', ') || 'none enabled'}`);
  for (const r of rows) {
    const mark = r.status === 'ok' ? '✓' : r.status === 'MISSING' ? '✗' : '·';
    console.log(`  ${mark} ${r.label.padEnd(52)} ${r.status === 'ok' ? r.found : r.status.padEnd(8)}  ${r.status === 'ok' ? '' : `→ ${r.install}`}`);
    console.log(`      for: ${r.for.join(' · ')}`);
  }
  if (devices !== null) console.log(`  Android devices attached: ${devices}${devices ? '' : ' — boot an emulator (Android Studio › Device Manager) or plug in a device with USB debugging on'}`);
  const missing = rows.filter((r) => r.status === 'MISSING');
  console.log(missing.length ? `\n${missing.length} required tool(s) missing. Install them, then re-run npm run qa:setup.` : '\nEvery required tool is present. Next: /qa-env ' + env);
}
process.exit(rows.some((r) => r.status === 'MISSING') ? 1 : 0);
