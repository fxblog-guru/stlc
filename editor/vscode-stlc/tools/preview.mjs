// Writes static preview pages of the board and the sidebar Overview, from a fixture project, so the
// webview can be looked at (and screenshotted) in a browser without starting VS Code.
//
//   npm run compile && node tools/preview.mjs <out-dir> [fixture-dir]
//
// Each page loads the real media/board.css, reltime.js and board.js, stubs acquireVsCodeApi, sets
// the VS Code theme variables of Dark Modern or Light Modern, and posts the view model the
// extension would post. The fixture is copied to a temp folder first and its file times are set
// from the run ids, so relative times read as they would on a real project. Nothing is written
// outside <out-dir> and the temp copy.
import { cpSync, mkdtempSync, mkdirSync, readdirSync, statSync, utimesSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { page } from './preview-page.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const require = createRequire(import.meta.url);
const { loadState } = require(join(pkg, 'out/model.js'));
const { LiveReader } = require(join(pkg, 'out/live.js'));
const { buildViewModel } = require(join(pkg, 'out/viewmodel.js'));

const outDir = resolve(process.argv[2] ?? join(pkg, 'preview'));
const fixture = resolve(process.argv[3] ?? join(pkg, 'src/test/fixtures/rich'));
const NOW = Date.parse(process.env.PREVIEW_NOW ?? '2026-10-15T09:40:00Z');

// ---- a temp copy with believable file times --------------------------------------------------
const root = mkdtempSync(join(tmpdir(), 'stlc-preview-'));
cpSync(fixture, root, { recursive: true });
const runTime = (id) => {
  const m = /^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})$/.exec(id);
  return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:00Z`) : null;
};
const setAll = (dir, at) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) setAll(p, at);
    utimesSync(p, at, at);
  }
  utimesSync(dir, at, at);
};
setAll(root, new Date('2026-10-13T08:00:00Z'));
const walkRuns = (dir) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (!statSync(p).isDirectory()) continue;
    const at = runTime(n);
    if (at) setAll(p, new Date(at.getTime() + 6 * 60_000));
    else walkRuns(p);
  }
};
walkRuns(join(root, 'qa/runs'));
// An e2e run on another feature that started three minutes ago and has no summary yet: the page
// shows it as live, and the feed names it.
const inflight = join(root, 'qa/runs/e2e/projects/2026-10-15-0937');
mkdirSync(join(inflight, 'test-results'), { recursive: true });
setAll(inflight, new Date(NOW - 3 * 60_000));
const state = JSON.parse(readFileSync(join(root, 'qa/state.json'), 'utf8'));

const result = loadState(root, 'qa/state.json');
if (!result.ok) throw new Error(result.reason);
const vm = buildViewModel(result, { live: new LiveReader('qa').snapshot(root, state), watching: true, addonVersion: JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).version, now: NOW });



mkdirSync(outDir, { recursive: true });
const media = join(pkg, 'media');
for (const theme of ['dark', 'light']) {
  for (const layout of ['page', 'sidebar']) {
    const name = `${layout === 'page' ? 'board' : 'sidebar'}-${theme}.html`;
    writeFileSync(join(outDir, name), page({ media, message: { vm }, theme, layout, accent: 'teal', title: `STLC ${layout} ${theme}` }));
  }
  // The other three Overview tabs, so every view can be looked at.
  for (const tab of ['runs', 'defects', 'coverage']) {
    writeFileSync(join(outDir, `sidebar-${tab}-${theme}.html`), page({ media, message: { vm }, theme, layout: 'sidebar', accent: 'teal', title: `STLC sidebar ${tab} ${theme}`, tab }));
  }
}
writeFileSync(join(outDir, 'vm.json'), JSON.stringify(vm, null, 2));
console.log(`wrote ${outDir} (board/sidebar × dark/light) from ${fixture}`);
