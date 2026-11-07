// Golden: the desktop platform's wiring. Tagged @platform:windows, so it runs only in the
// `desktop-electron` project (PW_PLATFORMS=windows or PW_PROJECTS=desktop-electron); the window
// comes from the electron fixture. Electron cannot be downloaded on every machine, so without
// ELECTRON_APP_PATH the fixture skips with that reason — reported ⛔ blocked, never ✅.
import { test, expect, caseMeta, expectNoHorizontalScroll } from '../../shared/fixtures';

test('TC-UI-PROJECTS-004 — [Projects · Windows] Main window — Owner opens the desktop build → window titled, no sideways scroll', caseMeta({
  id: 'TC-UI-PROJECTS-004', type: 'ui', module: 'projects', priority: 'P3', req: ['demo/REQ-001'], platform: ['windows'],
}), async ({ appWindow }) => {
  await test.step('Step 1: launch the build, take its first window → the window has a title', async () => {
    await expect(appWindow).toHaveTitle(/\S/);
  });

  await test.step('Step 2: measure the window → it does not scroll sideways', async () => {
    await expectNoHorizontalScroll(appWindow);
  });
});
