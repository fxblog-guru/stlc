// unique.ts — names that never collide across tests, workers, shards, re-runs or machines, and
// that the sweeper can find afterwards. Shape: qa-<runId>-w<parallelIndex>-<counter>-<label>.
//   runId          QA_RUN_ID (executing-tests sets it; CI uses the pipeline id) — one per run
//   parallelIndex  stable per worker slot, so a restarted worker keeps its prefix
//   counter        per worker process
// Never Date.now() or Math.random(): both collide under sharding and neither can be swept.
import { createHash } from 'node:crypto';
import { env } from '../config/env';

let counter = 0;

/** The prefix every entity of this run carries — the sweeper deletes by it. */
export const runPrefix = () => `qa-${env.runId}`;

export function uniqueName(label: string, workerIndex = Number(process.env.TEST_WORKER_INDEX ?? 0)): string {
  counter += 1;
  return `${runPrefix()}-w${workerIndex}-${counter}-${label}`.slice(0, 80);
}

/** A unique e-mail on a domain the app accepts (pass the project's test domain). */
export const uniqueEmail = (domain: string, label = 'user') => `${uniqueName(label).toLowerCase()}@${domain}`;

/**
 * A unique run of `n` digits — for names a VISUAL baseline shows. Digits render at one width in UI
 * fonts (tabular figures), so `Project 48210937` and `Project 11094466` take the same space and a
 * table's column widths never move between runs; the name is masked in the screenshot anyway.
 */
export function uniqueDigits(label: string, n = 8): string {
  const hex = createHash('sha256').update(uniqueName(label)).digest('hex');
  return [...hex].map((c) => String(parseInt(c, 16) % 10)).join('').slice(0, n);
}
