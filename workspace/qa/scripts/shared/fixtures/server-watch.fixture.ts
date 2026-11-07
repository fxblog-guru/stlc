// server-watch.fixture.ts — watch the SERVER while each test runs. A response can look fine while
// the server logs a panic, a swallowed exception or a failed background write; a client-side
// assertion never sees it. This fixture reads the server's log for the window of each test and
// fails the test on lines that mean the server broke, attaching them as evidence.
//
//   QA_SERVER_LOG=<file>          a log file the app under test appends to (local run, shared volume)
//   QA_SERVER_LOG_CMD=<command>   or a command that prints the log, e.g.
//                                 `docker logs --since {since} api` · `kubectl logs deploy/api --since-time={since}`
//                                 `{since}` = the test's start time (ISO); without it the command's
//                                 output is diffed against what it printed when the test started
//   QA_SERVER_LOG_FAIL=<regex>    the lines that fail a test (case-insensitive); default
//                                 panic|fatal|level=ERROR|"level":"error"|Traceback|Unhandled
//   neither set                   a no-op, with one info line per run
//
// Per case: test.use({ allowedServerErrors: ['substring', /regex/] }) for errors the case provokes on
// purpose. Triage (executing-tests): a test that failed only on server lines is FUNCTIONAL, with the
// attached `server-log` excerpt as the evidence.
// Parallel runs share one server, so a line is reported in every test whose window it falls in;
// the excerpt names the time — re-run the case alone (`--workers=1`) to pin it to one test.
//
// Wired into base.fixture.ts, so every tier (HTTP and browser) gets it with no change to a spec.
import { execSync } from 'node:child_process';
import { existsSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { test as base, expect } from '@playwright/test';
import { bugHunt } from '../config/env';

interface Mark {
  at: string;
  offset: number;
  seen: number;
}

export interface ServerWatch {
  /** true when QA_SERVER_LOG or QA_SERVER_LOG_CMD is set */
  enabled: boolean;
  /** where the watch reads from (for evidence lines) */
  source: string;
  mark(): Mark;
  /** the log lines written since `mark` */
  linesSince(mark: Mark): string[];
}

const split = (text: string) => text.split(/\r?\n/).filter((l) => l.trim() !== '');

function fileWatch(path: string): ServerWatch {
  const size = () => (existsSync(path) ? statSync(path).size : 0);
  return {
    enabled: true,
    source: `file ${path}`,
    mark: () => ({ at: new Date().toISOString(), offset: size(), seen: 0 }),
    linesSince: (m) => {
      const end = size();
      if (end <= m.offset) return [];
      const buf = Buffer.alloc(end - m.offset);
      const fd = openSync(path, 'r');
      try { readSync(fd, buf, 0, buf.length, m.offset); } finally { closeSync(fd); }
      return split(buf.toString('utf8'));
    },
  };
}

function commandWatch(cmd: string): ServerWatch {
  const run = (since: string) => {
    try {
      return split(execSync(cmd.replaceAll('{since}', since), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }));
    } catch (e) {
      return [`serverWatch: QA_SERVER_LOG_CMD failed — ${String((e as Error).message).split('\n')[0]}`];
    }
  };
  const windowed = cmd.includes('{since}');
  return {
    enabled: true,
    source: `command ${cmd}`,
    mark: () => {
      const at = new Date().toISOString();
      return { at, offset: 0, seen: windowed ? 0 : run(at).length };
    },
    linesSince: (m) => run(m.at).slice(m.seen),
  };
}

const off: ServerWatch = { enabled: false, source: 'none', mark: () => ({ at: '', offset: 0, seen: 0 }), linesSince: () => [] };

export const test = base.extend<{ allowedServerErrors: (string | RegExp)[]; serverLogGuard: void }, { serverWatch: ServerWatch }>({
  serverWatch: [
    async ({}, use, workerInfo) => {
      const watch = bugHunt.serverLog ? fileWatch(bugHunt.serverLog) : bugHunt.serverLogCmd ? commandWatch(bugHunt.serverLogCmd) : off;
      if (!watch.enabled && workerInfo.parallelIndex === 0)
        process.stdout.write('serverWatch: off — set QA_SERVER_LOG (a file) or QA_SERVER_LOG_CMD (a command) to fail tests on server-side errors\n');
      await use(watch);
    },
    { scope: 'worker', auto: true, title: 'server log watch' },
  ],
  allowedServerErrors: [[], { option: true }],
  serverLogGuard: [
    async ({ serverWatch, allowedServerErrors }, use, testInfo) => {
      if (!serverWatch.enabled) return use();
      const mark = serverWatch.mark();
      await use();
      await new Promise((r) => setTimeout(r, bugHunt.serverLogGraceMs)); // let the server flush its last lines
      const fail = new RegExp(bugHunt.serverLogFail, 'i');
      const allowed = (l: string) => allowedServerErrors.some((a) => (typeof a === 'string' ? l.includes(a) : a.test(l)));
      const matched = serverWatch.linesSince(mark).filter((l) => fail.test(l) && !allowed(l));
      if (!matched.length) return;
      await testInfo.attach('server-log', {
        body: [`source: ${serverWatch.source}`, `window: ${mark.at} → ${new Date().toISOString()}`, `fail pattern: ${bugHunt.serverLogFail}`, '', ...matched].join('\n'),
        contentType: 'text/plain',
      });
      if (testInfo.status === testInfo.expectedStatus)
        expect(matched, `the server logged errors during this test (attached: server-log) — allow expected ones with test.use({ allowedServerErrors })`).toEqual([]);
    },
    { auto: true, title: 'server log guard', box: true },
  ],
});
