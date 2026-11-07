// base.fixture.ts — what every tier gets, worker-scoped where it is expensive:
//   pool      the pool sessions this worker owns (disjoint per parallelIndex, signed in by setup)
//   actor     a named session: actor('default'), actor('owner') — read-only to the test
//   api       ApiClient as TEST_USER (worker-scoped context, so one per worker, not per test)
//   as        as(session) → an ApiClient on its own context for that actor (pool or named)
//   anonymous ApiClient with no session at all — the 401 axis
//   cleanup   the per-test teardown ledger; runs after the test in reverse, whatever happened
//   db        read-only DB client (worker-scoped pool; `db.configured` is false without DB_CONNECTION)
//   serverWatch / allowedServerErrors   (auto) fail a test on server log errors — server-watch.fixture.ts
//   httpLog   (auto) on a failed test, attach the HTTP exchanges it made as `http-log` — http/http-log.ts
// Domain fixtures (services, factories, page objects) extend this in fixtures/index.ts.
import { expect } from '@playwright/test';
import { test as base } from './server-watch.fixture';
import { ApiClient } from '../http/api.client';
import { DbClient } from '../db/db.client';
import { mark, since } from '../http/http-log';
import { Cleanup } from '../data/cleanup';
import { loadSession, poolKey, poolSlice } from '../auth/session';
import type { Session } from '../auth/session';
import { env, namedActors } from '../config/env';

export interface WorkerFixtures {
  pool: Session[];
  actor: (name?: string) => Session;
  api: ApiClient;
  clientFor: (s: Session | undefined) => Promise<ApiClient>;
  db: DbClient;
}

export interface TestFixtures {
  as: (s: Session | string) => Promise<ApiClient>;
  anonymous: ApiClient;
  cleanup: Cleanup;
  httpLog: void;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  pool: [
    async ({}, use, workerInfo) => {
      const keys = env.pool.size ? poolSlice(workerInfo.parallelIndex).map(poolKey) : [];
      await use(keys.map(loadSession));
    },
    { scope: 'worker', title: 'account pool' },
  ],
  actor: [
    async ({}, use) => {
      await use((name = 'default') => {
        if (!namedActors().includes(name)) throw new Error(`no actor "${name}" — add TEST_USER${name === 'default' ? '' : `_${name.toUpperCase()}`} to <qa-root>/.env.${env.qaEnv}`);
        return loadSession(name);
      });
    },
    { scope: 'worker', title: 'named actors' },
  ],
  clientFor: [
    async ({}, use) => {
      const open = new Map<string, ApiClient>();
      await use(async (s) => {
        const key = s?.key ?? '(anonymous)';
        const hit = open.get(key);
        if (hit) return hit;
        const c = await ApiClient.open(s);
        open.set(key, c);
        return c;
      });
      for (const c of open.values()) await c.dispose();
    },
    { scope: 'worker', box: true },
  ],
  api: [
    async ({ clientFor, actor }, use) => {
      await use(await clientFor(env.auth.mode === 'none' ? undefined : actor('default')));
    },
    { scope: 'worker', title: 'api as TEST_USER' },
  ],
  db: [
    async ({}, use) => {
      const db = new DbClient(env.dbConnection);
      await use(db);
      await db.close();
    },
    { scope: 'worker', title: 'db (read-only)' },
  ],
  as: async ({ clientFor, actor }, use) => {
    await use((s) => clientFor(typeof s === 'string' ? actor(s) : s));
  },
  anonymous: async ({ clientFor }, use) => {
    await use(await clientFor(undefined));
  },
  httpLog: [
    async ({}, use, testInfo) => {
      const from = mark();
      await use();
      const exchanges = since(from);
      if (testInfo.status !== testInfo.expectedStatus && exchanges.length)
        await testInfo.attach('http-log', { body: JSON.stringify(exchanges, null, 2), contentType: 'application/json' });
    },
    { auto: true, title: 'http log' },
  ],
  cleanup: [
    async ({}, use, testInfo) => {
      const ledger = new Cleanup();
      await use(ledger);
      const failed = testInfo.status !== testInfo.expectedStatus;
      if (failed && env.keepOnFail) {
        testInfo.annotations.push({ type: 'kept', description: `${ledger.size} entities kept for debugging (QA_KEEP_ON_FAIL=1)` });
        return;
      }
      const problems = await ledger.run();
      if (problems.length) testInfo.annotations.push({ type: 'cleanup-failed', description: problems.join('; ') });
    },
    { title: 'cleanup' },
  ],
});

export { expect };
