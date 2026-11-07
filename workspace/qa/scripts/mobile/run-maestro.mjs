#!/usr/bin/env node
/**
 * run-maestro.mjs — the `maestro` runner (PROJECT-PROFILE §Platforms Runner `maestro`, CONTRACTS §15).
 * Runs the case flows under <qa-root>/scripts/mobile/ on one platform, with the shared kit in
 * <qa-root>/scripts/shared/maestro/, and writes the evidence executing-tests and /qa-report read:
 *
 *   runs/mobile/<slug|_adhoc>/<run-id>/<platform>/junit.xml        Maestro's JUnit (test name = flow name = Case ID — title)
 *   runs/mobile/<slug|_adhoc>/<run-id>/<platform>/results.json      Case ID → pass/fail/skip, unmapped tests, exit code
 *   runs/mobile/<slug|_adhoc>/<run-id>/<platform>/maestro-output.log
 *   runs/mobile/<slug|_adhoc>/<run-id>/<platform>/device.log         Android: the device log of the run (logcat -d; heavy — git-ignored)
 *   runs/mobile/<slug|_adhoc>/<run-id>/<platform>/artifacts/        screenshots, recordings, commands (heavy — git-ignored)
 *   runs/mobile/<slug|_adhoc>/<run-id>/repo-state.txt               QA root commit, maestro version, device, app id
 *
 * Usage (npm run test:mobile:maestro -- …):
 *   --platform android|ios        required
 *   --env <name>                  .env.<name> (default QA_ENV, else uat)
 *   --tags smoke[,regression]     --include-tags (OR, as Maestro does); default: all case flows
 *   --exclude-tags <t,…>          added to `quarantined`, which is always excluded
 *   --cases TC-MOB-…[,…]          run exactly these flows (a run plan passes them)
 *   --modules orders[,…]          only these module folders
 *   --device <id>                 Maestro --device (an emulator name / udid); default: the one booted
 *   --shards <n>                  Maestro --shard-split across n connected devices
 *   --dry-run                     print the maestro command and the flows; run nothing
 * Exit: Maestro's exit code (non-zero when a flow failed); 2 on a usage or setup problem.
 * Crashes: on Android the device log is cleared before the run and dumped after it; every crash or ANR
 * of the app id goes into results.json `crashes` (lib/device-log.mjs). iOS: `deviceLog` says why not.
 * Secrets: .env values are passed to Maestro as -e variables and never printed or written.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { readJunit } from '../shared/lib/maestro.mjs';
import { crashesOf } from '../shared/lib/device-log.mjs';
import { resultsOf } from '../shared/lib/junit.mjs';
import { workspaceRoot } from '../shared/lib/root.mjs';

// QA_ROOT_DIR, else the working directory (npm runs from the root), else lib/root.mjs (CONTRACTS §2).
const ROOT = workspaceRoot();
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const flag = (n) => args.includes(n);
const list = (s) => (s ? String(s).split(',').map((x) => x.trim()).filter(Boolean) : []);
const die = (m) => { console.error(`run-maestro: ${m}`); process.exit(2); };
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');
const pad = (n) => String(n).padStart(2, '0');
const runIdNow = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`; };

const platform = opt('--platform');
if (!['android', 'ios'].includes(platform)) die('--platform android|ios is required');
const env = opt('--env', process.env.QA_ENV || 'uat');
const includeTags = list(opt('--tags'));
const excludeTags = ['quarantined', ...list(opt('--exclude-tags'))];
const cases = list(opt('--cases'));
const modules = list(opt('--modules'));

// ── .env.<env> → the variables a flow may read ────────────────────────────────
// Only these names are passed; a flow cannot read the rest of the environment. Credentials are
// gathered into QA_ACTORS so one -e carries every role (scripts/actor.js reads it).
function readEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}
const envFile = join(ROOT, `.env.${env}`);
const fileVars = readEnvFile(envFile);
const v = { ...fileVars, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(MAESTRO_|MOBILE_|API_|TEST_|QA_)/.test(k))) };

const appId = platform === 'android' ? v.MOBILE_ANDROID_APP_ID : v.MOBILE_IOS_APP_ID;
if (!appId) die(`${platform === 'android' ? 'MOBILE_ANDROID_APP_ID' : 'MOBILE_IOS_APP_ID'} is not set — add it to .env.${env} (the app id of the build under test)`);
const actors = {};
for (const [k, val] of Object.entries(v)) {
  const m = /^TEST_USER(?:_([A-Z0-9_]+))?$/.exec(k);
  if (!m || !val) continue;
  const role = m[1] ? m[1].toLowerCase().replace(/_/g, '-') : 'standard';
  actors[role] = { user: val, password: v[m[1] ? `TEST_PASSWORD_${m[1]}` : 'TEST_PASSWORD'] ?? '' };
}
const qaRunId = process.env.QA_RUN_ID || `${runIdNow().replace(/-/g, '')}`;
const flowEnv = {
  APP_ID: appId,
  API_BASE_URL: v.API_BASE_URL ?? '',
  API_TOKEN: v.MOBILE_API_TOKEN ?? '',
  QA_ACTORS: JSON.stringify(actors),
  QA_RUN_ID: qaRunId,
  QA_SHARD: process.env.QA_SHARD || '1',
  MAESTRO_PLATFORM: platform,
  ...Object.fromEntries(Object.entries(v).filter(([k]) => /^QA_T_[A-Z_]+$/.test(k))),
};

// ── which flows ───────────────────────────────────────────────────────────────
function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== 'shared') yield* walk(p); } else yield p;
  }
}
const mobileDir = join(ROOT, 'scripts', 'mobile');
const allFlows = [...walk(mobileDir)].filter((p) => /[\\/]TC-MOB-[^\\/]+\.yaml$/.test(p));
const flows = allFlows.filter((p) => {
  const id = (/(TC-MOB-[A-Z0-9-]+?-\d{3})-/.exec(p) ?? [])[1];
  const mod = rel(p).split('/')[2];
  return (!cases.length || cases.includes(id)) && (!modules.length || modules.includes(mod));
});
const missing = cases.filter((id) => !flows.some((p) => p.includes(`${id}-`)));
if (missing.length) die(`no flow for ${missing.join(', ')} under scripts/mobile/ — /qa-script --type mobile first`);
if (!flows.length) die('no case flows selected (scripts/mobile/<module>/TC-MOB-*.yaml)');

// ── evidence folder ───────────────────────────────────────────────────────────
const runDir = resolve(ROOT, process.env.RUN_DIR || join('runs', 'mobile', '_adhoc', runIdNow()));
const outDir = join(runDir, platform);
const config = join(ROOT, 'scripts', 'shared', 'maestro', 'config.yaml');
const maestroArgs = [
  ...(opt('--device') ? ['--device', opt('--device')] : []),
  'test',
  '--config', config,
  '--format', 'junit',
  '--output', join(outDir, 'junit.xml'),
  '--test-output-dir', join(outDir, 'artifacts'),
  '--test-suite-name', `qa mobile ${platform} ${env}`,
  ...(includeTags.length ? ['--include-tags', includeTags.join(',')] : []),
  '--exclude-tags', excludeTags.join(','),
  ...(opt('--shards') ? ['--shard-split', opt('--shards')] : []),
  ...Object.keys(flowEnv).flatMap((k) => ['-e', `${k}=${flowEnv[k]}`]),
  ...flows,
];
// What is printed never carries a value: -e pairs are shown as names only.
const printable = maestroArgs.map((a, i) => (maestroArgs[i - 1] === '-e' ? `${a.split('=')[0]}=…` : a.startsWith(ROOT) ? rel(a) : a));
console.log(`maestro ${printable.join(' ')}`);
console.log(`flows (${flows.length}): ${flows.map(rel).join(' ')}`);
console.log(`evidence: ${rel(outDir)}/`);
if (flag('--dry-run')) process.exit(0);
if (!existsSync(envFile)) die(`.env.${env} is missing — copy .env.example to .env.${env} and fill the MOBILE_* values`);

const version = spawnSync('maestro', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
if (version.status !== 0) die('the maestro CLI is not on PATH — install it (https://docs.maestro.dev) and boot an emulator/simulator; /qa-env names the missing piece');

mkdirSync(join(outDir, 'artifacts'), { recursive: true });
const git = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
writeFileSync(join(runDir, 'repo-state.txt'), [
  `qa: ${git.status === 0 ? git.stdout.trim() : 'not a git checkout'}`,
  `runner: maestro ${version.stdout.trim()}`,
  `platform: ${platform}`,
  `device: ${opt('--device') ?? '<the booted device>'}`,
  `app id: ${appId}`,
  `env: ${env}`,
  `tags: ${includeTags.join(',') || '<all>'} (excluded: ${excludeTags.join(',')})`,
  '',
].join('\n'));

// The device log is evidence, not a gate: no adb, or a log that cannot be read, is reported and the run goes on.
const adb = (a) => spawnSync('adb', [...(opt('--device') ? ['-s', opt('--device')] : []), ...a], { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 256 * 1024 * 1024 });
let deviceLog = platform === 'ios' ? 'not captured — iOS crash reports are read from the device, not a log stream (/qa-run names them)' : null;
if (platform === 'android' && adb(['logcat', '-c']).status !== 0) deviceLog = 'not captured — `adb logcat -c` failed (adb not on PATH, or the device id is wrong)';

const r = spawnSync('maestro', maestroArgs, { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
const log = `${r.stdout ?? ''}${r.stderr ?? ''}`;
process.stdout.write(log);
writeFileSync(join(outDir, 'maestro-output.log'), log);

let crashes = [];
if (platform === 'android' && !deviceLog) {
  const d = adb(['logcat', '-d', '-v', 'threadtime']);
  if (d.status === 0) {
    writeFileSync(join(outDir, 'device.log'), d.stdout);
    crashes = crashesOf(d.stdout, appId);
    deviceLog = `${rel(outDir)}/device.log`;
  } else deviceLog = 'not captured — `adb logcat -d` failed after the run';
}

const junit = readJunit(join(outDir, 'junit.xml'));
const results = { ...resultsOf(junit, { runner: 'maestro', platform, env, exit: r.status ?? 1 }), deviceLog, crashes };
writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2) + '\n');
if (!junit) console.error(`run-maestro: Maestro wrote no JUnit report — every selected case is ⛔ blocked (SETUP/ENV); see ${rel(outDir)}/maestro-output.log`);
if (results.unmapped.length) console.error(`run-maestro: ${results.unmapped.length} test(s) whose name carries no Case ID: ${results.unmapped.join(' | ')}`);
for (const c of crashes) console.error(`run-maestro: ${c.kind === 'anr' ? 'ANR' : 'crash'} of ${appId} at device.log:${c.line} — ${c.title}`);
// A crash fails the run even when every flow passed: the user saw the app die.
process.exit(crashes.length && !results.exit ? 1 : results.exit);
