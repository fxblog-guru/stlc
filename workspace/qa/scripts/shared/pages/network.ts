// network.ts — count what the UI actually sent. A double-click, a retry loop or a re-render can fire
// the same request twice while the screen still looks right; the claim "the UI sent exactly one
// create" needs the requests themselves. Listening survives reloads (it is on the page, not the DOM).
//   const creates = trackRequests(page, 'POST', /\/api\/orders$/);
//   … drive the UI …
//   expect(await creates.settled()).toBe(1);   // waits for every matched request to finish first
import type { Page, Request } from '@playwright/test';

export interface RequestTracker {
  /** wait until every matched request has finished (or failed), then return how many were sent */
  settled(): Promise<number>;
  /** the matched requests so far, `METHOD url` */
  list(): string[];
}

export function trackRequests(page: Page, method: string, url: RegExp): RequestTracker {
  const seen: Request[] = [];
  page.on('request', (r) => {
    if (r.method() === method.toUpperCase() && url.test(r.url())) seen.push(r);
  });
  return {
    settled: async () => {
      await Promise.all(seen.map((r) => r.response().catch(() => null))); // unknown-ok: waits for settling only; no outcome is read from it
      return seen.length;
    },
    list: () => seen.map((r) => `${r.method()} ${r.url()}`),
  };
}
