// Golden: a component state — the dialog after a refused submit. The baseline is the dialog
// element only: the list behind it holds whatever other tests created, so a full-page shot would
// diff on someone else's data. Layout rules run on the same state.
import { test, expect, caseMeta, expectVisualOf, expectNoOverflow, expectNoOverlap, expectTouchTargets } from '../../shared/fixtures';
import { storageStateFile } from '../../shared/auth/session';

test.use({ storageState: storageStateFile('owner'), viewport: { width: 320, height: 900 } });

test('TC-UI-PROJECTS-003 — [Projects · Web] New project dialog — Owner submits it empty at 320 px → error state matches baseline, nothing clipped', caseMeta({
  id: 'TC-UI-PROJECTS-003', type: 'ui', module: 'projects', priority: 'P2', req: ['demo/REQ-001'], platform: ['web'],
}), async ({ projectsPage }) => {
  const dialog = projectsPage.newProjectDialog;

  await test.step('Step 1: open New project, press Create empty → the error is shown', async () => {
    await projectsPage.goto();
    await projectsPage.newProjectButton.click();
    await dialog.press('Create');
    await expect(dialog.error).toHaveText('Name is required (1 to 80 characters).');
  });

  await test.step('Step 2: screenshot the dialog → matches new-project-dialog-error-320', async () => {
    await expectVisualOf(dialog.root, 'new-project-dialog-error-320');
  });

  await test.step('Step 3: measure the dialog → nothing clips, controls usable', async () => {
    await expectNoOverflow(dialog.root);
    await expectNoOverlap(dialog.root);
    await expectTouchTargets(dialog.root, 24);
  });
});
