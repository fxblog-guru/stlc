#!/usr/bin/env node
// coverage-map.mjs — how much of the application under test the suite covers (CONTRACTS §22). Read-only.
// Run from the QA root (.stlc/ or qa/):  npm run qa:coverage [-- <slug>…] [--spec <openapi>] [--out <file>] [--strict] [--json]
//
// Every number is covered / total over a surface the application exposes, and names the file each
// side was read from. A surface whose denominator cannot be found is `not measurable` with the file
// that would make it measurable, never 0 % and never 100 %:
//   requirements    REQ ids in the analysis registers                → cases in the traceability tables
//   req × type      the analysis §5 REQ × type matrix (✅ cells)      → a case of that type for that REQ
//   acceptance      AC ids in the analysis AC registers              → the plan's ## AC coverage rows
//   api             OpenAPI operations (PROJECT-PROFILE · OPENAPI_SPEC · docs/openapi.yaml)
//                   → api / integration / security / performance cases whose title subject names it
//   screens         pages in docs/element-registry.md                → e2e / ui / accessibility case titles
//   business rules  BR pages in wiki/compiled/                        → `## Grounding` citations
//   risks           analysis §6 risks                                 → a case for every REQ the risk names
//   automation      designed, not @manual                            → Scripted ✅ (P0/P1 and all)
//   execution       scripted                                         → a run recorded · passing
//   unit code       runs/unit/<slug>/<run>/coverage-summary.md        (transcribed, never recomputed)
// Writes reports/coverage/YYYY-MM-DD-coverage.md (or --out). Exit 0, or 1 with --strict when a
// requirement has no case or a High risk is uncovered.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createRequire } from "node:module";
import { section, normalise } from "./lib/case-quality.mjs";
import { loadCases } from "./lib/run-plan-model.mjs";
import { trackRun } from './lib/runlog.mjs';
import { TYPES } from './lib/types.mjs';

trackRun(import.meta.url);

const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const flag = (n) => args.includes(n);
const slugsWanted = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--spec", "--out"].includes(args[i - 1])));
const TODAY = process.env.QA_LINT_TODAY ?? new Date().toISOString().slice(0, 10);

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name).replace(/\\/g, "/");
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}
const read = (p) => normalise(readFileSync(p, "utf8"));
const dirs = (d) => (existsSync(d) ? readdirSync(d).filter((n) => !n.startsWith("_") && statSync(join(d, n)).isDirectory()).sort() : []);
const latest = (d, re) => (existsSync(d) ? readdirSync(d).filter((n) => re.test(n)).sort().at(-1) ?? null : null);
const cells = (l) => l.trim().split("|").slice(1, -1).map((c) => c.trim());
/** Rows of the first table whose header starts with `head` (a prefix, so templates may add columns). */
function tableAfter(text, head, from = 0) {
  const lines = text.slice(from).split("\n");
  const i = lines.findIndex((l) => l.trim().startsWith(head));
  if (i < 0) return null;
  const out = [];
  for (const l of lines.slice(i + 1)) {
    if (!l.trim().startsWith("|")) break;
    const c = cells(l);
    if (c.every((x) => /^:?-+:?$/.test(x))) continue;
    out.push(c);
  }
  return out;
}

// ── inputs ──────────────────────────────────────────────────────────────────
const slugs = (slugsWanted.length ? slugsWanted : [...new Set([...dirs("plans"), ...dirs("analysis")])]).sort();
const allCases = loadCases(".");
const caseText = new Map([...allCases.values()].map((c) => [c.id, read(c.path)]));
const titleOf = (id) => (/^#\s+TC-\S+ — (.+?)\s*$/m.exec(caseText.get(id) ?? "")?.[1] ?? "");
/** `[Module · Platform] <subject> — <actor> …` → the subject (a screen, `METHOD /path`, an operationId). */
const subjectOf = (id) => (/^\[[^\]]+\]\s+(.+?)\s+—\s/.exec(titleOf(id))?.[1] ?? "").trim();

const sources = [];
const REQS = new Map(); // `${slug}/${REQ}` → { slug, req, statement, priority }
const ACS = new Map(); // `${slug}/${AC}` → { slug, ac, req }
const MATRIX = new Map(); // `${slug}/${REQ}` → Set(type) the analysis marks applicable
const RISKS = []; // { slug, id, level, reqs[] }
const TRACE = []; // { slug, req, caseId, type, priority, scripted, lastRun, status }
const ACROWS = new Map(); // `${slug}/${AC}` → case ids listed in the plan's ## AC coverage

