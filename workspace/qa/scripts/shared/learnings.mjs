#!/usr/bin/env node
/**
 * learnings.mjs — what the suite has learned across runs, and the gate a lesson passes (/qa-learn, CONTRACTS §23).
 *
 *   npm run qa:learn -- harvest [--min 2] [--json]      signals that repeated across runs and are not yet a lesson
 *   npm run qa:learn -- check                           the gate: every lesson well-formed, evidenced, not a duplicate
 *   npm run qa:learn -- recall [--type t] [--module m] [--skill s] [--limit n] [--shared]
 *                                                       an index of the active lessons that apply: id, title, probe;
 *                                                       --shared adds up to three lessons Recall shares with every project
 *   npm run qa:learn -- push [--project <name>] [--dry-run]
 *                                                       share every established lesson through Recall, once each
 *   npm run qa:learn -- show <LRN-…> [<LRN-…> …]       the bodies of the lessons the index made worth reading
 *   npm run qa:learn -- audit [--today YYYY-MM-DD]      stale provisional lessons, lessons whose evidence moved
 *   npm run qa:learn -- ladder [--json]                 repeat errors per active lesson; at 2, propose a mechanical check
 *   node <qa-root>/scripts/shared/learnings.mjs brief --root <qa-root> [--peek]
 *                                                       what is new since the last brief (SessionStart): signals not yet a
 *                                                       lesson, cases newly measured flaky, new escapes, lessons written
 *
 * A lesson is one file, learnings/LRN-<TOPIC>.md, front matter + a few lines saying what to do, why, and
 * where. It is never a log of what happened: the run is the log, the lesson cites it. A lesson starts
 * `provisional` (one source) and becomes `established` only when a second, independent source supports
 * it — another run, a review, a PR — or a human states it. Nothing reads a lesson as a fact about the
 * product: a domain fact goes to the wiki (/qa-knowledge), a contradiction with the case is a defect.
 *
 * Harvest is mechanical; it finds candidates, it does not write lessons. The signals:
 *   recurring flake     the same case triaged FLAKY in ≥ min runs, or flaky in a stability.md
 *   flake pattern       one flake-kind on ≥ min cases of a module
 *   recurring error     the same error (ids, numbers, quotes stripped) with the same cause in ≥ min runs
 *   blocked heal        a heal-guard report that blocked a change (what the failure really was)
 * A signal whose evidence every active lesson already cites is reported as covered, not as new.
 *
 * Recall is two steps so a skill pays for the lessons it uses, not for every lesson that matches: the
 * index costs a line and a probe per hit, ranked by how many of type/module/skill each one matches;
 * `show` prints the bodies of the ids the probe made relevant. `recall --full` still prints every
 * matching body — for /qa-learn's duplicate check, which must see them all.
 *
 * A lesson is injected into other agents' prompts, so every one is scanned (lib/lesson-scan.mjs): an
 * injection phrase, a secret-exfiltration instruction, a credential, or an invisible / bidi character is
 * a gate error (`unsafe:`), and recall / show withhold a flagged lesson with a warning on stderr instead
 * of printing it. A harvest signal whose subject trips the scan is printed without its subject. There is
 * no override: whatever would mark a lesson as allowed lives in the same file a poisoned lesson writes.
 *
 * Across projects (optional; Recall). `push` sends each `established`, active, safe lesson to Recall as
 * `kind: lesson` with its confidence, tagged `stlc`, its applies_to and `project:<name>` (PROJECT-PROFILE
 * §Project `Name`, or --project), and records what went in `learnings/.pushed.json`, so a lesson goes
 * once and again only when it changes. A provisional lesson stays local. `recall --shared` asks for up
 * to three lessons the Recall Owner shared with every project (`recall search --scope shared`: a
 * project key reads its own project plus Shared, and its own lessons are not news from elsewhere),
 * scans each like a local lesson and labels it another project's habit. STLC_RECALL_BIN overrides the
 * binary; RECALL_URL and RECALL_API_KEY reach the server. An older Recall that refuses `--scope` or
 * `--confidence` is asked once more without it (for --shared, this project's entries are then dropped
 * here). Both fail open: no binary, no server, a timeout or bad output is at most one line.
 *
 * Run from the QA root. check exits 1 on any error; harvest exits 1 when a signal is flagged;
 * recall/audit exit 0; push exits 1 when a send failed; show exits 1 on an unknown or withheld id.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseDoc } from './lib/doc.mjs';
import { trackRun } from './lib/runlog.mjs';
import { lessonEvents, logActivity, readActivity } from './lib/activity.mjs';
import { profileText, repoPath, workspaceRoot } from './lib/root.mjs';
import { scanLesson, scanText, describe } from './lib/lesson-scan.mjs';

export const DIR = 'learnings';
const ID = /^LRN-[A-Z0-9]+(-[A-Z0-9]+)*$/;
const REQUIRED = ['id', 'title', 'status', 'confidence', 'applies_to', 'evidence', 'probe', 'created', 'updated'];
const TYPES = new Set(['api', 'integration', 'e2e', 'security', 'performance', 'accessibility', 'ui', 'unit', 'mobile']);
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STALE_DAYS = 60;
const MAX_BODY_LINES = 30;
const DUPLICATE = 0.6;

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name).replace(/\\/g, '/');
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const list = (v) => (Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)]);
const isHuman = (e) => /^human:\s*\S/.test(e);
/** The run (or other artifact) an evidence entry names: a run dir counts once however many files of it are cited. */
const sourceOf = (e) => (isHuman(e) ? e : (/^(runs\/(?:[^/]+\/){2,3}\d{4}-\d{2}-\d{2}-\d{4})/.exec(e) ?? [])[1] ?? e.replace(/#.*$/, ''));

/** Every lesson on disk: { path, fm, body } — unparsable ones too, so the gate can name them. */
export function loadLessons(root = '.') {
  const out = [];
  for (const p of walk(join(root, DIR))) {
    if (!p.endsWith('.md') || basename(p) === 'README.md') continue;
    const doc = parseDoc(readFileSync(p, 'utf8'));
    out.push({ path: p.slice(root === '.' ? 0 : root.length + 1).replace(/^\.\//, ''), fm: doc.frontMatter, body: doc.body, hasFm: doc.hasFrontMatter });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const words = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
export function similarity(a, b) {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

/** The gate. Returns { errors, warnings } as `path: message` strings. */
export function checkLessons(lessons, { root = '.', exists = (p) => existsSync(join(root, p)) } = {}) {
  const errors = [];
  const warnings = [];
  const err = (l, m) => errors.push(`${l.path}: ${m}`);
  const ids = new Map();
  for (const l of lessons) {
    if (!l.hasFm) { err(l, 'no front matter (start from _templates/learning.md)'); continue; }
    const fm = l.fm;
    for (const k of REQUIRED) if (fm[k] == null || (Array.isArray(fm[k]) && !fm[k].length)) err(l, `front matter lacks \`${k}\``);
    const id = String(fm.id ?? '');
    if (!ID.test(id)) err(l, `id "${id}" is not LRN-<TOPIC> (uppercase, kebab)`);
    if (basename(l.path, '.md') !== id) err(l, `file name differs from id ${id}`);
    if (ids.has(id)) err(l, `id ${id} also used by ${ids.get(id)}`);
    ids.set(id, l.path);
    if (!['active', 'deprecated'].includes(fm.status)) err(l, `status "${fm.status}" — active | deprecated`);
    if (!['provisional', 'established'].includes(fm.confidence)) err(l, `confidence "${fm.confidence}" — provisional | established`);
    for (const k of ['created', 'updated']) if (fm[k] != null && !DATE.test(String(fm[k]))) err(l, `${k} "${fm[k]}" is not YYYY-MM-DD`);
    if (fm.probe != null && !String(fm.probe).trim().endsWith('?')) err(l, 'probe is the question a future run would ask — end it with "?"');

    for (const a of list(fm.applies_to)) {
      if (!KEBAB.test(a) && !a.includes('*')) err(l, `applies_to "${a}" — a test type, a module, a skill name, or a glob`);
    }

    const evidence = list(fm.evidence);
    for (const e of evidence) {
      if (isHuman(e)) continue;
      const path = e.replace(/#.*$/, '').replace(/:\d+$/, '');
      if (!exists(path)) err(l, `evidence ${e} does not exist — cite a run dir, a run file, a review or a report under the QA root, or "human: <who, what>"`);
    }
    const sources = new Set(evidence.map(sourceOf));
    if (fm.confidence === 'established' && sources.size < 2 && !evidence.some(isHuman)) {
      err(l, `established on ${sources.size} source — needs a second independent source or a human; keep it provisional until then`);
    }

    if (fm.status === 'deprecated' && !fm.superseded_by && !fm.reason) err(l, 'deprecated without superseded_by or reason');
    const body = l.body.split('\n').filter((x) => x.trim() && !x.startsWith('#'));
    if (!body.length) err(l, 'no body — say what to do, why, and where');
    if (body.length > MAX_BODY_LINES) err(l, `${body.length} body lines (max ${MAX_BODY_LINES}) — one lesson per file; split it`);
    for (const f of scanLesson(l)) err(l, `unsafe: ${describe(f)} — a lesson is injected into agent prompts; rewrite it without this, never force it in`);
  }
  for (const l of lessons) {
    if (l.fm?.superseded_by && !ids.has(String(l.fm.superseded_by))) err(l, `superseded_by ${l.fm.superseded_by} is not a lesson`);
  }
  const active = lessons.filter((l) => l.fm?.status === 'active');
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const s = similarity(`${active[i].fm.title} ${active[i].fm.probe}`, `${active[j].fm.title} ${active[j].fm.probe}`);
      if (s >= DUPLICATE) err(active[j], `near-duplicate of ${active[i].fm.id} (${Math.round(s * 100)} %) — merge into one and deprecate the other`);
    }
  }
  return { errors, warnings };
}

/** Split lessons into those safe to print and those withheld: { safe, withheld: [{ lesson, findings }] }. */
export function screen(lessons) {
  const safe = [];
  const withheld = [];
  for (const l of lessons) {
    const findings = scanLesson(l);
    if (findings.length) withheld.push({ lesson: l, findings });
    else safe.push(l);
  }
  return { safe, withheld };
}
const warnWithheld = (withheld) => {
  for (const { lesson, findings } of withheld) console.error(`  WARN  ${lesson.fm?.id ?? lesson.path} withheld — ${findings.map(describe).join('; ')} (${lesson.path}; npm run qa:learn -- audit)`);
};

/** Active lessons that apply to a type, a module or a skill: the most matched terms first, then established, then id. */
export function recall(lessons, { type = null, module = null, skill = null } = {}) {
  const wanted = [type, module, skill].filter(Boolean).map((x) => String(x).toLowerCase());
  const glob = (pattern, value) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(value);
  const score = (l) => wanted.filter((w) => list(l.fm.applies_to).some((a) => glob(a.toLowerCase(), w))).length;
  return lessons
    .filter((l) => l.fm?.status === 'active')
    .map((l) => ({ l, n: score(l) }))
    .filter(({ n }) => !wanted.length || n > 0)
    .sort((a, b) => b.n - a.n
      || (a.l.fm.confidence === b.l.fm.confidence ? 0 : a.l.fm.confidence === 'established' ? -1 : 1)
      || String(a.l.fm.id).localeCompare(String(b.l.fm.id)))
    .map(({ l }) => l);
}

/** The lessons named by id, in the order asked; unknown ids are returned apart so the caller can say so. */
export function show(lessons, ids) {
  const byId = new Map(lessons.map((l) => [String(l.fm?.id), l]));
  return { found: ids.filter((id) => byId.has(id)).map((id) => byId.get(id)), missing: ids.filter((id) => !byId.has(id)) };
}

const bodyLines = (l) => l.body.trim().split('\n').filter((x) => !x.startsWith('# ')).map((x) => `    ${x}`).join('\n');

// ---- harvest --------------------------------------------------------------------------------------------

/** failures.md → entries { run, caseId, module, cause, kind, error }. */
export function parseFailures(text, run) {
  const out = [];
  for (const block of text.replace(/\r\n?/g, '\n').split(/^## /m).slice(1)) {
    const caseId = (/^(TC-[A-Z0-9]+-([A-Z0-9-]+?)-\d{3})\b/.exec(block) ?? [])[1];
    if (!caseId) continue;
    const module = /^TC-[A-Z0-9]+-([A-Z0-9-]+?)-\d{3}/.exec(caseId)[1].toLowerCase();
    const cause = (/\*\*Suspected cause:\*\*\s*(FUNCTIONAL|SCRIPT|SETUP\/ENV|FLAKY)/.exec(block) ?? [])[1] ?? null;
    const kind = (/flake-kind:\s*([a-z-]+)/.exec(block) ?? [])[1] ?? null;
    const error = ((/\*\*Error:\*\*\s*(.+)/.exec(block) ?? [])[1] ?? '').trim();
    out.push({ run, caseId, module, cause, kind, error });
  }
  return out;
}

/** An error with its particulars stripped, so the same failure in two runs reads the same. */
export const errorShape = (e) =>
  String(e).toLowerCase()
    .replace(/(['"`]).*?\1/g, '‹›')
    .replace(/\b(tc|def|req)-[a-z0-9-]+/g, '‹id›')
    .replace(/\d+(\.\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

export function harvest(root = '.', { min = 2, lessons = loadLessons(root) } = {}) {
  const failures = [];
  const stabilities = [];
  const blockedHeals = [];
  for (const p of walk(join(root, 'runs'))) {
    const rel = p.slice(root === '.' ? 0 : root.length + 1).replace(/^\.\//, '');
    if (basename(p) === 'failures.md') failures.push(...parseFailures(readFileSync(p, 'utf8'), dirname(rel)));
    if (basename(p) === 'stability.md') {
      for (const m of readFileSync(p, 'utf8').matchAll(/^\| (TC-[A-Z0-9-]+) \|[^|]*\| (\d+)\/(\d+) \|[^|]*\| flaky \|/gm)) stabilities.push({ run: dirname(rel), caseId: m[1], failed: Number(m[2]), runs: Number(m[3]) });
    }
  }
  for (const p of walk(join(root, 'reports', 'heal-guard'))) {
    const text = readFileSync(p, 'utf8');
    if (/^# Heal guard — BLOCKED/m.test(text)) blockedHeals.push(p.slice(root === '.' ? 0 : root.length + 1).replace(/^\.\//, ''));
  }

  const signals = [];
  const group = (xs, key) => {
    const m = new Map();
    for (const x of xs) { const k = key(x); if (k) m.set(k, [...(m.get(k) ?? []), x]); }
    return m;
  };
  const flaky = failures.filter((f) => f.cause === 'FLAKY');
  for (const [caseId, xs] of group([...flaky, ...stabilities], (f) => f.caseId)) {
    const runs = [...new Set(xs.map((x) => x.run))];
    if (runs.length >= min) signals.push({ signal: 'recurring flake', subject: caseId, count: runs.length, evidence: runs });
  }
  for (const [k, xs] of group(flaky.filter((f) => f.kind), (f) => `${f.module} · ${f.kind}`)) {
    const cases = new Set(xs.map((x) => x.caseId));
    if (cases.size >= min) signals.push({ signal: 'flake pattern', subject: `${k} (${[...cases].join(', ')})`, count: cases.size, evidence: [...new Set(xs.map((x) => x.run))] });
  }
  for (const [k, xs] of group(failures.filter((f) => f.error && f.cause), (f) => `${f.cause} · ${errorShape(f.error)}`)) {
    const runs = [...new Set(xs.map((x) => x.run))];
    if (runs.length >= min) signals.push({ signal: 'recurring error', subject: `${k} — e.g. ${xs[0].caseId}: ${xs[0].error.slice(0, 80)}`, count: runs.length, evidence: runs });
  }
  for (const r of blockedHeals) signals.push({ signal: 'blocked heal', subject: 'a heal tried to weaken or suppress a test', count: 1, evidence: [r] });

  const cited = new Set(lessons.filter((l) => l.fm?.status === 'active').flatMap((l) => list(l.fm.evidence).map(sourceOf)));
  for (const s of signals) {
    s.covered = s.evidence.every((e) => cited.has(sourceOf(e)));
    const findings = scanText(s.subject).map((f) => ({ field: 'subject', ...f }));
    if (findings.length) { s.flagged = findings.map(describe); s.subject = '(withheld — the run evidence trips the lesson scan)'; }
  }
  return signals.sort((a, b) => Number(a.covered) - Number(b.covered) || b.count - a.count);
}

// ---- ladder (§23, a lesson that keeps being needed is a check, not a reminder) -------------------------------

export const PROMOTE_AT = 2;
const runDate = (run) => (/(\d{4}-\d{2}-\d{2})-\d{4}$/.exec(run) ?? [])[1] ?? null;
/** What makes two failures "the same mistake": the case, or the cause with the error's shape. */
const failureKeys = (f) => [f.caseId, f.cause && f.error ? `${f.cause} · ${errorShape(f.error)}` : null].filter(Boolean);

/**
 * Repeat errors: a failure in a run the active lesson does not cite, dated on or after the lesson was
 * written, that matches a failure in the runs it does cite. The lesson existed and the mistake came
 * back, so reading it did not prevent it. At PROMOTE_AT repeat runs the lesson is proposed for a lint
 * rule or a hook; the proposal is printed, never applied — which check fits is a human's call.
 */
export function repeats(root = '.', { lessons = loadLessons(root) } = {}) {
  const failures = [];
  for (const p of walk(join(root, 'runs'))) {
    if (basename(p) !== 'failures.md') continue;
    const rel = p.slice(root === '.' ? 0 : root.length + 1).replace(/^\.\//, '');
    failures.push(...parseFailures(readFileSync(p, 'utf8'), dirname(rel)));
  }
  const out = [];
  for (const l of lessons.filter((x) => x.fm?.status === 'active')) {
    const cited = new Set(list(l.fm.evidence).map(sourceOf));
    const known = new Set(failures.filter((f) => cited.has(f.run)).flatMap(failureKeys));
    const since = String(l.fm.created ?? '');
    const runs = [...new Set(failures
      .filter((f) => !cited.has(f.run) && (runDate(f.run) ?? '') >= since && failureKeys(f).some((k) => known.has(k)))
      .map((f) => f.run))].sort();
    out.push({ id: l.fm.id, repeats: runs.length, runs, promote: runs.length >= PROMOTE_AT });
  }
  return out;
}

// ---- brief (§23, the session-start learning brief) ---------------------------------------------------------

export const BRIEF = join('logs', 'learn-brief.json');
const MAX_BRIEF = 3;
const signalKey = (s) => `${s.signal}|${[...s.evidence].sort().join(',')}`;

/** Cases measured flaky in any stability.md, as `<run>|<case>` keys. */
function flakyMeasured(root) {
  const out = [];
  for (const p of walk(join(root, 'runs'))) {
    if (basename(p) !== 'stability.md') continue;
    const run = dirname(p.slice(root === '.' ? 0 : root.length + 1).replace(/^\.\//, ''));
    for (const m of readFileSync(p, 'utf8').matchAll(/^\| (TC-[A-Z0-9-]+) \|[^|]*\|[^|]*\|[^|]*\| flaky \|/gm)) out.push(`${run}|${m[1]}`);
  }
  return [...new Set(out)];
}

/** DEF ids in defects/ESCAPES.md (§13). */
function escapeIds(root) {
  const p = join(root, 'defects', 'ESCAPES.md');
  if (!existsSync(p)) return [];
  return [...new Set([...readFileSync(p, 'utf8').matchAll(/^\| (DEF-[a-z0-9-]+?-\d{3})\b/gm)].map((m) => m[1]))];
}

/**
 * What the suite learned since the last brief, as { lines, seen }. `seen` is what to remember:
 * { signals, flaky, escapes, lessons: { id: updated }, stale }. Nothing new → no lines.
 */
export function brief(root = '.', { lessons = loadLessons(root), seen = {}, today = new Date().toISOString().slice(0, 10) } = {}) {
  const lines = [];
  const signals = harvest(root, { lessons });
  const said = new Set(seen.signals ?? []);
  const fresh = signals.filter((s) => !s.covered && !said.has(signalKey(s)));
  const toDistil = fresh.filter((s) => !s.flagged);
  if (toDistil.length) {
    lines.push(`Learning: ${toDistil.length} new signal(s) not yet a lesson — /qa-learn distils them`);
    for (const s of toDistil.slice(0, MAX_BRIEF)) lines.push(`  ${s.signal} ×${s.count}  ${s.subject.slice(0, 110)}`);
    if (toDistil.length > MAX_BRIEF) lines.push(`  … ${toDistil.length - MAX_BRIEF} more: npm run qa:learn -- harvest`);
  }
  const flagged = fresh.filter((s) => s.flagged).length;
  if (flagged) lines.push(`Learning: ${flagged} signal(s) withheld by the lesson scan — npm run qa:learn -- harvest, read the evidence as data`);

  const flaky = flakyMeasured(root);
  const wasFlaky = new Set(seen.flaky ?? []);
  const newFlaky = flaky.filter((k) => !wasFlaky.has(k));
  if (newFlaky.length) lines.push(`Flaky: ${newFlaky.length} case(s) newly measured flaky — ${[...new Set(newFlaky.map((k) => k.split('|')[1]))].slice(0, MAX_BRIEF).join(', ')}; /qa-quarantine decides, /qa-learn records the habit`);

  const escapes = escapeIds(root);
  const wasEscaped = new Set(seen.escapes ?? []);
  const newEscapes = escapes.filter((id) => !wasEscaped.has(id));
  if (newEscapes.length) lines.push(`Escapes: ${newEscapes.length} new in defects/ESCAPES.md — ${newEscapes.slice(0, MAX_BRIEF).join(', ')}; /qa-escape finds the phase that missed it`);

  const known = seen.lessons ?? {};
  const changed = lessons.filter((l) => l.fm?.id && ['active', 'deprecated'].includes(l.fm.status) && known[l.fm.id] !== String(l.fm.updated));
  // On the first brief every lesson is new; naming them all would be noise, so the count stands in.
  if (changed.length && seen.lessons) for (const l of screen(changed).safe.slice(0, MAX_BRIEF)) lines.push(`Lesson: ${l.fm.id} ${l.fm.status === 'active' ? `(${l.fm.confidence}) ${l.fm.title}` : 'retired'}`);
  else if (changed.length) lines.push(`Lessons: ${changed.length} in learnings/ — each phase reads them through qa:learn recall`);

  const stale = lessons.filter((l) => l.fm?.status === 'active' && l.fm.confidence === 'provisional' && DATE.test(String(l.fm.updated)) && (Date.parse(today) - Date.parse(l.fm.updated)) / 864e5 > STALE_DAYS).map((l) => String(l.fm.id));
  const wasStale = new Set(seen.stale ?? []);
  if (stale.some((id) => !wasStale.has(id))) lines.push(`Lessons: ${stale.length} provisional with no new support in ${STALE_DAYS} days — /qa-learn --audit`);

  return {
    lines,
    seen: {
      signals: [...new Set([...said, ...signals.map(signalKey)])],
      flaky,
      escapes,
      lessons: Object.fromEntries(lessons.filter((l) => l.fm?.id).map((l) => [String(l.fm.id), String(l.fm.updated)])),
      stale,
    },
  };
}

/** The SessionStart side: print what is new once, remember it. Never throws, always 0. */
function runBrief(root, { peek = false, today } = {}) {
  try {
    if (!existsSync(root)) return 0;
    const file = join(root, BRIEF);
    let seen = {};
    try { seen = JSON.parse(readFileSync(file, 'utf8')); } catch { /* the first brief */ }
    const r = brief(root, { seen, today: today ?? undefined });
    if (r.lines.length) console.log(`[agentic-fx-qa] ${r.lines.join('\n')}`);
    if (!peek) {
      try { mkdirSync(join(root, 'logs'), { recursive: true }); writeFileSync(file, `${JSON.stringify(r.seen)}\n`); } catch { /* a brief never fails a session */ }
    }
  } catch { /* a brief never fails a session */ }
  return 0;
}

// ---- across projects: Recall -----------------------------------------------------------------------------

const RECALL_TIMEOUT_MS = 5000;
const SHARED_LIMIT = 3;
export const PUSHED = '.pushed.json';

/** Run the Recall CLI; a `.mjs` stands in for it in tests. Never throws: a failure is in the result. */
const recallCli = (args, { env = process.env, spawn = spawnSync, input } = {}) => {
  const bin = env.STLC_RECALL_BIN || 'recall';
  const [cmd, argv] = /\.m?js$/.test(bin) ? [process.execPath, [bin, ...args]] : [bin, args];
  try { return spawn(cmd, argv, { encoding: 'utf8', timeout: RECALL_TIMEOUT_MS, env, input }); } catch (e) { return { error: e }; }
};

/** True when an older Recall refused `--<flag>` as unknown. */
export const rejectsFlag = (r, flag) => !r?.error && r?.status !== 0
  && new RegExp(`(?:not defined|unknown (?:flag|option))[^\\n]*?-${flag}\\b`).test(`${r?.stderr ?? ''}\n${r?.stdout ?? ''}`);

/** Run with `--flag value`; an older Recall that does not know the flag is asked once more without it. */
export function recallWithFlag(args, flag, value, opts = {}) {
  const r = recallCli([...args, `--${flag}`, value], opts);
  return rejectsFlag(r, flag) ? { ...recallCli(args, opts), fallback: true } : r;
}

/** PROJECT-PROFILE §Project `Name`, from the project above the QA root or the QA root itself; null while a placeholder. */
export function projectName(cwd = '.') {
  for (const dir of [resolve(cwd, '..'), resolve(cwd)]) {
    const v = /^\s*-\s*\*\*Name:\*\*\s*`([^`]+)`/m.exec(profileText(dir))?.[1]?.trim();
    if (v && !v.startsWith('<')) return v;
  }
  return null;
}

/** A lesson as Recall stores it: one fact of at most 2000 characters, the body without its heading. */
export function lessonPayload(l, project) {
  const text = l.body.split('\n').filter((x) => !x.startsWith('# ') && !x.trim().startsWith('<!--')).join('\n').trim();
  const tags = ['stlc', ...list(l.fm.applies_to).filter((a) => !a.includes('*'))];
  if (project) tags.push(`project:${project}`);
  return { title: String(l.fm.title), body: `${text}\n\nProbe: ${l.fm.probe}`.slice(0, 2000), tags: [...new Set(tags)] };
}

const digest = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);

/** Established, active, safe lessons not yet pushed in their current form: [{ lesson, payload }]. */
export function toPush(lessons, pushed, project) {
  return screen(lessons.filter((l) => l.fm?.status === 'active' && l.fm.confidence === 'established')).safe
    .map((l) => ({ lesson: l, payload: lessonPayload(l, project) }))
    .filter(({ lesson, payload }) => pushed[lesson.fm.id] !== digest(payload));
}

/** Send each established lesson once, and again only when it changed; `.pushed.json` records what went. */
export function push(root = '.', { project, env = process.env, spawn = spawnSync, dryRun = false } = {}) {
  const file = join(root, DIR, PUSHED);
  let pushed = {};
  try { pushed = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first push */ }
  const out = { sent: [], duplicate: [], failed: [], dryRun };
  let oldRecall = false; // an older Recall without --confidence is asked once; the rest of the run goes without it
  for (const { lesson, payload } of toPush(loadLessons(root), pushed, project)) {
    if (dryRun) { out.sent.push(lesson.fm.id); continue; }
    const args = ['push', '--kind', 'lesson', '--title', payload.title, '--body', '-', ...payload.tags.flatMap((t) => ['--tag', t])];
    if (project) args.push('--project', project);
    const opts = { env, spawn, input: payload.body };
    const r = oldRecall ? recallCli(args, opts) : recallWithFlag(args, 'confidence', String(lesson.fm.confidence), opts);
    if (r.fallback) oldRecall = true;
    if (r.error?.code === 'ENOENT') return { ...out, unavailable: true };
    // Recall refuses the same content twice and hands back the entry it holds: already shared.
    const dup = /possible_duplicate/.test(`${r.stdout ?? ''}${r.stderr ?? ''}`);
    if (r.status === 0 || dup) {
      (dup ? out.duplicate : out.sent).push(lesson.fm.id);
      pushed[lesson.fm.id] = digest(payload);
    } else out.failed.push(lesson.fm.id);
  }
  if (!dryRun && (out.sent.length || out.duplicate.length)) writeFileSync(file, `${JSON.stringify(pushed, null, 2)}\n`);
  return out;
}

const ownEntry = (e, project) => !!project && (e?.project === project || (e?.tags ?? []).includes(`project:${project}`));

/**
 * Up to three lessons Recall shares with every project, as { ok, entries: [{ id, title }], note }. `ok`
 * false means Recall could not be asked; the caller prints `note` and carries on. A flagged entry is
 * dropped and counted. On an older Recall without `--scope`, entries of `project` are dropped here.
 */
export function sharedLessons(terms, { env = process.env, run = spawnSync, project = null } = {}) {
  const r = recallWithFlag(['search', ...terms, '--kind', 'lesson', '--limit', String(SHARED_LIMIT), '--json'], 'scope', 'shared', { env, spawn: run });
  if (r.error?.code === 'ENOENT') return { ok: false, entries: [], note: null };
  if (r.error || r.status !== 0) return { ok: false, entries: [], note: 'Recall unreachable — local lessons only' };
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { return { ok: false, entries: [], note: 'Recall answered in a shape this script cannot read — local lessons only' }; }
  const entries = [];
  let flagged = 0;
  for (const e of (Array.isArray(parsed?.entries) ? parsed.entries : []).filter((x) => !(r.fallback && ownEntry(x, project))).slice(0, SHARED_LIMIT)) {
    const title = String(e?.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (!title) continue;
    if (scanText(`${title}\n${e?.body ?? ''}`).length) { flagged++; continue; }
    entries.push({ id: String(e?.id ?? '?').slice(0, 40), title });
  }
  return { ok: true, entries, note: flagged ? `${flagged} shared lesson(s) withheld by the lesson scan` : null };
}

// ---- the command ----------------------------------------------------------------------------------------

function main(argv) {
  const [cmd = 'check'] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !['--json', '--full', '--peek', '--shared', '--dry-run'].includes(argv[i - 1])));
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  if (cmd === 'brief') return runBrief(opt('--root') ?? '.', { peek: argv.includes('--peek'), today: opt('--today') });
  const lessons = loadLessons('.');

  if (cmd === 'check') {
    const { errors, warnings } = checkLessons(lessons);
    for (const w of warnings) console.log(`  WARN  ${w}`);
    for (const e of errors) console.log(`  ERROR ${e}`);
    console.log(`\nqa:learn check — ${lessons.length} lesson(s), ${errors.length} error(s)`);
    // Only a gate that passed says a lesson was learned: a lesson the gate refuses is not one yet.
    if (!errors.length) {
      const root = workspaceRoot();
      const prior = readActivity(join(root, 'logs', 'activity.jsonl'));
      const today = opt('--today') ? new Date(`${opt('--today')}T12:00:00Z`) : new Date();
      logActivity(root, lessonEvents(lessons.map((l) => ({ ...l, link: repoPath(root, l.path) })), { prior, today }));
    }
    return errors.length ? 1 : 0;
  }
  if (cmd === 'recall') {
    const q = { type: opt('--type'), module: opt('--module'), skill: opt('--skill') };
    const { safe: hits, withheld } = screen(recall(lessons, q));
    warnWithheld(withheld);
    const printShared = () => {
      if (!argv.includes('--shared')) return;
      const s = sharedLessons(Object.values(q).filter(Boolean), { project: projectName('.') });
      if (s.entries.length) {
        console.log('Shared, from other projects (Recall) — a habit elsewhere, a hypothesis here:');
        for (const e of s.entries) console.log(`  ${e.id} · ${e.title}`);
      }
      if (s.note) console.log(`  (${s.note})`);
    };
    if (!hits.length) { console.log('No lesson applies.'); printShared(); return 0; }
    const full = argv.includes('--full');
    const limit = full ? hits.length : Number(opt('--limit') ?? 8);
    for (const l of hits.slice(0, limit)) {
      console.log(`${l.fm.id} · ${l.fm.confidence} · ${l.fm.title}`);
      console.log(full ? bodyLines(l) + '\n' : `    probe: ${l.fm.probe}`);
    }
    if (hits.length > limit) console.log(`… ${hits.length - limit} more (--limit ${hits.length})`);
    if (!full) console.log(`Read the ones whose probe is your question: npm run qa:learn -- show <id> …`);
    printShared();
    return 0;
  }
  if (cmd === 'push') {
    const project = opt('--project') ?? projectName('.');
    const r = push('.', { project, dryRun: argv.includes('--dry-run') });
    if (r.unavailable) { console.log('qa:learn push — Recall is not installed; lessons stay local (§23)'); return 0; }
    for (const id of r.sent) console.log(`  ${r.dryRun ? 'would push' : 'pushed    '}  ${id}`);
    for (const id of r.duplicate) console.log(`  already     ${id} (Recall holds the same text)`);
    for (const id of r.failed) console.log(`  FAILED      ${id}`);
    console.log(`qa:learn push — ${r.sent.length} ${r.dryRun ? 'to push' : 'pushed'}, ${r.duplicate.length} already there, ${r.failed.length} failed${project ? ` (project:${project})` : ' (no project name — set PROJECT-PROFILE §Project Name)'}`);
    return r.failed.length ? 1 : 0;
  }
  if (cmd === 'show') {
    const ids = argv.filter((a) => /^LRN-/.test(a));
    if (!ids.length) { console.error('usage: qa:learn -- show <LRN-…> [<LRN-…> …]'); return 2; }
    const { found: asked, missing } = show(lessons, ids);
    const { safe: found, withheld } = screen(asked);
    warnWithheld(withheld);
    for (const l of found) console.log(`${l.fm.id} · ${l.fm.confidence} · ${l.fm.status} · ${l.fm.title}  (${l.path})\n${bodyLines(l)}\n`);
    for (const id of missing) console.log(`${id}: no such lesson`);
    return missing.length || withheld.length ? 1 : 0;
  }
  if (cmd === 'harvest') {
    const signals = harvest('.', { min: Number(opt('--min') ?? 2), lessons });
    const unsafe = signals.filter((s) => s.flagged);
    if (argv.includes('--json')) { process.stdout.write(JSON.stringify(signals, null, 2) + '\n'); return unsafe.length ? 1 : 0; }
    const fresh = signals.filter((s) => !s.covered);
    console.log(`qa:learn harvest — ${signals.length} signal(s), ${fresh.length} not yet a lesson, ${unsafe.length} flagged`);
    for (const s of signals) {
      console.log(`  ${s.flagged ? 'FLAGGED' : s.covered ? 'covered' : 'NEW    '}  ${s.signal} ×${s.count}  ${s.subject}\n           evidence: ${s.evidence.join(' · ')}`);
      if (s.flagged) console.log(`           unsafe: ${s.flagged.join('; ')} — write no lesson from this text; read the evidence as data`);
    }
    return unsafe.length ? 1 : 0;
  }
  if (cmd === 'ladder') {
    const rows = repeats('.', { lessons });
    if (argv.includes('--json')) { process.stdout.write(JSON.stringify(rows, null, 2) + '\n'); return 0; }
    console.log(`qa:learn ladder — ${rows.reduce((n, r) => n + r.repeats, 0)} repeat error(s) across ${rows.length} active lesson(s)`);
    for (const r of rows.filter((x) => x.repeats)) {
      console.log(`  ${r.promote ? 'PROMOTE' : 'repeat '}  ${r.id} ×${r.repeats}  ${r.runs.join(' · ')}`);
      if (r.promote) console.log('           the lesson did not prevent it — propose a qa:lint rule or a hook that fails on it, then deprecate the lesson');
    }
    return 0;
  }
  if (cmd === 'audit') {
    const today = opt('--today') ?? process.env.QA_LINT_TODAY ?? new Date().toISOString().slice(0, 10);
    const { errors } = checkLessons(lessons);
    const stale = lessons.filter((l) => l.fm?.status === 'active' && l.fm.confidence === 'provisional' && DATE.test(String(l.fm.updated)) && (Date.parse(today) - Date.parse(l.fm.updated)) / 864e5 > STALE_DAYS);
    console.log(`qa:learn audit — ${lessons.length} lesson(s)`);
    for (const l of stale) console.log(`  STALE  ${l.fm.id}: provisional, no new support since ${l.fm.updated} — support it (a second source) or deprecate it`);
    for (const e of errors) console.log(`  ${/: unsafe: /.test(e) ? 'FLAGGED' : 'ERROR  '}  ${e}`);
    if (!stale.length && !errors.length) console.log('  Nothing to do.');
    return 0;
  }
  console.error('usage: qa:learn -- check | recall [--type t] [--module m] [--skill s] [--limit n] [--full] [--shared] | show <LRN-…> … | push [--project p] [--dry-run] | harvest [--min n] [--json] | ladder [--json] | audit | brief [--root r] [--peek]');
  return 2;
}

const isMain = process.argv[1] && /(^|\/)learnings\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) trackRun(import.meta.url);
if (isMain) process.exit(main(process.argv.slice(2)));
