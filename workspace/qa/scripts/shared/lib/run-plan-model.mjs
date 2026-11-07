/**
 * run-plan-model.mjs — the run-plan file (CONTRACTS §19): parse, validate, resolve.
 *
 * One implementation shared by `run-plan.mjs` (resolve · run · list · standard) and `lint-qa.mjs`
 * (front-matter checks), so the linter and the runner can never disagree about what a plan selects.
 *
 * A run plan is `<qa-root>/run-plans/<name>.md`: YAML front matter (a small subset — scalars, inline
 * `[a, b]` lists, `- item` lists, and one level of nested maps under `select:` / `include:` /
 * `exclude:`) + a body whose `## Resolved cases` table is written by `run-plan.mjs resolve`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { casePlatforms, platformRunner, PLATFORM_ID_RE, PLAYWRIGHT_RUNNERS, readPlatformProfile } from './platforms.mjs';
import { wrapperFor, wrapperExts } from './runners.mjs';
import { CASE_ID_RE, CASE_FILE_RE, STEM_TYPE } from './types.mjs';

export const RUN_PLAN_DIR = 'run-plans';
export const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export { CASE_ID_RE };
export const TOP_KEYS = ['name', 'description', 'env', 'owner', 'select', 'include', 'exclude', 'browsers', 'workers', 'shards', 'retries'];
export const SELECT_KEYS = ['features', 'types', 'modules', 'priorities', 'suites', 'tags', 'cases', 'platforms'];
export const EXCLUDE_KEYS = [...SELECT_KEYS, 'quarantined'];
/** Types a run plan can run (the Playwright tiers, k6 and ZAP). unit/mobile/data run in their own repos. */
export const RUNNABLE_TYPES = ['api', 'integration', 'e2e', 'security', 'performance', 'accessibility', 'ui'];
export const OTHER_RUNNER_TYPES = ['unit', 'mobile', 'data'];
export const TYPE_ORDER = [...RUNNABLE_TYPES, ...OTHER_RUNNER_TYPES];
export const BROWSERS = ['chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari'];
/** `browsers:` also takes the platform-named projects (CONTRACTS §20): web-<target>, desktop-electron. */
export const PROJECT_NAMES = [...BROWSERS, ...BROWSERS.map((b) => `web-${b}`), 'desktop-electron'];
const TRACE_HEADING = '## Traceability (Requirement ↔ Case)';
const TRACE_COLUMNS = '| Req | Case ID | Type | Module | Priority | Scripted | Last run | Status | Report |';
export const RESOLVED_HEADING = '## Resolved cases';
export const RESOLVED_COLUMNS = '| Case ID | Type | Platform | Module | Priority | Feature | Script |';
/** The 1.0 header (no Platform column) — still read, for one minor version (CONTRACTS §19, §20). */
export const RESOLVED_COLUMNS_LEGACY = '| Case ID | Type | Module | Priority | Feature | Script |';

const norm = (t) => t.replace(/\r\n?/g, '\n');
const read = (p) => norm(readFileSync(p, 'utf8'));
function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name).replace(/\\/g, '/');
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

// ── Front matter ────────────────────────────────────────────────────────────

