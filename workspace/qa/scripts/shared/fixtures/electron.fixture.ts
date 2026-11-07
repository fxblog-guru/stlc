// electron.fixture.ts — the desktop platform's window, for Electron builds (PROJECT-PROFILE
// §Platforms: windows / macos rows with runner `playwright-electron`, project `desktop-electron`).
//   electronApp   the launched app (`_electron.launch`), closed after the test whatever happened
//   appWindow     its first window — the `page` of a desktop spec: page objects take it as-is
// The executable comes from ELECTRON_APP_PATH (the app repo's pipeline supplies the build — QA
// never builds the app); ELECTRON_APP_ARGS adds launch arguments (e.g. `main.js` for an unpacked
// app). Without ELECTRON_APP_PATH every desktop spec SKIPS with that reason — a declared skip is
// ⛔ blocked in the traceability table, never ✅ (CONTRACTS §19 Verdicts) and never a silent pass.
// Native (non-Electron) desktop apps run through Appium Windows/Mac2 drivers instead: their specs
// are staged and handed off like mobile (CONTRACTS §20), never through this fixture.
import { _electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { test as base } from './ui.fixture';

export const ELECTRON_SKIP_REASON = 'ELECTRON_APP_PATH is not set — the desktop build is supplied by the app pipeline (PROJECT-PROFILE §Platforms)';

export interface ElectronFixtures {
  electronApp: ElectronApplication;
  appWindow: Page;
}

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use, testInfo) => {
    const executablePath = process.env.ELECTRON_APP_PATH;
    testInfo.skip(!executablePath, ELECTRON_SKIP_REASON);
    const args = (process.env.ELECTRON_APP_ARGS ?? '').split(' ').filter(Boolean);
    const env = { ...process.env } as Record<string, string>;
    delete env.ELECTRON_RUN_AS_NODE; // VS Code's extension host leaks it; the app would start as plain Node
    const app = await _electron.launch({ executablePath, args, env });
    await use(app);
    await app.close();
  },
  appWindow: async ({ electronApp }, use) => {
    const win = await electronApp.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await use(win);
  },
});

export { expect } from './base.fixture';
