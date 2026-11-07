// target.mjs — what a run actually ran against (CONTRACTS §31).
//
// A verdict is a claim about one system. "The checkout flow passes" means nothing until it says
// which code, which client build, which configuration, which schema and which data the checks
// reached — and whether that was the system the change was supposed to put there. A plan can name
// the shipped commit and the run can still hit yesterday's deploy, a stale CDN bundle, a pod that
// did not roll, a preview environment of another branch, or the right build with a flag flipped.
// None of those raise an error; each turns a pass or a fail into a statement about the wrong thing.
//
// The profile declares, per environment, how each component of the system says what it is
// (`### Target identity` under `## Environments`). This module reads those declarations, resolves
// what each probe returned, and compares it with what the run expected. Pure apart from nothing:
// the probes themselves run in target.mjs, so every rule here is testable without a network.
import { createHash } from 'node:crypto';
import { plain } from './doc.mjs';

export const TABLE_HEADING = '### Target identity';
export const TABLE_COLUMNS = '| Env | Component | Kind | Probe | Read | Expect |';
/** What a component's identity describes. A target is all of them, not just the build. */
export const KINDS = ['code', 'client', 'config', 'schema', 'data'];
export const EXPECTS = ['shipped-sha', 'recorded'];
/** Per component. */
export const STATUS = ['MATCH', 'MISMATCH', 'UNREAD', 'RECORDED'];
/** Per run — the token executing-tests, reporting-results and qa:lint act on. */
export const VERDICTS = ['MATCH', 'NOT_DEPLOYED', 'UNVERIFIED', 'UNPINNED'];
const PROBE_RE = /^(GET|HEADER|CMD|FILE)\s+(.+)$/;
const READ_RE = /^(json:[^\s]+|regex:.+|raw|sha256)$/;

/**
 * Every row of the one table under `### Target identity` — that table only: reading stops at the
 * first line after it that is not a table row, so a later sub-section's table never joins it.
 */