function scalar(v) {
  const s = v.trim().replace(/\s+#.*$/, '');
  if (s === '' || s === '~' || s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    return inner ? inner.split(',').map((x) => scalar(x)).filter((x) => x !== null) : [];
  }
  if (/^".*"$/.test(s) || /^'.*'$/.test(s)) return s.slice(1, -1);
  return s;
}

/**
 * Split a run-plan file into { fm, body, problems }. `problems` are lines the subset cannot read —
 * reported by the linter, never guessed at.
 */
export function parseRunPlan(text) {
  const src = norm(text);
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (!m) return { fm: null, body: src, problems: ['no YAML front matter (--- … ---)'] };
  const fm = {};
  const problems = [];
  let top = null; // current top-level key whose value is a block
  let sub = null; // current nested key whose value is a `- item` list
  for (const raw of m[1].split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    if (indent === 0) {
      const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
      if (!kv) { problems.push(`unreadable line \`${line}\``); top = null; continue; }
      sub = null;
      if (kv[2].trim() === '') { fm[kv[1]] = null; top = kv[1]; } else { fm[kv[1]] = scalar(kv[2]); top = null; }
      continue;
    }
    if (!top) { problems.push(`indented line outside a block: \`${line}\``); continue; }
    const item = /^-\s+(.*)$/.exec(line);
    if (item) {
      if (sub && fm[top] && typeof fm[top] === 'object' && !Array.isArray(fm[top])) {
        if (!Array.isArray(fm[top][sub])) fm[top][sub] = [];
        fm[top][sub].push(scalar(item[1]));
      } else {
        if (!Array.isArray(fm[top])) fm[top] = [];
        fm[top].push(scalar(item[1]));
      }
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) { problems.push(`unreadable line \`${line}\``); continue; }
    if (fm[top] === null || typeof fm[top] !== 'object' || Array.isArray(fm[top])) fm[top] = {};
    if (kv[2].trim() === '') { fm[top][kv[1]] = []; sub = kv[1]; } else { fm[top][kv[1]] = scalar(kv[2]); sub = null; }
  }
  return { fm, body: src.slice(m[0].length), problems };
}

const asList = (v) => (v === null || v === undefined ? [] : Array.isArray(v) ? v.map(String) : [String(v)]);
const normTag = (t) => (t.startsWith('@') ? t : `@${t}`);

/**
 * Validate a parsed plan. `ctx`:
 *   fileName        the file's basename without .md (the name must equal it)
 *   caseInfo(id)    → null when no case file exists, else { deprecated: bool }
 *   hasPlan(slug)   → whether plans/<slug>/ holds a test plan
 * Returns { errors: [], warnings: [] } — messages without the path prefix.
 */
export function validateRunPlan(parsed, ctx) {
  const errors = [...parsed.problems];
  const warnings = [];
  const fm = parsed.fm;
  if (!fm) return { errors, warnings };
  for (const k of Object.keys(fm)) if (!TOP_KEYS.includes(k)) errors.push(`unknown front-matter key \`${k}\` (allowed: ${TOP_KEYS.join(', ')}) (CONTRACTS §19)`);
  if (!fm.name || !NAME_RE.test(String(fm.name))) errors.push(`\`name\` \`${fm.name ?? ''}\` is not lowercase-kebab (CONTRACTS §19)`);
  else if (ctx.fileName && fm.name !== ctx.fileName) errors.push(`\`name: ${fm.name}\` differs from the file name \`${ctx.fileName}.md\``);
  if (!fm.description || typeof fm.description !== 'string') errors.push('`description` is missing — say what the plan is for and when it runs');
  if (fm.env !== undefined && fm.env !== null && !NAME_RE.test(String(fm.env))) errors.push(`\`env\` \`${fm.env}\` is not an environment name`);
  if (fm.retries !== undefined && fm.retries !== 0) errors.push(`\`retries: ${fm.retries}\` — must be 0: a pass-on-retry is a FLAKY triage, never a pass (CONTRACTS §5, §19)`);
  if (fm.workers !== undefined && fm.workers !== null && !(Number.isInteger(fm.workers) && fm.workers > 0)) errors.push(`\`workers\` \`${fm.workers}\` is not a positive integer`);
  if (fm.shards !== undefined && fm.shards !== null && !(Number.isInteger(fm.shards) && fm.shards >= 1 && fm.shards <= 50)) errors.push(`\`shards\` \`${fm.shards}\` is not an integer 1–50`);
  for (const b of asList(fm.browsers)) if (!PROJECT_NAMES.includes(b)) errors.push(`\`browsers\`: \`${b}\` is not a Playwright project (${PROJECT_NAMES.join(', ')})`);

  const groups = [['select', fm.select, SELECT_KEYS], ['include', fm.include, SELECT_KEYS], ['exclude', fm.exclude, EXCLUDE_KEYS]];
  if (!fm.select || typeof fm.select !== 'object' || Array.isArray(fm.select) || Object.keys(fm.select).length === 0) {
    errors.push('`select:` is missing or empty — a run plan names what it runs (for everything: `types: [api, integration, e2e, security, performance, accessibility]`)');
  }
  for (const [g, val, keys] of groups) {
    if (val === undefined || val === null) continue;
    if (typeof val !== 'object' || Array.isArray(val)) { errors.push(`\`${g}:\` must be a map of ${keys.join(' / ')}`); continue; }
    for (const [k, v] of Object.entries(val)) {
      if (!keys.includes(k)) { errors.push(`unknown key \`${g}.${k}\` (allowed: ${keys.join(', ')})`); continue; }
      if (k === 'quarantined') { if (typeof v !== 'boolean') errors.push('`exclude.quarantined` must be true or false'); continue; }
      const list = asList(v);
      for (const x of list) {
        if (k === 'types' && OTHER_RUNNER_TYPES.includes(x) && g !== 'exclude' && !(x === 'mobile' && asList(val.platforms).some((p) => p === 'android' || p === 'ios'))) errors.push(`\`${g}.types\`: \`${x}\` runs in its own repo — use /qa-run --type ${x}, not a run plan${x === 'mobile' ? ' (or name `platforms: [android, ios]` to list it as handoff)' : ''} (CONTRACTS §19, §20)`);
        else if (k === 'types' && !TYPE_ORDER.includes(x)) errors.push(`\`${g}.types\`: \`${x}\` is not a test type`);
        if (k === 'priorities' && !/^P[0-3]$/.test(x)) errors.push(`\`${g}.priorities\`: \`${x}\` is not P0–P3`);
        if (k === 'suites' && !['smoke', 'regression'].includes(x)) errors.push(`\`${g}.suites\`: \`${x}\` is not smoke | regression`);
        if (k === 'platforms' && !PLATFORM_ID_RE.test(x)) errors.push(`\`${g}.platforms\`: \`${x}\` is not a platform id (web, android, ios, windows, macos, api, other:<id>) (CONTRACTS §20)`);
        else if (k === 'platforms' && ctx.platformEnabled && !ctx.platformEnabled(x) && g !== 'exclude') errors.push(`\`${g}.platforms\`: \`${x}\` is not an enabled row of PROJECT-PROFILE §Platforms (CONTRACTS §20)`);
        if (k === 'modules' && !NAME_RE.test(x)) errors.push(`\`${g}.modules\`: \`${x}\` is not a module folder name`);
        if (k === 'features') {
          if (!NAME_RE.test(x)) errors.push(`\`${g}.features\`: \`${x}\` is not a slug`);
          else if (ctx.hasPlan && !ctx.hasPlan(x)) errors.push(`\`${g}.features\`: \`${x}\` has no test plan under plans/${x}/`);
        }
        if (k === 'cases') {
          if (!CASE_ID_RE.test(x)) { errors.push(`\`${g}.cases\`: \`${x}\` is not a Case ID`); continue; }
          const info = ctx.caseInfo ? ctx.caseInfo(x) : { deprecated: false };
          if (!info) errors.push(`\`${g}.cases\`: ${x} has no case file under cases/ — renumbered or deleted? (CONTRACTS §19)`);
          else if (info.deprecated && g !== 'exclude') errors.push(`\`${g}.cases\`: ${x} is deprecated — a deprecated case never runs (CONTRACTS §3, §19)`);
        }
      }
    }
  }
  if (!parsed.body.includes(RESOLVED_HEADING)) warnings.push(`no \`${RESOLVED_HEADING}\` table — run \`node scripts/shared/run-plan.mjs resolve ${fm.name ?? '<name>'}\``);
  return { errors, warnings };
}

// ── Workspace model: cases, plans, quarantine, profile ──────────────────────

/** Every case file → Map(id → case). `root` is the QA root. */
export function loadCases(root = '.') {
  const cases = new Map();
  for (const p of walk(join(root, 'cases'))) {
    if (p.includes('/_template/')) continue;
    const m = CASE_FILE_RE.exec(basename(p));
    if (!m) continue;
    const t = read(p);
    const id = m[1];
    const type = STEM_TYPE[m[2]];
    const rel = p.slice(p.indexOf('cases/'));
    const parts = rel.split('/');
    const header = /\*\*Type:\*\*\s*(\S+)\s+\*\*Module:\*\*\s*(\S+)\s+\*\*Priority:\*\*\s*(P[0-3])/.exec(t);
    const tags = (/^\*\*Tags:\*\*\s*(.+)$/m.exec(t)?.[1] ?? '').trim().split(/\s+/).filter(Boolean);
    const priority = header?.[3] ?? tags.find((x) => /^@P[0-3]$/.test(x))?.slice(1) ?? null;
    if (cases.has(id)) continue; // a duplicate id is lint's error (CONTRACTS §1)
    cases.set(id, {
      id, type,
      module: header?.[2] ?? parts[parts.length - 2],
      priority,
      feature: /^\*\*Feature:\*\*\s*([a-z0-9][a-z0-9-]*)/m.exec(t)?.[1] ?? null,
      tags,
      path: rel,
      deprecated: tags.some((x) => x.startsWith('@deprecated:')),
      quarantinedUntil: tags.find((x) => x.startsWith('@quarantined:'))?.slice('@quarantined:'.length) ?? null,
      manual: tags.includes('@manual'),
      platforms: casePlatforms(t, type, tags).ids,
      scripts: mirroredScripts(root, rel, type),
    });
  }
  return cases;
}

/** The scripts that mirror a case 1:1 (CONTRACTS §2), as QA-root-relative paths that exist. */
function mirroredScripts(root, caseRel, type) {
  const base = caseRel.replace(/^cases\//, 'scripts/').replace(/\.md$/, '');
  const exts = type === 'performance' ? ['.js'] : type === 'security' ? ['.spec.ts', '.conf'] : type === 'unit' ? [] : type === 'mobile' ? [...wrapperExts('mobile'), '.spec.ts'] : [...wrapperExts(type), '.spec.ts'];
  return exts.map((e) => base + e).filter((p) => existsSync(join(root, p)));
}

/** The latest test plan per slug → Map(slug → { path, rows: [{ req, caseId, status }] }). */
export function loadPlans(root = '.') {
  const plans = new Map();
  const dir = join(root, 'plans');
  if (!existsSync(dir)) return plans;
  for (const slug of readdirSync(dir).sort()) {
    if (slug.startsWith('_') || !statSync(join(dir, slug)).isDirectory()) continue;
    const latest = readdirSync(join(dir, slug)).filter((n) => /^\d{4}-\d{2}-\d{2}-test-plan\.md$/.test(n)).sort().at(-1);
    if (!latest) continue;
    const path = `plans/${slug}/${latest}`;
    plans.set(slug, { path, rows: traceRows(read(join(root, path))) });
  }
  return plans;
}

export function traceRows(text) {
  const i = text.indexOf(TRACE_HEADING);
  if (i < 0) return [];
  const after = text.slice(i);
  const j = after.indexOf(TRACE_COLUMNS);
  if (j < 0) return [];
  const rows = [];
  for (const l of after.slice(j).split('\n').slice(1)) {
    const t = l.trim();
    if (!t.startsWith('|')) break;
    const cells = t.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^:?-*:?$/.test(c))) continue;
    if (cells.length !== 9) continue;
    rows.push({ req: cells[0], caseId: cells[1], status: cells[7] });
  }
  return rows;
}

