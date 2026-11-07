#!/usr/bin/env node
/**
 * flaky.mjs — how often each case failed in a repeated run (/qa-flaky). Read-only over the evidence.
 *
 *   npx playwright test <specs> --repeat-each=10 --retries=0 --workers=4    (RUN_DIR=<run dir>)
 *   npm run qa:flaky -- <run dir> [--json]
 *
 * Reads the run's results.json (Playwright JSON reporter), else its junit.xml, and ranks every case:
 *   stable   never failed
 *   flaky    failed some runs — a /qa-flaky target
 *   broken   failed every run — a real failure, not a flake: triage it (CONTRACTS §5), never "stabilise" it
 * Each row carries the distinct first lines of the errors: one cause or several.
 *
 * Writes <run dir>/stability.md (or --json to stdout). Exit 0, or 1 when a case is flaky or broken.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANY_CASE_ID, junitOutcomes } from './lib/junit.mjs';
import { trackRun } from './lib/runlog.mjs';
import { flakyEvents, logActivity, runContext } from './lib/activity.mjs';
import { repoPath, workspaceRoot } from './lib/root.mjs';
import { redact } from './lib/redact.mjs';

const FAILED = new Set(['unexpected', 'flaky']);

/** One record per executed attempt group: { id, project, failed, error }. Skips are not runs. */
export function recordsFromJson(report) {
  const out = [];
  const walk = (suite, file) => {
    for (const s of suite.suites ?? []) walk(s, s.file ?? file);
    for (const spec of suite.specs ?? []) {
      const id = (ANY_CASE_ID.exec(spec.title) ?? [])[1] ?? `${spec.file ?? file} › ${spec.title}`;
      for (const t of spec.tests ?? []) {
        if (t.status === 'skipped') continue;
        const results = t.results ?? [];
        // A test the runner calls flaky failed an attempt before it passed: it counts as a failure here.
        const failed = FAILED.has(t.status);
        const error = results.map((r) => r.error?.message ?? r.errors?.[0]?.message).find(Boolean) ?? '';
        out.push({ id, project: t.projectName ?? '', failed, error });
      }
    }
  };
  for (const s of report.suites ?? []) walk(s, s.file);
  return out;
}

/** The same records from JUnit, where every <testcase> is one attempt. */
export function recordsFromJunit(xml) {
  const out = [];
  for (const [id, o] of junitOutcomes(xml).out) {
    for (let i = 0; i < o.pass; i++) out.push({ id, project: '', failed: false, error: '' });
    for (let i = 0; i < o.fail; i++) out.push({ id, project: '', failed: true, error: o.message ?? '' });
  }
  return out;
}

const firstLine = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';

export function stability(records) {
  const groups = new Map();
  for (const r of records) {
    const key = `${r.id}\u0000${r.project}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()]
    .map((runs) => {
      const failed = runs.filter((r) => r.failed);
      const rate = failed.length / runs.length;
      return {
        case: runs[0].id,
        project: runs[0].project,
        runs: runs.length,
        failures: failed.length,
        rate: Math.round(rate * 1000) / 1000,
        verdict: rate === 0 ? 'stable' : rate === 1 ? 'broken' : 'flaky',
        errors: [...new Set(failed.map((r) => firstLine(r.error)).filter(Boolean))],
      };
    })
    .sort((a, b) => b.rate - a.rate || a.case.localeCompare(b.case));
}

export function toMarkdown(rows, runDir) {
  const unstable = rows.filter((r) => r.verdict !== 'stable');
  const cell = (s) => String(s).replace(/\|/g, '\\|');
  return [
    `# Stability — ${runDir}`,
    '',
    `${rows.length} case(s) · ${rows.filter((r) => r.verdict === 'flaky').length} flaky · ${rows.filter((r) => r.verdict === 'broken').length} broken · runs per case: ${Math.max(0, ...rows.map((r) => r.runs))}`,
    '',
    unstable.length
      ? ['| Case ID | Project | Failed | Rate | Verdict | Errors |', '|---|---|---|---|---|---|', ...unstable.map((r) => `| ${r.case} | ${r.project || '—'} | ${r.failures}/${r.runs} | ${Math.round(r.rate * 100)} % | ${r.verdict} | ${cell(r.errors.join('<br>') || '—')} |`)].join('\n')
      : 'Every case passed every run.',
    '',
  ].join('\n');
}

function main(argv) {
  const runDir = argv.find((a) => !a.startsWith('--'));
  if (!runDir) { console.error('usage: npm run qa:flaky -- <run dir> [--json]'); return 2; }
  const json = join(runDir, 'results.json');
  const junit = join(runDir, 'junit.xml');
  const records = existsSync(json) ? recordsFromJson(JSON.parse(readFileSync(json, 'utf8')))
    : existsSync(junit) ? recordsFromJunit(readFileSync(junit, 'utf8')) : null;
  if (!records) { console.error(`qa:flaky — no results.json or junit.xml in ${runDir}: run with RUN_DIR=${runDir} first`); return 2; }
  const rows = stability(records);
  if (argv.includes('--json')) process.stdout.write(redact(JSON.stringify(rows, null, 2)) + '\n');
  else {
    // Error lines quote what the test saw, secrets included: mask before writing (§25).
    const md = redact(toMarkdown(rows, runDir));
    writeFileSync(join(runDir, 'stability.md'), md);
    const root = workspaceRoot();
    const ctx = runContext(root, runDir);
    logActivity(root, flakyEvents(rows, { slug: ctx.slug, runId: ctx.runId, link: ctx.rel && repoPath(root, `${ctx.rel}/stability.md`) }));
    console.log(md);
    console.log(`✓ Wrote ${join(runDir, 'stability.md').replace(/\\/g, '/')}`);
  }
  return rows.some((r) => r.verdict !== 'stable') ? 1 : 0;
}

const isMain = process.argv[1] && /(^|\/)flaky\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) trackRun(import.meta.url);
if (isMain) process.exit(main(process.argv.slice(2)));
