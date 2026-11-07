/**
 * maestro.mjs — the Maestro runner's shared model (CONTRACTS §15 Maestro, §20 runner `maestro`).
 * One reading of a flow file and of a Maestro JUnit report, used by lint-qa.mjs (the static rules),
 * run-maestro.mjs (the runner) and run-plan.mjs (verdicts), so the three never disagree.
 *
 * A Maestro flow is YAML: a config section, `---`, then the command list. This bundle reads it with
 * line patterns, not a YAML parser, for the same reason lint-qa reads specs with patterns: the lint
 * runs before `npm install`, and the rules below only need the lines they name.
 */
import { existsSync } from 'node:fs';
import { junitOutcomes as junitOf, readJunit as readJunitOf } from './junit.mjs';
import { dirname, join, posix } from 'node:path';

/** A case flow: `scripts/mobile/<module>/TC-MOB-<MODULE>-<NNN>-<desc>.yaml`. */
export const FLOW_FILE_RE = /^TC-MOB-[A-Z0-9-]+-\d{3}-[a-z0-9][a-z0-9-]*\.yaml$/;
/** Suite tags a flow carries without the `@` (Maestro tags are bare words). */
export const SUITE_TAGS = ['smoke', 'regression'];

const norm = (t) => t.replace(/\r\n?/g, '\n');
// A YAML scalar after `key:` — quoted, a `${…}` expression (which holds braces), or a bare word up to
// the next `,` / `}` of a flow mapping.
const VALUE = String.raw`("([^"]*)"|'([^']*)'|(\$\{[^}]*\})|([^,}\s][^,}]*))`;
const valueOf = (m) => (m[2] ?? m[3] ?? m[4] ?? m[5] ?? '').trim();

/**
 * Parse a flow into what the rules need. `config` is the text before the first `---` line.
 *   name, appId, tags[], steps[{ n, label, line }], ids[{ value, line }], timeouts[{ value, line }],
 *   refs[{ path, line }] (runFlow / runScript / file: targets), hasCleanup, loadsElements[]
 */