/** Case ids with an unreleased quarantine-ledger row (CONTRACTS §12). */
export function loadQuarantine(root = '.') {
  const p = join(root, 'regression', 'quarantine.md');
  const out = new Set();
  if (!existsSync(p)) return out;
  for (const l of read(p).split('\n')) {
    const cells = l.trim().split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length === 7 && CASE_ID_RE.test(cells[0]) && (cells[6] === '—' || cells[6] === '')) out.add(cells[0]);
  }
  return out;
}

/**
 * PROJECT-PROFILE.md, looked up where the installer and the bundle repo put it (same order as
 * build-state.mjs). Returns null when absent — callers then refuse what needs an authorization.
 *   types: enabled types (§Test types) · envs: Map(env → { security, performance, isDefault })
 */
export function readProfile(root = '.') {
  const path = [join(root, '..', '.claude', 'PROJECT-PROFILE.md'), join(root, '..', 'PROJECT-PROFILE.md'), join(root, 'PROJECT-PROFILE.md')].find((p) => existsSync(p));
  if (!path) return null;
  const text = read(path);
  const sectionOf = (name) => text.split(/^## /m).find((s) => s.startsWith(name)) ?? '';
  const types = [];
  for (const line of sectionOf('Test types').split('\n')) {
    // [a-z0-9]: `e2e` has a digit (build-state.mjs's [a-z]+ silently drops it — see CHANGELOG)
    const m = /^\|\s*`?([a-z0-9]+)`?\s*\|\s*(yes|no)\s*\|/i.exec(line.trim());
    if (m && m[2].toLowerCase() === 'yes') types.push(m[1].toLowerCase());
  }
  const envs = new Map();
  for (const line of sectionOf('Environments').split('\n')) {
    const cells = line.trim().split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 4 || /^:?-+/.test(cells[0]) || cells[0] === 'Env') continue;
    const name = /`?([a-z0-9][a-z0-9-]*)`?/i.exec(cells[0])?.[1];
    if (!name) continue;
    const yes = (c) => /^\**yes\b/i.test(c.replace(/\*/g, ''));
    envs.set(name, { security: yes(cells[2]), performance: yes(cells[3]), isDefault: /\(default\)/.test(cells[0]) });
  }
  const plat = readPlatformProfile(root);
  return { path, types, envs, platforms: plat?.platforms ?? new Map(), platformsLegacy: plat?.legacy ?? true };
}

