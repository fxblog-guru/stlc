// platforms.ts — the platform dimension at run time (CONTRACTS §20, PROJECT-PROFILE §Platforms).
// A platform is WHERE a case runs (web, android, ios, windows, macos, api, other:<id>); the test
// type is WHAT it proves. playwright.config.ts builds its projects from here; caseMeta() tags every
// test `@platform:<id>`. The linter's twin is scripts/shared/lib/platforms.mjs — the bundle test
// asserts both tables agree.

export type PlatformKind = 'web' | 'mobile' | 'desktop' | 'service' | 'other';
export type PlatformRunner = 'playwright' | 'playwright-request' | 'playwright-electron' | 'maestro' | 'appium-wdio' | 'appium-desktop' | 'handoff';
export type BuiltinPlatform = 'web' | 'android' | 'ios' | 'windows' | 'macos' | 'api';
/** a built-in id or `other:<kebab-id>` */
export type PlatformId = BuiltinPlatform | `other:${string}`;

export const PLATFORMS: Record<BuiltinPlatform, { label: string; kind: PlatformKind; runner: PlatformRunner }> = {
  web: { label: 'Web', kind: 'web', runner: 'playwright' },
  android: { label: 'Android', kind: 'mobile', runner: 'appium-wdio' },
  ios: { label: 'iOS', kind: 'mobile', runner: 'appium-wdio' },
  windows: { label: 'Windows', kind: 'desktop', runner: 'playwright-electron' },
  macos: { label: 'macOS', kind: 'desktop', runner: 'playwright-electron' },
  api: { label: 'API', kind: 'service', runner: 'playwright-request' },
};

/** Web targets = Playwright browser projects, named `web-<target>`. */
export const WEB_TARGETS = ['chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari'] as const;
export type WebTarget = (typeof WEB_TARGETS)[number];

/** The Playwright project that runs Electron desktop builds (windows / macos rows on playwright-electron). */
export const DESKTOP_ELECTRON_PROJECT = 'desktop-electron';

/** The platforms a case runs on when its caseMeta() does not say (CONTRACTS §20 defaults). */
export function defaultPlatforms(type: string): PlatformId[] {
  if (type === 'mobile') return ['android', 'ios'];
  if (['api', 'integration', 'security', 'performance', 'unit'].includes(type)) return ['api'];
  return ['web'];
}

export interface PlatformSelection {
  /** platforms this run covers (PW_PLATFORMS, default web,api) */
  platforms: string[];
  /** web targets (from PW_PROJECTS: `chromium` or `web-chromium`), default chromium */
  webTargets: WebTarget[];
  /** whether the desktop-electron project is part of this run */
  desktopElectron: boolean;
}

/**
 * Read PW_PLATFORMS + PW_PROJECTS (the legacy alias) into one selection. Throws on an unknown name,
 * so a typo stops the run in the first second instead of silently running nothing.
 *   PW_PLATFORMS=web,api,windows        (§Platforms ids; `other:*` and mobile ids run elsewhere)
 *   PW_PROJECTS=chromium,firefox         (legacy browser names) or web-chromium,desktop-electron,api
 */
export function selectPlatforms(env: NodeJS.ProcessEnv = process.env): PlatformSelection {
  const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const platforms = list(env.PW_PLATFORMS);
  const projects = list(env.PW_PROJECTS);
  const webTargets: WebTarget[] = [];
  let desktopElectron = false;
  const unknown: string[] = [];
  for (const p of projects) {
    const name = (WEB_TARGETS as readonly string[]).includes(p) ? `web-${p}` : p;
    if (name.startsWith('web-') && (WEB_TARGETS as readonly string[]).includes(name.slice(4))) webTargets.push(name.slice(4) as WebTarget);
    else if (name === DESKTOP_ELECTRON_PROJECT) desktopElectron = true;
    else if (name === 'api' || name === 'setup') continue;
    else unknown.push(p);
  }
  for (const p of platforms) {
    if (!/^(web|android|ios|windows|macos|api|other:[a-z0-9]+(-[a-z0-9]+)*)$/.test(p)) unknown.push(`platform ${p}`);
    if (p === 'windows' || p === 'macos') desktopElectron = desktopElectron || (env[`PW_RUNNER_${p.toUpperCase()}`] ?? 'playwright-electron') === 'playwright-electron';
  }
  if (unknown.length) {
    throw new Error(`PW_PLATFORMS / PW_PROJECTS name unknown value(s): ${unknown.join(', ')} — platforms: web, android, ios, windows, macos, api, other:<id>; projects: ${WEB_TARGETS.map((t) => `web-${t}`).join(', ')}, ${DESKTOP_ELECTRON_PROJECT}, api (legacy: ${WEB_TARGETS.join(', ')})`);
  }
  return {
    platforms: platforms.length ? platforms : ['web', 'api', ...(desktopElectron ? ['windows'] : [])],
    webTargets: webTargets.length ? webTargets : ['chromium'],
    desktopElectron,
  };
}
