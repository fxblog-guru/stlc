/**
 * activity.mjs — append activity events (docs/activity-format.md) to <root>/logs/activity.jsonl.
 *
 * The addons' Activity and Needs you views, and qa-standup's automatic standup, read this file. The
 * same format is written by sdlc and ai-eval, so the four readers share one parser.
 *
 * Never throws and never creates the root. ACTIVITY_LOG=off stops it. Rolls past MAX_BYTES.
 *
 * Writers here: run-plan.mjs (run), triage.mjs and flaky.mjs (finding), heal-guard.mjs (heal),
 * learnings.mjs check (lesson). Each builds its events with the helpers at the end of this file.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export const MAX_BYTES = 5 * 1024 * 1024;
export const KINDS = ['gate', 'decision', 'run', 'stop', 'finding', 'heal', 'lesson', 'score'];
export const OUTCOMES = ['pass', 'fail', 'changes', 'blocked', 'stale', 'stopped', 'info'];
export const NEEDS = ['approve-ui', 'confirm-dec', 'sign-off', 'push', 'merge', 'answer-dec', 'review-stop'];
const SOURCES = ['sdlc', 'stlc', 'eval'];

/** The problems with one event, as strings; empty when it is valid. */
export function eventProblems(e) {
  const out = [];
  if (!e || typeof e !== 'object') return ['not an object'];
  if (e.v !== 1) out.push('v must be 1');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(String(e.at))) out.push('at must be ISO-8601 UTC ending in Z');
  if (!SOURCES.includes(e.source)) out.push(`source must be one of ${SOURCES.join(', ')}`);
  if (!KINDS.includes(e.kind)) out.push(`kind must be one of ${KINDS.join(', ')}`);
  if (!('slug' in e) || (e.slug !== null && typeof e.slug !== 'string')) out.push('slug must be a string or null');
  if (!OUTCOMES.includes(e.outcome)) out.push(`outcome must be one of ${OUTCOMES.join(', ')}`);
  if (typeof e.title !== 'string' || !e.title || e.title.length > 120) out.push('title must be 1-120 characters');
  if (e.needs != null && !NEEDS.includes(e.needs)) out.push(`needs must be null or one of ${NEEDS.join(', ')}`);
  if (e.link != null && (typeof e.link !== 'string' || /^([a-z]:|\/)/i.test(e.link))) out.push('link must be repository-relative');
  return out;
}

/** A complete event from the fields a writer knows; `at` defaults to now. */
export function makeEvent(fields, now = new Date()) {
  return {
    v: 1,
    at: fields.at ?? now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    source: fields.source ?? 'stlc',
    kind: fields.kind,
    slug: fields.slug ?? null,
    outcome: fields.outcome,
    title: String(fields.title ?? '').slice(0, 120),
    link: fields.link ?? null,
    run_id: fields.run_id ?? null,
    needs: fields.needs ?? null,
  };
}

/** Append events; invalid ones are dropped, never written. Returns how many were written. */
export function logActivity(root, events, env = process.env) {
  if (env.ACTIVITY_LOG === 'off' || !existsSync(root)) return 0;
  const good = events.filter((e) => eventProblems(e).length === 0);
  if (!good.length) return 0;
  try {
    const dir = join(root, 'logs');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'activity.jsonl');
    if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, join(dir, 'activity.1.jsonl'));
    appendFileSync(file, good.map((e) => JSON.stringify(e)).join('\n') + '\n');
    return good.length;
  } catch {
    return 0;
  }
}

/** Every valid event in a file, oldest first; a bad line is skipped. */
export function readActivity(file) {
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (eventProblems(e).length === 0) out.push(e);
    } catch { /* a torn last line from a crash */ }
  }
  return out;
}