/** Everything resolve needs, read once. */
export function loadWorkspace(root = '.') {
  return { root, cases: loadCases(root), plans: loadPlans(root), quarantine: loadQuarantine(root), profile: readProfile(root) };
}

/** Read and validate `run-plans/<name>.md` against the workspace. */
export function loadRunPlan(ws, name) {
  const path = `${RUN_PLAN_DIR}/${name}.md`;
  const full = join(ws.root, path);
  if (!existsSync(full)) return { path, missing: true, errors: [`${path} does not exist — /qa-run-plan ${name} "<what it should run>" writes it`], warnings: [] };
  const text = read(full);
  const parsed = parseRunPlan(text);
  const { errors, warnings } = validateRunPlan(parsed, {
    fileName: name,
    caseInfo: (id) => (ws.cases.has(id) ? { deprecated: ws.cases.get(id).deprecated } : null),
    hasPlan: (slug) => ws.plans.has(slug),
    platformEnabled: ws.profile && !ws.profile.platformsLegacy ? (id) => !!ws.profile.platforms.get(id)?.enabled : null,
  });
  return { path, text, parsed, fm: parsed.fm, errors, warnings };
}

export function listRunPlanNames(root = '.') {
  const dir = join(root, RUN_PLAN_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith('.md') && !n.startsWith('_')).map((n) => n.slice(0, -3)).sort();
}

