/**
 * junit.mjs — any runner's JUnit XML → the results contract's `cases` map (lib/runners.mjs).
 * The test name starts with the Case ID; that is the only link from a result to its traceability
 * row. A test whose name carries no id is returned as unmapped, never guessed.
 */
import { existsSync, readFileSync } from 'node:fs';

const norm = (t) => t.replace(/\r\n?/g, '\n');
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** Any Case ID (CONTRACTS §1) at the start of a test name — NNN is three digits, so -0030 is no id. */
export const ANY_CASE_ID = /^(TC-[A-Z0-9]+-[A-Z0-9-]+?-\d{3})\b/;

/** Map(caseId → { pass, fail, skip, message }) and the unmapped test names. */
export function junitOutcomes(xml, idPattern = ANY_CASE_ID) {
  const out = new Map();
  const unmapped = [];
  for (const m of norm(xml).matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const name = decode((/\bname="([^"]*)"/.exec(m[1]) ?? [])[1] ?? '');
    const id = (idPattern.exec(name) ?? [])[1];
    if (!id) { unmapped.push(name); continue; }
    const body = m[3] ?? '';
    const prev = out.get(id) ?? { pass: 0, fail: 0, skip: 0, message: null };
    if (/<(failure|error)\b/.test(body)) { prev.fail += 1; prev.message ??= decode((/<(?:failure|error)\b[^>]*?message="([^"]*)"/.exec(body) ?? [])[1] ?? 'failed'); }
    else if (/<skipped\b/.test(body)) prev.skip += 1;
    else prev.pass += 1;
    out.set(id, prev);
  }
  return { out, unmapped };
}

/** Read a JUnit file if it exists (null when the runner wrote none). */
export function readJunit(path, idPattern = ANY_CASE_ID) {
  return existsSync(path) ? junitOutcomes(readFileSync(path, 'utf8'), idPattern) : null;
}

/** The results contract a wrapper writes to `<RUN_DIR>/<platform>/results.json`. */
export function resultsOf(junit, extra = {}) {
  return { ...extra, cases: junit ? Object.fromEntries(junit.out) : {}, unmapped: junit?.unmapped ?? [], noReport: !junit };
}
