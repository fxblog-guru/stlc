#!/usr/bin/env node
/**
 * heal-guard.mjs — the mechanical half of "never weaken what the test asserts" (/qa-heal, /qa-flaky).
 *
 *   npm run qa:heal-guard [-- --base <ref>] [--human "<quote>"] [--json]
 *
 * Compares the Playwright specs and the shared layer between a base ref (default: the merge base
 * with origin's default branch) and the working tree, reads every assertion from the TypeScript
 * syntax tree, and fails when a change hides a failure instead of following the case:
 *
 *   removed      an assertion or a test is gone (a spec deleted while its case lives)   never allowed
 *   weakened     an assertion lost strength (exact → partial → presence), or now sits
 *                under try/catch, .catch(), if, a ternary, && || ??, a switch case, or
 *                after a return / throw / break / continue                             never allowed
 *   suppressed   skip / fixme / only / slow, a hard wait, a timeout, retries,
 *                configure(), toPass(), a test.fail that names no OPEN defect            never allowed
 *   expected     an assertion's expected value, its `not`, or a test title changed      only toward the case
 *   data         a literal the test arranges with (quantity, code, price)              only toward the case
 *   contract     a response schema under scripts/shared/schemas/ changed               only with --human
 *   oracle       the mirrored case's Steps / Expected / Variants / Data changed in the
 *                same change as its spec — the test moved its own judge                reviewed or --human
 *   maintenance  a locator, a helper, a page object, a renamed subject                  allowed, listed
 *
 * "Toward the case": the mirrored case file (cases/**\/<same basename>.md) is the source of truth
 * (CONTRACTS §7). An expected or data change is allowed when every new literal appears in the case
 * and the literal it replaced does not — the spec moved to what the case says. A change the case does
 * not support is a behaviour change: the case changes first (/qa-design), or a human confirms it,
 * quoted with --human. A diff of application code is never evidence; a code change is also what a bug
 * looks like.
 *
 * The case is read as it was at the base. A change that edits the case and the spec together would
 * otherwise always look "toward the case": the spec follows an oracle that was moved to where the
 * product already is (CONTRACTS §31). Such an edit is allowed only when a READY case review lists the
 * case with its new body hash (CONTRACTS §18 — someone judged the new oracle) or a human confirms it
 * with --human; until then the spec is judged against the case as it stood before the edit.
 *
 * Run from the QA root. Exit 0 when nothing is blocked, 1 when something is, 2 when git fails.
 * Writes reports/heal-guard/<YYYY-MM-DD-HHmm>.md unless --json.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { trackRun } from './lib/runlog.mjs';
import { healEvent, logActivity } from './lib/activity.mjs';
import { repoPath, workspaceRoot } from './lib/root.mjs';
import { hashArtifact } from './lib/doc.mjs';

export const FORBIDDEN = new Set(['removed', 'weakened', 'suppressed']);
export const TOWARD_CASE = new Set(['expected', 'data']);

/** Specs of the Playwright tiers, the shared layer they stand on, and the runner config. */
export const IN_SCOPE = /^(scripts\/(api|integration|e2e|security|accessibility|ui)\/.+\.spec\.ts|scripts\/shared\/.+\.ts|scripts\/setup\/.+\.ts|playwright\.config\.ts)$/;
const SCHEMAS = /^scripts\/shared\/schemas\//;
const SPEC = /^scripts\/(api|integration|e2e|security|accessibility|ui)\/.+\.spec\.ts$/;

// ---- reading assertions ---------------------------------------------------------------------------------

/** Exact value 3 · partial 2 · presence 1. A matcher moving down this scale proves less. */
const EXACT = new Set(['toBe', 'toEqual', 'toStrictEqual', 'toHaveText', 'toHaveValue', 'toHaveValues', 'toHaveCount', 'toHaveURL', 'toHaveTitle', 'toHaveAttribute', 'toHaveLength', 'toHaveClass', 'toHaveCSS', 'toBeCloseTo', 'toHaveScreenshot', 'toMatchSnapshot', 'toMatchAriaSnapshot']);
const PARTIAL = new Set(['toContainText', 'toContain', 'toContainEqual', 'toMatch', 'toMatchObject', 'toHaveProperty', 'toBeGreaterThan', 'toBeGreaterThanOrEqual', 'toBeLessThan', 'toBeLessThanOrEqual', 'toBeInstanceOf', 'toThrow', 'toHaveJSProperty']);
export const strength = (matcher) => (EXACT.has(matcher) ? 3 : PARTIAL.has(matcher) ? 2 : 1);

