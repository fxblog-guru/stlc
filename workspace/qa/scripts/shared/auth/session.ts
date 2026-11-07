// session.ts — who a request or a browser acts as. A Session is one signed-in account: its
// cookie jar (Playwright storageState), plus whatever the API wants on top of it — a CSRF token
// (AUTH_MODE=session-csrf) or an Authorization header (bearer-login · basic · header).
//
// Two kinds of actor, on purpose:
//   named   — TEST_USER (= `default`) and TEST_USER_<NAME> (`owner`, `admin`, …): global
//             privileges. Shared by every worker, so specs only READ through them or create data
//             they own; they never change the account itself (password, sign-out-everywhere).
//   pool    — TEST_POOL_USER template × TEST_POOL_SIZE: plain accounts, a disjoint slice per
//             worker (parallelIndex). Per-project roles are DATA a test grants to a pool account
//             through a factory, never a shared "viewer" login two workers fight over.
//
// The setup project signs every actor in ONCE per run (auth.setup) and writes .auth/<env>/;
// workers only read those files — one sign-in per account per run, whatever the worker count.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { request } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { env, fillTemplate, namedActors, namedCredentials, requireApiBaseURL } from '../config/env';

export type StorageState = Awaited<ReturnType<APIRequestContext['storageState']>>;

export interface Session {
  /** `default`, a named actor (`owner`), or `pool-<n>` */
  key: string;
  username: string;
  /** the account id when AUTH_ID_PATH resolves it (factories use it to grant roles) */
  id?: string;
  /** session-csrf: the token sent in AUTH_CSRF_HEADER on every non-GET */
  csrf?: string;
  /** bearer-login · basic · header: the Authorization header value */
  authorization?: string;
  /** cookie jar + origins, the shape browser.newContext({ storageState }) accepts */
  state: StorageState;
}

const AUTH_DIR = join('.auth', env.qaEnv);
const sessionFile = (key: string) => join(AUTH_DIR, `${key}.json`);
/** Plain Playwright storageState for `test.use({ storageState })` and the browser projects. */
export const storageStateFile = (key: string) => join(AUTH_DIR, `${key}.state.json`);

function readPath(obj: unknown, path: string | undefined): unknown {
  if (!path) return undefined;
  return path.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), obj);
}

/** Sign one account in over HTTP, on a throwaway context, and return its Session. */
const SIGN_IN_RETRIES = 8;

export async function signIn(key: string, creds: { username: string; password: string }): Promise<Session> {
  const mode = env.auth.mode;
  const empty: StorageState = { cookies: [], origins: [] };
  if (mode === 'none') return { key, username: creds.username, state: empty };
  if (mode === 'header') return { key, username: creds.username, authorization: `Bearer ${env.auth.apiToken}`, state: empty };
  if (mode === 'basic')
    return { key, username: creds.username, authorization: `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`, state: empty };

  const ctx = await request.newContext();
  try {
    const url = `${requireApiBaseURL()}${env.auth.loginPath.startsWith('/') ? '' : '/'}${env.auth.loginPath}`;
    const data = { [env.auth.userField]: creds.username, [env.auth.passwordField]: creds.password };
    let res = await ctx.post(url, { data, failOnStatusCode: false });
    // Sign-in is usually rate limited per source IP (a few per minute). Honour Retry-After rather
    // than fail the run: the setup project signs a whole pool in, once, before any test starts.
    for (let attempt = 1; res.status() === 429 && attempt <= SIGN_IN_RETRIES; attempt++) {
      const wait = Math.min(Number(res.headers()['retry-after'] ?? 10) || 10, 90);
      await new Promise((r) => setTimeout(r, wait * 1000));
      res = await ctx.post(url, { data, failOnStatusCode: false });
    }
    if (!res.ok()) throw new Error(`sign-in as ${creds.username} failed: HTTP ${res.status()} at ${env.auth.loginPath} — check the credentials, AUTH_LOGIN_PATH and AUTH_USER_FIELD in <qa-root>/.env.${env.qaEnv}`);
    const body: unknown = await res.json().catch(() => undefined); // unknown-ok: an unreadable body has no token/CSRF, and those reads below throw
    const id = readPath(body, env.auth.idPath);
    const session: Session = { key, username: creds.username, id: typeof id === 'string' ? id : undefined, state: await ctx.storageState() };
    if (mode === 'session-csrf') {
      const csrf = readPath(body, env.auth.csrfPath);
      if (typeof csrf !== 'string' || !csrf) throw new Error(`signed in as ${creds.username} but found no CSRF token at AUTH_CSRF_PATH="${env.auth.csrfPath}"`);
      if (!session.state.cookies.length) throw new Error(`signed in as ${creds.username} but the response set no cookie — AUTH_MODE=session-csrf needs a session cookie`);
      session.csrf = csrf;
    } else {
      const token = readPath(body, env.auth.tokenPath);
      if (typeof token !== 'string' || !token) throw new Error(`signed in as ${creds.username} but found no token at AUTH_TOKEN_PATH="${env.auth.tokenPath}"`);
      session.authorization = `Bearer ${token}`;
    }
    return session;
  } finally {
    await ctx.dispose();
  }
}

export function saveSession(s: Session): void {
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(sessionFile(s.key), JSON.stringify(s, null, 2));
  writeFileSync(storageStateFile(s.key), JSON.stringify(s.state, null, 2));
}

const cache = new Map<string, Session>();
/** Read a session the setup project wrote. Throws with the remedy when it is missing. */
export function loadSession(key: string): Session {
  const hit = cache.get(key);
  if (hit) return hit;
  const file = sessionFile(key);
  if (!existsSync(file))
    throw new Error(`no session "${key}" at ${file} — the setup project signs actors in; run through a project that depends on "setup" (UI mode: run setup first)`);
  const s = JSON.parse(readFileSync(file, 'utf8')) as Session;
  cache.set(key, s);
  return s;
}

/** Pool account numbers owned by the worker with this parallelIndex (1-based, disjoint). */
export function poolSlice(parallelIndex: number): number[] {
  const per = env.pool.perWorker;
  return Array.from({ length: per }, (_v, i) => parallelIndex * per + i + 1);
}
export const poolKey = (n: number) => `pool-${String(n).padStart(3, '0')}`;

/** Every actor the setup project signs in for a run with `workers` workers. */
export function actorsToSignIn(workers: number): { key: string; username: string; password: string }[] {
  const named = namedActors().map((name) => ({ key: name, ...(namedCredentials(name) as { username: string; password: string }) }));
  const pool: { key: string; username: string; password: string }[] = [];
  if (env.pool.user && env.pool.password && env.pool.size) {
    for (let n = 1; n <= Math.min(workers * env.pool.perWorker, env.pool.size); n++)
      pool.push({ key: poolKey(n), username: fillTemplate(env.pool.user, n), password: fillTemplate(env.pool.password, n) });
  }
  return [...named, ...pool];
}

export const authDir = () => dirname(sessionFile('x'));
