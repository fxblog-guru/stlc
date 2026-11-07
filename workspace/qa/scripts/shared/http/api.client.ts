// ApiClient — the ONLY place HTTP requests are issued in the api/integration/security tiers.
// Services (services/<module>.service.ts) call it; specs call services. Every response is
// normalized to { status, headers, body, text } so assertions read `res.status` / `res.body.x`.
//
// One client = one actor on its OWN request context, so two actors never share a cookie jar
// (the bug a single context with "switch role" has under cookie sessions). The fixtures create
// clients (`api`, `as(...)`, `anonymous`) and dispose them; specs never construct one.
// Auth comes from the Session (shared/auth/session.ts): the cookie jar rides in the context, the
// CSRF token is added to every non-GET, an Authorization header to every request.
import { request } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { env, requireApiBaseURL } from '../config/env';
import { TIMEOUTS } from '../constants/timeouts';
import type { Session } from '../auth/session';
import { correlation, maskBody, maskHeaders, newTraceparent, record } from './http-log';

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  /** parsed JSON body when the response is JSON (incl. application/problem+json), else undefined */
  body: T;
  text: string;
  url: string;
}

export interface RequestOptions {
  data?: unknown;
  params?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  /** multipart upload: field name → file */
  multipart?: Record<string, { name: string; mimeType: string; buffer: Buffer }>;
  timeout?: number;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
const SAFE: ReadonlySet<Method> = new Set(['GET', 'HEAD', 'OPTIONS']);

interface Auth {
  csrf?: string | null; // null = deliberately omitted (the CSRF negative axis)
  authorization?: string | null;
}

export class ApiClient {
  private constructor(
    private readonly ctx: APIRequestContext,
    private readonly owns: boolean,
    readonly session: Session | undefined,
    private readonly auth: Auth,
    private readonly extraHeaders: Record<string, string> = {},
  ) {}

  /** A client acting as `session` (undefined = anonymous), on a fresh context. Fixtures call this. */
  static async open(session: Session | undefined): Promise<ApiClient> {
    const ctx = await request.newContext({ storageState: session?.state, extraHTTPHeaders: {} });
    return new ApiClient(ctx, true, session, { csrf: session?.csrf, authorization: session?.authorization });
  }

  /** Release the context. Only the client that opened it disposes it. */
  async dispose(): Promise<void> {
    if (this.owns) await this.ctx.dispose();
  }

  /** Same actor, no CSRF header — the 403 axis of every state-changing endpoint (session-csrf). */
  withoutCsrf(): ApiClient {
    return new ApiClient(this.ctx, false, this.session, { ...this.auth, csrf: null }, this.extraHeaders);
  }

  /** Same actor, a forged CSRF token. */
  withCsrf(token: string): ApiClient {
    return new ApiClient(this.ctx, false, this.session, { ...this.auth, csrf: token }, this.extraHeaders);
  }

  /** Same actor, an explicit bearer token (expired / tampered / revoked token cases). */
  withToken(token: string): ApiClient {
    return new ApiClient(this.ctx, false, this.session, { ...this.auth, authorization: `Bearer ${token}` }, this.extraHeaders);
  }

  /** Same client plus default headers (tenant id, correlation id, Idempotency-Key…). */
  withHeaders(headers: Record<string, string>): ApiClient {
    return new ApiClient(this.ctx, false, this.session, this.auth, { ...this.extraHeaders, ...headers });
  }

  get<T = unknown>(path: string, o?: RequestOptions) { return this.send<T>('GET', path, o); }
  post<T = unknown>(path: string, o?: RequestOptions) { return this.send<T>('POST', path, o); }
  put<T = unknown>(path: string, o?: RequestOptions) { return this.send<T>('PUT', path, o); }
  patch<T = unknown>(path: string, o?: RequestOptions) { return this.send<T>('PATCH', path, o); }
  delete<T = unknown>(path: string, o?: RequestOptions) { return this.send<T>('DELETE', path, o); }
  head<T = unknown>(path: string, o?: RequestOptions) { return this.send<T>('HEAD', path, o); }
  /** Any method, by name — for generic walkers (the OpenAPI fuzzer); services use the verbs above. */
  request<T = unknown>(method: string, path: string, o?: RequestOptions) { return this.send<T>(method.toUpperCase() as Method, path, o); }

  /** Absolute URL for a path — for evidence/log lines only; never build paths from strings in specs. */
  urlFor(path: string): string {
    return /^https?:\/\//.test(path) ? path : `${requireApiBaseURL()}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  private async send<T>(method: Method, path: string, o: RequestOptions = {}): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { Accept: 'application/json', ...this.extraHeaders, ...(o.headers ?? {}) };
    if (this.auth.authorization) headers.Authorization = this.auth.authorization;
    if (this.auth.csrf && !SAFE.has(method)) headers[env.auth.csrfHeader] = this.auth.csrf;
    // A traceparent of our own, so a failure names the server-side trace (one the caller set wins).
    if (env.trace.propagate && !Object.keys(headers).some((k) => k.toLowerCase() === 'traceparent')) headers.traceparent = newTraceparent().header;
    const started = Date.now();
    const res = await this.ctx.fetch(this.urlFor(path), {
      method,
      headers,
      data: o.multipart ? undefined : o.data,
      multipart: o.multipart,
      params: o.params,
      timeout: o.timeout ?? TIMEOUTS.API_RESPONSE,
      failOnStatusCode: false, // status codes are asserted by the spec, never by the client
      maxRedirects: 0,
    });
    const text = await res.text();
    let body: unknown = undefined;
    const ct = res.headers()['content-type'] ?? '';
    if (text && /json/i.test(ct)) {
      try { body = JSON.parse(text); } catch { body = undefined; }
    }
    record({
      at: new Date(started).toISOString(), method, url: res.url(), status: res.status(), ms: Date.now() - started,
      request: { headers: maskHeaders(headers, [env.auth.csrfHeader]), body: maskBody(o.multipart ? `‹multipart: ${Object.keys(o.multipart).join(', ')}›` : o.data) },
      response: { headers: maskHeaders(res.headers()), body: maskBody(text) },
      ids: correlation(headers, res.headers()),
    });
    return { status: res.status(), headers: res.headers(), body: body as T, text, url: res.url() };
  }
}
