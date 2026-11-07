// env.ts — the ONE place the platform reads process.env. Every value a runner needs is declared
// here, typed, and validated once (the `setup` project calls `assertEnv()` before any spec runs),
// so a missing value stops the run in the first second with the key name, never mid-suite.
// Keys and meanings are documented in <qa-root>/.env.example; names are a contract.

export type AuthMode = 'none' | 'session-csrf' | 'bearer-login' | 'basic' | 'header';
const AUTH_MODES: readonly AuthMode[] = ['none', 'session-csrf', 'bearer-login', 'basic', 'header'];

const raw = (k: string): string | undefined => {
  const v = process.env[k];
  return v === undefined || v.trim() === '' ? undefined : v.trim();
};
const int = (k: string, fallback: number): number => {
  const v = raw(k);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${k}=${v} is not a non-negative integer (<qa-root>/.env.<env>)`);
  return n;
};
const stripSlash = (u: string) => u.replace(/\/+$/, '');

export const env = {
  qaEnv: raw('QA_ENV') ?? 'uat',
  runId: raw('QA_RUN_ID') ?? 'local',
  ci: !!raw('CI'),
  baseURL: raw('BASE_URL'),
  apiBaseURL: raw('API_BASE_URL') ? stripSlash(raw('API_BASE_URL') as string) : undefined,
  testIdAttribute: raw('TEST_ID_ATTRIBUTE') ?? 'data-testid',
  openapiSpec: raw('OPENAPI_SPEC') ?? 'docs/openapi.yaml',
  dbConnection: raw('DB_CONNECTION'),
  keepOnFail: raw('QA_KEEP_ON_FAIL') === '1',
  auth: {
    mode: (raw('AUTH_MODE') ?? 'bearer-login') as AuthMode,
    /** sign-in path, relative to API_BASE_URL (session-csrf, bearer-login) */
    loginPath: raw('AUTH_LOGIN_PATH') ?? '/auth/login',
    /** JSON field names of the sign-in body */
    userField: raw('AUTH_USER_FIELD') ?? 'username',
    passwordField: raw('AUTH_PASSWORD_FIELD') ?? 'password',
    /** dot path of the bearer token in the sign-in response (bearer-login) */
    tokenPath: raw('AUTH_TOKEN_PATH') ?? 'access_token',
    /** dot path of the CSRF token in the sign-in response, and the header that carries it (session-csrf) */
    csrfPath: raw('AUTH_CSRF_PATH') ?? 'csrf_token',
    csrfHeader: raw('AUTH_CSRF_HEADER') ?? 'X-CSRF-Token',
    /** dot path of the signed-in account's id in the sign-in response (optional; factories use it to add members) */
    idPath: raw('AUTH_ID_PATH'),
    apiToken: raw('API_TOKEN'),
    /** parallel sign-ins in the setup project; 1 for an API with a tight sign-in rate limit */
    signInConcurrency: Math.max(1, int('AUTH_SIGN_IN_CONCURRENCY', 8)),
  },
  trace: {
    /** send a W3C traceparent on every ApiClient call, so a failure names its server-side trace */
    propagate: (raw('QA_TRACEPARENT') ?? 'on') !== 'off',
  },
  pool: {
    /** account template with {n} or {n:3} (zero-padded), e.g. seed.user.{n:3}@example.test */
    user: raw('TEST_POOL_USER'),
    password: raw('TEST_POOL_PASSWORD'),
    size: int('TEST_POOL_SIZE', 0),
    perWorker: int('TEST_POOL_PER_WORKER', 4),
  },
} as const;

/** Credentials of a NAMED actor: `default` → TEST_USER/TEST_PASSWORD, `owner` → TEST_USER_OWNER/… */
export function namedCredentials(name: string): { username: string; password: string } | undefined {
  const suffix = name === 'default' ? '' : `_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  const username = raw(`TEST_USER${suffix}`);
  const password = raw(`TEST_PASSWORD${suffix}`);
  return username && password ? { username, password } : undefined;
}

/** Every named actor the env declares (TEST_USER → default, TEST_USER_<NAME> → name). */
export function namedActors(): string[] {
  return Object.keys(process.env)
    .filter((k) => /^TEST_USER(_[A-Z0-9_]+)?$/.test(k) && raw(k))
    .map((k) => (k === 'TEST_USER' ? 'default' : k.slice('TEST_USER_'.length).toLowerCase()))
    .filter((n) => namedCredentials(n));
}

