// data-table.component.ts — a table found by its accessible name, read by column header text so
// a spec says `table.cell('Acme', 'Your role')`, never `tr:nth-child(3) td:nth-child(2)`.
import type { Locator, Page } from '@playwright/test';

export class DataTable {
  readonly root: Locator;

  constructor(page: Page, name: string | RegExp) {
    this.root = page.getByRole('table', { name });
  }

  /** the body row whose text contains `key` (a unique name, typically) */
  row(key: string | RegExp): Locator {
    return this.root.getByRole('row').filter({ hasText: key });
  }

  /** the cell of `row` under the column headed `column` */
  async cell(key: string | RegExp, column: string): Promise<Locator> {
    const headers = await this.root.getByRole('columnheader').allTextContents();
    const index = headers.findIndex((h) => h.trim() === column);
    if (index < 0) throw new Error(`no column "${column}" (columns: ${headers.join(', ')})`);
    return this.row(key).getByRole('cell').nth(index);
  }

  /** a link inside the row — the usual way into a detail page */
  link(key: string | RegExp): Locator {
    return this.row(key).getByRole('link', { name: key });
  }
}
