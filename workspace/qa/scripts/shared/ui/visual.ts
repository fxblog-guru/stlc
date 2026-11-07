// visual.ts — one way to take a visual baseline in the `ui` tier, so every screenshot in the suite
// is stable for the same reasons (generating-ui-script):
//   - animations disabled, caret hidden, CSS-pixel scale (also set in playwright.config.ts)
//   - dynamic regions MASKED, never cropped away: dates, ids, avatars, counters the data decides
//   - fonts loaded before the shot (document.fonts.ready), so a late webfont is never a diff
//   - the threshold from PROJECT-PROFILE §UI testing (UI_MAX_DIFF_PIXEL_RATIO, default 0.01)
//   - the skin set explicitly from the case's `- skin:` line: a headless browser follows the host's
//     dark setting, and a baseline taken in the wrong skin passes forever against itself
//   - a prototype or environment banner hidden (UI_HIDE_SELECTORS) through `stylePath`, never part
//     of the picture and never blocked by the page's CSP
// Baselines land under __screenshots__/<os>/<project>/<spec>/ (snapshotPathTemplate): the CI
// image's `linux` set is the truth; a local Windows run writes `win32` beside it, never over it.
//
//   await expectVisual(page, 'projects-list-populated-1280', { mask: [projectsPage.dates] });
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface VisualOptions {
  /** regions whose content legitimately changes per run — each with a reason in the case's ## Visual baseline */
  mask?: Locator[];
  /** the whole scrollable page (default) or only the viewport */
  fullPage?: boolean;
  /** the case's `- skin:` line; omitted, the project's colorScheme (or UI_SKIN) decides */
  skin?: 'light' | 'dark';
  /** override the profile threshold for this shot only — needs a reason in the case */
  maxDiffPixelRatio?: number;
}

/** Stable defaults every visual assertion shares. */
export function visualDefaults(): { animations: 'disabled'; caret: 'hide'; scale: 'css'; maxDiffPixelRatio: number } {
  return { animations: 'disabled', caret: 'hide', scale: 'css', maxDiffPixelRatio: Number(process.env.UI_MAX_DIFF_PIXEL_RATIO ?? 0.01) };
}

/**
 * The skin of a shot: the case's `- skin:` line passed as `opts.skin`, else UI_SKIN, else none. With
 * none, the project's own `colorScheme` (test.use) stays as it is, so existing baselines do not move.
 */
export function skin(opts: { skin?: 'light' | 'dark' } = {}): 'light' | 'dark' | null {
  const s = opts.skin ?? process.env.UI_SKIN;
  return s === 'dark' || s === 'light' ? s : null;
}

/** Elements that are never part of a baseline: a prototype banner, an env ribbon. */
export function hiddenSelectors(): string[] {
  return (process.env.UI_HIDE_SELECTORS ?? '[data-prototype-banner], .prototype-banner, [data-env-ribbon]').split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * The banner is hidden through toHaveScreenshot's `stylePath`, which Playwright applies itself: a
 * style tag added to the page would be refused by a strict style-src CSP.
 */
let hideFile: string | null = null;
function hideStylePath(): string | undefined {
  const hide = hiddenSelectors();
  if (!hide.length) return undefined;
  if (!hideFile) {
    hideFile = join(tmpdir(), `qa-hide-${process.pid}.css`);
    writeFileSync(hideFile, `${hide.join(', ')} { visibility: hidden !important; }\n`);
  }
  return hideFile;
}

/** The skin, then the fonts, before every shot, so no baseline depends on the host's settings. */
async function prepare(page: Page, opts: { skin?: 'light' | 'dark' }): Promise<void> {
  const s = skin(opts);
  if (s) await page.emulateMedia({ colorScheme: s });
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

/** Sets the skin, hides the banner, waits for webfonts, then compares with the baseline (`<name>.png`). */
export async function expectVisual(page: Page, name: string, opts: VisualOptions = {}): Promise<void> {
  await prepare(page, opts);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    ...visualDefaults(),
    fullPage: opts.fullPage ?? true,
    mask: opts.mask ?? [],
    maskColor: '#ff00ff',
    stylePath: hideStylePath(),
    ...(opts.maxDiffPixelRatio !== undefined ? { maxDiffPixelRatio: opts.maxDiffPixelRatio } : {}),
  });
}

/** Same, for one component (a dialog, a card) instead of the whole page. */
export async function expectVisualOf(target: Locator, name: string, opts: Omit<VisualOptions, 'fullPage'> = {}): Promise<void> {
  await prepare(target.page(), opts);
  await expect(target).toHaveScreenshot(`${name}.png`, {
    ...visualDefaults(),
    mask: opts.mask ?? [],
    maskColor: '#ff00ff',
    stylePath: hideStylePath(),
    ...(opts.maxDiffPixelRatio !== undefined ? { maxDiffPixelRatio: opts.maxDiffPixelRatio } : {}),
  });
}

/** The web viewports of PROJECT-PROFILE §UI testing (default 320 · 768 · 1280 CSS px wide). */
export const VIEWPORTS = (process.env.UI_VIEWPORTS ?? '320,768,1280').split(',').map((w) => ({ width: Number(w.trim()), height: 900 }));