// ── Resolution ──────────────────────────────────────────────────────────────

/** Ids listed in a feature's plan table — its own rows and its `re-verify:<baseline>` rows (CONTRACTS §3). */
function featureIds(ws, slug) {
  return new Set((ws.plans.get(slug)?.rows ?? []).map((r) => r.caseId).filter((id) => CASE_ID_RE.test(id)));
}

function tagMatches(caseTags, wanted) {
  return wanted.some((w) => {
    const t = normTag(w);
    return t.endsWith('*') ? caseTags.some((x) => x.startsWith(t.slice(0, -1))) : caseTags.includes(t);
  });
}

/** Does case `c` pass every filter key of `group` (keys AND-ed, values OR-ed)? `cases` is not a filter. */
function matchesFilters(ws, group, c) {
  for (const [k, v] of Object.entries(group)) {
    const list = asList(v);
    if (k === 'cases' || k === 'quarantined' || list.length === 0) continue;
    if (k === 'features' && !list.some((s) => c.feature === s || featureIds(ws, s).has(c.id))) return false;
    if (k === 'types' && !list.includes(c.type)) return false;
    if (k === 'modules' && !list.includes(c.module)) return false;
    if (k === 'priorities' && !list.includes(c.priority)) return false;
    if (k === 'suites' && !list.some((s) => c.tags.includes(`@${s}`))) return false;
    if (k === 'tags' && !tagMatches(c.tags, list)) return false;
    if (k === 'platforms' && !list.some((p) => c.platforms.includes(p))) return false;
  }
  return true;
}

function hasFilterKeys(group) {
  return Object.entries(group ?? {}).some(([k, v]) => k !== 'cases' && k !== 'quarantined' && asList(v).length > 0);
}

