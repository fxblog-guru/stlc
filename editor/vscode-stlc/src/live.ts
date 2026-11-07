/**
 * The realtime layer: what the QA files say, read directly, including what has happened since
 * `qa/state.json` was last written.
 *
 * The index is rebuilt by the Stop hook at the end of a turn. A `/qa-run` that takes forty minutes
 * writes run folders, `summary.md`, `failures.md`, traces and defects the whole time, and none of it
 * reached the board until the turn ended. This file reads those files cheaply and hands them to the
 * view model:
 *
 * - **runs** — every `runs/<type>/<slug>/<run-id>/` and `runs/plans/<name>/<run-id>/`, with its
 *   `summary.md` counts and case rows, `failures.md` triage tokens, the Playwright HTML report and traces;
 * - **run plans** — `run-plans/*.md` front matter and the generated `## Resolved cases` table (§19);
 * - **traceability rows** — each slug's current test plan, for the platform × type matrix;
 * - **case platforms** — a case's `**Platform:**` header, `@platform:` tag or `## Platforms` section;
 * - **coverage score** — a saved `reports/**\/coverage-score*.md` (`npm run qa:score` output);
 * - **bundle version and update notice** — `.claude/.agentic-fx.json`, `.claude/.agentic-fx-updates.json`, `VERSION`;
 * - **clarifications** — each slug's newest `analysis/<slug>/<date>-clarifications.md` (/qa-clarify);
 * - **activity** — commits from `.git/logs/HEAD` (no git process), the files above, and the bundle's
 *   own events in `logs/activity.jsonl` (docs/activity-format.md).
 *
 * It decides no verdict. Anything seen in files newer than the index is marked *inferred*, with a
 * note saying which file, and the next rebuild replaces it.
 *
 * This file must not import `vscode`: the tests run it under plain Node.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ActivityEvent, parseActivity } from './activity';
import { QaState } from './model';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const reltime: { relativeTime(at: number | string, now?: number): string } = require('../media/reltime.js');

/** Shared with the page, so the host and the board never disagree about "2 min ago". */
export function relativeTime(at: number | string, now?: number): string {
  return reltime.relativeTime(at, now);
}

// ---- classifying a file event -------------------------------------------------------------------

export type LiveKind = 'state' | 'run' | 'failures' | 'report' | 'defect' | 'run-plan' | 'quarantine' | 'plan' | 'case' | 'review' | 'git' | 'bundle' | 'activity' | 'clarify';

/**
 * Which source a changed path belongs to, or null for one the board does not read. `rel` is
 * relative to the project root. Dot folders are ignored except `.git` and the two installer files
 * in `.claude/` — `.claude/worktrees` holds agent copies of the same files.
 */
export function classify(rel: string, qaRoot = 'qa'): LiveKind | null {
  const parts = rel.replace(/\\/g, '/').split('/').filter(Boolean);
  if (!parts.length) return null;
  if (parts[0] === '.git') {
    const tail = parts.slice(1).join('/');
    return tail === 'HEAD' || tail === 'logs/HEAD' || tail.startsWith('refs/heads/') ? 'git' : null;
  }
  if (parts[0] === '.claude' && parts.length === 2 && (parts[1] === '.agentic-fx.json' || parts[1] === '.agentic-fx-updates.json')) return 'bundle';
  if (parts.length === 1 && parts[0] === 'VERSION') return 'bundle';
  const qa = qaRoot.replace(/\\/g, '/').split('/').filter(Boolean);
  if (qa.some((d, n) => parts[n] !== d)) return null;
  // The root itself may be a dot folder (`.stlc`, CONTRACTS §2); a dot segment anywhere else is a copy or scratch.
  const p = parts.slice(qa.length);
  if (p.some((s) => s.startsWith('.'))) return null;
  const last = p[p.length - 1] ?? '';
  if (p.length === 1 && last === 'state.json') return 'state';
  if (p[0] === 'runs' && p[1] !== 'env-checks' && p.length >= 4) return last === 'failures.md' ? 'failures' : 'run';
  if (p[0] === 'runs' && p[1] === 'env-checks') return 'run';
  if (p[0] === 'reports' && p.length >= 2) return 'report';
  if (p[0] === 'defects' && last.endsWith('.md')) return 'defect';
  if (p[0] === 'run-plans' && p.length === 2 && last.endsWith('.md')) return 'run-plan';
  if (p[0] === 'regression' && last === 'quarantine.md') return 'quarantine';
  if (p[0] === 'plans' && last.endsWith('.md')) return 'plan';
  if (p[0] === 'cases' && last.endsWith('.md')) return 'case';
  if (p[0] === 'reviews' && last.endsWith('.md')) return 'review';
  if (p.length === 2 && p[0] === 'logs' && last === 'activity.jsonl') return 'activity';
  if (p[0] === 'analysis' && last.endsWith('-clarifications.md')) return 'clarify';
  return null;
}

// ---- timing ---------------------------------------------------------------------------------------

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

export const realTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

/**
 * Collects events and flushes them once the burst is over: a Playwright run writes hundreds of
 * files in a second, and the board should redraw once, after the last of them. `maxWait` bounds the
 * delay, so a file rewritten every 200 ms still redraws about once a second.
 */
export class Debouncer<K> {
  private pending = new Set<K>();
  private handle: unknown;
  private firstAt: number | undefined;

