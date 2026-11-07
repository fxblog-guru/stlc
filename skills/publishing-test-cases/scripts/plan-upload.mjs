// plan-upload.mjs — STEP 1 (no token needed; reads ADO_BASE_URL from the env file).
// Resolve WHICH TMS Area Path each selected case belongs to (from mapping-path.md
// rules embedded in lib.mjs), GROUP the cases by area path, flag anything unmapped,
// print a confirmation table, and write a plan JSON the push step consumes.
//
// Because a batch of many slugs can fan out across many different area paths, this
// step makes the per-case destination explicit BEFORE anything is pushed.
//
// Usage:
//   node plan-upload.mjs --all
//   node plan-upload.mjs --dir cases/api/orders
//   node plan-upload.mjs --files cases/api/orders/TC-....md,cases/e2e/orders/TC-....md
//   node plan-upload.mjs --match TC-API-ORDERS-        (substring filter over cases/**)
// Options:
//   --platform-root <path>   override the auto-detected QA root (.stlc/ or qa/)
//   --out <path>             plan JSON output (default <platform>/config/tms/upload-plan.json)
//   --json                   print the plan JSON to stdout instead of the table
//   --check-existing         ALSO query ADO and mark cases that already exist in the
//                            target suite (needs token + --plan-id/--suite or .env)
//   --plan-id / --suite      the Test Plan + Suite to check against (or PLAN_ID/SUITE_ID in .env)
//   --env uat|staging|live   which .env.<env> to read the token from (default uat)

import fs from 'node:fs';
import path from 'node:path';
import {
  resolvePlatformRoot, casesRoot, derivePlacement, deriveAreaPath,
  parseCase, parseArgs, toPosix, loadEnv, adoConfig, adoAuthHeader, fetchSuiteTestCases,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const platformRoot = resolvePlatformRoot(args['platform-root']);
const root = casesRoot(platformRoot);

if (!fs.existsSync(root)) {
  console.error(`cases/ not found at ${root}. Pass --platform-root <qa>.`);
  process.exit(1);
}

// TMS config (base URL / project / area root) comes from the env file — needed to
// derive area paths even though this step needs no token.
const env = loadEnv(platformRoot, args.env || 'uat');
try { adoConfig(env); } catch (e) { console.error(e.message); process.exit(1); }

// ── collect case files ───────────────────────────────────────────────────────
function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out; // missing dir → no cases (caller reports it gracefully)
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '_template') out.push(...walk(full)); } // skeletons are not cases
    else if (e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md') out.push(full);
  }
  return out;
}

let files = [];
if (args.files) {
  files = String(args.files).split(',').map((f) => f.trim()).filter(Boolean)
    .map((f) => (path.isAbsolute(f) ? f : path.resolve(platformRoot, f)));
} else if (args.dir) {
  const d = path.isAbsolute(args.dir) ? args.dir : path.resolve(platformRoot, args.dir);
  files = walk(d);
} else if (args.all || args.match) {
  files = walk(root);
  if (args.match) files = files.filter((f) => path.basename(f).includes(String(args.match)));
} else {
  console.error('Nothing selected. Use --all, --dir <path>, --files a,b, or --match <substr>.');
  process.exit(1);
}

files = files.filter((f) => fs.existsSync(f));

if (!files.length) {
  const where = args.dir ? `--dir ${args.dir}` : args.files ? `--files ${args.files}` : args.match ? `--match ${args.match}` : '--all';
  console.error(`No case .md files found for ${where} (looked under ${root}). Check the path or that the cases exist.`);
  process.exit(1);
}

// ── resolve each case ────────────────────────────────────────────────────────
const items = [];
for (const f of files) {
  const rel = toPosix(path.relative(root, f));
  const placement = derivePlacement(rel);
  const { areaPath, warning, tags } = deriveAreaPath(placement);
  let c;
  try { c = parseCase(f); } catch (e) { c = null; }
  const declared = c ? c.declaredAreaPath : '';
  const mismatch = declared && areaPath && declared.trim() !== areaPath.trim()
    ? `declared "${declared}" ≠ derived "${areaPath}"` : null;
  // local dedup signal: has this slug already been published? Read the TMS id from the
  // "TMS Test Plan link" section written into the case .md (no sidecar).
  let publishedLocal = null;
  try {
    const md = fs.readFileSync(f, 'utf8');
    if (md.includes('## TMS Test Plan link')) {
      const m = md.match(/_workitems\/edit\/(\d+)/);
      if (m) publishedLocal = Number(m[1]);
    }
  } catch { /* */ }
  items.push({
    slug: placement.slug,
    file: rel,
    absFile: f,
    type: placement.type,
    surface: placement.surface,
    module: placement.module,
    sub: placement.sub || '',
    areaPath,
    declaredAreaPath: declared || '',
    extraTags: tags,
    priority: c ? c.priority : '',
    title: c ? c.humanTitle : placement.slug,
    steps: c ? c.steps.length : 0,
    warning: warning || null,
    mismatch,
    blocked: !areaPath, // no area path derivable → cannot push until resolved
    publishedLocal,     // TMS id if the case .md already carries a "TMS Test Plan link"
    existsInSuite: null, // set by --check-existing: TMS id if a case with this local-ID already sits in the suite
  });
}

