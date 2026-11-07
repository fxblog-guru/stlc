// pollUntil — the sanctioned way to wait for asynchronous work (202 jobs, outbox lag, eventual
// consistency). Replaces every sleep. Throws with the LAST observed value so the failure is
// diagnosable, never a bare timeout.
import { TIMEOUTS } from '../constants/timeouts';

export interface PollOptions<T> {
  /** ms between attempts (default TIMEOUTS.POLL_INTERVAL) */
  every?: number;
  /** total window in ms (default TIMEOUTS.POLL_MAX) */
  timeout?: number;
  /** predicate that ends the poll; default: any non-undefined value */
  until?: (value: T) => boolean;
  /** label used in the timeout error */
  label?: string;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function pollUntil<T>(fn: () => Promise<T>, opts: PollOptions<T> = {}): Promise<T> {
  const every = opts.every ?? TIMEOUTS.POLL_INTERVAL;
  const timeout = opts.timeout ?? TIMEOUTS.POLL_MAX;
  const until = opts.until ?? ((v: T) => v !== undefined);
  const started = Date.now();
  let last: T | undefined;
  let lastError: unknown;
  let attempts = 0;
  while (Date.now() - started < timeout) {
    attempts += 1;
    try {
      last = await fn();
      lastError = undefined;
      if (until(last)) return last;
    } catch (e) {
      lastError = e; // transient errors (connection reset, 5xx during deploy) are retried until the window closes
    }
    await sleep(every);
  }
  const tail = lastError ? `last error: ${String(lastError)}` : `last value: ${safeStringify(last)}`;
  throw new Error(`pollUntil${opts.label ? ` (${opts.label})` : ''}: condition not met within ${timeout} ms after ${attempts} attempt(s) — ${tail}`);
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v)?.slice(0, 500) ?? String(v); } catch { return String(v); }
}
