// auth.setup.ts — the `setup` project every HTTP and browser project depends on. It runs once per
// run, before any spec: validates the env (a missing key fails here, in the first second), then
// signs every actor in — the named ones (TEST_USER, TEST_USER_<NAME>) and the pool slice each
// worker will own — and writes .auth/<env>/<actor>.json (+ .state.json for browsers).
// Sign-in goes over the API, never through the UI: one HTTP call per account, in parallel.
import { test as setup, expect } from '@playwright/test';
import { env, envProblems } from '../shared/config/env';
import { actorsToSignIn, saveSession, signIn } from '../shared/auth/session';

setup('validate env and sign every actor in', async ({}, testInfo) => {
  setup.setTimeout(15 * 60_000); // a rate-limited sign-in may wait out several Retry-After windows
  const workers = testInfo.config.workers;
  const problems = envProblems({ workers });
  expect(problems, `<qa-root>/.env.${env.qaEnv} is not ready:\n- ${problems.join('\n- ')}`).toEqual([]);

  const actors = actorsToSignIn(workers);
  // AUTH_SIGN_IN_CONCURRENCY bounds parallel sign-ins (default 8); set 1 for an API whose sign-in
  // limit is a handful per minute — signIn() then waits out each 429 by its Retry-After.
  const sessions = [];
  for (let i = 0; i < actors.length; i += env.auth.signInConcurrency)
    sessions.push(...(await Promise.all(actors.slice(i, i + env.auth.signInConcurrency).map((a) => signIn(a.key, a)))));
  for (const s of sessions) saveSession(s);
  testInfo.annotations.push({ type: 'actors', description: `${sessions.length} signed in (${env.auth.mode}) for ${workers} worker(s)` });
  expect(sessions.length).toBeGreaterThan(0);
});
