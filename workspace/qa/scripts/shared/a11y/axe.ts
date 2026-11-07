// axe.ts — accessibility checks for the `accessibility` tier (generating-a11y-script).
// Runs axe-core through @axe-core/playwright on a rendered screen state, attaches the raw
// results to the test, maps axe impacts to the bundle's finding severities (CONTRACTS §7:
// critical→Critical, serious→High, moderate→Medium, minor→Low) and fails on the impacts named
// in A11Y_FAIL_ON (default critical,serious). Everything else is reported, never hidden.
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

export type AxeImpact = 'critical' | 'serious' | 'moderate' | 'minor';
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';

export const IMPACT_TO_SEVERITY: Record<AxeImpact, Severity> = {
  critical: 'Critical',
  serious: 'High',
  moderate: 'Medium',
  minor: 'Low',
};

/** WCAG 2.2 AA rule tags (axe): A + AA for 2.0/2.1/2.2, plus best-practice off by default. */
export const WCAG_22_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export interface AxeOptions {
  /** CSS selectors to scope the scan (default: whole document) */
  include?: string[];
  /** CSS selectors to exclude (third-party widgets the team does not own — cite the reason in the case) */
  exclude?: string[];
  /** axe rule tags (default WCAG_22_AA_TAGS) */
  tags?: string[];
  /** rules disabled for this case — every entry needs a reviewed reason in the case's ## Scope */
  disableRules?: string[];
}

export interface Violation {
  id: string;
  impact: AxeImpact;
  severity: Severity;
  help: string;
  helpUrl: string;
  wcag: string[];
  nodes: { target: string; html: string; failureSummary: string }[];
}

export interface AxeOutcome {
  violations: Violation[];
  passes: number;
  incomplete: number;
  url: string;
}

function failOn(): AxeImpact[] {
  return (process.env.A11Y_FAIL_ON ?? 'critical,serious').split(',').map((s) => s.trim()).filter(Boolean) as AxeImpact[];
}

/** Run axe on the current page state. Call it AFTER the screen state under test is fully rendered. */
export async function runAxe(page: Page, opts: AxeOptions = {}): Promise<AxeOutcome> {
  let builder = new AxeBuilder({ page }).withTags(opts.tags ?? WCAG_22_AA_TAGS);
  for (const sel of opts.include ?? []) builder = builder.include(sel);
  for (const sel of opts.exclude ?? []) builder = builder.exclude(sel);
  if (opts.disableRules?.length) builder = builder.disableRules(opts.disableRules);
  const results = await builder.analyze();
  const violations: Violation[] = results.violations.map((v) => {
    const impact = (v.impact ?? 'minor') as AxeImpact;
    return {
      id: v.id,
      impact,
      severity: IMPACT_TO_SEVERITY[impact],
      help: v.help,
      helpUrl: v.helpUrl,
      wcag: v.tags.filter((t) => /^wcag\d{3,4}$/.test(t)).map((t) => t.replace(/^wcag(\d)(\d)(\d+)$/, '$1.$2.$3')),
      nodes: v.nodes.map((n) => ({ target: n.target.map(String).join(' '), html: n.html, failureSummary: n.failureSummary ?? '' })),
    };
  });
  return { violations, passes: results.passes.length, incomplete: results.incomplete.length, url: results.url };
}

/** Attach the outcome as JSON evidence (lands in the run's test-results under RUN_DIR). */
export async function attachAxe(testInfo: TestInfo, label: string, outcome: AxeOutcome): Promise<void> {
  await testInfo.attach(`axe-${label}.json`, { body: JSON.stringify(outcome, null, 2), contentType: 'application/json' });
}

/** Rows for the run's findings.md (CONTRACTS §7 columns, ids numbered by executing-tests). */
export function findingRows(outcome: AxeOutcome, ctx: { caseId: string; req: string; screen: string }): string[] {
  return outcome.violations.map((v) =>
    `| A11Y-F-NNN | ${v.severity} | axe ${v.id} (WCAG ${v.wcag.join(', ') || 'best-practice'}) | ${ctx.screen} · ${v.nodes[0]?.target ?? ''} (${v.nodes.length} node(s)) | ${ctx.req} | ${ctx.caseId} | open |`);
}

/** Scan + attach + assert: fails when any violation's impact is in A11Y_FAIL_ON; lower impacts
 *  are attached and returned for the findings table but do not fail the case. */
export async function expectNoA11yViolations(page: Page, testInfo: TestInfo, label: string, opts: AxeOptions = {}): Promise<AxeOutcome> {
  const outcome = await runAxe(page, opts);
  await attachAxe(testInfo, label, outcome);
  const gate = new Set(failOn());
  const failing = outcome.violations.filter((v) => gate.has(v.impact));
  const summary = failing.map((v) => `${v.impact} ${v.id} — ${v.help} (${v.nodes.length} node(s); first: ${v.nodes[0]?.target}) ${v.helpUrl}`).join('\n');
  expect(failing, `${label}: ${failing.length} ${[...gate].join('/')} axe violation(s)\n${summary}`).toEqual([]);
  return outcome;
}

/** Keyboard reachability: Tab through the page and assert each expected stop receives focus in order.
 *  `stops` are locators' test ids (registry-grounded) in the order the case states. */
export async function expectTabOrder(page: Page, stops: string[]): Promise<void> {
  for (const id of stops) {
    await page.keyboard.press('Tab');
    await expect(page.getByTestId(id), `focus should land on ${id}`).toBeFocused();
  }
}
