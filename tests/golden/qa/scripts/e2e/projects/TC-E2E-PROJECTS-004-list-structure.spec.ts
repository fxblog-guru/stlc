// Golden: structure, not pixels. An aria snapshot pins what assistive tech and users perceive —
// headings, the table's columns, the controls — and survives restyling that a screenshot would
// not. Seeded rows carry unique names, so the snapshot matches with a regex, never a literal.
import { test, expect, caseMeta } from '../../shared/fixtures';
import { storageStateFile } from '../../shared/auth/session';

test.use({ storageState: storageStateFile('owner') });

test('TC-E2E-PROJECTS-004 — [Projects · Web] Projects list — Owner opens the list → heading, New project button, three columns', caseMeta({
  id: 'TC-E2E-PROJECTS-004', type: 'e2e', module: 'projects', priority: 'P2', req: ['demo/REQ-001'], suites: ['regression'],
}), async ({ projectsPage, projectsFactory, page }) => {
  await projectsFactory.create();
  await projectsPage.goto();

  await expect(page.getByRole('main')).toMatchAriaSnapshot(`
    - heading "Projects" [level=1]
    - button "New project"
    - paragraph: /\\d+ projects?/
    - table "Projects":
      - rowgroup:
        - row "Name Your role Members":
          - columnheader "Name"
          - columnheader "Your role"
          - columnheader "Members"
  `);
});
