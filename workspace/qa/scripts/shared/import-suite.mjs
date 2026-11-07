#!/usr/bin/env node
// import-suite.mjs — take stock of a suite that existed before stlc (CONTRACTS §29). Read-only over
// the sources; writes only imported/inventory.jsonl and reports/import/YYYY-MM-DD-import.md.
// Run from the QA root (.stlc/ or qa/):
//   npm run qa:import -- --source <name>=<export.csv|.json> [--source …] [--scripts <dir> …] [--out <file>] [--json]
//
// A source is a CSV or JSON export from any tool (Jira/Xray/Zephyr, Azure DevOps, TestRail, a
// spreadsheet saved as CSV). Columns are found by header name (ALIASES), so one script reads every
// export; a row with no id and no title continues the previous case's steps (how Xray, ADO and
// TestRail export one row per step). Nothing here writes a §7 case: an imported case is promoted
// into cases/ by /qa-design when a feature touches its module, citing `- ticket: <id> § imported`.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { createHash } from "node:crypto";
import { vagueExpected } from "./lib/case-quality.mjs";
import { trackRun } from "./lib/runlog.mjs";

/** Header names each field is read from, lowercase. The first column that matches wins. */
export const ALIASES = {
  id: ["id", "key", "issue key", "case id", "test case id", "testcase id", "tc id", "work item id", "test id"],
  title: ["title", "summary", "name", "test case", "test case title", "test name"],
  module: ["module", "section", "section hierarchy", "folder", "component", "components", "area path", "suite", "test repository path", "feature"],
  priority: ["priority"],
  preconditions: ["preconditions", "precondition", "pre-conditions", "prerequisites"],
  step: ["step", "steps", "action", "step action", "test step", "steps (step)", "step description"],
  expected: ["expected", "expected result", "expected results", "step expected result", "steps (expected result)", "step expected", "expected outcome"],
  automation: ["automation", "automated", "automation status", "automation type", "execution type"],
};
const NEAR = 0.8; // token Jaccard at or above which two cases are reported as near-duplicates
const PAIRWISE_MAX = 6000; // above this, near-duplicates are only looked for within a module

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes, CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Records (one object per row, original header keys) from a CSV or JSON export. */
export function readRecords(path) {
  const text = readFileSync(path, "utf8").replace(/^﻿/, "");
  if (extname(path).toLowerCase() === ".json") {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data.cases ?? data.items ?? data.value ?? [];
    return list.map((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v : v == null ? "" : String(v)])));
  }
  const [head, ...body] = parseCsv(text);
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

/** The column each field is read from, or null. */
export function mapColumns(keys) {
  const lower = new Map(keys.map((k) => [k.trim().toLowerCase(), k]));
  return Object.fromEntries(Object.entries(ALIASES).map(([f, names]) => [f, names.map((n) => lower.get(n)).find(Boolean) ?? null]));
}

const val = (r, col) => (col ? String(r[col] ?? "").trim() : "");

/** Normalised cases from one source's records. */
export function toCases(source, records) {
  if (!records.length) return { cases: [], columns: mapColumns([]) };
  const cols = mapColumns(Object.keys(records[0]));
  const cases = [];
  for (const r of records) {
    const id = val(r, cols.id), title = val(r, cols.title);
    // JSON exports may carry steps as an array of { action|step, expected } objects.
    const raw = cols.step ? r[cols.step] : "";
    const steps = Array.isArray(raw)
      ? raw.map((s) => ({ action: String(s.action ?? s.step ?? s.description ?? "").trim(), expected: String(s.expected ?? s.expectedResult ?? s.result ?? "").trim() }))
      : val(r, cols.step) || val(r, cols.expected) ? [{ action: val(r, cols.step), expected: val(r, cols.expected) }] : [];
    if (!id && !title) { // a continuation row: one more step of the case above
      if (cases.length) cases.at(-1).steps.push(...steps);
      continue;
    }
    cases.push({
      source, id: id || `${source}#${cases.length + 1}`, idFromSource: Boolean(id), title,
      module: val(r, cols.module), priority: val(r, cols.priority), preconditions: val(r, cols.preconditions),
      automation: val(r, cols.automation), steps,
    });
  }
  return { cases, columns: cols };
}

