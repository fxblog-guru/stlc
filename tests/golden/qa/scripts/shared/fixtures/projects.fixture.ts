// projects.fixture.ts — the projects module's domain fixtures, merged into fixtures/index.ts:
//   projects          ProjectsService as TEST_USER
//   projectsAs        projectsAs(actor | client) → ProjectsService for a pool or named actor, or over
//                     a client variant (anonymous, client.withoutCsrf()) for the negative axes
//   projectsFactory   creates projects (as the Owner) that the cleanup ledger deletes
//   projectsPage      the Projects page object on the default `page`
//   projectsPageAs    projectsPageAs(actor) → the Projects page object in that actor's own browser context
//   projectTabs       projectTabs(n) → n project-detail page objects on n TABS of the default page's
//                     context (same user, same session) — the two-tabs / stale-write risk class
import { test as ui } from './ui.fixture';
import { ProjectsService } from '../services/projects.service';
import { ProjectsFactory } from '../data/projects.factory';
import { ProjectsPage } from '../pages/projects/projects.page';
import { ProjectDetailPage } from '../pages/projects/project-detail.page';
import type { Session } from '../auth/session';
import { ApiClient } from '../http/api.client';

export const projectsFixtures = ui.extend<{
  projects: ProjectsService;
  projectsAs: (s: Session | string | ApiClient) => Promise<ProjectsService>;
  projectsFactory: ProjectsFactory;
  projectsPage: ProjectsPage;
  projectsPageAs: (s: Session | string) => Promise<ProjectsPage>;
  projectTabs: (count: number) => Promise<ProjectDetailPage[]>;
}>({
  projects: async ({ api }, use) => use(new ProjectsService(api)),
  projectsAs: async ({ as }, use) => use(async (s) => new ProjectsService(s instanceof ApiClient ? s : await as(s))),
  projectsFactory: async ({ as, cleanup }, use) => use(new ProjectsFactory(new ProjectsService(await as('owner')), cleanup)),
  projectsPage: async ({ page }, use) => use(new ProjectsPage(page)),
  projectsPageAs: async ({ pageAs }, use) => use(async (s) => new ProjectsPage(await pageAs(s))),
  projectTabs: async ({ page }, use) =>
    use(async (count) => {
      const tabs = [page];
      while (tabs.length < count) tabs.push(await page.context().newPage());
      return tabs.map((p) => new ProjectDetailPage(p));
    }),
});
