// layout.ts — pixel-free layout checks for the `ui` tier (generating-ui-script). Each one measures
// the rendered DOM and fails with the offending elements named, so a broken layout is a readable
// finding, not a diff image to squint at. They complement toHaveScreenshot: a screenshot catches
// "it looks different", these catch "it is broken" at every viewport — including ones nobody keeps
// a baseline for.
//
//   expectNoHorizontalScroll(page)            the page never scrolls sideways (WCAG 1.4.10 reflow)
//   expectNoOverflow(locator)                 no element inside clips or spills its text
//   expectNoOverlap(locator)                  no two interactive elements inside cover each other
//   expectTouchTargets(locator, min = 24)     interactive elements ≥ 24×24 CSS px (WCAG 2.5.8)
//   expectFocusVisible(locator)               a focused control shows an outline or ring
//   expectTokens(locator, { color, … })       computed styles equal the design tokens (§UI testing)
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** Interactive elements the overlap and target-size checks consider. */
export const INTERACTIVE = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=checkbox], [role=tab], [tabindex]:not([tabindex="-1"])';

/** The page does not scroll horizontally: scrollWidth ≤ clientWidth on the scrolling element. */
export async function expectNoHorizontalScroll(page: Page, tolerance = 0): Promise<void> {
  const m = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, viewport: window.innerWidth };
  });
  expect(m.scrollWidth - m.clientWidth, `the page scrolls sideways at ${m.viewport}px: content is ${m.scrollWidth}px wide in a ${m.clientWidth}px viewport`).toBeLessThanOrEqual(tolerance);
}

/**
 * No element inside `root` clips or spills its content: for every element with text or controls,
 * scrollWidth ≤ clientWidth (+1px rounding) unless it is a declared scroll container
 * (overflow-x auto/scroll) — and its own box stays inside the viewport.
 */
export async function expectNoOverflow(root: Locator, selector = '*'): Promise<void> {
  const offenders = await root.evaluate((r, sel) => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    const name = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.getAttribute('data-testid') ? `[data-testid=${el.getAttribute('data-testid')}]` : ''} "${(el.textContent ?? '').trim().slice(0, 30)}"`;
    for (const el of [r, ...Array.from(r.querySelectorAll(sel))] as HTMLElement[]) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.offsetParent === null && cs.position !== 'fixed' && el !== document.body) continue;
      const scrolls = ['auto', 'scroll'].includes(cs.overflowX);
      if (!scrolls && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && (el.textContent ?? '').trim()) out.push(`${name(el)} clips: content ${el.scrollWidth}px in a ${el.clientWidth}px box`);
      const box = el.getBoundingClientRect();
      if (box.width > 0 && (box.right > vw + 1 || box.left < -1)) out.push(`${name(el)} leaves the viewport: ${Math.round(box.left)}..${Math.round(box.right)} of ${vw}px`);
    }
    return out;
  }, selector);
  expect(offenders, 'elements that overflow (text clipped or box outside the viewport)').toEqual([]);
}

/** No two visible interactive elements inside `root` overlap (their boxes intersect by > 1px). */
export async function expectNoOverlap(root: Locator, selector = INTERACTIVE): Promise<void> {
  const overlaps = await root.evaluate((r, sel) => {
    const els = (Array.from(r.querySelectorAll(sel)) as HTMLElement[]).filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const boxes = els.map((el) => ({ el, b: el.getBoundingClientRect() }));
    const label = (el: Element) => `${el.tagName.toLowerCase()} "${(el.textContent ?? (el as HTMLInputElement).name ?? '').trim().slice(0, 25)}"`;
    const out: string[] = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j];
        if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
        const w = Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left);
        const h = Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top);
        if (w > 1 && h > 1) out.push(`${label(a.el)} overlaps ${label(c.el)} by ${Math.round(w)}×${Math.round(h)}px`);
      }
    return out;
  }, selector);
  expect(overlaps, 'interactive elements that cover each other').toEqual([]);
}

/** Interactive elements are at least `min`×`min` CSS px (WCAG 2.2 SC 2.5.8 Target Size, minimum 24). Inline links in text are exempt. */
export async function expectTouchTargets(root: Locator, min = 24, selector = INTERACTIVE): Promise<void> {
  const small = await root.evaluate((r, { sel, min }) => {
    const out: string[] = [];
    for (const el of Array.from(r.querySelectorAll(sel)) as HTMLElement[]) {
      if (!el.getClientRects().length) continue;
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && (el.parentElement.textContent ?? '').trim().length > (el.textContent ?? '').trim().length) continue;
      const b = el.getBoundingClientRect();
      if (b.width < min || b.height < min) out.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 25)}" is ${Math.round(b.width)}×${Math.round(b.height)}px`);
    }
    return out;
  }, { sel: selector, min });
  expect(small, `interactive elements smaller than ${min}×${min} CSS px (WCAG 2.5.8)`).toEqual([]);
}

/** After focusing `control` by keyboard, it shows an outline or a box-shadow ring (WCAG 2.4.7). */
export async function expectFocusVisible(control: Locator): Promise<void> {
  await control.focus();
  const ring = await control.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, shadow: cs.boxShadow !== 'none' };
  });
  expect(ring.outline || ring.shadow, 'the focused control shows no outline and no focus ring').toBe(true);
}

/** Computed CSS properties of `el` equal the design tokens named (kebab-case CSS property → value). */
export async function expectTokens(el: Locator, tokens: Record<string, string>): Promise<void> {
  for (const [prop, value] of Object.entries(tokens)) await expect(el, `design token ${prop}`).toHaveCSS(prop, value);
}