  constructor(
    private readonly flush: (kinds: Set<K>) => void,
    private readonly waitMs = 300,
    private readonly timers: Timers = realTimers,
    private readonly maxWaitMs = 1500,
  ) {}

  push(kind: K): void {
    this.pending.add(kind);
    const now = this.timers.now();
    this.firstAt ??= now;
    if (this.handle !== undefined) this.timers.clearTimeout(this.handle);
    const wait = Math.max(0, Math.min(this.waitMs, this.firstAt + this.maxWaitMs - now));
    this.handle = this.timers.setTimeout(() => this.fire(), wait);
  }

  fire(): void {
    if (this.handle !== undefined) this.timers.clearTimeout(this.handle);
    this.handle = undefined;
    this.firstAt = undefined;
    if (!this.pending.size) return;
    const kinds = this.pending;
    this.pending = new Set();
    this.flush(kinds);
  }

  dispose(): void {
    if (this.handle !== undefined) this.timers.clearTimeout(this.handle);
    this.handle = undefined;
    this.pending.clear();
  }
}

/**
 * Runs a task at most once per `intervalMs`, with one trailing run for requests that arrived inside
 * the window, and never two at once. Used for the optional background `build-state.mjs` (as in vscode-sdlc).
 */
export class Throttle {
  private lastStart = -Infinity;
  private running = false;
  private queued = false;
  private handle: unknown;

  constructor(
    private readonly task: () => Promise<void>,
    private readonly intervalMs: number,
    private readonly timers: Timers = realTimers,
  ) {}

  request(): void {
    if (this.running || this.handle !== undefined) {
      this.queued = true;
      return;
    }
    const wait = this.lastStart + this.intervalMs - this.timers.now();
    if (wait > 0) {
      this.handle = this.timers.setTimeout(() => {
        this.handle = undefined;
        void this.start();
      }, wait);
      return;
    }
    void this.start();
  }

  private async start(): Promise<void> {
    this.running = true;
    this.queued = false;
    this.lastStart = this.timers.now();
    try {
      await this.task();
    } catch {
      // A failed rebuild leaves the old index in place; the board keeps showing the live overlay.
    } finally {
      this.running = false;
      if (this.queued) {
        this.queued = false;
        this.request();
      }
    }
  }

  dispose(): void {
    if (this.handle !== undefined) this.timers.clearTimeout(this.handle);
    this.handle = undefined;
    this.queued = false;
  }
}

// ---- markdown helpers -----------------------------------------------------------------------------

/** Splits one markdown table row, keeping escaped pipes inside cells. */
function cells(line: string): string[] {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return body.split(/(?<!\\)\|/).map((c) => c.trim());
}

