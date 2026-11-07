/**
 * data-case.mjs: the static rules a `data` case must meet beyond its §7 sections (CONTRACTS §28).
 * A data test that cannot fail is the common failure of ELT suites, so the rules target exactly
 * the shapes that make one vacuous: a hop with no relationship, a recon with only counts, a
 * tolerance with no owner, a check on a window that includes in-flight rows.
 */

export const HOP_RELATIONSHIPS = ['exact', 'dedup', 'filtered', 'aggregated', 'source'];
export const ORACLE_KINDS = ['row-count', 'distinct-keys', 'sum', 'min-max', 'row-hash', 'conservation', 'unit-rows', 'rule', 'schema', 'freshness', 'pii-shape', 'idempotent-rerun', 'late-data', 'backfill'];
// Counts are necessary, never sufficient: a P0/P1 hop needs one of these.
export const VALUE_ORACLES = ['sum', 'min-max', 'row-hash', 'conservation', 'unit-rows', 'rule'];

const section = (t, name) => {
  const m = new RegExp(`^## ${name}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(t);
  return m ? m[1] : null;
};
const field = (body, key) => new RegExp(`^-\\s*${key}:\\s*(.+?)\\s*$`, 'm').exec(body ?? '')?.[1] ?? null;

/** Problems in one data case's text; [] when it meets CONTRACTS §28. */
export function dataCaseProblems(t) {
  const out = [];
  const hop = section(t, 'Hop');
  const oracle = section(t, 'Oracle');
  const tol = section(t, 'Tolerance');
  const priority = /\*\*Priority:\*\*\s*(P[0-3])/.exec(t)?.[1];

  if (hop !== null) {
    const rel = field(hop, 'relationship');
    if (!rel) out.push('`## Hop` has no `- relationship:` line');
    else if (!HOP_RELATIONSHIPS.includes(rel.split(/\s/)[0])) out.push(`\`## Hop\` relationship \`${rel}\` is not one of ${HOP_RELATIONSHIPS.join(' | ')}`);
    for (const k of ['from', 'to']) if (!field(hop, k)) out.push(`\`## Hop\` has no \`- ${k}:\` line (layer.table)`);
    if (!field(hop, 'grain')) out.push('`## Hop` has no `- grain:` line (one row per …)');
    const window = field(hop, 'window');
    if (!window) out.push('`## Hop` has no `- window:` line (the late-arrival window, or `none — <why>`)');
    if (rel?.startsWith('dedup') && !field(hop, 'dedup order')) out.push('a dedup hop needs `- dedup order:` (which row wins)');
    if (rel?.startsWith('filtered') && !field(hop, 'quarantine')) out.push('a filtered hop needs `- quarantine:` (where the rejected rows go)');
  }

  if (oracle !== null) {
    const kinds = [...oracle.matchAll(/^-\s*([a-z-]+)\b/gm)].map((m) => m[1]);
    const unknown = kinds.filter((k) => !ORACLE_KINDS.includes(k));
    if (!kinds.length) out.push('`## Oracle` lists no check (`- row-count: …`, `- row-hash: …`)');
    for (const k of unknown) out.push(`\`## Oracle\` \`${k}\` is not one of ${ORACLE_KINDS.join(' | ')}`);
    if ((priority === 'P0' || priority === 'P1') && kinds.length && !kinds.some((k) => VALUE_ORACLES.includes(k)))
      out.push(`${priority} with only count checks: add a value-level oracle (${VALUE_ORACLES.join(', ')}); counts cannot see a changed value`);
  }

  if (tol !== null) {
    const lines = tol.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('-'));
    if (!lines.length) out.push('`## Tolerance` is empty (write `- exact`)');
    for (const l of lines) {
      if (/^-\s*exact\b/.test(l)) continue;
      if (!/reason:/.test(l) || !/owner:/.test(l)) out.push(`tolerance \`${l.slice(2, 60)}\` needs \`reason:\` and \`owner:\`; any non-exact tolerance is a decision someone owns`);
    }
  }
  return out;
}
