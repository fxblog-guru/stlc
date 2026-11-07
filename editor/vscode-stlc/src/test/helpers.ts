/**
 * Shared test helpers: copy a fixture project to a temp folder and pin every file's mtime before
 * the index time, so "newer than the index" is decided by the test, not by when git checked it out.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** The bundle's own fixture (tests/fixture/qa) — the same one build-state.test.mjs pins. */
export const BUNDLE_FIXTURE = path.resolve(__dirname, '../../../../tests/fixture');
/** The richer fixture of this package: three features, mixed platforms, runs, run plans. */
export const RICH_FIXTURE = path.resolve(__dirname, '../../src/test/fixtures/rich');

export const OLD = new Date('2026-10-01T00:00:00Z');

export function copyProject(src: string): string {
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), 'stlc-test-'));
  fs.cpSync(src, dst, { recursive: true });
  pinTimes(dst, OLD);
  return dst;
}

export function pinTimes(dir: string, at: Date): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) pinTimes(p, at);
    fs.utimesSync(p, at, at);
  }
}

export function touch(file: string, at: Date): void {
  fs.utimesSync(file, at, at);
  fs.utimesSync(path.dirname(file), at, at);
}

export function write(root: string, rel: string, text: string, at?: Date): string {
  const p = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  if (at) touch(p, at);
  return p;
}
