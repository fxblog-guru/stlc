// projects.endpoints.ts — the ONLY place the projects module's URL paths are written.
export const PROJECTS = {
  list: '/projects',
  byId: (id: string) => `/projects/${id}`,
  member: (projectId: string, accountId: string) => `/projects/${projectId}/members/${accountId}`,
} as const;
