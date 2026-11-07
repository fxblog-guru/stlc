#!/usr/bin/env node
// case-score.mjs — technique / axis coverage per requirement (CONTRACTS §7). Read-only.
// Run from the QA root:  npm run qa:score [-- <slug> | --plan <path>] [--baseline <file>] [--write-baseline <file>]
//
// For every REQ in a plan's traceability table it collects the cases that cover it, reads each
// case's `## Technique` (technique → axes) plus its type, and prints which axes are covered:
// positive · negative · boundary · authz · error-contract · journey.
//
// Blocking (exit 1) — a P0/P1 REQ (its highest-priority traceability row) that lacks:
//   negative                      when the REQ has an api/integration/e2e/security/unit/mobile case
//   authz + error-contract        when the REQ has an api case
//   journey                       when the REQ has an e2e case
// Every other empty axis is printed as advisory. `--baseline <file>` grandfathers known gaps: one
// `<slug>/<REQ>/<axis>` per line (`#` comments); `--write-baseline <file>` writes today's blocking
// gaps in that format so a team can adopt the check without fixing history first. A baselined gap
// that is now covered is reported as removable, so the baseline only ever shrinks.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseTechnique, section, normalise } from "./lib/case-quality.mjs";
import { trackRun } from './lib/runlog.mjs';
import { FUNCTIONAL as FUNCTIONAL_TYPES } from './lib/types.mjs';

trackRun(import.meta.url);

const AXES = ["positive", "negative", "boundary", "authz", "error-contract", "journey"];
const TRACE_COLUMNS = "| Req | Case ID | Type | Module | Priority | Scripted | Last run | Status | Report |";
// A type proves an axis by what it is, whatever its Technique line says.
const TYPE_AXES = { security: ["authz", "negative"] };
const FUNCTIONAL = FUNCTIONAL_TYPES;

const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name).replace(/\\/g, "/");
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}
const read = (p) => normalise(readFileSync(p, "utf8"));

function traceRows(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === TRACE_COLUMNS);
  if (start === -1) return [];
  const rows = [];
  for (const l of lines.slice(start + 1)) {
    const t = l.trim();
    if (!t.startsWith("|")) break;
    const c = t.split("|").slice(1, -1).map((s) => s.trim());
    if (c.every((x) => /^:?-{2,}:?$/.test(x)) || c.length !== 9) continue;
    rows.push({ req: c[0], caseId: c[1], type: c[2], priority: c[4] });
  }
  return rows;
}

// Plans: one per slug (the latest dated test plan), or the one asked for.
let plans = [];
if (opt("--plan")) plans = [opt("--plan")];
else {
  const slugs = positional.length ? positional : existsSync("plans") ? readdirSync("plans").filter((d) => d !== "_template" && statSync(join("plans", d)).isDirectory()) : [];
  for (const s of slugs) {
    const latest = existsSync(join("plans", s)) ? readdirSync(join("plans", s)).filter((n) => /^\d{4}-\d{2}-\d{2}-test-plan\.md$/.test(n)).sort().at(-1) : null;
    if (latest) plans.push(`plans/${s}/${latest}`);
    else if (positional.length) { console.error(`case-score: no test plan under plans/${s}/`); process.exit(2); }
  }
}
if (!plans.length) { console.log("case-score — no test plans found; nothing to score"); process.exit(0); }

const caseFiles = new Map();
for (const p of walk("cases")) {
  if (p.includes("_template") || !p.endsWith(".md")) continue;
  const m = basename(p).match(/^(TC-[A-Z0-9-]+-\d{3})-/);
  if (m) caseFiles.set(m[1], p);
}

