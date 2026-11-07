// http-log.ts — the last HTTP exchanges this worker made, so a failed test carries the request and
// the response that broke it, not just "expected 201, received 500". ApiClient records every call;
// the `httpLog` auto fixture (base.fixture.ts) marks the start of each test and, ONLY when the test
// failed, attaches the exchanges made since then as `http-log` (JSON). `qa:triage` reads it.
//
// Secrets never reach the evidence: Authorization, Cookie, Set-Cookie and the CSRF header are
// masked, and so is any JSON field whose name looks like a secret. Bodies are cut at BODY_MAX.
// Playwright workers are processes and run one test at a time, so a module-level buffer is per test.
// Each exchange also keeps the ids that find it on the server side (`ids`): the request id the
// server echoed and the trace id of the traceparent ApiClient sent (QA_TRACEPARENT=off stops that).

export interface HttpExchange {
  at: string;
  method: string;
  url: string;
  status: number;
  ms: number;
  request: { headers: Record<string, string>; body?: string };
  response: { headers: Record<string, string>; body?: string };
  /** the ids that find this call in the server's logs and traces (`qa:triage` prints them) */
  ids?: Correlation;
}

export interface Correlation {
  requestId?: string;
  traceId?: string;
}

/**
 * A W3C traceparent for one outbound call. The server continues it (OpenTelemetry does by
 * default), so the test knows the trace id even when the server echoes nothing back.
 */
export function newTraceparent(): { header: string; traceId: string } {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const traceId = hex(32);
  return { header: `00-${traceId}-${hex(16)}-01`, traceId };
}

/** The request id the server echoed (X-Request-Id and kin) and the trace id the call carried. */
export function correlation(req: Record<string, string>, res: Record<string, string>): Correlation {
  const get = (h: Record<string, string>, ...names: string[]) => {
    for (const [k, v] of Object.entries(h)) if (names.includes(k.toLowerCase()) && v) return v;
    return undefined;
  };
  const tp = /^[0-9a-f]{2}-([0-9a-f]{32})-/.exec(get(res, 'traceparent') ?? get(req, 'traceparent') ?? '');
  const ids: Correlation = {};
  const requestId = get(res, 'x-request-id', 'x-correlation-id', 'request-id') ?? get(req, 'x-request-id', 'x-correlation-id');
  const traceId = tp?.[1] ?? get(res, 'x-trace-id', 'x-amzn-trace-id', 'x-cloud-trace-context');
  if (requestId) ids.requestId = requestId;
  if (traceId) ids.traceId = traceId;
  return ids;
}

const KEEP = 50;
const BODY_MAX = 2_000;
const SECRET_HEADER = /^(authorization|cookie|set-cookie|proxy-authorization|x-api-key|x-csrf-token|x-xsrf-token)$/i;
const SECRET_FIELD = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|credential|otp|pin$/i;
const MASK = '‹masked›';

const buffer: HttpExchange[] = [];
let seq = 0;

/** Headers with the secret ones masked; `extra` names more (the configured CSRF header). */
export function maskHeaders(h: Record<string, string>, extra: string[] = []): Record<string, string> {
  const more = new Set(extra.map((x) => x.toLowerCase()));
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, SECRET_HEADER.test(k) || more.has(k.toLowerCase()) ? MASK : v]));
}

/** A body as evidence text: JSON secrets masked, cut at BODY_MAX. */
export function maskBody(body: unknown): string | undefined {
  if (body === undefined || body === null || body === '') return undefined;
  let text: string;
  if (typeof body === 'string') {
    try { text = JSON.stringify(maskJson(JSON.parse(body))); } catch { text = body; }
  } else if (Buffer.isBuffer(body)) {
    text = `‹${body.length} bytes›`;
  } else {
    text = JSON.stringify(maskJson(body));
  }
  return text.length > BODY_MAX ? `${text.slice(0, BODY_MAX)}… ‹${text.length - BODY_MAX} more chars›` : text;
}

function maskJson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(maskJson);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET_FIELD.test(k) ? MASK : maskJson(x)]));
  return v;
}

export function record(x: HttpExchange): void {
  buffer.push(x);
  seq += 1;
  if (buffer.length > KEEP) buffer.shift();
}

/** A position in the log; `since(mark)` returns what was recorded after it. */
export const mark = (): number => seq;

export function since(m: number): HttpExchange[] {
  const n = Math.min(seq - m, buffer.length);
  return n > 0 ? buffer.slice(-n) : [];
}
