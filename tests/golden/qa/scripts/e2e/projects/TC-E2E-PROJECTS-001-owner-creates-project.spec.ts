// Golden: a UI journey. Signed in by storageState (setup project — no UI login), state seeded
// through the API when the case needs any, the UI drives only what the case is about, and every
// claim is a web-first assertion on what the user sees. Page objects come from fixtures.
import { test, expect, caseMeta } from '../../shared/fixtures';
import { uniqueName } from '../../shared/data/unique';
import { storageStateFile } from '../../shared/auth/session';

test.use({ storageState: storageStateFile('owner') });

test('TC-E2E-PROJECTS-001 — [Projects · Web] New project dialog — Owner creates a project → listed with role owner', caseMeta({
  id: 'TC-E2E-PROJECTS-001', type: 'e2e', module: 'projects', priority: 'P0', req: ['demo/REQ-001'], suites: ['smoke'],
}), async ({ projectsPage, projectsAs, cleanup }) => {
  const name = uniqueName('ui-project');
  cleanup.add(`project ${name}`, async () => {
    const owner = await projectsAs('owner');
    const found = await owner.list({ q: name });
    for (const p of found.body.items) await owner.remove(p.id);
  });

  await test.step('Step 1: open Projects → the list renders', async () => {
    await projectsPage.goto();
  });

  await test.step('Step 2: create a project with a name and a description → the dialog closes', async () => {
    await projectsPage.createProject(name, 'Made through the UI');
  });

  await test.step('Step 3: find it in the list → listed with role owner', async () => {
    await expect(projectsPage.table.row(name)).toBeVisible();
    await expect(await projectsPage.table.cell(name, 'Your role')).toHaveText('owner');
  });

  await test.step('Step 4: open it → the detail page shows its name', async () => {
    await projectsPage.open(name);
    await expect(projectsPage.heading(name)).toBeVisible();
  });
});

