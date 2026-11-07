// projects.service.ts — one method per operation of the projects module, typed from the
// contract. Specs call these; e2e specs call them too, to seed state before driving the UI.
// A service never asserts and never cleans up — factories own lifecycles, specs own claims.
import type { ApiClient, ApiResponse } from '../http/api.client';
import { PROJECTS } from '../endpoints/projects.endpoints';

export type ProjectRole = 'admin' | 'member' | 'viewer';
export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  my_role: 'owner' | ProjectRole;
  member_count: number;
}
export interface ProjectInput {
  name?: unknown;
  description?: unknown;
  [extra: string]: unknown;
}
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  errors?: { field: string; code: string }[];
}

export class ProjectsService {
  constructor(private readonly api: ApiClient) {}

  list(params: { q?: string; limit?: number } = {}): Promise<ApiResponse<{ items: Project[]; total: number }>> {
    return this.api.get(PROJECTS.list, { params });
  }
  create(body: ProjectInput | unknown): Promise<ApiResponse<Project & Problem>> {
    return this.api.post(PROJECTS.list, { data: body });
  }
  get(id: string): Promise<ApiResponse<Project & Problem>> {
    return this.api.get(PROJECTS.byId(id));
  }
  /** `ifMatch` = the ETag from a GET; a stale one answers 409 (optimistic concurrency) */
  update(id: string, patch: ProjectInput, ifMatch?: string): Promise<ApiResponse<Project & Problem>> {
    return this.api.patch(PROJECTS.byId(id), { data: patch, headers: ifMatch ? { 'If-Match': ifMatch } : undefined });
  }
  remove(id: string): Promise<ApiResponse<Problem | undefined>> {
    return this.api.delete(PROJECTS.byId(id));
  }
  setMember(projectId: string, accountId: string, role: ProjectRole): Promise<ApiResponse<{ account_id: string; role: ProjectRole } & Problem>> {
    return this.api.put(PROJECTS.member(projectId, accountId), { data: { role } });
  }
  removeMember(projectId: string, accountId: string): Promise<ApiResponse<Problem | undefined>> {
    return this.api.delete(PROJECTS.member(projectId, accountId));
  }
}
