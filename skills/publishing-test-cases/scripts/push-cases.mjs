// push-cases.mjs — STEP 3 (token needed). Pushes each case to ITS OWN area path.
// Consumes the plan JSON from plan-upload.mjs, so a batch of many slugs lands in
// the correct (possibly many) area paths — never all in one default area.
//
// - Creates a Test Case work item per case (title = "<TC-id> — <title>", priority
//   mapped P0→1/P1→2/P2→3/P3→4, per-case System.AreaPath, preconditions → System.Description
//   (Summary), steps = authored steps + expected result).
// - Adds each created work item to the given Test Plan suite.
// - Writes the TMS id back INTO the case .md ("TMS Test Plan link" section) and adds
//   a @tms:<id> tag to the case's **Tags:** line — no sidecar. RESUMABLE: skips cases
//   already in the suite (live scan) or already carrying a TMS link in their .md.
//
// Usage:
//   node push-cases.mjs --plan config/tms/upload-plan.json --plan-id <PLAN> --suite <SUITE> --tags "TCK-1234; orders" --dry-run
//   node push-cases.mjs --plan config/tms/upload-plan.json --plan-id <PLAN> --suite <SUITE> --tags "TCK-1234; orders"   # publish
//   node push-cases.mjs --md cases/api/orders/TC-API-ORDERS-001-....md --plan-id <PLAN> --suite <SUITE> --tags "TCK-1234"
// Options:
//   --ids A,B,C     only these slugs/local-ids   --only <slug>   single canary case
//   --iteration <p> default = the ADO project    --env uat       .env.<env> for the token
//   --dry-run       parse + print, create nothing (no token needed; still reads
//                   ADO_BASE_URL from the env file)

