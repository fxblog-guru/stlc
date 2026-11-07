/**
 * pr-diff.mjs — the git half of a pull-request review, shared by `<qa-root>/scripts/shared/pr-scan.mjs`.
 *
 * A PR review is a diff review: it judges what the branch changes against the branch it will merge
 * into, from their merge base — never against the base's current tip, which would blame the PR for
 * everything merged to the target since it branched.
 *
 * Works the same on GitLab and GitHub without either CLI: `--pr <n>` fetches the platform's own
 * read-only ref (`merge-requests/<n>/head` or `pull/<n>/head`) into `refs/pr-review/<n>`.
 */

import { execFileSync } from 'node:child_process';

export function git(args, cwd = process.cwd()) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).replace(/\r\n/g, '\n');
}

/** `gitlab`, `github` or `unknown`, from the origin URL. */
export function platformOf(cwd) {
  let url = '';
  try { url = git(['remote', 'get-url', 'origin'], cwd).trim(); } catch { return 'unknown'; }
  if (/github\.com[:/]/i.test(url)) return 'github';
  if (/gitlab/i.test(url)) return 'gitlab';
  return 'unknown';
}

/** Fetch PR/MR <n> into refs/pr-review/<n> and return that ref. */
export function fetchPr(n, cwd) {
  const platform = platformOf(cwd);
  const src = platform === 'github' ? `pull/${n}/head` : `merge-requests/${n}/head`;
  const dst = `refs/pr-review/${n}`;
  git(['fetch', '--quiet', 'origin', `+${src}:${dst}`], cwd);
  return dst;
}

/** The base ref: explicit, else origin's default branch, else main. */
export function defaultBase(cwd) {
  try { return git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], cwd).trim().replace(/^refs\/remotes\//, ''); } catch { /* no origin/HEAD */ }
  for (const b of ['origin/main', 'origin/master', 'main', 'master']) {
    try { git(['rev-parse', '--verify', '--quiet', b], cwd); return b; } catch { /* try the next */ }
  }
  throw new Error('no base branch found — pass --base <ref>');
}

/**
 * Everything a reviewer needs from git, in one object:
 *   { base, head, mergeBase, files: [{status, path, from?, added, removed, binary}], addedLines / removedLines: Map<path, [{line, text}]>, commits: [{sha, author, email, subject}] }
 */
export function readDiff({ base, head = 'HEAD', cwd = process.cwd() }) {
  const mergeBase = git(['merge-base', base, head], cwd).trim();
  const range = `${mergeBase}..${head}`;
  const files = [];
  for (const line of git(['diff', '--name-status', '-M', range], cwd).split('\n').filter(Boolean)) {
    const [st, a, b] = line.split('\t');
    files.push(st.startsWith('R') ? { status: 'R', from: a, path: b } : { status: st[0], path: a });
  }
  const stat = new Map();
  for (const line of git(['diff', '--numstat', '-M', range], cwd).split('\n').filter(Boolean)) {
    const [add, del, ...rest] = line.split('\t');
    const p = rest.join('\t').replace(/^.*\{(.*) => (.*)\}(.*)$/, (_, _x, to, tail) => to + tail).replace(/^.* => /, '');
    stat.set(p, { added: add === '-' ? 0 : Number(add), removed: del === '-' ? 0 : Number(del), binary: add === '-' });
  }
  for (const f of files) Object.assign(f, stat.get(f.path) ?? { added: 0, removed: 0, binary: false });

  // Removed lines are keyed by the file's NEW path (its old path when deleted), so a rule can ask
  // "what did this file lose" — a deleted assertion is the change a test review exists to catch.
  const addedLines = new Map();
  const removedLines = new Map();
  let cur = null;
  let old = null;
  let ln = 0;
  let oln = 0;
  for (const line of git(['diff', '-U0', '-M', '--no-color', range], cwd).split('\n')) {
    if (line.startsWith('--- ')) { old = line === '--- /dev/null' ? null : line.slice(6); continue; }
    if (line.startsWith('+++ ')) {
      cur = line === '+++ /dev/null' ? null : line.slice(6);
      if (cur) addedLines.set(cur, []);
      if (cur ?? old) removedLines.set(cur ?? old, []);
      continue;
    }
    const h = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) { oln = Number(h[1]); ln = Number(h[2]); continue; }
    if (line.startsWith('-') && (cur ?? old)) { removedLines.get(cur ?? old).push({ line: oln, text: line.slice(1) }); oln += 1; continue; }
    if (!cur) continue;
    if (line.startsWith('+')) { addedLines.get(cur).push({ line: ln, text: line.slice(1) }); ln += 1; }
  }

  // Full messages, NUL-separated: the format rules read the body and trailers, not just the subject.
  const commits = git(['log', '--format=%H%x1f%an%x1f%ae%x1f%P%x1f%B%x00', range], cwd).split('\0').map((r) => r.replace(/^\n/, '')).filter((r) => r.trim()).map((r) => {
    const [sha, author, email, parents, message] = r.split('\x1f');
    return { sha: sha.slice(0, 10), author, email, merge: parents.trim().split(' ').length > 1, subject: (message ?? '').split('\n')[0], message: (message ?? '').trim() };
  });
  return { base, head, mergeBase: mergeBase.slice(0, 10), files, addedLines, removedLines, commits, ...mergeability(base, head, cwd) };
}