const SOURCES = new Map();

/** A file parsed by the TypeScript compiler, and its text with every comment blanked (same offsets). */
function source(src) {
  const hit = SOURCES.get(src);
  if (hit) return hit;
  const file = ts.createSourceFile('spec.ts', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const comments = new Map();
  const visit = (node) => {
    const children = node.getChildren(file);
    for (const child of children) visit(child);
    if (children.length) return;
    for (const c of ts.getLeadingCommentRanges(src, node.pos) ?? []) comments.set(c.pos, c.end);
    for (const c of ts.getTrailingCommentRanges(src, node.end) ?? []) comments.set(c.pos, c.end);
  };
  visit(file);
  let code = '';
  let at = 0;
  for (const [start, end] of [...comments].sort(([a], [b]) => a - b)) {
    if (start < at) continue;
    code += src.slice(at, start) + ' '.repeat(end - start);
    at = end;
  }
  code += src.slice(at);
  if (SOURCES.size > 32) SOURCES.clear();
  const parsed = { file, code };
  SOURCES.set(src, parsed);
  return parsed;
}

const oneLine = (text) => text.replace(/\s+/g, ' ').trim();
const textOf = (s, node) => oneLine(s.code.slice(node.getStart(s.file), node.end));
/** Comments out, whitespace collapsed: formatting never counts as a change. */
const normalize = (src) => oneLine(source(src).code);

const LOGICAL = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken, ts.SyntaxKind.BarBarEqualsToken, ts.SyntaxKind.QuestionQuestionEqualsToken,
]);
const EXITS = {
  [ts.SyntaxKind.ReturnStatement]: 'return', [ts.SyntaxKind.ThrowStatement]: 'throw',
  [ts.SyntaxKind.BreakStatement]: 'break', [ts.SyntaxKind.ContinueStatement]: 'continue',
};
const statementsOf = (n) => (ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n) || ts.isCaseClause(n) || ts.isDefaultClause(n) ? n.statements : undefined);
/** A catch block swallows the failure unless it rethrows. */
const swallows = (clause) => clause !== undefined && !clause.block.statements.some((s) => ts.isThrowStatement(s));

/**
 * What around a node can stop it from running or from failing the test, innermost first. Loops and
 * callbacks that are never called are not seen.
 */
function guardsOf(node) {
  const guards = [];
  for (let child = node; !ts.isSourceFile(child); child = child.parent) {
    const parent = child.parent;
    if (ts.isTryStatement(parent)) {
      if (child === parent.tryBlock && swallows(parent.catchClause)) guards.push('inside try/catch');
      else if (child === parent.catchClause) guards.push('inside a catch block');
    } else if (ts.isIfStatement(parent) && child !== parent.expression) guards.push('under an if');
    else if (ts.isConditionalExpression(parent) && child !== parent.condition) guards.push('under a ternary');
    else if (ts.isBinaryExpression(parent) && child === parent.right && LOGICAL.has(parent.operatorToken.kind)) guards.push(`under ${ts.tokenToString(parent.operatorToken.kind)}`);
    else if ((ts.isCaseClause(parent) && child !== parent.expression) || ts.isDefaultClause(parent)) guards.push('under a switch case');
    else if (ts.isPropertyAccessExpression(parent) && child === parent.expression && parent.name.text === 'catch' && ts.isCallExpression(parent.parent) && parent.parent.expression === parent) guards.push('inside .catch()');
    const statements = statementsOf(parent);
    const at = statements ? statements.indexOf(child) : -1;
    // A function declaration is hoisted, so a return before it doesn't make it unreachable.
    if (statements && at > 0 && !ts.isFunctionDeclaration(child)) {
      const exit = statements.slice(0, at).map((s) => EXITS[s.kind]).find(Boolean);
      if (exit) guards.push(`unreachable after ${exit}`);
    }
  }
  return guards;
}

