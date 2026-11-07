// integrity.mjs — the mechanical half of the verdict-integrity principles (CONTRACTS §31).
//
// A test exists to produce a true statement about a system. Each rule below catches one way a
// statement stops being true while every check around it stays green. They are pure: qa:lint feeds
// them file text, the tests feed them strings, and the same input gives the same answer everywhere.
import { sameIdentity } from './target.mjs';

// ── §31.2 Observation: an instrument that failed is not a product fact ────────────────────────────
//
// `count().catch(() => 0)` turns "the read failed" into "there are none"; `isVisible().catch(() =>
// false)` into "it is hidden"; `json().catch(() => ({}))` into "the body is empty". Each converts an
// UNKNOWN into a value a later assertion will happily judge. A fallback is allowed only when the line
// says why the unknown cannot reach a verdict: `// unknown-ok: <reason>`.
const FALLBACK = String.raw`(?:0|-1|false|true|null|undefined|NaN|''|""|\`\`|\[\s*\]|\{\s*\}|\(\s*\{\s*\}\s*\)|new\s+Map\(\s*\)|new\s+Set\(\s*\))`;
const SWALLOW_RES = [
  new RegExp(String.raw`\.catch\(\s*(?:async\s*)?(?:\(\s*[\w$]*\s*\)|[\w$]+)\s*=>\s*${FALLBACK}\s*\)`, 'g'),
  new RegExp(String.raw`\.catch\(\s*(?:async\s*)?(?:\(\s*[\w$]*\s*\)|[\w$]+)\s*=>\s*\{\s*return\s+${FALLBACK}\s*;?\s*\}\s*\)`, 'g'),
  /\.catch\(\s*(?:async\s*)?(?:\(\s*[\w$]*\s*\)|[\w$]+)\s*=>\s*\{\s*\}\s*\)/g,
  /\.catch\(\s*(?:\(\s*\)\s*=>\s*)?(?:undefined|null|noop)\s*\)/g,
];
const UNKNOWN_OK = /\/\/\s*unknown-ok:\s*\S/;

export function swallowedReads(text) {
  const out = [];
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return;
    for (const re of SWALLOW_RES) {
      re.lastIndex = 0;
      const m = re.exec(line);
      if (!m) continue;
      if (UNKNOWN_OK.test(line) || UNKNOWN_OK.test(lines[i - 1] ?? '')) break;
      out.push({ line: i + 1, snippet: m[0].slice(0, 80) });
      break;
    }
  });
  return out;
}