/**
 * Will it merge, and is it current? `behind` = commits on the base since the branch forked (the PR
 * was tested against an older base); `conflicts` = paths a real merge would conflict on, from
 * `git merge-tree --write-tree` (git ≥ 2.38) — no checkout, no index touched. null when git is older.
 */
export function mergeability(base, head, cwd) {
  let behind = 0;
  try { behind = Number(git(['rev-list', '--count', `${head}..${base}`], cwd).trim()) || 0; } catch { /* unknown */ }
  let conflicts = null;
  try {
    git(['merge-tree', '--write-tree', '--name-only', '--no-messages', base, head], cwd);
    conflicts = [];
  } catch (e) {
    const out = String(e.stdout ?? '').replace(/\r\n/g, '\n');
    if (e.status === 1 && out) conflicts = [...new Set(out.split('\n').slice(1).map((l) => l.trim()).filter(Boolean))];
  }
  return { behind, conflicts };
}

/** Lines left from a bad conflict resolution. Only `<<<<<<< ` and `>>>>>>> ` with text after: `=======` alone is a valid markdown underline. */
export const CONFLICT_MARKER = /^(<{7} \S|>{7} \S)/;

/** Scan added lines with [{id, re, severity, message, when?(path), unless?}]; returns findings with path:line. */
export function scanAdded(addedLines, rules) {
  const out = [];
  for (const [path, lines] of addedLines) {
    for (const rule of rules) {
      if (rule.when && !rule.when(path)) continue;
      for (const { line, text } of lines) if (rule.re.test(text) && !rule.unless?.test(text)) out.push({ id: rule.id, severity: rule.severity, where: `${path}:${line}`, message: rule.message, text: text.trim().slice(0, 140) });
    }
  }
  return out;
}

/**
 * Common CLI handling: --base, --head, --pr, --branch, --json, --fail-on <severity>. Returns { opts, json, failOn }.
 * In CI the base is the platform's own: CI_MERGE_REQUEST_DIFF_BASE_SHA (GitLab) or GITHUB_BASE_REF (GitHub).
 */
export function parseArgs(argv, cwd) {
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const pr = val('--pr');
  const head = pr ? fetchPr(pr, cwd) : (val('--head') ?? 'HEAD');
  const ciBase = process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined);
  const base = val('--base') ?? ciBase ?? defaultBase(cwd);
  const branch = val('--branch') ?? process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME ?? process.env.GITHUB_HEAD_REF ?? undefined;
  return { opts: { base, head, cwd, pr, branch: branch || undefined }, json: argv.includes('--json'), failOn: val('--fail-on') ?? null };
}

const SEC_ORDER = { BLOCKER: 0, High: 0, MAJOR: 1, Medium: 1, MINOR: 2, Low: 2, INFO: 3 };
export const bySeverity = (a, b) => (SEC_ORDER[a.severity] ?? 9) - (SEC_ORDER[b.severity] ?? 9) || a.where.localeCompare(b.where);

/** Findings at or above `failOn` (a severity name, case-insensitive); [] when failOn is null. */
export function atOrAbove(findings, failOn) {
  if (!failOn) return [];
  const key = Object.keys(SEC_ORDER).find((k) => k.toLowerCase() === failOn.toLowerCase());
  if (!key) throw new Error(`--fail-on ${failOn}: not a severity (${Object.keys(SEC_ORDER).join(', ')})`);
  return findings.filter((f) => (SEC_ORDER[f.severity] ?? 9) <= SEC_ORDER[key]);
}
