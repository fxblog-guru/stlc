// Golden: the server watch (shared/fixtures/server-watch.fixture.ts). The spec is an ordinary list
// search — it asserts status, schema and items, all of which stay green when the server logs an
// error and answers 200 anyway. The server half of the Expected is not code here: the auto
// serverWatch fixture reads the server log for this test's window and fails it on error lines.
// Seeded bug: DEMO_BUG=silent-error.
import { test, expect, expectSchema, caseMeta } from '../../shared/fixtures';

test('TC-API-PROJECTS-004 — [Projects · API] GET /projects — Owner searches by name → 200, only the matching project', caseMeta({
  id: 'TC-API-PROJECTS-004', type: 'api', module: 'projects', priority: 'P2', req: ['demo/REQ-001'],
}), async ({ projectsAs, projectsFactory }) => {
  const project = await projectsFactory.create();
  const owner = await projectsAs('owner');

  await test.step('Step 1: search by the project\'s name → 200 and exactly that project', async () => {
    const res = await owner.list({ q: project.name });
    await expectSchema(res, 'listProjects', 200);
    expect(res.body.items.map((p) => p.id)).toEqual([project.id]);
  });
});
