// runlog.mjs — the kit's own run log: one JSON line per script run in <qa-root>/logs/runs.jsonl, with
// the fields sdlc's DEV-CONTRACTS §13.5 names for a log line, so one collector ships both bundles.
//
//   { timestamp, level, service: "stlc", event: "script.run_completed", run_id, script, slug,
//     args, exit, duration_ms }
//
// A script opts in with one line at the top of its body:  trackRun(import.meta.url);
// The line is written when the process exits, whatever the exit path (process.exit, a crash, the
// end of main). `run_id` is QA_RUN_ID when the caller sets one (CI, a run plan), else one per
// process. Never throws and never creates the root. QA_RUN_LOG=off stops it; the file rolls at 5 MB.
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspaceRoot } from './root.mjs';

export const MAX_BYTES = 5 * 1024 * 1024;
const SECRET_ARG = /^--?(token|password|secret|pat|api[-_]?key)(=|$)/i;
const PROCESS_RUN_ID = randomBytes(8).toString('hex');

/** argv without the values of secret-looking flags. */
export function safeArgs(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]);
    if (!SECRET_ARG.test(a)) { out.push(a); continue; }
    if (a.includes('=')) out.push(`${a.split('=')[0]}=[REDACTED]`);
    else { out.push(a); if (i + 1 < argv.length) { out.push('[REDACTED]'); i++; } }
  }
  return out;
}

const slugOf = (argv) => {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { if (!argv[i].includes('=') && argv[i + 1] && !argv[i + 1].startsWith('--')) i++; continue; }
    return argv[i];
  }
  return null;
};

/** Append one record under `root`. Returns the line, or null when nothing was written. */
export function logRun(root, record, { env = process.env, argv = process.argv.slice(2), now = new Date() } = {}) {
  try {
    if (env.QA_RUN_LOG === 'off' || !root || !existsSync(root)) return null;
    const dir = join(root, 'logs');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'runs.jsonl');
    if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, join(dir, 'runs.1.jsonl'));
    const text = JSON.stringify({
      timestamp: now.toISOString(),
      level: record.exit ? 'error' : 'info',
      service: 'stlc',
      event: 'script.run_completed',
      run_id: env.QA_RUN_ID || PROCESS_RUN_ID,
      slug: slugOf(argv),
      args: safeArgs(argv),
      duration_ms: Math.round(process.uptime() * 1000),
      ...record,
    });
    appendFileSync(file, `${text}\n`);
    return text;
  } catch {
    return null;
  }
}

/** Log this script's run when the process exits. Pass `import.meta.url`. */
export function trackRun(url, { root } = {}) {
  const script = basename(fileURLToPath(url)).replace(/\.mjs$/, '');
  // An 'exit' listener only observes: a crash still crashes, with its own exit code.
  process.once('exit', (code) => { logRun(root ?? workspaceRoot(), { script, exit: code ?? 0 }); });
}