import fs from 'node:fs';
import path from 'node:path';
import {
  resolvePlatformRoot, casesRoot, loadEnv, adoConfig, adoAuthHeader,
  derivePlacement, deriveAreaPath, parseCase, buildStepsXml, buildDescriptionHtml, adoPriority,
  parseArgs, toPosix, fetchSuiteTestCases,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const platformRoot = resolvePlatformRoot(args['platform-root']);
const root = casesRoot(platformRoot);
const DRY = !!args['dry-run'];
const env = loadEnv(platformRoot, args.env || 'uat');
let ADO;
try { ADO = adoConfig(env); } catch (e) { console.error(e.message); process.exit(1); }
const API = 'api-version=7.1';
const iteration = args.iteration || ADO.project;

const planId = args['plan-id'] || env.PLAN_ID;
const suiteId = args.suite || env.SUITE_ID;
if (!DRY) {
  if (!planId || !suiteId) {
    console.error('Missing --plan-id / --suite (or PLAN_ID / SUITE_ID in .env). Ask the user for an EXISTING plan+suite — never create them.');
    process.exit(1);
  }
}

// base tags: always Agentic-Created + whatever the user passed
const baseTags = ['Agentic-Created'];
if (args.tags) for (const t of String(args.tags).split(';')) { const v = t.trim(); if (v) baseTags.push(v); }

// ── build the work list from a plan or a single --md ─────────────────────────
function itemFromFile(absFile) {
  const rel = toPosix(path.relative(root, absFile));
  const placement = derivePlacement(rel);
  const { areaPath, tags } = deriveAreaPath(placement);
  return { slug: placement.slug, file: rel, absFile, areaPath, extraTags: tags };
}

let items = [];
if (args.plan) {
  const p = path.isAbsolute(args.plan) ? args.plan : path.resolve(platformRoot, args.plan);
  const plan = JSON.parse(fs.readFileSync(p, 'utf8'));
  items = plan.items.map((it) => ({
    slug: it.slug, file: it.file, absFile: it.absFile || path.resolve(root, it.file),
    areaPath: it.areaPath, extraTags: it.extraTags || [],
  }));
} else if (args.md) {
  const abs = path.isAbsolute(args.md) ? args.md : path.resolve(platformRoot, args.md);
  items = [itemFromFile(abs)];
} else {
  console.error('Pass --plan <plan.json> or --md <case.md>.');
  process.exit(1);
}

// filters
if (args.only) items = items.filter((it) => it.slug === String(args.only));
if (args.ids) {
  const set = new Set(String(args.ids).split(',').map((s) => s.trim()));
  items = items.filter((it) => set.has(it.slug));
}

const blocked = items.filter((it) => !it.areaPath);
if (blocked.length) {
  console.error(`✖ ${blocked.length} case(s) have no TMS area path — resolve those first (unmapped type/module). Aborting:`);
  for (const it of blocked) console.error(`    - ${it.file}`);
  process.exit(1);
}
if (!items.length) { console.error('No cases selected after filters.'); process.exit(1); }

// ── auth (must exist before the live suite scan below) ───────────────────────
let AUTH = null;
function auth() { if (!AUTH) AUTH = adoAuthHeader(env); return AUTH; }
if (!DRY) { try { auth(); } catch (e) { console.error(e.message); process.exit(1); } }

// ── DON'T PUSH TWICE: live scan of the suite before creating anything ─────────
const suiteExisting = new Map(); // slug → existing TMS id
if (!DRY && !args.force && planId && suiteId) {
  try {
    const existing = await fetchSuiteTestCases(auth(), planId, suiteId);
    for (const it of items) {
      const hit = existing.find((e) => e.name === it.slug || e.name.startsWith(it.slug + ' '));
      if (hit) suiteExisting.set(it.slug, hit.id);
    }
    if (suiteExisting.size) console.log(`Suite already contains ${suiteExisting.size} of these case(s) — they will be skipped (use --force to push anyway).\n`);
  } catch (e) {
    console.error(`Could not verify existing cases in the suite: ${e.message}`);
    console.error('Refusing to push blind (risk of duplicates). Fix the token/plan/suite, or pass --force to override.');
    process.exit(1);
  }
}

// ── ADO helpers ──────────────────────────────────────────────────────────────
async function createWorkItem(fields) {
  const patch = Object.entries(fields).map(([k, v]) => ({ op: 'add', path: `/fields/${k}`, value: v }));
  const url = `${ADO.baseUrl}/_apis/wit/workitems/${encodeURIComponent('$Test Case')}?${API}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: auth(), 'Content-Type': 'application/json-patch+json' },
    body: JSON.stringify(patch),
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  if (!res.ok) throw new Error(`create work item failed: HTTP ${res.status} ${text.slice(0, 400)}`);
  return json;
}

async function addToSuite(workItemId) {
  const url = `${ADO.baseUrl}/_apis/testplan/Plans/${planId}/Suites/${suiteId}/TestCase?${API}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify([{ workItem: { id: workItemId } }]),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`add to suite failed: HTTP ${res.status} ${text.slice(0, 400)}`);
  }
}

