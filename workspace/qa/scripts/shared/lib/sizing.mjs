/**
 * sizing.mjs — how big a change is, and what that buys it (CONTRACTS §27). Shared by qa:lint, the
 * sizing CLI and the benchmark, so the rule a plan is linted against is the rule a spawn is gated by.
 *
 * A plan's `## Sizing` section is a list of `- key: value` lines:
 *   change_class     trivial | standard | high-risk
 *   worth_testing    yes — <why> | no — <why>        (no = an explicit skip: the plan designs nothing)
 *   types            the test types this change needs, comma-separated (`—` when worth_testing is no)
 *   skipped          `<type> — <why>; …` every enabled type left out, each with its reason
 *   estimate_tokens  the whole run's token estimate (sizing.mjs estimate prints a starting figure)
 *   spawns           the agent spawns the estimate assumes
 *   over_budget      `approved — <name> <YYYY-MM-DD>` when the estimate exceeds the profile budget
 *   spawn_reason     why this slug may spawn past its class budget
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TYPES } from './types.mjs';

export const CLASSES = {
  // Phases are the minimum the class must pass through; review_before_script is what makes a
  // high-risk or standard change pay for an independent read before code is written against it.
  trivial: { maxTypes: 1, spawnBudget: 2, reviewBeforeScript: false, mustCover: [] },
  // standard and high-risk may cover every type the registry knows; the cap follows the registry.
  standard: { maxTypes: TYPES.length, spawnBudget: 6, reviewBeforeScript: true, mustCover: [] },
  'high-risk': { maxTypes: TYPES.length, spawnBudget: 12, reviewBeforeScript: true, mustCover: ['security'] },
};
export { TYPES };
// Plans written before sizing existed are history; from this date a plan without it is an error.
export const SIZING_SINCE = '2026-10-26';
// Starting figures for `estimate`, replaced by what qa:bench measures on the project: a spawn's fixed
// cost (protocol, skill, profile slice) and the cost of one designed-and-scripted case.
export const TOKENS_PER_SPAWN = 30000;
export const TOKENS_PER_CASE = 6000;

const list = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter((s) => s && s !== '—');

/** The `## Sizing` section as a key → value map; null when the plan has none. */
export function parseSizing(text) {
  const m = /^## Sizing[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(String(text).replace(/\r\n?/g, '\n'));
  if (!m) return null;
  const out = {};
  for (const l of m[1].split('\n')) {
    const kv = /^-\s*([a-z_]+):\s*(.*?)\s*$/.exec(l);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

export function parseSkipped(v) {
  const out = new Map();
  for (const part of String(v ?? '').split(';').map((s) => s.trim()).filter((s) => s && s !== '—')) {
    const m = /^([a-z]+)\s+—\s+(\S.*)$/.exec(part);
    out.set(m ? m[1] : part, m ? m[2] : null);
  }
  return out;
}

/** The profile's token budget per run (`**Token budget per run:** \`N\``); null when unset. */
export function readBudget(root = '.') {
  const path = [join(root, '..', '.claude', 'PROJECT-PROFILE.md'), join(root, '..', 'PROJECT-PROFILE.md'), join(root, 'PROJECT-PROFILE.md')].find((p) => existsSync(p));
  if (!path) return null;
  const m = /\*\*Token budget per run:\*\*\s*`?(\d+)`?/.exec(readFileSync(path, 'utf8'));
  return m && Number(m[1]) > 0 ? Number(m[1]) : null; // 0 is the template's "no budget"
}

/** Spawns recorded for a slug on or after a date (logs/spawns.jsonl, written by `sizing.mjs spawn`). */
export function spawnsSince(root, slug, since) {
  const p = join(root, 'logs', 'spawns.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((r) => r && r.slug === slug && String(r.at ?? '').slice(0, 10) >= since);
}

export function estimate({ reqs, types, spawns }) {
  return spawns * TOKENS_PER_SPAWN + reqs * types.length * TOKENS_PER_CASE;
}

/**
 * Everything wrong with a plan's sizing, as messages. `ctx`: enabled (profile types, or null when no
 * profile), budget (or null), traceTypes (types with traceability rows), scripted (a row is Scripted ✅),
 * reviewed (the slug has a case review), spawnsUsed (recorded spawns since the plan).
 */
export function sizingProblems(s, ctx) {
  const e = [];
  const cls = CLASSES[s.change_class];
  if (!cls) { e.push(`\`change_class: ${s.change_class ?? ''}\` is not ${Object.keys(CLASSES).join(' | ')}`); return e; }
  const worth = /^(yes|no)\s+—\s+\S/.exec(s.worth_testing ?? '');
  if (!worth) e.push('`worth_testing:` is not `yes — <why>` or `no — <why>` — a skip is valid, an unexplained one is not');
  const types = list(s.types);
  for (const t of types) if (!TYPES.includes(t)) e.push(`\`types:\` \`${t}\` is not a test type`);
  if (worth?.[1] === 'no') {
    if (types.length) e.push('`worth_testing: no` with `types:` listed — a skipped change designs nothing');
    if (ctx.traceTypes.length) e.push('`worth_testing: no` but the traceability table has rows — design nothing, or say why it is worth testing');
    return e;
  }
  if (types.length > cls.maxTypes) e.push(`a ${s.change_class} change needs at most ${cls.maxTypes} type(s); \`types:\` lists ${types.length} — size it \`standard\`, or drop types`);
  for (const t of ctx.traceTypes) if (!types.includes(t)) e.push(`traceability has \`${t}\` rows but \`types:\` does not list it — fan out only what the change needs`);
  const skipped = parseSkipped(s.skipped);
  for (const [t, why] of skipped) if (!why) e.push(`\`skipped:\` \`${t}\` has no reason — write \`${t} — <why>\``);
  for (const t of cls.mustCover) if (!types.includes(t) && !skipped.get(t)) e.push(`a ${s.change_class} change tests \`${t}\` or skips it with a reason`);
  // A disabled type in `types:` is harmless: fanout intersects with the profile, which only narrows.
  if (ctx.enabled) {
    for (const t of ctx.enabled) if (!types.includes(t) && !skipped.get(t)) e.push(`enabled type \`${t}\` is neither in \`types:\` nor in \`skipped:\` with a reason`);
  }
  const est = Number(s.estimate_tokens);
  if (!/^\d+$/.test(s.estimate_tokens ?? '')) e.push('`estimate_tokens:` is not a whole number — `sizing.mjs estimate` prints a starting figure');
  else if (ctx.budget && est > ctx.budget && !/^approved\s+—\s+\S.*\d{4}-\d{2}-\d{2}$/.test(s.over_budget ?? ''))
    e.push(`estimate ${est} tokens is over the profile budget ${ctx.budget} — stop and ask; record \`over_budget: approved — <name> <YYYY-MM-DD>\``);
  if (!/^\d+$/.test(s.spawns ?? '')) e.push('`spawns:` is not a whole number');
  if (ctx.spawnsUsed > cls.spawnBudget && !(s.spawn_reason ?? '').trim())
    e.push(`${ctx.spawnsUsed} spawns recorded, over the ${s.change_class} budget of ${cls.spawnBudget}, and no \`spawn_reason:\``);
  if (cls.reviewBeforeScript && ctx.scripted && !ctx.reviewed) e.push(`a ${s.change_class} change is scripted with no case review — /qa-review comes before /qa-script`);
  return e;
}
