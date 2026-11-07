#!/usr/bin/env node
// lint-qa.mjs — mechanical enforcement of CONTRACTS.md (.claude/CONTRACTS.md).
// Read-only. Run from the QA root (.stlc/ or qa/):  npm run qa:lint     Exit 1 on errors, 0 on clean/warnings.
// Sections mirror CONTRACTS: §3 traceability · §7 cases (+ type sections) · §2 script mirror ·
// §13 defects + ESCAPES ledger · §10 impact map · §11 unit + §15 mobile handoff, coverage and
// device matrix · §12 quarantine · §14 exploratory sheets · §7 findings tables · §16 reports and
// sign-offs · §17 the derived state.json · §19 run plans · §20 platforms (header, tags, title, profile).
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import {
  section, isBlank, parseTechnique, parseSteps, table, vagueExpected, dataTokens, definedDataTokens,
  parseAcLine, TECHNIQUES, VARIANTS_COLUMNS,
} from "./lib/case-quality.mjs";
import {
  parsePlatformLine, platformTags, platformLabel, defaultPlatforms, typePlatformProblem, readPlatformProfile, PLATFORM_TAG_RE,
} from "./lib/platforms.mjs";
import { flowProblems, caseStepCount, FLOW_FILE_RE } from "./lib/maestro.mjs";
import { dataCaseProblems } from "./lib/data-case.mjs";
import { hasRootPrefix, rootPrefix, stripRoot } from "./lib/root.mjs";
import { trackRun } from './lib/runlog.mjs';
import { attributionProblems, defectGuardProblems, emptySteps, swallowedReads, targetGate } from './lib/integrity.mjs';
import { TABLE_HEADING as TARGET_HEADING, declarationErrors as targetDeclarationErrors, targetRows } from './lib/target.mjs';
import { TYPE_STEM, STEM_TYPE, STEM_ALT, TYPE_SECTIONS, NEVER_QUARANTINED, TYPE_TAG_RE, AGENT_OF } from './lib/types.mjs';
import { SIZING_SINCE, parseSizing, readBudget, sizingProblems, spawnsSince } from './lib/sizing.mjs';
import { CHECKS, DEPLOY_SINCE, caseChecks, declaredImpact, deployRequirements, missingChecks } from './lib/deploy-impact.mjs';

trackRun(import.meta.url);

// lint-qa runs from inside the QA root; its folder name is the prefix messages and records use (§2).
const ROOT_NAME = rootPrefix(process.cwd());

const errors = [];
const warnings = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warnings.push(`${f}: ${m}`);

// QA_LINT_TODAY=YYYY-MM-DD makes expiry checks deterministic (fixtures / CI).
const TODAY = /^\d{4}-\d{2}-\d{2}$/.test(process.env.QA_LINT_TODAY ?? "")
  ? process.env.QA_LINT_TODAY
  : new Date().toISOString().slice(0, 10);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

const REVERIFY_RE = /^re-verify:([a-z0-9][a-z0-9-]*)$/; // CONTRACTS §3 — a baseline case the new slug re-runs
// CONTRACTS §3 Status vocabulary: run result, blocked with its reason, deprecated, or not run.
const STATUS_RE = /^(✅|❌|⛔|⊘ deprecated|—|$)/;
const TRACE_HEADING = "## Traceability (Requirement ↔ Case)";
const TRACE_COLUMNS =
  "| Req | Case ID | Type | Module | Priority | Scripted | Last run | Status | Report |";
const PLAN_HEADINGS = [
  "## 1. Coverage targets", "## 2. Schedule of phases", "## 3. Roles",
  "## 4. Phase entry/exit gates", "## Performance SLOs", "## Quality gates",
  TRACE_HEADING, "## AC coverage", "## Test environment", "## Suspension & resumption",
  "## Risk register", "## Approvals", "## Change log",
];
const AC_COLUMNS = "| AC | REQ | Case IDs | Status |";
const AC_REGISTER_COLUMNS = "| AC | REQ | Acceptance criterion (verbatim) | Source |";
const APPROVAL_COLUMNS = "| Role | Name | Decision | Date |";
// The test types, their id stems (CONTRACTS §1) and §7 sections come from lib/types.mjs.
const CASE_FILE_RE = new RegExp(`^TC-(${STEM_ALT})-[A-Z0-9-]+-\\d{3}-[a-z0-9][a-z0-9-]*\\.md$`);
const CASE_ID_RE = new RegExp(`^TC-(${STEM_ALT})-[A-Z0-9-]+-\\d{3}$`);
const DEF_FILE_RE = /^DEF-[a-z0-9-]+-\d{3}-[a-z0-9][a-z0-9-]*\.md$/;
const DEF_ID_RE = /^DEF-[a-z0-9-]+-\d{3}$/;
const XS_FILE_RE = /^XS-[a-z0-9-]+-\d{3}-[a-z0-9][a-z0-9-]*\.md$/;
const UNPADDED_REQ_RE = /\bREQ-\d{1,2}\b(?!\d)/;
const TMS_ID = "(\\d+|[A-Z][A-Z0-9]+-\\d+)"; // ADO work-item number or Jira key
const TAG_RES = [
  TYPE_TAG_RE, /^@[a-z0-9-]+$/, /^@P[0-3]$/, PLATFORM_TAG_RE,
  /^@smoke$/, /^@regression$/, /^@manual$/, new RegExp(`^@tms:${TMS_ID}$`),
  /^@req:[a-z0-9][a-z0-9-]*\/REQ-\d{3,}$/, /^@ac:[a-z0-9][a-z0-9-]*\/AC-\d{3,}$/, /^@deprecated:[a-z0-9][a-z0-9-]*$/,
  /^@req:REQ-\d{3,}$/, // legacy, slug-less — accepted with a warning (CONTRACTS §1)
  /^@defect:DEF-[a-z0-9-]+-\d{3}$/, /^@quarantined:\d{4}-\d{2}-\d{2}$/, /^@agentic:gen$/,
];
const UNIT_MATRIX_COLUMNS = "| Row | Given (input / state) | When (call) | Then (expected) | Technique | Guards |";
const FINDINGS_COLUMNS = "| ID | Severity | Source | Evidence | Affected REQ | Case | Status |";
const DEVICE_MATRIX_COLUMNS = "| Device | Platform | OS | Type | Cases run | Pass | Fail | Notes |";
const HANDOFF_COLUMNS = "| Case ID | Staged script | Target path | Write mode | Status | Applied | Notes |";

// Paths are yielded with forward slashes whatever the OS: every rule below splits and compares on
// "/", and a Windows checkout must lint the same way the Linux CI does.
function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name).replace(/\\/g, "/");
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}
// CRLF folded on read: a Windows checkout (core.autocrlf) must lint exactly as the Linux CI does.
const read = (p) => readFileSync(p, "utf8").replace(/\r\n?/g, "\n");
// Data rows of the table whose header line is `columns` — stops at the first non-table line.
function tableRows(text, columns) {
  if (!text.includes(columns)) return null;
  const lines = text.slice(text.indexOf(columns)).split("\n").slice(1);
  const body = [];
  for (const l of lines) { if (!/^\|/.test(l.trim())) break; body.push(l.trim()); } // the table ends at the first non-table line
  return body.filter((l) => l.replaceAll("|", "").trim() !== "" && !/^\|[-\s|]+\|$/.test(l))
    .map((row) => ({ row, cells: row.split("|").slice(1, -1).map((c) => c.trim()) }));
}

// ── 1. Test plans: headings + traceability table ────────────────────────────
const traceRows = []; // { plan, slug, req, caseId, status } — cross-checked in §2b
const planSlugs = new Set(); // slugs with at least one test plan
for (const p of walk("plans")) {
  if (!/-test-plan\.md$/.test(p)) continue;
  planSlugs.add(p.split("/")[1]);
  const t = read(p);
  for (const h of PLAN_HEADINGS)
    if (!t.includes(h)) err(p, `missing exact plan heading \`${h}\``);
  if (t.includes(TRACE_HEADING)) {
    const after = t.slice(t.indexOf(TRACE_HEADING));
    const rows = tableRows(after, TRACE_COLUMNS);
    if (!rows) err(p, `traceability column header is not byte-exact (\`${TRACE_COLUMNS}\`)`);
    for (const { row, cells } of rows ?? []) {
      if (cells.length !== 9) { err(p, `traceability row has ${cells.length} cells (need 9): ${row.slice(0, 60)}`); continue; }
      const [req, caseId, type, , priority, , , status] = cells;
      if (!/^REQ-\d{3,}$/.test(req) && !REVERIFY_RE.test(req)) err(p, `Req \`${req}\` is not zero-padded REQ-NNN or \`re-verify:<baseline-slug>\` (CONTRACTS §3)`);
      traceRows.push({ plan: p, slug: p.split("/")[1], req, caseId, status, priority });
      if (caseId && caseId !== "—" && !CASE_ID_RE.test(caseId)) err(p, `Case ID \`${caseId}\` malformed`);
      else if (caseId && caseId !== "—" && TYPE_STEM[type] && TYPE_STEM[type] !== caseId.match(CASE_ID_RE)[1])
        err(p, `${caseId}: Type column \`${type}\` disagrees with the id stem`);
      if (!caseId || caseId === "—") warn(p, `seeded/empty Case ID row for ${req} — rows are appended by designers only`);
    }
  }
}