const CHAIN = new Set(['not', 'resolves', 'rejects']);
/** `expect(…)`, `expect.soft(…)` or `expect.poll(…)`: the call an assertion chain starts from. */
const isExpect = (callee) =>
  (ts.isIdentifier(callee) && callee.text === 'expect') ||
  (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'expect' && ['soft', 'poll'].includes(callee.name.text));

/** The assertion a call makes: `expect(x, 'msg').not.toBe(y)`. */
function assertionAt(s, call) {
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) return undefined;
  let target = callee.expression;
  let not = false;
  while (ts.isPropertyAccessExpression(target) && CHAIN.has(target.name.text)) {
    not ||= target.name.text === 'not';
    target = target.expression;
  }
  if (!ts.isCallExpression(target) || !isExpect(target.expression)) return undefined;
  const [subject, message] = target.arguments;
  return {
    text: textOf(s, call),
    subject: subject ? textOf(s, subject) : '',
    message: message ? textOf(s, message) : '',
    not,
    matcher: callee.name.text,
    expected: oneLine(s.code.slice(call.arguments.pos, call.arguments.end)),
    guards: guardsOf(call),
  };
}

/** Every assertion in a file, in source order. An expect nested in another (a toPass block) is part of it. */
export function assertions(src) {
  const s = source(src);
  const found = [];
  const visit = (node) => {
    const a = ts.isCallExpression(node) ? assertionAt(s, node) : undefined;
    if (a) found.push(a);
    else ts.forEachChild(node, visit);
  };
  visit(s.file);
  return found;
}

const isText = (n) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n);
const TEST_MODIFIERS = new Set(['only', 'skip', 'fixme', 'fail', 'slow']);
const declaresTest = (callee) =>
  (ts.isIdentifier(callee) && callee.text === 'test') ||
  (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'test' && TEST_MODIFIERS.has(callee.name.text));

/** Titles of the tests a file declares (`test('…'`, `test.skip('…'`), not steps. */
export function testTitles(src) {
  const s = source(src);
  const titles = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && declaresTest(node.expression)) {
      const [title] = node.arguments;
      if (title && isText(title)) titles.push(textOf(s, title).slice(1, -1));
    }
    ts.forEachChild(node, visit);
  };
  visit(s.file);
  return titles;
}

/** A call whose first argument is a title: test(…), describe(…), test.step(…) and their modifiers. */
function titled(callee) {
  if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'step') return true;
  let root = callee;
  while (ts.isPropertyAccessExpression(root)) root = root.expression;
  return ts.isIdentifier(root) && ['test', 'describe', 'step'].includes(root.text);
}
const isTestFail = (callee) => ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'test' && callee.name.text === 'fail';
const isCaseMeta = (callee) => ts.isIdentifier(callee) && callee.text === 'caseMeta';
/** Locator calls: what /qa-heal is there to change. Their arguments are maintenance, not data. */
const LOCATORS = new Set(['locator', 'getByRole', 'getByTestId', 'getByText', 'getByLabel', 'getByPlaceholder', 'getByAltText', 'getByTitle', 'frameLocator', 'waitForSelector', 'el', 'byTestId']);
const isLocator = (callee) => (ts.isPropertyAccessExpression(callee) ? LOCATORS.has(callee.name.text) : ts.isIdentifier(callee) && LOCATORS.has(callee.text));
/** A literal's value, not its spelling: 'a', "a" and `a` are the same datum. */
const valueOf = (s, node) => (ts.isNumericLiteral(node) ? String(Number(node.text)) : ts.isTemplateExpression(node) ? textOf(s, node) : node.text);

/**
 * Test data a spec states outside its assertions, titles, imports, locators and caseMeta(): string and
 * number literals (`quantity: 11`, `'WELCOME10'`). Changing one can move a test off the boundary it
 * exists for.
 */