const baseline = new Set();
const baselinePath = opt("--baseline");
if (baselinePath) {
  if (!existsSync(baselinePath)) { console.error(`case-score: baseline ${baselinePath} not found`); process.exit(2); }
  for (const l of read(baselinePath).split("\n")) { const t = l.replace(/#.*/, "").trim(); if (t) baseline.add(t); }
}

const out = [];
const blocking = [];
const grandfathered = [];
const advisory = [];
for (const plan of plans) {
  if (!existsSync(plan)) { console.error(`case-score: ${plan} not found`); process.exit(2); }
  const slug = plan.split("/")[1];
  const byReq = new Map();
  for (const r of traceRows(read(plan))) {
    if (!/^REQ-\d{3,}$/.test(r.req)) continue;
    const e = byReq.get(r.req) ?? { priority: "P3", types: new Set(), axes: new Set(), cases: [], missing: [] };
    if (/^P[0-3]$/.test(r.priority) && r.priority < e.priority) e.priority = r.priority;
    if (r.caseId && r.caseId !== "—") {
      e.types.add(r.type);
      e.cases.push(r.caseId);
      for (const a of TYPE_AXES[r.type] ?? []) e.axes.add(a);
      const f = caseFiles.get(r.caseId);
      if (!f) e.missing.push(r.caseId);
      else for (const a of parseTechnique(section(read(f), "Technique")).axes) e.axes.add(a);
    }
    byReq.set(r.req, e);
  }
  for (const [req, e] of [...byReq].sort(([a], [b]) => a.localeCompare(b))) {
    // `negative` is owed by a REQ with a behavioural case; a REQ proven only by load, axe or
    // visual/layout scenarios (performance / accessibility / ui) has thresholds, not a rejection path.
    // A ui case's pairwise state × viewport rows count as `positive`, its long-data rows as `boundary`.
    const required = new Set([...e.types].some((t) => FUNCTIONAL.has(t)) ? ["negative"] : []);
    if (e.types.has("api")) { required.add("authz"); required.add("error-contract"); }
    if (e.types.has("e2e")) required.add("journey");
    const gate = e.priority === "P0" || e.priority === "P1";
    const gaps = [];
    for (const a of AXES) {
      if (e.axes.has(a)) continue;
      const key = `${slug}/${req}/${a}`;
      if (gate && required.has(a)) {
        if (baseline.has(key)) { grandfathered.push(key); gaps.push(`${a} (baselined)`); }
        else { blocking.push(key); gaps.push(`**${a}**`); }
      } else if (required.has(a) || (required.size && (a === "positive" || a === "boundary"))) { advisory.push(key); gaps.push(a); }
    }
    for (const id of e.missing) gaps.push(`${id}: no case file`);
    const mark = (a) => (e.axes.has(a) ? "✅" : required.has(a) ? (gate ? "❌" : "·") : "—");
    out.push(`| ${slug} | ${req} | ${e.priority} | ${[...e.types].sort().join(", ") || "—"} | ${AXES.map(mark).join(" | ")} | ${gaps.join("; ") || "—"} |`);
  }
}

console.log(`| Slug | REQ | P | Types | ${AXES.join(" | ")} | Gaps |`);
console.log(`|---|---|---|---|${AXES.map(() => "---").join("|")}|---|`);
for (const l of out) console.log(l);
console.log("\n✅ covered · ❌ blocking gap (P0/P1) · · required but REQ is P2/P3 · — not required");
const stale = [...baseline].filter((k) => !grandfathered.includes(k));
if (stale.length) console.log(`baseline: ${stale.length} entr${stale.length === 1 ? "y is" : "ies are"} now covered — remove: ${stale.join(", ")}`);

if (opt("--write-baseline")) {
  const lines = ["# case-score baseline — known P0/P1 axis gaps, grandfathered (CONTRACTS §7). Shrink it; never grow it by hand.", ...[...blocking, ...grandfathered].sort()];
  writeFileSync(opt("--write-baseline"), lines.join("\n") + "\n");
  console.log(`wrote ${opt("--write-baseline")} (${blocking.length + grandfathered.length} gap(s))`);
}
console.log(`\ncase-score — ${out.length} REQ(s), ${blocking.length} blocking gap(s), ${grandfathered.length} baselined, ${advisory.length} advisory`);
for (const k of blocking) console.log(`  GAP   ${k}`);
if (blocking.length && !opt("--write-baseline")) process.exit(1);
