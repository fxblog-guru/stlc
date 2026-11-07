// lib.mjs — shared helpers for the publishing-test-cases skill (agentic-fx-qa).
//
// Single source of truth for: locating the QA root, loading the TMS token
// from <qa-root>/.env.<env>, parsing a case .md, and DERIVING the TMS Area Path from a
// case's local path. The area-path rules below MIRROR
//   <qa-root>/config/tms/mapping-path.md
// If that table changes, update the rules here to match (and vice-versa).
//
// PROJECT SETUP: everything org-specific is env-driven (ADO_BASE_URL, TMS_ADO_PAT,
// optional ADO_PROJECT / ADO_AREA_ROOT in <qa-root>/.env.<env>); the TYPES list,
// MODULE_SEGMENT table, and deriveAreaPath rules are the parts you edit to mirror
// YOUR project's mapping-path.md.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Locating the QA root ─────────────────────────────────────────────────────
// scripts/ lives at <project>/.claude/skills/publishing-test-cases/scripts/
// the QA root is <project>/.stlc/ (or qa/ on a project installed before 2.1) — the same order as
// <qa-root>/scripts/shared/lib/root.mjs (CONTRACTS §2): --platform-root, QA_ROOT, then .stlc, then qa.
const ROOT_NAMES = ['.stlc', 'qa'];
export function resolvePlatformRoot(override) {
  if (override) return path.resolve(override);
  const project = path.resolve(__dirname, '../../../..');
  if (process.env.QA_ROOT) return path.resolve(project, process.env.QA_ROOT);
  for (const n of ROOT_NAMES) {
    const guess = path.join(project, n);
    if (fs.existsSync(path.join(guess, 'cases'))) return guess;
  }
  // fall back: walk up until we find <root>/cases
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    for (const n of ROOT_NAMES) {
      const cand = path.join(dir, n);
      if (fs.existsSync(path.join(cand, 'cases'))) return cand;
    }
    dir = path.dirname(dir);
  }
  return path.join(project, ROOT_NAMES[0]); // best effort; caller will error if cases/ is missing
}

export function casesRoot(platformRoot) {
  return path.join(platformRoot, 'cases');
}

// ── .env loader (minimal, no dependency) ─────────────────────────────────────
// Loads <qa-root>/.env.<env> into an object. process.env values take precedence (so a
// live shell export can override the file).
export function loadEnv(platformRoot, envName = 'uat') {
  const out = {};
  const file = path.join(platformRoot, `.env.${envName}`);
  if (fs.existsSync(file)) {
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
  }
  // process.env wins
  for (const k of Object.keys(process.env)) {
    if (process.env[k] !== undefined && process.env[k] !== '') out[k] = process.env[k];
  }
  out.__envFile = file;
  return out;
}

// ── TMS connection (Azure DevOps reference impl — no org/project hardcoded) ───
// ADO_BASE_URL  = org + project, e.g. https://<org>.visualstudio.com/<project>
//                 (or https://dev.azure.com/<org>/<project> — use whichever host the
//                 PAT actually authenticates against; some tenants 401 on one form).
// ADO_PROJECT   = optional override; default = the last path segment of ADO_BASE_URL.
// ADO_AREA_ROOT = optional area-path root every published case lives under
//                 (e.g. "MyProject\\QA Team"); default = the ADO project name.
let _ado = null;
export function adoConfig(env) {
  const raw = String(env.ADO_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!raw) {
    throw new Error(
      'ADO_BASE_URL not set. Add ADO_BASE_URL=https://<org>.visualstudio.com/<project> ' +
      `(or https://dev.azure.com/<org>/<project>) to ${env.__envFile} ` +
      '(see <qa-root>/.env.example), then re-run.'
    );
  }
  const project = env.ADO_PROJECT || decodeURIComponent(raw.split('/').pop());
  const areaRoot = env.ADO_AREA_ROOT || project;
  _ado = { baseUrl: raw, project, areaRoot };
  return _ado;
}
function requireAdo() {
  if (!_ado) throw new Error('TMS config not initialised — call adoConfig(loadEnv(...)) first.');
  return _ado;
}
// Org root (base URL minus the project segment) — used for the PAT-minting hint.
export function orgBaseUrl(env) {
  const raw = String(env.ADO_BASE_URL || '').trim().replace(/\/+$/, '');
  return raw ? raw.replace(/\/[^/]+$/, '') : '';
}

