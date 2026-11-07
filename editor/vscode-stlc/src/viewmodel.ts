/**
 * The board's view model: what the page draws, computed here so the unit tests can reach it.
 *
 * This file must not import `vscode`. It runs in the tests under plain Node, and keeping it that way
 * is what lets a pipeline step, a matrix cell or the "what next" list be asserted without an editor.
 *
 * Nothing here judges a gate. Every state is one the builder recorded in `qa/state.json` (§17), one a
 * verdict file states (§18), or a run file's own Status cell (§3). Where the board fills a gap — a
 * platform a case does not name, a run newer than the index — the value says so (`inferred`, `live`).
 */

import { LoadResult, QA_PHASES, QaEnvironment, QaSlug, QaState, Severity, phaseIndex } from './model';
import { ActivityItem, CaseHeader, CaseVerdict, Clarification, FailureEntry, LiveSnapshot, Overlay, RunRecord, TraceRow, Triage, UpdateNotice, verdictOf } from './live';
import { ActivityEvent, NEED_LABEL, openNeeds } from './activity';

// ---- pipeline ---------------------------------------------------------------------------------------

export type StepState = 'pass' | 'stale' | 'changes' | 'blocked' | 'failed' | 'running' | 'partial' | 'idle';

export const STEPS = [
  { key: 'knowledge', label: 'Knowledge', command: '/qa-knowledge' },
  { key: 'analyze', label: 'Analyze', command: '/qa-analyze' },
  { key: 'plan', label: 'Plan', command: '/qa-plan' },
  { key: 'design', label: 'Design', command: '/qa-design' },
  { key: 'review', label: 'Review', command: '/qa-review' },
  { key: 'script', label: 'Script', command: '/qa-script' },
  { key: 'env', label: 'Env', command: '/qa-env' },
  { key: 'run', label: 'Run', command: '/qa-run' },
  { key: 'report', label: 'Report', command: '/qa-report' },
  { key: 'signoff', label: 'Sign-off', command: '/qa-signoff' },
] as const;

export type StepKey = (typeof STEPS)[number]['key'];

/** The default word per state; a step may say something more exact ("REVISE FIRST", "NO-GO"). */
export const STATE_WORD: Record<StepState, string> = {
  pass: 'passed',
  stale: 'stale',
  changes: 'changes requested',
  blocked: 'blocked',
  failed: 'failing',
  running: 'running',
  partial: 'in progress',
  idle: 'not started',
};

export interface StepVM {
  key: StepKey;
  label: string;
  state: StepState;
  word: string;
  detail: string;
  path: string | null;
  /** Set when the state was inferred from files newer than the index. */
  live: { note: string } | null;
}

// ---- matrix -----------------------------------------------------------------------------------------

export const PLATFORMS = ['web', 'android', 'ios', 'windows', 'macos', 'api'] as const;
export const MATRIX_TYPES = ['api', 'integration', 'e2e', 'ui', 'security', 'performance', 'accessibility', 'mobile', 'unit'] as const;

/**
 * The platform a type runs on when its cases do not say (before cases carried `**Platform:**`).
 * Every cell built from this map is labelled *inferred*.
 */
export const DEFAULT_PLATFORMS: Record<string, string[]> = {
  api: ['api'],
  integration: ['api'],
  security: ['api'],
  performance: ['api'],
  e2e: ['web'],
  ui: ['web'],
  accessibility: ['web'],
  mobile: ['android', 'ios'],
  unit: ['other:code'],
};

export type CellState = 'pass' | 'fail' | 'blocked' | 'handoff' | 'partial' | 'not-run' | 'none' | 'disabled';

export interface CellVM {
  platform: string;
  type: string;
  state: CellState;
  counts: { pass: number; fail: number; blocked: number; handoff: number; notRun: number; total: number };
  cases: { id: string; verdict: CaseVerdict }[];
  /** True when any case's platform came from the type default rather than the case itself. */
  inferred: boolean;
  /** True when a run newer than the index changed any verdict in the cell. */
  live: boolean;
}

export interface MatrixVM {
  platforms: { id: string; used: boolean }[];
  types: { id: string; enabled: boolean; used: boolean }[];
  cells: CellVM[];
  inferred: boolean;
}

export interface MatrixInput {
  caseId: string;
  type: string;
  status: string;
}

/** The platforms of one case: its own header or tag, else the type default (inferred). */
export function platformsOf(type: string, header: CaseHeader | undefined): { platforms: string[]; inferred: boolean } {
  if (header && header.platforms.length) return { platforms: header.platforms.map(normPlatform), inferred: false };
  return { platforms: DEFAULT_PLATFORMS[type] ?? ['other:unknown'], inferred: true };
}

function normPlatform(p: string): string {
  const v = p.toLowerCase();
  if ((PLATFORMS as readonly string[]).includes(v) || v.startsWith('other:')) return v;
  if (v === 'browser' || v === 'desktop-web') return 'web';
  if (v === 'macos' || v === 'mac') return 'macos';
  return `other:${v}`;
}

/**
 * The platform × type matrix from traceability rows (one per case), case headers, and newer run
 * verdicts. Rows are platforms, columns types. A cell is the worst verdict among its cases
 * (fail > blocked > handoff), `pass` only when every case passed, `partial` when some passed and
 * the rest have not run, `not-run` when none ran, `none` when the cell has no case, and `disabled`
 * for a type PROJECT-PROFILE §Test types turns off.
 */
