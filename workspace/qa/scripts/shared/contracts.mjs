#!/usr/bin/env node
/**
 * contracts.mjs — print only the sections of CONTRACTS.md that were asked for.
 *
 *   node <qa-root>/scripts/shared/contracts.mjs            # table of contents with word counts
 *   node <qa-root>/scripts/shared/contracts.mjs 3 7 13     # §3, §7, §13 (with their sub-headings)
 *   node <qa-root>/scripts/shared/contracts.mjs 9.6        # §9 has numbered items, not subsections: prints §9 whole
 *   node <qa-root>/scripts/shared/contracts.mjs --all      # the whole file
 *
 * Why this exists: every skill is told to read two or three sections of the contract, and the
 * contract is ~4,000 words. Printing the cited sections costs a fraction of a full Read and keeps
 * one file as the source of truth — no digest to drift. The section numbering in the headings
 * (`## 3.`) is the contract; this script only slices on it.
 *
 * Runs from an installed project (.claude/CONTRACTS.md) or from the bundle repository
 * (CONTRACTS.md at the root). Exit 2 if the file cannot be found, 1 if a section does not exist.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = process.cwd();
const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  process.env.QA_CONTRACTS,
  join(cwd, '.claude', 'CONTRACTS.md'),
  join(cwd, 'CONTRACTS.md'),
  resolve(here, '..', '..', '..', '..', 'CONTRACTS.md'), // bundle repo: workspace/qa/scripts/shared → root
  resolve(here, '..', '..', '..', '..', '.claude', 'CONTRACTS.md'), // installed: <qa-root>/scripts/shared → project root
].filter(Boolean);

/** Section index: [{ id: '4' | '4.5', level: 2|3, start, end, title }] — `end` exclusive. */
export function indexSections(src) {
  const ls = Array.isArray(src) ? src : src.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let fenced = false;
  for (let i = 0; i < ls.length; i++) {
    if (/^```/.test(ls[i])) fenced = !fenced;
    if (fenced) continue;
    const m = ls[i].match(/^(##|###) (\d+)(?:\.(\d+[a-z]?))?\.? /);
    if (!m) continue;
    const level = m[1].length;
    const id = m[3] ? `${m[2]}.${m[3]}` : m[2];
    if (out.some((s) => s.id === id)) continue;
    out.push({ id, level, start: i, title: ls[i].replace(/^#+ /, '') });
  }
  for (let k = 0; k < out.length; k++) {
    const s = out[k];
    let end = ls.length;
    for (let j = k + 1; j < out.length; j++) {
      if (out[j].level <= s.level) { end = out[j].start; break; }
    }
    s.end = end;
  }
  return out;
}

export function slice(src, wanted) {
  const ls = Array.isArray(src) ? src : src.replace(/\r\n/g, '\n').split('\n');
  const idx = indexSections(ls);
  const chunks = [];
  const missing = [];
  for (const w of wanted) {
    const want = String(w).replace(/^§/, '');
    let s = idx.find((x) => x.id === want);
    if (!s && /^\d+\.\d+/.test(want)) {
      // §9.6 → §9 (numbered items, not subsections).
      const parent = idx.find((x) => x.id === want.split('.')[0] && x.level === 2);
      if (parent && !idx.some((x) => x.level === 3 && x.id.startsWith(parent.id + '.'))) s = parent;
    }
    if (!s) { missing.push(want); continue; }
    chunks.push(ls.slice(s.start, s.end).join('\n').replace(/\n+$/, ''));
  }
  return { text: chunks.join('\n\n---\n\n'), missing };
}

function toc(lines) {
  const idx = indexSections(lines);
  const words = (arr) => arr.join(' ').split(/\s+/).filter(Boolean).length;
  const rows = idx.map((s) => `${s.level === 3 ? '   ' : ''}§${s.id.padEnd(5)} ${String(words(lines.slice(s.start, s.end))).padStart(5)} words  ${s.title}`);
  return `CONTRACTS.md — ${words(lines)} words. Sections:\n${rows.join('\n')}\n\nUsage: node <qa-root>/scripts/shared/contracts.mjs 3 7 13   (print those sections only)`;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const file = candidates.find((p) => existsSync(p));
  if (!file) {
    console.error('contracts: CONTRACTS.md not found (looked in .claude/, the cwd, and the bundle root)');
    process.exit(2);
  }
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const args = process.argv.slice(2);
  if (args.includes('--all')) { process.stdout.write(text); process.exit(0); }
  if (args.length === 0) { console.log(toc(lines)); process.exit(0); }
  const { text: out, missing } = slice(lines, args);
  if (out) process.stdout.write(out + '\n');
  if (missing.length) {
    console.error(`contracts: no such section: ${missing.map((m) => '§' + m).join(', ')} (run with no arguments for the table of contents)`);
    process.exit(1);
  }
}