// Return the base64 Authorization value ("Basic <b64(:PAT)>") or throw with guidance.
export function adoAuthHeader(env) {
  const pat = env.TMS_ADO_PAT || '';
  const b64 = env.TMS_ADO_PAT_B64 || (pat ? Buffer.from(':' + pat).toString('base64') : '');
  if (!b64) {
    const org = orgBaseUrl(env) || 'https://<org>.visualstudio.com';
    throw new Error(
      'No TMS token found. Add TMS_ADO_PAT=<your PAT> to ' +
      `${env.__envFile} (see <qa-root>/.env.example), then re-run. ` +
      `Mint a PAT at ${org}/_usersSettings/tokens ` +
      '(scopes: Test Management R&W + Work Items R&W).'
    );
  }
  return `Basic ${b64}`;
}

// Fetch existing Test Cases already in a plan/suite → [{ id, name }]. Used to
// detect duplicates BEFORE pushing (match by local-ID prefix in the title).
// Throws on error (caller decides how strict to be); pages via continuation token.
export async function fetchSuiteTestCases(auth, planId, suiteId) {
  const { baseUrl } = requireAdo();
  const out = [];
  let url = `${baseUrl}/_apis/testplan/Plans/${planId}/Suites/${suiteId}/TestCase?api-version=7.1`;
  for (let guard = 0; guard < 200 && url; guard++) {
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (!res.ok) throw new Error(`fetch suite test cases failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    for (const e of json.value || []) {
      const wi = e.workItem || {};
      out.push({ id: wi.id, name: wi.name || '' });
    }
    const token = res.headers.get('x-ms-continuationtoken');
    url = token ? `${baseUrl}/_apis/testplan/Plans/${planId}/Suites/${suiteId}/TestCase?api-version=7.1&continuationToken=${encodeURIComponent(token)}` : null;
  }
  return out;
}

// ── Placement: derive type/surface/module/sub from a local path ──────────────
// relPath is relative to cases/, e.g. "api/orders/TC-....md" or
// "e2e/web/orders/TC-....md" when the profile declares surfaces.

// PROJECT SETUP — the test types (CONTRACTS §1; the registry is workspace/qa/scripts/shared/lib/types.mjs,
// and tests/bundle.test.mjs fails when this copy differs). First path segment under cases/.
export const TYPES = ['unit', 'api', 'integration', 'e2e', 'security', 'performance', 'accessibility', 'ui', 'mobile', 'data'];

// PROJECT SETUP — surfaces, ONLY if §Application under test declares them; the
// segment (if any) sits between <type> and <module>. Longest match wins. Leave
// empty when the product has no distinct surfaces.
export const SURFACES = [];

export function derivePlacement(relPath) {
  const parts = relPath.split(/[\\/]/).filter(Boolean);
  const file = parts[parts.length - 1];
  const slug = file.replace(/\.md$/i, '');
  const type = parts[0] || '';
  let rest = parts.slice(1, parts.length - 1); // [surface?] module [+ sub...]
  let surface = '';
  if (SURFACES.length) {
    const dirPath = rest.join('/');
    const hit = SURFACES.slice().sort((a, b) => b.length - a.length)
      .find((s) => dirPath === s || dirPath.startsWith(s + '/'));
    if (hit) { surface = hit; rest = rest.slice(hit.split('/').length); }
  }
  const module = rest[0] || '';
  const sub = rest.length > 1 ? rest.slice(1).join('/') : '';
  return { type, surface, module, sub, slug, relPath };
}

// PROJECT SETUP — Module → TMS area segment (Table 1 of mapping-path.md).
// Edit to mirror qa/config/tms/mapping-path.md for YOUR area tree.
const MODULE_SEGMENT = {
  orders: 'Orders', invoices: 'Invoices', customers: 'Customers', assets: 'Assets',
  stock: 'Stock', admin: 'Settings', auth: 'Auth', notifications: 'Notifications',
  permission: 'Permission', forms: 'Forms', reports: 'Reports',
};

// PROJECT SETUP — type → area segment (each test type gets its own area line).
const TYPE_SEGMENT = {
  unit: 'Unit Test Cases', e2e: 'E2E Test Cases', api: 'API Test Cases', integration: 'Integration Test Cases',
  security: 'Security Test Cases', performance: 'Performance Test Cases', accessibility: 'Accessibility Test Cases',
  mobile: 'Mobile Test Cases', ui: 'UI Test Cases',
};

// Derive the TMS Area Path (+ any warning + extra tags) for a placement.
// Returns { areaPath: string|null, warning: string|null, tags: string[] }.
// PROJECT SETUP — the rules below are a neutral default; edit them to mirror
// your mapping-path.md exactly.
export function deriveAreaPath(p) {
  const { areaRoot } = requireAdo();
  const tags = [];
  if (p.surface) tags.push(`@surface:${p.surface}`);

  const typeSeg = TYPE_SEGMENT[p.type];
  if (!typeSeg) return { areaPath: null, warning: `unknown type "${p.type}"`, tags };

  const seg = MODULE_SEGMENT[p.module];
  if (!seg) {
    return { areaPath: `${areaRoot}\\${typeSeg}`, warning: `module "${p.module}" not in mapping-path.md — flag the QA lead (fell back to ${typeSeg})`, tags };
  }
  return { areaPath: `${areaRoot}\\${typeSeg}\\${seg}`, warning: null, tags };
}

// ── Case .md parsing ─────────────────────────────────────────────────────────
function htmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function stripBold(s) {
  return String(s).replace(/\*\*(.+?)\*\*/g, '$1');
}
export function clean(s) {
  return htmlEscape(stripBold(String(s).trim()));
}

// Map authored priority "P0/P1/P2/P3" → ADO priority (1-based). Default 2.
export function adoPriority(p) {
  const m = String(p || '').match(/P(\d)/i);
  if (!m) return 2;
  return Math.min(4, parseInt(m[1], 10) + 1);
}

// Parse a case markdown file into a structured object.
export function parseCase(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const fields = {};
  const yaml = {};

  // YAML frontmatter (optional)
  if (lines[0] && lines[0].trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') break;
      const m = lines[i].match(/^([\w-]+):\s*(.*)$/);
      if (m) yaml[m[1]] = m[2].trim();
    }
  }

  // **Key:** value fields (Feature / Plan / Type / Module / Priority / Tags / Area Path)
  for (const l of lines) {
    const m = l.match(/^\*\*([\w /]+):\*\*\s*(.*)$/);
    if (m) fields[m[1].trim().toLowerCase()] = m[2].trim();
  }

  // H1 title — "# TC-<TYPE>-<MODULE>-<NNN> — <title>"
  let h1 = '';
  const h1line = lines.find((l) => /^#\s+/.test(l));
  if (h1line) {
    h1 = h1line.replace(/^#\s+/, '').trim();
    // strip a leading "TC-...-NNN — " id prefix if present
    h1 = h1.replace(/^TC-[A-Z0-9-]+\s*—\s*/i, '');
  }

  const slug = path.basename(filePath).replace(/\.md$/i, '');
  const humanTitle = fields['title'] || h1 || slug;
  const priority = fields['priority'] || yaml.priority || '';
  const declaredAreaPath = fields['area path'] || '';

  // Sectioned content
  const section = (name) => {
    const start = lines.findIndex((l) => new RegExp(`^##\\s+${name}\\b`, 'i').test(l));
    if (start < 0) return [];
    const body = [];
    for (let i = start + 1; i < lines.length; i++) {
      if (/^##\s+/.test(lines[i])) break;
      body.push(lines[i]);
    }
    return body;
  };

  const bullets = (body) =>
    body.map((l) => l.trim()).filter((l) => l.startsWith('- ') || l.startsWith('* ')).map((l) => l.replace(/^[-*]\s+/, ''));

  const preconditions = bullets(section('Preconditions'));
  const expectedResult = bullets(section('Expected Result'));

  // Steps — supports both "1. Action: … / Expected: …" (agentic-fx-qa case format)
  // and the legacy "Step N: … / Expected: …" shape.
  const stepBody = (() => {
    const start = lines.findIndex((l) => /^##\s+(Test Steps|Steps|Workload)\b/i.test(l));
    if (start < 0) return [];
    const body = [];
    for (let i = start + 1; i < lines.length; i++) {
      if (/^##\s+/.test(lines[i])) break;
      body.push(lines[i]);
    }
    return body;
  })();

  const steps = [];
  let cur = null;
  let mode = null; // 'action' | 'expected'
  const flush = () => { if (cur) { cur.action = cur.action.trim(); cur.expected = cur.expected.trim(); steps.push(cur); } };
  for (const l of stepBody) {
    // "1. Action: X"  |  "Action: X"  |  "Step 1: X"
    const sm = l.match(/^\s*(?:\d+\.\s*)?(?:Step\s+\d+\s*:|Action\s*:)\s*(.*)$/i);
    const em = l.match(/^\s*Expected\s*:\s*(.*)$/i);
    if (sm) { flush(); cur = { action: sm[1], expected: '' }; mode = 'action'; continue; }
    if (em) { if (cur) { cur.expected = em[1]; mode = 'expected'; } continue; }
    if (cur && l.trim()) { cur[mode === 'expected' ? 'expected' : 'action'] += ' ' + l.trim(); }
  }
  flush();

  return {
    filePath, slug, humanTitle, priority, declaredAreaPath,
    preconditions, steps, expectedResult, yaml, fields,
  };
}

// Build the work item Summary/Description HTML from the case Preconditions.
export function buildDescriptionHtml(c) {
  if (!c.preconditions.length) return '';
  const li = c.preconditions.map((p) => `<li>${clean(p)}</li>`).join('');
  return `<p><b>Preconditions</b></p><ul>${li}</ul>`;
}

// Build the Microsoft.VSTS.TCM.Steps XML: authored steps + expected (trailing).
export function buildStepsXml(c) {
  const xmlSteps = [];
  const push = (action, expected) => xmlSteps.push({ action, expected });

  for (const s of c.steps) {
    push(clean(s.action), s.expected ? clean(s.expected) : 'Action succeeds with no error.');
  }
  if (c.expectedResult.length) {
    const li = c.expectedResult.map((e) => `<li>${clean(e)}</li>`).join('');
    push('Verify the overall expected result for this test case.', `EXPECTED RESULT<ul>${li}</ul>`);
  }

  let id = 2;
  const body = xmlSteps
    .map((s) => {
      const step =
        `<step id="${id}" type="ActionStep">` +
        `<parameterizedString isformatted="true">${s.action}</parameterizedString>` +
        `<parameterizedString isformatted="true">${s.expected}</parameterizedString>` +
        `<description/></step>`;
      id += 1;
      return step;
    })
    .join('');
  const last = id - 1;
  return { xml: `<steps id="0" last="${last}">${body}</steps>`, count: xmlSteps.length };
}

// ── tiny arg parser ──────────────────────────────────────────────────────────
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { out[key] = true; }
      else { out[key] = next; i += 1; }
    } else out._.push(a);
  }
  return out;
}

export function toPosix(p) { return p.split(path.sep).join('/'); }
