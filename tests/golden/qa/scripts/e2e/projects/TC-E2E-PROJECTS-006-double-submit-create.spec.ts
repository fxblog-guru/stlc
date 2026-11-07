// Golden: a UI risk class (designing-functional-cases Step 1b — double submit). A real user
// double-clicks "Create" or clicks again because nothing seemed to happen. The claim is about what
// the PRODUCT ended up with, not what the screen shows: exactly one request left the browser and
// exactly one project exists. Seeded bug: DEMO_BUG=double-submit (the button stays enabled while
// pending and the server's uniqueness check races the insert → two projects with one name).
import { test, expect, caseMeta } from '../../shared/fixtures';
import { uniqueName } from '../../shared/data/unique';
import { storageStateFile } from '../../shared/auth/session';
import { trackRequests } from '../../shared/pages/network';

test.use({ storageState: storageStateFile('owner') });

test('TC-E2E-PROJECTS-006 — [Projects · Web] New project dialog — Owner double-clicks Create → exactly one project created', caseMeta({
  id: 'TC-E2E-PROJECTS-006', type: 'e2e', module: 'projects', priority: 'P1', req: ['demo/REQ-001'],
}), async ({ page, projectsPage, projectsAs, cleanup }) => {
  const name = uniqueName('double-submit');
  const owner = await projectsAs('owner');
  cleanup.add(`projects named ${name}`, async () => {
    for (const p of (await owner.list({ q: name })).body.items) await owner.remove(p.id);
  });
  const creates = trackRequests(page, 'POST', /\/api\/projects$/);

  await test.step('Step 1: open Projects, open the New project dialog and type a name → the Create button is enabled', async () => {
    await projectsPage.goto();
    await projectsPage.newProjectButton.click();
    await projectsPage.newProjectDialog.fill({ Name: name });
    await expect(projectsPage.createButton).toBeEnabled();
  });

  await test.step('Step 2: double-click Create → the project is listed once', async () => {
    await projectsPage.createButton.dblclick();
    await expect(projectsPage.table.row(name)).toHaveCount(1);
  });

  await test.step('Step 3: count the create requests the page sent → exactly one', async () => {
    expect(await creates.settled(), `create requests: ${creates.list().join(', ')}`).toBe(1);
  });

  await test.step('Step 4: search the API for the name → exactly one project', async () => {
    expect((await owner.list({ q: name })).body.total).toBe(1);
  });
});
