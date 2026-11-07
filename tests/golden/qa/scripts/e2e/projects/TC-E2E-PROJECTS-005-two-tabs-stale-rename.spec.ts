// Golden: a UI risk class (designing-functional-cases Step 1b — two tabs on one record). The same
// Owner opens one project in two tabs of one browser context, saves a rename in tab A, then saves a
// different rename from tab B, which still shows the old version. A product with optimistic
// concurrency refuses B (409 → a conflict message); a product without it silently overwrites A —
// the lost update no single-tab script ever sees. Seeded bug: DEMO_BUG=stale-write.
import { test, expect, caseMeta } from '../../shared/fixtures';
import { uniqueName } from '../../shared/data/unique';
import { storageStateFile } from '../../shared/auth/session';

test.use({ storageState: storageStateFile('owner') });

test('TC-E2E-PROJECTS-005 — [Projects · Web] Project page, two tabs — Owner saves a rename from a stale tab → conflict shown, first rename kept', caseMeta({
  id: 'TC-E2E-PROJECTS-005', type: 'e2e', module: 'projects', priority: 'P1', req: ['demo/REQ-001'],
}), async ({ projectsFactory, projectsAs, projectTabs }) => {
  const project = await projectsFactory.create();
  const [tabA, tabB] = await projectTabs(2);
  const nameA = uniqueName('tab-a');
  const nameB = uniqueName('tab-b');

  await test.step('Step 1: open the project in tab A and in tab B → both show its name', async () => {
    await tabA.openById(project.id);
    await tabB.openById(project.id);
    await expect(tabA.heading).toHaveText(project.name);
    await expect(tabB.heading).toHaveText(project.name);
  });

  await test.step('Step 2: rename it in tab A → "Saved." and the new name as heading', async () => {
    await tabA.rename(nameA);
    await expect(tabA.status).toHaveText('Saved.');
    await expect(tabA.heading).toHaveText(nameA);
  });

  await test.step('Step 3: rename it in tab B, which still shows the old version → the conflict message, heading unchanged', async () => {
    await tabB.rename(nameB);
    await expect(tabB.error).toHaveText('Someone else changed this project. Reload to see their changes.');
    await expect(tabB.heading).toHaveText(project.name);
  });

  await test.step('Step 4: read the project over the API → tab A\'s name is kept', async () => {
    const res = await (await projectsAs('owner')).get(project.id);
    expect(res.body.name).toBe(nameA);
  });
});
