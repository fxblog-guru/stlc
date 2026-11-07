// projects.page.ts — the Projects list screen. Locators come from the element registry's order:
// test id → role + accessible name → label. Actions only; the spec makes every claim.
import type { Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import { DataTable } from '../../components/data-table.component';
import { Dialog } from '../../components/dialog.component';

export class ProjectsPage extends BasePage {
  readonly path = '/projects';
  readonly urlPattern = /\/projects(\?|$)/;
  readonly table = new DataTable(this.page, 'Projects');
  readonly newProjectDialog = new Dialog(this.page, 'New project');

  protected anchor(): Locator {
    return this.byRole('heading', 'Projects');
  }

  get newProjectButton(): Locator {
    return this.byRole('button', 'New project');
  }

  /** the project-name links — unique per run, so a visual baseline masks them */
  get projectLinks(): Locator {
    return this.table.root.getByRole('link');
  }

  /** "Signed in as …" in the header — differs per pool account, masked in a baseline */
  get signedInAs(): Locator {
    return this.page.getByText(/^Signed in as /);
  }

  /** the New project dialog's submit button */
  get createButton(): Locator {
    return this.newProjectDialog.root.getByRole('button', { name: 'Create' });
  }

  get count(): Locator {
    return this.page.getByText(/^\d+ projects?$/);
  }

  async createProject(name: string, description = ''): Promise<void> {
    await this.newProjectButton.click();
    await this.newProjectDialog.fill({ Name: name, Description: description });
    await this.newProjectDialog.press('Create');
  }

  /** the page heading — after `open(name)` it is the project's name */
  heading(name: string | RegExp): Locator {
    return this.byRole('heading', name);
  }

  async open(name: string): Promise<void> {
    await this.table.link(name).click();
  }
}