for (const slug of slugs) {
  const an = latest(join("analysis", slug), /^\d{4}-\d{2}-\d{2}-analysis\.md$/);
  if (an) {
    const p = `analysis/${slug}/${an}`, t = read(p);
    sources.push(p);
    for (const c of tableAfter(t, "| REQ | Requirement") ?? []) if (/^REQ-\d{3,}$/.test(c[0])) REQS.set(`${slug}/${c[0]}`, { slug, req: c[0], statement: c[1], priority: null });
    for (const c of tableAfter(t, "| AC | REQ |") ?? []) if (/^AC-\d{3,}$/.test(c[0])) ACS.set(`${slug}/${c[0]}`, { slug, ac: c[0], req: c[1] });
    const m = tableAfter(t, "| REQ | unit | api |");
    if (m) {
      const head = cells(t.split("\n").find((l) => l.trim().startsWith("| REQ | unit | api |")));
      for (const c of m) if (/^REQ-\d{3,}$/.test(c[0])) MATRIX.set(`${slug}/${c[0]}`, new Set(head.slice(1).filter((h, i) => TYPES.includes(h) && /✅|⚠/.test(c[i + 1] ?? ""))));
    }
    for (const c of tableAfter(t, "| Risk | Description | REQs |") ?? []) if (/^R-\d{3,}$/.test(c[0])) RISKS.push({ slug, id: c[0], desc: c[1], level: c[6], reqs: (c[2].match(/REQ-\d{3,}/g) ?? []) });
  }
  const pl = latest(join("plans", slug), /^\d{4}-\d{2}-\d{2}-test-plan\.md$/);
  if (pl) {
    const p = `plans/${slug}/${pl}`, t = read(p);
    sources.push(p);
    const at = t.indexOf("## Traceability (Requirement ↔ Case)");
    for (const c of (at >= 0 ? tableAfter(t, "| Req | Case ID |", at) : null) ?? []) {
      if (c.length !== 9 || !/^TC-/.test(c[1])) continue;
      TRACE.push({ slug, req: c[0], caseId: c[1], type: c[2], priority: c[4], scripted: c[5].includes("✅"), lastRun: c[6], status: c[7] });
    }
    const ai = t.indexOf("## AC coverage");
    for (const c of (ai >= 0 ? tableAfter(t, "| AC | REQ | Case IDs |", ai) : null) ?? []) ACROWS.set(`${slug}/${c[0]}`, (c[2].match(/TC-[A-Z0-9]+-[A-Z0-9-]+?-\d{3}/g) ?? []));
  }
}
// A REQ's priority is its highest-priority traceability row (as qa:score reads it).
for (const r of TRACE) {
  const k = `${r.slug}/${r.req}`;
  if (!REQS.has(k) && /^REQ-\d{3,}$/.test(r.req)) REQS.set(k, { slug: r.slug, req: r.req, statement: "(in the plan, not in the analysis register)", priority: null, planOnly: true });
  const q = REQS.get(k);
  if (q && /^P[0-3]$/.test(r.priority) && (!q.priority || r.priority < q.priority)) q.priority = r.priority;
}
const rowsOf = (slug, req) => TRACE.filter((r) => r.slug === slug && r.req === req && !(allCases.get(r.caseId)?.deprecated));

