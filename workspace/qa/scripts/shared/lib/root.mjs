/**
 * root.mjs — where the QA root is (CONTRACTS §2), and how a recorded path maps onto it.
 *
 * The QA root holds every artifact this bundle writes. A new project keeps it in `.stlc/`, out of
 * the product's tree; a project installed before 2.1 keeps `qa/`, which goes on working unchanged.
 * Scripts that run from the PROJECT root (build-state, status, the hooks, pr-scan) resolve it here,
 * in one order:
 *
 *   1. an explicit `--root <path>` (relative to the working directory);
 *   2. `QA_ROOT` (env), relative to the project root — the override the scripts always read;
 *   3. PROJECT-PROFILE `QA root`, unless the line still carries the template's `(default)` marker —
 *      an untouched default is not a choice;
 *   4. whichever of `.stlc/` or `qa/` exists, `.stlc/` first;
 *   5. `.stlc`.
 *
 * Scripts that run from INSIDE the root (`npm run …`: lint-qa, run-plan, run-maestro, changed-modules,
 * verdict-upload) use `workspaceRoot()`: `QA_ROOT_DIR`, else the working directory when it is a QA
 * root, else the order above.
 *
 * Records (review `reviewed:`, readiness `inputs:`, traceability `Report` cells, HANDOFF rows) hold
 * project-relative paths. Both prefixes, `qa/` and `.stlc/`, name the root whatever it is called
 * today, so a record written before a migration still resolves after it. Hashes cover file bodies,
 * never a path, so none of this moves a hash.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export const DEFAULT_ROOT = '.stlc';
export const LEGACY_ROOT = 'qa';
/** The two names a root may have, in the order an unconfigured project looks for them. */
export const ROOT_NAMES = [DEFAULT_ROOT, LEGACY_ROOT];

const PREFIX = /^(?:\.\/)?(?:\.stlc|qa)\//;
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

/** The profile's QA root, or null when the line is missing, a placeholder, or still `(default)`. */
export function profileRoot(text) {
  const line = /^- \*\*QA root:\*\*(.*)$/im.exec(String(text ?? '').replace(/\r\n?/g, '\n'))?.[1];
  if (line == null) return null;
  const head = line.split(/\s[—–]\s/)[0];
  if (/\(default\)/i.test(head)) return null;
  const value = /`([^`]+)`/.exec(head)?.[1]?.trim();
  if (!value || value.startsWith('<')) return null;
  return value.replace(/\\/g, '/').replace(/^\.\/(?=.)/, '').replace(/\/+$/, '') || null;
}

/** PROJECT-PROFILE.md as an installed project (`.claude/`) or the bundle repository (beside it) keeps it. */
export function profileText(project) {
  for (const p of [join(project, '.claude', 'PROJECT-PROFILE.md'), join(project, 'PROJECT-PROFILE.md')]) {
    if (!existsSync(p)) continue;
    try { return readFileSync(p, 'utf8'); } catch { /* unreadable: fall through */ }
  }
  return '';
}

/**
 * The QA root for a project, as `{ root, name, source }`: `root` absolute, `name` as configured
 * (`.stlc`, `qa`, or the given path), `source` one of explicit · env · profile · found · default.
 */
export function findRoot({ explicit = null, cwd = process.cwd(), env = process.env } = {}) {
  if (explicit) return { root: resolve(cwd, explicit), name: explicit, source: 'explicit' };
  if (env.QA_ROOT) return { root: resolve(cwd, env.QA_ROOT), name: env.QA_ROOT, source: 'env' };
  const configured = profileRoot(profileText(cwd));
  if (configured) return { root: resolve(cwd, configured), name: configured, source: 'profile' };
  const found = ROOT_NAMES.find((n) => isDir(join(cwd, n)));
  if (found) return { root: resolve(cwd, found), name: found, source: 'found' };
  return { root: resolve(cwd, DEFAULT_ROOT), name: DEFAULT_ROOT, source: 'default' };
}

/** The absolute root for a script's argv: `--root <path>` if given, else findRoot. */
export function rootFromArgv(argv, cwd = process.cwd(), env = process.env) {
  const i = argv.indexOf('--root');
  const explicit = i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  return findRoot({ explicit, cwd, env }).root;
}

/** True when `dir` is itself a QA root: the shipped kit or the artifact folders are in it. */
export function isQaRoot(dir) {
  return existsSync(join(dir, 'scripts', 'shared', 'lint-qa.mjs')) || ['cases', 'plans', 'run-plans'].some((d) => isDir(join(dir, d)));
}

/**
 * The root for a script that runs from inside it (`npm run …`): `QA_ROOT_DIR`, else the working
 * directory when it is a QA root, else the project order above, else the working directory.
 */
export function workspaceRoot({ cwd = process.cwd(), env = process.env } = {}) {
  if (env.QA_ROOT_DIR) return resolve(cwd, env.QA_ROOT_DIR);
  if (isQaRoot(cwd)) return resolve(cwd);
  const r = findRoot({ cwd, env }).root;
  return isDir(r) ? r : resolve(cwd);
}

/** The project-relative prefix new paths under this root are written with: its folder name. */
export function rootPrefix(root) {
  return basename(resolve(String(root ?? '.')));
}

/** True when a project-relative path starts with either root name. */
export function hasRootPrefix(path) {
  return PREFIX.test(String(path ?? '').replace(/\\/g, '/'));
}

/** The path inside the root: `qa/x` and `.stlc/x` both give `x`; any other path is returned as is. */
export function stripRoot(path) {
  return String(path ?? '').replace(/\\/g, '/').replace(PREFIX, '');
}

/** `<prefix>/<rel>` — how a path under `root` is written into a record or state.json. */
export function repoPath(root, rel) {
  return `${rootPrefix(root)}/${String(rel).replace(/\\/g, '/').replace(/^\/+/, '')}`;
}

/** A recorded path with its root prefix rewritten to this root's; other paths unchanged. */
export function normalizeRef(root, path) {
  return hasRootPrefix(path) ? repoPath(root, stripRoot(path)) : String(path ?? '');
}

/**
 * The file a recorded path names. A root-prefixed path (`qa/…`, `.stlc/…`, or the root's own name)
 * is under the root, whichever prefix it uses; anything else is project-relative
 * (`.claude/PROJECT-PROFILE.md`).
 */
export function locateRef(root, file) {
  const p = String(file ?? '').replace(/\\/g, '/');
  const own = `${rootPrefix(root)}/`;
  if (hasRootPrefix(p)) return join(root, stripRoot(p));
  if (p.startsWith(own)) return join(root, p.slice(own.length));
  return resolve(root, '..', p);
}