// Record the published TMS id INSIDE the case .md (no sidecar).
// Idempotent: if a "TMS Test Plan link" section already exists, replace it; and add
// a @tms:<id> tag to the **Tags:** line (contract #6) if not already present.
function mdHasTmsLink(absFile) {
  try { return fs.readFileSync(absFile, 'utf8').includes('## TMS Test Plan link'); }
  catch { return false; }
}
function existingTmsId(absFile) {
  try {
    const m = fs.readFileSync(absFile, 'utf8').match(/_workitems\/edit\/(\d+)/);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}
function writeTmsLinkToMd(absFile, slug, entry) {
  let md = fs.readFileSync(absFile, 'utf8');
  const section =
    `## TMS Test Plan link\n` +
    `| Local ID | TMS Work Item | Plan | Suite |\n` +
    `|---|---|---|---|\n` +
    `| ${slug} | [#${entry.id}](${entry.url}) | ${entry.plan} | ${entry.suite} |\n`;
  // drop any prior section (keep it idempotent)
  md = md.replace(/\n?## TMS Test Plan link\n(?:.*\n)*?(?=\n## |\n?$)/, '\n');
  // add @tms:<id> to the **Tags:** line if not already there
  md = md.replace(/^(\*\*Tags:\*\*\s*.*)$/m, (line) =>
    line.includes('@tms:') ? line.replace(/@tms:\S+/, `@tms:${entry.id}`) : `${line} @tms:${entry.id}`);
  // append the link section at the end
  md = md.replace(/\n?$/, `\n\n${section}`);
  fs.writeFileSync(absFile, md);
}

// ── run ──────────────────────────────────────────────────────────────────────
console.log(`${DRY ? 'DRY-RUN' : 'PUBLISH'} — ${items.length} case(s) → plan ${planId || '(dry)'} / suite ${suiteId || '(dry)'}\n`);
let created = 0, skipped = 0, failed = 0;
let sampleShown = false;

for (const it of items) {
  let c;
  try { c = parseCase(it.absFile); } catch (e) { console.log(`  ✖ ${it.slug}: parse error ${e.message}`); failed++; continue; }
  const { xml, count } = buildStepsXml(c);
  const title = `${it.slug} — ${c.humanTitle}`.slice(0, 255);
  const priority = adoPriority(c.priority);
  const tags = [...baseTags, ...it.extraTags].join('; ');

  if (suiteExisting.has(it.slug)) {
    console.log(`  ↷ ${it.slug}: already in suite as #${suiteExisting.get(it.slug)} (skip)`);
    skipped++; continue;
  }
  if (mdHasTmsLink(it.absFile)) {
    console.log(`  ↷ ${it.slug}: already published as #${existingTmsId(it.absFile)} (link in .md) (skip)`);
    skipped++; continue;
  }

  if (DRY) {
    console.log(`  • ${it.slug}`);
    console.log(`      title:  ${title}`);
    console.log(`      area:   ${it.areaPath}`);
    const stepBreak = `${c.steps.length} authored ${c.expectedResult.length ? '+1exp' : ''} = ${count} ADO steps`.replace(/\s+/g, ' ');
    console.log(`      prio:   ${c.priority || 'P?'}→${priority}   steps: ${stepBreak}${c.preconditions.length ? `   (${c.preconditions.length} preconditions → Summary/Description)` : ''}`);
    console.log(`      tags:   ${tags}`);
    if (!sampleShown) { console.log(`      steps-xml sample:\n${xml}\n`); sampleShown = true; }
    created++; continue;
  }

  try {
    const descriptionHtml = buildDescriptionHtml(c);
    const wiFields = {
      'System.Title': title,
      'Microsoft.VSTS.Common.Priority': priority,
      'System.AreaPath': it.areaPath,
      'System.IterationPath': iteration,
      'System.Tags': tags,
      'Microsoft.VSTS.TCM.Steps': xml,
    };
    if (descriptionHtml) wiFields['System.Description'] = descriptionHtml;
    const wi = await createWorkItem(wiFields);
    await addToSuite(wi.id);
    writeTmsLinkToMd(it.absFile, it.slug, {
      id: wi.id,
      url: `${ADO.baseUrl}/_workitems/edit/${wi.id}`,
      areaPath: it.areaPath, plan: planId, suite: suiteId,
    });
    console.log(`  ✔ ${it.slug} → #${wi.id}   ${it.areaPath}`);
    created++;
  } catch (e) {
    console.log(`  ✖ ${it.slug}: ${e.message}`);
    failed++;
  }
}

console.log(`\n${DRY ? 'DRY-RUN done' : 'Done'} — ${created} ${DRY ? 'would create' : 'created'}, ${skipped} skipped, ${failed} failed.`);
if (!DRY && created) console.log('TMS ids written into each case .md ("TMS Test Plan link" section + @tms:<id> tag). No sidecar is created.');
if (failed) process.exit(2);
