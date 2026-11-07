/**
 * Types mirroring CONTRACTS.md §17 (the `qa/state.json` derived read model), the loader, project
 * discovery and the freshness check.
 *
 * This file must not import `vscode`: the unit tests load it under plain Node.
 */

import * as fs from 'fs';
import * as path from 'path';

export const SUPPORTED_SCHEMA = 1;

export type QaPhase = 'Analyze' | 'Plan' | 'Design' | 'Script' | 'Run' | 'Report' | 'Signed-off';

/** The /qa-status ladder (CONTRACTS §17), bottom rung first. */
export const QA_PHASES: QaPhase[] = ['Analyze', 'Plan', 'Design', 'Script', 'Run', 'Report', 'Signed-off'];

/** The eight test types of PROJECT-PROFILE §Test types, plus `ui` (added by the platforms work). */
export const TEST_TYPES = ['api', 'integration', 'e2e', 'ui', 'security', 'performance', 'accessibility', 'mobile', 'unit'] as const;

export interface QaGateVerdict {
  gate: string;
  target: string;
  actual: string;
  verdict: 'pass' | 'fail' | 'not evaluable' | string;
}

export interface QaReport {
  date: string | null;
  path: string;
  overall: 'pass' | 'fail' | 'not evaluable' | string | null;
  shipped_sha: string | null;
  runs: string[];
  gates: QaGateVerdict[];
  /** true: the traceability table has runs newer than the report; null: the report cites no runs. */
  stale: boolean | null;
  newer_runs: string[];
}

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';

export interface QaDefectItem {
  id: string;
  severity: Severity | null;
  origin: 'INTERNAL' | 'ESCAPED' | 'EXPLORATORY' | null;
  title: string;
  path: string;
}

export interface QaDefects {
  total_open: number;
  by_severity: Record<Severity, number>;
  items: QaDefectItem[];
}

export interface QaQuarantineItem {
  case_id: string;
  since: string;
  until: string;
  reason: string;
  ticket: string | null;
  expired: boolean;
}

export interface QaQuarantine {
  active: number;
  expired: number;
  nearest_expiry: string | null;
  items: QaQuarantineItem[];
}

export interface QaReview {
  date: string;
  verdict: 'READY FOR /qa-script' | 'REVISE FIRST' | null;
  path: string;
  reviewed: number;
  /** §18: true = a reviewed case changed since; null = no hashes recorded, so it cannot be told. */
  stale: boolean | null;
  changed: string[];
}

export interface QaEnvironment {
  env: string;
  run_id: string;
  path: string;
  verdicts: Record<string, 'READY' | 'NOT READY' | 'BLOCKED' | string>;
  stale: boolean | null;
  changed: string[];
}

export interface QaSignoff {
  release: string;
  date: string;
  recommendation: 'GO' | 'NO-GO' | 'CONDITIONAL GO' | string | null;
  path: string;
  conditions: string[];
}

export interface QaTraceability {
  total_cases: number;
  scripted: number;
  last_run_pass: number;
  last_run_fail: number;
  blocked: number;
  not_run: number;
}

export interface QaTypeCounts {
  cases: number;
  scripted: number;
  pass: number;
  fail: number;
  blocked: number;
}

export interface QaSlug {
  slug: string;
  title: string;
  phase: QaPhase;
  analysis: string | null;
  plan: string | null;
  traceability: QaTraceability | null;
  types: Record<string, QaTypeCounts>;
  review: QaReview | null;
  report: QaReport | null;
  signoff: QaSignoff | null;
  defects: QaDefects;
  quarantine: QaQuarantine;
  /** Optional: a builder that knows the next command may name it. Shown and copied, never run. */
  next_command?: string | null;
}

export interface QaState {
  schema: number;
  generator_version: string;
  generated_at: string;
  source_hash: string;
  project: string;
  /** null when no PROJECT-PROFILE.md was found — unknown, not "none". */
  types_enabled: string[] | null;
  environments: QaEnvironment[];
  slugs: QaSlug[];
  next_command?: string | null;
}

