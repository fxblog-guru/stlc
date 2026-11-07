// Golden: an authorization matrix. Every cell is (role × operation → expected status), each its
// own parallel test. Roles are DATA: the factory grants this worker's pool account a role on a
// project it just created, so no two tests share a "viewer" and no cell depends on another.
// The CSRF and anonymous axes are rows of the same matrix.
import { test, expect, caseMeta } from '../../shared/fixtures';
import type { ApiResponse } from '../../shared/fixtures';
import type { ApiClient } from '../../shared/http/api.client';
import type { Session } from '../../shared/fixtures';
import type { ProjectsService, ProjectRole } from '../../shared/services/projects.service';
import type { ProjectsFactory as Factory } from '../../shared/data/projects.factory';

type Who = ProjectRole | 'non-member' | 'anonymous' | 'no-csrf';
type Op = { name: string; call: (svc: ProjectsService, id: string) => Promise<ApiResponse<unknown>> };

const OPS: Record<string, Op> = {
  read: { name: 'GET /projects/{id}', call: (s, id) => s.get(id) },
  edit: { name: 'PATCH /projects/{id}', call: (s, id) => s.update(id, { description: 'edited by the matrix' }) },
  remove: { name: 'DELETE /projects/{id}', call: (s, id) => s.remove(id) },
};

// From the case's ## Authorization table, verbatim. A non-member gets 404, not 403: the API
// must not reveal that a project exists to someone outside it.
const MATRIX: readonly { who: Who; op: keyof typeof OPS; status: number }[] = [
  { who: 'viewer', op: 'read', status: 200 }, { who: 'viewer', op: 'edit', status: 403 }, { who: 'viewer', op: 'remove', status: 403 },
  { who: 'member', op: 'read', status: 200 }, { who: 'member', op: 'edit', status: 200 }, { who: 'member', op: 'remove', status: 403 },
  { who: 'admin', op: 'read', status: 200 }, { who: 'admin', op: 'edit', status: 200 }, { who: 'admin', op: 'remove', status: 204 },
  { who: 'non-member', op: 'read', status: 404 }, { who: 'non-member', op: 'edit', status: 404 }, { who: 'non-member', op: 'remove', status: 404 },
  { who: 'anonymous', op: 'read', status: 401 }, { who: 'anonymous', op: 'edit', status: 401 },
  { who: 'no-csrf', op: 'edit', status: 403 }, { who: 'no-csrf', op: 'remove', status: 403 },
];

// How each row is arranged and who calls — lookup tables, so the test body has no branches.
type Ctx = { account: Session; as: (s: Session) => Promise<ApiClient>; anonymous: ApiClient };
const granted = (role: ProjectRole) => (f: Factory, a: Session) => f.withMember(role, a);
const ARRANGE: Record<Who, (f: Factory, a: Session) => Promise<{ id: string }>> = {
  viewer: granted('viewer'), member: granted('member'), admin: granted('admin'),
  'non-member': (f) => f.create(), anonymous: granted('admin'), 'no-csrf': granted('admin'),
};
const self = async ({ account, as }: Ctx) => as(account);
const CALLER: Record<Who, (c: Ctx) => Promise<ApiClient>> = {
  viewer: self, member: self, admin: self, 'non-member': self,
  anonymous: async ({ anonymous }) => anonymous,
  'no-csrf': async (c) => (await self(c)).withoutCsrf(),
};

for (const cell of MATRIX) {
  test(`TC-SEC-PROJECTS-001 — [Projects · API] ${OPS[cell.op].name} — ${cell.who} calls it → ${cell.status}`, caseMeta({
    id: 'TC-SEC-PROJECTS-001', type: 'security', module: 'projects', priority: 'P0', req: ['demo/REQ-002'], suites: ['regression'],
  }), async ({ pool, projectsFactory, projectsAs, as, anonymous }) => {
    const [account] = pool;
    const project = await ARRANGE[cell.who](projectsFactory, account);
    const caller = await projectsAs(await CALLER[cell.who]({ account, as, anonymous }));

    const res = await OPS[cell.op].call(caller, project.id);

    expect(res.status, `${cell.who} × ${OPS[cell.op].name}`).toBe(cell.status);
  });
}
