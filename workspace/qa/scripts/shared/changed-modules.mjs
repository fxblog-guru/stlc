#!/usr/bin/env node
/**
 * changed-modules.mjs — change-based selection: which modules (and so which cases) a code change
 * touches, read from the impact map's `Endpoint / Screen` citations (CONTRACTS §10).
 *
 *   node scripts/shared/changed-modules.mjs --base <ref> --head <sha> [--repo <app-repo>] [--layer <name>] [--json]
 *   git diff --name-only a..b | node scripts/shared/changed-modules.mjs --stdin
 *
 * Run from the QA root (`.stlc/` or `qa/`; `--qa <dir>` names it). `--repo` is the application repository the diff is taken in (default:
 * the current directory); `--layer` keeps only citations of that Code KB layer (`backend:` …) when
 * one impact map spans several repos. Mapping, strongest first:
 *   file   the changed path IS a cited path (`<layer>:<path>#<symbol>` → <path>)
 *   dir    the changed path sits in the folder of a cited path
 *   spec   the changed path is a QA script or case (`<qa-root>/scripts/<type>/…/TC-…`) → that case directly
 * Everything else is printed as UNMAPPED — never guessed onto a module. A path the map cannot place
 * is a gap for /qa-impact (maintaining-impact-map), not a reason to run nothing.
 *
 * Output: the modules, the Playwright grep (`--grep "@orders|@billing"`), and the case ids (impact-map
 * TC cells ∪ case files in those module folders, deprecated cases left out). /qa-impact lists them;
 * /qa-run passes the grep to the Playwright runners. Exit 0 always on a successful read; 2 on a git error.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, posix } from 'node:path';
import { workspaceRoot } from './lib/root.mjs';
import { trackRun } from './lib/runlog.mjs';
import { CASE_PREFIX_RE } from './lib/types.mjs';

const IM_COLUMNS = '| BR | Module | Endpoint / Screen | TC | Last verified | Notes |';
const CASE_RE = CASE_PREFIX_RE;

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name).replace(/\\/g, '/');
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Impact-map rows → [{ module, paths: [{ layer, path }], tcs: [] }]. */
export function readImpactMap(text) {
  const t = text.replace(/\r\n/g, '\n');
  if (!t.includes(IM_COLUMNS)) return [];
  const rows = [];
  for (const line of t.slice(t.indexOf(IM_COLUMNS)).split('\n').slice(2)) {
    if (!line.trim().startsWith('|')) break;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 6) continue;
    const [, module, where, tc] = cells;
    const paths = [...where.matchAll(/([a-z0-9][a-z0-9_-]*):([^\s#@,]+)/gi)]
      .filter((m) => m[2].includes('/') || m[2].includes('.'))
      .map((m) => ({ layer: m[1], path: m[2].replace(/^\.\//, '') }));
    const tcs = tc && tc !== '—' ? tc.split(',').map((s) => s.trim()).filter(Boolean) : [];
    rows.push({ module, paths, tcs });
  }
  return rows;
}

/** Map changed paths to modules. Pure: tests call it without git. */
export function selectChanged({ changed, rows, layer, cases = [] }) {
  const modules = new Map(); // module → { via: Set, files: Set }
  const direct = new Set();
  const unmapped = [];
  const hit = (mod, via, f) => {
    const m = modules.get(mod) ?? { via: new Set(), files: new Set() };
    m.via.add(via); m.files.add(f); modules.set(mod, m);
  };
  for (const raw of changed) {
    const f = raw.trim().replace(/\\/g, '/');
    if (!f) continue;
    const spec = basename(f).match(CASE_RE);
    if (spec && /(^|\/)(scripts|cases)\//.test(f)) { direct.add(spec[1]); continue; }
    let found = false;
    for (const r of rows) {
      if (r.module === '?' || !r.module) continue;
      for (const p of r.paths) {
        if (layer && p.layer !== layer) continue;
        if (f === p.path || f.endsWith(`/${p.path}`)) { hit(r.module, 'file', f); found = true; }
        else if (posix.dirname(p.path) !== '.' && (f.startsWith(`${posix.dirname(p.path)}/`) || f.includes(`/${posix.dirname(p.path)}/`))) { hit(r.module, 'dir', f); found = true; }
      }
    }
    if (!found) unmapped.push(f);
  }
  const ids = new Set(direct);
  for (const r of rows) if (modules.has(r.module)) for (const id of r.tcs) ids.add(id);
  for (const c of cases) if (modules.has(c.module)) ids.add(c.id);
  for (const c of cases) if (c.deprecated) ids.delete(c.id);
  const mods = [...modules.keys()].sort();
  return {
    modules: mods.map((m) => ({ module: m, via: [...modules.get(m).via].sort(), files: [...modules.get(m).files].sort() })),
    tags: mods.map((m) => `@${m}`),
    grep: mods.length ? mods.map((m) => `@${m}`).join('|') : null,
    cases: [...ids].sort(),
    unmapped: unmapped.sort(),
  };
}

/** Case files on disk: id, module folder, deprecated flag. */
export function readCases(qaRoot) {
  const out = [];
  for (const p of walk(join(qaRoot, 'cases'))) {
    const m = basename(p).match(CASE_RE);
    if (!m || !p.endsWith('.md')) continue;
    const parts = p.split('/');
    const tags = (readFileSync(p, 'utf8').match(/^\*\*Tags:\*\*\s*(.+)$/m) || [])[1] ?? '';
    out.push({ id: m[1], module: parts[parts.length - 2].replace(/^_/, ''), deprecated: /@deprecated:/.test(tags) });
  }
  return out;
}

const isMain = process.argv[1] && basename(process.argv[1]) === 'changed-modules.mjs';
if (isMain) trackRun(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const qa = opt('--qa') ?? workspaceRoot();
  let changed;
  if (argv.includes('--stdin')) changed = readFileSync(0, 'utf8').split('\n');
  else {
    const base = opt('--base'); const head = opt('--head') ?? 'HEAD';
    if (!base) { console.error('usage: changed-modules.mjs --base <ref> --head <sha> [--repo <dir>] [--layer <name>] [--json] | --stdin'); process.exit(2); }
    try {
      changed = execFileSync('git', ['-C', opt('--repo') ?? '.', 'diff', '--name-only', `${base}...${head}`], { encoding: 'utf8' }).split('\n');
    } catch (e) { console.error(`changed-modules: git diff failed — ${e.message.split('\n')[0]}`); process.exit(2); }
  }
  const mapPath = join(qa, 'docs', 'impact-map.md');
  const rows = existsSync(mapPath) ? readImpactMap(readFileSync(mapPath, 'utf8')) : [];
  const r = selectChanged({ changed, rows, layer: opt('--layer'), cases: readCases(qa) });
  if (argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  if (!existsSync(mapPath)) console.log('no docs/impact-map.md — every path is UNMAPPED; run /qa-impact first');
  for (const m of r.modules) console.log(`module  ${m.module}  (${m.via.join(', ')})  ${m.files.length} file(s)`);
  console.log(`tags    ${r.tags.join(' ') || '—'}`);
  console.log(`grep    ${r.grep ? `--grep "${r.grep}"` : '—'}`);
  console.log(`cases   ${r.cases.join(', ') || '—'}`);
  for (const f of r.unmapped) console.log(`UNMAPPED ${f}`);
}
