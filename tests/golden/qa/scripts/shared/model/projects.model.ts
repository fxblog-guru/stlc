// projects.model.ts — the golden model (shared/model/model-runner.ts): projects + memberships.
// The model holds what SHOULD be true; actions change the real product AND the model; invariants
// compare the two after every step. Args are plain data (indexes, role names) so a sequence
// prints, replays and shrinks; names are minted inside run() so every replay uses fresh data.
// Guide: skills/designing-api-cases/references/model-based.md. Case: TC-API-PROJECTS-003.
import type { Model } from './model-runner';
import type { ProjectRole, ProjectsService } from '../services/projects.service';
import type { Session } from '../auth/session';
import type { Cleanup } from '../data/cleanup';
import { uniqueName } from '../data/unique';

export interface ProjectsCtx {
  owner: ProjectsService;
  /** pool accounts this worker owns — the people roles are granted to */
  accounts: Session[];
  /** a ProjectsService acting as accounts[i] */
  as: (i: number) => Promise<ProjectsService>;
  cleanup: Cleanup;
}

interface P {
  id: string;
  name: string;
  deleted: boolean;
  /** account index → role */
  members: Map<number, ProjectRole>;
}
export interface ProjectsState {
  projects: P[];
}

const ROLES: ProjectRole[] = ['admin', 'member', 'viewer'];
const MAX_PROJECTS = 3;
const alive = (m: ProjectsState) => m.projects.map((p, i) => ({ p, i })).filter((x) => !x.p.deleted);
const n = (v: string | number) => Number(v);
const expectStatus = (what: string, got: { status: number; text: string }, want: number) => {
  if (got.status !== want) throw new Error(`${what} → HTTP ${got.status} (expected ${want}) ${got.text.slice(0, 160)}`);
};

