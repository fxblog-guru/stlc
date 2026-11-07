// BasePage — every page object extends this. Locators live on page objects (registry-grounded:
// <qa-root>/docs/element-registry.md → data-testid → role/label); specs contain zero raw locators when a
// page object covers the screen. `goto()` always ends in an arrival assertion — a wait is not a
// verification (generating-e2e-script §4).
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { TIMEOUTS } from '../constants/timeouts';

export abstract class BasePage {
  /** route relative to BASE_URL, e.g. '/orders' */
  abstract readonly path: string;
  /** regex the URL must match after navigation, e.g. /\/orders(\?|$)/ */
  abstract readonly urlPattern: RegExp;

  /** public so a `ui` spec can resize and screenshot the screen it drives (generating-ui-script) */
  constructor(readonly page: Page) {}

  async goto(query: Record<string, string> = {}): Promise<void> {
    const qs = new URLSearchParams(query).toString();
    await this.page.goto(qs ? `${this.path}?${qs}` : this.path);
    await this.expectLoaded();
  }

  /** Arrival assertion: URL + the screen's anchor element. Override `anchor()` per page. */
  async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(this.urlPattern, { timeout: TIMEOUTS.NAVIGATION });
    await expect(this.anchor()).toBeVisible({ timeout: TIMEOUTS.FIELD_VISIBLE });
  }

  /** The one element that proves the screen rendered (heading, table, form). */
  protected abstract anchor(): Locator;

  protected byTestId(id: string): Locator {
    return this.page.getByTestId(id);
  }

  protected byRole(role: Parameters<Page['getByRole']>[0], name: string | RegExp): Locator {
    return this.page.getByRole(role, { name });
  }

  protected byLabel(label: string | RegExp): Locator {
    return this.page.getByLabel(label);
  }
}