const plain = (s: string | undefined): string => (s ?? '').replace(/[`*]/g, '').trim();
const dash = (s: string | undefined): string | null => {
  const v = plain(s);
  return v && v !== '—' && v !== '-' ? v : null;
};

/**
 * Every table in `text` whose header names all of `required` (case-insensitive), as rows keyed by
 * lower-cased header. Columns are found by name, so a reordered table still reads.
 */
export function tables(text: string, required: string[]): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  let head: string[] | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) {
      head = undefined;
      continue;
    }
    const c = cells(line);
    if (!head) {
      const h = c.map((x) => plain(x).toLowerCase());
      head = required.every((r) => h.includes(r)) ? h : [];
      continue;
    }
    if (!head.length || c.every((x) => /^:?-{2,}:?$/.test(x))) continue;
    const row: Record<string, string> = {};
    head.forEach((h, n) => (row[h] = c[n] ?? ''));
    out.push(row);
  }
  return out;
}

/**
 * A small YAML subset — the front matter the QA artifacts use: `key: value`, `key: [a, b]`,
 * `key: { a: X, b: Y }`, and one level of nested `key:` blocks of the same. Enough for run plans
 * (§19), reports and update notices; anything else is left as a raw string.
 */
export function parseFrontMatter(text: string): Record<string, unknown> | null {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const out: Record<string, unknown> = {};
  let block: Record<string, unknown> | null = null;
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim()) continue;
    const kv = /^(\s*)([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, indent, key, rest] = kv;
    if (!indent) {
      if (rest === '') {
        block = {};
        out[key] = block;
      } else {
        block = null;
        out[key] = scalar(rest);
      }
    } else if (block) {
      block[key] = scalar(rest);
    }
  }
  return out;
}

function scalar(v: string): unknown {
  const t = v.trim();
  if (t.startsWith('[') && t.endsWith(']')) {
    return t
      .slice(1, -1)
      .split(',')
      .map((x) => x.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  if (t.startsWith('{') && t.endsWith('}')) {
    const o: Record<string, string> = {};
    for (const part of t.slice(1, -1).split(',')) {
      const [k, ...rest] = part.split(':');
      if (k && rest.length) o[k.trim()] = rest.join(':').trim().replace(/^["']|["']$/g, '');
    }
    return o;
  }
  if (/^-?\d+$/.test(t)) return Number(t);
  if (t === 'true' || t === 'false') return t === 'true';
  if (t === 'null' || t === '~') return null;
  return t.replace(/^["']|["']$/g, '');
}

// ---- parsers --------------------------------------------------------------------------------------

/** A row of the §3 traceability table. */
export interface TraceRow {
  req: string;
  caseId: string;
  type: string;
  module: string;
  priority: string;
  scripted: boolean;
  lastRun: string | null;
  status: string;
  report: string | null;
}

/** The plan's `## Traceability` table, read by header name. */
export function parseTraceability(text: string): TraceRow[] {
  return tables(text, ['case id', 'type', 'status']).map((r) => ({
    req: plain(r.req),
    caseId: plain(r['case id']),
    type: plain(r.type).toLowerCase(),
    module: plain(r.module),
    priority: plain(r.priority),
    scripted: (r.scripted ?? '').includes('✅'),
    lastRun: dash(r['last run']),
    status: plain(r.status),
    report: dash(r.report),
  })).filter((r) => /^TC-/.test(r.caseId));
}

export interface CaseHeader {
  id: string;
  type: string | null;
  platforms: string[];
  /** Where the platforms came from; null when the case names none. */
  platformSource: 'header' | 'tag' | 'section' | null;
}

/**
 * The few things the matrix needs from a case file: its id, its `**Type:**`, and its platforms —
 * `**Platform:** web, android` (or `**Platforms:**`), `@platform:<p>` tags, or the mobile
 * `## Platforms` section (§15), in that order of precedence.
 */
export function parseCaseHeader(text: string): CaseHeader | null {
  const id = /^#\s+(TC-[A-Z0-9-]+?-\d{3})\b/m.exec(text)?.[1];
  if (!id) return null;
  const type = /\*\*Type:\*\*\s*`?([a-z]+)/.exec(text)?.[1] ?? null;
  const split = (s: string): string[] => s.split(/[,\s/·]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z][\w:-]*$/.test(x));
  const header = /\*\*Platforms?:\*\*\s*`?([^*\n`]+)/.exec(text);
  if (header && split(header[1]).length) return { id, type, platforms: split(header[1]), platformSource: 'header' };
  const tags = [...text.matchAll(/@platform:([a-z][\w:-]*)/gi)].map((m) => m[1].toLowerCase());
  if (tags.length) return { id, type, platforms: [...new Set(tags)], platformSource: 'tag' };
  const section = /^## Platforms\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  if (section) {
    const found = ['android', 'ios'].filter((p) => new RegExp(`\\b${p}\\b`, 'i').test(section[1]));
    if (found.length) return { id, type, platforms: found, platformSource: 'section' };
  }
  return { id, type, platforms: [], platformSource: null };
}

export interface RunPlanCase {
  id: string;
  type: string;
  module: string;
  priority: string;
  feature: string;
  script: string;
  manual: boolean;
}

export interface RunPlan {
  name: string;
  description: string;
  env: string | null;
  owner: string | null;
  select: Record<string, unknown>;
  browsers: string[];
  shards: number | null;
  cases: RunPlanCase[];
  /** False when the file has no `## Resolved cases` table yet (`run-plan.mjs resolve` not run). */
  resolved: boolean;
}

/** A run plan (§19): its front matter and the generated `## Resolved cases` table. */
export function parseRunPlan(text: string, fallbackName = ''): RunPlan {
  const fm = parseFrontMatter(text) ?? {};
  const section = /^## Resolved cases\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  const rows = section ? tables(section[1], ['case id', 'type', 'script']) : [];
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);
  return {
    name: typeof fm.name === 'string' ? fm.name : fallbackName,
    description: typeof fm.description === 'string' ? fm.description : '',
    env: typeof fm.env === 'string' ? fm.env : null,
    owner: typeof fm.owner === 'string' ? fm.owner : null,
    select: (fm.select && typeof fm.select === 'object' ? fm.select : {}) as Record<string, unknown>,
    browsers: list(fm.browsers),
    shards: typeof fm.shards === 'number' ? fm.shards : null,
    resolved: !!section,
    cases: rows
      .map((r) => ({
        id: plain(r['case id']),
        type: plain(r.type).toLowerCase(),
        module: plain(r.module),
        priority: plain(r.priority),
        feature: plain(r.feature),
        script: plain(r.script),
        manual: plain(r.script).toLowerCase() === 'manual',
      }))
      .filter((c) => /^TC-/.test(c.id)),
  };
}

export type CaseVerdict = 'pass' | 'fail' | 'blocked' | 'handoff' | 'manual' | 'not-run';

/** A §3 Status cell in one word: ✅ pass · ❌ fail · ⛔ blocked (or awaiting handoff) · anything else not run. */
export function verdictOf(status: string): CaseVerdict {
  const s = status.trim();
  if (s.startsWith('✅')) return 'pass';
  if (s.startsWith('❌')) return 'fail';
  if (s.startsWith('⛔')) return /handoff/i.test(s) ? 'handoff' : 'blocked';
  if (/^manual$/i.test(s)) return 'manual';
  return 'not-run';
}

export interface RunSummary {
  plan: string | null;
  env: string | null;
  sha: string | null;
  counts: { pass: number; fail: number; blocked: number; manual: number; total: number };
  cases: { id: string; type: string; feature: string | null; status: string; verdict: CaseVerdict; detail: string | null }[];
}

/**
 * A run's `summary.md`. Run-plan summaries are generated with a fixed shape (§19); per-type
 * summaries written by executing-tests are looser, so cases are read from any table with
 * `Case ID` and `Status`, and the counts are summed from them when no counts table is there.
 */
export function parseRunSummary(text: string): RunSummary {
  const field = (k: string): string | null => {
    const m = new RegExp(`\\*\\*${k}:\\*\\*\\s*([^*\\n]+?)(?=\\s{2,}\\*\\*|\\s*$)`, 'm').exec(text);
    return m ? dash(m[1].replace(/\(`[^`]*`\)/, '')) : null;
  };
  const cases = tables(text, ['case id', 'status']).map((r) => ({
    id: plain(r['case id']),
    type: plain(r.type).toLowerCase(),
    feature: dash(r.feature),
    status: plain(r.status),
    verdict: verdictOf(plain(r.status)),
    detail: dash(r.detail),
  })).filter((c) => /^TC-/.test(c.id));
  const counted = tables(text, ['type', 'pass', 'fail']);
  const counts = { pass: 0, fail: 0, blocked: 0, manual: 0, total: 0 };
  if (counted.length) {
    for (const r of counted) {
      const n = (k: string): number => Number.parseInt(plain(r[k]), 10) || 0;
      counts.pass += n('pass');
      counts.fail += n('fail');
      counts.blocked += n('blocked');
      counts.manual += n('manual');
      counts.total += n('selected') || n('pass') + n('fail') + n('blocked') + n('manual');
    }
  } else {
    for (const c of cases) {
      counts.total += 1;
      if (c.verdict === 'pass') counts.pass += 1;
      else if (c.verdict === 'fail') counts.fail += 1;
      else if (c.verdict === 'blocked' || c.verdict === 'handoff') counts.blocked += 1;
      else if (c.verdict === 'manual') counts.manual += 1;
    }
  }
  return { plan: field('Run plan')?.split(/\s+/)[0] ?? null, env: field('Env'), sha: field('Git SHA'), counts, cases };
}

/** The four triage classes of executing-tests Step 4, spelled as the board shows them. */
export type Triage = 'FUNCTIONAL' | 'SCRIPT' | 'SETUP-ENV' | 'FLAKY';

export interface FailureEntry {
  caseId: string;
  triage: Triage | null;
  error: string | null;
  next: string | null;
}

const TRIAGE_RE = /\b(FUNCTIONAL|SCRIPT|SETUP\/ENV|SETUP-ENV|FLAKY)\b/;

/**
 * `failures.md` (executing-tests Step 4): one entry per non-pass, each with a Case ID and a
 * suspected cause classified FUNCTIONAL · SCRIPT · SETUP/ENV · FLAKY. Read as a table when there
 * is one, else as one heading-led block per case. An entry with no class keeps `triage: null` —
 * an unclassified failure is shown as such, never given a class.
 */
export function parseFailures(text: string): FailureEntry[] {
  const norm = (t: string | undefined): Triage | null => {
    const m = TRIAGE_RE.exec(t ?? '');
    return m ? ((m[1] === 'SETUP/ENV' ? 'SETUP-ENV' : m[1]) as Triage) : null;
  };
  const rows = tables(text, ['case id']);
  if (rows.length) {
    return rows
      .filter((r) => /^TC-/.test(plain(r['case id'])))
      .map((r) => {
        const cause = r['suspected cause'] ?? r.cause ?? r.class ?? r.triage ?? Object.values(r).join(' ');
        return { caseId: plain(r['case id']), triage: norm(cause), error: dash(r.error), next: dash(r['next step'] ?? r.next) };
      });
  }
  const out: FailureEntry[] = [];
  const blocks = text.split(/^(?=#{2,4}\s)/m);
  for (const b of blocks) {
    const id = /\b(TC-[A-Z0-9-]+?-\d{3})\b/.exec(b.split(/\r?\n/)[0] ?? '')?.[1];
    if (!id) continue;
    const error = /\*\*Error:?\*\*:?\s*(.+)/.exec(b)?.[1] ?? null;
    const next = /\*\*Next step:?\*\*:?\s*(.+)/.exec(b)?.[1] ?? null;
    const causeLine = /\*\*(?:Suspected cause|Cause|Class):?\*\*:?\s*(.+)/.exec(b)?.[1] ?? b;
    out.push({ caseId: id, triage: norm(causeLine), error: error ? plain(error).slice(0, 220) : null, next: next ? plain(next) : null });
  }
  return out;
}

/** One question of `analysis/<slug>/<date>-clarifications.md` (/qa-clarify): stlc's decision ledger. */
export interface Clarification {
  id: string;
  question: string;
  blocking: boolean;
  status: 'open' | 'answered';
  /** "QA assumes meanwhile": what design proceeds on while the question is open. */
  assumes: string | null;
  answer: string | null;
}

/**
 * The `### Q-NNN [BLOCKING|NON-BLOCKING] — <question>` blocks and their `**Status:**` line. A
 * question with no ANSWERED status is open: an unread status never closes a question.
 */
export function parseClarifications(text: string): Clarification[] {
  const out: Clarification[] = [];
  for (const b of text.replace(/<!--[\s\S]*?-->/g, '').split(/^(?=###\s+Q-)/m)) {
    const head = /^###\s+(Q-\d+)\s*\[(BLOCKING|NON-BLOCKING)\]\s*[—–-]\s*(.+)$/m.exec(b);
    if (!head) continue;
    const status = /\*\*Status:\*\*\s*(.+)/.exec(b)?.[1].trim() ?? 'OPEN';
    const answered = /^ANSWERED\b/i.test(status);
    const assumes = /\*\*QA assumes meanwhile:\*\*\s*(.+?)(?:\s+[—–-]\s+\*\*cost if wrong|$)/m.exec(b)?.[1] ?? null;
    out.push({
      id: head[1],
      question: plain(head[3]),
      blocking: head[2] === 'BLOCKING',
      status: answered ? 'answered' : 'open',
      assumes: assumes ? plain(assumes) : null,
      answer: answered ? plain(status.replace(/^ANSWERED\s*[—–-]?\s*/i, '')) || null : null,
    });
  }
  return out;
}

export interface CoverageScore {
  reqs: number | null;
  blocking: number;
  gaps: string[];
}

/**
 * A saved `npm run qa:score` output: the closing summary line and the `GAP <slug>/<REQ>/<axis>`
 * lines. A P0/P1 requirement missing a required axis is a blocking gap (case-score.mjs).
 */
export function parseCoverageScore(text: string): CoverageScore | null {
  const sum = /case-score\s+—\s+(\d+)\s+REQ\(s\),\s+(\d+)\s+blocking gap/.exec(text);
  const gaps = [...text.matchAll(/^\s*GAP\s+(\S+)/gm)].map((m) => m[1]);
  if (!sum && !gaps.length) return null;
  return { reqs: sum ? Number(sum[1]) : null, blocking: sum ? Number(sum[2]) : gaps.length, gaps };
}

export type UpdateKind = 'patch' | 'minor' | 'major' | 'none' | 'unknown';

export interface UpdateNotice {
  checkedAt: string | null;
  installed: string | null;
  latest: string | null;
  kind: UpdateKind;
  command: string;
  changelogUrl: string | null;
}

/**
 * The installer's no-network notice, `.claude/.agentic-fx-updates.json`:
 * `{checked_at, bundles: {qa: {installed, latest, kind, command, changelog_url}}}`.
 * Unreadable, malformed or missing the bundle → null, and the board shows a plain pill.
 */
export function parseUpdateNotice(text: string, bundle = 'qa'): UpdateNotice | null {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
  const b = rec(rec(rec(j)?.bundles)?.[bundle]);
  if (!b) return null;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const kinds: UpdateKind[] = ['patch', 'minor', 'major', 'none', 'unknown'];
  const kind = kinds.includes(b.kind as UpdateKind) ? (b.kind as UpdateKind) : 'unknown';
  const url = str(b.changelog_url);
  return {
    checkedAt: str(rec(j)?.checked_at),
    installed: str(b.installed),
    latest: str(b.latest),
    kind,
    // Data never picks what runs: one of two fixed commands, by the installer that wrote the notice.
    command: str(b.source)?.startsWith('npm:') ? `npx agentic-fx@latest update --bundle ${bundle}` : `afx update --bundle ${bundle}`,
    changelogUrl: url && /^https?:\/\//.test(url) ? url : null,
  };
}

/** The installed bundle version from the install manifest's `qa` entry, or null. */
export function parseManifestVersion(text: string, bundle = 'qa'): { version: string; commit: string | null } | null {
  try {
    const j = JSON.parse(text) as Record<string, { version?: unknown; commit?: unknown }>;
    const e = j?.[bundle];
    if (e && typeof e.version === 'string' && e.version) return { version: e.version, commit: typeof e.commit === 'string' ? e.commit : null };
  } catch {
    // fall through
  }
  return null;
}

export interface Commit {
  sha: string;
  subject: string;
  at: number;
}

/** The newest commits from the reflog — one file read and no process. */
export function parseReflog(text: string, limit = 10): Commit[] {
  const out: Commit[] = [];
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (let n = lines.length - 1; n >= 0 && out.length < limit; n--) {
    const m = /^[0-9a-f]{40} ([0-9a-f]{40}) .*? (\d{9,}) [+-]\d{4}\t([^:]+): ?(.*)$/.exec(lines[n]);
    if (!m) continue;
    const kind = m[3].trim();
    if (!kind.startsWith('commit') && !kind.startsWith('merge')) continue;
    out.push({ sha: m[1].slice(0, 7), subject: kind.startsWith('merge') && !kind.startsWith('commit') ? `Merge ${kind.slice(6)}` : m[4], at: Number(m[2]) * 1000 });
  }
  return out;
}

/** The git directory that owns `root`, following a worktree's `.git` file. Looks a few levels up. */
export function findGitDir(root: string): string | undefined {
  let dir = root;
  for (let n = 0; n < 6; n++) {
    const candidate = path.join(dir, '.git');
    try {
      const st = fs.statSync(candidate);
      if (st.isDirectory()) return candidate;
      const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(candidate, 'utf8'));
      if (m) return path.resolve(dir, m[1].trim());
    } catch {
      // keep looking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

// ---- the snapshot ---------------------------------------------------------------------------------

export type ActivityKind = 'commit' | 'run' | 'failures' | 'report' | 'defect' | 'run-plan' | 'quarantine' | 'state' | 'finding' | 'heal' | 'lesson' | 'stop' | 'clarify';

export interface ActivityItem {
  kind: ActivityKind;
  title: string;
  detail: string | null;
  at: number;
  path: string | null;
}

export interface RunRecord {
  /** `type` = runs/<type>/<slug>/<id>; `plan` = runs/plans/<name>/<id>. */
  kind: 'type' | 'plan';
  /** The test type, or the plan name. */
  group: string;
  slug: string | null;
  runId: string;
  dir: string;
  mtime: number;
  summary: RunSummary | null;
  summaryPath: string | null;
  failures: FailureEntry[];
  failuresPath: string | null;
  htmlReport: string | null;
  traces: string[];
}

export interface RunPlanRecord {
  path: string;
  plan: RunPlan;
  mtime: number;
  lastRun: RunRecord | null;
}

export interface Overlay {
  step: 'run' | 'report' | 'defects';
  note: string;
  at: number;
  path: string | null;
}

export interface LiveSnapshot {
  /** Events from `<qa root>/logs/activity.jsonl` (docs/activity-format.md), newest first. */
  events: ActivityEvent[];
  /** Each slug's newest clarifications file: its questions and where it is. */
  clarifications: Map<string, { path: string; at: number; items: Clarification[] }>;
  branch: string | null;
  head: string | null;
  activity: ActivityItem[];
  lastEventAt: number | null;
  /** True when anything shown came from files newer than the index. */
  ahead: boolean;
  traceRows: Map<string, TraceRow[]>;
  cases: Map<string, CaseHeader>;
  runs: RunRecord[];
  runPlans: RunPlanRecord[];
  coverage: (CoverageScore & { path: string; at: number }) | null;
  bundle: { version: string; source: 'manifest' | 'VERSION'; commit: string | null } | null;
  update: UpdateNotice | null;
  knowledgeCards: number | null;
  overlays: Map<string, Overlay[]>;
}

interface FileCache {
  mtime: number;
  size: number;
  value: unknown;
}

const RUN_ID_RE = /^\d{4}-\d{2}-\d{2}-\d{4}$/;
const RUN_TYPES = ['unit', 'api', 'integration', 'e2e', 'ui', 'security', 'performance', 'accessibility', 'mobile'];

/**
 * Reads the QA sources for one project. Files are re-parsed only when their mtime or size moved,
 * so a redraw after one new summary costs a few `stat` calls and one read.
 */
export class LiveReader {
  private readonly cache = new Map<string, FileCache>();

  constructor(private readonly qaRoot = 'qa') {}

  private read<T>(file: string, parse: (text: string) => T): { value: T; mtime: number } | undefined {
    let st: fs.Stats;
    const key = `${parse.name}|${file}`;
    try {
      st = fs.statSync(file);
    } catch {
      this.cache.delete(key);
      return undefined;
    }
    const hit = this.cache.get(key);
    if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) return { value: hit.value as T, mtime: st.mtimeMs };
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      return undefined;
    }
    const value = parse(text);
    this.cache.set(key, { mtime: st.mtimeMs, size: st.size, value });
    return { value, mtime: st.mtimeMs };
  }

  snapshot(projectRoot: string, state: QaState): LiveSnapshot {
    const generatedAt = Date.parse(state.generated_at);
    const indexAt = Number.isFinite(generatedAt) ? generatedAt : 0;
    const qa = path.join(projectRoot, this.qaRoot);
    const rel = (abs: string): string => path.relative(projectRoot, abs).split(path.sep).join('/');
    const newer = (mtime: number): boolean => indexAt > 0 && mtime > indexAt + 1000;
    const activity: ActivityItem[] = [];
    const overlays = new Map<string, Overlay[]>();
    const overlay = (slug: string, o: Overlay): void => {
      const list = overlays.get(slug) ?? [];
      list.push(o);
      overlays.set(slug, list);
    };
    let ahead = false;

    // git — branch and the newest commits, from files only.
    let branch: string | null = null;
    let head: string | null = null;
    const gitDir = findGitDir(projectRoot);
    if (gitDir) {
      const h = this.read(path.join(gitDir, 'HEAD'), function gitHead(t) {
        return t.trim();
      });
      if (h) {
        const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(h.value);
        branch = ref ? ref[1] : null;
        head = ref ? null : h.value.slice(0, 7);
      }
      const log = this.read(path.join(gitDir, 'logs', 'HEAD'), function reflog(t) {
        return parseReflog(t, 10);
      });
      for (const c of log?.value ?? []) activity.push({ kind: 'commit', title: c.subject, detail: c.sha, at: c.at, path: null });
      if (!head && log?.value[0]) head = log.value[0].sha;
    }
    if (indexAt) activity.push({ kind: 'state', title: 'Index rebuilt', detail: `builder ${state.generator_version}`, at: indexAt, path: null });

    // traceability rows of each slug's current plan
    const traceRows = new Map<string, TraceRow[]>();
    for (const s of state.slugs) {
      if (!s.plan) continue;
      const r = this.read(path.join(projectRoot, ...s.plan.split('/')), parseTraceability);
      if (r) traceRows.set(s.slug, r.value);
    }

    // case headers — id, type, platforms
    const cases = new Map<string, CaseHeader>();
    for (const file of walk(path.join(qa, 'cases'), 5, (n) => n.endsWith('.md') && n.startsWith('TC-'))) {
      const r = this.read(file, parseCaseHeader);
      if (r?.value) cases.set(r.value.id, r.value);
    }

    // run folders
    const runs: RunRecord[] = [];
    const runsDir = path.join(qa, 'runs');
    const addRun = (kind: 'type' | 'plan', group: string, slug: string | null, dir: string, runId: string): void => {
      const summaryFile = path.join(dir, 'summary.md');
      const failuresFile = path.join(dir, 'failures.md');
      const summary = this.read(summaryFile, parseRunSummary);
      const failures = this.read(failuresFile, parseFailures);
      const mtime = Math.max(statMs(dir), summary?.mtime ?? 0, failures?.mtime ?? 0);
      const html = path.join(dir, 'html-report', 'index.html');
      runs.push({
        kind,
        group,
        slug,
        runId,
        dir: rel(dir),
        mtime,
        summary: summary?.value ?? null,
        summaryPath: summary ? rel(summaryFile) : null,
        failures: failures?.value ?? [],
        failuresPath: failures ? rel(failuresFile) : null,
        htmlReport: fs.existsSync(html) ? rel(html) : null,
        traces: [],
      });
    };
    for (const type of RUN_TYPES) {
      for (const slug of safeList(path.join(runsDir, type))) {
        for (const id of safeList(path.join(runsDir, type, slug))) if (RUN_ID_RE.test(id)) addRun('type', type, slug, path.join(runsDir, type, slug, id), id);
      }
    }
    for (const name of safeList(path.join(runsDir, 'plans'))) {
      for (const id of safeList(path.join(runsDir, 'plans', name))) if (RUN_ID_RE.test(id)) addRun('plan', name, null, path.join(runsDir, 'plans', name, id), id);
    }
    runs.sort((a, b) => (b.runId === a.runId ? b.mtime - a.mtime : b.runId > a.runId ? 1 : -1));
    // Traces only for the newest few runs: a Playwright run can hold hundreds of result folders.
    for (const r of runs.slice(0, 3)) {
      r.traces = walk(path.join(projectRoot, ...r.dir.split('/'), 'test-results'), 3, (n) => n === 'trace.zip').slice(0, 20).map(rel);
    }
    for (const r of runs.slice(0, 6)) {
      const where = r.kind === 'plan' ? `plan ${r.group}` : `${r.group} · ${r.slug}`;
      const c = r.summary?.counts;
      activity.push({
        kind: r.failuresPath && r.failures.length ? 'failures' : 'run',
        title: r.summary ? `Run ${r.runId} — ${where}` : `Run ${r.runId} started — ${where}`,
        detail: c ? `${c.pass} pass · ${c.fail} fail · ${c.blocked} blocked` : 'no summary yet',
        at: r.mtime,
        path: r.summaryPath ?? r.failuresPath,
      });
    }
    // Inferred: a run folder for a slug written after the index.
    for (const r of runs) {
      if (!newer(r.mtime)) continue;
      const slugs = r.slug ? [r.slug] : [...new Set((r.summary?.cases ?? []).map((c) => c.feature).filter((f): f is string => !!f))];
      for (const slug of slugs) {
        if ((overlays.get(slug) ?? []).some((o) => o.step === 'run')) continue;
        overlay(slug, {
          step: 'run',
          note: r.summary ? `Inferred: run ${r.runId} wrote its summary after the index was built.` : `Inferred: run ${r.runId} is in progress (no summary.md yet).`,
          at: r.mtime,
          path: r.summaryPath,
        });
        ahead = true;
      }
    }

    // run plans
    const runPlans: RunPlanRecord[] = [];
    const plansDir = path.join(qa, 'run-plans');
    for (const name of safeList(plansDir).filter((n) => n.endsWith('.md') && !n.startsWith('_') && n.toLowerCase() !== 'readme.md')) {
      const file = path.join(plansDir, name);
      const r = this.read(file, function runPlan(t) {
        return parseRunPlan(t, name.replace(/\.md$/, ''));
      });
      if (!r) continue;
      runPlans.push({ path: rel(file), plan: r.value, mtime: r.mtime, lastRun: runs.find((x) => x.kind === 'plan' && x.group === r.value.name) ?? null });
      if (newer(r.mtime)) activity.push({ kind: 'run-plan', title: `Run plan ${r.value.name} updated`, detail: `${r.value.cases.length} case(s)`, at: r.mtime, path: rel(file) });
    }
    runPlans.sort((a, b) => a.plan.name.localeCompare(b.plan.name));

    // reports — the newest of each slug, a coverage score, release sign-offs
    let coverage: LiveSnapshot['coverage'] = null;
    for (const file of walk(path.join(qa, 'reports'), 3, (n) => n.endsWith('.md'))) {
      const name = path.basename(file);
      const mtime = statMs(file);
      if (/^coverage-score.*\.md$/.test(name)) {
        const c = this.read(file, parseCoverageScore);
        if (c?.value && (!coverage || c.mtime > coverage.at)) coverage = { ...c.value, path: rel(file), at: c.mtime };
        continue;
      }
      if (!/^\d{4}-\d{2}-\d{2}-(report|signoff)\.md$/.test(name)) continue;
      const slug = path.basename(path.dirname(file));
      if (newer(mtime)) {
        activity.push({ kind: 'report', title: `${name.includes('signoff') ? 'Sign-off' : 'Report'} written — ${slug}`, detail: name, at: mtime, path: rel(file) });
        if (name.endsWith('-report.md') && state.slugs.some((s) => s.slug === slug)) {
          overlay(slug, { step: 'report', note: `Inferred: ${name} was written after the index was built; the next rebuild reads its verdict.`, at: mtime, path: rel(file) });
          ahead = true;
        }
      }
    }

    // defects and the quarantine ledger
    for (const slug of safeList(path.join(qa, 'defects'))) {
      for (const name of safeList(path.join(qa, 'defects', slug)).filter((n) => /^DEF-.+\.md$/.test(n))) {
        const file = path.join(qa, 'defects', slug, name);
        const mtime = statMs(file);
        if (!newer(mtime)) continue;
        activity.push({ kind: 'defect', title: `${name.replace(/-[a-z0-9-]+\.md$/, '').replace(/\.md$/, '')} written`, detail: slug, at: mtime, path: rel(file) });
        if (state.slugs.some((s) => s.slug === slug)) {
          overlay(slug, { step: 'defects', note: `Inferred: ${name} changed after the index was built.`, at: mtime, path: rel(file) });
          ahead = true;
        }
      }
    }
    const qFile = path.join(qa, 'regression', 'quarantine.md');
    const qAt = statMs(qFile);
    if (newer(qAt)) {
      activity.push({ kind: 'quarantine', title: 'Quarantine ledger updated', detail: 'regression/quarantine.md', at: qAt, path: rel(qFile) });
      ahead = true;
    }

    // bundle version and the update notice
    const manifest = this.read(path.join(projectRoot, '.claude', '.agentic-fx.json'), function manifestVersion(t) {
      return parseManifestVersion(t);
    });
    let bundle: LiveSnapshot['bundle'] = manifest?.value ? { version: manifest.value.version, source: 'manifest', commit: manifest.value.commit } : null;
    if (!bundle) {
      const v = this.read(path.join(projectRoot, 'VERSION'), function versionFile(t) {
        const m = /^\s*(\d+\.\d+\.\d+[\w.-]*)\s*$/m.exec(t);
        return m ? m[1] : null;
      });
      if (v?.value) bundle = { version: v.value, source: 'VERSION', commit: null };
    }
    const update = this.read(path.join(projectRoot, '.claude', '.agentic-fx-updates.json'), function updateNotice(t) {
      return parseUpdateNotice(t);
    })?.value ?? null;

    // knowledge cards (the optional first step, /qa-knowledge)
    const wiki = path.join(qa, 'wiki', 'compiled');
    const knowledgeCards = fs.existsSync(wiki) ? safeList(wiki).filter((n) => n.endsWith('.md') && n.toLowerCase() !== 'index.md').length : null;

    // clarifications — the newest sheet of each slug is the ledger; older ones are history.
    const clarifications: LiveSnapshot['clarifications'] = new Map();
    for (const slug of safeList(path.join(qa, 'analysis'))) {
      const name = safeList(path.join(qa, 'analysis', slug)).filter((n) => /^\d{4}-\d{2}-\d{2}-clarifications\.md$/.test(n)).pop();
      if (!name) continue;
      const file = path.join(qa, 'analysis', slug, name);
      const r = this.read(file, parseClarifications);
      if (!r) continue;
      clarifications.set(slug, { path: rel(file), at: r.mtime, items: r.value });
      if (newer(r.mtime)) activity.push({ kind: 'clarify', title: `Clarifications updated — ${slug}`, detail: `${r.value.filter((q) => q.status === 'open').length} open`, at: r.mtime, path: rel(file) });
    }

    // The bundle's own events: runs, new failures, flaky cases, heals and lessons.
    const events = this.read(path.join(qa, 'logs', 'activity.jsonl'), parseActivity)?.value ?? [];
    for (const e of events.slice(0, 40)) {
      // A run folder is already in the feed from its summary.md; the event would say it twice.
      if (e.kind === 'run' && runs.some((r) => r.runId === e.run_id)) continue;
      const kind: ActivityKind = e.kind === 'finding' || e.kind === 'heal' || e.kind === 'lesson' || e.kind === 'stop' || e.kind === 'run' ? e.kind : 'state';
      activity.push({ kind, title: e.title, detail: e.slug ? `${e.slug} · ${e.outcome}` : e.outcome, at: Date.parse(e.at), path: e.link ?? null });
    }

    activity.sort((a, b) => b.at - a.at);
    const feed = dedupe(activity).slice(0, 40);
    return { events, clarifications, branch, head, activity: feed, lastEventAt: feed[0]?.at ?? null, ahead, traceRows, cases, runs, runPlans, coverage, bundle, update, knowledgeCards, overlays };
  }
}

function dedupe(items: ActivityItem[]): ActivityItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = `${i.kind}|${i.title}|${i.detail}|${Math.round(i.at / 1000)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeList(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((n) => !n.startsWith('.')).sort();
  } catch {
    return [];
  }
}

function statMs(file: string): number {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/** Files under `dir` matching `want`, at most `depth` levels down, skipping dot and `_` folders. */
function walk(dir: string, depth: number, want: (name: string) => boolean): string[] {
  const out: string[] = [];
  const go = (d: string, n: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (n < depth && !e.name.startsWith('_') && e.name !== 'node_modules') go(p, n + 1);
      } else if (want(e.name)) out.push(p);
    }
  };
  go(dir, 0);
  return out.sort();
}
