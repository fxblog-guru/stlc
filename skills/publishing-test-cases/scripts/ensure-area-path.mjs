// ensure-area-path.mjs — STEP 2 (token needed).
// Verify the TMS Area Path(s) exist in ADO; create the missing ones (only with
// --create, i.e. after the user approves). Works on a single --area or on every
// area path found in a plan JSON (--plan). Read-only by default (safe to run).
//
// Usage:
//   node ensure-area-path.mjs --plan config/tms/upload-plan.json            # check only
//   node ensure-area-path.mjs --plan config/tms/upload-plan.json --create   # create missing
//   node ensure-area-path.mjs --area "<Project>\<Area Root>\API Test Cases\Orders" --create
// Options:
//   --env uat|staging|live   which .env.<env> to read the token from (default uat)
//   --platform-root <path>   override the auto-detected QA root (.stlc/ or qa/)

import fs from 'node:fs';
import path from 'node:path';
import {
  resolvePlatformRoot, loadEnv, adoConfig, adoAuthHeader, parseArgs,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const platformRoot = resolvePlatformRoot(args['platform-root']);
const env = loadEnv(platformRoot, args.env || 'uat');
let ADO;
try { ADO = adoConfig(env); } catch (e) { console.error(e.message); process.exit(1); }
let AUTH;
try { AUTH = adoAuthHeader(env); } catch (e) { console.error(e.message); process.exit(1); }
const API = 'api-version=7.1';
const CREATE = !!args.create;

async function ado(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, ok: res.ok, json, text };
}

// "<Project>\QA Team\API Test Cases\Orders" → ["QA Team","API Test Cases","Orders"]
function segmentsOf(areaPath) {
  const parts = areaPath.split('\\').map((s) => s.trim()).filter(Boolean);
  if (parts[0] === ADO.project) parts.shift(); // drop project root
  return parts;
}
const nodePath = (segs) => segs.map(encodeURIComponent).join('/');

async function exists(segs) {
  if (!segs.length) return true; // project root always exists
  const r = await ado('GET', `${ADO.baseUrl}/_apis/wit/classificationnodes/areas/${nodePath(segs)}?${API}`);
  return r.status === 200;
}

async function createLeaf(parentSegs, name) {
  const parent = nodePath(parentSegs);
  const url = parent
    ? `${ADO.baseUrl}/_apis/wit/classificationnodes/areas/${parent}?${API}`
    : `${ADO.baseUrl}/_apis/wit/classificationnodes/areas?${API}`;
  return ado('POST', url, { name });
}

// Ensure every segment of an area path exists; create missing ones if CREATE.
async function ensure(areaPath) {
  const segs = segmentsOf(areaPath);
  const report = { areaPath, existed: [], created: [], missing: [], error: null };
  for (let i = 0; i < segs.length; i++) {
    const prefix = segs.slice(0, i + 1);
    if (await exists(prefix)) { report.existed.push(prefix.join('\\')); continue; }
    if (!CREATE) { report.missing.push(prefix.join('\\')); continue; }
    const r = await createLeaf(segs.slice(0, i), segs[i]);
    if (r.ok) report.created.push(prefix.join('\\'));
    else { report.error = `create "${segs[i]}" failed: HTTP ${r.status} ${r.text.slice(0, 300)}`; break; }
  }
  return report;
}

// ── gather target area paths ─────────────────────────────────────────────────
let targets = [];
if (args.area) targets = [String(args.area)];
else if (args.plan) {
  const p = path.isAbsolute(args.plan) ? args.plan : path.resolve(platformRoot, args.plan);
  const plan = JSON.parse(fs.readFileSync(p, 'utf8'));
  targets = (plan.areaPaths || []).filter((a) => a && a.startsWith(ADO.project + '\\'));
} else {
  console.error('Pass --area "<Project>\\<Area Root>\\..." or --plan <plan.json>.');
  process.exit(1);
}

if (!targets.length) { console.error('No valid area paths to check (unmapped areas are skipped).'); process.exit(1); }

console.log(`${CREATE ? 'Ensuring (create-if-missing)' : 'Checking (read-only)'} ${targets.length} area path(s) on ${ADO.baseUrl}\n`);
let anyMissing = false;
let anyError = false;
for (const area of targets) {
  const r = await ensure(area);
  const status = r.error ? '✖ ERROR'
    : r.missing.length ? '✖ MISSING'
    : r.created.length ? '✔ CREATED'
    : '✔ exists';
  console.log(`${status}  ${area}`);
  if (r.created.length) console.log(`        created: ${r.created.join('  |  ')}`);
  if (r.missing.length) { console.log(`        missing: ${r.missing.join('  |  ')}`); anyMissing = true; }
  if (r.error) { console.log(`        ${r.error}`); anyError = true; }
}
console.log('');
if (anyError) { console.log('Some area paths could not be created — check the PAT scope (Work Items R&W) and the parent path.'); process.exit(2); }
if (anyMissing && !CREATE) { console.log('Some area paths do not exist. Re-run with --create (after the user approves) to create them.'); process.exit(3); }
console.log(CREATE ? 'All target area paths now exist. Safe to push.' : 'All target area paths exist. Safe to push.');