export function dataLiterals(path, src) {
  if (!SPEC.test(path)) return [];
  const s = source(src);
  const out = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) return;
    if (isText(node) || ts.isNumericLiteral(node)) { out.push(valueOf(s, node)); return; }
    if (ts.isCallExpression(node)) {
      if (assertionAt(s, node) || isCaseMeta(node.expression)) return;
      if (isLocator(node.expression)) { visit(node.expression); return; }
      if (isTestFail(node.expression)) return;
      if (titled(node.expression)) {
        node.arguments.forEach((arg, i) => { if (i > 0 || !isText(arg)) visit(arg); });
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(s.file);
  return out;
}

// ---- comparing ------------------------------------------------------------------------------------------

function take(xs, match) {
  const i = xs.findIndex(match);
  return i < 0 ? undefined : xs.splice(i, 1)[0];
}
/** Items of `after` that `before` doesn't have (multiset difference). */
export function added(before, after) {
  const left = [...before];
  return after.filter((x) => !take(left, (y) => y === x));
}
const check = (x) => `${x.not ? 'not.' : ''}${x.matcher}(${x.expected})`;

function compareAssertions(file, before, after) {
  const out = [];
  const b = [...before];
  const a = [...after];
  const pair = (x, match) => {
    const y = take(a, match);
    if (!y) return undefined;
    take(b, (z) => z === x);
    const g = added(x.guards, y.guards);
    if (g.length) out.push({ file, kind: 'weakened', detail: `${y.subject}: ${check(y)} is now ${g.join(', ')}` });
    return y;
  };
  // 1. unchanged, first where it was, then anywhere
  for (const x of [...b]) pair(x, (y) => y.text === x.text && y.guards.join() === x.guards.join());
  for (const x of [...b]) pair(x, (y) => y.text === x.text);
  // 2. same check, only the message or the subject's name changed
  for (const x of [...b]) {
    const y = pair(x, (z) => z.matcher === x.matcher && z.not === x.not && z.expected === x.expected && (z.subject === x.subject || z.message === x.message));
    if (y && y.subject !== x.subject) out.push({ file, kind: 'maintenance', detail: `subject renamed: ${x.subject} → ${y.subject}` });
  }
  // 3. same subject, the check itself changed
  for (const x of [...b]) {
    const y = pair(x, (z) => z.subject === x.subject) ?? pair(x, (z) => z.message !== '' && z.message === x.message);
    if (!y) continue;
    const weaker = strength(y.matcher) < strength(x.matcher);
    out.push({ file, kind: weaker ? 'weakened' : 'expected', detail: `${x.subject}: ${check(x)} → ${check(y)}`, from: x.expected, to: y.expected, notFlip: x.not !== y.not });
  }
  for (const x of b) out.push({ file, kind: 'removed', detail: `assertion: ${x.text.slice(0, 140)}` });
  return out;
}

const SUPPRESSIONS = [
  [/\b(?:test|describe)(?:\.describe)?\.(?:skip|fixme|only|slow)\s*\(/g, 'skip / fixme / only / slow'],
  [/\b(?:testInfo|test\.info\(\))\s*\.\s*(?:skip|fixme|fail|slow)\s*\(/g, 'skip / fixme / fail / slow at runtime'],
  [/\bwaitForTimeout\s*\(/g, 'a hard wait (waitForTimeout)'],
  [/\bsetTimeout\s*\(/g, 'a timeout or a hard wait (setTimeout)'],
  [/\btimeout\s*:/g, 'an explicit timeout'],
  [/\bretries\s*:/g, 'retries'],
  [/\.configure\s*\(/g, 'test / expect configuration (retries, mode, timeouts)'],
  [/\.toPass\s*\(/g, 'a retry loop (toPass)'],
  [/\bforbidOnly\s*:/g, 'forbidOnly'],
  [/\b(?:grepInvert|testIgnore)\s*:/g, 'tests excluded from the run'],
];

/** Index just past the bracket that closes the one at `open`, skipping strings. */
function close(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < s.length && s[i] !== c; i++) if (s[i] === '\\') i++;
      continue;
    }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c) && --depth === 0) return i + 1;
  }
  return s.length;
}

/** Each occurrence as written, so a suppression moved elsewhere or a timeout raised counts as new. */
function occurrences(s, re) {
  return [...s.matchAll(re)].map((m) => {
    const end = m.index + m[0].length;
    if (m[0].endsWith('(')) return s.slice(m.index, close(s, end - 1));
    const stop = s.slice(end).search(/[,}]/);
    return s.slice(m.index, stop < 0 ? s.length : end + stop);
  });
}

/** `test.fail(…)` calls that name no OPEN defect id (`DEF-<slug>-NNN`). */
function unpinnedFails(src, openDefects) {
  return [...normalize(src).matchAll(/\btest\.fail\s*\(([^)]*)\)/g)]
    .map((m) => m[1] ?? '')
    .filter((args) => {
      const id = /DEF-[a-z0-9-]+-\d{3}/.exec(args)?.[0];
      return !(id && openDefects.has(id));
    });
}

