/**
 * platforms.mjs — the platform dimension (CONTRACTS §20, PROJECT-PROFILE §Platforms): WHERE a case
 * runs, orthogonal to its test type (WHAT it proves). One implementation shared by lint-qa.mjs,
 * run-plan-model.mjs and run-plan.mjs, so the linter and the runner never disagree about a platform.
 * The runtime twin for playwright.config.ts and specs is scripts/shared/config/platforms.ts —
 * tests/bundle.test.mjs asserts the two tables agree.
 *
 *   id        the token in `**Platform:**`, `@platform:<id>`, `select.platforms` (`other:<id>` allowed)
 *   label     what the case title shows: `[Orders · Web]`, `[Orders · Android, iOS]`
 *   kind      web | mobile | desktop | service | other
 *   runner    a key of lib/runners.mjs RUNNER_REGISTRY (playwright · maestro · appium-wdio · … — one entry adds one)
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUNNER_IDS, PLAYWRIGHT_ENGINE, handoffLine } from './runners.mjs';

export const KINDS = ['web', 'mobile', 'desktop', 'service', 'other'];
/** The runner vocabulary is the registry's (lib/runners.mjs) — one entry adds a runner everywhere. */
export const RUNNERS = RUNNER_IDS;
export const TIERS = ['gate', 'nightly', 'weekly'];
/** Runners this workspace executes itself (one `playwright test`); the rest are staged + handed off. */
export const PLAYWRIGHT_RUNNERS = PLAYWRIGHT_ENGINE;

/** Built-in platforms with their defaults. A profile row may override runner, targets and tier. */
export const BUILTIN = {
  web: { label: 'Web', kind: 'web', runner: 'playwright', targets: ['chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari'], tier: 'gate' },
  android: { label: 'Android', kind: 'mobile', runner: 'appium-wdio', targets: [], tier: 'gate' },
  ios: { label: 'iOS', kind: 'mobile', runner: 'appium-wdio', targets: [], tier: 'gate' },
  windows: { label: 'Windows', kind: 'desktop', runner: 'playwright-electron', targets: ['electron'], tier: 'nightly' },
  macos: { label: 'macOS', kind: 'desktop', runner: 'playwright-electron', targets: ['electron'], tier: 'weekly' },
  api: { label: 'API', kind: 'service', runner: 'playwright-request', targets: ['api'], tier: 'gate' },
};
export const PLATFORM_ID_RE = /^(web|android|ios|windows|macos|api|other:[a-z0-9]+(-[a-z0-9]+)*)$/;
export const PLATFORM_TAG_RE = /^@platform:(web|android|ios|windows|macos|api|other:[a-z0-9]+(-[a-z0-9]+)*)$/;

const titleCase = (s) => s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/** The label a title shows for a platform id (`other:kiosk-pos` → `Kiosk Pos`). */
export function platformLabel(id) {
  if (BUILTIN[id]) return BUILTIN[id].label;
  const m = /^other:(.+)$/.exec(id);
  return m ? titleCase(m[1]) : id;
}

/** Kind of a platform id (profile row first, then built-in; `other:*` → other). */
export function platformKind(id, profile) {
  return profile?.platforms?.get(id)?.kind ?? BUILTIN[id]?.kind ?? (id.startsWith('other:') ? 'other' : null);
}

/** Runner of a platform id (profile row first, then built-in; `other:*` → handoff). */
export function platformRunner(id, profile) {
  return profile?.platforms?.get(id)?.runner ?? BUILTIN[id]?.runner ?? (id.startsWith('other:') ? 'handoff' : null);
}

/** The platform(s) a case runs on when it does not say (one minor version of grace, CONTRACTS §20). */
export function defaultPlatforms(type) {
  if (type === 'mobile') return ['android', 'ios'];
  if (['api', 'integration', 'security', 'performance', 'unit', 'data'].includes(type)) return ['api'];
  return ['web']; // e2e · accessibility · ui
}

/**
 * Type ↔ platform compatibility (CONTRACTS §20). Returns { level: 'error'|'warn', msg } or null.
 *   mobile type            → android / ios only
 *   ui · e2e · accessibility → a UI platform (web · mobile · desktop · other), never api
 *   api · integration      → api; a UI platform only when the case is driven through that UI (warn)
 */