/** Does case `c` hit any exclude key (keys OR-ed: excluding by type OR by module …)? */
function excludedBy(ws, ex, c) {
  for (const [k, v] of Object.entries(ex ?? {})) {
    const list = asList(v);
    if (k === 'quarantined' || list.length === 0) continue;
    if (k === 'cases' && list.includes(c.id)) return `excluded by id`;
    if (k === 'features' && list.some((s) => c.feature === s || featureIds(ws, s).has(c.id))) return `excluded feature`;
    if (k === 'types' && list.includes(c.type)) return `excluded type ${c.type}`;
    if (k === 'modules' && list.includes(c.module)) return `excluded module ${c.module}`;
    if (k === 'priorities' && list.includes(c.priority)) return `excluded priority ${c.priority}`;
    if (k === 'suites' && list.some((s) => c.tags.includes(`@${s}`))) return `excluded suite`;
    if (k === 'tags' && tagMatches(c.tags, list)) return `excluded tag`;
    if (k === 'platforms' && c.platforms.every((p) => list.includes(p))) return `excluded platform ${c.platforms.join(', ')}`;
  }
  return null;
}

/**
 * Which runner executes which script of a case (lib/runners.mjs). A platform on a wrapper runner
 * (Maestro …) runs that runner's script here, one wrapper call per platform; a Playwright spec runs
 * here for every platform on a Playwright runner; every other platform is listed as `handoff` with
 * its runner — staged, run elsewhere, never silently dropped.
 */
export function runnersOf(c, profile = null, wanted = null) {
  const out = [];
  let plats = (c.platforms ?? []).filter((p) => !wanted || wanted.includes(p));
  const wrapped = [];
  for (const p of plats) {
    const via = platformRunner(p, profile);
    const w = wrapperFor(via, c.type);
    if (!w) continue;
    const script = c.scripts.find((s) => s.endsWith(w.ext)) ?? null;
    if (script) out.push({ runner: via, wrapper: true, platform: p, script });
    else out.push({ runner: 'handoff', platform: p, via, script: c.scripts[0] ?? null });
    wrapped.push(p);
  }
  plats = plats.filter((p) => !wrapped.includes(p));
  if (c.type === 'mobile') {
    // Mobile on a non-wrapper runner (appium-wdio) is a staged spec the mobile repo runs (CONTRACTS §15).
    for (const p of plats) out.push({ runner: 'handoff', platform: p, via: platformRunner(p, profile), script: c.scripts.find((s) => s.endsWith('.spec.ts')) ?? c.scripts[0] ?? null });
    return out;
  }
  if (wrapped.length && !plats.length) return out;
  const claimed = new Set(out.filter((r) => r.wrapper).map((r) => r.script));
  for (const s of c.scripts.filter((x) => !claimed.has(x))) {
    if (s.endsWith('.spec.ts')) {
      const here = plats.filter((p) => PLAYWRIGHT_RUNNERS.includes(platformRunner(p, profile)));
      for (const p of plats.filter((x) => !here.includes(x))) out.push({ runner: 'handoff', platform: p, via: platformRunner(p, profile), script: s });
      if (here.length || !plats.length) out.push({ runner: 'playwright', script: s, platforms: here });
    }
    else if (s.endsWith('.conf')) out.push({ runner: 'zap', script: s });
    else if (s.endsWith('.js')) out.push({ runner: 'k6', script: s });
  }
  return out;
}

/**
 * Resolve a plan's selection against the workspace.
 * Returns { selected: [case + { slugs, runners }], excluded: [{ id, reason }], errors: [] }.
 * `selected` holds runnable AND manual cases (manual: listed, never run).
 */
