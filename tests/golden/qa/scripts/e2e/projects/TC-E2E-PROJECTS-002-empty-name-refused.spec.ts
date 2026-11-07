// Golden: a negative UI case — what the user sees when the input is refused: the message, the
// field marked invalid for assistive tech, and focus returned to it.
import { test, expect, caseMeta } from '../../shared/fixtures';
import { storageStateFile } from '../../shared/auth/session';

test.use({ storageState: storageStateFile('owner') });

test('TC-E2E-PROJECTS-002 — [Projects · Web] New project dialog — Owner submits an empty name → "Name is required", field focused', caseMeta({
  id: 'TC-E2E-PROJECTS-002', type: 'e2e', module: 'projects', priority: 'P1', req: ['demo/REQ-001'],
}), async ({ projectsPage }) => {
  await projectsPage.goto();
  await projectsPage.createProject('');

  await expect(projectsPage.newProjectDialog.error).toHaveText('Name is required (1 to 80 characters).');
  await expect(projectsPage.newProjectDialog.field('Name')).toHaveAttribute('aria-invalid', 'true');
  await expect(projectsPage.newProjectDialog.field('Name')).toBeFocused();
});
