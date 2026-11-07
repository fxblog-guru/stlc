// redact.mjs — secrets out of the run evidence the kit writes (CONTRACTS §25).
//
// A failure message quotes what the test saw: a request URL with a password in it, an Authorization
// header, a token echoed in a 401 body. Those lines land in triage.md, stability.md, summary.md and
// the agent-written failures.md, which are committed (the runs/ .gitignore keeps the text evidence).
// http-log.ts masks what the kit itself records; this masks what a failure message carries.
//
//   redact(text)               the text with every secret value replaced by ‹masked›
//   node scripts/shared/lib/redact.mjs <file|run dir> …   rewrite the evidence files in place
//                              (failures.md, triage.md, stability.md, summary.md, findings.md)
//
// The key shapes are the lesson scanner's (lesson-scan.mjs RULES.secret), so one list says what a
// credential looks like. Pure apart from the CLI; never throws on text.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { RULES } from './lesson-scan.mjs';

export const MASK = '‹masked›';
const NAMES = String.raw`(?:password|passwd|pwd|secret|client[_-]?secret|api[_-]?key|apikey|access[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|id[_-]?token|token|session[_-]?id|private[_-]?key)`;

/** Ordered: each rule keeps its label and masks only the value. */
const RULES_IN_ORDER = [
  // scheme://user:password@host — keep the user, mask the password.
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@'"`]+:)[^\s@/'"`]+@/gi, `$1${MASK}@`],
  // Authorization / Proxy-Authorization / X-Api-Key style headers, `Bearer`, `Basic`, `Token` values.
  [/\b((?:proxy-)?authorization["']?\s*[:=]\s*["']?(?:bearer|basic|token|digest)?\s*)[^\s"',;]+/gi, `$1${MASK}`],
  [/\b(Bearer\s+)[A-Za-z0-9._~+/-]{8,}=*/g, `$1${MASK}`],
  [/\b(x-[a-z-]*(?:api-key|token|secret)["']?\s*[:=]\s*["']?)[^\s"',;]+/gi, `$1${MASK}`],
  // ?token=…&api_key=… in a URL or a form body.
  [new RegExp(String.raw`([?&;]${NAMES}=)[^&\s#'"\`]+`, 'gi'), `$1${MASK}`],
  // "password": "…" in JSON, password=…, password: … in prose and logs.
  [new RegExp(String.raw`(["']${NAMES}["']\s*:\s*["'])[^"']*(["'])`, 'gi'), `$1${MASK}$2`],
  [new RegExp(String.raw`(\b${NAMES}\s*[:=]\s*)(?!${MASK})["']?[^\s"',;&]{3,}["']?`, 'gi'), `$1${MASK}`],
];

/** The text with every secret value masked. Idempotent: redact(redact(x)) === redact(x). */
export function redact(text) {
  let out = String(text ?? '');
  for (const [re, to] of RULES_IN_ORDER) out = out.replace(re, to);
  for (const { re } of RULES.secret) {
    if (/PRIVATE KEY/.test(re.source)) { out = out.replace(/-----BEGIN ([A-Z]+ )?PRIVATE KEY-----[\s\S]*?(?:-----END \1?PRIVATE KEY-----|$)/g, MASK); continue; }
    out = out.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`), (m) => (m.includes(MASK) ? m : MASK));
  }
  return out;
}

/** Evidence files the runs write, by name. */
export const EVIDENCE = new Set(['failures.md', 'triage.md', 'stability.md', 'summary.md', 'findings.md', 'perf-verdict.md']);

/** Rewrite each evidence file under the given paths in place; returns the files that changed. */
export function redactFiles(paths) {
  const changed = [];
  const visit = (p) => {
    if (!existsSync(p)) return;
    if (statSync(p).isDirectory()) { for (const n of readdirSync(p)) visit(join(p, n)); return; }
    if (!EVIDENCE.has(basename(p))) return;
    const text = readFileSync(p, 'utf8');
    const next = redact(text);
    if (next !== text) { writeFileSync(p, next); changed.push(p.replace(/\\/g, '/')); }
  };
  for (const p of paths) visit(p);
  return changed;
}

const isMain = process.argv[1] && /(^|\/)redact\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const paths = process.argv.slice(2);
  if (!paths.length) { console.error('usage: npm run qa:redact -- <run dir | evidence file> …'); process.exit(2); }
  const changed = redactFiles(paths);
  for (const f of changed) console.log(`✓ masked ${f}`);
  console.log(`qa:redact — ${changed.length} file(s) changed`);
  process.exit(0);
}