export function deriveMatrix(
  rows: MatrixInput[],
  headers: Map<string, CaseHeader>,
  typesEnabled: string[] | null,
  newer: Map<string, CaseVerdict> = new Map(),
): MatrixVM {
  const cells = new Map<string, CellVM>();
  const key = (p: string, t: string): string => `${p}|${t}`;
  const seen = new Set<string>();
  let anyInferred = false;
  const extraPlatforms = new Set<string>();
  for (const r of rows) {
    const type = r.type.toLowerCase();
    // A case listed twice (own row + a re-verify row) is one case in the matrix.
    if (seen.has(`${r.caseId}|${type}`)) continue;
    seen.add(`${r.caseId}|${type}`);
    const { platforms, inferred } = platformsOf(type, headers.get(r.caseId));
    anyInferred ||= inferred;
    const live = newer.get(r.caseId);
    const verdict = live ?? verdictOf(r.status);
    for (const p of platforms) {
      if (!(PLATFORMS as readonly string[]).includes(p)) extraPlatforms.add(p);
      const c = cells.get(key(p, type)) ?? {
        platform: p,
        type,
        state: 'none' as CellState,
        counts: { pass: 0, fail: 0, blocked: 0, handoff: 0, notRun: 0, total: 0 },
        cases: [],
        inferred: false,
        live: false,
      };
      c.counts.total += 1;
      if (verdict === 'pass') c.counts.pass += 1;
      else if (verdict === 'fail') c.counts.fail += 1;
      else if (verdict === 'blocked') c.counts.blocked += 1;
      else if (verdict === 'handoff') c.counts.handoff += 1;
      else c.counts.notRun += 1;
      c.cases.push({ id: r.caseId, verdict });
      c.inferred ||= inferred;
      c.live ||= live !== undefined;
      cells.set(key(p, type), c);
    }
  }
  const enabled = (t: string): boolean => typesEnabled === null || typesEnabled.includes(t) || (t === 'ui' && typesEnabled.includes('e2e'));
  const typeIds = [...MATRIX_TYPES, ...[...new Set(rows.map((r) => r.type.toLowerCase()))].filter((t) => !(MATRIX_TYPES as readonly string[]).includes(t))];
  const platformIds = [...PLATFORMS, ...[...extraPlatforms].sort()];
  const out: CellVM[] = [];
  for (const p of platformIds) {
    for (const t of typeIds) {
      const c = cells.get(key(p, t));
      if (!enabled(t)) {
        out.push({ platform: p, type: t, state: 'disabled', counts: c?.counts ?? { pass: 0, fail: 0, blocked: 0, handoff: 0, notRun: 0, total: 0 }, cases: c?.cases ?? [], inferred: c?.inferred ?? false, live: c?.live ?? false });
        continue;
      }
      if (!c) {
        out.push({ platform: p, type: t, state: 'none', counts: { pass: 0, fail: 0, blocked: 0, handoff: 0, notRun: 0, total: 0 }, cases: [], inferred: false, live: false });
        continue;
      }
      const n = c.counts;
      c.state = n.fail ? 'fail' : n.blocked ? 'blocked' : n.handoff ? 'handoff' : n.pass === n.total ? 'pass' : n.pass ? 'partial' : 'not-run';
      out.push(c);
    }
  }
  return {
    platforms: platformIds.map((id) => ({ id, used: out.some((c) => c.platform === id && c.counts.total > 0) })),
    types: typeIds.map((id) => ({ id, enabled: enabled(id), used: out.some((c) => c.type === id && c.counts.total > 0) })),
    cells: out,
    inferred: anyInferred,
  };
}

// ---- view model types -------------------------------------------------------------------------------

export interface ActionVM {
  kind: 'next' | 'stale' | 'changes' | 'blocked' | 'failed' | 'defects' | 'quarantine' | 'continue' | 'done';
  title: string;
  detail: string;
  command: string | null;
  path: string | null;
}

export interface FailureVM {
  caseId: string;
  triage: Triage | null;
  error: string | null;
  next: string | null;
  /** The bundle command for the triage class, to copy — never run by the board. */
  command: string | null;
}

export interface RunVM {
  runId: string;
  kind: 'type' | 'plan';
  where: string;
  slug: string | null;
  at: number;
  counts: { pass: number; fail: number; blocked: number; manual: number; total: number } | null;
  passRate: number | null;
  failures: FailureVM[];
  summaryPath: string | null;
  failuresPath: string | null;
  htmlReport: string | null;
  traces: string[];
  dir: string;
}

export interface RunPlanVM {
  name: string;
  description: string;
  env: string | null;
  path: string;
  resolved: boolean;
  caseCount: number;
  manual: number;
  byType: { id: string; n: number }[];
  byPlatform: { id: string; n: number; inferred: boolean }[];
  lastRun: { runId: string; at: number; pass: number; fail: number; blocked: number; ok: boolean | null; summaryPath: string | null } | null;
  runCommand: string;
  dryRunCommand: string;
}

