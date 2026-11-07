#!/usr/bin/env node
/**
 * target.mjs — read what the environment is actually running, before a run judges it (CONTRACTS §31).
 *
 *   npm run qa:target -- --env <env> [--plan <slug>] [--expect <component>=<identity> …] [--out <run dir>] [--json]
 *
 * Reads `### Target identity` (PROJECT-PROFILE §Environments): one row per component of the system
 * — the service's commit, the web bundle's build, the mobile client's version, the flag set, the
 * schema version, the seed data — each with a probe that asks the running system what it is.
 * Compares each reading with what the run expects (the plan's **Shipped SHA:** for `shipped-sha`
 * rows, or an explicit --expect) and writes `<out>/target.json`.
 *
 * Exit 0 MATCH or UNPINNED · 1 NOT_DEPLOYED · 2 UNVERIFIED · 3 usage. A run does not start on
 * NOT_DEPLOYED (executing-tests Step 0): every verdict it produced would be about another system.
 *
 * Probes are reads. GET and HEADER take no credentials — expose identity on an unauthenticated
 * endpoint, or use CMD with the environment's own tooling. CMD runs only what the profile declares.
 * The host is recorded as a hash, never its name; environment values never reach the output.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { trackRun } from './lib/runlog.mjs';
import {
  declarationErrors, declaredProbes, expand, expectedFor, extract, componentStatus, originHash,
  parseProbe, runVerdict, shippedShaOf,
} from './lib/target.mjs';

const TIMEOUT_MS = Number(process.env.QA_TARGET_TIMEOUT_MS) || 10000;

function profileText(root) {
  for (const p of [process.env.QA_PROFILE, join(root, '..', '.claude', 'PROJECT-PROFILE.md'), join(root, '.claude', 'PROJECT-PROFILE.md'), join(root, '..', 'PROJECT-PROFILE.md')])
    if (p && existsSync(p)) return readFileSync(p, 'utf8');
  return null;
}

function envVars(root, env) {
  const p = join(root, `.env.${env}`);
  const out = { ...process.env };
  if (!existsSync(p)) return out;
  for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l);
    if (m && !l.trim().startsWith('#')) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/** The newest plan file of the slug that names a shipped commit. */
function planSha(root, slug) {
  const dir = join(root, 'plans', slug);
  if (!existsSync(dir)) return { sha: null, from: null };
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.md')).sort().reverse()) {
    const sha = shippedShaOf(readFileSync(join(dir, name), 'utf8'));
    if (sha) return { sha, from: `plans/${slug}/${name}` };
  }
  return { sha: null, from: null };
}

async function probe(row, vars, root) {
  const p = parseProbe(row.probe);
  if (!p) return { error: 'malformed probe' };
  const { value: target, missing } = expand(p.target, vars);
  if (missing.length) return { error: `${missing.join(', ')} not set for this environment` };
  try {
    if (p.how === 'GET' || p.how === 'HEADER') {
      const res = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'cache-control': 'no-cache' } });
      const origin = originHash(target);
      if (!res.ok) return { error: `HTTP ${res.status}`, origin };
      if (p.how === 'HEADER') {
        const h = res.headers.get(p.header);
        return h ? { body: h, origin } : { error: `no ${p.header} header`, origin };
      }
      return { body: await res.text(), origin };
    }
    if (p.how === 'FILE') {
      const f = resolve(root, target);
      return existsSync(f) ? { body: readFileSync(f, 'utf8') } : { error: 'file not found' };
    }
    const r = spawnSync(target, { shell: true, encoding: 'utf8', timeout: TIMEOUT_MS * 2, cwd: root });
    if (r.error) return { error: r.error.code === 'ETIMEDOUT' ? 'command timed out' : 'command could not start' };
    if (r.status !== 0) return { error: `command exited ${r.status}` };
    return { body: r.stdout };
  } catch (e) {
    return { error: e?.name === 'TimeoutError' ? `no answer in ${TIMEOUT_MS} ms` : 'unreachable' };
  }
}

async function main(argv) {
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  const env = opt('--env');
  if (!env) { console.error('usage: qa:target -- --env <env> [--plan <slug>] [--expect <component>=<identity> …] [--out <run dir>] [--json]'); return 3; }
  const root = process.cwd();
  const overrides = {};
  argv.forEach((a, i) => {
    if (a !== '--expect') return;
    const [k, ...v] = String(argv[i + 1] ?? '').split('=');
    if (k && v.length) overrides[k] = v.join('=');
  });
  const slug = opt('--plan');
  const plan = slug ? planSha(root, slug) : { sha: null, from: null };

  const text = profileText(root);
  const rows = text ? declaredProbes(text, env) : [];
  const bad = rows.flatMap((r) => declarationErrors(r).map((e) => `${r.component}: ${e}`));
  if (bad.length) { console.error(`qa:target — §Environments ${'### Target identity'} is malformed:\n  ${bad.join('\n  ')}`); return 3; }

  const vars = envVars(root, env);
  const components = [];
  for (const row of rows) {
    const got = await probe(row, vars, root);
    const read = got.error ? { error: got.error } : extract(got.body, row.read);
    const expected = expectedFor(row, { overrides, shippedSha: plan.sha });
    const c = { component: row.component, kind: row.kind, probe: row.probe, observed: read.value ?? null, expected, origin: got.origin ?? null, reason: read.error ?? null };
    c.status = componentStatus({ observed: c.observed, error: read.error, expected });
    components.push(c);
  }
  for (const name of Object.keys(overrides)) if (!rows.some((r) => r.component === name))
    components.push({ component: name, kind: null, probe: null, observed: null, expected: overrides[name], origin: null, reason: 'expected but no probe is declared for it', status: 'UNREAD' });

  const verdict = runVerdict(components);
  const out = {
    schema: 1,
    env,
    probed_at: new Date().toISOString(),
    verdict,
    expected_from: Object.keys(overrides).length ? '--expect' : plan.from,
    shipped_sha: plan.sha,
    components,
    ...(rows.length ? {} : { note: 'no ### Target identity rows for this environment — nothing can say which system the run judged' }),
  };
  const dir = opt('--out');
  if (dir) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'target.json'), JSON.stringify(out, null, 2) + '\n'); }

  if (argv.includes('--json')) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  else {
    console.log(`target ${env}: ${verdict}${plan.sha ? ` (expected ${plan.sha.slice(0, 12)} from ${plan.from})` : ''}`);
    for (const c of components)
      console.log(`  ${c.status.padEnd(8)} ${c.component} [${c.kind ?? '?'}] ${c.observed ?? '—'}${c.expected ? ` (expected ${c.expected})` : ''}${c.reason ? ` — ${c.reason}` : ''}`);
    if (out.note) console.log(`  ${out.note}`);
    if (dir) console.log(`✓ Wrote ${join(dir, 'target.json')}`);
  }
  return { MATCH: 0, UNPINNED: 0, NOT_DEPLOYED: 1, UNVERIFIED: 2 }[verdict];
}

const isMain = process.argv[1] && /(^|\/)target\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) trackRun(import.meta.url);
if (isMain) main(process.argv.slice(2)).then((code) => process.exit(code));
