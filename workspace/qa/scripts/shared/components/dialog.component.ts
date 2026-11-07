// dialog.component.ts — a modal dialog found by its accessible name. Components are the reusable
// parts of page objects (dialogs, tables, toasts, menus): written once, used by every page that
// shows one. Like page objects they act and expose locators; they never assert outcomes.
import type { Locator, Page } from '@playwright/test';

export class Dialog {
  readonly root: Locator;

  constructor(page: Page, name: string | RegExp) {
    this.root = page.getByRole('dialog', { name });
  }

  field(label: string | RegExp): Locator {
    return this.root.getByLabel(label);
  }

  /** the dialog's live error region (role=alert) */
  get error(): Locator {
    return this.root.getByRole('alert');
  }

  async fill(values: Record<string, string>): Promise<void> {
    for (const [label, value] of Object.entries(values)) await this.field(label).fill(value);
  }

  async press(button: string | RegExp): Promise<void> {
    await this.root.getByRole('button', { name: button }).click();
  }
}
