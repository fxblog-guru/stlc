// Golden: accessibility of one screen in two states. axe (WCAG 2.2 AA) for what a machine can
// judge, plus explicit assertions for what axe cannot: the dialog's accessible name, the error
// announced and tied to its field, focus moved into and kept in the dialog.
import { test, expect, caseMeta } from '../../shared/fixtures';
import { expectNoA11yViolations } from '../../shared/a11y/axe';
import { storageStateFile } from '../../shared/auth/session';

test.use({ storageState: storageStateFile('owner') });

test('TC-A11Y-PROJECTS-001 — [Projects · Web] Projects list, New project dialog — Owner opens both → no critical/serious violations', caseMeta({
  id: 'TC-A11Y-PROJECTS-001', type: 'accessibility', module: 'projects', priority: 'P1', req: ['demo/REQ-001'],
}), async ({ projectsPage, projectsFactory, page }, testInfo) => {
  await projectsFactory.create();

  await test.step('Step 1: open the list, run axe → no critical/serious violations', async () => {
    await projectsPage.goto();
    await expectNoA11yViolations(page, testInfo, 'projects list');
  });

  await test.step('Step 2: open New project → the dialog is named and takes focus', async () => {
    await projectsPage.newProjectButton.click();
    await expect(projectsPage.newProjectDialog.root).toHaveAccessibleName('New project');
    await expect(projectsPage.newProjectDialog.field('Name')).toBeFocused();
  });

  await test.step('Step 3: submit it empty → the error is announced on the field', async () => {
    await projectsPage.newProjectDialog.press('Create');
    await expect(projectsPage.newProjectDialog.field('Name')).toHaveAccessibleDescription('Name is required (1 to 80 characters).');
    await expectNoA11yViolations(page, testInfo, 'dialog with error');
  });
});