export function resolvePlan(ws, fm) {
  const ids = new Set();
  for (const group of [fm.select, fm.include]) {
    if (!group || typeof group !== 'object') continue;
    if (hasFilterKeys(group)) for (const c of ws.cases.values()) if (matchesFilters(ws, group, c)) ids.add(c.id);
    for (const id of asList(group.cases)) if (ws.cases.has(id)) ids.add(id);
  }
  const ex = fm.exclude ?? {};
  const excludeQuarantined = ex.quarantined !== false;
  const enabled = ws.profile?.types?.length ? new Set(ws.profile.types) : null;
  const selectedFeatures = [...asList(fm.select?.features), ...asList(fm.include?.features)];
  // A plan that names platforms runs only those platforms of each case; mobile cases then appear as
  // handoff rows (their runner is the mobile framework repo) instead of being dropped (CONTRACTS §20).
  const wantedPlatforms = [...asList(fm.select?.platforms), ...asList(fm.include?.platforms)];
  const excludedPlatforms = asList(fm.exclude?.platforms);
  const selected = [];
  const excluded = [];
  const errors = [];
  for (const id of [...ids].sort()) {
    const c = ws.cases.get(id);
    let reason = null;
    if (c.deprecated) reason = 'deprecated';
    else if (c.type === 'unit' || (c.type === 'mobile' && !wantedPlatforms.length)) reason = `other runner (${c.type} → /qa-run --type ${c.type})`;
    else if (enabled && !enabled.has(c.type)) reason = `type ${c.type} disabled in PROJECT-PROFILE §Test types`;
    else if (excludeQuarantined && (c.quarantinedUntil || ws.quarantine.has(id))) reason = `quarantined until ${c.quarantinedUntil ?? '?'}`;
    else reason = excludedBy(ws, ex, c);
    if (reason) { excluded.push({ id, reason }); continue; }
    const want = (wantedPlatforms.length ? wantedPlatforms : c.platforms).filter((p) => !excludedPlatforms.includes(p));
    const runners = c.manual ? [] : runnersOf(c, ws.profile, want);
    if (!c.manual && runners.length === 0) errors.push(`${id}: selected but has no script under scripts/ (and is not @manual) — /qa-script first, or exclude it`);
    // Write-back targets: the selected features whose table lists the case (own or re-verify rows);
    // otherwise the case's own feature plan, when that plan lists it (executing-tests Step 6).
    let slugs = selectedFeatures.filter((s) => featureIds(ws, s).has(id));
    if (slugs.length === 0 && c.feature && featureIds(ws, c.feature).has(id)) slugs = [c.feature];
    selected.push({ ...c, runners, slugs: [...new Set(slugs)] });
  }
  selected.sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.id.localeCompare(b.id));
  return { selected, excluded, errors };
}

/** Counts per type: { api: { total, manual } … } in TYPE_ORDER. */
export function countsByType(selected) {
  const out = {};
  for (const c of selected) {
    out[c.type] ??= { total: 0, manual: 0 };
    out[c.type].total += 1;
    if (c.manual) out[c.type].manual += 1;
  }
  return out;
}

/** The generated `## Resolved cases` section (heading included). */
export function resolvedSection(res, date) {
  const counts = countsByType(res.selected);
  const summary = Object.entries(counts).map(([t, n]) => `${t} ${n.total}${n.manual ? ` (manual ${n.manual})` : ''}`).join(' · ') || 'none';
  const lines = [
    RESOLVED_HEADING,
    '',
    `<!-- Generated by \`node scripts/shared/run-plan.mjs resolve\` on ${date} — never edited by hand. -->`,
    `${res.selected.length} case(s): ${summary}.`,
    '',
    RESOLVED_COLUMNS,
    '|---|---|---|---|---|---|---|',
    ...res.selected.map((c) => `| ${c.id} | ${c.type} | ${(c.platforms ?? []).join(', ') || '—'} | ${c.module} | ${c.priority ?? '—'} | ${c.feature ?? '—'} | ${c.manual ? 'manual' : c.scripts.map((s) => `\`${s}\``).join(' · ') || '—'} |`),
  ];
  if (res.excluded.length) {
    lines.push('', `Excluded (${res.excluded.length}): ${res.excluded.map((e) => `${e.id} — ${e.reason}`).join(' · ')}.`);
  }
  return lines.join('\n') + '\n';
}

/** Replace (or append) the `## Resolved cases` section of a plan body. */
export function withResolvedSection(text, section) {
  const src = norm(text);
  const i = src.indexOf(`\n${RESOLVED_HEADING}`);
  if (i < 0) return src.replace(/\n*$/, '\n\n') + section;
  const rest = src.slice(i + 1);
  const next = rest.slice(RESOLVED_HEADING.length).search(/\n## /);
  const tail = next < 0 ? '' : rest.slice(RESOLVED_HEADING.length + next + 1);
  return src.slice(0, i + 1) + section + (tail ? '\n' + tail : '');
}

/** The ids currently in a file's Resolved table (for staleness checks). */
export function resolvedIdsIn(text) {
  const src = norm(text);
  let i = src.indexOf(RESOLVED_COLUMNS);
  if (i < 0) i = src.indexOf(RESOLVED_COLUMNS_LEGACY);
  if (i < 0) return null;
  const ids = [];
  for (const l of src.slice(i).split('\n').slice(1)) {
    if (!l.trim().startsWith('|')) break;
    const id = l.split('|')[1]?.trim();
    if (CASE_ID_RE.test(id ?? '')) ids.push(id);
  }
  return ids;
}
