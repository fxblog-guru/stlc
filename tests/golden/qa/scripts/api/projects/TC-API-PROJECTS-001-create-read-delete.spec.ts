// Golden: one API case = one intent, one test. Arrange through a factory (own data, auto
// cleanup), act through the service, assert status + contract + read-back. Parallel-safe: no
// shared variables, no serial mode, a unique name per run/worker.
import { test, expect, expectSchema, caseMeta } from '../../shared/fixtures';

test('TC-API-PROJECTS-001 — [Projects · API] POST /projects — Owner creates a project → 201 and it reads back', caseMeta({
  id: 'TC-API-PROJECTS-001', type: 'api', module: 'projects', priority: 'P0', req: ['demo/REQ-001'], suites: ['smoke'],
}), async ({ projectsAs, projectsFactory, cleanup }) => {
  const owner = await projectsAs('owner');
  const input = projectsFactory.build({ description: 'Golden create' });

  const created = await test.step('Step 1: Owner creates a project → 201 and the documented body', async () => {
    const res = await owner.create(input);
    await expectSchema(res, 'createProject', 201);
    expect(res.body).toMatchObject({ name: input.name, description: 'Golden create', my_role: 'owner', member_count: 0 });
    cleanup.add(`project ${res.body.name}`, () => owner.remove(res.body.id));
    return res.body;
  });

  await test.step('Step 2: read it back by id → the same values', async () => {
    const res = await owner.get(created.id);
    await expectSchema(res, 'getProject', 200);
    expect(res.body).toEqual(created);
  });

  await test.step('Step 3: search the list by name → it is the only result', async () => {
    const res = await owner.list({ q: input.name as string });
    await expectSchema(res, 'listProjects', 200);
    expect(res.body.items.map((p) => p.id)).toEqual([created.id]);
  });

  await test.step('Step 4: delete → 204, then 404 on read', async () => {
    expect((await owner.remove(created.id)).status).toBe(204);
    expect((await owner.get(created.id)).status).toBe(404);
  });
});