// ── §31.3 Oracle: a step that does nothing is not a step that passed ──────────────────────────────
//
// `test.step('Step 3: …', async () => {})` prints the step title in the report and proves nothing;
// a reader sees the case's step "covered". The same for a step whose body only logs.
const STEP_RE = /test\.step\(\s*(['"`])((?:(?!\1)[^\\]|\\.)*)\1\s*,\s*async\s*\(\s*\)\s*=>\s*\{([^{}]*)\}\s*\)/g;
export function emptySteps(text) {
  const out = [];
  const src = String(text ?? '').replace(/\r\n?/g, '\n');
  for (const m of src.matchAll(STEP_RE)) {
    const body = m[3].replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!body || /^(console\.\w+\([^;]*\);?\s*)+$/.test(body))
      out.push({ line: src.slice(0, m.index).split('\n').length, title: m[2].slice(0, 60) });
  }
  return out;
}

// ── §31.1 Identity: a report's verdict is about the build it names, or about nothing ──────────────
//
// For a report that names a shipped commit, each run it read must have reached that commit.
//   fail            a run hit a different system (NOT_DEPLOYED), or reached a commit other than the
//                   report's (a run of last week's build cannot vouch for this week's)
//   not evaluable   a run has no target.json, could not read its identity, or pinned nothing
//   pass            every run read back MATCH against the report's commit
export function targetGate(shippedSha, runs) {
  const reasons = [];
  if (!runs.length) return { verdict: 'not evaluable', reasons: ['the report reads no runs'] };
  let fail = false, unknown = false;
  for (const { id, target } of runs) {
    if (!target) { unknown = true; reasons.push(`${id}: no target.json — the run did not record which system it judged`); continue; }
    if (target.verdict === 'NOT_DEPLOYED') { fail = true; reasons.push(`${id}: NOT_DEPLOYED`); continue; }
    if (target.verdict !== 'MATCH') { unknown = true; reasons.push(`${id}: ${target.verdict}`); continue; }
    if (!target.shipped_sha && !(target.components ?? []).some((c) => c.status === 'MATCH' && sameIdentity(c.expected, shippedSha))) {
      unknown = true; reasons.push(`${id}: MATCH against an expectation that is not the report's commit`); continue;
    }
    if (target.shipped_sha && !sameIdentity(target.shipped_sha, shippedSha)) { fail = true; reasons.push(`${id}: judged ${target.shipped_sha}, not ${shippedSha}`); }
  }
  return { verdict: fail ? 'fail' : unknown ? 'not evaluable' : 'pass', reasons };
}

// ── §31.5 Closure: a fix is proven by a guard, on a different system than the failure ─────────────
const TARGET_OF = /·\s*target\s+(\S+)/;
function sectionLines(text, heading) {
  const m = new RegExp(`^## ${heading}\\s*\\n((?:(?!## ).*\\n?)*)`, 'm').exec(text);
  return m ? m[1].split('\n').filter((l) => /^\s*-\s+\S/.test(l)) : [];
}
export function defectGuardProblems(text) {
  const t = String(text ?? '').replace(/\r\n?/g, '\n');
  const out = [];
  const resolution = (/\*\*Resolution:\*\*\s+([^\n]+)/.exec(t) ?? [])[1]?.trim() ?? '';
  const kase = (/\*\*Case:\*\*\s+(\S+)/.exec(t) ?? [])[1];
  const origin = (/\*\*Origin:\*\*\s+(\S+)/.exec(t) ?? [])[1];
  const req = (/\*\*REQ:\*\*\s+([^*\n]+?)\s{2,}|\*\*REQ:\*\*\s+(\S+)/.exec(t) ?? []).slice(1).find(Boolean)?.trim();
  if (resolution.startsWith('fixed') && (!kase || kase === '—'))
    out.push('`fixed` without a **Case:** — a fix is closed by a guard: the case that reproduces it, red before and green after (design it first)');
  const rec = sectionLines(t, 'Recurrence').map((l) => (TARGET_OF.exec(l) ?? [])[1]).filter(Boolean);
  const ver = sectionLines(t, 'Verification').map((l) => (TARGET_OF.exec(l) ?? [])[1]).filter(Boolean);
  if (resolution.startsWith('fixed') && rec.length && ver.length && sameIdentity(ver[ver.length - 1], rec[rec.length - 1]))
    out.push(`verified on ${ver[ver.length - 1]}, the same system it failed on — a pass without a change to the system is a flake or an environment change, not a fix`);
  if (origin === 'EXPLORATORY' && (!req || req === '—')) {
    const expected = (/^## Expected[^\n]*\n((?:(?!## ).*\n?)*)/m.exec(t) ?? [])[1] ?? '';
    if (!/\b(REQ-\d+|BR-\d+|AC-\d+|standard:|wiki:|spec:)/.test(expected))
      out.push('EXPLORATORY defect names no oracle (**REQ:** — and no BR-/AC-/standard:/wiki:/spec: in ## Expected) — an observation that contradicts nothing written down is a QUESTION follow-up, not a defect');
  }
  return out;
}

// ── §31.4 Attribution: FUNCTIONAL is the last explanation, not the first ──────────────────────────
//
// Before a failure is called a product defect, three things are on the page: the precondition still
// held at the failing assertion, a control showed the check can tell the two states apart, and the
// failure reproduces outside the harness. Each may be `n/a — <why>`; none may be missing.
export const ATTRIBUTION_KEYS = ['precondition', 'control', 'repro'];
export function attributionProblems(failuresText) {
  const t = String(failuresText ?? '').replace(/\r\n?/g, '\n');
  const blocks = t.split(/^(?=#{2,3} )/m).filter((b) => /^#{2,3} /.test(b));
  const out = [];
  for (const b of blocks) {
    if (!/\bFUNCTIONAL\b/.test(b)) continue;
    const title = b.split('\n')[0].replace(/^#+\s*/, '').slice(0, 60);
    const line = (/^\s*[-*]?\s*\**attribution:?\**:?\s*(.+)$/im.exec(b) ?? [])[1] ?? '';
    const missing = ATTRIBUTION_KEYS.filter((k) => !new RegExp(`\\b${k}\\b\\s*[:=]?\\s*\\S`, 'i').test(line));
    if (missing.length) out.push(`${title}: FUNCTIONAL without attribution (${missing.join(', ')}) — \`attribution: precondition <held at assert: evidence> · control <evidence | n/a — why> · repro <evidence>\``);
  }
  return out;
}
