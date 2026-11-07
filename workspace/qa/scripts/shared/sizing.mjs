#!/usr/bin/env node
/**
 * sizing.mjs — size the work before acting on it, and keep agents from reading what a script can answer
 * (CONTRACTS §27). Run from the QA root.
 *
 *   node scripts/shared/sizing.mjs estimate <slug> --class <c> --types a,b [--reqs n]
 *        a starting token figure and the spawn count for the plan's `## Sizing` (and the profile budget)
 *   node scripts/shared/sizing.mjs fanout <slug>
 *        the types a design or script phase may spawn for: the plan's `types:` ∩ the profile's enabled
 *        types, grouped by agent (one spawn per agent). Exit 1 when the plan skips the change or has no sizing.
 *   node scripts/shared/sizing.mjs spawn <slug> --agent <name> --phase <phase>
 *        record one spawn (logs/spawns.jsonl); exit 3 when it passes the class budget with no `spawn_reason:`
 *   node scripts/shared/sizing.mjs next-id <TYPE> <MODULE>
 *        the next free Case ID, from file names only — no agent reads a matrix to pick an id
 *   node scripts/shared/sizing.mjs trace-upsert <plan> <REQ> <Case ID> <type> <module> <P0-3>
 *        append a traceability row, or leave the existing one; never a full-table rewrite by hand
 *   node scripts/shared/sizing.mjs brief <slug>
 *        what a reviewer opens first: lint findings for the slug, cases changed since the last review,
 *        REQs with no case. The reviewer reads only what it names.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CLASSES, TYPES, estimate, parseSizing, readBudget, spawnsSince } from './lib/sizing.mjs';
import { readPlatformProfile } from './lib/platforms.mjs';
import { hashArtifact } from './lib/doc.mjs';
import { trackRun } from './lib/runlog.mjs';
import { AGENT_OF, TYPE_STEM } from './lib/types.mjs';

// The routing table of /qa-design and /qa-script, in one place a test can hold the commands to.
export { AGENT_OF };
const STEM = TYPE_STEM;
const TRACE_COLUMNS = '| Req | Case ID | Type | Module | Priority | Scripted | Last run | Status | Report |';

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const n of readdirSync(dir)) { const p = join(dir, n).replace(/\\/g, '/'); if (statSync(p).isDirectory()) yield* walk(p); else yield p; }
}
const latest = (dir, re) => (existsSync(dir) ? readdirSync(dir).filter((f) => re.test(f)).sort().at(-1) : undefined);
export const latestPlan = (root, slug) => { const f = latest(join(root, 'plans', slug), /^\d{4}-\d{2}-\d{2}-test-plan\.md$/); return f ? join(root, 'plans', slug, f) : null; };

/** Types → agents for a spawn, or { error }. The profile can only narrow the plan, never widen it. */
export function fanout(root, slug) {
  const plan = latestPlan(root, slug);
  if (!plan) return { error: `no test plan for ${slug} — /qa-plan first` };
  const s = parseSizing(readFileSync(plan, 'utf8'));
  if (!s) return { error: `${plan} has no ## Sizing — size the change before spawning (CONTRACTS §27)` };
  if (/^no\b/.test(s.worth_testing ?? '')) return { error: `${slug} is sized as not worth testing: ${s.worth_testing}` };
  const enabled = readPlatformProfile(root)?.types ?? null;
  const types = String(s.types ?? '').split(',').map((t) => t.trim()).filter((t) => TYPES.includes(t) && (!enabled || enabled.includes(t)));
  const agents = {};
  for (const t of types) (agents[AGENT_OF[t]] ??= []).push(t);
  return { plan, change_class: s.change_class, types, agents };
}

