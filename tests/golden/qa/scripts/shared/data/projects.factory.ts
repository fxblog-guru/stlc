// projects.factory.ts — builds valid payloads and creates projects that clean themselves up.
//   build(overrides)        a valid ProjectInput with a unique name; no I/O
//   create(overrides)       POST as the Owner, assert it worked, register the delete
//   withMember(role, acct)  a project where a pool account holds `role` — per-project roles are
//                           DATA the test grants, so no two tests or workers share a "viewer"
// Factories throw (with the response) when setup fails: a broken precondition is not the case's
// verdict, and the error makes that obvious in the report.
import { uniqueName } from './unique';
import type { Cleanup } from './cleanup';
import type { Project, ProjectInput, ProjectRole, ProjectsService } from '../services/projects.service';
import type { Session } from '../auth/session';

export class ProjectsFactory {
  constructor(
    private readonly asOwner: ProjectsService,
    private readonly cleanup: Cleanup,
  ) {}

  build(overrides: ProjectInput = {}): ProjectInput {
    return { name: uniqueName('project'), description: 'Created by the QA suite.', ...overrides };
  }

  async create(overrides: ProjectInput = {}): Promise<Project> {
    const res = await this.asOwner.create(this.build(overrides));
    if (res.status !== 201) throw new Error(`setup: create project → HTTP ${res.status} ${res.text}`);
    const project = res.body;
    this.cleanup.add(`project ${project.name}`, () => this.asOwner.remove(project.id));
    return project;
  }

  async withMember(role: ProjectRole, account: Session, overrides: ProjectInput = {}): Promise<Project> {
    if (!account.id) throw new Error(`setup: session ${account.key} has no account id — set AUTH_ID_PATH`);
    const project = await this.create(overrides);
    const res = await this.asOwner.setMember(project.id, account.id, role);
    if (res.status !== 200) throw new Error(`setup: grant ${role} to ${account.username} → HTTP ${res.status} ${res.text}`);
    return project;
  }
}
