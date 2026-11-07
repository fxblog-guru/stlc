// project-detail.page.ts — one project's page: its heading and the rename form. Actions only; the
// spec makes every claim. Two instances on two tabs of one browser context are how a spec plays
// "the same user in two tabs" (UI risk class: stale write).
import type { Locator } from '@playwright/test';
import { BasePage } from '../base.page';

export class ProjectDetailPage extends BasePage {
  path = '/projects';
  readonly urlPattern = /\/projects\/[0-9a-f-]{36}$/;

  protected anchor(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  /** open project `id` directly (deep link) */
  async openById(id: string): Promise<void> {
    this.path = `/projects/${id}`;
    await this.goto();
  }

  get heading(): Locator {
    return this.anchor();
  }

  get nameField(): Locator {
    return this.byLabel('New name');
  }

  get saveButton(): Locator {
    return this.byRole('button', 'Save');
  }

  /** the form's error region (role=alert) */
  get error(): Locator {
    return this.page.getByRole('form', { name: 'Rename project' }).getByRole('alert');
  }

  /** the form's status line (role=status), "Saved." after a save */
  get status(): Locator {
    return this.page.getByRole('form', { name: 'Rename project' }).getByRole('status');
  }

  async rename(name: string): Promise<void> {
    await this.nameField.fill(name);
    await this.saveButton.click();
  }
}
