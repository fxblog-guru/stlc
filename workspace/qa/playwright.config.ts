import { defineConfig, devices } from '@playwright/test';
import type { Project } from '@playwright/test';
import * as dotenv from 'dotenv';
import { selectPlatforms, DESKTOP_ELECTRON_PROJECT } from './scripts/shared/config/platforms';
import type { WebTarget } from './scripts/shared/config/platforms';

// /qa-run passes --env <env>; the runner loads <qa-root>/.env.<env> (default: uat). Values are read and
// validated in scripts/shared/config/env.ts; this file only shapes the run.
dotenv.config({ path: `.env.${process.env.QA_ENV ?? 'uat'}`, quiet: true });

// executing-tests exports RUN_DIR=runs/<type>/<slug>/<run-id> so traces, screenshots, the HTML
// report, junit.xml and results.json land INSIDE the run's evidence folder (the per-run contract
// that reporting-results and reporting-defects cite). Ad-hoc runs fall back to runs/_adhoc.
const runDir = process.env.RUN_DIR ?? 'runs/_adhoc';
const IS_CI = !!process.env.CI;
const AUTH = `.auth/${process.env.QA_ENV ?? 'uat'}`;

// Projects are named per PLATFORM + target (CONTRACTS §20, PROJECT-PROFILE §Platforms):
//   web-<target>       the web platform on one browser target (web-chromium, web-firefox, web-webkit,
//                      web-mobile-chrome, web-mobile-safari) — e2e · accessibility · ui specs tagged @platform:web
//   desktop-electron   windows / macos rows whose runner is playwright-electron — the same tiers,
//                      specs tagged @platform:windows|macos, launched from ELECTRON_APP_PATH
//   api                the HTTP tiers (api · integration · security specs), once, browserless
// PW_PLATFORMS=web,api,windows picks platforms; PW_PROJECTS=chromium,firefox (legacy names) or
// web-chromium,desktop-electron picks targets (kept as the alias). Default: web-chromium + api.
// android / ios / other:<id> never run here — they are staged and handed off (CONTRACTS §15, §20).
// PW_CHANNEL=msedge|chrome runs the chromium target on an installed browser instead of the
// downloaded build (managed machines that block browser downloads; real-browser spot checks).
const channel = process.env.PW_CHANNEL || undefined;
const WEB: Record<WebTarget, Project['use']> = {
  chromium: { ...devices['Desktop Chrome'], channel },
  firefox: { ...devices['Desktop Firefox'] },
  webkit: { ...devices['Desktop Safari'] },
  'mobile-chrome': { ...devices['Pixel 7'] },
  'mobile-safari': { ...devices['iPhone 14'] },
};
const selection = selectPlatforms();
const BROWSER_TIERS = /scripts[\\/](e2e|accessibility|ui)[\\/].*\.spec\.ts$/;
const HTTP_TIERS = /scripts[\\/](api|integration|security)[\\/].*\.spec\.ts$/;
// A browser-tier test belongs to web unless it names only other platforms; a desktop test names windows or macos.
const WEB_GREP = /@platform:web\b|^(?!.*@platform:)/;
const DESKTOP_GREP = /@platform:(windows|macos)\b/;

export default defineConfig({
  testDir: './scripts',
  // unit + mobile specs belong to other runners (their repos' own frameworks); performance is k6.
  testIgnore: ['**/unit/**', '**/mobile/**', '**/performance/**', '**/shared/**'],
  timeout: 60_000,
  // Visual baselines (the `ui` type, generating-ui-script): one folder per OS ({platform} =
  // process.platform: the CI image's `linux` baselines are the truth; a local Windows run writes
  // `win32` beside them, never over them), per project (web-chromium, desktop-electron …), per spec.
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{projectName}/{testFilePath}/{arg}{ext}',
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      // PROJECT-PROFILE §UI testing → UI_MAX_DIFF_PIXEL_RATIO (default 0.01)
      maxDiffPixelRatio: Number(process.env.UI_MAX_DIFF_PIXEL_RATIO ?? 0.01),
    },
  },
  // Deliberately 0: a pass-on-retry is a FLAKY triage (CONTRACTS §5) that executing-tests records
  // by re-running ONCE itself. Runner-level retries would hide exactly the evidence /qa-quarantine needs.
  retries: 0,
  forbidOnly: IS_CI,
  failOnFlakyTests: IS_CI,
  // Every test is independent (own data via factories, own accounts via the pool), so tests — not
  // files — are the unit of parallelism and of sharding: shards balance by test count.
  fullyParallel: true,
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : IS_CI ? '50%' : undefined,
  // The report carries the commit it ran against — the dev bundle's deploy gate compares it with
  // the shipped SHA (CONTRACTS §16).
  captureGitInfo: { commit: true },
  outputDir: `${runDir}/test-results`,
  // CI shards write blob reports; the merge job turns them into one html + junit (<qa-root>/ci/).
  reporter: IS_CI && process.env.PW_BLOB === '1'
    ? [['blob', { outputDir: `${runDir}/blob` }], ['list']]
    : [
        ['list'],
        ['html', { outputFolder: `${runDir}/html-report`, open: 'never' }],
        ['junit', { outputFile: `${runDir}/junit.xml` }],
        ['json', { outputFile: `${runDir}/results.json` }],
      ],
  use: {
    baseURL: process.env.BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // PW_VIDEO=off where ffmpeg cannot be installed; traces already carry a screencast
    video: process.env.PW_VIDEO === 'off' ? 'off' : 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // <qa-root>/docs/element-registry.md declares the app's test-id attribute; keep both in sync.
    testIdAttribute: process.env.TEST_ID_ATTRIBUTE ?? 'data-testid',
  },
  projects: [
    // Validates the env and signs every actor in once, over the API (scripts/setup/auth.setup.ts).
    { name: 'setup', testDir: './scripts/setup', testMatch: /.*\.setup\.ts$/, testIgnore: [] },
    { name: 'api', testMatch: HTTP_TIERS, dependencies: ['setup'], metadata: { platform: 'api' } },
    ...(selection.platforms.includes('web') ? selection.webTargets : []).map((t) => ({
      name: `web-${t}`,
      testMatch: BROWSER_TIERS,
      grep: WEB_GREP,
      dependencies: ['setup'],
      metadata: { platform: 'web', target: t },
      use: { ...WEB[t], storageState: `${AUTH}/default.state.json` },
    })),
    // Electron builds of the desktop platforms: the window comes from the electron fixture
    // (scripts/shared/fixtures/electron.fixture.ts, ELECTRON_APP_PATH), not from a browser.
    ...(selection.desktopElectron
      ? [{ name: DESKTOP_ELECTRON_PROJECT, testMatch: BROWSER_TIERS, grep: DESKTOP_GREP, dependencies: ['setup'], metadata: { platform: 'desktop', runner: 'playwright-electron' } }]
      : []),
  ],
});