export interface FeatureVM {
  slug: string;
  title: string;
  phase: string;
  phaseIndex: number;
  steps: StepVM[];
  current: StepKey;
  inFlight: boolean;
  cases: { designed: number; scripted: number; passed: number; failed: number; blocked: number; notRun: number };
  lastRun: { runId: string | null; pass: number; ran: number; rate: number | null };
  defects: { open: number; bySeverity: Record<Severity | 'Unrated', number>; items: { id: string; severity: Severity | null; origin: string | null; title: string; path: string }[] };
  quarantine: { active: number; expired: number; nearest: string | null; items: { caseId: string; until: string; reason: string; ticket: string | null; expired: boolean }[] };
  coverage: { state: 'ok' | 'gaps' | 'unknown'; gaps: string[]; path: string | null; hint: string };
  matrix: MatrixVM;
  gates: { gate: string; target: string; actual: string; verdict: string; reverify: boolean }[];
  report: { path: string; date: string | null; overall: string | null; stale: boolean | null; newerRuns: string[]; sha: string | null } | null;
  review: { verdict: string | null; stale: boolean | null; changed: string[]; path: string; date: string } | null;
  signoff: { release: string; recommendation: string | null; date: string; path: string; conditions: string[] } | null;
  actions: ActionVM[];
  overlays: Overlay[];
  /** Pipeline steps passed (the optional knowledge step aside), as a whole percent. */
  percentDone: number;
  /** The clarification questions of the newest sheet, open first. */
  decisions: { list: DecisionVM[]; path: string | null };
  /** Open defects, flaky or broken cases and new failures, worst first. */
  findings: FindingVM[];
  /** What a human must do for this feature: questions, sign-off, and what the activity log asks for. */
  needsYou: NeedVM[];
}

export interface DecisionVM {
  id: string;
  question: string;
  status: 'open' | 'assumed' | 'answered';
  blocking: boolean;
  /** The assumption design runs on while the question is open; the answer once answered. */
  note: string | null;
}

export interface FindingVM {
  kind: 'defect' | 'flaky' | 'failure' | 'quarantine';
  severity: Severity | 'Unrated';
  id: string;
  title: string;
  path: string | null;
  at: string | null;
}

export interface NeedVM {
  need: string;
  label: string;
  title: string;
  /** Copied, never run: the board does not drive the pipeline. */
  command: string | null;
  link: string | null;
  at: string | null;
}

export interface EnvVM {
  env: string;
  runId: string;
  path: string;
  stale: boolean | null;
  changed: string[];
  verdicts: { type: string; verdict: string }[];
}

export interface VersionVM {
  board: string;
  bundle: string | null;
  bundleSource: 'manifest' | 'VERSION' | 'builder' | null;
  builder: string;
  update: { kind: 'patch' | 'minor' | 'major'; installed: string | null; latest: string; label: string; command: string; changelogUrl: string | null } | null;
}

export interface LiveVM {
  watching: boolean;
  branch: string | null;
  head: string | null;
  ahead: boolean;
  last: ActivityItem | null;
  activity: ActivityItem[];
  builtAt: number;
}

export type BoardVM =
  | {
      ok: true;
      project: string;
      generatedAt: string;
      staleFiles: string[];
      typesEnabled: string[] | null;
      environments: EnvVM[];
      features: FeatureVM[];
      runPlans: RunPlanVM[];
      runs: RunVM[];
      /** The newest run that has a summary.md; `inFlight` is a newer run folder still without one. */
      latestRun: RunVM | null;
      inFlight: RunVM | null;
      version: VersionVM;
      knowledgeCards: number | null;
      nextCommand: string | null;
      live: LiveVM;
    }
  | { ok: false; reason: string; detail: string | null; version: VersionVM };

export interface BuildOptions {
  live?: LiveSnapshot;
  watching?: boolean;
  now?: number;
  addonVersion?: string;
  /** A notice's `latest` the reader dismissed (workspaceState); that version's pill goes plain. */
  dismissedUpdate?: string | null;
}

// ---- building ---------------------------------------------------------------------------------------

export function buildViewModel(result: LoadResult, opts: BuildOptions = {}): BoardVM {
  const live = opts.live;
  if (!result.ok) return { ok: false, reason: result.reason, detail: result.detail ?? null, version: versionVM(null, live, opts) };
  const state = result.state;
  const runs = (live?.runs ?? []).map(runVM);
  const generatedAt = Date.parse(state.generated_at);
  const newer = newerVerdicts(live?.runs ?? [], Number.isFinite(generatedAt) ? generatedAt : 0);
  return {
    ok: true,
    project: state.project || 'QA',
    generatedAt: state.generated_at,
    staleFiles: result.staleFiles,
    typesEnabled: state.types_enabled,
    environments: (state.environments ?? []).map(envVM),
    features: state.slugs.map((s) => featureVM(s, state, live, newer)),
    runPlans: (live?.runPlans ?? []).map((p) => runPlanVM(p, live)),
    runs,
    latestRun: runs.find((r) => r.counts) ?? null,
    inFlight: runs[0] && !runs[0].counts ? runs[0] : null,
    version: versionVM(state, live, opts),
    knowledgeCards: live?.knowledgeCards ?? null,
    nextCommand: typeof state.next_command === 'string' && state.next_command ? state.next_command : null,
    live: {
      watching: opts.watching ?? false,
      branch: live?.branch ?? null,
      head: live?.head ?? null,
      ahead: live?.ahead ?? false,
      last: live?.activity[0] ?? null,
      activity: live?.activity ?? [],
      builtAt: opts.now ?? Date.now(),
    },
  };
}

