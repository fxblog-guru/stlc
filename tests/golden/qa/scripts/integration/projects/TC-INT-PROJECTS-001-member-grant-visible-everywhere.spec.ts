// Golden: an integration seam. One actor writes, another reads through a different path, and
// the case asserts the state crossed the seam — here grant → the member's list, detail and the
// project's member count. With a database, the same shape reads the row back through `db`
// (read-only, parameterised); `db.configured` is false for the demo app, which keeps state in
// memory, so the DB step is declared and skipped with its reason — never silently dropped.
import { test, expect, caseMeta } from '../../shared/fixtures';

test('TC-INT-PROJECTS-001 — [Projects · API] PUT /projects/{id}/members/{accountId} — Owner grants viewer → list and detail show viewer', caseMeta({
  id: 'TC-INT-PROJECTS-001', type: 'integration', module: 'projects', priority: 'P1', req: ['demo/REQ-002'],
}), async ({ pool, projectsFactory, projectsAs, db }) => {
  const [account] = pool;
  const project = await projectsFactory.withMember('viewer', account);
  const member = await projectsAs(account);

  await test.step('Step 1: the member lists projects → it is listed with role viewer', async () => {
    const res = await member.list({ q: project.name });
    expect(res.body.items).toEqual([expect.objectContaining({ id: project.id, my_role: 'viewer', member_count: 1 })]);
  });

  await test.step('Step 2: the member reads it by id → role viewer', async () => {
    const res = await member.get(project.id);
    expect(res.body).toMatchObject({ id: project.id, my_role: 'viewer' });
  });

  await test.step('Step 3: read the membership row → role viewer persisted', async () => {
    test.skip(!db.configured, 'DB_CONNECTION is not set for this environment — the demo app has no database');
    const row = await db.queryOne('SELECT role FROM project_members WHERE project_id = @p AND account_id = @a', { p: project.id, a: account.id ?? '' });
    expect(row?.role).toBe('viewer');
  });
});
