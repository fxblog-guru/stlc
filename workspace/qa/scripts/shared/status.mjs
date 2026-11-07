#!/usr/bin/env node
/**
 * status.mjs — the QA posture in the terminal (SessionStart hook; `/qa-status` may run it).
 *
 * Read-only: it derives the state in memory with build-state.mjs and prints it; it never writes
 * state.json, so it can never show an index older than the artifacts.
 *
 * --brief (the SessionStart hook) also prints one line when `afx` has recorded a newer agentic-fx-qa
 * in the project's `.claude/.agentic-fx-updates.json` (update-notice.mjs; silent otherwise).
 *
 * Usage:
 *   node <qa-root>/scripts/shared/status.mjs [--root <qa-root>] [--brief]   (root: lib/root.mjs, CONTRACTS §2)
 */

import { existsSync, statSync } from 'node:fs';
import { buildState } from './build-state.mjs';
import { updateLine } from './update-notice.mjs';
import { rootFromArgv } from './lib/root.mjs';

/** The project root holds `.claude/`: Claude Code names it to hooks, otherwise the cwd. */
function briefUpdate() {
  const line = updateLine(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  if (line) console.log(`[agentic-fx-qa] ${line}`);
}

function runCli() {
  const args = process.argv.slice(2);
  const root = rootFromArgv(args);
  const brief = args.includes('--brief');

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    if (!brief) console.log(`No QA root at ${root}. Start a feature with /qa-analyze <slug> <docs…>.`);
    else briefUpdate();
    return;
  }
  if (brief) {
    try {
      printBrief(buildState(root));
    } finally {
      briefUpdate(); // the update line prints even when the posture cannot be derived
    }
  } else printFull(buildState(root));
}

function printBrief(state) {
  if (state.slugs.length === 0) {
    console.log(`[agentic-fx-qa] ${state.project}: no features yet — /qa-analyze <slug> <docs…>`);
    return;
  }
  const lines = state.slugs.map((s) => {
    const parts = [`${s.slug} [${s.phase}]`];
    if (s.report) parts.push(`report ${s.report.overall}${s.report.stale ? ' (stale)' : ''}`);
    if (s.signoff) parts.push(`sign-off ${s.signoff.recommendation}`);
    if (s.defects.total_open) parts.push(`${s.defects.total_open} open defect(s)`);
    if (s.quarantine.active) parts.push(`${s.quarantine.active} quarantined${s.quarantine.expired ? `, ${s.quarantine.expired} EXPIRED` : ''}`);
    return `  ${parts.join(' · ')}`;
  });
  console.log(`[agentic-fx-qa] ${state.project}\n${lines.join('\n')}`);
}

function printFull(state) {
  const rule = '─'.repeat(80);
  console.log(`${rule}\nQA posture — ${state.project}   (derived ${state.generated_at}, hash ${state.source_hash.slice(0, 8)})\n${rule}`);
  console.log(`Types enabled: ${state.types_enabled ? state.types_enabled.join(', ') : 'unknown — PROJECT-PROFILE.md not found'}`);
  for (const e of state.environments) {
    const v = Object.entries(e.verdicts).map(([t, x]) => `${t} ${x}`).join(' · ') || 'no verdict lines';
    console.log(`Env ${e.env} (${e.run_id}): ${v}`);
  }
  if (state.slugs.length === 0) {
    console.log('\nNo features yet. Start with /qa-analyze <slug> <docs…>.');
    return;
  }
  for (const s of state.slugs) {
    console.log(`\n${s.slug} — ${s.title}\n  Phase:        ${s.phase}`);
    const t = s.traceability;
    if (t) {
      console.log(`  Cases:        ${t.total_cases} (${t.scripted} scripted · ${t.last_run_pass} pass · ${t.last_run_fail} fail · ${t.blocked} blocked · ${t.not_run} not run)`);
      const byType = Object.entries(s.types).map(([k, v]) => `${k} ${v.pass}/${v.cases}`).join(' · ');
      if (byType) console.log(`  By type:      ${byType}  (pass/cases)`);
    }
    if (s.review) console.log(`  Review:       ${s.review.verdict ?? 'no verdict line'} (${s.review.date})`);
    if (s.report) {
      const stale = s.report.stale ? `  STALE — newer runs not in the report: ${s.report.newer_runs.join(', ')}` : '';
      console.log(`  Report:       ${s.report.overall} (${s.report.date})${stale}`);
      console.log(`  Gates:        ${s.report.gates.map((g) => `${g.gate} ${g.verdict}`).join(' · ') || '—'}`);
    }
    if (s.signoff) console.log(`  Sign-off:     ${s.signoff.recommendation} (${s.signoff.release}, ${s.signoff.date})`);
    const d = s.defects;
    console.log(`  Open defects: ${d.total_open}${d.total_open ? ` (${Object.entries(d.by_severity).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ')})` : ''}`);
    for (const i of d.items) console.log(`    ${i.id} [${i.severity ?? 'severity?'}${i.origin === 'ESCAPED' ? ', ESCAPED' : ''}] ${i.title}`);
    for (const q of s.quarantine.items) console.log(`  Quarantined:  ${q.case_id} until ${q.until}${q.expired ? ' — EXPIRED' : ''} (${q.reason})`);
  }
}

if (process.argv[1] && /status(\.mjs)?$/.test(process.argv[1])) runCli();