/** Case verdicts from runs written after the index: what the next rebuild will copy into the table. */
export function newerVerdicts(runs: RunRecord[], indexAt: number): Map<string, CaseVerdict> {
  const out = new Map<string, CaseVerdict>();
  if (!indexAt) return out;
  // runs are newest first; the first verdict seen for a case wins.
  for (const r of runs) {
    if (r.mtime <= indexAt + 1000 || !r.summary) continue;
    for (const c of r.summary.cases) if (!out.has(c.id) && c.verdict !== 'manual' && c.verdict !== 'not-run') out.set(c.id, c.verdict);
  }
  return out;
}

export function versionVM(state: QaState | null, live: LiveSnapshot | undefined, opts: BuildOptions): VersionVM {
  const bundle = live?.bundle ?? null;
  const n: UpdateNotice | null = live?.update ?? null;
  const pending = n && (n.kind === 'patch' || n.kind === 'minor' || n.kind === 'major') && n.latest && n.latest !== opts.dismissedUpdate ? n : null;
  return {
    board: opts.addonVersion ?? '',
    bundle: bundle?.version ?? null,
    bundleSource: bundle?.source ?? null,
    builder: state?.generator_version ?? '',
    update: pending
      ? {
          kind: pending.kind as 'patch' | 'minor' | 'major',
          installed: pending.installed ?? bundle?.version ?? null,
          latest: pending.latest as string,
          label: pending.kind === 'major' ? `MAJOR update ${pending.latest}` : `update ${pending.latest}`,
          command: pending.command,
          changelogUrl: pending.changelogUrl,
        }
      : null,
  };
}

function envVM(e: QaEnvironment): EnvVM {
  return { env: e.env, runId: e.run_id, path: e.path, stale: e.stale, changed: e.changed ?? [], verdicts: Object.entries(e.verdicts ?? {}).map(([type, verdict]) => ({ type, verdict })) };
}

const TRIAGE_COMMAND: Record<Triage, (slug: string, id: string) => string> = {
  FUNCTIONAL: (slug) => `/qa-defect ${slug}`,
  SCRIPT: (slug, id) => (/^TC-E2E-|^TC-UI-/.test(id) ? `/qa-heal ${slug}` : `/qa-script ${slug}`),
  'SETUP-ENV': () => '/qa-env <env>',
  FLAKY: (_slug, id) => `/qa-quarantine ${id} --until <YYYY-MM-DD> --reason "<why>"`,
};

export function runVM(r: RunRecord): RunVM {
  const c = r.summary?.counts ?? null;
  const ran = c ? c.pass + c.fail + c.blocked : 0;
  const slug = r.slug ?? r.summary?.cases.find((x) => x.feature)?.feature ?? '<slug>';
  // Every failing case gets a row: its failures.md entry when one exists, otherwise "not triaged".
  const entries = new Map<string, FailureEntry>(r.failures.map((f) => [f.caseId, f]));
  for (const k of r.summary?.cases ?? []) if (k.verdict === 'fail' && !entries.has(k.id)) entries.set(k.id, { caseId: k.id, triage: null, error: k.detail, next: null });
  return {
    runId: r.runId,
    kind: r.kind,
    where: r.kind === 'plan' ? `plan ${r.group}` : `${r.group} · ${r.slug}`,
    slug: r.slug,
    at: r.mtime,
    counts: c,
    passRate: ran ? Math.round((c!.pass / ran) * 100) : null,
    failures: [...entries.values()].map((f) => ({ ...f, command: f.triage ? TRIAGE_COMMAND[f.triage](slug, f.caseId) : null })),
    summaryPath: r.summaryPath,
    failuresPath: r.failuresPath,
    htmlReport: r.htmlReport,
    traces: r.traces,
    dir: r.dir,
  };
}

export function runPlanVM(p: LiveSnapshot['runPlans'][number], live: LiveSnapshot | undefined): RunPlanVM {
  const tally = <K extends string>(keys: K[]): { id: K; n: number }[] => {
    const m = new Map<K, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  };
  const plats: { id: string; inferred: boolean }[] = [];
  for (const c of p.plan.cases) {
    const { platforms, inferred } = platformsOf(c.type, live?.cases.get(c.id));
    for (const id of platforms) plats.push({ id, inferred });
  }
  const byPlatform = tally(plats.map((x) => x.id)).map((x) => ({ ...x, inferred: plats.some((y) => y.id === x.id && y.inferred) }));
  const lr = p.lastRun;
  const c = lr?.summary?.counts;
  return {
    name: p.plan.name,
    description: p.plan.description,
    env: p.plan.env,
    path: p.path,
    resolved: p.plan.resolved,
    caseCount: p.plan.cases.length,
    manual: p.plan.cases.filter((x) => x.manual).length,
    byType: tally(p.plan.cases.map((x) => x.type)),
    byPlatform,
    lastRun: lr
      ? { runId: lr.runId, at: lr.mtime, pass: c?.pass ?? 0, fail: c?.fail ?? 0, blocked: c?.blocked ?? 0, ok: c ? c.fail === 0 && c.blocked === 0 : null, summaryPath: lr.summaryPath }
      : null,
    runCommand: `npm run qa:plan:run -- ${p.plan.name}`,
    dryRunCommand: `npm run qa:plan:run -- ${p.plan.name} --dry-run`,
  };
}

