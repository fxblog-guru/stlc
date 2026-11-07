#!/usr/bin/env node
/**
 * pr-scan.mjs — the mechanical half of a TESTING pull-request review (/qa-review-pr).
 *
 *   node <qa-root>/scripts/shared/pr-scan.mjs [--pr <n>] [--base <ref>] [--head <ref>] [--json] [--fail-on High|Medium]
 *
 * A test PR fails differently from a code PR: its danger is a test that passes for the wrong
 * reason, a weakened assertion, a case whose script no longer proves it, or a run that turns green
 * because something stopped running. This reads the diff from the merge base and reports what a
 * tool can see: assertions removed, skips/only/fixed sleeps/force clicks/raw selectors added, a
 * spec with no mirrored case (and the reverse), Case IDs minted twice across branches, quarantine
 * tags added outside /qa-quarantine, shipped kit files edited in place, case files edited after a
 * review hashed them (the review is now STALE), secrets and .env/.auth files, and app code mixed in.
 *
 * Run from the repository root (the folder that holds the QA root — `.stlc/`, or `qa/` on a project
 * installed before 2.1; both prefixes are read, CONTRACTS §2). GitLab and GitHub alike: `--pr <n>`
 * fetches `merge-requests/<n>/head` or `pull/<n>/head` from origin; no CLI or token is needed.
 * Exit 0 unless git fails (2), or `--fail-on <severity>` finds something at or above it (1) — the CI
 * job uses `--fail-on High`. The verdict on the PR is the reviewer's, not this script's.
 */

import { atOrAbove, bySeverity, CONFLICT_MARKER, git, parseArgs, platformOf, readDiff, scanAdded } from './lib/pr-diff.mjs';
import { sha256, parseDoc } from './lib/doc.mjs';
import { section } from './lib/case-quality.mjs';
import { findRoot, ROOT_NAMES } from './lib/root.mjs';
import { trackRun } from './lib/runlog.mjs';

const TC_IN_NAME = /(TC-[A-Z0-9]+-[A-Z0-9-]+-\d{3})-/;
// The kit the bundle ships: fixed upstream through /qa-feedback, not edited per project.
const KIT_TAIL = String.raw`scripts\/(shared\/(lint-qa|case-score|build-state|status|contracts|run-plan|changed-modules|renumber-case|update-notice|lint-on-write|verdict-upload|pr-scan|migrate-root)\.mjs|shared\/lib\/[^/]+\.mjs|shared\/(auth|config|fixtures|http|data|meta|ui|fuzz|model|schemas|a11y|constants|components)\/.*\.ts|shared\/meta\.ts|setup\/auth\.setup\.ts)$`;

/**
 * The QA root names a diff may use (CONTRACTS §2): `.stlc/` and `qa/` on every project, so a branch
 * cut before a migration scans the same as one cut after it, plus the root the project's
 * PROJECT-PROFILE `QA root` (or QA_ROOT) names when it is neither.
 */
export function rootNames(cwd = process.cwd()) {
  const r = findRoot({ cwd });
  const own = r.source === 'profile' || r.source === 'env' ? [String(r.name).replace(/\\/g, '/').replace(/^\.\/(?=.)/, '').replace(/\/+$/, '')] : [];
  return [...new Set([...ROOT_NAMES, ...own])];
}

/** Every path pattern the scan uses, anchored at any of `names`. */
function patterns(names) {
  const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const at = (tail, flags = '') => new RegExp(String.raw`^(?:${alt})\/` + tail, flags);
  return {
    names,
    QA: at(''),
    SPEC_RE: at(String.raw`scripts\/(api|integration|e2e|security|accessibility|ui|unit|mobile|performance)\/.+\.(spec\.ts|test\.[a-z]+|js|ts|py|cs|java|go)$`),
    CASE_RE: at(String.raw`cases\/[^/]+\/(?:[^/]+\/)*(TC-[A-Z0-9]+-[A-Z0-9-]+-\d{3})-[a-z0-9-]+\.md$`),
    KIT_RE: at(KIT_TAIL),
    SPEC_TS: at(String.raw`scripts\/.+\.spec\.ts$`),
    SCRIPTS: at(String.raw`scripts\/`),
    CASES: at(String.raw`cases\/`),
    PERF_CASES: at(String.raw`cases\/performance\/`),
    REGRESSION: at(String.raw`regression\/`),
    REVIEW: at(String.raw`reviews\/`),
    ENV: at(String.raw`(\.env\.(?!example$)[^/]+|\.auth\/)`),
    HEAVY: at(String.raw`runs\/.+\.(zip|webm|png|jpe?g|html)$`, 'i'),
    REPORT_DIRS: at(String.raw`(playwright-report|test-results|blob-report)\/`),
    STATE: at(String.raw`state\.json$`),
    SHARED_TS: at(String.raw`scripts\/shared\/.+\.ts$`),
    CONFIG: at(String.raw`(playwright\.config\.ts|package\.json|eslint\.config\.mjs|tsconfig\.json)$`),
    SLUG: at(String.raw`(?:analysis|plans|reviews|reports|defects|exploratory)\/([a-z0-9][a-z0-9-]*)\/`),
  };
}