// ── optional: check ADO for cases already in the target suite (no double-push) ─
let existingChecked = false;
if (args['check-existing']) {
  const planId = args['plan-id'] || env.PLAN_ID;
  const suiteId = args.suite || env.SUITE_ID;
  if (!planId || !suiteId) {
    console.error('--check-existing needs --plan-id/--suite (or PLAN_ID/SUITE_ID in .env).');
    process.exit(1);
  }
  let auth;
  try { auth = adoAuthHeader(env); } catch (e) { console.error(e.message); process.exit(1); }
  try {
    const existing = await fetchSuiteTestCases(auth, planId, suiteId);
    for (const it of items) {
      const hit = existing.find((e) => e.name === it.slug || e.name.startsWith(it.slug + ' '));
      if (hit) it.existsInSuite = hit.id;
    }
    existingChecked = true;
    console.log(`Checked suite ${planId}/${suiteId}: ${existing.length} existing test case(s).`);
  } catch (e) {
    console.error(`Could not check existing cases: ${e.message}`);
    process.exit(1);
  }
}

// ── group by area path ───────────────────────────────────────────────────────
const groups = {};
for (const it of items) {
  const key = it.areaPath || '(UNMAPPED — needs QA lead / manual area)';
  (groups[key] ||= []).push(it);
}

const existsCount = items.filter((it) => it.existsInSuite || it.publishedLocal).length;
const willPush = items.filter((it) => !it.blocked && !it.existsInSuite && !it.publishedLocal).length;
const plan = {
  generatedFrom: toPosix(path.relative(platformRoot, root)),
  platformRoot,
  total: items.length,
  existingChecked,
  willPush,
  alreadyExists: existsCount,
  areaPaths: Object.keys(groups).sort(),
  groups,
  items,
};

const outPath = args.out
  ? (path.isAbsolute(args.out) ? args.out : path.resolve(platformRoot, args.out))
  : path.join(platformRoot, 'config', 'tms', 'upload-plan.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(plan, null, 2));

if (args.json) { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }

// ── human confirmation table ─────────────────────────────────────────────────
console.log(`\nUpload plan — ${items.length} case(s) → ${plan.areaPaths.length} TMS Area Path(s)\n`);
for (const area of plan.areaPaths) {
  const g = groups[area];
  console.log(`■ ${area}   (${g.length} case${g.length > 1 ? 's' : ''})`);
  for (const it of g) {
    const status = it.existsInSuite ? `↷ EXISTS in suite #${it.existsInSuite} (skip)`
      : it.publishedLocal ? `↷ published-local #${it.publishedLocal} (skip)`
      : it.blocked ? '✖ no area — cannot push'
      : '＋ NEW → will push';
    const flags = [
      it.warning ? `⚠ ${it.warning}` : '',
      it.mismatch ? `⚠ ${it.mismatch}` : '',
      it.extraTags.length ? `tags:${it.extraTags.join(',')}` : '',
    ].filter(Boolean).join('  ');
    console.log(`    - [${status}]  ${it.slug}  [${it.priority || 'P?'} · ${it.steps} steps]  ${flags}`);
  }
  console.log('');
}

const blocked = items.filter((it) => it.blocked);
const warned = items.filter((it) => it.warning && !it.blocked);
if (blocked.length) {
  console.log(`✖ ${blocked.length} case(s) have NO TMS area (unmapped type/module) — cannot push until an area is chosen:`);
  for (const it of blocked) console.log(`    - ${it.file}  (${it.warning})`);
  console.log('');
}
if (warned.length) {
  console.log(`⚠ ${warned.length} case(s) fell back / need QA-lead confirmation (module not in the mapping table).`);
  console.log('');
}
if (existingChecked) {
  console.log(`Existence: ${willPush} NEW to push · ${existsCount} already exist (will be skipped).`);
} else {
  console.log('Existence: NOT checked against ADO. Add --check-existing --plan-id <P> --suite <S> to detect cases already in the suite (avoid double-push).');
}
console.log('');
console.log(`Plan written to: ${toPosix(path.relative(platformRoot, outPath))}`);
console.log('Next: confirm with the user, run ensure-area-path.mjs for any missing paths, then push-cases.mjs --plan <plan> (it skips cases already in the suite).');