function featureVM(s: QaSlug, state: QaState, live: LiveSnapshot | undefined, newer: Map<string, CaseVerdict>): FeatureVM {
  const t = s.traceability;
  const rows: TraceRow[] = live?.traceRows.get(s.slug) ?? [];
  const overlays = live?.overlays.get(s.slug) ?? [];
  const steps = pipeline(s, state, live, overlays);
  const current = (steps.find((x) => x.key !== 'knowledge' && x.state !== 'pass') ?? steps[steps.length - 1]).key;

  const ranRows = rows.filter((r) => r.lastRun);
  const lastRunId = ranRows.map((r) => r.lastRun as string).sort().pop() ?? null;
  const pass = t?.last_run_pass ?? 0;
  const ran = (t?.last_run_pass ?? 0) + (t?.last_run_fail ?? 0) + (t?.blocked ?? 0);

  const sev: Record<Severity | 'Unrated', number> = { Critical: 0, High: 0, Medium: 0, Low: 0, Unrated: 0 };
  for (const d of s.defects?.items ?? []) sev[d.severity ?? 'Unrated'] += 1;

  const cov = live?.coverage ?? null;
  const gaps = cov ? cov.gaps.filter((g) => g.startsWith(`${s.slug}/`)) : [];

  const matrixRows: MatrixInput[] = rows.length
    ? rows.map((r) => ({ caseId: r.caseId, type: r.type, status: r.status }))
    : // No table read (no live snapshot): fall back to the index's per-type counts, one synthetic row per case.
      Object.entries(s.types ?? {}).flatMap(([type, k]) => [
        ...Array.from({ length: k.pass }, (_, n) => ({ caseId: `${type}#p${n}`, type, status: '✅' })),
        ...Array.from({ length: k.fail }, (_, n) => ({ caseId: `${type}#f${n}`, type, status: '❌' })),
        ...Array.from({ length: k.blocked }, (_, n) => ({ caseId: `${type}#b${n}`, type, status: '⛔' })),
        ...Array.from({ length: Math.max(0, k.cases - k.pass - k.fail - k.blocked) }, (_, n) => ({ caseId: `${type}#n${n}`, type, status: '—' })),
      ]);

  const reportGates = s.report?.gates ?? [];
  const vm: FeatureVM = {
    slug: s.slug,
    title: s.title,
    phase: s.phase,
    phaseIndex: phaseIndex(s.phase),
    steps,
    current,
    inFlight: s.phase !== 'Signed-off',
    cases: { designed: t?.total_cases ?? 0, scripted: t?.scripted ?? 0, passed: pass, failed: t?.last_run_fail ?? 0, blocked: t?.blocked ?? 0, notRun: t?.not_run ?? 0 },
    lastRun: { runId: lastRunId, pass, ran, rate: ran ? Math.round((pass / ran) * 100) : null },
    defects: { open: s.defects?.total_open ?? 0, bySeverity: sev, items: (s.defects?.items ?? []).map((d) => ({ ...d })) },
    quarantine: {
      active: s.quarantine?.active ?? 0,
      expired: s.quarantine?.expired ?? 0,
      nearest: s.quarantine?.nearest_expiry ?? null,
      items: (s.quarantine?.items ?? []).map((q) => ({ caseId: q.case_id, until: q.until, reason: q.reason, ticket: q.ticket, expired: q.expired })),
    },
    coverage: cov
      ? { state: gaps.length ? 'gaps' : 'ok', gaps, path: cov.path, hint: gaps.length ? `${gaps.length} P0/P1 axis gap${gaps.length === 1 ? '' : 's'}` : 'no P0/P1 gaps' }
      : { state: 'unknown', gaps: [], path: null, hint: 'run npm run qa:score' },
    matrix: deriveMatrix(matrixRows, live?.cases ?? new Map(), state.types_enabled, newer),
    gates: reportGates.map((g) => ({ ...g, reverify: /^re-?verify/i.test(g.gate) })),
    report: s.report ? { path: s.report.path, date: s.report.date, overall: s.report.overall, stale: s.report.stale, newerRuns: s.report.newer_runs ?? [], sha: s.report.shipped_sha } : null,
    review: s.review ? { verdict: s.review.verdict, stale: s.review.stale, changed: s.review.changed ?? [], path: s.review.path, date: s.review.date } : null,
    signoff: s.signoff ? { release: s.signoff.release, recommendation: s.signoff.recommendation, date: s.signoff.date, path: s.signoff.path, conditions: s.signoff.conditions ?? [] } : null,
    actions: [],
    overlays,
    percentDone: Math.round((steps.filter((x) => x.key !== 'knowledge' && x.state === 'pass').length / (steps.length - 1)) * 100),
    decisions: { list: decisionList(live?.clarifications.get(s.slug)?.items ?? []), path: live?.clarifications.get(s.slug)?.path ?? null },
    findings: [],
    needsYou: [],
  };
  vm.actions = actions(s, state, vm);
  const events = live?.events ?? [];
  vm.findings = findingList(vm, events.filter((e) => e.slug === s.slug));
  vm.needsYou = needsYou(vm, events);
  return vm;
}

const DECISION_ORDER = ['open', 'assumed', 'answered'];