const STOP = new Set("a an the and or of to in on for with is are be by as at from that this it user should verify check ensure test case when then given".split(" "));
export const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// A trailing plural `s` is dropped so "line" and "lines" count as one word; "status" keeps it.
const stem = (t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us") ? t.slice(0, -1) : t);
const tokens = (c) => new Set(norm(`${c.title} ${c.steps.map((s) => s.action).join(" ")}`).split(" ").filter((t) => t.length > 1 && !STOP.has(t)).map(stem));
const jaccard = (a, b) => { let n = 0; for (const t of a) if (b.has(t)) n++; return n / (a.size + b.size - n || 1); };

/** Quality flags a case carries as exported — what a reviewer would have to fix before trusting it. */
export function flagsOf(c, hasExpectedColumn) {
  const f = [];
  if (!c.title) f.push("no-title");
  if (!c.steps.length) f.push("no-steps");
  else if (hasExpectedColumn && c.steps.some((s) => !s.expected)) f.push("step-without-expected");
  const vague = c.steps.map((s) => s.expected && vagueExpected(s.expected)).find(Boolean);
  if (vague) f.push(`vague-expected:${vague}`);
  return f;
}

/** Exact duplicates (same title and steps after normalising) and near-duplicates (token Jaccard ≥ NEAR). */
export function findDuplicates(cases) {
  const exact = new Map();
  for (const c of cases) {
    const key = createHash("sha1").update(norm(c.title) + "|" + c.steps.map((s) => norm(`${s.action} ${s.expected}`)).join("|")).digest("hex");
    if (exact.has(key)) c.dupOf = exact.get(key).id;
    else exact.set(key, c);
  }
  const near = [];
  const live = cases.filter((c) => !c.dupOf);
  const buckets = live.length <= PAIRWISE_MAX ? [live] : [...Map.groupBy(live, (c) => norm(c.module)).values()];
  for (const b of buckets) {
    const toks = b.map(tokens);
    for (let i = 0; i < b.length; i++)
      for (let j = i + 1; j < b.length; j++) {
        if (toks[i].size < 3 || toks[j].size < 3) continue;
        const s = jaccard(toks[i], toks[j]);
        if (s >= NEAR) near.push({ a: b[i].id, b: b[j].id, score: Math.round(s * 100) / 100 });
      }
  }
  return { exact: cases.filter((c) => c.dupOf).map((c) => ({ id: c.id, dupOf: c.dupOf })), near };
}

const SCRIPT_RE = /(\.(spec|test|cy|e2e)\.[cm]?[jt]sx?|_test\.py|^test_.*\.py|Test\.java|Tests?\.cs|\.feature|\.robot)$/i;
function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (SCRIPT_RE.test(name)) yield p;
  }
}
// Test names as frameworks write them: test('…'), it("…"), Scenario: …, def test_…, void …Test().
const NAME_RES = [/\b(?:test|it|scenario)\s*\(\s*(['"`])(.+?)\1/gi, /^\s*Scenario(?: Outline)?:\s*(.+)$/gim, /\bdef\s+test_(\w+)/g, /\b(?:void|public\s+void)\s+(\w+)\s*\(/g];

/**
 * Which script references which case. A key (`PROJ-123`) or TestRail `C123` matches by itself; a bare
 * number only next to a word that says it is a case id, because an ADO id alone collides with
 * every line number and port. A test whose name equals a case title after normalising also links.
 */
export function linkScripts(cases, scriptFiles, readText = (p) => readFileSync(p, "utf8")) {
  const byId = new Map(cases.filter((c) => c.idFromSource).map((c) => [c.id.toUpperCase(), c]));
  const byTitle = new Map(cases.filter((c) => c.title).map((c) => [norm(c.title), c]));
  const orphans = [];
  for (const f of scriptFiles) {
    const text = readText(f);
    const hit = new Set();
    for (const m of text.matchAll(/\b([A-Z][A-Z0-9]+-\d+)\b/g)) if (byId.has(m[1])) hit.add(byId.get(m[1]));
    for (const m of text.matchAll(/\bC(\d+)\b/g)) { const c = byId.get(`C${m[1]}`) ?? byId.get(m[1]); if (c) hit.add(c); }
    for (const m of text.matchAll(/(?:@tms:|\btms\b|test ?case|work ?item|\btc|\bcase)[\s:#=_-]{0,3}(\d{2,})\b/gi)) if (byId.has(m[1])) hit.add(byId.get(m[1]));
    for (const re of NAME_RES)
      for (const m of text.matchAll(re)) {
        const c = byTitle.get(norm((m[2] ?? m[1]).replace(/_/g, " ")));
        if (c) hit.add(c);
      }
    if (!hit.size) orphans.push(f);
    for (const c of hit) (c.scripts ??= []).push(f);
  }
  return { orphans };
}

const pct = (n, d) => (d ? `${Math.round((n / d) * 100)} %` : "—");

/** The import report (CONTRACTS §29): fixed headings in order. */
export function renderReport({ date, sources, cases, dups, orphans, scriptCount, scriptRoots }) {
  const live = cases.filter((c) => !c.dupOf);
  const linked = live.filter((c) => c.scripts?.length);
  const flagged = live.filter((c) => c.flags.length);
  const byModule = Map.groupBy(live, (c) => c.module || "(no module)");
  const L = [
    "---", `date: ${date}`, `sources: [${sources.map((s) => s.name).join(", ")}]`, `cases: ${cases.length}`,
    `exact_duplicates: ${dups.exact.length}`, `near_duplicates: ${dups.near.length}`,
    `linked_to_script: ${scriptRoots.length ? linked.length : "not measured"}`, `orphan_scripts: ${scriptRoots.length ? orphans.length : "not measured"}`, "---", "",
    `# Imported suite — ${date}`, "",
    "<!-- Generated by `npm run qa:import`. Read-only over the sources; re-run it, never edit by hand. -->", "",
    "## Summary", "",
    `- ${cases.length} cases read from ${sources.length} source(s); ${dups.exact.length} exact duplicates, ${dups.near.length} near-duplicate pairs (≥ ${NEAR}).`,
    `- ${flagged.length} of ${live.length} unique cases (${pct(flagged.length, live.length)}) need a fix before they can be trusted (see Step quality).`,
    scriptRoots.length
      ? `- ${linked.length} of ${live.length} unique cases (${pct(linked.length, live.length)}) are referenced by a script; ${orphans.length} of ${scriptCount} scripts reference no case.`
      : "- Automation not measured: pass `--scripts <dir>` to link existing test scripts to cases.",
    "", "## By source", "", "| Source | File | Cases | Columns found | Columns missing |", "|---|---|---|---|---|",
    ...sources.map((s) => `| ${s.name} | \`${s.file}\` | ${s.count} | ${Object.entries(s.columns).filter(([, v]) => v).map(([k]) => k).join(", ") || "—"} | ${Object.entries(s.columns).filter(([, v]) => !v).map(([k]) => k).join(", ") || "—"} |`),
    "", "## By module", "", "| Module | Cases | Linked to a script | Flagged |", "|---|---|---|---|",
    ...[...byModule].sort((a, b) => b[1].length - a[1].length).map(([m, cs]) => `| ${m} | ${cs.length} | ${scriptRoots.length ? cs.filter((c) => c.scripts?.length).length : "—"} | ${cs.filter((c) => c.flags.length).length} |`),
    "", "## Duplicates", "",
    dups.exact.length || dups.near.length ? "| Case | Same as | Kind |\n|---|---|---|" : "- none",
    ...dups.exact.map((d) => `| ${d.id} | ${d.dupOf} | exact |`),
    ...dups.near.map((d) => `| ${d.a} | ${d.b} | near (${d.score}) |`),
    "", "## Step quality", "",
    flagged.length ? "| Case | Module | Flags |\n|---|---|---|" : "- none",
    ...flagged.map((c) => `| ${c.id} | ${c.module || "—"} | ${c.flags.join(", ")} |`),
    "", "## Automation links", "",
    !scriptRoots.length ? "- not measured" : linked.length ? "| Case | Scripts |\n|---|---|" : "- no script references a case",
    ...(scriptRoots.length ? linked.map((c) => `| ${c.id} | ${c.scripts.map((s) => `\`${s}\``).join(" · ")} |`) : []),
    "", "## Orphan scripts", "",
    !scriptRoots.length ? "- not measured" : orphans.length ? orphans.map((o) => `- \`${o}\``).join("\n") : "- none",
    "", "## Next steps", "",
    "1. Settle the duplicates with the case owners: keep one, retire the rest in the source tool.",
    "2. Run `/qa-regression` and `/qa-flaky` on the linked scripts before adding any case.",
    "3. When a feature touches a module, `/qa-design` promotes that module's imported cases into `cases/` (CONTRACTS §29) and designs only the gaps.",
    "",
  ];
  return L.join("\n");
}

export function run(argv, cwd = process.cwd()) {
  const sourcesArg = [], scriptRoots = [];
  let out = null, json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--source") sourcesArg.push(argv[++i]);
    else if (argv[i] === "--scripts") scriptRoots.push(argv[++i]);
    else if (argv[i] === "--out") out = argv[++i];
    else if (argv[i] === "--json") json = true;
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!sourcesArg.length) throw new Error("no --source <name>=<file> — export the cases from each tool as CSV or JSON first");
  const date = process.env.QA_LINT_TODAY ?? new Date().toISOString().slice(0, 10);
  const sources = [], cases = [];
  for (const s of sourcesArg) {
    const m = /^([a-z0-9][a-z0-9-]*)=(.+)$/.exec(s ?? "");
    if (!m) throw new Error(`--source ${s}: write <name>=<file>, name in lowercase-kebab (jira, testrail, excel-billing)`);
    const file = join(cwd, m[2]);
    if (!existsSync(file)) throw new Error(`--source ${m[1]}: ${m[2]} does not exist`);
    const { cases: cs, columns } = toCases(m[1], readRecords(file));
    if (!columns.title && !columns.id) throw new Error(`--source ${m[1]}: no id or title column found — rename a header to one of: ${[...ALIASES.id, ...ALIASES.title].join(", ")}`);
    for (const c of cs) c.flags = flagsOf(c, Boolean(columns.expected));
    sources.push({ name: m[1], file: m[2].replace(/\\/g, "/"), count: cs.length, columns });
    cases.push(...cs);
  }
  const dups = findDuplicates(cases);
  const scriptFiles = scriptRoots.flatMap((r) => [...walk(join(cwd, r))]);
  const { orphans } = linkScripts(cases, scriptFiles);
  const rel = (p) => relative(cwd, p).replace(/\\/g, "/");
  // A script that names a duplicate tests the case that is kept: report it there, once.
  const byId = new Map(cases.map((c) => [c.id, c]));
  for (const c of cases) if (c.dupOf && c.scripts) { const k = byId.get(c.dupOf); k.scripts = [...new Set([...(k.scripts ?? []), ...c.scripts])]; }
  for (const c of cases) if (c.scripts) c.scripts = c.scripts.map(rel);
  mkdirSync(join(cwd, "imported"), { recursive: true });
  writeFileSync(join(cwd, "imported", "inventory.jsonl"), cases.map((c) => JSON.stringify(c)).join("\n") + "\n");
  const report = renderReport({ date, sources, cases, dups, orphans: orphans.map(rel), scriptCount: scriptFiles.length, scriptRoots });
  const target = join(cwd, out ?? `reports/import/${date}-import.md`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, report);
  const summary = { cases: cases.length, exact: dups.exact.length, near: dups.near.length, flagged: cases.filter((c) => !c.dupOf && c.flags.length).length, linked: cases.filter((c) => !c.dupOf && c.scripts?.length).length, orphans: orphans.length, report: rel(target) };
  return json ? JSON.stringify(summary) : `import: ${summary.cases} cases · ${summary.exact} exact + ${summary.near} near duplicates · ${summary.flagged} flagged · ${summary.linked} linked to a script · ${summary.orphans} orphan scripts → ${summary.report}`;
}

const isMain = process.argv[1] && /(^|\/)import-suite\.mjs$/.test(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  trackRun(import.meta.url);
  try { console.log(run(process.argv.slice(2))); }
  catch (e) { console.error(`import: ${e.message}`); process.exit(2); }
}