// ── 2a. Case quality (CONTRACTS §7) — not just shape: does the case say what it proves? ─
// Header line · AC line · Objective (one sentence) · Technique (vocabulary) · Isolation
// (creates/cleans/actor) · core sections non-empty · every step has an Expected · Variants table ·
// [DATA:] token shape (definitions checked in 2b) · vague Expected wording (warnings).
const CORE_SECTIONS = ["Objective", "Technique", "Isolation", "Preconditions", "Steps", "Expected Result", "Data"];
const NO_STEPS_TYPES = new Set(["performance"]); // ## Workload + ## SLOs replace ## Steps
const ABBREV_RE = /\b(e\.g|i\.e|etc|vs|approx|incl)\./gi;
function checkCaseQuality(p, t, stem, tags) {
  const type = STEM_TYPE[stem];
  const where = (s) => `${type} case: ${s} (CONTRACTS §7)`;
  // Header line: **Type:** · **Module:** · **Priority:** — the same facts the folder and tags carry.
  const hdr = t.match(/^\*\*Type:\*\*\s*(\S+)\s+\*\*Module:\*\*\s*(\S+)\s+\*\*Priority:\*\*\s*(\S+)\s*$/m);
  if (!hdr) err(p, where("missing header line `**Type:** <type>  **Module:** <module>  **Priority:** P0–P3`"));
  else {
    const [, ht, hm, hp] = hdr;
    if (ht !== type) err(p, `**Type:** \`${ht}\` disagrees with the id stem \`${stem}\``);
    const moduleDir = p.split("/").at(-2).replace(/^_/, ""); // _<name>: a cross-module folder (CONTRACTS §7 Bug-hunting cases)
    if (hm !== moduleDir) err(p, `**Module:** \`${hm}\` disagrees with the module folder \`${moduleDir}\``);
    const pTag = tags.find((x) => /^@P[0-3]$/.test(x));
    if (!/^P[0-3]$/.test(hp)) err(p, `**Priority:** \`${hp}\` is not P0–P3`);
    else if (pTag && pTag.slice(1) !== hp) err(p, `**Priority:** ${hp} disagrees with tag ${pTag}`);
  }
  const ac = parseAcLine(t);
  if (!ac.present) err(p, where("missing `**AC:**` header line (ids from the analysis AC register, or `—`)"));
  for (const m of ac.malformed) err(p, `**AC:** \`${m}\` is not AC-NNN (or \`—\` for none)`);

  const sections = {};
  for (const name of CORE_SECTIONS) {
    if (name === "Steps" && NO_STEPS_TYPES.has(type)) continue;
    const body = section(t, name);
    sections[name] = body;
    if (body === null) err(p, where(`missing section \`## ${name}\``));
    else if (isBlank(body)) err(p, where(`section \`## ${name}\` is empty — write \`- none\` when there is genuinely nothing`));
  }

  const obj = sections.Objective;
  if (!isBlank(obj)) {
    const lines = obj.split("\n").map((l) => l.trim()).filter(Boolean);
    const sentence = lines.join(" ").replace(/^[-*]\s+/, "").replace(ABBREV_RE, "$1");
    const ends = (sentence.match(/[.!?](?=\s|$)/g) ?? []).length;
    if (lines.length > 1 || ends > 1) err(p, where("`## Objective` must be ONE sentence — one intent per case; a second intent is a second case"));
  }

  const tech = parseTechnique(sections.Technique);
  for (const u of tech.unknownTechniques) err(p, `## Technique: \`${u}\` not in ${[...TECHNIQUES.values()].join(" | ")} (CONTRACTS §7)`);
  for (const a of tech.unknownAxes) err(p, `## Technique: axis \`${a}\` not in positive | negative | boundary | authz | error-contract | journey (CONTRACTS §7)`);

  if (!isBlank(sections.Isolation)) {
    for (const k of ["creates", "cleans", "actor"])
      if (!new RegExp(`^\\s*[-*]?\\s*${k}:\\s*\\S`, "m").test(sections.Isolation))
        err(p, where(`\`## Isolation\` has no \`${k}:\` line — parallel runs need to know what the case owns`));
  }

  if (!isBlank(sections.Steps)) {
    const steps = parseSteps(sections.Steps);
    if (steps.length === 0) err(p, where("`## Steps` has no numbered step"));
    for (const s of steps) {
      if (s.expected.every((e) => e === "")) err(p, `step ${s.n} has no Expected — every step states what must be observed (CONTRACTS §7)`);
      for (const e of s.expected) {
        const v = vagueExpected(e);
        if (v) warn(p, `step ${s.n}: vague Expected \`${v}\` — state the observable value (status, field, row, text)`);
      }
    }
  }
  if (!isBlank(sections["Expected Result"])) {
    for (const l of sections["Expected Result"].split("\n").filter((x) => x.trim())) {
      const v = vagueExpected(l.replace(/^\s*[-*]\s+/, ""));
      if (v) warn(p, `## Expected Result: vague \`${v}\` — state the observable outcome`);
    }
  }

  // Bug-hunting cases (CONTRACTS §7): a model test's `## Model`, a fuzz case's opt-in line.
  const model = section(t, "Model");
  if (model !== null) {
    if (type !== "api") err(p, where("`## Model` belongs to api cases (model tests drive the API)"));
    if (!tech.techniques.includes("state-transition"))
      err(p, where("a `## Model` case uses Technique `state-transition`"));
    for (const k of ["State", "Actions", "Invariants", "Budget"])
      if (!new RegExp(`^\\s*-\\s*${k}\\b[^:\\n]*:`, "m").test(model)) err(p, where(`\`## Model\` has no \`- ${k}…:\` line`));
  }
  if (p.split("/").at(-2) === "_fuzz" && !/^\s*-\s*fuzz-allow:\s*\S/m.test(sections.Data ?? ""))
    err(p, where("a fuzz case's `## Data` has no `- fuzz-allow: <operationIds | *>` line — fuzzing is opt-in per operation"));

  const variants = section(t, "Variants");
  if (variants !== null) {
    const rows = table(variants, VARIANTS_COLUMNS);
    if (!rows) err(p, `## Variants column header is not byte-exact (\`${VARIANTS_COLUMNS}\`)`);
    for (const cells of rows ?? []) {
      if (cells.length !== 4) { err(p, `## Variants row has ${cells.length} cells (need 4)`); continue; }
      const [row, technique, , expected] = cells;
      for (const tk of technique.split(/\s*[,+]\s*/).filter(Boolean))
        if (!TECHNIQUES.has(tk.toLowerCase())) err(p, `## Variants row ${row}: Technique \`${tk}\` not in the §7 vocabulary`);
      if (isBlank(expected) || expected === "—") err(p, `## Variants row ${row}: empty Expected`);
      else {
        const v = vagueExpected(expected);
        if (v) warn(p, `## Variants row ${row}: vague Expected \`${v}\``);
      }
    }
  }

  for (const { token, valid } of dataTokens(t))
    if (!valid) err(p, `[DATA:${token}] is not \`[DATA:<entity>-<state>]\` (lowercase-kebab, CONTRACTS §7)`);
  checkGrounding(p, t, hdr?.[3] ?? null);
}

