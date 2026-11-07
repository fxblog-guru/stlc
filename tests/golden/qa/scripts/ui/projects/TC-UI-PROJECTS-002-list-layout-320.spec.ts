// Golden: layout without pixels. At the 320 px reflow width the list holds the longest name the
// API accepts; the checks measure the rendered DOM and name the offending element when one breaks —
// the failure a screenshot shows as "something moved" is reported here as "button X is 280 px wide
// in a 320 px viewport".
import { test, caseMeta, expectNoHorizontalScroll, expectNoOverflow, expectNoOverlap, expectTouchTargets } from '../../shared/fixtures';
import { uniqueDigits } from '../../shared/data/unique';

test('TC-UI-PROJECTS-002 — [Projects · Web] Projects list — Member opens it with a long name at 320 px → no sideways scroll, nothing clipped', caseMeta({
  id: 'TC-UI-PROJECTS-002', type: 'ui', module: 'projects', priority: 'P2', req: ['demo/REQ-001'], suites: ['regression'], platform: ['web'],
}), async ({ pool, projectsFactory, projectsPageAs }) => {
  const [account] = pool;
  const longName = `P${uniqueDigits('long', 8)}${'x'.repeat(71)}`; // 80 characters, one word: the worst case for wrapping
  await projectsFactory.withMember('member', account, { name: longName });
  await projectsFactory.withMember('member', account, { name: `Project ${uniqueDigits('ui')}` });
  const projectsPage = await projectsPageAs(account);
  const body = projectsPage.page.locator('body');

  await test.step('Step 1: open Projects at 320 px → the page does not scroll sideways', async () => {
    await projectsPage.page.setViewportSize({ width: 320, height: 900 });
    await projectsPage.goto();
    await expectNoHorizontalScroll(projectsPage.page);
  });

  await test.step('Step 2: measure every element → nothing clips or leaves the viewport', async () => {
    await expectNoOverflow(body);
  });

  await test.step('Step 3: measure every control → no overlap, each ≥ 24×24 CSS px', async () => {
    await expectNoOverlap(body);
    await expectTouchTargets(body, 24);
  });
});
