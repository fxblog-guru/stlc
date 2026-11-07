#!/usr/bin/env node
/**
 * migrate-root.mjs — move a project's QA root between `qa/` and `.stlc/` (CONTRACTS §2).
 *
 *   node <qa-root>/scripts/shared/migrate-root.mjs --to .stlc [--project .] [--write] [--json]
 *   node <qa-root>/scripts/shared/migrate-root.mjs --to qa    [--project .] [--write] [--json]
 *
 * A dry run by default: it prints every step and changes nothing. With --write it
 *
 *   1. moves the folder: `git mv <from> <to>` in a git work tree (untracked and ignored files —
 *      node_modules, .env.<env>, .auth/, state.json — follow), a plain rename otherwise;
 *   2. sets PROJECT-PROFILE `QA root` to the new name (replacing the line, or adding one);
 *   3. rewrites the root prefix in recorded paths, only where no hash covers them:
 *      - the FRONT MATTER of every `.md` (a markdown hash is its body, §18), e.g. a review's
 *        `reviewed:` and a readiness report's `inputs:` paths — each file is re-hashed first;
 *      - the BODY of an `.md` that no review or readiness report hashes (plans' `Report` cells,
 *        HANDOFF.md, review prose). A hashed body (a reviewed case's `**Plan:**` line) and run
 *        evidence under `runs/` are kept and reported: both prefixes still resolve (§2);
 *   4. rewires the files that name the root: package.json, .gitignore, .gitlab-ci.yml,
 *      .github/workflows/*.yml, .claude/settings.json, and the root's own ci/ templates and
 *      playwright.config.ts;
 *   5. rebuilds state.json under the new root.
 *
 * Exit 0 on success or a clean dry run, 1 when the move cannot be made, 2 on a usage error.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDoc } from './lib/doc.mjs';
import { DEFAULT_ROOT, LEGACY_ROOT, ROOT_NAMES, profileRoot, stripRoot } from './lib/root.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const toPosix = (p) => p.split(sep).join('/');
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `<from>/` at the start of a path token — not `x-qa/`, `/qa-script`, `run-plans/qa/` or `@qa/` —
 * or anchored at the start of a line (`/qa/state.json` in a .gitignore), or after a variable
 * (`$CI_PROJECT_DIR/qa/.npm`).
 */
export const prefixPattern = (from) => new RegExp(`(?<![\\w./@-])${escape(from)}/|(?<=^/|\\$\\{?[A-Z_]+\\}?/)${escape(from)}/`, 'gm');

/** The root named without a slash: `cd qa`, `working-directory: qa`, `cd qa && …`. */
const bareRoot = (from) => new RegExp(`((?:^|[\\s"'])(?:cd|working-directory:)\\s+['"]?)${escape(from)}(?=['"]?(?:\\s|$|;|&|"))`, 'gm');

/** A wiring file's text with the root moved. */
export function rewireText(text, from, to) {
  return text.replace(prefixPattern(from), `${to}/`).replace(bareRoot(from), `$1${to}`);
}

/** Files outside the root that name it in a command, a path or a glob — plain text, never hashed. */
export const WIRING = ['package.json', '.gitignore', '.gitlab-ci.yml', join('.claude', 'settings.json'), join('.claude', 'settings.local.json')];
const WIRING_DIRS = [join('.github', 'workflows')];
/** Files inside the root that name it (bundle templates and config, never an artifact). */
const ROOT_WIRING = [join('ci', '.gitlab-ci.qa.yml'), join('ci', 'github-qa.yml'), join('ci', 'README.md'), 'playwright.config.ts'];

/** Every file under `dir`, recursively, skipping dependency folders. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** Split a markdown text into its front matter block (with fences) and body, as lib/doc.mjs does. */
function splitDoc(src) {
  if (!src.startsWith('---\n')) return { head: '', body: src };
  const end = src.indexOf('\n---', 4);
  if (end === -1) return { head: '', body: src };
  const close = src.indexOf('\n', end + 1);
  const cut = close === -1 ? src.length : close + 1;
  return { head: src.slice(0, cut), body: src.slice(cut) };
}

