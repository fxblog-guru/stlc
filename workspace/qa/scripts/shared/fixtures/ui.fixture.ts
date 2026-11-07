// ui.fixture.ts — browser tiers (e2e, accessibility). Adds to base.fixture:
//   pageAs        pageAs(session) → a Page in its OWN context signed in as that actor (storageState
//                 from the setup project — no UI login). Use it for every role-specific journey and
//                 for two actors in one test (Owner grants, Member sees).
//   page          (override) the default page, plus a guard: the test fails when the page threw an
//                 uncaught error or logged console.error that the case did not expect — the bugs a
//                 user never sees but a support ticket does. An override, not an auto fixture, so
//                 HTTP-tier tests never launch a browser. Chromium's "Failed to load resource"
//                 lines are NOT counted: an HTTP status is a network fact (a refused 422 is often
//                 the very thing a negative case provokes) and belongs to API-tier assertions.
//                 They are still EVIDENCE: on a failed test the ≥400 responses and failed requests
//                 the page saw are attached as `network`, so a locator timeout caused by a 500
//                 reads as the backend failure it is (qa:triage leans FUNCTIONAL on it).
// The default `page` fixture is signed in as TEST_USER by the browser projects' storageState.
// Page objects are injected by the domain fixtures in fixtures/index.ts, never `new`-ed in a spec.
import type { Page } from '@playwright/test';
import { test as base, expect } from './base.fixture';
import { storageStateFile } from '../auth/session';
import type { Session } from '../auth/session';

export interface UiFixtures {
  pageAs: (s: Session | string) => Promise<Page>;
  /** messages the case expects (substring match) — set with test.use({ allowedConsoleErrors: [...] }) */
  allowedConsoleErrors: string[];
}

export const test = base.extend<UiFixtures>({
  pageAs: async ({ browser, actor }, use) => {
    const opened: { close(): Promise<void> }[] = [];
    await use(async (s) => {
      const session = typeof s === 'string' ? actor(s) : s;
      const ctx = await browser.newContext({ storageState: storageStateFile(session.key) });
      opened.push(ctx);
      return ctx.newPage();
    });
    for (const c of opened) await c.close();
  },
  allowedConsoleErrors: [[], { option: true }],
  page: async ({ page, allowedConsoleErrors }, use, testInfo) => {
    const problems: string[] = [];
    const network: { at: string; method: string; url: string; status: number | null; failure?: string }[] = [];
    page.on('response', (r) => {
      if (r.status() >= 400) network.push({ at: new Date().toISOString(), method: r.request().method(), url: r.url(), status: r.status() });
    });
    page.on('requestfailed', (r) => network.push({ at: new Date().toISOString(), method: r.method(), url: r.url(), status: null, failure: r.failure()?.errorText ?? 'failed' }));
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'error' && !text.startsWith('Failed to load resource') && !allowedConsoleErrors.some((a) => text.includes(a)))
        problems.push(`console.error: ${text}`);
    });
    await use(page);
    if (testInfo.status !== testInfo.expectedStatus && network.length)
      await testInfo.attach('network', { body: JSON.stringify(network.slice(-50), null, 2), contentType: 'application/json' });
    if (testInfo.status === testInfo.expectedStatus)
      expect(problems, 'the page raised errors the case does not expect (allow them with test.use({ allowedConsoleErrors }))').toEqual([]);
  },
});

export { expect };
