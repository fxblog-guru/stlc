/**
 * case-quality.mjs — the case-file vocabulary shared by lint-qa.mjs (CONTRACTS §7 quality rules)
 * and case-score.mjs (technique/axis coverage per REQ). One parser, so the linter and the scorer
 * can never disagree about what a case declares.
 */

/** `## Technique` vocabulary (CONTRACTS §7), lowercase for matching; canonical spelling alongside. */
export const TECHNIQUES = new Map([
  ['ep', 'EP'], ['bva', 'BVA'], ['decision-table', 'decision-table'], ['state-transition', 'state-transition'],
  ['pairwise', 'pairwise'], ['error-guessing', 'error-guessing'], ['use-case', 'use-case'], ['checklist', 'checklist'],
]);

/** Coverage axes a technique line may claim with `→ <axis>, …` (CONTRACTS §7). */
export const AXES = new Set(['positive', 'negative', 'boundary', 'authz', 'error-contract', 'journey']);

/** What a technique yields when its line names no axes. Explicit `→ …` always wins. */
export const DEFAULT_AXES = {
  ep: ['positive'], bva: ['boundary'], 'decision-table': ['positive'], 'state-transition': ['positive'],
  pairwise: ['positive'], 'error-guessing': ['negative'], 'use-case': ['journey', 'positive'], checklist: [],
};

export const VARIANTS_COLUMNS = '| Row | Technique | Input | Expected |';

export const normalise = (t) => t.replace(/\r\n?/g, '\n');
export const stripComments = (t) => t.replace(/<!--[\s\S]*?-->/g, '');

/** Body of `## <name>` up to the next `#`/`##` heading, comments removed; null when absent. */
export function section(text, name) {
  const lines = normalise(text).split('\n');
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = lines.findIndex((l) => new RegExp(`^## ${esc}\\s*$`).test(l));
  if (start === -1) return null;
  const body = [];
  for (const l of lines.slice(start + 1)) {
    if (/^#{1,2} /.test(l)) break;
    body.push(l);
  }
  return stripComments(body.join('\n'));
}

export const isBlank = (s) => s == null || s.trim() === '';

/**
 * Parse `## Technique`. Each line: `- <technique>[, <technique>…] [→ <axis>, …] [— note]`.
 * Returns { techniques: [canonical], axes: Set, unknownTechniques: [], unknownAxes: [] }.
 */
export function parseTechnique(body) {
  const out = { techniques: [], axes: new Set(), unknownTechniques: [], unknownAxes: [] };
  if (isBlank(body)) return out;
  for (const raw of body.split('\n')) {
    let line = raw.trim().replace(/^[-*]\s+/, '');
    if (!line) continue;
    line = line.split(/\s+—\s+/)[0];
    const [left, right] = line.split(/\s*(?:→|->)\s*/);
    const techs = left.split(/\s*[,·+]\s*/).map((s) => s.trim()).filter(Boolean);
    for (const tech of techs) {
      const key = tech.toLowerCase();
      if (!TECHNIQUES.has(key)) { out.unknownTechniques.push(tech); continue; }
      out.techniques.push(TECHNIQUES.get(key));
      if (right === undefined) for (const a of DEFAULT_AXES[key]) out.axes.add(a);
    }
    if (right !== undefined) {
      for (const a of right.split(/\s*[,·]\s*/).map((s) => s.trim().replace(/[.;]$/, '')).filter(Boolean)) {
        if (AXES.has(a)) out.axes.add(a); else out.unknownAxes.push(a);
      }
    }
  }
  return out;
}

/** Numbered steps of `## Steps`: [{ n, text, expected: [string] }]. */
export function parseSteps(body) {
  const steps = [];
  if (isBlank(body)) return steps;
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (m) steps.push({ n: Number(m[1]), text: m[2], expected: [] });
    const e = line.match(/\bExpected(?:\s*\([^)]*\))?\s*:\s*(.*)$/);
    if (e && steps.length) steps[steps.length - 1].expected.push(e[1].trim());
  }
  return steps;
}

/** Data rows of a markdown table whose header is byte-exact `columns`, as cell arrays; null when absent. */
export function table(body, columns) {
  if (body == null) return null;
  const lines = normalise(body).split('\n');
  const start = lines.findIndex((l) => l.trim() === columns);
  if (start === -1) return null;
  const rows = [];
  for (const l of lines.slice(start + 1)) {
    const t = l.trim();
    if (!t.startsWith('|')) break;
    const cells = t.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    if (cells.every((c) => c === '')) continue;
    rows.push(cells);
  }
  return rows;
}

/** Vague-Expected detector (warning-grade): returns the offending phrase or null. */
export function vagueExpected(text) {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/\b(works?|working|correct|correctly|properly|fine)\b|\bas expected\b/i);
  if (m) return m[0];
  if (/\bok(ay)?\b/i.test(t) && !/\b\d{3}\s+ok\b/i.test(t)) return 'ok'; // "200 OK" is a status line, not a judgement
  if (/\bsuccessful(ly)?\b/i.test(t) && t.split(/\s+/).length <= 4 && !/[\d`"'=]/.test(t)) return 'successfully';
  return null;
}

/** `[DATA:<token>]` occurrences, comments excluded. Returns [{ token, valid }]. */
export function dataTokens(text) {
  const out = [];
  for (const m of stripComments(normalise(text)).matchAll(/\[DATA:([^\]\s]*)\]/g)) {
    if (m[1].includes('<')) continue; // template placeholder
    out.push({ token: m[1], valid: /^[a-z0-9]+(-[a-z0-9]+)+$/.test(m[1]) });
  }
  return out;
}

/** Tokens defined by docs/test-data.md: the first cell of any table row. */
export function definedDataTokens(text) {
  const set = new Set();
  for (const l of normalise(text).split('\n')) {
    const m = l.match(/^\|\s*`?\[DATA:([a-z0-9-]+)\]`?\s*\|/);
    if (m) set.add(m[1]);
  }
  return set;
}

/** `**AC:**` header → { present, ids: [], malformed: [] }. `—` means none. */
export function parseAcLine(text) {
  const m = normalise(text).match(/^\*\*AC:\*\*\s*(.*)$/m);
  if (!m) return { present: false, ids: [], malformed: [] };
  const v = m[1].trim();
  if (v === '—' || v === '-' || v === '') return { present: true, ids: [], malformed: v === '' ? ['(empty)'] : [] };
  const parts = v.split(/\s*,\s*/).filter(Boolean);
  return { present: true, ids: parts.filter((p) => /^AC-\d{3,}$/.test(p)), malformed: parts.filter((p) => !/^AC-\d{3,}$/.test(p)) };
}