export function parseFlow(text) {
  const src = norm(text);
  const lines = src.split('\n');
  const sep = lines.findIndex((l) => l.trim() === '---');
  const config = sep >= 0 ? lines.slice(0, sep) : lines;
  const scalar = (key) => {
    const l = config.find((x) => new RegExp(`^${key}:`).test(x));
    return l ? l.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') : null;
  };
  const tags = [];
  const ti = config.findIndex((l) => /^tags:\s*$/.test(l));
  if (ti >= 0) for (const l of config.slice(ti + 1)) { const m = /^\s+-\s+(\S+)\s*$/.exec(l); if (!m) break; tags.push(m[1].replace(/^["']|["']$/g, '')); }
  const inline = config.find((l) => /^tags:\s*\[/.test(l));
  if (inline) tags.push(...inline.replace(/^tags:\s*\[|\]\s*$/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean));
  const steps = []; const ids = []; const timeouts = []; const refs = [];
  lines.forEach((l, i) => {
    const line = i + 1;
    const code = l.replace(/\s+#.*$/, '');
    const st = /label:\s*["']?Step (\d+)\b([^"']*)/.exec(code);
    if (st) steps.push({ n: Number(st[1]), label: `Step ${st[1]}${st[2]}`.trim(), line });
    for (const m of code.matchAll(new RegExp(`\\bid:\\s*${VALUE}`, 'g'))) ids.push({ value: valueOf(m), line });
    for (const m of code.matchAll(new RegExp(`\\btimeout:\\s*${VALUE}`, 'g'))) timeouts.push({ value: valueOf(m), line });
    for (const m of code.matchAll(/(?:runFlow|runScript|file):\s*["']?([^"'\s{},]+\.(?:yaml|js))/g)) refs.push({ path: m[1], line });
  });
  return {
    name: scalar('name'),
    appId: scalar('appId'),
    tags,
    steps,
    ids,
    timeouts,
    refs,
    hasCleanup: refs.some((r) => /(^|\/)cleanup\.yaml$/.test(r.path)),
    loadsElements: refs.filter((r) => /(^|\/)elements\/[a-z0-9-]+\.js$/.test(r.path)).map((r) => posix.basename(r.path, '.js')),
  };
}

/** True when a selector value comes from the module's element map (`${output.<module>.<key>}`). */
export const fromElementMap = (v) => /^\$\{output\.[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)+\}$/.test(v);
/** True when a timeout comes from the one timeouts table (`${output.T.<name>}`). */
export const fromTimeouts = (v) => /^\$\{output\.T\.[A-Za-z0-9_]+\}$/.test(v);

/** A referenced file, resolved the way Maestro does: relative to the calling flow's directory. */
export function resolveRef(flowPath, ref) {
  return join(dirname(flowPath), ref).replace(/\\/g, '/');
}

/**
 * The static rules for one case flow (lint-qa section 7b). `c` is the case ({ id, title, module,
 * priority, suites[], stepCount }) or null. Returns [{ level: 'error'|'warn', msg }].
 */
export function flowProblems(flowPath, text, c) {
  const f = parseFlow(text);
  const out = [];
  const err = (msg) => out.push({ level: 'error', msg });
  const warn = (msg) => out.push({ level: 'warn', msg });
  const caseId = (posix.basename(flowPath).match(/^(TC-MOB-[A-Z0-9-]+?-\d{3})-/) ?? [])[1];
  if (!f.name) err('no `name:` — the name is the JUnit test name, so it starts with the Case ID (CONTRACTS §15)');
  else if (!f.name.startsWith(`${caseId} — `) && f.name !== caseId) err(`\`name:\` must start with \`${caseId} — \` (got \`${f.name.slice(0, 40)}\`) — results map back to the case by this id`);
  else if (c?.title && f.name !== `${caseId} — ${c.title}`) warn(`\`name:\` should mirror the case title: \`${caseId} — ${c.title}\``);
  if (f.appId !== '${APP_ID}') err(`\`appId:\` must be \`\${APP_ID}\` (got \`${f.appId ?? 'nothing'}\`) — the runner passes the platform's app id from .env.<env>; a literal id pins one build`);
  if (f.tags.some((t) => t.startsWith('@'))) err('Maestro tags are bare words (`regression`, not `@regression`)');
  if (c) {
    const want = ['mobile', c.module, c.priority, ...c.suites].filter(Boolean);
    for (const t of want) if (!f.tags.includes(t)) err(`tags lack \`${t}\` — a flow carries mobile, its module, its priority and the case's suite tags, so --include-tags selects it`);
  }
  if (!f.steps.length) err('no `label: "Step N: …"` — every case step is one labelled block (CONTRACTS §7 Script naming)');
  const bad = f.steps.findIndex((s, i) => s.n !== i + 1);
  if (bad >= 0) err(`step labels ${f.steps.map((s) => s.n).join(', ')} are not 1..${f.steps.length} in order — Step N is the case's step number`);
  else if (c?.stepCount && f.steps.length !== c.stepCount) warn(`${f.steps.length} step label(s) for ${c.stepCount} case step(s) — a step the flow cannot run is labelled and marked \`# COVERAGE-GAP\`, never dropped`);
  for (const i of f.ids) if (!fromElementMap(i.value)) err(`line ${i.line}: raw selector \`id: ${i.value}\` — ids live in shared/maestro/elements/<module>.js; use \`\${output.<module>.<name>}\``);
  for (const t of f.timeouts) if (!fromTimeouts(t.value)) err(`line ${t.line}: literal \`timeout: ${t.value}\` — durations live in shared/maestro/scripts/run-context.js; use \`\${output.T.<name>}\``);
  for (const r of f.refs) if (!existsSync(resolveRef(flowPath, r.path))) err(`line ${r.line}: \`${r.path}\` does not exist (Maestro resolves it from the flow's folder)`);
  if (c?.module && !f.loadsElements.includes(c.module)) warn(`does not load elements/${c.module}.js — the module's element map is the only place its ids live`);
  if (!f.hasCleanup) warn('no `onFlowComplete` cleanup — data the flow creates must be removed even when it fails (shared/maestro/flows/cleanup.yaml)');
  if (/^\s*-\s*(sleep|wait)\b/m.test(text)) err('a fixed wait — wait for a condition with extendedWaitUntil');
  return out;
}

/** Steps a case lists (`1. Action:` lines under `## Steps`). */
export function caseStepCount(caseText) {
  const sec = norm(caseText).split(/^## /m).find((s) => s.startsWith('Steps')) ?? '';
  return [...sec.matchAll(/^\d+\.\s+Action:/gm)].length;
}

/** A Maestro JUnit report → the results contract (lib/junit.mjs), keyed by the mobile Case ID. */
const MOB_ID = /^(TC-MOB-[A-Z0-9-]+?-\d{3})\b/;
export const junitOutcomes = (xml) => junitOf(xml, MOB_ID);
export const readJunit = (path) => readJunitOf(path, MOB_ID);