/**
 * Clarification questions as decisions. An open NON-BLOCKING question with a stated assumption is
 * `assumed`: design goes on, and someone confirms the assumption. Open first (blocking on top).
 */
export function decisionList(items: Clarification[]): DecisionVM[] {
  const vm = items.map((q): DecisionVM => {
    const status = q.status === 'answered' ? 'answered' : !q.blocking && q.assumes ? 'assumed' : 'open';
    return { id: q.id, question: q.question, status, blocking: q.blocking && q.status === 'open', note: status === 'answered' ? q.answer : q.assumes };
  });
  const rank = (d: DecisionVM): number => DECISION_ORDER.indexOf(d.status) * 2 + (d.blocking ? 0 : 1);
  return vm.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}

const SEV_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Unrated: 4 };

/**
 * Everything wrong with a feature, worst first: open defects by severity, then what the activity
 * log found (a flaky or broken case, a failure new since the last run) and the quarantine rows.
 * The log's findings carry no severity, so they sort as Unrated, after every rated defect.
 */
export function findingList(f: Pick<FeatureVM, 'defects' | 'quarantine'>, events: ActivityEvent[]): FindingVM[] {
  const out: FindingVM[] = f.defects.items.map((d) => ({ kind: 'defect', severity: d.severity ?? 'Unrated', id: d.id, title: d.title, path: d.path, at: null }));
  const seen = new Set<string>();
  for (const e of events) {
    if (e.kind !== 'finding' || seen.has(e.title)) continue;
    seen.add(e.title);
    const id = /\b(TC-[A-Z0-9-]+?-\d{3})\b/.exec(e.title)?.[1] ?? '';
    out.push({ kind: /^(Flaky|Broken)\b/.test(e.title) ? 'flaky' : 'failure', severity: 'Unrated', id, title: e.title, path: e.link ?? null, at: e.at });
  }
  for (const q of f.quarantine.items) out.push({ kind: 'quarantine', severity: 'Unrated', id: q.caseId, title: `Quarantined until ${q.until}${q.expired ? ' (expired)' : ''}: ${q.reason}`, path: null, at: null });
  return out.map((x, n) => ({ x, n })).sort((a, b) => SEV_RANK[a.x.severity] - SEV_RANK[b.x.severity] || a.n - b.n).map((a) => a.x);
}

/**
 * What waits on a human. The clarification sheet gives the questions (one batch, /qa-clarify); a
 * report that passed with no sign-off asks for one; the activity log adds what a run asked for.
 * Events for this feature, and project-wide ones (no slug), are both listed.
 */
/**
 * A list of ids short enough for one line: three or fewer are named, more become a range, because
 * a row that names 24 decisions is read as a wall of text and the full list is one click away.
 */
export function idSpan(ids: string[]): string {
  if (ids.length <= 3) return ids.join(', ');
  return `${ids[0]} … ${ids[ids.length - 1]}`;
}

export function needsYou(f: Pick<FeatureVM, 'slug' | 'decisions' | 'report' | 'signoff'>, events: ActivityEvent[]): NeedVM[] {
  const out: NeedVM[] = [];
  const open = f.decisions.list.filter((d) => d.status === 'open');
  const assumed = f.decisions.list.filter((d) => d.status === 'assumed');
  const cmd = `/qa-clarify ${f.slug}`;
  if (open.length) out.push({ need: 'answer-dec', label: NEED_LABEL['answer-dec'], title: `${open.length} open: ${idSpan(open.map((d) => d.id))}`, command: cmd, link: f.decisions.path, at: null });
  if (assumed.length) out.push({ need: 'confirm-dec', label: NEED_LABEL['confirm-dec'], title: `${assumed.length} assumed: ${idSpan(assumed.map((d) => d.id))}`, command: cmd, link: f.decisions.path, at: null });
  if (f.report && f.report.overall === 'pass' && !f.report.stale && !f.signoff) out.push({ need: 'sign-off', label: NEED_LABEL['sign-off'], title: `Report ${f.report.date ?? ''} passed; no sign-off yet`.replace(/\s+/g, ' '), command: `/qa-signoff <release-id> ${f.slug}`, link: f.report.path, at: null });
  for (const n of openNeeds(events.filter((e) => e.slug === f.slug || e.slug === null))) {
    // Questions are counted from the sheet above; an event about one would be said twice.
    if (n.need === 'answer-dec' || n.need === 'confirm-dec') continue;
    out.push({ need: n.need, label: NEED_LABEL[n.need], title: n.title, command: null, link: n.link, at: n.at });
  }
  return out;
}

/**
 * The ten steps for one feature, each read from what the index or a verdict file records:
 * knowledge (wiki cards) → analyze → plan → design (traceability rows) → review (§18 verdict) →
 * script (Scripted ✅) → env (§18 readiness) → run (Status cells) → report → sign-off.
 */