/** What changed in one file, before the case is consulted. */
export function classify({ path, before, after }, { openDefects = new Set(), caseLives = () => true } = {}) {
  if (normalize(before) === normalize(after)) return [];
  if (!after && SPEC.test(path)) {
    return caseLives(path)
      ? [{ file: path, kind: 'removed', detail: 'spec deleted while its case is not deprecated (supersede the case first, CONTRACTS §1)' }]
      : [{ file: path, kind: 'maintenance', detail: 'spec deleted with its case' }];
  }
  if (SCHEMAS.test(path)) return [{ file: path, kind: 'contract', detail: 'a response schema changed' }];

  const out = [];
  const nb = normalize(before);
  const na = normalize(after);
  for (const [re, what] of SUPPRESSIONS) {
    if (added(occurrences(nb, re), occurrences(na, re)).length) out.push({ file: path, kind: 'suppressed', detail: `added ${what}` });
  }
  if (added(unpinnedFails(before, openDefects), unpinnedFails(after, openDefects)).length) {
    out.push({ file: path, kind: 'suppressed', detail: 'test.fail without an OPEN DEF- id (file the defect first: /qa-defect)' });
  }

  const dataBefore = dataLiterals(path, before);
  const dataAfter = dataLiterals(path, after);
  const dropped = added(dataAfter, dataBefore);
  if (dropped.length) {
    const fresh = added(dataBefore, dataAfter);
    out.push({ file: path, kind: 'data', detail: `test data changed: ${dropped.slice(0, 6).join(', ')} → ${fresh.slice(0, 6).join(', ') || '(removed)'}`, gone: dropped, fresh });
  }

  const tb = testTitles(before);
  const ta = testTitles(after);
  if (ta.length < tb.length) out.push({ file: path, kind: 'removed', detail: `tests: ${tb.filter((t) => !ta.includes(t)).join(' · ')}` });
  else {
    for (const t of tb.filter((x) => !ta.includes(x))) {
      const fresh = ta.filter((x) => !tb.includes(x));
      out.push({ file: path, kind: 'expected', detail: `test retitled: "${t}" → ${fresh.map((x) => `"${x}"`).join(', ')}`, gone: [t], fresh });
    }
  }

  out.push(...compareAssertions(path, assertions(before), assertions(after)));
  if (!out.length) out.push({ file: path, kind: 'maintenance', detail: !before ? 'new file' : 'no assertion, test or suppression changed' });
  return out;
}

/** String and number literals inside an expression's text, unquoted. */
export function literalsOf(text) {
  return [...String(text ?? '').matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`([^`$]*)`|(?<![\w.])(-?\d+(?:\.\d+)?)(?![\w.])/g)]
    .map((m) => m[1] ?? m[2] ?? m[3] ?? m[4])
    .filter((x) => x !== undefined && x !== '');
}

/**
 * Does the case support the move? Every new literal appears in the case text, and at least one
 * literal it replaced no longer does (the spec moved to the case, not away from it). A `not` flip is
 * never supported by a literal.
 */
export function towardCase(finding, caseText) {
  if (!caseText || finding.notFlip) return false;
  const text = caseText.replace(/\s+/g, ' ');
  // A whole token, not a substring: 2 is not in 201, and A1 is not in A10.
  const has = (x) => new RegExp(`(^|[^\\w])${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w])`).test(text);
  const fresh = finding.fresh ?? literalsOf(finding.to).filter((x) => !literalsOf(finding.from).includes(x));
  const gone = finding.gone ?? literalsOf(finding.from).filter((x) => !literalsOf(finding.to).includes(x));
  if (!fresh.length && !gone.length) return false;
  return fresh.every(has) && (gone.length === 0 || gone.some((x) => !has(x)));
}

/** The parts of a case that judge the product: what is done, and what must then be seen. */
export const ORACLE_SECTIONS = ['Steps', 'Expected Result', 'Variants', 'Data'];
export function oracleOf(text) {
  const keep = [];
  let on = false;
  for (const line of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { on = ORACLE_SECTIONS.includes(h[1]); if (on) keep.push(`## ${h[1]}`); continue; }
    if (on && line.trim()) keep.push(line.trim().replace(/\s+/g, ' '));
  }
  return keep.join('\n');
}