export function nextId(root, type, module) {
  const stem = STEM[type] ?? type.toUpperCase();
  const prefix = `TC-${stem}-${module.toUpperCase()}-`;
  let max = 0;
  for (const p of walk(join(root, 'cases'))) {
    const m = /^(TC-[A-Z0-9]+-[A-Z0-9-]+?)-(\d{3})-/.exec(basename(p));
    if (m && `${m[1]}-` === prefix) max = Math.max(max, Number(m[2]));
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

/** Append one row under the traceability header; 'exists' when the Case ID already has a row. */
export function traceUpsert(planPath, row) {
  const text = readFileSync(planPath, 'utf8').replace(/\r\n?/g, '\n');
  const at = text.indexOf(TRACE_COLUMNS);
  if (at < 0) throw new Error(`${planPath}: no traceability header`);
  if (new RegExp(`^\\|[^|]*\\|\\s*${row.caseId}\\s*\\|`, 'm').test(text)) return 'exists';
  const lines = text.slice(at).split('\n');
  let end = 1;
  while (end < lines.length && /^\|/.test(lines[end].trim())) end++;
  const line = `| ${row.req} | ${row.caseId} | ${row.type} | ${row.module} | ${row.priority} | ❌ | — | — | — |`;
  lines.splice(end, 0, line);
  writeFileSync(planPath, text.slice(0, at) + lines.join('\n'));
  return 'added';
}

/** A reviewer's first read: never a file body, only pointers. */
export function brief(root, slug, { lint = null } = {}) {
  const out = [`# Review brief — ${slug}`];
  const plan = latestPlan(root, slug);
  const reviews = existsSync(join(root, 'reviews', slug)) ? readdirSync(join(root, 'reviews', slug)).filter((f) => f.endsWith('-case-review.md')).sort() : [];
  const last = reviews.at(-1) ? readFileSync(join(root, 'reviews', slug, reviews.at(-1)), 'utf8') : '';
  const hashed = new Map([...last.matchAll(/-\s*path:\s*(\S+)\s*\n\s*sha256:\s*([0-9a-f]{64})/g)].map((m) => [m[1].replace(/^[^/]*\/(?=cases\/)/, ''), m[2]]));
  const cases = [...walk(join(root, 'cases'))].filter((p) => p.endsWith('.md') && new RegExp(`^\\*\\*Feature:\\*\\*\\s*${slug}\\b`, 'm').test(readFileSync(p, 'utf8')));
  const rel = (p) => p.slice(root === '.' ? 0 : root.length + 1).replace(/^\.\//, '');
  const changed = cases.filter((p) => hashed.get(rel(p)) !== hashArtifact(p)).map(rel);
  out.push('', `## Changed since the last review (${changed.length} of ${cases.length})`, ...changed.map((p) => `- ${p}`));
  const reqs = new Set();
  const covered = new Set();
  const analysis = latest(join(root, 'analysis', slug), /^\d{4}-\d{2}-\d{2}-analysis\.md$/);
  if (analysis) for (const m of readFileSync(join(root, 'analysis', slug, analysis), 'utf8').matchAll(/^\| (REQ-\d{3,}) \|/gm)) reqs.add(m[1]);
  if (plan) for (const m of readFileSync(plan, 'utf8').matchAll(/^\| (REQ-\d{3,}) \| TC-/gm)) covered.add(m[1]);
  const gaps = [...reqs].filter((r) => !covered.has(r));
  out.push('', `## Requirements with no case (${gaps.length})`, ...gaps.map((r) => `- ${r}`));
  const findings = (lint ?? '').split('\n').filter((l) => /^\s*(ERROR|WARN)\s/.test(l) && (l.includes(`/${slug}/`) || cases.some((c) => l.includes(rel(c)))));
  out.push('', `## Lint findings for this slug (${findings.length})`, ...findings.map((l) => `- ${l.trim()}`));
  out.push('', 'Open only the files named above, then the cases a finding cites. Everything else was unchanged at the last verdict.');
  return out.join('\n');
}

function main(argv) {
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
  const [cmd, a, b, c, d, e, f] = pos;
  if (cmd === 'estimate' && a) {
    const cls = opt('--class');
    if (!CLASSES[cls]) { console.error(`--class ${Object.keys(CLASSES).join(' | ')}`); return 2; }
    const types = String(opt('--types') ?? '').split(',').filter(Boolean);
    // Spawns: one per agent per phase (design, script) plus the plan and, where the class requires it, the review.
    const agents = new Set(types.map((t) => AGENT_OF[t]).filter(Boolean)).size;
    const spawns = 1 + agents * 2 + (CLASSES[cls].reviewBeforeScript ? 1 : 0);
    const tokens = estimate({ reqs: Number(opt('--reqs') ?? 1), types, spawns });
    const budget = readBudget('.');
    console.log(`- estimate_tokens: ${tokens}\n- spawns: ${spawns}`);
    console.log(budget ? `profile budget ${budget}: ${tokens > budget ? 'OVER — stop and ask before acting' : 'within'}` : 'profile sets no token budget');
    if (spawns > CLASSES[cls].spawnBudget) console.log(`over the ${cls} spawn budget (${CLASSES[cls].spawnBudget}) — write spawn_reason:, or narrow the types`);
    return budget && tokens > budget ? 3 : 0;
  }
  if (cmd === 'fanout' && a) {
    const r = fanout('.', a);
    if (r.error) { console.error(`sizing: ${r.error}`); return 1; }
    console.log(JSON.stringify(r, null, 2));
    return 0;
  }
  if (cmd === 'spawn' && a) {
    const plan = latestPlan('.', a);
    const s = plan ? parseSizing(readFileSync(plan, 'utf8')) : null;
    const cls = CLASSES[s?.change_class];
    if (!cls) { console.error(`sizing: ${a} has no sized plan — /qa-plan first`); return 1; }
    const since = basename(plan).slice(0, 10);
    const used = spawnsSince('.', a, since).length;
    if (used + 1 > cls.spawnBudget && !(s.spawn_reason ?? '').trim()) {
      console.error(`sizing: spawn ${used + 1} for ${a} passes the ${s.change_class} budget of ${cls.spawnBudget} — record spawn_reason: in ## Sizing, or stop`);
      return 3;
    }
    mkdirSync('logs', { recursive: true });
    appendFileSync(join('logs', 'spawns.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), slug: a, agent: opt('--agent'), phase: opt('--phase') })}\n`);
    console.log(`spawn ${used + 1}/${cls.spawnBudget} for ${a}`);
    return 0;
  }
  if (cmd === 'next-id' && a && b) { console.log(nextId('.', a.toLowerCase(), b)); return 0; }
  if (cmd === 'trace-upsert' && f) {
    console.log(traceUpsert(a, { req: b, caseId: c, type: d, module: e, priority: f }));
    return 0;
  }
  if (cmd === 'brief' && a) {
    const lint = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'lint-qa.mjs')], { encoding: 'utf8', env: { ...process.env, QA_RUN_LOG: 'off' } }).stdout;
    console.log(brief('.', a, { lint }));
    return 0;
  }
  console.error('usage: sizing.mjs estimate <slug> --class c --types a,b [--reqs n] | fanout <slug> | spawn <slug> --agent a --phase p | next-id <type> <MODULE> | trace-upsert <plan> <REQ> <id> <type> <module> <prio> | brief <slug>');
  return 2;
}

const isMain = process.argv[1] && /(^|\/)sizing\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) trackRun(import.meta.url);
if (isMain) process.exit(main(process.argv.slice(2)));
