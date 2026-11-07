// Golden: two actors, one journey. The Owner's side is set up through the API (fast, no UI),
// the member's side is what the case is about, in a browser context signed in as THIS worker's
// pool account — so it runs in parallel with every other test, including copies of itself.
import { test, expect, caseMeta } from '../../shared/fixtures';

test('TC-E2E-PROJECTS-003 — [Projects · Web] Projects list — Member opens the list after a grant → project listed with role member', caseMeta({
  id: 'TC-E2E-PROJECTS-003', type: 'e2e', module: 'projects', priority: 'P1', req: ['demo/REQ-002'], suites: ['regression'],
}), async ({ pool, projectsPageAs, projectsFactory }) => {
  const [account] = pool;
  const project = await projectsFactory.withMember('member', account);
  const projectsPage = await projectsPageAs(account);

  await test.step('Step 1: the member opens Projects → the list renders', async () => {
    await projectsPage.goto();
  });

  await test.step('Step 2: find the granted project → listed with role "member"', async () => {
    await expect(await projectsPage.table.cell(project.name, 'Your role')).toHaveText('member');
  });

  await test.step('Step 3: look for "New project" → the button is hidden', async () => {
    await expect(projectsPage.newProjectButton).toBeHidden();
  });
});