// ---- the stlc writers -------------------------------------------------------------------------------
// Each takes what its script already computed and returns events; the script calls logActivity.
// `link` is repository-relative: `<root name>/<path inside the root>` (lib/root.mjs repoPath).

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** A finished run plan: pass when nothing failed or blocked. */
export function runEvent({ plan, runId, pass = 0, fail = 0, blocked = 0, manual = 0, link = null }, now = new Date()) {
  const counts = `${pass} pass · ${fail} fail · ${blocked} blocked${manual ? ` · ${manual} manual` : ''}`;
  return makeEvent({ kind: 'run', slug: plan, outcome: fail || blocked ? 'fail' : 'pass', title: `Run plan ${plan}: ${counts}`, link, run_id: runId }, now);
}

/** Failures new since the last run (triage history "new — passed in …"): one finding each. */
export function triageEvents(t, { slug = null, link = null, runId = null } = {}, now = new Date()) {
  const fresh = (t?.groups ?? []).flatMap((g) => g.members).filter((m) => String(m.history).startsWith('new'));
  return fresh.map((m) => makeEvent({ kind: 'finding', slug, outcome: 'fail', title: `New failure ${m.case}${m.hint?.token ? ` (${m.hint.token})` : ''}`, link, run_id: runId }, now));
}

/** Cases a repeated run found flaky or broken (flaky.mjs stability rows): one finding each. */
export function flakyEvents(rows, { slug = null, link = null, runId = null } = {}, now = new Date()) {
  return (rows ?? [])
    .filter((r) => r.verdict === 'flaky' || r.verdict === 'broken')
    .map((r) => makeEvent({ kind: 'finding', slug, outcome: 'fail', title: `${r.verdict === 'flaky' ? 'Flaky' : 'Broken'} ${r.case}: failed ${r.failures} of ${r.runs} runs`, link, run_id: runId }, now));
}

/** One heal-guard verdict: pass when every change is allowed, fail when the guard refused one. */
export function healEvent({ blocked = 0, changes = 0, link = null }, now = new Date()) {
  const title = blocked ? `Heal refused: ${plural(blocked, 'blocked change')} in ${plural(changes, 'file')}` : `Heal allowed: ${plural(changes, 'changed file')} passed the guard`;
  return makeEvent({ kind: 'heal', slug: null, outcome: blocked ? 'fail' : 'pass', title, link }, now);
}

/**
 * Lessons learned or retired since the log last said so. A lesson is news when it was updated in
 * the last `days` days and the log has no event with the same title; older lessons are history,
 * so the first check on a project with forty lessons does not flood the feed.
 */
export function lessonEvents(lessons, { prior = [], today = new Date(), days = 14 } = {}) {
  const said = new Set(prior.filter((e) => e.kind === 'lesson').map((e) => e.title));
  const since = today.getTime() - days * 864e5;
  const out = [];
  for (const l of lessons ?? []) {
    const fm = l.fm ?? {};
    if (!fm.id || !['active', 'deprecated'].includes(fm.status)) continue;
    const at = Date.parse(String(fm.updated));
    if (!Number.isFinite(at) || at < since) continue;
    const title = fm.status === 'active' ? `${fm.id} learned (${fm.confidence}): ${fm.title ?? ''}`.slice(0, 120) : `${fm.id} retired`;
    if (said.has(title)) continue;
    said.add(title);
    out.push(makeEvent({ kind: 'lesson', slug: null, outcome: fm.status === 'active' ? 'pass' : 'info', title, link: l.link ?? null }, today));
  }
  return out;
}

/**
 * The slug, run id and root-relative path of a run folder given as the scripts take it (relative to
 * the working directory): runs/<type>/<slug>/<id> or runs/plans/<name>/<id>. `rel` is null for a
 * folder outside the root, so no event links out of the repository.
 */
export function runContext(root, runDir) {
  const r = relative(resolve(root), resolve(runDir)).split(sep).join('/');
  const rel = r.startsWith('..') || /^[a-z]:/i.test(r) ? null : r;
  const m = /(?:^|\/)runs\/[^/]+\/([^/]+)\/(\d{4}-\d{2}-\d{2}-\d{4})$/.exec(r);
  return { rel, slug: m ? m[1] : null, runId: m ? m[2] : null };
}