// ── 2a'. Grounding (CONTRACTS §7, §10) — the knowledge a case was built from, read BEFORE it was written.
// One source per line: `- BR-NNN — <wiki page>` · `- wiki: <page>` · `- code: <layer>:<path>#<symbol> @ <sha>` ·
// `- impact: analysis/<slug>/YYYY-MM-DD-impact.md` · `- ticket: <KEY> § <field>` · `- standard: <WCAG 2.2 1.4.3 | OWASP …>` ·
// `- profile: §<section>` (an SLO, a quality gate) · `- none — <why>`.
// A cited BR must have a compiled wiki page and a cited path must exist: a citation nobody can open
// proves nothing. Missing or empty is an error from 2.3: a case with no stated source cannot be
// reviewed for what it missed. A P0/P1 case that cites only `none` is a warning here (the reason is
// a judgement /qa-review makes) and an UNGROUNDED High finding there.
const GROUND_RE = /^\s*-\s*(BR-\d{3,}\b|wiki:|code:|impact:|ticket:|standard:|profile:|none\b)/;
let wikiBrs = null;
function knownBrs() {
  if (wikiBrs) return wikiBrs;
  wikiBrs = new Set();
  for (const f of walk("wiki/compiled")) {
    const m = /\/br-(\d{3,})-[^/]*\.md$/.exec(f);
    if (m) wikiBrs.add(`BR-${m[1]}`);
  }
  return wikiBrs;
}
function checkGrounding(p, t, prio) {
  const g = section(t, "Grounding");
  if (g === null || isBlank(g)) {
    err(p, "no `## Grounding` — cite the BR / wiki page / code / impact note this case was designed from, or `- none — <why>` (CONTRACTS §7)");
    return;
  }
  const lines = g.split("\n").filter((l) => l.trim());
  for (const l of lines) {
    if (!GROUND_RE.test(l)) { err(p, `## Grounding: \`${l.trim().slice(0, 60)}\` is not one of \`- BR-NNN — <page>\` · \`- wiki:\` · \`- code:\` · \`- impact:\` · \`- ticket:\` · \`- standard:\` · \`- profile:\` · \`- none — <why>\` (CONTRACTS §7)`); continue; }
    const br = /^\s*-\s*(BR-\d{3,})\b/.exec(l)?.[1];
    if (br && !knownBrs().has(br)) err(p, `## Grounding: ${br} has no compiled wiki page (wiki/compiled/**/br-${br.slice(3)}-*.md) — cite a rule the wiki holds, or compile it with /qa-knowledge (CONTRACTS §10)`);
    for (const ref of l.matchAll(/(?:^|\s)((?:wiki|analysis)\/[^\s,;)`]+\.md)/g))
      if (!existsSync(ref[1])) err(p, `## Grounding: \`${ref[1]}\` does not exist (paths are relative to the QA root)`);
    if (/^\s*-\s*none\b/.test(l) && !/^\s*-\s*none\s+—\s+\S/.test(l)) err(p, "## Grounding: `- none` needs its reason — `- none — <why no rule, page or code applies>`");
  }
  if (lines.every((l) => /^\s*-\s*none\b/.test(l)) && (prio === "P0" || prio === "P1"))
    warn(p, `## Grounding: a ${prio} case grounded in nothing — /qa-review fails it as UNGROUNDED (CONTRACTS §7)`);
}

// ── 2f. Case title (CONTRACTS §7 Title) — the H1 alone says module, screen/operation, scenario, outcome ─
// `# <id> — [<Module>] <Screen | Operation> — <Actor> <action> [<condition>] → <expected>`
const TITLE_BANNED = [
  [/\b(verify|check|test) that\b/i, null], [/\bensures?\b/i, "Ensure"], [/\bworks\b/i, "works"],
  [/\bproperly\b/i, "properly"], [/\bcorrectly\b/i, "correctly"], [/\bas expected\b/i, "as expected"],
  [/\betc\b\.?/i, "etc"],
];
// …or, for the bug-hunting cases (CONTRACTS §7 Bug-hunting cases): `model <name>` · `every OpenAPI operation`
const API_SUBJECT_RE = /^((GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \/\S*|[a-z][A-Za-z0-9]*|model [a-z0-9][a-z0-9 +-]*|every OpenAPI operation)$/;
const titleCase = (s) => s.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
const titlePlatforms = new Map(); // case path → platform labels in the title's `[<Module> · <Platform>]`, null when absent
/** Checks the H1 title; returns the title text after `<id> — ` (or null when there is none). */
function checkCaseTitle(p, t, stem, caseId) {
  const line = (t.match(/^#\s+TC-\S+.*$/m) ?? [])[0];
  if (!line) { err(p, "missing H1 `# <Case ID> — [<Module>] <Screen | Operation> — <Actor> <action> → <expected>` (CONTRACTS §7 Title)"); return null; }
  const m = line.match(/^#\s+TC-\S+ — (.+?)\s*$/);
  if (!m) { err(p, "H1 has no title after ` — ` (em dash) — write `# <Case ID> — [<Module>] … → <expected>` (CONTRACTS §7 Title)"); return null; }
  const title = m[1];
  const at = (s) => `title: ${s} (CONTRACTS §7 Title)`;
  const mod = title.match(/^\[([^\]]+)\]\s+(.*)$/);
  if (!mod) { err(p, at("missing `[<Module> · <Platform>]` — the title starts with the module and platform in brackets, e.g. `[Orders · Web]`")); return title; }
  const moduleDir = p.split("/").at(-2).replace(/^_/, "");
  const [modulePart, platformPart] = mod[1].split(/\s+·\s+/);
  if (titleCase(modulePart) !== titleCase(moduleDir))
    err(p, at(`\`[${modulePart}]\` disagrees with the module folder \`${moduleDir}\` — write \`[${moduleDir.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")}]\``));
  titlePlatforms.set(p, platformPart === undefined ? null : platformPart.split(/\s*,\s*/).filter(Boolean));
  const rest = mod[2];
  const sep = rest.indexOf(" — ");
  if (sep < 0) err(p, at("no ` — ` between `<Screen | Operation>` and the scenario"));
  const subject = sep < 0 ? "" : rest.slice(0, sep).trim();
  const scenario = sep < 0 ? rest : rest.slice(sep + 3);
  const type = STEM_TYPE[stem];
  if (subject && ["api", "integration", "security"].includes(type) && !API_SUBJECT_RE.test(subject) && !/· (?!API\])/.test(line))
    warn(p, at(`${type} titles name the operation as \`METHOD /path\` (e.g. \`POST /orders\`) or an operationId, not \`${subject}\``));
  let arrow = scenario.indexOf("→");
  if (arrow < 0 && scenario.includes("->")) { warn(p, at("ASCII `->` — write the arrow `→`")); arrow = scenario.indexOf("->"); }
  const expected = arrow < 0 ? "" : scenario.slice(arrow + (scenario[arrow] === "→" ? 1 : 2)).trim();
  if (arrow < 0) err(p, at("missing `→ <expected>` — the title ends with the observable outcome"));
  else if (!expected) err(p, at("`→` with no expected outcome after it"));
  if (/^(a|the) user\b/i.test(scenario.trim())) warn(p, at("actor `a user`/`the user` — name the role (Owner, Viewer, Anonymous…)"));
  for (const [re, label] of TITLE_BANNED) {
    const hit = title.match(re);
    if (hit) err(p, at(`banned wording \`${label ?? hit[0]}\` — state the scenario and the observable outcome`));
  }
  if (/\bsuccessful(ly)?\b/i.test(title) && !/[\d`"'=]/.test(expected))
    err(p, at("bare `successfully` — name the observable outcome (status, message, state, value)"));
  if (/ and /i.test(expected)) warn(p, at(`\`and\` joins two outcomes after → — one intent per case; split it`));
  if (title.length > 140) err(p, at(`${title.length} chars after the id (max 140)`));
  else if (title.length > 120) warn(p, at(`${title.length} chars after the id (keep ≤ 120)`));
  return title;
}

// ── 2g. Platform (CONTRACTS §20) — header, tags and title agree; the profile enables it; the type fits ─
// A case without `**Platform:**` is a warning through 2.0.x with the inferred default; an error from 2.1.
const PROFILE = readPlatformProfile(".");
if (PROFILE) {
  for (const prob of PROFILE.problems) err(PROFILE.path, `${prob} (CONTRACTS §20)`);
  if (PROFILE.legacy) warn(PROFILE.path, "no `## Platforms` table — §Browsers & devices is read as the `web` row (accepted for one minor version; add §Platforms, CONTRACTS §20)");
}
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
function checkCasePlatform(p, t, type, tags) {
  const line = parsePlatformLine(t);
  for (const m of line.malformed) err(p, `**Platform:** \`${m}\` is not a platform id (web, android, ios, windows, macos, api, other:<id>) (CONTRACTS §20)`);
  const tagged = platformTags(tags);
  const ids = line.ids.length ? line.ids : tagged.length ? tagged : defaultPlatforms(type);
  if (!line.present) warn(p, `no \`**Platform:**\` header — inferred \`${ids.join(", ")}\`; add \`**Platform:** ${ids.join(", ")}\` under the Type line (required from 2.1, CONTRACTS §20)`);
  else if (!line.ids.length && !line.malformed.length) err(p, "`**Platform:**` is empty — name at least one platform (CONTRACTS §20)");
  if (line.ids.length) {
    if (!tagged.length) warn(p, `no \`@platform:<id>\` tag — add ${line.ids.map((x) => `@platform:${x}`).join(" ")} after the @P tag (CONTRACTS §20)`);
    else if (!sameSet(tagged, line.ids)) err(p, `tags ${tagged.map((x) => `@platform:${x}`).join(" ")} disagree with **Platform:** ${line.ids.join(", ")} — header, tags and title agree (CONTRACTS §20)`);
  }
  const labels = titlePlatforms.get(p);
  const want = ids.map(platformLabel);
  if (labels === null) warn(p, `title: no platform in the module segment — write \`[<Module> · ${want.join(", ")}]\` (CONTRACTS §7 Title, §20)`);
  else if (labels && !sameSet(labels, want)) err(p, `title: platform \`${labels.join(", ")}\` disagrees with **Platform:** ${ids.join(", ")} — write \`· ${want.join(", ")}\` (CONTRACTS §7 Title, §20)`);
  for (const id of ids) {
    const prob = typePlatformProblem(type, id, PROFILE);
    if (prob) (prob.level === "error" ? err : warn)(p, `**Platform:** ${prob.msg} (CONTRACTS §20)`);
    if (PROFILE && !PROFILE.legacy) { // a legacy profile (no §Platforms) cannot disable a platform
      const row = PROFILE.platforms.get(id);
      if (!row) err(p, `**Platform:** \`${id}\` has no row in PROJECT-PROFILE §Platforms (CONTRACTS §20)`);
      else if (!row.enabled) err(p, `**Platform:** \`${id}\` is disabled in PROJECT-PROFILE §Platforms — enable the row or drop the platform (CONTRACTS §20)`);
    }
  }
}

// ── 2. Case files: filename, type↔folder, tags, type sections (CONTRACTS §7) ─
const cases = new Map(); // Case ID → { path, typeDir, stem, tags }
for (const p of walk("cases")) {
  if (!p.endsWith(".md") || p.includes("_template")) continue;
  const name = basename(p);
  const typeDir = p.split("/")[1];
  if (!CASE_FILE_RE.test(name)) { err(p, `filename breaks TC-<TYPE>-<MODULE>-<NNN>-<short-desc>.md (lowercase-kebab desc)`); continue; }
  const stem = name.match(CASE_FILE_RE)[1];
  const caseId = name.match(/^(TC-.+?-\d{3})-/)[1];
  if (TYPE_STEM[typeDir] && TYPE_STEM[typeDir] !== stem)
    err(p, `type folder \`${typeDir}\` vs id stem \`${stem}\` mismatch`);
  const t = read(p);
  const h1 = t.match(/^#\s+(TC-\S+)/m);
  if (h1 && !name.startsWith(h1[1] + "-")) err(p, `H1 id \`${h1[1]}\` disagrees with filename`);
  const title = checkCaseTitle(p, t, stem, caseId);
  if (!/^\*\*Feature:\*\*\s*\S/m.test(t)) err(p, "missing `**Feature:** <slug>` header — cases are located by this line, never by filename");
  const tagLine = t.match(/^\*\*Tags:\*\*\s*(.+)$/m);
  const tags = tagLine ? tagLine[1].trim().split(/\s+/) : [];
  if (!tagLine) warn(p, "no **Tags:** line");
  else {
    for (const tag of tags)
      if (!TAG_RES.some((re) => re.test(tag))) err(p, `tag \`${tag}\` not in ${ROOT_NAME}/docs/tag-taxonomy.md vocabulary`);
    const typeTag = tags.find((x) => TYPE_STEM[x.slice(1)]);
    if (typeTag && typeTag.slice(1) !== STEM_TYPE[stem]) err(p, `type tag \`${typeTag}\` disagrees with id stem \`${stem}\``);
    if (NEVER_QUARANTINED.has(stem) && tags.some((x) => x.startsWith("@quarantined:")))
      err(p, `${stem} cases are never quarantined (CONTRACTS §12) — a flaky ${stem === "UNIT" ? "unit test is a NON-DETERMINISTIC defect of the test" : "SLO is a finding"}`);
  }
  for (const h of TYPE_SECTIONS[STEM_TYPE[stem]] ?? [])
    if (!new RegExp(`^${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(t)) err(p, `${STEM_TYPE[stem]} case missing section \`${h}\` (CONTRACTS §7)`);
  // A headless browser follows the host's dark setting: a baseline that does not name its skin
  // is whichever one the CI image had, and it passes against itself forever. A warning for one
  // minor release, so a project upgrading keeps a green lint while it adds the line.
  if (stem === "UI" && t.includes("## Viewports") && !/^- skin:\s*(light|dark)\b/m.test(section(t, "Viewports") ?? ""))
    warn(p, "ui case `## Viewports` names no skin — add `- skin: light` (or `dark`); an error from the next minor release (CONTRACTS §7)");
  if (stem === "UNIT" && t.includes("## Test matrix") && !t.includes(UNIT_MATRIX_COLUMNS))
    err(p, `unit test-matrix columns are not byte-exact (\`${UNIT_MATRIX_COLUMNS}\`)`);
  if (stem === "DATA") for (const m of dataCaseProblems(t)) err(p, `data case ${m} (CONTRACTS §28)`);
  if (UNPADDED_REQ_RE.test(t)) err(p, "unpadded REQ-id (REQ-NNN is zero-padded, ≥3 digits)");
  checkCaseQuality(p, t, stem, tags);
  checkCasePlatform(p, t, STEM_TYPE[stem], tags);
  if (cases.has(caseId)) err(p, `duplicate Case ID ${caseId} — also ${cases.get(caseId).path}; two branches minted the same NNN: renumber one with \`node scripts/shared/renumber-case.mjs ${caseId} <new-id>\` (CONTRACTS §1)`);
  const feature = (t.match(/^\*\*Feature:\*\*\s*([a-z0-9][a-z0-9-]*)/m) || [])[1] ?? null;
  const priority = (t.match(/^\*\*Type:\*\*.*\*\*Priority:\*\*\s*(P[0-3])\s*$/m) ?? [])[1] ?? null;
  if (!cases.has(caseId)) cases.set(caseId, { path: p, typeDir, stem, tags, feature, text: t, title, priority });
}

// ── 2b. Ids across files: duplicates, orphans, slug refs, re-verify, deprecation (CONTRACTS §1, §3, §6) ──
// Its own section so the rules that guard a NEW slug landing on an existing suite read together.
let deprecatedCount = 0;
{
  let deprecated = 0;
  for (const [id, c] of cases) {
    if (c.feature && !planSlugs.has(c.feature)) err(c.path, `**Feature:** ${c.feature} has no test plan under plans/${c.feature}/ — every case belongs to a planned feature (CONTRACTS §3)`);
    for (const tag of c.tags) {
      if (/^@req:REQ-\d{3,}$/.test(tag)) warn(c.path, `${tag} is slug-less (legacy) — REQ numbers restart per feature; write \`@req:${c.feature ?? "<slug>"}/${tag.slice(5)}\` (CONTRACTS §1)`);
      const ref = tag.match(/^@(?:req|ac):([a-z0-9][a-z0-9-]*)\//) ?? tag.match(/^@deprecated:([a-z0-9][a-z0-9-]*)$/);
      if (ref && !planSlugs.has(ref[1])) err(c.path, `${tag} names slug \`${ref[1]}\`, which has no test plan (CONTRACTS §1)`);
    }
    const dep = c.tags.find((x) => x.startsWith("@deprecated:"));
    if (!dep) continue;
    deprecated += 1;
    for (const s of ["@smoke", "@regression"])
      if (c.tags.includes(s)) err(c.path, `${id} carries ${dep} and ${s} — a deprecated case is never in a curated suite (CONTRACTS §6)`);
    if (traceRows.some((r) => r.caseId === id && r.slug === c.feature && !r.status.startsWith("⊘ deprecated")))
      err(c.path, `${id} carries ${dep} but its row in plans/${c.feature}/ is not Status \`⊘ deprecated\` (CONTRACTS §3)`);
  }
  for (const r of traceRows) {
    if (!CASE_ID_RE.test(r.caseId ?? "")) continue;
    if (!STATUS_RE.test(r.status)) err(r.plan, `${r.caseId}: Status \`${r.status}\` not in ✅ | ❌ | ⛔ <reason> | ⊘ deprecated | — (CONTRACTS §3)`);
    const c = cases.get(r.caseId);
    if (!c) { err(r.plan, `${r.caseId}: traceability row has no case file under cases/ (manual cases have files too) — renumbered or deleted? (CONTRACTS §3)`); continue; }
    const isDep = c.tags.some((x) => x.startsWith("@deprecated:"));
    if (r.status.startsWith("⊘ deprecated") && !isDep) err(r.plan, `${r.caseId}: Status \`⊘ deprecated\` but the case carries no @deprecated:<slug> tag (CONTRACTS §3)`);
    const rv = r.req.match(REVERIFY_RE);
    if (rv) {
      if (rv[1] === r.slug) err(r.plan, `${r.caseId}: re-verify row names its own slug — a re-verify row points at a BASELINE feature's case (CONTRACTS §3)`);
      else if (c.feature !== rv[1]) err(r.plan, `${r.caseId}: \`re-verify:${rv[1]}\` but the case's **Feature:** is \`${c.feature}\` (CONTRACTS §3)`);
      if (isDep) err(r.plan, `${r.caseId}: a deprecated case cannot be in a re-verify set (CONTRACTS §3)`);
    } else if (c.feature && c.feature !== r.slug)
      warn(r.plan, `${r.caseId}: the case belongs to \`${c.feature}\` — list it here as \`re-verify:${c.feature}\`, not as this slug's own requirement row (CONTRACTS §3)`);
  }
  // Curated suite manifest(s): no deprecated or missing case holds a seat.
  for (const rp of walk("regression")) {
    if (!/(^|\/)regression-suite(\.[a-z0-9-]+)?\.md$/.test(rp)) continue;
    for (const { cells } of tableRows(read(rp), "| Case ID | Feature | Type | Tier(s) | Why selected | Last 3 runs |") ?? []) {
      if (!CASE_ID_RE.test(cells[0] ?? "")) continue;
      const c = cases.get(cells[0]);
      if (!c) err(rp, `${cells[0]}: suite row has no case file (CONTRACTS §3)`);
      else if (c.tags.some((x) => x.startsWith("@deprecated:"))) err(rp, `${cells[0]}: deprecated case in a curated suite — remove it and log why (CONTRACTS §6)`);
    }
  }
  deprecatedCount = deprecated;
}

// ── 2c'. Case priority (CONTRACTS §7 Priority) — derived from the REQ, never above it unless reasoned ──
// REQ priority = the highest `Priority hint` among the analysis §6 risk rows naming that REQ. A case
// may sit above it only with a `Priority reason:` line (authz/security denial, data integrity).
{
  const reqPrio = new Map(); // slug → Map(REQ → "P0".."P3")
  const RISK_COLUMNS = "| Risk | Description | REQs | L | I | Score | Level | Priority hint |";
  const prioOf = (slug) => {
    if (reqPrio.has(slug)) return reqPrio.get(slug);
    const map = new Map();
    const dir = `analysis/${slug}`;
    const latest = existsSync(dir) ? readdirSync(dir).filter((n) => /^\d{4}-\d{2}-\d{2}-analysis\.md$/.test(n)).sort().at(-1) : null;
    for (const { cells } of (latest && tableRows(read(`${dir}/${latest}`), RISK_COLUMNS)) || []) {
      const hint = [...(cells[7] ?? "").matchAll(/P([0-3])/g)].map((m) => `P${m[1]}`).sort()[0];
      if (!hint) continue;
      for (const req of (cells[2] ?? "").match(/REQ-\d{3,}/g) ?? [])
        if (!map.has(req) || hint < map.get(req)) map.set(req, hint);
    }
    reqPrio.set(slug, map);
    return map;
  };
  for (const [id, c] of cases) {
    if (!c.priority || !c.feature) continue;
    const reqs = c.tags.map((x) => x.match(/^@req:(?:([a-z0-9][a-z0-9-]*)\/)?(REQ-\d{3,})$/)).filter(Boolean)
      .filter((m) => !m[1] || m[1] === c.feature).map((m) => m[2]);
    const known = reqs.map((r) => prioOf(c.feature).get(r)).filter(Boolean).sort();
    if (known.length && c.priority < known[0] && !/^(\*\*)?Priority reason:(\*\*)?\s*\S/m.test(c.text))
      err(c.path, `${id}: **Priority:** ${c.priority} is above its REQ priority ${known[0]} (analysis §6 Priority hint) — lower it, or add a one-line \`Priority reason:\` (authz/security denial or data integrity only) under the header (CONTRACTS §7 Priority)`);
  }
  for (const r of traceRows) {
    const c = cases.get(r.caseId);
    if (c?.priority && /^P[0-3]$/.test(r.priority ?? "") && r.priority !== c.priority)
      err(r.plan, `${r.caseId}: traceability Priority ${r.priority} ≠ the case's **Priority:** ${c.priority} — header, @P tag and traceability row agree (CONTRACTS §7 Priority)`);
  }
}

// ── 2d. Case ↔ test data ↔ AC register (CONTRACTS §7) ───────────────────────
{
  const tdPath = "docs/test-data.md";
  const defined = existsSync(tdPath) ? definedDataTokens(read(tdPath)) : null;
  for (const [, c] of cases) {
    for (const { token, valid } of dataTokens(c.text)) {
      if (!valid) continue;
      if (!defined) err(c.path, `[DATA:${token}] used but ${tdPath} does not exist (managing-test-data writes it)`);
      else if (!defined.has(token)) err(c.path, `[DATA:${token}] is not defined in ${tdPath} — add a glossary row or fix the token`);
    }
  }
  // AC ids a case claims must exist in its feature's latest analysis AC register.
  const registers = new Map(); // slug → Map(AC → REQ) | null
  for (const [, c] of cases) {
    const ac = parseAcLine(c.text);
    if (!ac.ids.length) continue;
    const slug = (c.text.match(/^\*\*Feature:\*\*\s*(\S+)/m) ?? [])[1];
    if (!registers.has(slug)) registers.set(slug, acRegister(slug));
    const reg = registers.get(slug);
    for (const a of ac.ids) {
      if (!reg) err(c.path, `**AC:** ${a} — the latest analysis for \`${slug}\` has no AC register table`);
      else if (!reg.has(a)) err(c.path, `**AC:** ${a} is not in the AC register of ${ROOT_NAME}/analysis/${slug}/ (CONTRACTS §7)`);
    }
  }
}

/** The AC register of a slug's latest analysis: Map(AC → REQ); null when absent. */
function acRegister(slug) {
  const dir = `analysis/${slug}`;
  if (!slug || !existsSync(dir)) return null;
  const latest = readdirSync(dir).filter((n) => /^\d{4}-\d{2}-\d{2}-analysis\.md$/.test(n)).sort().at(-1);
  if (!latest) return null;
  const rows = tableRows(read(`${dir}/${latest}`), AC_REGISTER_COLUMNS);
  if (!rows) return null;
  return new Map(rows.filter((r) => r.cells.length === 4).map((r) => [r.cells[0], r.cells[1]]));
}

// ── 2e. Plans once cases exist (CONTRACTS §4 · §7) ──────────────────────────
// Headings in contract order; the planning tables are filled before design starts (a plan whose
// traceability has rows but whose gates or roles are empty was never planned); the AC coverage
// table agrees with the AC register and with the cases' `**AC:**` lines.
const AC_STATUS_RE = /^(covered|partial|not covered|deferred \(.+\))$/;
for (const p of walk("plans")) {
  if (!/-test-plan\.md$/.test(p)) continue;
  const t = read(p);
  let last = -1;
  for (const h of PLAN_HEADINGS) {
    const i = t.search(new RegExp(`^${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m"));
    if (i < 0) continue; // section 1 already reported the missing heading
    if (i < last) err(p, `plan heading \`${h}\` out of order (CONTRACTS §4 order)`);
    else last = i;
  }
  const trace = t.includes(TRACE_HEADING) ? tableRows(t.slice(t.indexOf(TRACE_HEADING)), TRACE_COLUMNS) ?? [] : [];
  if (!trace.length) continue; // an empty plan skeleton is the contract before /qa-design
  for (const h of ["## 1. Coverage targets", "## 2. Schedule of phases", "## 3. Roles", "## 4. Phase entry/exit gates", "## Quality gates", "## Approvals"]) {
    const body = section(t, h.slice(3));
    if (body === null) continue;
    const firstHeader = body.split("\n").find((l) => /^\|.*\|\s*$/.test(l.trim()));
    const rows = firstHeader ? table(body, firstHeader.trim()) : null;
    if (!rows || rows.length === 0) err(p, `\`${h}\` table is empty but the traceability table has ${trace.length} row(s) — plan before you design (CONTRACTS §4)`);
  }
  for (const h of ["## Test environment", "## Suspension & resumption", "## Risk register"]) {
    const body = section(t, h.slice(3));
    if (body !== null && isBlank(body)) err(p, `\`${h}\` is empty but the traceability table has ${trace.length} row(s) (CONTRACTS §4)`);
  }
  const acBody = section(t, "AC coverage");
  if (acBody === null) continue;
  const acRows = table(acBody, AC_COLUMNS);
  if (!acRows) { err(p, `AC coverage column header is not byte-exact (\`${AC_COLUMNS}\`)`); continue; }
  const slug = p.split("/")[1];
  const reg = acRegister(slug);
  const seen = new Set();
  for (const cells of acRows) {
    if (cells.length !== 4) { err(p, `AC coverage row has ${cells.length} cells (need 4)`); continue; }
    const [ac, req, ids, status] = cells;
    if (!/^AC-\d{3,}$/.test(ac)) { err(p, `AC coverage: \`${ac}\` is not AC-NNN`); continue; }
    if (seen.has(ac)) err(p, `AC coverage: duplicate row for ${ac}`); seen.add(ac);
    if (!/^REQ-\d{3,}$/.test(req)) err(p, `AC coverage ${ac}: REQ \`${req}\` is not REQ-NNN`);
    if (reg && !reg.has(ac)) err(p, `AC coverage: ${ac} is not in the AC register of ${ROOT_NAME}/analysis/${slug}/`);
    else if (reg && reg.get(ac) !== req) err(p, `AC coverage ${ac}: REQ ${req} ≠ register ${reg.get(ac)}`);
    if (!AC_STATUS_RE.test(status)) err(p, `AC coverage ${ac}: Status \`${status}\` not in covered | partial | not covered | deferred (<reason>)`);
    const list = ids === "—" ? [] : ids.split(",").map((s) => s.trim()).filter(Boolean);
    if ((status === "covered" || status === "partial") && list.length === 0) err(p, `AC coverage ${ac}: Status ${status} with no Case IDs`);
    for (const id of list) {
      if (!CASE_ID_RE.test(id)) { err(p, `AC coverage ${ac}: Case ID \`${id}\` malformed`); continue; }
      const c = cases.get(id);
      if (!c) err(p, `AC coverage ${ac}: ${id} has no case file`);
      else if (!parseAcLine(c.text).ids.includes(ac)) err(p, `AC coverage ${ac}: ${id} does not list ${ac} on its **AC:** line`);
    }
  }
  for (const ac of reg?.keys() ?? []) if (!seen.has(ac)) err(p, `AC coverage: register ${ac} has no row — every AC is accounted for (CONTRACTS §7)`);
}

// ── 3. Script mirror: every script has its case ────────────────────────────
// Extensions: Playwright/k6/ZAP/axe tiers + the unit tier's staged mirrors (CONTRACTS §11) + Maestro
// mobile flows (`.yaml`, CONTRACTS §15).
const SCRIPT_EXT_RE = /\.(spec\.ts|test\.ts|test\.js|js|conf|cs|py|java|kt|yaml|sql|yml)$/;
for (const p of walk("scripts")) {
  const name = basename(p);
  if (!/^TC-/.test(name) || !SCRIPT_EXT_RE.test(name)) continue;
  const caseBase = name.replace(SCRIPT_EXT_RE, ".md");
  const casePath = p.replace(/^scripts\//, "cases/").replace(name, caseBase);
  if (!existsSync(casePath)) { err(p, `no mirrored case at ${casePath}`); continue; }
  if (/\.(spec|test)\.ts$/.test(name)) checkSpecTitles(p, read(p), name.match(/^(TC-.+?-\d{3})-/)[1]);
  if (name.endsWith(".yaml")) checkFlow(p, name);
}

// ── 3b. Maestro flows mirror the case (CONTRACTS §15 Maestro · scripts/shared/maestro/README.md) ──
function checkFlow(p, name) {
  if (!p.startsWith("scripts/mobile/")) { err(p, "a `.yaml` case flow lives under scripts/mobile/ — Maestro is the mobile runner"); return; }
  if (!FLOW_FILE_RE.test(name)) { err(p, "flow filename breaks TC-MOB-<MODULE>-<NNN>-<short-desc>.yaml"); return; }
  const id = name.match(/^(TC-MOB-.+?-\d{3})-/)[1];
  const c = cases.get(id);
  const module = p.split("/")[2];
  const suites = c ? c.tags.filter((t) => /^@(smoke|regression)$/.test(t)).map((t) => t.slice(1)) : [];
  const ctx = c ? { id, title: c.title, module, priority: c.priority, suites, stepCount: caseStepCount(c.text) } : null;
  for (const pr of flowProblems(p, read(p), ctx)) (pr.level === "error" ? err : warn)(p, pr.msg);
  if (existsSync(p.replace(/\.yaml$/, ".spec.ts"))) err(p, "a case has ONE mobile script: this Maestro flow and a WebdriverIO spec mirror the same case — keep the runner §Platforms names");
}

// ── 3a. Spec titles, steps and rows mirror the case (CONTRACTS §7 Title · scripts/shared/README.md
// "Script naming & numbering") — a simple scan of `test('…')` / `test(`…`)` and `test.step('Step N…')`.
function checkSpecTitles(p, t, caseId) {
  const c = cases.get(caseId);
  const tier = p.split("/")[1];
  const playwright = !["unit", "mobile"].includes(tier);
  const variants = c ? tableRows(section(c.text, "Variants") ?? "", VARIANTS_COLUMNS) : null;
  const rowIds = new Set((variants ?? []).map((r) => r.cells[0]));
  // ROWS ids for a templated `row ${row.id}:` title — every `id: '…'` literal that is not caseMeta's case id
  const literalIds = [...t.matchAll(/\bid:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]).filter((x) => !x.startsWith("TC-"));
  const usedRows = new Set();
  // Tokens in file order: a test title opens a body (step numbering resets), a step extends it.
  const toks = [...t.matchAll(/(?<![.\w])test\(\s*(['`])((?:\\.|(?!\1)[^\\])*)\1|(?<![\w])test\.step\(\s*['"`]Step (\d+)\b/g)];
  let steps = null;
  const flush = () => {
    if (steps && steps.length) {
      const bad = steps.findIndex((n, i) => n !== i + 1);
      if (bad >= 0) err(p, `test.step numbers ${steps.join(", ")} are not 1..${steps.length} in order — Step N is the case's step number, no gaps or duplicates`);
    }
  };
  for (const m of toks) {
    if (m[3] !== undefined) { (steps ??= []).push(Number(m[3])); continue; }
    flush(); steps = [];
    const title = m[2];
    const id = (title.match(/^(TC-[A-Z0-9]+-[A-Z0-9-]+?-\d{3})\b/) ?? [])[1];
    if (!id) { if (playwright) err(p, `test title \`${title.slice(0, 50)}\` does not start with the case id ${caseId}`); continue; }
    if (id !== caseId) { err(p, `test title id ${id} ≠ case id ${caseId} — the title starts with the mirrored case's id`); continue; }
    const after = title.slice(id.length);
    const row = after.match(/ — (?:.* — )?row ([^:]+):/);
    if (row) {
      const ids = /^\$\{/.test(row[1]) ? literalIds : [row[1].trim()];
      for (const x of ids) {
        usedRows.add(x);
        if (c && !rowIds.has(x)) err(p, `row \`${x}\` is not a Row id of ${caseId}'s ## Variants table — rows are named by the case, never invented`);
      }
    } else if (c?.title && after !== ` — ${c.title}`) {
      warn(p, `test title should mirror the case title: \`${caseId} — ${c.title}\` (CONTRACTS §7 Title)`);
    }
  }
  flush();
  if (usedRows.size) for (const r of rowIds) if (!usedRows.has(r)) warn(p, `## Variants row ${r} of ${caseId} has no \`row ${r}:\` test`);
}

// ── 4. Defects: filename, lifecycle fields (CONTRACTS §13) ──────────────────
const PHASES = new Set(["ANALYZE", "PLAN", "DESIGN", "SCRIPT", "RUN", "ENV", "QUARANTINE", "OUT-OF-SCOPE"]);
const defectIds = new Set();
for (const p of walk("defects")) {
  if (!p.endsWith(".md") || basename(p) === "ESCAPES.md" || p.includes("_template")) continue;
  const name = basename(p);
  if (!DEF_FILE_RE.test(name)) { err(p, "filename breaks DEF-<slug>-NNN-<short-slug>.md"); continue; }
  defectIds.add(name.match(/^(DEF-.+?-\d{3})-/)[1]);
  const t = read(p);
  const status = (t.match(/\*\*Status:\*\*\s+(\S+)/) || [])[1];
  if (!/^(OPEN|CLOSED)$/.test(status ?? "")) { err(p, "missing **Status:** OPEN|CLOSED"); continue; }
  const origin = (t.match(/\*\*Origin:\*\*\s+(\S+)/) || [])[1];
  if (!origin) warn(p, "no **Origin:** field — treated as INTERNAL (add it: INTERNAL | ESCAPED | EXPLORATORY)");
  else if (!/^(INTERNAL|ESCAPED|EXPLORATORY)$/.test(origin)) err(p, `**Origin:** \`${origin}\` not in INTERNAL|ESCAPED|EXPLORATORY`);
  const resolution = (t.match(/\*\*Resolution:\*\*\s+([^\n]+)/) || [])[1]?.trim();
  const closed = (t.match(/\*\*Closed:\*\*\s+(\S+)/) || [])[1];
  if (status === "CLOSED") {
    if (!resolution || resolution === "—") err(p, "CLOSED defect without a **Resolution:** (fixed | not-a-bug | duplicate of DEF-… | wont-fix)");
    else if (!/^(fixed \(verified \S+\)|not-a-bug \(.+\)|duplicate of DEF-[a-z0-9-]+-\d{3}|wont-fix \(accepted by .+ on \d{4}-\d{2}-\d{2}\))/.test(resolution))
      err(p, `**Resolution:** \`${resolution}\` does not follow CONTRACTS §13 (fixed (verified <run-id>) | not-a-bug (<reason>) | duplicate of DEF-<slug>-NNN | wont-fix (accepted by <role> on YYYY-MM-DD))`);
    if (!closed || !DATE_RE.test(closed)) err(p, "CLOSED defect needs **Closed:** YYYY-MM-DD");
    if (resolution?.startsWith("fixed") && !/^## Verification\s*\n(?:.*\n)*?\s*-\s+\S+/m.test(t))
      err(p, "Resolution `fixed` requires a `## Verification` line (`- <run-id> · <env> · <Case ID> ✅ · <date>`) written by /qa-defect --verify");
  } else if (closed && closed !== "—") err(p, "OPEN defect must have **Closed:** —");
  for (const m of defectGuardProblems(t)) err(p, `${m} (CONTRACTS §31)`);
  if (origin === "ESCAPED") {
    if (!/^## Escape analysis\s*$/m.test(t)) err(p, "ESCAPED defect missing `## Escape analysis`");
    const phase = (t.match(/^### Phase missed\s*\n\s*-?\s*`?([A-Z-]+)`?/m) || [])[1];
    if (!phase) err(p, "ESCAPED defect: `### Phase missed` must start with one token of ANALYZE|PLAN|DESIGN|SCRIPT|RUN|ENV|QUARANTINE|OUT-OF-SCOPE");
    else if (!PHASES.has(phase)) err(p, `Phase missed \`${phase}\` not in ANALYZE|PLAN|DESIGN|SCRIPT|RUN|ENV|QUARANTINE|OUT-OF-SCOPE`);
    for (const h of ["### Type missed", "### Backfill"]) if (!t.includes(h)) err(p, `ESCAPED defect missing \`${h}\``);
  }
}
for (const [id, c] of cases)
  for (const tag of c.tags.filter((x) => x.startsWith("@defect:")))
    if (!defectIds.has(tag.slice(8))) warn(c.path, `${id} carries ${tag} but no defect file with that id exists under defects/`);

// ── 4b. Escaped-defect ledger (CONTRACTS §13) ───────────────────────────────
if (existsSync("defects/ESCAPES.md")) {
  const p = "defects/ESCAPES.md", t = read(p);
  const COLS = "| DEF | Feature | Reported | Phase missed | Type missed | Backfill | Status |";
  if (!/^# Escaped defects$/m.test(t)) err(p, "missing exact heading `# Escaped defects`");
  const rows = tableRows(t, COLS);
  if (!rows) err(p, `ESCAPES column header is not byte-exact (\`${COLS}\`)`);
  const seen = new Set();
  for (const { row, cells } of rows ?? []) {
    if (cells.length !== 7) { err(p, `ESCAPES row has ${cells.length} cells (need 7): ${row.slice(0, 60)}`); continue; }
    const [def, , reported, phase, type, backfill, status] = cells;
    if (!DEF_ID_RE.test(def)) err(p, `DEF \`${def}\` malformed`);
    else if (!defectIds.has(def)) err(p, `${def}: no defect file under defects/ (the ledger row and the DEF file are written together)`);
    if (seen.has(def)) err(p, `duplicate ESCAPES row for ${def}`); seen.add(def);
    if (!DATE_RE.test(reported)) err(p, `${def}: Reported \`${reported}\` is not YYYY-MM-DD`);
    if (!PHASES.has(phase)) err(p, `${def}: Phase missed \`${phase}\` not in the §13 vocabulary`);
    if (type !== "—" && !TYPE_STEM[type]) err(p, `${def}: Type missed \`${type}\` is not a test type or —`);
    if (backfill !== "pending") for (const id of backfill.split(",").map((s) => s.trim()))
      if (!CASE_ID_RE.test(id)) err(p, `${def}: Backfill \`${id}\` must be a TC id or pending`);
    if (!/^(OPEN|CLOSED)$/.test(status)) err(p, `${def}: Status \`${status}\` not OPEN|CLOSED`);
  }
}

// ── 4z. Templates live in _templates/ only (2.1) — a 2.0 `_template/` folder is a leftover ───
// A warning through 2.1.x: the skills copy from <qa-root>/_templates/, so an old skeleton beside the
// output silently drifts from the format the lint enforces.
{
  const leftovers = new Set();
  for (const top of ["analysis", "plans", "cases", "reviews", "defects", "exploratory", "reports"])
    for (const p of walk(top)) { const i = p.indexOf("/_template/"); if (i !== -1) leftovers.add(p.slice(0, i + 10)); }
  for (const d of [...leftovers].sort())
    warn(d, `2.0 template folder — the formats moved to ${ROOT_NAME}/_templates/ (2.1); delete this folder once nothing local differs`);
}

// ── 5. Unpadded REQ ids anywhere in analysis/ ───────────────────────────────
for (const p of walk("analysis")) {
  if (p.endsWith(".md") && !p.includes("_template") && UNPADDED_REQ_RE.test(read(p)))
    err(p, "unpadded REQ-id (REQ-NNN is zero-padded, ≥3 digits)");
}

// ── 6. Impact map: heading, columns, ids (CONTRACTS §10) ───────────────────
if (existsSync("docs/impact-map.md")) {
  const p = "docs/impact-map.md", t = read(p);
  const IM_COLUMNS = "| BR | Module | Endpoint / Screen | TC | Last verified | Notes |";
  if (!/^# Impact map$/m.test(t)) err(p, "missing exact heading `# Impact map`");
  const rows = tableRows(t, IM_COLUMNS);
  if (!rows) err(p, `impact-map column header is not byte-exact (\`${IM_COLUMNS}\`)`);
  const seen = new Set();
  // Rows sit in (BR number, Module) order, so two branches adding rows insert at different lines
  // instead of both appending after the last one — the commonest merge conflict on this file.
  const order = (br, mod) => `${String(parseInt(br.slice(3), 10) || 0).padStart(9, "0")}/${mod}`;
  let prev = null;
  for (const { row, cells } of rows ?? []) {
    if (cells.length === 6) {
      const k = order(cells[0], cells[1]);
      if (prev !== null && k < prev) err(p, `row (${cells[0]}, ${cells[1]}) is out of order — rows are sorted by BR number, then Module: insert in place, never append (CONTRACTS §10)`);
      prev = k;
    }
    if (cells.length !== 6) { err(p, `impact-map row has ${cells.length} cells (need 6): ${row.slice(0, 60)}`); continue; }
    const [br, mod, , tc, verified] = cells;
    if (!/^BR-\d{3,}$/.test(br)) err(p, `BR \`${br}\` is not BR-NNN`);
    if (!mod) err(p, `empty Module for ${br} — use ? when unknown`);
    const key = `${br}/${mod}`;
    if (seen.has(key)) err(p, `duplicate impact-map row identity (${key}) — rows are upserted by (BR, Module)`);
    seen.add(key);
    if (tc && tc !== "—") for (const id of tc.split(",").map((s) => s.trim()))
      if (!CASE_ID_RE.test(id)) err(p, `TC \`${id}\` malformed in row ${key}`);
      else if (!cases.has(id)) warn(p, `TC ${id} in row ${key} has no case file — renumbered or not designed yet? (CONTRACTS §10)`);
    if (verified && verified !== "—" && !DATE_RE.test(verified))
      err(p, `Last verified \`${verified}\` in row ${key} is not YYYY-MM-DD or —`);
  }
}

// ── 7. Staged handoffs: unit (§11) and mobile (§15) ───────────────────────
// Same contract shape for both: staged mirror under <qa-root>/scripts/<type>/, one HANDOFF row per
// Case ID, Target path inside the repo's declared test dirs, Status/Write-mode vocabularies.
function checkHandoff({ dir, heading, stem, section }) {
  const hp = `${dir}/HANDOFF.md`;
  // A Maestro flow (.yaml) runs here, from the QA root — it is not staged for another repo, so it has no row.
  const staged = [...walk(dir)].filter((p) => new RegExp(`/TC-${stem}-[^/]+$`).test(p) && SCRIPT_EXT_RE.test(p) && !p.endsWith(".yaml"));
  if (staged.length && !existsSync(hp)) { err(hp, `missing — ${staged.length} staged script(s) need HANDOFF rows (CONTRACTS ${section})`); return; }
  if (!existsSync(hp)) return;
  const t = read(hp);
  if (!new RegExp(`^${heading}$`, "m").test(t)) err(hp, `missing exact heading \`${heading}\``);
  const rows = tableRows(t, HANDOFF_COLUMNS);
  if (!rows) { err(hp, `handoff column header is not byte-exact (\`${HANDOFF_COLUMNS}\`)`); return; }
  const listed = new Map();
  for (const { row, cells } of rows) {
    if (cells.length !== 7) { err(hp, `handoff row has ${cells.length} cells (need 7): ${row.slice(0, 60)}`); continue; }
    const [caseId, stagedPath, targetPath, mode, status, applied] = cells;
    if (!new RegExp(`^TC-${stem}-[A-Z0-9-]+-\\d{3}$`).test(caseId)) err(hp, `Case ID \`${caseId}\` malformed (TC-${stem}-<MODULE>-<NNN>)`);
    if (listed.has(caseId)) err(hp, `duplicate handoff row for ${caseId} — rows are upserted by Case ID`);
    // The Staged path is project-relative: `qa/…` and `.stlc/…` both name this root (CONTRACTS §2).
    const rel = stripRoot(stagedPath.startsWith(`${ROOT_NAME}/`) ? stagedPath.slice(ROOT_NAME.length + 1) : stagedPath);
    listed.set(caseId, rel);
    if (!(hasRootPrefix(stagedPath) || stagedPath.startsWith(`${ROOT_NAME}/`)) || !rel.startsWith(`${dir}/`)) err(hp, `${caseId}: Staged script must be under ${ROOT_NAME}/${dir}/ (got \`${stagedPath}\`)`);
    else if (!existsSync(rel)) err(hp, `${caseId}: staged script not found at ${stagedPath}`);
    if (!targetPath || targetPath === "—") warn(hp, `${caseId}: empty Target path — derive it from the test-file convention`);
    if (!/^(propose|apply)$/.test(mode)) err(hp, `${caseId}: Write mode \`${mode}\` is not propose|apply`);
    if (!/^(proposed|applied|merged|rejected|superseded)$/.test(status)) err(hp, `${caseId}: Status \`${status}\` not in proposed|applied|merged|rejected|superseded`);
    if (applied !== "—" && !DATE_RE.test(applied)) err(hp, `${caseId}: Applied \`${applied}\` is not YYYY-MM-DD or —`);
  }
  const listedPaths = new Set(listed.values());
  for (const p of staged) if (!listedPaths.has(p)) err(p, `staged script has no HANDOFF.md row (the generating skill upserts one per Case ID, CONTRACTS ${section})`);
}
checkHandoff({ dir: "scripts/unit", heading: "# Unit-test handoff", stem: "UNIT", section: "§11" });
checkHandoff({ dir: "scripts/mobile", heading: "# Mobile-test handoff", stem: "MOB", section: "§15" });
checkHandoff({ dir: "scripts/data", heading: "# Data-test handoff", stem: "DATA", section: "§28" });

// ── 8. Run evidence tables: unit coverage summaries · security/a11y findings ─
for (const p of walk("runs/unit")) {
  if (basename(p) !== "coverage-summary.md") continue;
  if (!read(p).includes("| Module | Files | Line % | Branch % | Target | Verdict |"))
    err(p, "coverage-summary column header is not byte-exact (`| Module | Files | Line % | Branch % | Target | Verdict |`)");
}
for (const p of walk("runs/mobile")) {
  if (basename(p) !== "device-matrix.md") continue;
  if (!read(p).includes(DEVICE_MATRIX_COLUMNS))
    err(p, `device-matrix column header is not byte-exact (\`${DEVICE_MATRIX_COLUMNS}\`)`);
}
for (const dir of ["runs/security", "runs/accessibility"]) {
  const prefix = dir === "runs/security" ? "SEC-F-" : "A11Y-F-";
  for (const p of walk(dir)) {
    if (basename(p) !== "findings.md") continue;
    const rows = tableRows(read(p), FINDINGS_COLUMNS);
    if (!rows) { err(p, `findings column header is not byte-exact (\`${FINDINGS_COLUMNS}\`)`); continue; }
    for (const { row, cells } of rows) {
      if (cells.length !== 7) { err(p, `findings row has ${cells.length} cells (need 7): ${row.slice(0, 60)}`); continue; }
      const [id, sev, , , , , status] = cells;
      if (!new RegExp(`^${prefix}\\d{3}$`).test(id)) err(p, `finding id \`${id}\` must be ${prefix}NNN`);
      if (!/^(Critical|High|Medium|Low)$/.test(sev)) err(p, `${id}: Severity \`${sev}\` not in Critical|High|Medium|Low`);
      if (!/^(open|triaged|false-positive|resolved)/.test(status)) err(p, `${id}: Status \`${status}\` not in open|triaged|false-positive|resolved`);
    }
  }
}

// ── 9. Quarantine: tags ↔ ledger, bounds, expiry (CONTRACTS §12) ────────────
{
  const qp = "regression/quarantine.md";
  const tagged = new Map(); // Case ID → until (from the case's tag)
  for (const [id, c] of cases) {
    const q = c.tags.find((x) => x.startsWith("@quarantined:"));
    if (q) tagged.set(id, q.slice(13));
  }
  const open = new Map(); // Case ID → until (unreleased ledger rows)
  if (tagged.size && !existsSync(qp)) err(qp, `missing — ${tagged.size} case(s) carry @quarantined: but there is no ledger (written by /qa-quarantine)`);
  if (existsSync(qp)) {
    const t = read(qp);
    const Q_COLUMNS = "| Case ID | Since | Until | Reason | Evidence | Ticket | Released |";
    if (!/^# Quarantine ledger$/m.test(t)) err(qp, "missing exact heading `# Quarantine ledger`");
    const rows = tableRows(t, Q_COLUMNS);
    if (!rows) err(qp, `quarantine column header is not byte-exact (\`${Q_COLUMNS}\`)`);
    const seen = new Set();
    for (const { row, cells } of rows ?? []) {
      if (cells.length !== 7) { err(qp, `quarantine row has ${cells.length} cells (need 7): ${row.slice(0, 60)}`); continue; }
      const [caseId, since, until, reason, evidence, , released] = cells;
      if (!CASE_ID_RE.test(caseId)) { err(qp, `Case ID \`${caseId}\` malformed`); continue; }
      const stem = caseId.match(CASE_ID_RE)[1];
      if (NEVER_QUARANTINED.has(stem)) err(qp, `${caseId}: ${stem} cases are never quarantined (CONTRACTS §12)`);
      const key = `${caseId}/${since}`;
      if (seen.has(key)) err(qp, `duplicate quarantine row identity (${key})`); seen.add(key);
      if (!DATE_RE.test(since)) err(qp, `${caseId}: Since \`${since}\` is not YYYY-MM-DD`);
      if (!DATE_RE.test(until)) err(qp, `${caseId}: Until \`${until}\` is not YYYY-MM-DD`);
      if (DATE_RE.test(since) && DATE_RE.test(until) && daysBetween(since, until) > 30)
        err(qp, `${caseId}: quarantine ${since} → ${until} exceeds 30 days — extend with a NEW row, never a longer grant`);
      if (!reason || reason === "—") err(qp, `${caseId}: empty Reason`);
      if (!evidence || evidence === "—") err(qp, `${caseId}: Evidence must list the run-id(s) with the FLAKY triage`);
      if (released !== "—" && !DATE_RE.test(released)) err(qp, `${caseId}: Released \`${released}\` is not YYYY-MM-DD or —`);
      if (released === "—") {
        if (DATE_RE.test(until) && until < TODAY) err(qp, `${caseId}: quarantine expired on ${until} and is not Released — fix the flake, release it, or extend with a new row`);
        if (open.has(caseId)) err(qp, `${caseId}: two unreleased quarantine rows — release the older one first`);
        open.set(caseId, until);
      }
    }
  }
  for (const [id, until] of tagged) {
    if (!open.has(id)) err(cases.get(id).path, `${id} carries @quarantined:${until} but the ledger has no unreleased row for it`);
    else if (open.get(id) !== until) err(cases.get(id).path, `${id}: tag date ${until} ≠ ledger Until ${open.get(id)}`);
  }
  for (const [id, until] of open)
    if (!tagged.has(id)) err(qp, `${id} has an unreleased ledger row (until ${until}) but its case file carries no @quarantined: tag${cases.has(id) ? "" : " (case file not found)"}`);
}

// ── 10. Exploratory session sheets (CONTRACTS §14) ──────────────────────────
{
  const XS_HEADINGS = ["## Charter", "## Session", "## Notes", "## Bugs", "## Follow-ups", "## Debrief"];
  const BUGS_COLUMNS = "| # | What happened | Expected | Evidence | Status |";
  const FU_COLUMNS = "| # | Kind | Detail | Action |";
  for (const p of walk("exploratory")) {
    if (!p.endsWith(".md") || p.includes("_template")) continue;
    const name = basename(p);
    if (!XS_FILE_RE.test(name)) { err(p, "filename breaks XS-<slug>-NNN-<charter-slug>.md"); continue; }
    const slug = basename(dirname(p));
    if (!name.startsWith(`XS-${slug}-`)) err(p, `session id does not carry its folder slug \`${slug}\``);
    const t = read(p);
    let last = -1;
    for (const h of XS_HEADINGS) {
      const i = t.indexOf(`\n${h}\n`) >= 0 ? t.indexOf(`\n${h}\n`) : t.indexOf(`\n${h}\r`);
      if (i < 0) err(p, `missing exact heading \`${h}\``);
      else if (i < last) err(p, `heading \`${h}\` out of order (CONTRACTS §14 order)`);
      else last = i;
    }
    if (t.includes("## Bugs")) {
      const rows = tableRows(t.slice(t.indexOf("## Bugs")), BUGS_COLUMNS);
      if (!rows) err(p, `Bugs column header is not byte-exact (\`${BUGS_COLUMNS}\`)`);
      for (const { cells } of rows ?? []) {
        if (cells.length !== 5) { err(p, `Bugs row has ${cells.length} cells (need 5)`); continue; }
        const status = cells[4];
        if (!/^(candidate|raised DEF-[a-z0-9-]+-\d{3}|not-a-bug|duplicate DEF-[a-z0-9-]+-\d{3})$/.test(status))
          err(p, `Bugs #${cells[0]}: Status \`${status}\` not in candidate | raised DEF-… | not-a-bug | duplicate DEF-…`);
        else if (/^(raised|duplicate) /.test(status) && !defectIds.has(status.split(" ")[1]))
          err(p, `Bugs #${cells[0]}: ${status.split(" ")[1]} has no defect file`);
      }
    }
    if (t.includes("## Follow-ups")) {
      const rows = tableRows(t.slice(t.indexOf("## Follow-ups")), FU_COLUMNS);
      if (!rows) err(p, `Follow-ups column header is not byte-exact (\`${FU_COLUMNS}\`)`);
      for (const { cells } of rows ?? [])
        if (cells.length === 4 && !/^(CASE|QUESTION|RISK|DATA)$/.test(cells[1])) err(p, `Follow-up #${cells[0]}: Kind \`${cells[1]}\` not in CASE|QUESTION|RISK|DATA`);
    }
  }
}

// Front matter as a flat key→string map; null when the file has none. Shared by §16 and §18.
function frontMatter(t) {
  const m = t.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const o = {};
  for (const l of m[1].split("\n")) { const kv = l.match(/^([a-z_]+):\s*(.*)$/); if (kv) o[kv[1]] = kv[2].trim(); }
  return o;
}

// ── 10b. Artifact front matter (CONTRACTS §2.1) — every authored artifact opens with the same block,
// so state.json and the board read a status instead of parsing prose. Reports, sign-offs and
// reviews keep their own §16 / §18 front matter. Missing is a warning through 2.1.x.
{
  const ARTIFACTS = [
    ["analysis", /^\d{4}-\d{2}-\d{2}-(analysis|clarifications|impact)\.md$/, (m) => m[1]],
    ["plans", /^\d{4}-\d{2}-\d{2}-(strategy|test-plan|estimate)\.md$/, (m) => m[1]],
    ["defects", /^DEF-.+\.md$/, () => "defect"],
    ["exploratory", /^XS-.+\.md$/, () => "exploratory"],
  ];
  const KEYS = ["slug", "artifact", "status", "authored_by", "reviewed_by", "created", "updated"];
  const STATUSES = ["draft", "in-review", "superseded"];
  for (const [top, re, kind] of ARTIFACTS) for (const p of walk(top)) {
    if (p.includes("_template") || p.includes("/sources/")) continue;
    const m = re.exec(basename(p));
    if (!m) continue;
    const fm = frontMatter(read(p));
    if (!fm) { warn(p, `no front matter — open with \`---\` ${KEYS.join(" · ")} \`---\` (CONTRACTS §2.1; an error from 2.2)`); continue; }
    for (const k of KEYS) if (!fm[k]) err(p, `front matter has no \`${k}:\` (CONTRACTS §2.1)`);
    if (fm.artifact && fm.artifact !== kind(m)) err(p, `front matter \`artifact: ${fm.artifact}\` disagrees with the file name (\`${kind(m)}\`)`);
    if (fm.status && !STATUSES.includes(fm.status)) err(p, `\`status: ${fm.status}\` not in ${STATUSES.join(" | ")} (CONTRACTS §2.1 — whether it passed lives in its review)`);
    const folder = p.split("/")[1];
    if (fm.slug && folder !== fm.slug) err(p, `front matter \`slug: ${fm.slug}\` disagrees with the folder \`${folder}\``);
    for (const k of ["created", "updated"]) if (fm[k] && !DATE_RE.test(fm[k])) err(p, `\`${k}: ${fm[k]}\` is not YYYY-MM-DD`);
    if (fm.authored_by && fm.reviewed_by && fm.authored_by === fm.reviewed_by) err(p, "`authored_by` and `reviewed_by` are the same skill — a reviewer never judges its own work");
  }
}

// ── 10c. Clarification sheets (CONTRACTS §2.1 Clarifications) — the marker is what lets a phase stop
// on the right questions: an unmarked question is neither asked nor safely assumed. A test plan dated
// on or after a sheet that still has an open BLOCKING question was planned on a guess — the very
// thing /qa-plan exists to refuse — so it is an error, not a review note.
{
  const Q_HEAD_RE = /^###\s+(Q-\d{3,})\b(.*)$/;
  for (const p of walk("analysis")) {
    const m = /^(\d{4}-\d{2}-\d{2})-clarifications\.md$/.exec(basename(p));
    if (!m || p.includes("_template") || p.includes("/sources/")) continue;
    const t = read(p).replace(/<!--[\s\S]*?-->/g, "");
    if (frontMatter(t)?.status === "superseded") continue;
    const openBlocking = [];
    for (const block of t.split(/^(?=###\s+Q-)/m)) {
      const head = Q_HEAD_RE.exec(block.split("\n")[0]);
      if (!head) continue;
      const marks = head[2].match(/\[(?:NON-)?BLOCKING\]/g) ?? [];
      if (marks.length !== 1) { err(p, `${head[1]}: carries ${marks.length} of \`[BLOCKING]\` / \`[NON-BLOCKING]\` — exactly one (CONTRACTS §2.1 Clarifications)`); continue; }
      const status = /^\*\*Status:\*\*\s*(.+)$/m.exec(block)?.[1].trim();
      if (!status) { err(p, `${head[1]}: no \`**Status:**\` line — OPEN · ANSWERED — <answer> (<date>, <who>) · assumed — autonomous-run <run-id> (started by <name>)`); continue; }
      if (!/^(OPEN|ANSWERED\b|assumed\b)/.test(status)) err(p, `${head[1]}: \`**Status:** ${status.slice(0, 40)}\` is not OPEN · ANSWERED — … · assumed — …`);
      // An assumed answer to a blocking question is still a guess until a human confirms it (§24).
      if (marks[0] === "[BLOCKING]" && !/^ANSWERED\b/.test(status)) openBlocking.push(head[1]);
    }
    if (!openBlocking.length) continue;
    const slug = p.split("/")[1];
    for (const plan of walk(`plans/${slug}`)) {
      const d = /^(\d{4}-\d{2}-\d{2})-test-plan\.md$/.exec(basename(plan))?.[1];
      if (d && d >= m[1]) err(plan, `planned while ${p} has open BLOCKING ${openBlocking.join(", ")} — answer them first (/qa-clarify), or plan nothing (CONTRACTS §2.1 Clarifications)`);
    }
  }
}

// ── 10d. Sizing (CONTRACTS §27) — a plan says how big the change is before anything is spawned for it.
// Without it every change pays for every enabled type, and nobody wrote down what was left out or why.
// Plans dated before SIZING_SINCE are history and are not re-sized.
{
  const budget = readBudget(".");
  for (const p of walk("plans")) {
    const d = /^(\d{4}-\d{2}-\d{2})-test-plan\.md$/.exec(basename(p))?.[1];
    if (!d || p.includes("_template")) continue;
    const t = read(p);
    const s = parseSizing(t);
    if (!s) { if (d >= SIZING_SINCE) err(p, "no `## Sizing` — change_class · worth_testing · types · skipped · estimate_tokens · spawns (CONTRACTS §27)"); continue; }
    const slug = p.split("/")[1];
    // re-verify rows are another slug's cases: they were sized, designed and reviewed there.
    const own = (tableRows(t.slice(t.indexOf(TRACE_HEADING)), TRACE_COLUMNS) ?? []).filter((r) => /^REQ-/.test(r.cells[0] ?? ""));
    const traceTypes = [...new Set(own.map((r) => r.cells[2]).filter(Boolean))];
    const scripted = own.some((r) => r.cells[5] === "✅");
    const reviewed = existsSync(`reviews/${slug}`) && readdirSync(`reviews/${slug}`).some((f) => f.endsWith("-case-review.md"));
    const ctx = { enabled: PROFILE?.types ?? null, budget, traceTypes, scripted, reviewed, spawnsUsed: spawnsSince(".", slug, d).length };
    for (const m of sizingProblems(s, ctx)) err(p, `## Sizing: ${m} (CONTRACTS §27)`);
  }
}

// ── 10f. Deploy impact (CONTRACTS §30) — a change to the schema, existing rows or an API contract is
// tested for how it ships and how it comes back, not only for what it does. The plan's `## Sizing`
// declares the impact; the slug's planned cases name the checks they prove on `**Deploy check:**`.
// The check runs once the traceability table has rows: before /qa-design an empty table is the contract.
for (const [id, c] of cases) {
  const checks = caseChecks(c.text);
  if (checks === null) continue;
  if (!checks.length) err(c.path, "`**Deploy check:**` names no check (CONTRACTS §30)");
  for (const k of checks) if (!CHECKS[k]) err(c.path, `\`**Deploy check:**\` \`${k}\` is not a deploy check — one of ${Object.keys(CHECKS).join(", ")} (CONTRACTS §30)`);
}
for (const p of walk("plans")) {
  const d = /^(\d{4}-\d{2}-\d{2})-test-plan\.md$/.exec(basename(p))?.[1];
  if (!d || p.includes("_template")) continue;
  const t = read(p);
  const s = parseSizing(t);
  if (!s) continue; // 10d reports a missing ## Sizing
  if (declaredImpact(s) === null) {
    if (d >= DEPLOY_SINCE) warn(p, "## Sizing has no `deploy_impact:` — `none`, or `db` / `api` when the change touches the schema, existing rows or an API contract (CONTRACTS §30)");
    continue;
  }
  const { problems } = deployRequirements(s);
  for (const m of problems) err(p, `## Sizing: ${m} (CONTRACTS §30)`);
  const slug = p.split("/")[1];
  const own = (tableRows(t.slice(t.indexOf(TRACE_HEADING)), TRACE_COLUMNS) ?? []).filter((r) => /^REQ-/.test(r.cells[0] ?? ""));
  if (!own.length) continue;
  const planned = new Set(own.map((r) => r.cells[1]));
  const proving = [...cases].filter(([id, c]) => planned.has(id) && c.feature === slug && !c.tags.some((x) => x.startsWith("@deprecated:")))
    .map(([id, c]) => ({ id, checks: caseChecks(c.text) ?? [] }));
  for (const k of missingChecks(s, proving))
    err(p, `deploy check \`${k}\` has no planned case — ${CHECKS[k]}; design one with \`**Deploy check:** ${k}\`, or skip it in \`deploy_skipped:\` with a reason (CONTRACTS §30)`);
}

// ── 10e. Independent review (CONTRACTS §18) — a verdict from whoever wrote the work is not a review.
// The reviewer is named in the body; the authors are the case files' `authored_by` agents (the
// designer the command routed to). Same name on both sides is an error, not a finding to weigh.
{
  const DESIGNERS = AGENT_OF;
  for (const p of walk("reviews")) {
    if (!p.endsWith("-case-review.md") || p.includes("_template")) continue;
    const t = read(p);
    const who = /\*\*Reviewer:\*\*\s*([a-z][a-z0-9-]*)/.exec(t)?.[1];
    if (!who) { err(p, "no `**Reviewer:** <agent> (<skill>)` — an unnamed reviewer cannot be shown to be independent (CONTRACTS §18)"); continue; }
    const authors = new Set();
    for (const m of t.matchAll(/^\s*-\s*path:\s*(\S+)/gm)) {
      const type = /(?:^|\/)cases\/([a-z]+)\//.exec(m[1])?.[1];
      if (DESIGNERS[type]) authors.add(DESIGNERS[type]);
    }
    if (authors.has(who)) err(p, `reviewer \`${who}\` designed cases it reviews — route the review to another agent (CONTRACTS §18)`);
  }
}

// ── 10g. Verdict integrity (CONTRACTS §31) — what the run judged, and whether its reads were reads ──
// Target identity declarations: one malformed row would make every probe of that environment lie.
const TARGET_ROWS = PROFILE?.path ? targetRows(read(PROFILE.path)) : [];
const TARGET_DECLARED = TARGET_ROWS.length > 0;
for (const row of TARGET_ROWS)
  for (const e of targetDeclarationErrors(row)) err(PROFILE.path, `${TARGET_HEADING} row \`${row.component || "?"}\`: ${e} (CONTRACTS §31)`);
// run-id → the target.json its folder holds (any type, any slug: a run id names one run).
const TARGETS = new Map();
for (const p of walk("runs")) {
  if (basename(p) !== "target.json") continue;
  try { TARGETS.set(basename(dirname(p)), JSON.parse(read(p))); } catch { err(p, "target.json is not valid JSON — re-run qa:target"); }
}
// Reads that turn "could not read" into a value, and steps that do nothing (test code only: *.ts).
for (const p of walk("scripts")) {
  if (!p.endsWith(".ts") || p.includes("node_modules")) continue;
  const t = read(p);
  for (const s of swallowedReads(t)) err(p, `line ${s.line}: \`${s.snippet}\` turns a failed read into a value — let it throw, or return UNKNOWN; if it can never reach a verdict, say why with \`// unknown-ok: <reason>\` (CONTRACTS §31)`);
  if (/\.spec\.ts$/.test(p)) for (const s of emptySteps(t)) err(p, `line ${s.line}: step "${s.title}" has an empty body — a step is performed when its action ran, not when its title printed (CONTRACTS §31)`);
}
// A product defect is the explanation left after the harness was ruled out.
for (const p of walk("runs")) {
  if (basename(p) !== "failures.md") continue;
  for (const m of attributionProblems(read(p))) err(p, `${m} (CONTRACTS §31)`);
}

// ── 11. Reports and sign-offs (CONTRACTS §16 — the dev bundle parses these at G10) ──
{
  const SHA_RE = /^([0-9a-f]{7,40}|—)$/;
  const RUN_ID_RE = /^\d{4}-\d{2}-\d{2}-\d{4}$/;
  const REPORT_HEADINGS = ["## Executive summary", "## Coverage by type", "## Quality gates", "## Performance SLOs",
    "## Security findings", "## Unit coverage & handoff", "## Accessibility findings", "## Device matrix & mobile handoff",
    "## Quarantined & manual", "## Exploratory sessions", "## Failure digest", "## Deviations from plan",
    "## Residual risk", "## Trend", "## Gaps & recommendations"];
  const GATE_COLUMNS = "| Gate | Target | Actual | Verdict | Evidence |";
  const SIGNOFF_HEADINGS = ["## Executive summary", "## Recommendation & conditions", "## Feature posture",
    "## Exit criteria", "## Open defects", "## Lessons learned", "## Appendix"];
  const CONDITION_COLUMNS = "| # | Condition | Owner | Due | Evidence |";
  const EXIT_COLUMNS = "| # | Exit criterion | Verdict | Evidence |";
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hasHeading = (t, h) => new RegExp(`^${esc(h)}\\s*$`, "m").test(t);
  const listOf = (v) => (v ?? "").replace(/^\[|\]$/g, "").split(",").map((s) => s.trim()).filter(Boolean);

  for (const p of walk("reports")) {
    if (!p.endsWith(".md") || p.includes("_template")) continue;
    const parts = p.split("/"); // reports/<slug>/<file> · reports/release/<id>/<file> · reports/metrics|retro|coverage/<file>
    if (parts[1] === "metrics" || parts[1] === "retro" || parts[1] === "coverage") continue;
    const t = read(p).replace(/\r\n/g, "\n");
    const name = basename(p);

    if (parts[1] === "release") {
      if (!/^\d{4}-\d{2}-\d{2}-signoff\.md$/.test(name)) { err(p, "filename breaks YYYY-MM-DD-signoff.md"); continue; }
      const fm = frontMatter(t);
      if (!fm) { err(p, "sign-off has no front matter (CONTRACTS §16: release · date · features · recommendation)"); continue; }
      for (const k of ["release", "date", "features", "recommendation"]) if (!(k in fm)) err(p, `sign-off front matter missing \`${k}\` (CONTRACTS §16)`);
      if (fm.date && !DATE_RE.test(fm.date)) err(p, `date \`${fm.date}\` is not YYYY-MM-DD`);
      if (fm.release && parts[2] !== fm.release) err(p, `front matter release \`${fm.release}\` ≠ folder \`${parts[2]}\``);
      if (fm.recommendation && !/^(GO|NO-GO|CONDITIONAL GO)$/.test(fm.recommendation)) err(p, `recommendation \`${fm.recommendation}\` not in GO|NO-GO|CONDITIONAL GO`);
      for (const h of SIGNOFF_HEADINGS) if (!hasHeading(t, h)) err(p, `missing exact heading \`${h}\` (CONTRACTS §16)`);
      const exit = tableRows(t, EXIT_COLUMNS);
      if (!exit) err(p, `exit-criteria column header is not byte-exact (\`${EXIT_COLUMNS}\`)`);
      let unmet = 0;
      for (const { row, cells } of exit ?? []) {
        if (cells.length !== 4) { err(p, `exit-criteria row has ${cells.length} cells (need 4): ${row.slice(0, 60)}`); continue; }
        const v = cells[2];
        if (!/^(met|NOT met|not evaluable)$/.test(v)) err(p, `exit criterion #${cells[0]}: Verdict \`${v}\` not in met|NOT met|not evaluable`);
        else if (v !== "met") unmet++;
        if (!cells[3] || cells[3] === "—") err(p, `exit criterion #${cells[0]}: empty Evidence`);
      }
      if (fm.recommendation === "GO" && unmet) err(p, "GO with an exit criterion NOT met or not evaluable — GO requires every criterion met (CONTRACTS §16)");
      const cond = tableRows(t, CONDITION_COLUMNS);
      if (!cond) err(p, `conditions column header is not byte-exact (\`${CONDITION_COLUMNS}\`)`);
      if (fm.recommendation === "CONDITIONAL GO" && !(cond && cond.length)) err(p, "CONDITIONAL GO without a conditions row (CONTRACTS §16)");
      continue;
    }

    if (!/^\d{4}-\d{2}-\d{2}-report\.md$/.test(name)) { err(p, "filename breaks YYYY-MM-DD-report.md"); continue; }
    const fm = frontMatter(t);
    if (!fm) { err(p, "report has no front matter (CONTRACTS §16: slug · date · shipped_sha · runs · overall)"); continue; }
    for (const k of ["slug", "date", "shipped_sha", "runs", "overall"]) if (!(k in fm)) err(p, `report front matter missing \`${k}\` (CONTRACTS §16)`);
    if (fm.slug && parts[1] !== fm.slug) err(p, `front matter slug \`${fm.slug}\` ≠ folder \`${parts[1]}\``);
    if (fm.date && !DATE_RE.test(fm.date)) err(p, `date \`${fm.date}\` is not YYYY-MM-DD`);
    if (fm.shipped_sha && !SHA_RE.test(fm.shipped_sha)) err(p, `shipped_sha \`${fm.shipped_sha}\` is not a 7–40 hex sha or —`);
    if (fm.overall && !/^(pass|fail|not evaluable)$/.test(fm.overall)) err(p, `overall \`${fm.overall}\` not in pass|fail|not evaluable`);
    for (const r of listOf(fm.runs)) if (!RUN_ID_RE.test(r)) err(p, `runs entry \`${r}\` is not a run-id (YYYY-MM-DD-HHmm)`);
    for (const h of REPORT_HEADINGS) if (!hasHeading(t, h)) err(p, `missing exact heading \`${h}\` (CONTRACTS §16)`);
    const gates = tableRows(t, GATE_COLUMNS);
    if (!gates) err(p, `quality-gates column header is not byte-exact (\`${GATE_COLUMNS}\`)`);
    const verdicts = [];
    for (const { row, cells } of gates ?? []) {
      if (cells.length !== 5) { err(p, `quality-gates row has ${cells.length} cells (need 5): ${row.slice(0, 60)}`); continue; }
      const v = cells[3];
      if (!/^(pass|fail|not evaluable)$/.test(v)) err(p, `gate \`${cells[0]}\`: Verdict \`${v}\` not in pass|fail|not evaluable`);
      else verdicts.push(v);
      if (!cells[4] || cells[4] === "—") err(p, `gate \`${cells[0]}\`: empty Evidence — a verdict nobody can retrace is not a verdict`);
    }
    if (gates && verdicts.length && fm.overall) {
      const derived = verdicts.includes("fail") ? "fail" : verdicts.includes("not evaluable") ? "not evaluable" : "pass";
      if (fm.overall !== derived) err(p, `overall \`${fm.overall}\` disagrees with the gate rows (derived \`${derived}\`) — overall is derived, never typed`);
    }
    // §31: a report that names a shipped commit says whether its runs reached that commit.
    if (fm.shipped_sha && fm.shipped_sha !== "—" && SHA_RE.test(fm.shipped_sha)) {
      const row = (gates ?? []).find(({ cells }) => cells[0] === "Target identity");
      if (!row) {
        if (TARGET_DECLARED) err(p, "names a shipped_sha but has no `Target identity` gate row — say whether the runs reached that commit (CONTRACTS §31)");
        else warn(p, "names a shipped_sha, but no §Environments ### Target identity is declared — nothing proves the runs reached that commit (CONTRACTS §31)");
      } else {
        const runs = listOf(fm.runs).map((id) => ({ id, target: TARGETS.get(id) ?? null }));
        const derived = targetGate(fm.shipped_sha, runs);
        if (row.cells[3] !== derived.verdict)
          err(p, `gate \`Target identity\`: Verdict \`${row.cells[3]}\` but the runs' target.json say \`${derived.verdict}\` (${derived.reasons.slice(0, 3).join("; ") || "every run MATCH"}) — CONTRACTS §31`);
      }
    }
  }
}

// ── 12. Gate verdicts that can go stale (CONTRACTS §18) ─────────────────────
// A verdict must say what it judged, and must say it once: front matter and body agreeing is the
// whole point, because two verdicts in one file means neither is the verdict.
const SHA_ENTRY_RE = /^\s*-\s*path:\s*(\S+)\s*$/;
const REVIEW_VERDICTS = ["READY FOR /qa-script", "REVISE FIRST"];
const ENV_VERDICTS = ["READY", "NOT READY", "BLOCKED"];

for (const p of walk("reviews")) {
  if (!p.endsWith("-case-review.md") || p.includes("/_template/")) continue;
  const t = read(p);
  const fm = frontMatter(t);
  if (!fm) { err(p, "no front matter — a case review states `slug`, `date`, `verdict` and `reviewed:` (CONTRACTS §18)"); continue; }
  const v = (fm.verdict ?? "").trim();
  if (!REVIEW_VERDICTS.includes(v)) err(p, `verdict \`${v}\` not in ${REVIEW_VERDICTS.join(" | ")} (CONTRACTS §18)`);
  const bodyV = /\*\*Verdict:\*\*\s*(READY FOR \/qa-script|REVISE FIRST)/.exec(t)?.[1];
  if (bodyV && v && bodyV !== v) err(p, `front matter says \`${v}\`, the body says \`${bodyV}\` — one file, one verdict (CONTRACTS §18)`);
  const entries = shaEntries(t, "reviewed");
  if (entries === null) err(p, "no `reviewed:` list — a review that records no case hash can never go STALE (CONTRACTS §18)");
  else for (const { path: rp, sha } of entries) {
    if (!/^[0-9a-f]{64}$/.test(sha)) err(p, `reviewed \`${rp}\`: \`${sha}\` is not a sha256 — \`build-state.mjs --hash <path>\` prints it`);
  }
}

// ── 12b. Pull-request reviews (CONTRACTS §21) ──────────────────────────────
const PR_VERDICTS = ["APPROVE", "REQUEST CHANGES", "COMMENT"];
const PR_SECTIONS = ["## Scope", "## Run", "## Checklist", "## Findings", "## Notes", "## Comment to post"];
for (const p of walk("reviews/_pr")) {
  if (!p.endsWith(".md")) continue;
  const name = p.split("/").pop();
  if (!/^(gitlab|github)-\d+-\d{4}-\d{2}-\d{2}-\d{4}\.md$|^[a-z0-9][a-z0-9._-]*-\d{4}-\d{2}-\d{2}-\d{4}\.md$/.test(name)) err(p, "PR review file is `<gitlab-n | github-n | branch>-YYYY-MM-DD-HHmm.md` (CONTRACTS §21)");
  const t = read(p);
  const fm = frontMatter(t);
  if (!fm) { err(p, "no front matter — a PR review states `pr`, `kind`, `base`, `head`, `reviewer`, `verdict`, `date` (CONTRACTS §21)"); continue; }
  for (const k of ["pr", "kind", "base", "head", "reviewer", "verdict", "date"]) if (!(fm[k] ?? "").trim()) err(p, `front matter is missing \`${k}\` (CONTRACTS §21)`);
  if (fm.kind && fm.kind.trim() !== "testing") err(p, `kind \`${fm.kind.trim()}\` — a ${ROOT_NAME}/ PR review is \`testing\`; development reviews live in dev/pr-reviews/ (CONTRACTS §21)`);
  if (fm.verdict && !PR_VERDICTS.includes(fm.verdict.trim())) err(p, `verdict \`${fm.verdict.trim()}\` not in ${PR_VERDICTS.join(" | ")} (CONTRACTS §21)`);
  if (fm.head && !/@\s*[0-9a-f]{7,40}\b/.test(fm.head)) err(p, "`head` names no commit sha (`<ref> @ <sha>`) — a review that cannot say which head it judged cannot go stale (CONTRACTS §21)");
  let at = -1;
  for (const h of PR_SECTIONS) {
    const i = t.indexOf(`\n${h}\n`);
    if (i < 0) err(p, `missing section \`${h}\` (CONTRACTS §21)`);
    else if (i < at) err(p, `section \`${h}\` is out of order (CONTRACTS §21)`);
    else at = i;
  }
  const highs = /\|\s*\d+\s*\|\s*High\s*\|/.test(t);
  if (highs && fm.verdict?.trim() === "APPROVE") err(p, "APPROVE with a High finding — any High is REQUEST CHANGES (CONTRACTS §21)");
}

for (const p of walk("runs/env-checks")) {
  if (!p.endsWith("/readiness.md")) continue;
  const t = read(p);
  const fm = frontMatter(t);
  if (!fm) { err(p, "no front matter — a readiness report states `env`, `date`, `run_id`, `verdicts` and `inputs:` (CONTRACTS §18)"); continue; }
  const envFromPath = p.split("/")[2];
  if (fm.env && fm.env.trim() !== envFromPath) err(p, `env \`${fm.env.trim()}\` does not match the folder \`${envFromPath}\``);
  const inline = /\{([^}]*)\}/.exec(fm.verdicts ?? "")?.[1] ?? "";
  const pairs = inline.split(",").map((s) => s.trim()).filter(Boolean);
  if (pairs.length === 0) err(p, "no `verdicts:` map — a readiness report states one verdict per enabled type (CONTRACTS §18)");
  for (const pair of pairs) {
    const [k, val] = pair.split(":").map((s) => (s ?? "").trim());
    if (!TYPE_STEM[k]) err(p, `verdicts key \`${k}\` is not a test type`);
    if (!ENV_VERDICTS.includes(val)) err(p, `verdicts \`${k}\`: \`${val}\` not in ${ENV_VERDICTS.join(" | ")} (CONTRACTS §18)`);
  }
  const entries = shaEntries(t, "inputs");
  if (entries === null) err(p, "no `inputs:` list — a readiness report that records no hash can never go STALE (CONTRACTS §18)");
  else for (const { path: rp, sha } of entries) {
    if (!/^[0-9a-f]{64}$/.test(sha)) err(p, `inputs \`${rp}\`: \`${sha}\` is not a sha256`);
  }
}

/** The `- path:` / `sha256:` pairs under a front-matter key; null when the key is absent. */
function shaEntries(text, key) {
  const fmText = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (!fmText) return null;
  const lines = fmText.split("\n");
  const start = lines.findIndex((l) => l.trim() === `${key}:`);
  if (start === -1) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const m = SHA_ENTRY_RE.exec(lines[i]);
    if (m) { out.push({ path: m[1], sha: "" }); continue; }
    const s = /^\s+sha256:\s*(\S*)\s*$/.exec(lines[i]);
    if (s && out.length) out[out.length - 1].sha = s[1];
    else if (/^\S/.test(lines[i])) break;
  }
  return out;
}

// ── 12b. Run plans (CONTRACTS §19) — front matter, names, retries 0, ids that exist ──
// Validation and resolution live in lib/run-plan-model.mjs, shared with run-plan.mjs, so the
// linter and the runner never disagree about what a plan selects.
if (existsSync("run-plans")) {
  const rp = await import(new URL("./lib/run-plan-model.mjs", import.meta.url));
  const ws = rp.loadWorkspace(".");
  for (const name of readdirSync("run-plans").filter((n) => n.endsWith(".md") && !n.startsWith("_")).sort()) {
    const p = `run-plans/${name}`;
    const stem = name.slice(0, -3);
    if (!rp.NAME_RE.test(stem)) { err(p, `run-plan file name \`${name}\` is not lowercase-kebab (CONTRACTS §19)`); continue; }
    const plan = rp.loadRunPlan(ws, stem);
    for (const e of plan.errors) err(p, e);
    for (const w of plan.warnings) warn(p, w);
    if (plan.errors.length) continue;
    const res = rp.resolvePlan(ws, plan.fm);
    for (const e of res.errors) warn(p, `${e} — the plan refuses to run until it is scripted`);
    const ids = rp.resolvedIdsIn(plan.text);
    if (ids && ids.join() !== res.selected.map((c) => c.id).join())
      warn(p, `\`## Resolved cases\` is stale (${ids.length} listed, ${res.selected.length} resolve now) — node scripts/shared/run-plan.mjs resolve ${stem}`);
  }
}

// ── 13. Derived state (CONTRACTS §17) — generated, never hand-edited ─────────
if (existsSync("state.json")) {
  let state = null;
  try { state = JSON.parse(read("state.json")); } catch { err("state.json", "not valid JSON — regenerate it: node scripts/shared/build-state.mjs --root ."); }
  if (state && (!state.generator_version || !/^[0-9a-f]{64}$/.test(state.source_hash ?? ""))) {
    err("state.json", "no generator_version / source_hash — state.json is derived, never hand-edited (CONTRACTS §17); regenerate it: node scripts/shared/build-state.mjs --root .");
  } else if (state) {
    // Recompute the hash over the same sources the builder reads; a mismatch means an artifact
    // changed after the last derivation. A warning: the Stop hook rebuilds it at the end of the turn.
    const { buildState } = await import(new URL("./build-state.mjs", import.meta.url));
    if (buildState(".").source_hash !== state.source_hash) {
      warn("state.json", "out of date with the artifacts (source_hash differs) — node scripts/shared/build-state.mjs --root .");
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
for (const w of warnings) console.log(`  WARN  ${w}`);
for (const e of errors) console.log(`  ERROR ${e}`);
if (deprecatedCount) console.log(`  INFO  ${deprecatedCount} deprecated case(s) — kept as history, excluded from suites and run sets`);
console.log(`\nqa:lint — ${errors.length} error(s), ${warnings.length} warning(s)`);
if (errors.length) { console.log("Contracts reference: .claude/CONTRACTS.md"); process.exit(1); }