export type LoadResult =
  | { ok: true; state: QaState; statePath: string; projectRoot: string; staleFiles: string[] }
  | { ok: false; reason: string; detail?: string; statePath: string; projectRoot: string };

export function phaseIndex(phase: QaPhase): number {
  const idx = QA_PHASES.indexOf(phase);
  return idx !== -1 ? idx : 0;
}

export function totalOpenDefects(state: QaState): number {
  return state.slugs.reduce((sum, s) => sum + (s.defects?.total_open ?? 0), 0);
}

export function totalQuarantined(state: QaState): number {
  return state.slugs.reduce((sum, s) => sum + (s.quarantine?.active ?? 0), 0);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Where the index lives under each QA root name, in the order the bundle's resolver prefers (CONTRACTS §2). */
export const STATE_CANDIDATES = ['.stlc/state.json', 'qa/state.json'];

/**
 * The index path to read: `stlc.statePath` when set, else `.stlc/state.json` when that root exists,
 * else `qa/state.json` when that one does, else `.stlc/state.json` — the bundle's `lib/root.mjs`
 * order. A parent workspace with no root of its own looks for projects below it, so a `qa/`
 * project under it is not shadowed by the `.stlc` default.
 */
export function resolveStatePath(workspaceRoot: string, configured?: string | null): string {
  const set = (configured ?? '').trim();
  if (set) return set;
  for (const rel of STATE_CANDIDATES) {
    if (fs.existsSync(path.join(workspaceRoot, path.dirname(rel)))) return rel;
  }
  for (const rel of STATE_CANDIDATES) {
    if (findProjectRoot(workspaceRoot, rel)) return rel;
  }
  return STATE_CANDIDATES[0];
}

/**
 * Load the index. `chosenRoot` is the project the reader picked; otherwise the workspace root when
 * it holds the index, else the project whose index was written most recently.
 */
export function loadState(workspaceRoot: string, relStatePath: string, chosenRoot?: string): LoadResult {
  const projectRoot = chosenRoot ?? findProjectRoot(workspaceRoot, relStatePath) ?? workspaceRoot;
  const statePath = path.join(projectRoot, relStatePath);

  let raw: string;
  try {
    raw = fs.readFileSync(statePath, 'utf8');
  } catch {
    return {
      ok: false,
      projectRoot,
      statePath,
      reason: 'No QA state index found.',
      detail:
        `Expected ${relStatePath}. It is generated — run \`node ${path.posix.dirname(relStatePath.replace(/\\/g, '/'))}/scripts/shared/build-state.mjs\` ` +
        `(or any /qa-* command; the Stop hook rebuilds it). Check stlc.statePath if your QA root differs.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, statePath, projectRoot, reason: 'The QA state index is not valid JSON.', detail: err instanceof Error ? err.message : String(err) };
  }

  if (!isRecord(parsed) || typeof parsed.schema !== 'number') {
    return { ok: false, statePath, projectRoot, reason: 'The QA state index has no schema field.' };
  }
  if (parsed.schema !== SUPPORTED_SCHEMA) {
    return {
      ok: false,
      projectRoot,
      statePath,
      reason: `Unsupported QA state schema ${parsed.schema}.`,
      detail: `This board understands schema ${SUPPORTED_SCHEMA}. Rather than guess at a layout it does not know, it shows nothing. Update the extension, or check which bundle version wrote this file.`,
    };
  }

  const state = parsed as unknown as QaState;
  if (!Array.isArray(state.slugs)) return { ok: false, statePath, projectRoot, reason: 'The QA state index has no slugs array.' };
  state.environments ??= [];
  return { ok: true, state, statePath, projectRoot, staleFiles: findStaleFiles(projectRoot, state) };
}

const SKIP_DIRS = new Set(['node_modules', 'vendor', 'out', 'dist', 'build']);
const MAX_DEPTH = 5;

export interface ProjectRef {
  root: string;
  /** Modification time of the project's index, or of its newest run plan when it has no index yet, in ms. */
  mtime: number;
  /** False for a project that has run plans but no index yet (build-state.mjs has not run there). */
  indexed: boolean;
}

export interface FindOptions {
  /**
   * Also count a folder whose run-plans folder (relative, e.g. `qa/run-plans`) holds a `*.md` as a
   * project, listed with `indexed: false`, so the picker can say what to run to build its index.
   */
  runPlansDir?: string;
}

/**
 * Every project under the workspace that has an index, newest first. A folder with an index (or,
 * with `runPlansDir`, run plans) is a project and is not searched further; dot folders
 * (`.claude/worktrees`, `.git`) are agent copies or git internals, and `node_modules` and build
 * output hold dependencies — all skipped.
 */
export function findProjectRoots(workspaceRoot: string, relStatePath: string, opts: FindOptions = {}): ProjectRef[] {
  const found: ProjectRef[] = [];
  const probe = (dir: string): boolean => {
    try {
      found.push({ root: dir, mtime: fs.statSync(path.join(dir, relStatePath)).mtimeMs, indexed: true });
      return true;
    } catch {
      // no index here
    }
    if (!opts.runPlansDir) return false;
    const plans = path.join(dir, ...opts.runPlansDir.split(/[\/]/).filter(Boolean));
    let newest = -1;
    try {
      for (const e of fs.readdirSync(plans, { withFileTypes: true })) {
        if (!e.isFile() || !e.name.endsWith('.md')) continue;
        newest = Math.max(newest, fs.statSync(path.join(plans, e.name)).mtimeMs);
      }
    } catch {
      return false;
    }
    if (newest < 0) return false;
    found.push({ root: dir, mtime: newest, indexed: false });
    return true;
  };
  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      const candidate = path.join(dir, e.name);
      if (!probe(candidate)) walk(candidate, depth + 1);
    }
  };
  if (!probe(workspaceRoot)) walk(workspaceRoot, 1);
  return found.sort((a, b) => b.mtime - a.mtime);
}

/**
 * An absolute path for a path the index or the page names, inside the selected project, never the
 * workspace root. Absolute paths and `..` segments are refused (undefined).
 */
export function resolveInProject(projectRoot: string, rel: string): string | undefined {
  if (!rel || rel.startsWith('/') || rel.startsWith('\\') || /^[a-zA-Z]:/.test(rel)) return undefined;
  const parts = rel.split(/[\\/]/).filter(Boolean);
  if (!parts.length || parts.some((seg) => seg === '..')) return undefined;
  return path.join(projectRoot, ...parts);
}

/** The project to show when the reader has not chosen one: the workspace root, else the newest index. */
export function findProjectRoot(workspaceRoot: string, relStatePath: string): string | undefined {
  if (fs.existsSync(path.join(workspaceRoot, relStatePath))) return workspaceRoot;
  return findProjectRoots(workspaceRoot, relStatePath)[0]?.root;
}

/**
 * Freshness: every file the index cites is compared by modification time against `generated_at`.
 * Re-hashing would be a second implementation of the builder's rule; mtimes fail in the safe
 * direction — "possibly stale" when nothing meaningful changed, never silent when something did.
 */
function findStaleFiles(projectRoot: string, state: QaState): string[] {
  const generatedAt = Date.parse(state.generated_at);
  if (!Number.isFinite(generatedAt)) return [];
  const referenced = new Set<string>();
  for (const env of state.environments ?? []) referenced.add(env.path);
  for (const s of state.slugs) {
    for (const p of [s.analysis, s.plan, s.report?.path, s.review?.path, s.signoff?.path]) if (p) referenced.add(p);
    for (const d of s.defects?.items ?? []) if (d.path) referenced.add(d.path);
  }
  const stale: string[] = [];
  for (const rel of referenced) {
    try {
      if (fs.statSync(path.join(projectRoot, rel)).mtimeMs > generatedAt + 1000) stale.push(rel);
    } catch {
      stale.push(rel);
    }
  }
  return stale.sort();
}