/** Fill a pool template: `user.{n:3}@x` with n=7 → `user.007@x`. */
export function fillTemplate(template: string, n: number): string {
  return template.replace(/\{n(?::(\d+))?\}/g, (_m, pad: string | undefined) => String(n).padStart(Number(pad ?? 0), '0'));
}

/** Validate what every HTTP/browser tier needs. Returns the problems; the setup project fails on any. */
export function envProblems(opts: { workers: number }): string[] {
  const p: string[] = [];
  if (!env.baseURL) p.push('BASE_URL is empty');
  if (!env.apiBaseURL) p.push('API_BASE_URL is empty');
  if (!AUTH_MODES.includes(env.auth.mode)) p.push(`AUTH_MODE=${env.auth.mode} is not one of ${AUTH_MODES.join(' | ')}`);
  if (env.auth.mode === 'header' && !env.auth.apiToken) p.push('AUTH_MODE=header needs API_TOKEN');
  if (['session-csrf', 'bearer-login', 'basic'].includes(env.auth.mode) && !namedCredentials('default'))
    p.push(`AUTH_MODE=${env.auth.mode} needs TEST_USER / TEST_PASSWORD`);
  if (env.pool.user || env.pool.password || env.pool.size) {
    if (!env.pool.user || !env.pool.password || !env.pool.size) p.push('TEST_POOL_USER, TEST_POOL_PASSWORD and TEST_POOL_SIZE are set together or not at all');
    else if (opts.workers * env.pool.perWorker > env.pool.size)
      p.push(`the account pool is too small: ${opts.workers} workers × TEST_POOL_PER_WORKER=${env.pool.perWorker} > TEST_POOL_SIZE=${env.pool.size} — lower --workers or seed more accounts`);
  }
  return p;
}

// ── Bug hunting: fuzzing, model runs, server-log watch (scripts/shared/{fuzz,model}, fixtures/server-watch) ──
/** Default QA_SERVER_LOG_FAIL: the lines that mean the server broke even when the response looked fine. */
export const DEFAULT_SERVER_LOG_FAIL = 'panic|fatal|level=ERROR|"level":"error"|Traceback|Unhandled';

export const bugHunt = {
  /** fuzz PRNG seed (printed on every failure for replay); `random` draws a new one; unset = 1 */
  fuzzSeed: raw('QA_FUZZ_SEED'),
  /** max inputs per operation per actor */
  fuzzMax: int('QA_FUZZ_MAX', 60),
  /** model-run PRNG seed; `random` draws a new one; unset = 1 */
  modelSeed: raw('QA_MODEL_SEED'),
  /** random sequences per model test, and the steps in each */
  modelRuns: int('QA_MODEL_RUNS', 5),
  modelSteps: int('QA_MODEL_STEPS', 15),
  /** a server log file to watch during each test */
  serverLog: raw('QA_SERVER_LOG'),
  /** or a command that prints the server's log lines since `{since}` (ISO time), e.g. docker logs --since {since} api */
  serverLogCmd: raw('QA_SERVER_LOG_CMD'),
  /** regex (case-insensitive) of the lines that fail a test */
  serverLogFail: raw('QA_SERVER_LOG_FAIL') ?? DEFAULT_SERVER_LOG_FAIL,
  /** ms to wait after a test before reading the log, so the server's last lines are flushed */
  serverLogGraceMs: int('QA_SERVER_LOG_GRACE_MS', 100),
} as const;

/** A PRNG seed from an env value: a number, `random` (a fresh one), or the default 1. */
export function seedFrom(value: string | undefined): number {
  if (value === 'random') return Math.floor(Math.random() * 2 ** 31); // the one random draw; every failure prints it for replay
  const n = Number(value ?? 1);
  if (!Number.isInteger(n)) throw new Error(`seed ${value} is not an integer or \`random\``);
  return n;
}

export function requireApiBaseURL(): string {
  if (!env.apiBaseURL) throw new Error('API_BASE_URL is empty — fill <qa-root>/.env.<env> (see <qa-root>/.env.example)');
  return env.apiBaseURL;
}
