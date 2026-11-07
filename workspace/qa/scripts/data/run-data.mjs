#!/usr/bin/env node
/**
 * run-data.mjs — the `data` type's runner wrapper (CONTRACTS §9.6 / §28 in one place).
 * Runs ONLY the commands PROJECT-PROFILE §Data testing declares, inside the declared repo, and
 * writes <RUN_DIR>/recon-summary.md plus results.json from the declared result file.
 *
 *   npm run test:data -- --repo <path> --cmd "<run command>" --results <file relative to repo>
 *                        [--mutate "<mutation command>"] [--layer <id>]
 *
 * The verdict is the result file, never the log: dbt `run_results.json` or JUnit XML. A run that
 * produced no result file, ran zero tests, or skipped any is ⛔ SETUP/ENV (exit 2), never green.
 * Without --mutate the data gate is `not evaluable` (CONTRACTS §28); the run still records its results.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { readJunit, resultsOf } from '../shared/lib/junit.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const { repo, cmd, results, mutate, layer = 'default' } = args;
if (!repo || !cmd || !results) {
  console.error('run-data: --repo, --cmd and --results are required (values come from PROJECT-PROFILE §Data testing). Aborting.');
  process.exit(2);
}
if (!existsSync(repo)) { console.error(`run-data: repo path not found: ${repo} (fix §Data testing → Repo path).`); process.exit(2); }

const runDir = resolve(process.env.RUN_DIR ?? join('runs', 'data', '_adhoc', new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})/, '$1-')));
const out = join(runDir, layer);
mkdirSync(out, { recursive: true });

const sh = (command) => spawnSync(command, { cwd: repo, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const git = spawnSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
writeFileSync(join(out, 'repo-state.txt'), `repo: ${repo}\nhead: ${git.stdout.trim() || 'not a git repo'}\nlayer: ${layer}\n`);

/** Case-level verdicts from a dbt run_results.json or a JUnit file. */
function parseResults(file) {
  const cases = {};
  let tests = 0, skipped = 0, failed = 0;
  if (file.endsWith('.json')) {
    for (const r of JSON.parse(readFileSync(file, 'utf8')).results ?? []) {
      const isTest = /^(test|unit_test)\./.test(r.unique_id ?? '');
      if (!isTest) { if (r.status === 'error') failed++; continue; }
      tests++;
      const id = /TC-DATA-[A-Z0-9-]+-\d{3}/i.exec(JSON.stringify(r))?.[0]?.toUpperCase() ?? r.unique_id;
      const c = (cases[id] ??= { pass: 0, fail: 0, skip: 0, message: null });
      if (r.status === 'pass' || r.status === 'success') c.pass++;
      else if (r.status === 'skipped') { c.skip++; skipped++; }
      else { c.fail++; failed++; c.message ??= (r.message ?? r.status).slice(0, 300); }
    }
  } else {
    const { cases: mapped, unmapped } = resultsOf(readJunit(file, /^(TC-DATA-[A-Z0-9-]+?-\d{3})\b/));
    for (const [id, c] of Object.entries(mapped)) { cases[id] = c; tests += c.pass + c.fail + c.skip; skipped += c.skip; failed += c.fail; }
    // A test with no Case ID still ran; it counts, so an unlabelled failure cannot hide.
    tests += unmapped.length;
  }
  return { cases, tests, skipped, failed };
}

const run = sh(cmd);
writeFileSync(join(out, 'run-output.log'), `${run.stdout ?? ''}\n${run.stderr ?? ''}`);
const resultPath = join(repo, results);
let verdict, parsed = { cases: {}, tests: 0, skipped: 0, failed: 0 };
if (!existsSync(resultPath)) verdict = 'SETUP/ENV — no result file';
else {
  copyFileSync(resultPath, join(out, basename(resultPath)));
  parsed = parseResults(resultPath);
  if (parsed.tests === 0) verdict = 'SETUP/ENV — zero tests ran';
  else if (parsed.skipped) verdict = `SETUP/ENV — ${parsed.skipped} test(s) skipped`;
  else if (parsed.failed || run.status !== 0) verdict = 'FAIL';
  else verdict = 'PASS';
}

let mutation = 'not evaluable — no Mutation command declared';
if (mutate) {
  const m = sh(mutate);
  writeFileSync(join(out, 'mutation-output.log'), `${m.stdout ?? ''}\n${m.stderr ?? ''}`);
  const tally = /(\d+)\/(\d+) mutants killed/.exec(m.stdout ?? '');
  mutation = m.status === 0 && tally && tally[1] === tally[2] ? `PASS — ${tally[0]}` : `FAIL — ${tally?.[0] ?? `exit ${m.status}, no tally`}`;
}

writeFileSync(join(out, 'results.json'), JSON.stringify({ exit: run.status, noReport: !existsSync(resultPath), verdict, mutation, ...parsed }, null, 2));
const summary = join(runDir, 'recon-summary.md');
const header = existsSync(summary) ? '' : '# Data run summary\n\n| Hop | Check | Source | Target | Tolerance | Verdict |\n|---|---|---|---|---|---|\n';
const rows = Object.entries(parsed.cases).map(([id, c]) => `| ${layer} | ${id} | — | — | — | ${c.fail ? '❌' : c.skip ? '⛔' : '✅'} |`).join('\n');
writeFileSync(summary, (existsSync(summary) ? readFileSync(summary, 'utf8') : header) + (rows ? rows + '\n' : '') + `\n- ${layer}: ${verdict} · tests ${parsed.tests} · mutation ${mutation}\n`);

console.log(`data run → ${layer}: ${verdict} · tests ${parsed.tests} · mutation ${mutation}`);
process.exit(verdict === 'PASS' && !mutation.startsWith('FAIL') ? 0 : verdict.startsWith('SETUP') ? 2 : 1);