export function pipeline(s: QaSlug, state: QaState, live: LiveSnapshot | undefined, overlays: Overlay[] = []): StepVM[] {
  const t = s.traceability;
  const step = (key: StepKey, st: StepState, detail: string, path: string | null = null, word?: string): StepVM => ({
    key,
    label: STEPS.find((x) => x.key === key)!.label,
    state: st,
    word: word ?? STATE_WORD[st],
    detail,
    path,
    live: null,
  });
  const out: StepVM[] = [];

  const cards = live?.knowledgeCards ?? null;
  out.push(cards ? step('knowledge', 'pass', `${cards} compiled wiki card${cards === 1 ? '' : 's'}`) : step('knowledge', 'idle', 'Optional: /qa-knowledge compiles domain docs into the wiki', null, cards === 0 ? 'no cards' : 'not started'));
  out.push(s.analysis ? step('analyze', 'pass', 'Analysis written', s.analysis) : step('analyze', 'idle', 'No analysis yet'));
  out.push(s.plan ? step('plan', 'pass', 'Test plan written', s.plan) : step('plan', 'idle', 'No test plan yet'));
  out.push(t && t.total_cases > 0 ? step('design', 'pass', `${t.total_cases} case${t.total_cases === 1 ? '' : 's'} in the traceability table`, s.plan) : step('design', 'idle', 'No traceability rows yet'));

  const r = s.review;
  if (!r) out.push(step('review', 'idle', 'No case review yet'));
  else if (r.stale) out.push(step('review', 'stale', `A reviewed case changed since ${r.date}: ${r.changed.join(', ')}`, r.path));
  else if (r.verdict === 'REVISE FIRST') out.push(step('review', 'changes', `REVISE FIRST on ${r.date}${r.stale === null ? ' · staleness unknown (no hashes recorded)' : ''}`, r.path, 'revise first'));
  else if (r.verdict === 'READY FOR /qa-script') out.push(step('review', 'pass', `READY FOR /qa-script on ${r.date} · ${r.reviewed} case${r.reviewed === 1 ? '' : 's'}${r.stale === null ? ' · staleness unknown' : ''}`, r.path, r.stale === null ? 'passed (unhashed)' : 'passed'));
  else out.push(step('review', 'blocked', 'The front matter and body verdicts disagree, so neither is the verdict (§18)', r.path, 'verdict unclear'));

  if (!t || t.total_cases === 0) out.push(step('script', 'idle', 'Nothing to script yet'));
  else if (t.scripted >= t.total_cases) out.push(step('script', 'pass', `${t.scripted}/${t.total_cases} scripted`, s.plan));
  else if (t.scripted > 0) out.push(step('script', 'partial', `${t.scripted}/${t.total_cases} scripted`, s.plan, `${t.scripted}/${t.total_cases} scripted`));
  else out.push(step('script', 'idle', `0/${t.total_cases} scripted`, s.plan));

  // Env checks belong to environments; the feature cares about the types it has cases for.
  const types = Object.keys(s.types ?? {}).filter((k) => (s.types[k]?.cases ?? 0) > 0);
  const envs = state.environments ?? [];
  if (!envs.length) out.push(step('env', 'idle', 'No env check yet (/qa-env <env>)'));
  else {
    const stale = envs.find((e) => e.stale);
    const bad = envs.flatMap((e) => Object.entries(e.verdicts ?? {}).filter(([ty, v]) => v !== 'READY' && (!types.length || types.includes(ty))).map(([ty, v]) => `${ty}: ${v} on ${e.env}`));
    const ready = envs.flatMap((e) => Object.entries(e.verdicts ?? {}).filter(([, v]) => v === 'READY').map(([ty]) => ty));
    if (stale) out.push(step('env', 'stale', `An input of the ${stale.env} check changed: ${stale.changed.join(', ')}`, stale.path));
    else if (bad.length && ready.length) out.push(step('env', 'partial', bad.join(' · '), envs[0].path, 'partly ready'));
    else if (bad.length) out.push(step('env', 'blocked', bad.join(' · '), envs[0].path));
    else out.push(step('env', 'pass', `READY: ${[...new Set(ready)].join(', ')}`, envs[0].path, 'ready'));
  }

  if (!t || t.total_cases - t.not_run <= 0) out.push(step('run', 'idle', 'No case has run yet'));
  else if (t.last_run_fail > 0) out.push(step('run', 'failed', `${t.last_run_pass} pass · ${t.last_run_fail} fail · ${t.blocked} blocked · ${t.not_run} not run`, s.plan));
  else if (t.blocked > 0) out.push(step('run', 'blocked', `${t.last_run_pass} pass · ${t.blocked} blocked · ${t.not_run} not run`, s.plan));
  else if (t.not_run > 0) out.push(step('run', 'partial', `${t.last_run_pass} pass · ${t.not_run} not run`, s.plan, 'partly run'));
  else out.push(step('run', 'pass', `${t.last_run_pass}/${t.total_cases} pass`, s.plan));

  const rep = s.report;
  if (!rep) out.push(step('report', 'idle', 'No report yet'));
  else if (rep.stale) out.push(step('report', 'stale', `The report predates run${rep.newer_runs.length === 1 ? '' : 's'} ${rep.newer_runs.join(', ')}`, rep.path));
  else if (rep.overall === 'pass') out.push(step('report', 'pass', `Report ${rep.date ?? ''}: pass`, rep.path));
  else if (rep.overall === 'fail') out.push(step('report', 'failed', `Report ${rep.date ?? ''}: fail`, rep.path, 'fail'));
  else out.push(step('report', 'blocked', `Report ${rep.date ?? ''}: ${rep.overall ?? 'no overall verdict'}`, rep.path, rep.overall ?? 'no verdict'));

  const so = s.signoff;
  if (!so) out.push(step('signoff', 'idle', 'No sign-off names this feature'));
  else if (so.recommendation === 'GO') out.push(step('signoff', 'pass', `Release ${so.release}: GO (${so.date})`, so.path, 'GO'));
  else if (so.recommendation === 'CONDITIONAL GO') out.push(step('signoff', 'changes', `Release ${so.release}: CONDITIONAL GO — ${so.conditions.length} condition(s)`, so.path, 'conditional GO'));
  else if (so.recommendation === 'NO-GO') out.push(step('signoff', 'failed', `Release ${so.release}: NO-GO (${so.date})`, so.path, 'NO-GO'));
  else out.push(step('signoff', 'blocked', `Release ${so.release}: no recommendation`, so.path, 'no verdict'));

  // Files newer than the index: shown as running, beside — never instead of — what the index said.
  for (const o of overlays) {
    const st = out.find((x) => x.key === o.step);
    if (st && o.step !== 'defects') {
      st.live = { note: o.note };
      st.state = 'running';
      st.word = o.step === 'run' ? 'running' : 'writing';
      if (o.path) st.path = o.path;
    }
  }
  return out;
}