export function typePlatformProblem(type, id, profile) {
  const kind = platformKind(id, profile);
  if (type === 'mobile' && kind !== 'mobile') return { level: 'error', msg: `a mobile case runs on android or ios, not \`${id}\`` };
  if (['ui', 'e2e', 'accessibility'].includes(type) && kind === 'service') return { level: 'error', msg: `a ${type} case runs on a UI platform (web, android, ios, windows, macos, other:<id>), not \`${id}\`` };
  if (['api', 'integration'].includes(type) && kind !== 'service') return { level: 'warn', msg: `a ${type} case runs on \`api\`; \`${id}\` is right only when the case drives that UI — say how in ## Preconditions` };
  return null;
}

/** Parse `**Platform:** web, android` → { present, ids, malformed }. */
export function parsePlatformLine(text) {
  const m = /^\*\*Platform:\*\*\s*(.*)$/m.exec(text.replace(/\r\n?/g, '\n'));
  if (!m) return { present: false, ids: [], malformed: [] };
  const parts = m[1].replace(/<!--.*?(-->|$)/g, '').split(/\s*,\s*/).map((s) => s.replace(/`/g, '').trim()).filter(Boolean);
  return { present: true, ids: parts.filter((p) => PLATFORM_ID_RE.test(p)), malformed: parts.filter((p) => !PLATFORM_ID_RE.test(p)) };
}

/** Platform ids carried as `@platform:<id>` tags. */
export const platformTags = (tags) => tags.filter((t) => PLATFORM_TAG_RE.test(t)).map((t) => t.slice('@platform:'.length));

/**
 * A case's platforms: the header, else its tags, else the type default. `source` says which, so the
 * linter can warn on the inferred ones.
 */
export function casePlatforms(text, type, tags) {
  const line = parsePlatformLine(text);
  if (line.present && line.ids.length) return { ids: line.ids, source: 'header' };
  const fromTags = platformTags(tags);
  if (fromTags.length) return { ids: fromTags, source: 'tags' };
  return { ids: defaultPlatforms(type), source: 'default' };
}

/** `chromium (gate), firefox (nightly)` → [{ target, tier|null }] */
function parseTargets(cell) {
  return cell.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = /^`?([a-z0-9][a-z0-9-]*)`?\s*(?:\((gate|nightly|weekly)\))?/i.exec(s);
    return m ? { target: m[1].toLowerCase(), tier: m[2]?.toLowerCase() ?? null } : null;
  }).filter(Boolean);
}

export const PLATFORMS_COLUMNS = '| Platform | Kind | Runner | Targets | Tier | Enabled |';

/**
 * Parse a PROJECT-PROFILE text into { platforms: Map(id → row), legacy, problems }.
 * Row: { id, kind, runner, targets: [{target, tier}], tier, enabled }.
 * No `## Platforms` table → the legacy shape: `web` from §Browsers & devices and `api`, both enabled,
 * android/ios enabled when the `mobile` type is (`legacy: true` — accepted for one minor version).
 */
export function parsePlatforms(text, enabledTypes = []) {
  const src = text.replace(/\r\n?/g, '\n');
  const problems = [];
  const platforms = new Map();
  const sec = src.split(/^## /m).find((s) => s.startsWith('Platforms')) ?? null;
  if (sec !== null && sec.includes(PLATFORMS_COLUMNS)) {
    const after = sec.slice(sec.indexOf(PLATFORMS_COLUMNS)).split('\n').slice(1);
    for (const l of after) {
      const t = l.trim();
      if (!t.startsWith('|')) break;
      const c = t.split('|').slice(1, -1).map((x) => x.trim());
      if (c.every((x) => /^:?-+:?$/.test(x))) continue;
      if (c.length !== 6) { problems.push(`§Platforms row has ${c.length} cells (need 6): ${t.slice(0, 60)}`); continue; }
      const id = c[0].replace(/`/g, '').trim();
      if (!PLATFORM_ID_RE.test(id)) { problems.push(`§Platforms: \`${id}\` is not a platform id (web, android, ios, windows, macos, api, other:<id>)`); continue; }
      const kind = c[1].replace(/`/g, '').trim();
      const runner = c[2].replace(/`/g, '').trim();
      const tier = c[4].replace(/`/g, '').trim();
      if (!KINDS.includes(kind)) problems.push(`§Platforms ${id}: Kind \`${kind}\` not in ${KINDS.join(' | ')}`);
      if (!RUNNERS.includes(runner)) problems.push(`§Platforms ${id}: Runner \`${runner}\` not in ${RUNNERS.join(' | ')}`);
      if (id.startsWith('other:') && runner !== 'handoff') problems.push(`§Platforms ${id}: an other:<id> platform runs through \`handoff\` (cases designed, scripts staged with a HANDOFF.md, results ingested)`);
      if (!TIERS.includes(tier)) problems.push(`§Platforms ${id}: Tier \`${tier}\` not in gate | nightly | weekly`);
      platforms.set(id, { id, kind, runner, targets: parseTargets(c[3]), tier, enabled: /^yes\b/i.test(c[5].replace(/[`*]/g, '')) });
    }
    return { platforms, legacy: false, problems };
  }
  // Legacy profile: §Browsers & devices rows become the web targets.
  const browsers = src.split(/^## /m).find((s) => s.startsWith('Browsers & devices')) ?? '';
  const targets = [];
  for (const l of browsers.split('\n')) {
    const m = /^\|\s*`([a-z0-9-]+)`\s*\|[^|]*\|\s*(gate|nightly|weekly)\s*\|/i.exec(l.trim());
    if (m) targets.push({ target: m[1], tier: m[2].toLowerCase() });
  }
  platforms.set('web', { id: 'web', ...BUILTIN.web, targets: targets.length ? targets : [{ target: 'chromium', tier: 'gate' }], enabled: true });
  platforms.set('api', { id: 'api', ...BUILTIN.api, targets: [{ target: 'api', tier: 'gate' }], enabled: true });
  const mobile = enabledTypes.includes('mobile');
  for (const id of ['android', 'ios']) platforms.set(id, { id, ...BUILTIN[id], targets: [], enabled: mobile });
  return { platforms, legacy: true, problems };
}

/** The profile next to a QA root (same lookup order as build-state.mjs), with its platforms; null when absent. */
export function readPlatformProfile(root = '.') {
  const path = [join(root, '..', '.claude', 'PROJECT-PROFILE.md'), join(root, '..', 'PROJECT-PROFILE.md'), join(root, 'PROJECT-PROFILE.md')].find((p) => existsSync(p));
  if (!path) return null;
  const text = readFileSync(path, 'utf8');
  const sec = text.replace(/\r\n?/g, '\n').split(/^## /m).find((s) => s.startsWith('Test types')) ?? '';
  const types = [];
  for (const line of sec.split('\n')) {
    const m = /^\|\s*`?([a-z0-9]+)`?\s*\|\s*(yes|no)\s*\|/i.exec(line.trim());
    if (m && m[2].toLowerCase() === 'yes') types.push(m[1].toLowerCase());
  }
  return { path, types, ...parsePlatforms(text, types) };
}

/**
 * Playwright project names for a platform (CONTRACTS §20): web → `web-<target>`, an Electron desktop
 * platform → `desktop-electron`, api → `api`. Platforms on other runners have none (staged/handoff).
 */
export function projectsFor(id, profile, { webTargets } = {}) {
  const runner = platformRunner(id, profile);
  if (runner === 'playwright') {
    const row = profile?.platforms?.get(id);
    const targets = webTargets?.length ? webTargets : (row?.targets ?? []).filter((t) => (t.tier ?? row.tier) === 'gate').map((t) => t.target);
    return (targets.length ? targets : ['chromium']).map((t) => `web-${t}`);
  }
  if (runner === 'playwright-electron') return ['desktop-electron'];
  if (runner === 'playwright-request') return ['api'];
  return [];
}

/** Legacy browser names (`chromium`) and new project names (`web-chromium`) → the new names. */
export const toProjectName = (n) => (['chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari'].includes(n) ? `web-${n}` : n);

/** The command a staged / handed-off platform runs with (listed, never silently dropped). */
export function handoffCommand(id, runner) {
  return handoffLine(id, runner);
}