// OpenAPI operations
function findSpec() {
  if (opt("--spec")) return opt("--spec");
  if (process.env.OPENAPI_SPEC && existsSync(process.env.OPENAPI_SPEC)) return process.env.OPENAPI_SPEC;
  for (const f of [".env.uat", ".env.qa", ".env"]) {
    const m = existsSync(f) ? /^OPENAPI_SPEC=(.+)$/m.exec(read(f)) : null;
    if (m && existsSync(m[1].trim())) return m[1].trim();
  }
  return ["docs/openapi.yaml", "docs/openapi.yml", "docs/openapi.json"].find(existsSync) ?? null;
}
const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];
function loadOps(p) {
  const text = read(p);
  let doc = null;
  if (p.endsWith(".json")) doc = JSON.parse(text);
  else {
    try { doc = createRequire(join(process.cwd(), "package.json"))("yaml").parse(text); } catch { doc = null; }
  }
  const ops = [];
  if (doc?.paths) {
    for (const [path, item] of Object.entries(doc.paths)) for (const m of METHODS) if (item?.[m]) ops.push({ method: m.toUpperCase(), path, opId: item[m].operationId ?? null });
    return ops;
  }
  // No YAML parser installed (lint runs before npm install): read the common block layout.
  let inPaths = false, path = null, op = null;
  for (const l of text.split("\n")) {
    if (/^paths:\s*$/.test(l)) { inPaths = true; continue; }
    if (inPaths && /^\S/.test(l)) inPaths = false;
    if (!inPaths) continue;
    let m;
    if ((m = /^ {2}(\/\S*):\s*$/.exec(l))) path = m[1].replace(/^['"]|['"]$/g, "");
    else if ((m = /^ {4}([a-z]+):\s*$/.exec(l)) && METHODS.includes(m[1]) && path) { op = { method: m[1].toUpperCase(), path, opId: null }; ops.push(op); }
    else if ((m = /^ {6}operationId:\s*(\S+)/.exec(l)) && op) op.opId = m[1].replace(/^['"]|['"]$/g, "");
  }
  return ops;
}
const normPath = (s) => s.replace(/\{[^}]+\}|:[A-Za-z_]\w*/g, "{}").replace(/\/+$/, "") || "/";
const specPath = findSpec();
const OPS = specPath ? loadOps(specPath) : null;
if (specPath) sources.push(specPath);

// Screens: one `## <Page> (`<route>`)` block per page in the element registry.
const REG = "docs/element-registry.md";
const SCREENS = existsSync(REG)
  ? [...read(REG).matchAll(/^## (.+?)(?:\s+\(`([^`]*)`\))?\s*$/gm)].map((m) => ({ name: m[1].trim(), route: m[2] ?? null })).filter((s) => !/[<>]/.test(s.name))
  : [];
if (SCREENS.length) sources.push(REG);
const normName = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Business rules: the compiled wiki's atomic BR pages.
const BRS = [...walk("wiki/compiled")].map((f) => /\/br-(\d{3,})-[^/]*\.md$/.exec(f)).filter(Boolean).map((m) => `BR-${m[1]}`);
const BR_PAGES = new Map([...walk("wiki/compiled")].filter((f) => /\/br-\d{3,}-/.test(f)).map((f) => [`BR-${/\/br-(\d{3,})-/.exec(f)[1]}`, f]));

// ── measure ─────────────────────────────────────────────────────────────────
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
const dims = [];
function dim(key, name, covered, total, from, target, gaps, note) { dims.push({ key, name, covered, total, pct: total ? pct(covered, total) : null, from, target, gaps: gaps ?? [], note: note ?? null }); }

// 1. requirements
{
  const reqs = [...REQS.values()];
  const un = reqs.filter((r) => rowsOf(r.slug, r.req).length === 0);
  dim("requirements", "Requirements with ≥1 case", reqs.length - un.length, reqs.length, "analysis REQ registers + plans", 100,
    // A requirement with no case has no traceability row, so no priority of its own: it is always High.
    un.map((r) => ({ sev: "High", where: `${r.slug}/${r.req}`, what: `no case — ${r.statement}`, fix: `/qa-design ${r.slug}` })));
}
// 2. REQ × type
{
  let applicable = 0, done = 0; const gaps = [];
  for (const [k, set] of MATRIX) {
    const [slug, req] = k.split("/");
    const have = new Set(rowsOf(slug, req).map((r) => r.type));
    for (const t of set) { applicable++; if (have.has(t)) done++; else gaps.push({ sev: "Medium", where: k, what: `the analysis marks ${t} applicable; no ${t} case`, fix: `/qa-design ${slug} --type ${t}` }); }
  }
  dim("req-type", "REQ × type cells the analysis marks applicable", done, applicable, "analysis §5 REQ × type matrix", 100, gaps,
    MATRIX.size ? null : "no analysis carries the §5 `| REQ | unit | api | …` matrix — /qa-analyze writes it");
}
// 3. acceptance criteria
{
  const acs = [...ACS.values()];
  const un = acs.filter((a) => !(ACROWS.get(`${a.slug}/${a.ac}`) ?? []).length);
  dim("ac", "Acceptance criteria with ≥1 case", acs.length - un.length, acs.length, "analysis AC registers + plan ## AC coverage", 100,
    un.map((a) => ({ sev: "Medium", where: `${a.slug}/${a.ac}`, what: `${a.req}: no case lists it in ## AC coverage`, fix: `/qa-design ${a.slug}` })));
}
// 4. API operations, per type that tests the HTTP surface
const API_TYPES = ["api", "integration", "security", "performance"];
const opCases = new Map(); // `${METHOD} ${normPath}` → Map(type → [ids])
if (OPS) {
  const byOpId = new Map(OPS.filter((o) => o.opId).map((o) => [o.opId, o]));
  for (const c of allCases.values()) {
    if (!API_TYPES.includes(c.type) || c.deprecated) continue;
    const s = subjectOf(c.id);
    const m = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) (\/\S*)$/.exec(s);
    const op = m ? OPS.find((o) => o.method === m[1] && normPath(o.path) === normPath(m[2])) : byOpId.get(s);
    const keys = s === "every OpenAPI operation" ? OPS.map((o) => `${o.method} ${normPath(o.path)}`) : op ? [`${op.method} ${normPath(op.path)}`] : [];
    for (const k of keys) { const e = opCases.get(k) ?? new Map(); e.set(c.type, (e.get(c.type) ?? []).concat(c.id)); opCases.set(k, e); }
  }
}
const opKey = (o) => `${o.method} ${normPath(o.path)}`;
{
  const has = (o, t) => (opCases.get(opKey(o))?.get(t) ?? []).length > 0;
  const total = OPS?.length ?? 0;
  const notMeasurable = OPS ? null : "no OpenAPI spec — set PROJECT-PROFILE §Application under test → OpenAPI spec, OPENAPI_SPEC in .env.<env>, or put it at <qa-root>/docs/openapi.yaml";
  dim("api", "API operations with an api case", OPS ? OPS.filter((o) => has(o, "api")).length : 0, total, specPath ?? "—", 100,
    (OPS ?? []).filter((o) => !has(o, "api")).map((o) => ({ sev: o.method === "GET" ? "Medium" : "High", where: `${o.method} ${o.path}`, what: `no api case${o.opId ? ` (${o.opId})` : ""}`, fix: "/qa-design <slug> --type api" })), notMeasurable);
  dim("api-authz", "API operations with an authz (security) case", OPS ? OPS.filter((o) => has(o, "security")).length : 0, total, specPath ?? "—", 80,
    (OPS ?? []).filter((o) => o.method !== "GET" && !has(o, "security")).map((o) => ({ sev: "Medium", where: `${o.method} ${o.path}`, what: "a writing operation with no authz case", fix: "/qa-design <slug> --type security" })), notMeasurable);
}
// 5. screens, per type that tests the UI surface
const UI_TYPES = ["e2e", "ui", "accessibility"];
const screenCases = new Map(); // normName → Map(type → [ids])
const strays = []; // case subjects no registry page matches
for (const c of allCases.values()) {
  if (!UI_TYPES.includes(c.type) || c.deprecated) continue;
  const s = subjectOf(c.id);
  if (!s) continue;
  const hit = SCREENS.find((x) => normName(x.name) === normName(s) || (x.route && s.includes(x.route)));
  if (!hit) { strays.push({ id: c.id, subject: s }); continue; }
  const e = screenCases.get(normName(hit.name)) ?? new Map(); e.set(c.type, (e.get(c.type) ?? []).concat(c.id)); screenCases.set(normName(hit.name), e);
}
{
  const has = (s, t) => (screenCases.get(normName(s.name))?.get(t) ?? []).length > 0;
  const nm = SCREENS.length ? null : `no pages in ${REG} — one \`## <Page> (\`<route>\`)\` block per screen makes this measurable`;
  dim("screens-e2e", "Screens with an e2e case", SCREENS.filter((s) => has(s, "e2e")).length, SCREENS.length, REG, 100,
    SCREENS.filter((s) => !has(s, "e2e")).map((s) => ({ sev: "Medium", where: `${s.name}${s.route ? ` (${s.route})` : ""}`, what: "no e2e case visits it", fix: "/qa-design <slug> --type e2e" })), nm);
  dim("screens-a11y", "Screens with an accessibility case", SCREENS.filter((s) => has(s, "accessibility")).length, SCREENS.length, REG, 100,
    SCREENS.filter((s) => !has(s, "accessibility")).map((s) => ({ sev: "Low", where: s.name, what: "no accessibility case", fix: "/qa-design <slug> --type accessibility" })), nm);
  dim("screens-ui", "Screens with a visual / layout (ui) case", SCREENS.filter((s) => has(s, "ui")).length, SCREENS.length, REG, 80, [], nm);
}
// 6. business rules
{
  const cited = new Map();
  for (const [id, t] of caseText) for (const m of (section(t, "Grounding") ?? "").matchAll(/^\s*-\s*(BR-\d{3,})\b/gm)) cited.set(m[1], (cited.get(m[1]) ?? []).concat(id));
  dim("rules", "Business rules cited by ≥1 case", BRS.filter((b) => cited.has(b)).length, BRS.length, "wiki/compiled/**/br-*.md + ## Grounding", 100,
    BRS.filter((b) => !cited.has(b)).map((b) => ({ sev: "High", where: b, what: `no case's ## Grounding cites it (${BR_PAGES.get(b)})`, fix: "/qa-design <slug>" })),
    BRS.length ? null : "no compiled wiki — /qa-knowledge builds wiki/compiled/ with BR-NNN pages");
}
// 7. risks
{
  const un = RISKS.filter((r) => !r.reqs.length || r.reqs.some((q) => rowsOf(r.slug, q).length === 0));
  dim("risks", "Analysed risks whose every REQ has a case", RISKS.length - un.length, RISKS.length, "analysis §6 risk assessment", 100,
    un.map((r) => ({ sev: /high/i.test(r.level) ? "High" : "Medium", where: `${r.slug}/${r.id}`, what: `${r.level} risk not covered — ${r.desc}`, fix: `/qa-design ${r.slug}` })), RISKS.length ? null : "no analysis carries a §6 risk table");
}
// 8. automation + execution, per type
const live = TRACE.filter((r) => !(allCases.get(r.caseId)?.deprecated));
const seen = new Set();
const uniqRows = live.filter((r) => (seen.has(r.caseId) ? false : seen.add(r.caseId)));
const isManual = (r) => allCases.get(r.caseId)?.manual ?? false;
{
  const auto = uniqRows.filter((r) => !isManual(r));
  const p01 = auto.filter((r) => r.priority === "P0" || r.priority === "P1");
  dim("automation", "Designed cases automated (manual excluded)", auto.filter((r) => r.scripted).length, auto.length, "traceability Scripted", 80, [], null);
  dim("automation-p01", "P0/P1 cases automated", p01.filter((r) => r.scripted).length, p01.length, "traceability Scripted", 90,
    p01.filter((r) => !r.scripted).map((r) => ({ sev: r.priority === "P0" ? "High" : "Medium", where: r.caseId, what: `${r.priority} ${r.type} case not scripted`, fix: `/qa-script ${r.slug} --type ${r.type}` })));
  const scripted = auto.filter((r) => r.scripted);
  const ran = scripted.filter((r) => /^\d{4}-\d{2}-\d{2}-\d{4}/.test(r.lastRun));
  dim("executed", "Scripted cases with a recorded run", ran.length, scripted.length, "traceability Last run", 100,
    scripted.filter((r) => !ran.includes(r)).map((r) => ({ sev: "Low", where: r.caseId, what: "scripted, never run", fix: `/qa-run ${r.slug} --type ${r.type}` })));
  dim("passing", "Run cases passing on their last run", ran.filter((r) => r.status.startsWith("✅")).length, ran.length, "traceability Status", 100,
    ran.filter((r) => !r.status.startsWith("✅")).map((r) => ({ sev: r.status.startsWith("❌") ? "High" : "Low", where: r.caseId, what: `last run ${r.status}`, fix: r.status.startsWith("❌") ? "/qa-defect or /qa-heal by triage" : "see the run's summary.md" })));
}
// 9. unit code coverage, transcribed
const unitCov = [];
for (const slug of dirs("runs/unit")) {
  const run = dirs(`runs/unit/${slug}`).filter((r) => existsSync(`runs/unit/${slug}/${r}/coverage-summary.md`)).at(-1);
  if (!run) continue;
  const p = `runs/unit/${slug}/${run}/coverage-summary.md`;
  sources.push(p);
  for (const c of tableAfter(read(p), "| Module |") ?? []) unitCov.push({ slug, run, module: c[0], line: c[2], branch: c[3], target: c[4], verdict: c[5] });
}

// per type
const perType = TYPES.map((t) => {
  const rows = uniqRows.filter((r) => r.type === t);
  const auto = rows.filter((r) => !isManual(r));
  const ran = auto.filter((r) => r.scripted && /^\d{4}-\d{2}-\d{2}-\d{4}/.test(r.lastRun));
  let surface = "—";
  if (API_TYPES.includes(t)) surface = OPS ? `${OPS.filter((o) => (opCases.get(opKey(o))?.get(t) ?? []).length).length}/${OPS.length} operations` : "no OpenAPI spec";
  if (UI_TYPES.includes(t)) surface = SCREENS.length ? `${SCREENS.filter((s) => (screenCases.get(normName(s.name))?.get(t) ?? []).length).length}/${SCREENS.length} screens` : "no registry pages";
  if (t === "unit") surface = unitCov.length ? unitCov.map((u) => `${u.module} ${u.line}% lines`).join(", ") : "no coverage-summary.md";
  return { type: t, designed: rows.length, manual: rows.length - auto.length, scripted: auto.filter((r) => r.scripted).length, auto: auto.length, ran: ran.length, pass: ran.filter((r) => r.status.startsWith("✅")).length,
    reqs: new Set(rows.map((r) => `${r.slug}/${r.req}`)).size, surface };
});

// ── report ──────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|"); // a pipe inside a cell would split the row
const bar = (p) => (p == null ? "░░░░░░░░░░" : "█".repeat(Math.round(p / 10)) + "░".repeat(10 - Math.round(p / 10)));
const verdict = (d) => (d.pct == null ? "not measurable" : d.pct >= d.target ? "meets" : "below");
const measured = dims.filter((d) => d.pct != null);
const weakest = [...measured].sort((a, b) => a.pct - b.pct)[0];
const gaps = dims.flatMap((d) => d.gaps.map((g) => ({ ...g, dim: d.name })));
const SEV = { High: 0, Medium: 1, Low: 2 };
gaps.sort((a, b) => SEV[a.sev] - SEV[b.sev]);
const blocking = gaps.filter((g) => g.sev === "High" && (g.dim.startsWith("Requirements") || g.dim.startsWith("Analysed risks")));

const md = [
  "---",
  `date: ${TODAY}`,
  `scope: [${slugs.join(", ")}]`,
  `measured: ${measured.length}`,
  `not_measurable: ${dims.length - measured.length}`,
  `below_target: ${measured.filter((d) => d.pct < d.target).length}`,
  "---",
  "",
  `# Coverage map — ${TODAY}`,
  "",
  `**Scope:** ${slugs.length ? slugs.join(", ") : "— (no plans or analyses)"}  **Cases:** ${allCases.size}  **Written by:** \`npm run qa:coverage\` (assessing-test-coverage)`,
  "",
  "## Summary",
  "",
  measured.length
    ? `${measured.filter((d) => d.pct >= d.target).length} of ${measured.length} measurable dimensions meet their target. The weakest is **${weakest.name}** at ${weakest.pct}% (${weakest.covered}/${weakest.total}). ${dims.length - measured.length} dimension(s) are not measurable until the file named below exists. ${gaps.filter((g) => g.sev === "High").length} High gap(s) are listed under Gaps.`
    : "Nothing is measurable yet: no analysis, plan, OpenAPI spec, registry or wiki was found.",
  "",
  "## Coverage by dimension",
  "",
  "| Dimension | Covered | % | | Target | Verdict | Measured from |",
  "|---|---|---|---|---|---|---|",
  ...dims.map((d) => `| ${d.name} | ${d.pct == null ? "—" : `${d.covered}/${d.total}`} | ${d.pct == null ? "—" : `${d.pct}%`} | \`${bar(d.pct)}\` | ${d.target}% | ${verdict(d)} | ${esc(d.pct == null ? d.note : d.from)} |`),
  "",
  "## Coverage by test type",
  "",
  "| Type | Designed | REQs | Automated | Run | Passing | App surface covered |",
  "|---|---|---|---|---|---|---|",
  ...perType.map((t) => `| ${t.type} | ${t.designed}${t.manual ? ` (${t.manual} manual)` : ""} | ${t.reqs} | ${t.auto ? `${t.scripted}/${t.auto} (${pct(t.scripted, t.auto)}%)` : "—"} | ${t.scripted ? `${t.ran}/${t.scripted}` : "—"} | ${t.ran ? `${t.pass}/${t.ran}` : "—"} | ${t.surface} |`),
  "",
  "## API operations",
  "",
  ...(OPS ? [
    `From \`${specPath}\`: ${OPS.length} operation(s).`,
    "",
    "| Operation | operationId | api | integration | security | performance |",
    "|---|---|---|---|---|---|",
    ...OPS.map((o) => { const e = opCases.get(opKey(o)); return `| ${o.method} ${o.path} | ${o.opId ?? "—"} | ${API_TYPES.map((t) => (e?.get(t) ?? []).join(", ") || "—").join(" | ")} |`; }),
  ] : [dims.find((d) => d.key === "api").note]),
  "",
  "## Screens",
  "",
  ...(SCREENS.length ? [
    `From \`${REG}\`: ${SCREENS.length} page(s).`,
    "",
    "| Screen | Route | e2e | ui | accessibility |",
    "|---|---|---|---|---|",
    ...SCREENS.map((s) => { const e = screenCases.get(normName(s.name)); return `| ${s.name} | ${s.route ?? "—"} | ${UI_TYPES.map((t) => (e?.get(t) ?? []).join(", ") || "—").join(" | ")} |`; }),
    ...(strays.length ? ["", `Case titles that name a screen the registry does not list (add the page, or rename the title's screen to match): ${strays.map((x) => `${x.id} "${x.subject}"`).join(" · ")}.`] : []),
  ] : [dims.find((d) => d.key === "screens-e2e").note]),
  "",
  "## Unit code coverage",
  "",
  ...(unitCov.length ? ["| Feature | Run | Module | Line % | Branch % | Target | Verdict |", "|---|---|---|---|---|---|---|", ...unitCov.map((u) => `| ${u.slug} | ${u.run} | ${u.module} | ${u.line} | ${u.branch} | ${u.target} | ${u.verdict} |`)]
    : ["No `runs/unit/<slug>/<run>/coverage-summary.md` yet — `/qa-run <slug> --type unit` writes it."]),
  "",
  "## Gaps",
  "",
  ...(gaps.length ? ["| # | Severity | Dimension | Where | Gap | Next command |", "|---|---|---|---|---|---|", ...gaps.map((g, i) => `| ${i + 1} | ${g.sev} | ${g.dim} | ${esc(g.where)} | ${esc(g.what)} | \`${g.fix}\` |`)] : ["None."]),
  "",
  "## Sources",
  "",
  ...[...new Set(sources)].map((s) => `- ${s}`),
  "",
].join("\n");

if (flag("--json")) {
  process.stdout.write(JSON.stringify({ date: TODAY, scope: slugs, dimensions: dims.map(({ gaps: g, ...d }) => ({ ...d, gaps: g.length })), types: perType, gaps }, null, 2) + "\n");
} else {
  const out = opt("--out") ?? `reports/coverage/${TODAY}-coverage.md`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, md);
  const w = Math.max(...dims.map((d) => d.name.length));
  console.log(`qa:coverage — ${slugs.length} feature(s), ${allCases.size} case(s)`);
  for (const d of dims) console.log(`  ${d.name.padEnd(w)}  ${bar(d.pct)}  ${d.pct == null ? "not measurable" : `${String(d.pct).padStart(5)}%  ${d.covered}/${d.total}`}${d.pct != null && d.pct < d.target ? `  below ${d.target}%` : ""}`);
  console.log(`  ${gaps.length} gap(s): ${gaps.filter((g) => g.sev === "High").length} High · ${gaps.filter((g) => g.sev === "Medium").length} Medium · ${gaps.filter((g) => g.sev === "Low").length} Low`);
  console.log(`✓ Wrote ${out}`);
}
process.exit(flag("--strict") && blocking.length ? 1 : 0);