export function targetRows(profileText) {
  const lines = String(profileText ?? '').replace(/\r\n?/g, '\n').split('\n');
  const at = lines.findIndex((l) => /^#{2,4}\s+Target identity\s*$/i.test(l.trim()));
  if (at < 0) return [];
  let headers = null;
  const rows = [];
  for (let i = at + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (/^#{1,6}\s/.test(line)) break;
    if (!line.startsWith('|')) { if (headers) break; continue; }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (!headers) { headers = cells.map((c) => c.toLowerCase()); continue; }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    rows.push(Object.fromEntries(headers.map((h, k) => [h, cells[k] ?? ''])));
  }
  return rows.map((r) => ({
    env: String(r.env ?? '').replace(/`/g, '').trim(), // `*` is a value here, not emphasis

    component: plain(r.component),
    kind: plain(r.kind),
    probe: String(r.probe ?? '').replace(/^`|`$/g, '').trim(),
    read: String(r.read ?? '').replace(/^`|`$/g, '').trim(),
    expect: plain(r.expect),
  }));
}

/** The declared rows for one environment (`*` rows apply to every environment). */
export function declaredProbes(profileText, env) {
  return targetRows(profileText).filter((r) => r.component && (r.env === env || r.env === '*'));
}

/** Problems with a declaration — the lint and the CLI say the same thing. */
export function declarationErrors(row) {
  const out = [];
  if (!KINDS.includes(row.kind)) out.push(`Kind \`${row.kind}\` not in ${KINDS.join('|')}`);
  if (!PROBE_RE.test(row.probe)) out.push(`Probe \`${row.probe}\` is not GET <url> · HEADER <url> <name> · CMD <command> · FILE <path>`);
  if (!READ_RE.test(row.read)) out.push(`Read \`${row.read}\` is not json:<path> · regex:<pattern> · raw · sha256`);
  if (!EXPECTS.includes(row.expect)) out.push(`Expect \`${row.expect}\` not in ${EXPECTS.join('|')}`);
  return out;
}

export function parseProbe(probe) {
  const m = PROBE_RE.exec(String(probe ?? '').trim());
  if (!m) return null;
  if (m[1] === 'HEADER') {
    const at = m[2].trim().lastIndexOf(' ');
    if (at < 1) return null;
    return { how: 'HEADER', target: m[2].slice(0, at).trim(), header: m[2].slice(at + 1).trim() };
  }
  return { how: m[1], target: m[2].trim() };
}

/** `${NAME}` → the environment's value. A name the environment does not set is an error, not "". */
export function expand(text, vars) {
  const missing = [];
  const out = String(text).replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => {
    if (vars && Object.prototype.hasOwnProperty.call(vars, name) && vars[name] !== '') return vars[name];
    missing.push(name);
    return '';
  });
  return { value: out, missing };
}

/**
 * Turn what a probe returned into an identity. Three outcomes and never a fourth: a value, or
 * `{ error }`. An empty read is an error — "" is not an identity, and treating it as one would let
 * two unreadable components compare equal.
 */
export function extract(body, read) {
  const text = String(body ?? '');
  if (read === 'raw') {
    const v = text.trim().split(/\r?\n/)[0]?.trim() ?? '';
    return v ? { value: v } : { error: 'empty response' };
  }
  if (read === 'sha256') {
    return text.length ? { value: createHash('sha256').update(text.replace(/\r\n?/g, '\n')).digest('hex').slice(0, 16) } : { error: 'empty response' };
  }
  if (read.startsWith('json:')) {
    let doc;
    try { doc = JSON.parse(text); } catch { return { error: 'response is not JSON' }; }
    let cur = doc;
    for (const key of read.slice(5).replace(/^\$\.?/, '').split('.').filter(Boolean)) {
      if (cur === null || typeof cur !== 'object' || !(key in cur)) return { error: `no ${read.slice(5)} in the response` };
      cur = cur[key];
    }
    if (cur === null || cur === undefined || cur === '') return { error: `${read.slice(5)} is empty` };
    return { value: typeof cur === 'object' ? JSON.stringify(cur) : String(cur) };
  }
  if (read.startsWith('regex:')) {
    let re;
    try { re = new RegExp(read.slice(6), 'm'); } catch (e) { return { error: `bad pattern: ${e.message}` }; }
    const m = re.exec(text);
    if (!m) return { error: 'pattern did not match' };
    const v = (m[1] ?? m[0]).trim();
    return v ? { value: v } : { error: 'pattern matched nothing' };
  }
  return { error: `unknown Read \`${read}\`` };
}

const HEX = /^[0-9a-f]{7,64}$/i;
/** A commit is named by any prefix of seven or more; everything else must be equal. */
export function sameIdentity(observed, expected) {
  if (observed == null || expected == null) return false;
  const a = String(observed).trim(), b = String(expected).trim();
  if (HEX.test(a) && HEX.test(b)) {
    const [s, l] = a.length <= b.length ? [a, b] : [b, a];
    return l.toLowerCase().startsWith(s.toLowerCase());
  }
  // A version string often carries the commit: "2.4.1+9f8e7d6" or "build 9f8e7d6a" names 9f8e7d6.
  if (HEX.test(b) && !HEX.test(a)) return a.toLowerCase().split(/[^0-9a-f]+/i).some((t) => t.length >= 7 && sameIdentity(t, b));
  return a === b;
}

/**
 * One component's status. `expected` is null when nothing pins it.
 *   MATCH     read, pinned, equal          MISMATCH  read, pinned, different
 *   UNREAD    the probe could not answer   RECORDED  read, nothing to compare with
 */
export function componentStatus({ observed, error, expected }) {
  if (error || observed == null) return 'UNREAD';
  if (expected == null) return 'RECORDED';
  return sameIdentity(observed, expected) ? 'MATCH' : 'MISMATCH';
}

/**
 * The run's verdict, in the order a reader must act on it:
 *   NOT_DEPLOYED  something read back as a different identity than expected — the run would judge
 *                 the wrong system, so it does not start (a wrong build is a fact, not a guess)
 *   UNVERIFIED    something pinned could not be read, or nothing is declared — a run may proceed,
 *                 but its verdicts cannot claim the shipped change
 *   MATCH         every pinned component read back as expected
 *   UNPINNED      everything read, nothing was expected (no shipped commit) — recorded for deltas
 */
export function runVerdict(components) {
  if (!components.length) return 'UNVERIFIED';
  if (components.some((c) => c.status === 'MISMATCH')) return 'NOT_DEPLOYED';
  const pinned = components.filter((c) => c.expected != null);
  if (pinned.some((c) => c.status === 'UNREAD')) return 'UNVERIFIED';
  if (pinned.length) return 'MATCH';
  return components.some((c) => c.status === 'UNREAD') ? 'UNVERIFIED' : 'UNPINNED';
}

/** What a component is expected to be: an explicit `--expect name=value` wins, then the plan's commit. */
export function expectedFor(row, { overrides = {}, shippedSha = null } = {}) {
  if (Object.prototype.hasOwnProperty.call(overrides, row.component)) return overrides[row.component];
  if (row.expect === 'shipped-sha' && shippedSha && shippedSha !== '—') return shippedSha;
  return null;
}

/** A host is part of the identity, but its name is the environment's business: keep a short hash. */
export function originHash(url) {
  try { return createHash('sha256').update(new URL(url).origin).digest('hex').slice(0, 12); } catch { return null; }
}

/**
 * Two runs' identities, component by component — what changed between them. A component missing
 * on either side, or unread on either side, is `unknown`: an absent reading is never "the same".
 */
export function identityDiff(a, b) {
  const by = (t) => new Map((t?.components ?? []).map((c) => [c.component, c]));
  const A = by(a), B = by(b);
  const names = [...new Set([...A.keys(), ...B.keys()])].sort();
  return names.map((component) => {
    const x = A.get(component), y = B.get(component);
    const kind = (y ?? x).kind;
    if (!x || !y || x.status === 'UNREAD' || y.status === 'UNREAD' || x.observed == null || y.observed == null)
      return { component, kind, change: 'unknown', from: x?.observed ?? null, to: y?.observed ?? null };
    return { component, kind, change: sameIdentity(x.observed, y.observed) ? 'same' : 'changed', from: x.observed, to: y.observed };
  });
}

/** The commit a plan header names (`**Shipped SHA:** <sha | —>`), or null. */
export function shippedShaOf(planText) {
  const m = /\*\*Shipped SHA:\*\*\s*`?([0-9a-f]{7,40}|—)`?/i.exec(String(planText ?? ''));
  return m && m[1] !== '—' ? m[1] : null;
}