/**
 * Suggested actions, most urgent first. Each restates a recorded state and names the documented
 * command for it. `command` is shown and copied, never run.
 */
export function actions(s: QaSlug, state: QaState, f: Pick<FeatureVM, 'steps' | 'quarantine' | 'defects'>): ActionVM[] {
  const out: ActionVM[] = [];
  const next = s.next_command ?? state.next_command;
  if (typeof next === 'string' && next) out.push({ kind: 'next', title: 'Next command', detail: 'Named by the state builder for this feature.', command: next, path: null });

  if (s.review?.stale) out.push({ kind: 'stale', title: 'Re-run the case review', detail: `${s.review.changed.length || 'A'} reviewed case${s.review.changed.length === 1 ? '' : 's'} changed after the verdict (§18).`, command: `/qa-review ${s.slug}`, path: s.review.path });
  else if (s.review?.verdict === 'REVISE FIRST') out.push({ kind: 'changes', title: 'Revise the cases', detail: 'The case review said REVISE FIRST. Fix the cases it lists, then review again.', command: `/qa-review ${s.slug}`, path: s.review.path });

  for (const e of (state.environments ?? []).filter((x) => x.stale)) out.push({ kind: 'stale', title: `Re-check ${e.env}`, detail: `An input of the readiness check changed: ${e.changed.join(', ') || 'see the report'}.`, command: `/qa-env ${e.env}`, path: e.path });

  if (s.report?.stale) out.push({ kind: 'stale', title: 'Re-run the report', detail: `It predates run${s.report.newer_runs.length === 1 ? '' : 's'} ${s.report.newer_runs.join(', ')}.`, command: `/qa-report ${s.slug}`, path: s.report.path });

  if (f.quarantine.expired) out.push({ kind: 'quarantine', title: `${f.quarantine.expired} quarantine row${f.quarantine.expired === 1 ? '' : 's'} expired`, detail: 'Release or extend it — an expired row fails qa:lint.', command: '/qa-quarantine --list', path: null });

  const sev = f.defects.bySeverity;
  if (sev.Critical + sev.High > 0) out.push({ kind: 'defects', title: `${sev.Critical + sev.High} Critical/High defect${sev.Critical + sev.High === 1 ? '' : 's'} open`, detail: 'Fix, then verify the linked cases.', command: `/qa-defect ${s.slug} --verify`, path: f.defects.items[0]?.path ?? null });

  if (s.signoff?.recommendation === 'NO-GO') out.push({ kind: 'failed', title: `Release ${s.signoff.release} is NO-GO`, detail: 'The sign-off lists what stops it.', command: null, path: s.signoff.path });

  const PHASE_NEXT: Record<string, { title: string; command: string }> = {
    Analyze: { title: 'Write the test plan', command: `/qa-plan ${s.slug}` },
    Plan: { title: 'Design the cases', command: `/qa-design ${s.slug}` },
    Design: { title: s.review ? 'Script the cases' : 'Review the cases', command: s.review ? `/qa-script ${s.slug}` : `/qa-review ${s.slug}` },
    Script: { title: 'Run the scripted cases', command: `/qa-run ${s.slug}` },
    Run: { title: 'Write the report', command: `/qa-report ${s.slug}` },
    Report: { title: 'Sign off the release', command: `/qa-signoff <release-id> ${s.slug}` },
  };
  const p = PHASE_NEXT[s.phase];
  if (p && !out.some((a) => a.command === p.command)) out.push({ kind: 'continue', title: p.title, detail: `Phase ${s.phase} → ${QA_PHASES[Math.min(QA_PHASES.length - 1, phaseIndex(s.phase) + 1)]}.`, command: p.command, path: null });
  if (!out.length) out.push({ kind: 'done', title: 'Signed off', detail: 'Nothing is waiting on this feature.', command: null, path: null });
  return out;
}

/** The feature the status bar names: furthest along that is still in flight. */
export function activeFeature(vm: BoardVM): FeatureVM | null {
  if (!vm.ok) return null;
  const inFlight = vm.features.filter((f) => f.inFlight);
  const pool = inFlight.length ? inFlight : vm.features;
  return [...pool].sort((a, b) => b.phaseIndex - a.phaseIndex || a.slug.localeCompare(b.slug))[0] ?? null;
}