/**
 * `text` with the root prefix moved from `from` to `to`: in the front matter always (`path:`
 * values and any other path token), in the body only when `body` is true. Returns the new text and
 * how many prefixes moved in each part. Line endings are kept.
 */
export function rewriteDoc(text, from, to, { body = false } = {}) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const src = text.replace(/\r\n/g, '\n');
  const { head, body: rest } = splitDoc(src);
  const pat = prefixPattern(from);
  let front = 0;
  let inBody = 0;
  const nextHead = head.replace(pat, () => { front += 1; return `${to}/`; });
  const nextBody = body ? rest.replace(pat, () => { inBody += 1; return `${to}/`; }) : rest;
  const out = nextHead + nextBody;
  return { text: nl === '\n' ? out : out.replace(/\n/g, '\r\n'), front, body: inBody, bodyMentions: body ? 0 : (rest.match(pat) ?? []).length };
}

/** The profile text with `QA root` set to `to`: the existing entry (and its continuation lines) replaced, or one added under ## Project. */
export function setProfileRoot(text, to) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const entry = `- **QA root:** \`${to}\` — every testing artifact lives under this folder (CONTRACTS §2); set by migrate-root.mjs.`;
  const at = lines.findIndex((l) => /^- \*\*QA root:\*\*/i.test(l));
  if (at !== -1) {
    let end = at + 1;
    while (end < lines.length && /^\s{2,}\S/.test(lines[end])) end += 1;
    lines.splice(at, end - at, entry);
  } else {
    const project = lines.findIndex((l) => /^## Project\s*$/.test(l));
    if (project === -1) lines.push('', '## Project', '', entry);
    else {
      let i = project + 1;
      while (i < lines.length && lines[i].trim() === '') i += 1;
      while (i < lines.length && /^(- |\s{2,}\S)/.test(lines[i])) i += 1;
      lines.splice(i, 0, entry);
    }
  }
  return lines.join(nl);
}

function profilePath(project) {
  return [join(project, '.claude', 'PROJECT-PROFILE.md'), join(project, 'PROJECT-PROFILE.md')].find((p) => existsSync(p)) ?? null;
}

function inGit(project) {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: project, encoding: 'utf8' });
  return r.status === 0 && resolve(r.stdout.trim()) === resolve(project);
}

/**
 * The files whose bodies a verdict hashed (CONTRACTS §18): every `- path:` under a case review's
 * `reviewed:` and a readiness report's `inputs:`, as paths inside the root.
 */
