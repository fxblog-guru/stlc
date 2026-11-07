#!/usr/bin/env node
/**
 * profile.mjs — print only the PROJECT-PROFILE.md sections that were asked for, and say which of
 * them still hold a template placeholder.
 *
 *   node <qa-root>/scripts/shared/profile.mjs                          # the sections, with word counts
 *   node <qa-root>/scripts/shared/profile.mjs "Test types" Environments  # those sections only
 *   node <qa-root>/scripts/shared/profile.mjs --all                    # the whole file (what Read would do)
 *
 * Why this exists: the profile is ~4,500 words and every phase, agent and skill opens with "read the
 * profile first" — a full Read on every spawn, when a phase needs two or three sections. The `§Name`
 * a file cites is the `## Name` heading here; a name matches case-insensitively, by prefix
 * (`"Test"` → `## Test types`), and a `### ` sub-heading is printed with its section.
 *
 * Placeholders: a code span that is nothing but `<…>` (`<your product name>`) is the template's,
 * not a value. They are listed after the sections, on stderr, as `placeholder: §<section> line <n>`;
 * a phase that needs that section stops with "Project setup required". Exit 0 · 1 a section does not
 * exist · 2 the profile cannot be found.
 *
 * Runs from the project root (.claude/PROJECT-PROFILE.md), the QA root, or the bundle repository.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();
const candidates = [
  process.env.QA_PROFILE,
  join(cwd, '.claude', 'PROJECT-PROFILE.md'),
  join(cwd, '..', '.claude', 'PROJECT-PROFILE.md'),
  join(cwd, 'PROJECT-PROFILE.md'),
  resolve(here, '..', '..', '..', '..', 'PROJECT-PROFILE.md'), // bundle repo: workspace/qa/scripts/shared → root
  resolve(here, '..', '..', '..', '.claude', 'PROJECT-PROFILE.md'), // installed: <qa-root>/scripts/shared → project
].filter(Boolean);

const PLACEHOLDER = /`<[^`<>]+>`/g;

/** `## ` sections: [{ name, start, end }] — `end` exclusive; fenced blocks are not headings. */
export function sections(lines) {
  const out = [];
  let fenced = false;
  lines.forEach((l, i) => {
    if (/^```/.test(l)) fenced = !fenced;
    if (!fenced && /^## /.test(l)) out.push({ name: l.slice(3).trim(), start: i });
  });
  out.forEach((s, k) => { s.end = k + 1 < out.length ? out[k + 1].start : lines.length; });
  return out;
}

/** The section a cited name means: exact (case-insensitive), else the one heading it prefixes. */
export function find(idx, want) {
  const w = want.replace(/^§/, '').trim().toLowerCase();
  const exact = idx.find((s) => s.name.toLowerCase() === w);
  if (exact) return exact;
  const pre = idx.filter((s) => s.name.toLowerCase().startsWith(w));
  return pre.length === 1 ? pre[0] : null;
}

/**
 * A placeholder is the VALUE of a setting: a `<…>` code span before the line's first ` — `, on a
 * `- **Label:**` / `**Label:**` line, or a table cell. After the dash a line explains its value and
 * lists the options (`initiative` — `<initiative | change | fix>`): documentation, not a hole.
 */
export function placeholders(lines, s) {
  const out = [];
  for (let i = s.start; i < s.end; i++) {
    const l = lines[i];
    const setting = /^\s*(-\s+)?\*\*[^*]+:\*\*/.test(l);
    const row = /^\|/.test(l) && !/^\|\s*:?-/.test(l);
    if (!setting && !row) continue;
    const value = setting ? l.split(/\s[—–]\s/)[0] : l;
    for (const m of value.matchAll(PLACEHOLDER)) if (m[0] !== "`<none>`") out.push({ line: i + 1, text: m[0] }); // `<none>` is the value "none"
  }
  return out;
}

export function print(text, wanted) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const idx = sections(lines);
  const chunks = [];
  const missing = [];
  const holes = [];
  for (const w of wanted) {
    const s = find(idx, w);
    if (!s) { missing.push(w); continue; }
    chunks.push(lines.slice(s.start, s.end).join('\n').replace(/\n+$/, ''));
    for (const p of placeholders(lines, s)) holes.push(`placeholder: §${s.name} line ${p.line} ${p.text}`);
  }
  return { text: chunks.join('\n\n'), missing, holes };
}

function toc(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const words = (a) => a.join(' ').split(/\s+/).filter(Boolean).length;
  const rows = sections(lines).map((s) => `  ${String(words(lines.slice(s.start, s.end))).padStart(5)} words  §${s.name}${placeholders(lines, s).length ? `  (${placeholders(lines, s).length} placeholder(s))` : ''}`);
  return `PROJECT-PROFILE.md — ${words(lines)} words. Sections:\n${rows.join('\n')}\n\nUsage: node <qa-root>/scripts/shared/profile.mjs "Test types" Environments   (print those sections only)`;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const file = candidates.find((p) => existsSync(p));
  if (!file) { console.error('profile: PROJECT-PROFILE.md not found (looked in .claude/, the cwd, and the bundle root)'); process.exit(2); }
  const text = readFileSync(file, 'utf8');
  const args = process.argv.slice(2);
  if (args.includes('--all')) { process.stdout.write(text); process.exit(0); }
  if (!args.length) { console.log(toc(text)); process.exit(0); }
  const { text: out, missing, holes } = print(text, args);
  if (out) process.stdout.write(out + '\n');
  for (const h of holes) console.error(h);
  if (missing.length) {
    console.error(`profile: no such section: ${missing.map((m) => '§' + m).join(', ')} (run with no arguments for the list)`);
    process.exit(1);
  }
}
