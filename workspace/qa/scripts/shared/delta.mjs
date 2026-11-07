#!/usr/bin/env node
/**
 * delta.mjs — what changed since the last run, and what changed in the system between them
 * (CONTRACTS §31).
 *
 *   npm run qa:delta -- <run dir> [--base <run dir>] [--json]
 *
 * A snapshot ("12 failed") hides the only questions a reader has: which failures are new, which were
 * already known, which went green — and did the system change between the two runs at all? The base
 * is the previous run folder beside this one unless --base names another. Results come from
 * `junit.xml` (any runner) or the wrappers' `results.json`; identities from each run's `target.json`.
 *
 * The identity diff is what makes the classes mean something:
 *   a NEW-FAIL on an unchanged system is not a regression of the product — the test, its data or the
 *   environment moved; a FIXED on an unchanged system is not a fix — it is a flake or an environment
 *   change. Neither is decided here: they are hints, printed beside the class, for the triage.
 *
 * Writes `<run dir>/delta.md` (unless --json). Exit 0 · 3 usage.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { readJunit } from './lib/junit.mjs';
import { identityDiff } from './lib/target.mjs';
import { trackRun } from './lib/runlog.mjs';

export const CLASSES = ['NEW-FAIL', 'STILL-FAILING', 'FLAKY', 'FIXED', 'NEW', 'GONE', 'SKIPPED', 'STEADY'];

/** Map(caseId → {pass, fail, skip}) from a run folder, or null when it holds no results. */
export function outcomesOf(dir) {
  const j = readJunit(join(dir, 'junit.xml'));
  if (j) return j.out;
  const files = [join(dir, 'results.json')];
  if (existsSync(dir)) for (const n of readdirSync(dir)) if (statSync(join(dir, n)).isDirectory()) files.push(join(dir, n, 'results.json'));
  let found = false;
  const out = new Map();
  for (const f of files.filter(existsSync)) {
    let doc;
    try { doc = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
    if (!doc?.cases || typeof doc.cases !== 'object') continue;
    found = true;
    for (const [id, r] of Object.entries(doc.cases)) {
      const prev = out.get(id) ?? { pass: 0, fail: 0, skip: 0 };
      out.set(id, { pass: prev.pass + (r.pass ?? 0), fail: prev.fail + (r.fail ?? 0), skip: prev.skip + (r.skip ?? 0) });
    }
  }
  return found ? out : null;
}

/** pass · fail · flaky (failed and passed in one run) · skip · absent */
export function outcome(r) {
  if (!r) return 'absent';
  if (r.fail > 0 && r.pass > 0) return 'flaky';
  if (r.fail > 0) return 'fail';
  if (r.pass > 0) return 'pass';
  return 'skip';
}

export function classify(now, before) {
  const a = outcome(now), b = outcome(before);
  if (a === 'absent') return 'GONE';
  if (a === 'flaky') return 'FLAKY';
  if (a === 'skip') return 'SKIPPED';
  if (b === 'absent') return 'NEW';
  if (a === 'fail') return b === 'fail' || b === 'flaky' ? 'STILL-FAILING' : 'NEW-FAIL';
  return b === 'fail' ? 'FIXED' : 'STEADY';
}

/**
 * The hint a class earns from the identity diff. `unknown` identities give no hint: a reading that
 * is missing cannot vouch that nothing changed.
 */
export function hint(cls, diff) {
  if (!['NEW-FAIL', 'FIXED'].includes(cls)) return null;
  if (!diff.length || diff.some((d) => d.change === 'unknown')) return 'system identity unknown on one side — no attribution';
  const changed = diff.filter((d) => d.change === 'changed');
  if (!changed.length)
    return cls === 'NEW-FAIL'
      ? 'the system did not change between the runs — suspect the test, its data or the environment before the product'
      : 'passed without any change to the system — a flake or an environment change, not a fix';
  const what = changed.map((d) => `${d.component} [${d.kind}]`).join(', ');
  return cls === 'NEW-FAIL' ? `first suspect: what changed — ${what}` : `went green after ${what} changed`;
}

export function compare(nowMap, beforeMap, diff = []) {
  const ids = [...new Set([...(nowMap?.keys() ?? []), ...(beforeMap?.keys() ?? [])])].sort();
  return ids.map((id) => {
    const cls = classify(nowMap?.get(id), beforeMap?.get(id));
    return { id, class: cls, now: outcome(nowMap?.get(id)), before: outcome(beforeMap?.get(id)), hint: hint(cls, diff) };
  });
}

/** The run folder before this one, in the same parent (run ids sort by time, CONTRACTS §2). */
export function previousRun(dir) {
  const parent = dirname(dir), me = basename(dir);
  if (!existsSync(parent)) return null;
  const older = readdirSync(parent).filter((n) => n < me && statSync(join(parent, n)).isDirectory()).sort();
  return older.length ? join(parent, older[older.length - 1]) : null;
}

const readTarget = (dir) => {
  try { return JSON.parse(readFileSync(join(dir, 'target.json'), 'utf8')); } catch { return null; }
};

export function render({ run, base, rows, diff }) {
  const count = (c) => rows.filter((r) => r.class === c).length;
  const cell = (s) => String(s ?? '—').replace(/\|/g, '\\|');
  const lines = [
    `# Delta — ${basename(run)} vs ${base ? basename(base) : '(no earlier run)'}`,
    '',
    CLASSES.map((c) => `${c} ${count(c)}`).join(' · '),
    '',
    '## System identity',
    '',
  ];
  if (diff.length) {
    lines.push('| Component | Kind | Before | Now | Change |', '|---|---|---|---|---|');
    for (const d of diff) lines.push(`| ${cell(d.component)} | ${cell(d.kind)} | ${cell(d.from)} | ${cell(d.to)} | ${d.change} |`);
  } else lines.push('No target.json on either run — the delta cannot say whether the system changed (qa:target, CONTRACTS §31).');
  for (const c of CLASSES.filter((x) => x !== 'STEADY' && count(x))) {
    lines.push('', `## ${c}`, '', '| Case | Before | Now | Hint |', '|---|---|---|---|');
    for (const r of rows.filter((x) => x.class === c)) lines.push(`| ${r.id} | ${r.before} | ${r.now} | ${cell(r.hint)} |`);
  }
  return lines.join('\n') + '\n';
}

function main(argv) {
  const run = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--base');
  if (!run || !existsSync(run)) { console.error('usage: qa:delta -- <run dir> [--base <run dir>] [--json]'); return 3; }
  const base = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : previousRun(run);
  const now = outcomesOf(run);
  if (!now) { console.error(`qa:delta — ${run} holds no junit.xml or results.json`); return 3; }
  const before = base ? outcomesOf(base) : null;
  const diff = base ? identityDiff(readTarget(base), readTarget(run)) : [];
  const rows = compare(now, before, diff);
  if (argv.includes('--json')) { process.stdout.write(JSON.stringify({ run, base, diff, rows }, null, 2) + '\n'); return 0; }
  const md = render({ run, base, rows, diff });
  writeFileSync(join(run, 'delta.md'), md);
  console.log(md);
  console.log(`✓ Wrote ${join(run, 'delta.md')}`);
  return 0;
}

const isMain = process.argv[1] && /(^|\/)delta\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) trackRun(import.meta.url);
if (isMain) process.exit(main(process.argv.slice(2)));