export function hashedFiles(rootAbs) {
  const out = new Set();
  const files = [
    ...(existsSync(join(rootAbs, 'reviews')) ? walk(join(rootAbs, 'reviews')).filter((f) => f.endsWith('-case-review.md')) : []),
    ...(existsSync(join(rootAbs, 'runs', 'env-checks')) ? walk(join(rootAbs, 'runs', 'env-checks')).filter((f) => f.endsWith('readiness.md')) : []),
  ];
  for (const f of files) {
    const { head } = splitDoc(readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
    for (const m of head.matchAll(/^\s*-\s*path:\s*['"]?(\S+?)['"]?\s*$/gm)) out.add(stripRoot(m[1]));
  }
  return out;
}

/**
 * The migration plan for `project`, moving to `to`. Reads the disk only.
 * `{ from, to, problems[], docs: [{ file, front, body }], kept: [{ file, count, why }],
 *    wiring: [{ file, lines: [{ was, now }] }], profile, git }`
 */
export function plan(project, to) {
  const problems = [];
  const from = to === DEFAULT_ROOT ? LEGACY_ROOT : DEFAULT_ROOT;
  const fromAbs = join(project, from);
  const toAbs = join(project, to);
  const out = { project, from, to, problems, docs: [], kept: [], wiring: [], profile: null, git: false };
  if (!ROOT_NAMES.includes(to)) { problems.push(`--to is ${ROOT_NAMES.join(' or ')}, not \`${to}\``); return out; }
  if (existsSync(toAbs)) problems.push(`${to}/ already exists — nothing to move into`);
  if (!existsSync(fromAbs)) problems.push(`${from}/ does not exist — nothing to move`);
  if (problems.length) return out;
  out.git = inGit(project);

  const hashed = hashedFiles(fromAbs);
  const pat = prefixPattern(from);
  for (const abs of walk(fromAbs)) {
    const rel = toPosix(relative(fromAbs, abs));
    // The shipped kit, templates and CI are bundle code (ci/ is rewired below); HANDOFF.md under
    // scripts/<type>/ is a record and moves like one.
    if (/^(scripts\/shared|_templates|ci)\//.test(rel) || rel === 'state.json' || !abs.endsWith('.md')) continue;
    const text = readFileSync(abs, 'utf8');
    const why = hashed.has(rel) ? 'its body is hashed by a review or readiness report' : rel.startsWith('runs/') ? 'run evidence is kept as it was recorded' : null;
    const r = rewriteDoc(text, from, to, { body: !why });
    if (parseDoc(r.text).bodyHash !== parseDoc(text).bodyHash && why) problems.push(`${from}/${rel}: rewriting it would move its hash — left alone`);
    if (r.front || r.body) out.docs.push({ file: rel, front: r.front, body: r.body });
    if (r.bodyMentions) out.kept.push({ file: `${from}/${rel}`, count: r.bodyMentions, why });
  }
  for (const abs of walk(fromAbs).filter((f) => /\.(ya?ml|json|txt|html)$/.test(f))) {
    const rel = toPosix(relative(fromAbs, abs));
    if (/^(scripts\/shared|ci)\//.test(rel) || rel === 'state.json' || rel === 'package.json') continue;
    const n = (readFileSync(abs, 'utf8').match(pat) ?? []).length;
    if (n) out.kept.push({ file: `${from}/${rel}`, count: n, why: 'hashed whole, or evidence' });
  }

  const listDir = (d) => (existsSync(join(project, d)) ? readdirSync(join(project, d)).filter((f) => /\.ya?ml$/.test(f)).map((f) => join(d, f)) : []);
  const files = [...WIRING, ...WIRING_DIRS.flatMap(listDir), ...ROOT_WIRING.map((f) => join(from, f))];
  for (const f of files) {
    const abs = join(project, f);
    if (!existsSync(abs)) continue;
    const moved = readFileSync(abs, 'utf8').split(/\r?\n/).map((l) => ({ was: l, now: rewireText(l, from, to) })).filter((m) => m.now !== m.was).map((m) => ({ was: m.was.trim(), now: m.now.trim() }));
    if (moved.length) out.wiring.push({ file: toPosix(f), lines: moved });
  }
  const pp = profilePath(project);
  if (pp) out.profile = { file: toPosix(relative(project, pp)), was: profileRoot(readFileSync(pp, 'utf8')) };
  return out;
}

/** Move `src` into `dst`, entry by entry where `dst` already has the folder (after a git mv). */
function mergeMove(src, dst) {
  if (!existsSync(dst)) { mkdirSync(dirname(dst), { recursive: true }); renameSync(src, dst); return; }
  if (!statSync(src).isDirectory()) return; // git mv already put the tracked copy there
  for (const name of readdirSync(src)) mergeMove(join(src, name), join(dst, name));
  rmSync(src, { recursive: true, force: true });
}

/** Carry the plan out. Returns the build-state exit status. */
export function apply(p) {
  const { project, from, to } = p;
  const fromAbs = join(project, from);
  const toAbs = join(project, to);
  // 1. The folder. git mv records renames, so the history follows each file.
  const tracked = p.git && execFileSync('git', ['ls-files', '--', from], { cwd: project, encoding: 'utf8' }).trim();
  if (tracked) execFileSync('git', ['mv', from, to], { cwd: project, stdio: 'pipe' });
  if (existsSync(fromAbs)) mergeMove(fromAbs, toAbs);
  // 2. The profile.
  if (p.profile) {
    const abs = join(project, p.profile.file);
    writeFileSync(abs, setProfileRoot(readFileSync(abs, 'utf8'), to));
  }
  // 3. Recorded paths — the hash re-checked at write time for every file whose body is kept.
  const hashed = hashedFiles(toAbs);
  for (const { file } of p.docs) {
    const abs = join(toAbs, file);
    const text = readFileSync(abs, 'utf8');
    const keep = hashed.has(file) || file.startsWith('runs/');
    const r = rewriteDoc(text, from, to, { body: !keep });
    if (!keep || parseDoc(r.text).bodyHash === parseDoc(text).bodyHash) writeFileSync(abs, r.text);
  }
  // 4. Wiring. A file inside the root has moved with it.
  for (const { file } of p.wiring) {
    const abs = join(project, file.startsWith(`${from}/`) ? `${to}/${file.slice(from.length + 1)}` : file);
    writeFileSync(abs, rewireText(readFileSync(abs, 'utf8'), from, to));
  }
  // 5. The derived index, by the project's own builder when it has one.
  const builder = [join(toAbs, 'scripts', 'shared', 'build-state.mjs'), join(here, 'build-state.mjs')].find((b) => existsSync(b));
  const run = spawnSync(process.execPath, [builder, '--root', toAbs, '--quiet'], { cwd: project, encoding: 'utf8', env: { ...process.env, QA_ROOT: '' } });
  if (run.status !== 0) console.error(`migrate-root: build-state failed: ${(run.stderr || run.stdout).trim()}`);
  return run.status ?? 1;
}

function report(p, write) {
  const L = [];
  L.push(`migrate-root: ${p.from}/ → ${p.to}/ in ${p.project}${write ? '' : '   (dry run — add --write)'}`);
  L.push(`  move      ${p.git ? 'git mv' : 'rename'} ${p.from} ${p.to}`);
  if (p.profile) L.push(`  profile   ${p.profile.file}: QA root \`${p.profile.was ?? '(default)'}\` → \`${p.to}\``);
  else L.push('  profile   no PROJECT-PROFILE.md found — the scripts will find the root by its folder');
  const front = p.docs.reduce((n, d) => n + d.front, 0);
  const body = p.docs.reduce((n, d) => n + d.body, 0);
  L.push(`  records   ${front} path(s) in front matter, ${body} in unhashed bodies, across ${p.docs.length} file(s); no hash moves`);
  for (const d of p.docs) L.push(`              ${p.to}/${d.file} (${d.front} + ${d.body})`);
  for (const w of p.wiring) for (const l of w.lines) L.push(`  wiring    ${w.file}: ${l.was}  →  ${l.now}`);
  if (p.kept.length) {
    const n = p.kept.reduce((s, k) => s + k.count, 0);
    L.push(`  kept      ${n} \`${p.from}/\` mention(s) in ${p.kept.length} file(s) — they still resolve (§2):`);
    for (const k of p.kept) L.push(`              ${k.file} (${k.count}) — ${k.why}`);
  }
  L.push('  rebuild   state.json');
  return L.join('\n');
}

function main(argv) {
  const at = (f) => (argv.indexOf(f) !== -1 ? argv[argv.indexOf(f) + 1] : undefined);
  const to = String(at('--to') ?? '').replace(/\/+$/, '').replace(/^\.\/(?=.)/, '');
  if (!to) {
    console.error('usage: migrate-root.mjs --to .stlc|qa [--project <dir>] [--write] [--json]');
    process.exit(2);
  }
  const project = resolve(at('--project') ?? process.cwd());
  const write = argv.includes('--write');
  const p = plan(project, to);
  if (argv.includes('--json')) console.log(JSON.stringify(p, null, 2));
  if (p.problems.length) {
    for (const pr of p.problems) console.error(`migrate-root: ${pr}`);
    process.exit(1);
  }
  if (!argv.includes('--json')) console.log(report(p, write));
  if (!write) return;
  const status = apply(p);
  console.log(status === 0 ? `migrate-root: done — the QA root is ${p.to}/. Commit the move as one change.` : 'migrate-root: moved, but state.json did not rebuild — run build-state.mjs');
  process.exit(status === 0 ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
