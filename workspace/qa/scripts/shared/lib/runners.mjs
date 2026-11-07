/**
 * runners.mjs — the runner registry (CONTRACTS §20 Runner, PROJECT-PROFILE §Platforms Runner column).
 * A runner is HOW a platform's cases execute; the platform is WHERE, the type is WHAT. Every runner
 * the bundle knows is one entry below, and nothing else in the bundle names a runner by hand:
 * lib/platforms.mjs takes its vocabulary from here, run-plan-model.mjs routes cases with it, and
 * run-plan.mjs runs, prints and judges each runner through it.
 *
 *   engine     playwright  one `playwright test` for every case on these runners (projects per platform)
 *              wrapper     a script under <qa-root>/scripts/ that runs one platform's cases and writes the
 *                          results contract below (Maestro today; Selenium, Cypress, Detox … later)
 *              handoff     staged here, run by another repo's runner; results come back via /qa-ingest
 *   language   what the case's script is written in — a reader picking a runner sees it at once
 *   types      the test types it runs; ext: the case script's extension (scripts mirror cases 1:1)
 *
 * ── Adding a runner (e.g. Selenium + Java for web e2e) ────────────────────────────────────────────
 *   1. An entry here: engine `wrapper`, `types`, `ext`, `wrapper` path, `evidence` folder, `idPattern`.
 *   2. The wrapper script. Called as `node <wrapper> --platform <id> --env <env> --cases <id,…>` with
 *      RUN_DIR set, it writes `<RUN_DIR>/<platform>/results.json`:
 *        { "exit": <n>, "noReport": <bool>, "unmapped": [<test names>],
 *          "cases": { "<Case ID>": { "pass": n, "fail": n, "skip": n, "message": <string|null> } } }
 *      lib/junit.mjs turns any JUnit XML into `cases` by the Case ID at the start of the test name.
 *   3. The id in config/platforms.ts `PlatformRunner` (the bundle test asserts the two agree).
 *   4. Its shipped kit under scripts/shared/<runner>/ and a reference in the generating skill.
 *   5. Optional static rules: lib/<runner>.mjs, called from lint-qa.mjs §3 for its `ext`.
 * Routing, the dry run, the run, the verdicts, the write-back and the summary need no change.
 */

/** @typedef {{ label: string, engine: 'playwright'|'wrapper'|'handoff', language: string, types?: string[], ext?: string,
 *    wrapper?: string, evidence?: string, idPattern?: RegExp, noScript?: string, handoff?: (platform: string) => string }} Runner */

/** @type {Record<string, Runner>} */
export const RUNNER_REGISTRY = {
  playwright: { label: 'Playwright (browser)', engine: 'playwright', language: 'TypeScript' },
  'playwright-request': { label: 'Playwright (HTTP)', engine: 'playwright', language: 'TypeScript' },
  'playwright-electron': { label: 'Playwright (Electron)', engine: 'playwright', language: 'TypeScript' },
  maestro: {
    label: 'Maestro', engine: 'wrapper', language: 'YAML',
    types: ['mobile'], ext: '.yaml',
    wrapper: 'scripts/mobile/run-maestro.mjs', evidence: 'mobile',
    idPattern: /^(TC-MOB-[A-Z0-9-]+?-\d{3})\b/,
    noScript: 'no Maestro flow yet (only a staged spec) — /qa-script --type mobile writes scripts/mobile/<module>/<case>.yaml, then it runs here',
  },
  'appium-wdio': {
    label: 'Appium + WebdriverIO', engine: 'handoff', language: 'TypeScript',
    handoff: (id) => `npm run test:mobile -- --platform ${id} (CONTRACTS §15 — the mobile framework repo runs it)`,
  },
  'appium-desktop': {
    label: 'Appium desktop', engine: 'handoff', language: 'TypeScript',
    handoff: (id) => `the desktop automation repo's Appium ${id === 'macos' ? 'Mac2' : 'Windows'} driver run (staged under <qa-root>/scripts/<type>/, HANDOFF.md) — results via /qa-ingest`,
  },
  handoff: {
    label: 'Handoff', engine: 'handoff', language: 'any',
    handoff: (id) => `the ${id} team's own runner (staged under <qa-root>/scripts/<type>/, HANDOFF.md) — results via /qa-ingest`,
  },
};

export const RUNNER_IDS = Object.keys(RUNNER_REGISTRY);
const byEngine = (e) => RUNNER_IDS.filter((id) => RUNNER_REGISTRY[id].engine === e);
/** Runners whose cases this workspace runs in one `playwright test`. */
export const PLAYWRIGHT_ENGINE = byEngine('playwright');
/** Runners this workspace runs itself through a wrapper script, one platform at a time. */
export const WRAPPER_ENGINE = byEngine('wrapper');

export const runnerOf = (id) => RUNNER_REGISTRY[id] ?? null;
export const runnerLabel = (id) => RUNNER_REGISTRY[id]?.label ?? id;

/** The wrapper runner `id` when it runs `type` — else null (a Playwright or handoff runner, or another type). */
export function wrapperFor(id, type) {
  const r = RUNNER_REGISTRY[id];
  return r?.engine === 'wrapper' && r.types.includes(type) ? r : null;
}

/** Extensions the wrapper runners add to a type's mirrored scripts (`.yaml` for mobile). */
export const wrapperExts = (type) => [...new Set(WRAPPER_ENGINE.map((id) => RUNNER_REGISTRY[id]).filter((r) => r.types.includes(type)).map((r) => r.ext))];

/** The line a platform on a runner prints when its case cannot run here (listed, never dropped). */
export function handoffLine(platform, id) {
  const r = RUNNER_REGISTRY[id];
  if (r?.engine === 'wrapper') return r.noScript ?? `no ${r.label} script for this case yet — /qa-script writes it, then it runs here`;
  return (r?.handoff ?? RUNNER_REGISTRY.handoff.handoff)(platform);
}

/** The command a run plan uses for one wrapper run. */
export function wrapperCommand(id, platform, env, ids) {
  return ['node', RUNNER_REGISTRY[id].wrapper, '--platform', platform, '--env', env, '--cases', ids.join(',')];
}
