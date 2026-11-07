/**
 * device-log.mjs — crashes and ANRs of the app under test, read from an Android device log
 * (CONTRACTS §15 Maestro evidence). run-maestro.mjs clears the log before a run, dumps it after,
 * and writes what this finds into results.json `crashes`; executing-tests reads a crash as
 * FUNCTIONAL evidence, never as a flaky retry.
 *
 * Three signatures, each matched only for the app id under test (another app's crash is not ours):
 *   java   `AndroidRuntime: FATAL EXCEPTION: <thread>` … `Process: <appId>, PID: <n>`
 *   anr    `ActivityManager: ANR in <appId>`
 *   native `DEBUG …: pid: <n>, tid: <n>, name: … >>> <appId> <<<`
 */

const norm = (t) => t.replace(/\r\n?/g, '\n');
// The log tag and message of a threadtime / time / brief line; the prefix before the tag varies.
const TAGGED = /\b[VDIWEF][/ ]\s*([A-Za-z0-9_.$-]+)\s*(?:\(\s*\d+\))?\s*:\s?(.*)$/;
const EXCERPT_LINES = 12;

/** [{ kind: 'java'|'anr'|'native', line, title, excerpt }] for `appId`, in log order. */
export function crashesOf(logText, appId) {
  if (!logText || !appId) return [];
  const lines = norm(logText).split('\n');
  const out = [];
  const take = (i, kind, title) => out.push({ kind, line: i + 1, title, excerpt: lines.slice(i, i + EXCERPT_LINES).join('\n') });
  for (let i = 0; i < lines.length; i++) {
    const m = TAGGED.exec(lines[i]);
    if (!m) continue;
    const [, tag, msg] = m;
    if (tag === 'AndroidRuntime' && /^FATAL EXCEPTION\b/.test(msg)) {
      // The process line follows within a few lines; the exception is the line after it.
      const near = lines.slice(i + 1, i + 4).map((l) => (TAGGED.exec(l) ?? [])[2] ?? '');
      const proc = near.findIndex((x) => x.startsWith(`Process: ${appId},`));
      if (proc >= 0) take(i, 'java', (near[proc + 1] ?? msg).trim() || msg.trim());
    } else if (tag === 'ActivityManager' && (msg === `ANR in ${appId}` || msg.startsWith(`ANR in ${appId} `) || msg.startsWith(`ANR in ${appId}:`))) {
      const reason = lines.slice(i + 1, i + 6).map((l) => (TAGGED.exec(l) ?? [])[2] ?? '').find((x) => /^Reason:/.test(x));
      take(i, 'anr', (reason ?? msg).trim());
    } else if (tag === 'DEBUG' && msg.includes(`>>> ${appId} <<<`)) {
      const sig = lines.slice(i + 1, i + 4).map((l) => (TAGGED.exec(l) ?? [])[2] ?? '').find((x) => /^signal \d+/.test(x));
      take(i, 'native', (sig ?? msg).trim());
    }
  }
  return out;
}
