// Golden: visual baselines — one screen, two states, three viewports. Each Variants row is its own
// test with its own baseline (`projects-list-<state>-<width>.png`), so a diff names exactly which
// state at which width changed. A pool account sees only the projects granted to it, so "empty"
// and "populated" stay exact while every other test runs in parallel; run-specific text (the
// project names, "Signed in as …") is masked, never cropped away.
import { test, caseMeta, expectVisual } from '../../shared/fixtures';
import { uniqueDigits } from '../../shared/data/unique';

const ROWS = [
  { id: 'e320', state: 'empty', width: 320 }, { id: 'e768', state: 'empty', width: 768 }, { id: 'e1280', state: 'empty', width: 1280 },
  { id: 'p320', state: 'populated', width: 320 }, { id: 'p768', state: 'populated', width: 768 }, { id: 'p1280', state: 'populated', width: 1280 },
] as const;
// How each state is seeded — a lookup, so the test body has no branches.
const SEED = { empty: 0, populated: 3 } as const;

for (const row of ROWS) {
  test(`TC-UI-PROJECTS-001 — row ${row.id}: ${row.state}, ${row.width} px → matches projects-list-${row.state}-${row.width}`, caseMeta({
    id: 'TC-UI-PROJECTS-001', type: 'ui', module: 'projects', priority: 'P2', req: ['demo/REQ-001'], suites: ['regression'], platform: ['web'],
  }), async ({ pool, projectsFactory, projectsPageAs }) => {
    const [account] = pool;
    for (let i = 0; i < SEED[row.state]; i++) await projectsFactory.withMember('member', account, { name: `Project ${uniqueDigits('ui')}` });
    const projectsPage = await projectsPageAs(account);

    await test.step(`Step 1: open Projects at ${row.width} px → matches the baseline`, async () => {
      await projectsPage.page.setViewportSize({ width: row.width, height: 900 });
      await projectsPage.goto();
      await expectVisual(projectsPage.page, `projects-list-${row.state}-${row.width}`, { mask: [projectsPage.projectLinks, projectsPage.signedInAs] });
    });
  });
}