// Set per scan from the project's root names; the default reads both standard prefixes.
let P = patterns(ROOT_NAMES);
const SPEC_RE = { test: (p) => P.SPEC_RE.test(p) };
const CASE_RE = { test: (p) => P.CASE_RE.test(p) };
const SPEC_TS = (p) => P.SPEC_TS.test(p);
/** The root name a path sits under (`.stlc`, `qa`, …), or null. */
const rootOf = (p) => P.names.find((n) => String(p).startsWith(`${n}/`)) ?? null;

const RULES = [
  { id: 'QPR-SECRET', severity: 'High', message: 'a provider credential — rotate it, it is in the history now', unless: /data:[a-z]+\/[a-z+.-]+;base64,/i, re: /(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|glpat-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|\bsk-(ant-|proj-|live_)?[A-Za-z0-9_-]{32,}\b)/ },
  { id: 'QPR-HARDCODED-USER', severity: 'Medium', message: 'a credential written into a spec — actors come from .env.<env> through the `as`/`pageAs` fixtures', re: /\b(password|passwd)\s*[:=]\s*['"][^'"\s]{6,}['"]/i, when: SPEC_TS },
  { id: 'QPR-ONLY', severity: 'High', message: 'test.only / describe.only — CI runs this one test and reports the suite green', re: /\b(test|it|describe)\.only\(/, when: SPEC_TS },
  { id: 'QPR-SKIP', severity: 'High', message: 'an unconditional skip/fixme — the case stops running and nothing says so; quarantine it (/qa-quarantine) or delete it with its case', re: /\b(test|it|describe)\.(skip|fixme)\(\s*(['"`][^'"`]*['"`]\s*,\s*(async\b|\()|\))/, when: SPEC_TS },
  { id: 'QPR-SLEEP', severity: 'Medium', message: 'a fixed sleep — poll for the state instead (expect.poll / pollUntil + TIMEOUTS.*)', re: /waitForTimeout\(|setTimeout\(|\bsleep\(/, when: SPEC_TS },
  { id: 'QPR-NETWORKIDLE', severity: 'Medium', message: 'networkidle never settles on apps with polling or websockets — wait for the element the step needs', re: /networkidle/, when: SPEC_TS },
  { id: 'QPR-FORCE', severity: 'Medium', message: '{ force: true } clicks through what a user cannot — the overlay is the bug', re: /force:\s*true/, when: SPEC_TS },
  { id: 'QPR-RAW-SELECTOR', severity: 'Low', message: 'a CSS/XPath selector — prefer getByRole/getByLabel/getByTestId from the element registry', re: /\b(page|locator|root)\.(locator|\$|\$\$)\(\s*['"`](\/\/|[.#][a-z]|[a-z]+\[|[a-z]+\s*>|:nth)/i, when: SPEC_TS },
  { id: 'QPR-SOFT-ONLY', severity: 'Low', message: 'expect.soft lets the test continue past a failure; fine for a list of checks, wrong for the step that gates the next one', re: /expect\.soft\(/, when: SPEC_TS },
  { id: 'QPR-TIMEOUT', severity: 'Medium', message: 'a per-test timeout raised in the spec — the slow path is a finding, or a named TIMEOUTS.* constant', re: /test\.setTimeout\(|test\.slow\(\)|timeout:\s*\d{5,}/, when: SPEC_TS },
  { id: 'QPR-WEAK-ASSERT', severity: 'Medium', message: 'an assertion that passes for almost any result (truthy/defined/length>0) — assert the value the case expects', re: /\.(toBeTruthy|toBeDefined|not\.toBeNull|not\.toBeUndefined)\(\)|toBeGreaterThan\(0\)/, when: SPEC_TS },
  { id: 'QPR-STATUS-ONLY', severity: 'Low', message: 'status code checked with toBeOK/2xx only — the case names a concrete status and a body claim', re: /\.toBeOK\(\)|status\(\)\)\.toBeLessThan\(300\)/, when: SPEC_TS },
  { id: 'QPR-ESLINT-OFF', severity: 'Medium', message: 'a test-shape lint rule switched off in a spec — the rule encodes a script rule from the generating-* skill', re: /eslint-disable.*playwright\//, when: SPEC_TS },
];

RULES.push({ id: 'QPR-CONFLICT-MARKER', severity: 'High', message: 'a merge-conflict marker was committed', re: CONFLICT_MARKER });

// CONTRACTS §7: the sections every case carries (performance swaps Steps for Workload + SLOs).
const CASE_SECTIONS = ['Objective', 'Technique', 'Isolation', 'Preconditions', 'Steps', 'Expected Result', 'Data'];
const CONVENTIONAL = /^(feat|fix|perf|refactor|test|docs|build|ci|chore|style|revert)(\([^()\s]+\))?!?: \S.{0,70}$/;
const BRANCH_OK = /^(feature|feat|fix|test|qa|chore|docs|hotfix|release)\/[a-z0-9][a-z0-9._/-]*$/;

/** The case format qa:lint enforces, on the changed cases only — so a review cites it per file. */
function caseFormat(d, cwd, add) {
  for (const f of d.files.filter((x) => x.status !== 'D' && CASE_RE.test(x.path))) {
    let text;
    try { text = git(['show', `${d.head}:${f.path}`], cwd); } catch { continue; }
    const id = tcOf(f.path);
    const h1 = (text.match(/^#\s+(\S+)\s+—\s+(.*)$/m) ?? []);
    if (h1[1] !== id) add('QPR-CASE-H1', 'Medium', f.path, `H1 must open with the file's Case ID \`${id}\` then " — " (CONTRACTS §7)`);
    else if (!/^\[[^\]]+ · [^\]]+\]\s+\S.*—.*→\s*\S/.test(h1[2] ?? '')) add('QPR-CASE-TITLE', 'Medium', f.path, 'title is not `[<Module> · <Platform>] <Screen|Operation> — <Actor> <action> → <expected>` (CONTRACTS §7)');
    const isPerf = P.PERF_CASES.test(f.path);
    const missing = CASE_SECTIONS.filter((s) => !(isPerf && s === 'Steps') && section(text, s) === null);
    if (missing.length) add('QPR-CASE-SECTIONS', 'Medium', f.path, `missing section(s): ${missing.map((s) => `## ${s}`).join(', ')} (CONTRACTS §7)`);
    if (!/^\*\*Tags:\*\*.*@p[0-3]\b/m.test(text)) add('QPR-CASE-PRIORITY', 'Medium', f.path, 'no @p0–@p3 priority tag — priority is derived from the REQ (CONTRACTS §7 Priority)');
  }
}

/** Commit messages and branch name: Conventional Commits, one rule per finding with the commits named. */
function formatChecks(d, opts, add) {
  const bad = d.commits.filter((c) => !c.merge && !CONVENTIONAL.test(c.subject));
  const wip = d.commits.filter((c) => /^(fixup!|squash!|amend!)|^wip\b/i.test(c.subject));
  if (bad.length) add('QPR-COMMIT-FORMAT', 'Low', `${bad.length} commit(s)`, `not \`<type>(<scope>): <subject>\` ≤72 chars: ${bad.slice(0, 3).map((c) => `${c.sha} "${c.subject.slice(0, 40)}"`).join(', ')}${bad.length > 3 ? ', …' : ''} — reword or squash before merge`);
  if (wip.length) add('QPR-COMMIT-WIP', 'Medium', `${wip.length} commit(s)`, `wip/fixup commits left in: ${wip.map((c) => c.sha).join(', ')} — squash before merge`);
  const branch = opts.branch;
  if (branch && !BRANCH_OK.test(branch)) add('QPR-BRANCH-NAME', 'Low', `branch ${branch}`, 'branch is not `<test|qa|feature|fix|…>/<slug>`');
}

const ASSERT_RE =/\bexpect(\.soft|\.poll)?\(|\bexpect[A-Z]\w*\(|\.expect[A-Z]\w*\(|\bpollUntil\(|\bassert[.(]|\bt\.(Error|Fatal)|\bShould\(\)|\bAssert\.\w+\(/;

/** Case ID of a case or script path, or null. */
const tcOf = (p) => (p.match(TC_IN_NAME) ?? [])[1] ?? null;

/** Every case and script path at a ref, by Case ID. */
function inventory(cwd, ref) {
  let files = [];
  try { files = git(['ls-tree', '-r', '--name-only', ref, '--', ...P.names.map((n) => `${n}/`)], cwd).split('\n').filter(Boolean); } catch { return { cases: new Map(), scripts: new Map() }; }
  const cases = new Map();
  const scripts = new Map();
  for (const f of files) {
    if (f.includes('/_template/')) continue;
    const id = tcOf(f);
    if (!id) continue;
    if (CASE_RE.test(f)) cases.set(id, (cases.get(id) ?? []).concat(f));
    else if (P.SCRIPTS.test(f)) scripts.set(id, (scripts.get(id) ?? []).concat(f));
  }
  return { cases, scripts };
}

/** Body hash of a file at a ref, the same way build-state.mjs --hash computes it. */
function hashAt(cwd, ref, path) {
  try {
    const text = git(['show', `${ref}:${path}`], cwd);
    return path.toLowerCase().endsWith('.md') ? parseDoc(text).bodyHash : sha256(text);
  } catch { return null; }
}

export function scan(opts) {
  P = patterns(opts.roots ?? rootNames(opts.cwd));
  const d = readDiff(opts);
  const add = (id, severity, where, message, text = '') => findings.push({ id, severity, where, message, text });
  const findings = scanAdded(d.addedLines, RULES);

  const live = d.files.filter((f) => f.status !== 'D');
  const qaFiles = d.files.filter((f) => P.QA.test(f.path));
  // The root the head names its files under — the one the messages below point at.
  const here = rootOf(qaFiles.find((f) => f.status !== 'D')?.path ?? qaFiles[0]?.path ?? '') ?? P.names[0];
  /** A path inside the QA root, whichever root name it was written with. */
  const inRoot = (p) => String(p).replace(P.QA, '');
  // Tooling (.claude/, CI files, docs) is not application code; a bundle install touches all of it.
  const appFiles = d.files.filter((f) => !P.QA.test(f.path) && !/^(\.claude\/|\.gitlab-ci\.yml$|\.github\/|\.gitignore$|CLAUDE\.md$)/.test(f.path) && !/\.md$/.test(f.path));

  // 1. Assertions lost: the change that turns a red test green without fixing anything.
  for (const f of d.files.filter((x) => SPEC_RE.test(x.path) || SPEC_RE.test(x.from ?? ''))) {
    const lost = (d.removedLines.get(f.path) ?? []).filter((l) => ASSERT_RE.test(l.text)).length;
    const gained = (d.addedLines.get(f.path) ?? []).filter((l) => ASSERT_RE.test(l.text)).length;
    if (f.status !== 'D' && lost > gained) add('QPR-ASSERT-LOST', 'High', f.path, `${lost - gained} assertion line(s) net removed — name, per removed assertion, what now proves that expected result`);
  }

  // 2. Case ↔ script mirror (CONTRACTS §2): a script with no case proves nothing anyone asked for.
  const head = inventory(opts.cwd, d.head);
  const baseInv = inventory(opts.cwd, d.mergeBase);
  for (const f of live.filter((x) => SPEC_TS(x.path) && x.status === 'A')) {
    const id = tcOf(f.path);
    if (!id) add('QPR-NO-ID', 'High', f.path, 'a new spec whose file name carries no Case ID (TC-<TYPE>-<MODULE>-NNN-…)');
    else if (!head.cases.has(id)) add('QPR-NO-CASE', 'High', f.path, `no case file for ${id} — every script mirrors a case (CONTRACTS §2); /qa-design first`);
  }
  for (const f of d.files.filter((x) => x.status === 'D' && CASE_RE.test(x.path))) {
    const id = tcOf(f.path);
    if (head.scripts.has(id)) add('QPR-ORPHAN-SCRIPT', 'High', head.scripts.get(id)[0], `case ${id} was deleted but its script still runs`);
  }
  for (const f of d.files.filter((x) => x.status === 'D' && SPEC_RE.test(x.path))) {
    const id = tcOf(f.path);
    if (id && head.cases.has(id) && !head.scripts.has(id)) add('QPR-SCRIPT-DELETED', 'Medium', f.path, `script for ${id} deleted while the case stays automated — say whether the case became manual (tag it) or is gone`);
  }

  // 3. Case ID minted on two branches (CONTRACTS §1): same id, two files, no merge conflict.
  for (const [id, paths] of head.cases) if (paths.length > 1) add('QPR-DUP-ID', 'High', paths.join(' · '), `${id} names ${paths.length} case files — node ${here}/scripts/shared/renumber-case.mjs <one of them>`);
  for (const f of live.filter((x) => CASE_RE.test(x.path) && x.status === 'A')) {
    const id = tcOf(f.path);
    const before = baseInv.cases.get(id);
    if (before && !before.includes(f.path)) add('QPR-ID-REUSED', 'High', f.path, `${id} already belonged to ${before[0]} before this branch — renumber the new case`);
  }

  // 4. Quarantine and suite tags have one writer each (CONTRACTS §6, §12).
  for (const [path, lines] of d.addedLines) {
    if (!P.CASES.test(path)) continue;
    for (const l of lines) {
      if (/@quarantined:/.test(l.text)) add('QPR-QUARANTINE-TAG', 'Medium', `${path}:${l.line}`, '@quarantined added by hand — only /qa-quarantine writes it, with a ledger row and evidence', l.text.trim());
      if (/@(smoke|regression)\b/.test(l.text) && !qaFiles.some((x) => P.REGRESSION.test(x.path))) add('QPR-SUITE-TAG', 'Low', `${path}:${l.line}`, '@smoke/@regression added with no regression manifest change — /qa-regression owns suite membership', l.text.trim());
    }
  }

  // 5. Cases edited after a review hashed them: that review is STALE now (CONTRACTS §18).
  // A review records `qa/…` or `.stlc/…` paths (§2); match them by their path inside the root.
  const changedCases = new Map(live.filter((x) => CASE_RE.test(x.path) && x.status === 'M').map((x) => [inRoot(x.path), x.path]));
  if (changedCases.size) {
    let reviews = [];
    try { reviews = git(['ls-tree', '-r', '--name-only', d.head, '--', ...P.names.map((n) => `${n}/reviews/`)], opts.cwd).split('\n').filter((f) => f.endsWith('-case-review.md')); } catch { /* none */ }
    const stale = new Map();
    for (const r of reviews) {
      const text = git(['show', `${d.head}:${r}`], opts.cwd);
      for (const m of text.matchAll(/-\s*path:\s*(\S+)\s*\n\s*sha256:\s*([0-9a-f]{64})/g)) {
        const now = changedCases.get(inRoot(m[1]));
        if (!now) continue;
        if (hashAt(opts.cwd, d.head, now) !== m[2]) stale.set(r, (stale.get(r) ?? []).concat(now));
      }
    }
    for (const [r, paths] of stale) add('QPR-REVIEW-STALE', 'Medium', r, `${paths.length} reviewed case(s) changed after this review hashed them — re-run /qa-review <slug> before /qa-script`);
  }

  // 6. Shipped kit edited in place: the next `afx update` overwrites it, and the fix never reaches anyone else.
  for (const f of d.files.filter((x) => P.KIT_RE.test(x.path) && x.status === 'M')) add('QPR-KIT-EDIT', 'Medium', f.path, 'shipped kit file edited in the project — send the fix upstream (/qa-feedback); `afx update` will overwrite it');

  // 7. Things that must never be committed.
  for (const f of live.filter((x) => P.ENV.test(x.path))) add('QPR-ENV', 'High', f.path, 'an environment or signed-in session file is in the diff — remove it and rotate what it holds');
  for (const f of live.filter((x) => P.HEAVY.test(x.path) || P.REPORT_DIRS.test(x.path))) add('QPR-HEAVY-EVIDENCE', 'Low', f.path, `heavy run artifact committed — only the text evidence is kept (${rootOf(f.path) ?? here}/.gitignore)`);
  for (const f of live.filter((x) => P.STATE.test(x.path))) add('QPR-STATE', 'Low', f.path, 'state.json is derived (CONTRACTS §17) and never committed');

  // 7b. Does not break what already runs: a shared file another spec imports, a removed fixture or
  // export, a case whose script no longer has its steps.
  const sharedChanged = d.files.filter((x) => P.SHARED_TS.test(x.path) && x.status !== 'A');
  for (const f of sharedChanged) {
    const lost = (d.removedLines.get(f.path) ?? []).filter((l) => /^\s*export\s+(async\s+)?(function|const|class|type|interface)\s+(\w+)/.test(l.text)).map((l) => l.text.match(/(function|const|class|type|interface)\s+(\w+)/)[2]);
    const kept = new Set((d.addedLines.get(f.path) ?? []).map((l) => (l.text.match(/^\s*export\s+(?:async\s+)?(?:function|const|class|type|interface)\s+(\w+)/) ?? [])[1]).filter(Boolean));
    const gone = lost.filter((n) => !kept.has(n));
    let users = [];
    try { users = gone.length ? git(['grep', '-l', '-E', `\\b(${gone.join('|')})\\b`, d.head, '--', ...P.names.map((n) => `${n}/scripts/`)], opts.cwd).split('\n').filter(Boolean).map((l) => l.replace(/^[^:]+:/, '')).filter((p) => p !== f.path) : []; } catch { /* no match */ }
    if (gone.length) add('QPR-EXPORT-REMOVED', users.length ? 'High' : 'Medium', f.path, `export(s) removed or renamed: ${gone.join(', ')}${users.length ? ` — still used by ${users.slice(0, 3).join(', ')}${users.length > 3 ? ', …' : ''}` : ''}; every spec that imports the shared layer breaks with it`);
    else if (f.status === 'M') add('QPR-SHARED-CHANGED', 'Low', f.path, 'the shared layer changed — run the whole suite (or --only-changed), not just this PR\'s specs');
  }
  // Either side of the pair changing can break the mirror: a case that gained a step with its script
  // untouched is the common one, and the scripts list is where to find its spec.
  const pairIds = new Set(live.filter((x) => SPEC_TS(x.path) || CASE_RE.test(x.path)).map((x) => tcOf(x.path)).filter(Boolean));
  for (const id of pairIds) {
    const casePath = head.cases.get(id)?.[0];
    const specPath = (head.scripts.get(id) ?? []).find(SPEC_TS);
    if (!casePath || !specPath) continue;
    const f = { path: specPath };
    let caseText;
    let specText;
    try { caseText = git(['show', `${d.head}:${casePath}`], opts.cwd); specText = git(['show', `${d.head}:${f.path}`], opts.cwd); } catch { continue; }
    const steps = (section(caseText, 'Steps') ?? '').split('\n').filter((l) => /^\s*\d+\.\s/.test(l)).length;
    const tsteps = (specText.match(/test\.step\(\s*[`'"]Step \d+/g) ?? []).length;
    if (steps && tsteps && steps !== tsteps) add('QPR-STEP-MISMATCH', 'Medium', f.path, `${tsteps} \`test.step('Step N…')\` for ${steps} numbered step(s) in ${casePath} — the script no longer mirrors its case (CONTRACTS §7)`);
  }
  if (d.conflicts?.length) add('QPR-CONFLICTS', 'High', `${d.conflicts.length} file(s)`, `does not merge cleanly into ${d.base}: ${d.conflicts.slice(0, 5).join(', ')} — rebase, then re-run the changed specs`);
  if (d.behind > 0) add('QPR-BEHIND', d.behind > 20 ? 'Medium' : 'Low', `${d.behind} commit(s)`, `${d.base} moved ${d.behind} commit(s) since the branch forked — the specs were green against an older app and kit; update and re-run before merging`);
  caseFormat(d, opts.cwd, add);
  formatChecks(d, opts, add);

  // 8. Shape of the PR.
  if (appFiles.length) add('QPR-APP-CODE', 'Medium', `${appFiles.length} file(s) outside ${here}/`, `the test PR also changes application code (${appFiles.slice(0, 3).map((f) => f.path).join(', ')}${appFiles.length > 3 ? ', …' : ''}) — a test that passes because the app was changed alongside it needs a development review (/sdlc-review-pr)`);
  const config = d.files.filter((x) => P.CONFIG.test(x.path));
  // A loosening is a line the branch ADDED that the base did not have; a fresh install adds the
  // shipped config whole, and its testIgnore of the staged tiers is the design, not a loosening.
  const LOOSE_RE = /retries:\s*[1-9]|failOnFlakyTests:\s*false|testIgnore|grepInvert|\.skip\(|forbidOnly:\s*false/;
  for (const f of config) {
    if (f.status === 'A') { add('QPR-CONFIG', 'Low', f.path, 'runner config added — compare it with the shipped one (afx installs it); a project edit belongs upstream'); continue; }
    const loose = (d.addedLines.get(f.path) ?? []).filter((l) => LOOSE_RE.test(l.text));
    if (loose.length) add('QPR-CONFIG-LOOSENED', 'High', `${f.path}:${loose[0].line}`, 'the runner was loosened (retries / failOnFlakyTests off / testIgnore / grepInvert / forbidOnly off) — that hides failures for every case, not one', loose[0].text.trim());
    else add('QPR-CONFIG', 'Low', f.path, 'runner or toolchain config changed — check it does not change what runs');
  }
  for (const f of live.filter((x) => /(__pycache__\/|\.pyc$|node_modules\/|\.DS_Store$)/.test(x.path))) add('QPR-JUNK', 'Low', f.path, 'a generated or cache file is committed — add it to .gitignore');
  const size = qaFiles.filter((f) => SPEC_RE.test(f.path) || CASE_RE.test(f.path)).reduce((n, f) => n + f.added + f.removed, 0);
  if (size > 1200) add('QPR-SIZE', 'Medium', `${size} lines of cases + scripts`, 'too large to review case-by-case — split per module or per type');

  const slugs = [...new Set(qaFiles.map((f) => (f.path.match(P.SLUG) ?? [])[1]).filter((s) => s && !['_template', 'release', 'metrics', 'retro', 'coverage'].includes(s)))].sort();
  const cases = qaFiles.filter((f) => CASE_RE.test(f.path));
  const specs = qaFiles.filter((f) => SPEC_RE.test(f.path));
  return {
    platform: platformOf(opts.cwd), base: d.base, head: d.head, mergeBase: d.mergeBase, behind: d.behind, conflicts: d.conflicts, pr: opts.pr ?? null,
    root: here, files: d.files.length, qaFiles: qaFiles.length, appFiles: appFiles.length,
    cases: { added: cases.filter((f) => f.status === 'A').length, changed: cases.filter((f) => f.status === 'M' || f.status === 'R').length, deleted: cases.filter((f) => f.status === 'D').length },
    scripts: { added: specs.filter((f) => f.status === 'A').length, changed: specs.filter((f) => f.status === 'M' || f.status === 'R').length, deleted: specs.filter((f) => f.status === 'D').length },
    slugs, commits: d.commits, authors: [...new Set(d.commits.map((c) => c.email))], findings: findings.sort(bySeverity),
  };
}

const isMain = process.argv[1] && /qa\/scripts\/shared\/pr-scan\.mjs$|^pr-scan\.mjs$|[\\/]shared[\\/]pr-scan\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) trackRun(import.meta.url);
if (isMain) {
  try {
    const { opts, json, failOn } = parseArgs(process.argv.slice(2), process.cwd());
    const r = scan(opts);
    const failing = atOrAbove(r.findings, failOn);
    process.exitCode = failing.length ? 1 : 0;
    if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(process.exitCode); }
    console.log(`PR scan (testing) — ${r.platform} · ${r.pr ? `#${r.pr} ` : ''}${r.head} vs ${r.base} (merge base ${r.mergeBase})`);
    console.log(`  ${r.files} files (${r.qaFiles} in ${r.root}/, ${r.appFiles} outside) · cases +${r.cases.added} ~${r.cases.changed} -${r.cases.deleted} · scripts +${r.scripts.added} ~${r.scripts.changed} -${r.scripts.deleted} · ${r.commits.length} commits · authors: ${r.authors.join(', ') || '—'}`);
    console.log(`  features: ${r.slugs.join(', ') || '—'}`);
    if (!r.findings.length) console.log('  no mechanical findings');
    for (const f of r.findings) console.log(`  ${f.severity.padEnd(6)} ${f.id.padEnd(20)} ${f.where} — ${f.message}${f.text ? `\n         ${f.text}` : ''}`);
    if (failOn) console.log(failing.length ? `FAIL: ${failing.length} finding(s) at ${failOn} or above` : `ok: nothing at ${failOn} or above`);
  } catch (e) {
    console.error(`pr-scan: ${e.message.split('\n')[0]}`);
    process.exit(2);
  }
}