/**
 * Does this case review approve this exact case body? Only a `READY FOR /qa-script` verdict counts,
 * and only an entry whose path ends with the case's path and whose sha256 is the body's hash now
 * (CONTRACTS §18): a review of the old wording approves the old wording.
 */
export function reviewedBody(reviewText, casePath, hash) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(reviewText ?? ''));
  if (!fm || !/^verdict:\s*READY FOR \/qa-script\s*(#.*)?$/m.test(fm[1])) return false;
  const lines = fm[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^\s*-\s*path:\s*(\S+)\s*$/.exec(lines[i]);
    if (!m || !(m[1] === casePath || m[1].endsWith(`/${casePath}`))) continue;
    const s = /^\s*sha256:\s*([0-9a-f]+)/.exec(lines[i + 1] ?? '');
    if (s && s[1] === hash) return true;
  }
  return false;
}

/**
 * Applies the evidence.
 *   caseOf(file)      the mirrored case now — { path, text } — or null
 *   caseBefore(file)  the same case at the base, or null (a case new in this change)
 *   reviewed(path)    the READY case review listing this case's current body hash, or null
 */
export function review(changes, { openDefects = new Set(), caseOf = () => null, caseBefore = () => null, reviewed = () => null, caseLives = () => true, human = null } = {}) {
  const oracles = new Map(); // case path → { moved, before, approvedBy, reported }
  const oracleFor = (file) => {
    const now = caseOf(file);
    if (!now) return null;
    if (!oracles.has(now.path)) {
      const before = caseBefore(file);
      const moved = Boolean(before && oracleOf(before.text) !== oracleOf(now.text));
      const approvedBy = moved ? (human ? `human: "${human}"` : reviewed(now.path)) : null;
      oracles.set(now.path, { path: now.path, moved, before, approvedBy, reported: false });
    }
    return oracles.get(now.path);
  };
  return changes.flatMap((c) => {
    const o = SPEC.test(c.path) ? oracleFor(c.path) : null;
    const out = [];
    if (o?.moved && !o.reported) {
      o.reported = true;
      out.push({ file: o.path, kind: 'oracle', detail: `the case's Steps / Expected changed together with ${c.path}`, allowed: Boolean(o.approvedBy), ...(o.approvedBy ? { evidence: o.approvedBy } : {}) });
    }
    for (const f of classify(c, { openDefects, caseLives })) {
      if (FORBIDDEN.has(f.kind)) { out.push({ ...f, allowed: false }); continue; }
      if (f.kind === 'maintenance') { out.push({ ...f, allowed: true }); continue; }
      if (human) { out.push({ ...f, allowed: true, evidence: `human: "${human}"` }); continue; }
      if (TOWARD_CASE.has(f.kind)) {
        // An oracle nobody approved moving: judge the spec by the case as it stood before the change.
        const kase = o?.moved && !o.approvedBy ? o.before : caseOf(f.file);
        if (kase && towardCase(f, kase.text)) { out.push({ ...f, allowed: true, evidence: `follows ${kase.path}` }); continue; }
      }
      out.push({ ...f, allowed: false });
    }
    return out;
  });
}

// ---- the command ----------------------------------------------------------------------------------------

function git(args) {
  const run = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: run.status === 0, out: (run.stdout ?? '').trim(), err: (run.stderr ?? '').trim() };
}

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name).replace(/\\/g, '/');
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** The merge base with origin's default branch, else HEAD. */
function defaultBase() {
  const head = git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
  const ref = head.ok ? head.out.replace(/^refs\/remotes\//, '') : ['origin/main', 'origin/master'].find((r) => git(['rev-parse', '--verify', '--quiet', r]).ok);
  if (!ref) return 'HEAD';
  const mb = git(['merge-base', 'HEAD', ref]);
  return mb.ok ? mb.out : ref;
}

function main(argv) {
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  const base = opt('--base') ?? defaultBase();
  const human = opt('--human');
  if (!git(['rev-parse', '--verify', '--quiet', base]).ok) {
    console.error(`qa:heal-guard — --base ${base} is not a ref (run from the QA root inside a git repository)`);
    return 2;
  }
  const changed = [
    ...git(['diff', '--relative', '--name-only', base, '--', '.']).out.split('\n'),
    ...git(['ls-files', '--others', '--exclude-standard', '--', '.']).out.split('\n'),
  ].map((p) => p.trim()).filter((p) => IN_SCOPE.test(p));
  const changes = [...new Set(changed)].map((path) => ({
    path,
    before: git(['show', `${base}:./${path}`]).out,
    after: existsSync(path) ? readFileSync(path, 'utf8') : '',
  }));

  // Cases by basename (scripts mirror cases 1:1), open defects by id.
  const cases = new Map();
  for (const p of walk('cases')) if (p.endsWith('.md')) cases.set(basename(p, '.md'), p);
  const openDefects = new Set();
  for (const p of walk('defects')) {
    const m = /^(DEF-[a-z0-9-]+-\d{3})/.exec(basename(p));
    if (m && /\*\*Status:\*\*\s*(OPEN|IN PROGRESS|REOPENED)/i.test(readFileSync(p, 'utf8'))) openDefects.add(m[1]);
  }
  const casePath = (file) => cases.get(basename(file).replace(/\.spec\.ts$/, ''));
  const caseOf = (file) => {
    const p = casePath(file);
    return p ? { path: p, text: readFileSync(p, 'utf8') } : null;
  };
  const caseLives = (file) => {
    const p = casePath(file);
    return Boolean(p && !/@deprecated:/.test(readFileSync(p, 'utf8')));
  };
  const caseBefore = (file) => {
    const p = casePath(file);
    if (!p) return null;
    const r = git(['show', `${base}:./${p}`]);
    return r.ok ? { path: p, text: r.out } : null;
  };
  const reviewed = (p) => {
    const hash = hashArtifact(p);
    for (const f of walk('reviews')) {
      if (!f.endsWith('-case-review.md')) continue;
      const text = readFileSync(f, 'utf8');
      if (reviewedBody(text, p, hash)) return `reviewed in ${f}`;
    }
    return null;
  };

  const findings = review(changes, { openDefects, caseOf, caseBefore, reviewed, caseLives, human });
  const blocked = findings.filter((f) => !f.allowed);
  const cell = (s) => String(s ?? '').replace(/\|/g, '\\|');
  const md = [
    `# Heal guard — ${blocked.length ? `BLOCKED (${blocked.length})` : 'OK'}`,
    '',
    `Base \`${base}\` · ${changes.length} changed file(s) under scripts/ and playwright.config.ts.`,
    ...(human ? ['', `Human confirmation: "${human}"`] : []),
    '',
    findings.length
      ? ['| | File | Change | Detail | Evidence |', '|---|---|---|---|---|', ...findings.map((f) => `| ${f.allowed ? '✓' : '✗'} | ${cell(f.file)} | ${f.kind} | ${cell(f.detail)} | ${cell(f.evidence ?? '')} |`)].join('\n')
      : 'Nothing to review.',
    '',
    ...(blocked.length ? ['A blocked change hides a failure, or changes what the test expects without the case saying so. Revert it and triage the failure (CONTRACTS §5): a product bug goes to /qa-defect, never into the spec.', ''] : []),
  ].join('\n');

  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ base, blocked: blocked.length, findings }, null, 2) + '\n');
  } else {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
    const out = opt('--out') ?? `reports/heal-guard/${stamp}.md`;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, md);
    const root = workspaceRoot();
    const rel = relative(resolve(root), resolve(out)).split(sep).join('/');
    if (changes.length) logActivity(root, [healEvent({ blocked: blocked.length, changes: changes.length, link: rel.startsWith('..') ? null : repoPath(root, rel) })]);
    console.log(md);
    console.log(`✓ Wrote ${out}`);
  }
  return blocked.length ? 1 : 0;
}

const isMain = process.argv[1] && /(^|\/)heal-guard\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) trackRun(import.meta.url);
if (isMain) process.exit(main(process.argv.slice(2)));