export const projectsModel = (accountCount: number): Model<ProjectsState, ProjectsCtx> => ({
  name: 'projects + memberships',
  init: () => ({ projects: [] }),
  actions: [
    {
      name: 'create',
      weight: 2,
      pre: (m) => alive(m).length < MAX_PROJECTS,
      args: () => ({}),
      run: async (m, _a, ctx) => {
        const res = await ctx.owner.create({ name: uniqueName('model') });
        expectStatus('POST /projects', res, 201);
        if (res.body.member_count !== 0) throw new Error(`a new project has member_count ${res.body.member_count}`);
        ctx.cleanup.add(`model project ${res.body.name}`, () => ctx.owner.remove(res.body.id));
        m.projects.push({ id: res.body.id, name: res.body.name, deleted: false, members: new Map() });
      },
    },
    {
      name: 'grant',
      weight: 3,
      pre: (m) => alive(m).length > 0,
      args: (m, prng) => ({ project: prng.pick(alive(m)).i, account: prng.int(0, accountCount - 1), role: prng.pick(ROLES) }),
      valid: (m, a) => !!m.projects[n(a.project)] && !m.projects[n(a.project)].deleted,
      run: async (m, a, ctx) => {
        const p = m.projects[n(a.project)];
        const res = await ctx.owner.setMember(p.id, ctx.accounts[n(a.account)].id as string, a.role as ProjectRole);
        expectStatus(`PUT member ${a.role}`, res, 200);
        p.members.set(n(a.account), a.role as ProjectRole);
      },
    },
    {
      name: 'revoke',
      weight: 2,
      pre: (m) => alive(m).some((x) => x.p.members.size > 0),
      args: (m, prng) => {
        const x = prng.pick(alive(m).filter((y) => y.p.members.size > 0));
        return { project: x.i, account: prng.pick([...x.p.members.keys()]) };
      },
      valid: (m, a) => !!m.projects[n(a.project)] && !m.projects[n(a.project)].deleted && m.projects[n(a.project)].members.has(n(a.account)),
      run: async (m, a, ctx) => {
        const p = m.projects[n(a.project)];
        expectStatus('DELETE member', await ctx.owner.removeMember(p.id, ctx.accounts[n(a.account)].id as string), 204);
        p.members.delete(n(a.account));
      },
    },
    {
      name: 'rename',
      pre: (m) => alive(m).length > 0,
      args: (m, prng) => ({ project: prng.pick(alive(m)).i }),
      valid: (m, a) => !!m.projects[n(a.project)] && !m.projects[n(a.project)].deleted,
      run: async (m, a, ctx) => {
        const p = m.projects[n(a.project)];
        const name = uniqueName('model-renamed');
        const res = await ctx.owner.update(p.id, { name });
        expectStatus('PATCH name', res, 200);
        p.name = name;
      },
    },
    {
      name: 'renameToTakenName',
      pre: (m) => alive(m).length > 1,
      args: (m, prng) => {
        const [a, b] = prng.shuffle(alive(m)).slice(0, 2);
        return { project: a.i, takenFrom: b.i };
      },
      valid: (m, a) => [a.project, a.takenFrom].every((i) => m.projects[n(i)] && !m.projects[n(i)].deleted),
      run: async (m, a, ctx) => {
        const res = await ctx.owner.update(m.projects[n(a.project)].id, { name: m.projects[n(a.takenFrom)].name.toUpperCase() });
        expectStatus('PATCH to a name taken in another case', res, 409);
      },
    },
    {
      name: 'delete',
      pre: (m) => alive(m).length > 0,
      args: (m, prng) => ({ project: prng.pick(alive(m)).i }),
      valid: (m, a) => !!m.projects[n(a.project)] && !m.projects[n(a.project)].deleted,
      run: async (m, a, ctx) => {
        const p = m.projects[n(a.project)];
        expectStatus('DELETE project', await ctx.owner.remove(p.id), 204);
        p.deleted = true;
        // postcondition: gone for every account at once (the invariant below re-checks as the Owner each step)
        for (let i = 0; i < ctx.accounts.length; i++) expectStatus(`GET deleted project as account ${i}`, await (await ctx.as(i)).get(p.id), 404);
      },
    },
  ],
  invariants: [
    {
      name: 'member_count equals the members granted',
      check: async (m, ctx) => {
        const out: string[] = [];
        for (const { p } of alive(m)) {
          const res = await ctx.owner.get(p.id);
          if (res.body.member_count !== p.members.size) out.push(`${p.name}: member_count ${res.body.member_count}, granted ${p.members.size}`);
        }
        return out;
      },
    },
    {
      name: 'a viewer cannot PATCH',
      check: async (m, ctx) => {
        const out: string[] = [];
        for (const { p } of alive(m))
          for (const [acct, role] of p.members)
            if (role === 'viewer') {
              const res = await (await ctx.as(acct)).update(p.id, { description: 'viewer edit' });
              if (res.status !== 403) out.push(`${p.name}: viewer account ${acct} PATCH → ${res.status}`);
            }
        return out;
      },
    },
    {
      // every account is checked in delete's postcondition; after that, the Owner (who sees everything) suffices
      name: 'a deleted project stays 404',
      check: async (m, ctx) => {
        const out: string[] = [];
        for (const p of m.projects.filter((x) => x.deleted)) {
          const owner = await ctx.owner.get(p.id);
          if (owner.status !== 404) out.push(`${p.name}: Owner GET → ${owner.status}`);
        }
        return out;
      },
    },
    {
      name: 'names are unique ignoring case',
      check: async (m, ctx) => {
        const out: string[] = [];
        for (const { p } of alive(m)) {
          const hits = (await ctx.owner.list({ q: p.name, limit: 100 })).body.items.filter((x) => x.name.toLowerCase() === p.name.toLowerCase());
          if (hits.length !== 1 || hits[0].id !== p.id) out.push(`"${p.name}": ${hits.length} project(s) carry it (${hits.map((x) => x.id).join(', ')})`);
        }
        return out;
      },
    },
  ],
});
