/**
 * deploy-impact.mjs — what a change that touches the database or an API contract must prove before
 * it ships (CONTRACTS §30). Shared by qa:lint and its tests, so the rule a plan is linted against is
 * the rule the designing skills follow.
 *
 * The plan declares the impact in its `## Sizing` section (CONTRACTS §27):
 *   deploy_impact       none [— <why>] | db | api | db, api
 *   db_change           additive | expand | contract — <release from which the code no longer uses the old shape>
 *   data_change         none | backfill, transform, split-merge, type-change, delete, import   (existing rows change)
 *   rollback            redeploy[, down-migration][, snapshot-restore]
 *   backup              <the backup the rollback restores>                  (when data_change is not none)
 *   post_backup_writes  delta-export | replay | write-freeze — <how>        (when data_change is not none)
 *   api_change          additive | versioned | deprecated                    (`breaking` alone never ships)
 *   deploy_skipped      <check> — <why>; …                                   (a required check left out, with its reason)
 *
 * A case proves a check by naming it on a `**Deploy check:** <check>[, <check>…]` header line.
 */

// Every check a case may name, with the one-line obligation the designing skills expand
// (skills/qa-phase-protocol/references/deploy-change-cases.md).
export const CHECKS = {
  'migration-round-trip': 'up → down → up on a copy of the schema leaves the same schema',
  'migration-volume': 'the migration on a production-like volume, with lock and duration recorded',
  'migration-integrity': 'after the migration: counts, constraints and nullability hold',
  'n-1-compat': 'the previous app version still works against the new schema',
  'rollback-redeploy': 'the previous build redeployed against the migrated database works',
  'rollback-restore': 'the down migration or snapshot restore the plan names, rehearsed on staging',
  'post-deploy-verify': 'smoke and readiness checks after migrate and after the code goes out',
  'backup-restore': 'the named backup restored to a scratch database matches the source on counts and checksums',
  'data-baseline': 'row counts, checksums and sample query results recorded on the affected tables before the change',
  'migration-resumable': 'the data migration is batched: killed midway and rerun, no duplicates and no gaps',
  'migration-idempotent': 'running the data migration twice gives the same data as running it once',
  'data-verify-after': 'counts and checksums match the baseline or the expected transform; no orphans; sample queries as expected',
  'rollback-data': 'restore from the backup; data written after the backup is handled the way the plan says',
  'n-1-data': 'the previous build works against data the migration already transformed',
  'api-old-client': 'old request shapes accepted; response fields not removed or renamed; enums only extended',
  'api-cached-client': 'a cached old frontend bundle calling the new API still works',
  'api-versioning': 'the old version or deprecated path is still served, and the deprecation is announced',
};

export const IMPACTS = ['db', 'api'];
export const DB_CHANGES = ['additive', 'expand', 'contract'];
export const DATA_CHANGES = ['backfill', 'transform', 'split-merge', 'type-change', 'delete', 'import'];
export const ROLLBACKS = ['redeploy', 'down-migration', 'snapshot-restore'];
export const API_CHANGES = ['additive', 'versioned', 'deprecated'];
export const POST_BACKUP = ['delta-export', 'replay', 'write-freeze'];
// Checks no reason can waive: without them nobody has shown the change can ship or come back.
export const NEVER_SKIPPED = new Set(['n-1-compat', 'rollback-redeploy', 'post-deploy-verify', 'backup-restore', 'data-baseline', 'data-verify-after', 'rollback-data']);
// Plans dated from this day state their deploy impact; an older plan is history.
export const DEPLOY_SINCE = '2026-11-03';

const list = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter((s) => s && s !== '—');
const head = (v) => String(v ?? '').split(/\s+—\s+/)[0].trim();

/** The checks a case claims on its `**Deploy check:**` line; null when it has none. */
export function caseChecks(text) {
  const m = /^\*\*Deploy check:\*\*\s*(.*?)\s*$/m.exec(String(text).replace(/\r\n?/g, '\n'));
  return m ? list(m[1]) : null;
}

/** The impacts a sizing map declares: [] for `none`, null when the key is absent. */
export function declaredImpact(s) {
  if (s?.deploy_impact === undefined) return null;
  const v = head(s.deploy_impact);
  return v === 'none' ? [] : list(v);
}

/**
 * Everything wrong with the declaration, and the checks it requires.
 * Returns { problems: string[], required: string[], skipped: Map<check, why> }.
 */
export function deployRequirements(s) {
  const problems = [];
  const required = new Set();
  const impact = declaredImpact(s) ?? [];
  for (const i of impact) if (!IMPACTS.includes(i)) problems.push(`\`deploy_impact:\` \`${i}\` is not none | db | api`);
  if (impact.length && /^no\b/.test(s.worth_testing ?? '')) problems.push('`worth_testing: no` but `deploy_impact:` names db or api — a change that alters the schema or a contract is tested before it ships');
  if (impact.includes('db')) {
    const db = head(s.db_change);
    if (!DB_CHANGES.includes(db)) problems.push(`\`db_change:\` is not ${DB_CHANGES.join(' | ')} — say whether old code can run on the new schema`);
    else if (db === 'contract' && !/\s—\s+\S/.test(s.db_change)) problems.push('`db_change: contract` names no release — write `contract — <the release from which the code no longer uses the old shape>`');
    const rb = list(s.rollback);
    if (!rb.length) problems.push(`\`rollback:\` is missing — name how this change comes back: ${ROLLBACKS.join(', ')}`);
    for (const r of rb) if (!ROLLBACKS.includes(r)) problems.push(`\`rollback:\` \`${r}\` is not ${ROLLBACKS.join(' | ')}`);
    ['migration-round-trip', 'migration-volume', 'migration-integrity', 'n-1-compat', 'rollback-redeploy', 'post-deploy-verify'].forEach((c) => required.add(c));
    if (rb.some((r) => r !== 'redeploy')) required.add('rollback-restore');
    const dc = head(s.data_change);
    if (s.data_change === undefined) problems.push(`\`data_change:\` is missing — \`none\` for a schema-only change, else the kinds: ${DATA_CHANGES.join(', ')}`);
    else if (dc !== 'none') {
      const kinds = list(dc);
      for (const k of kinds) if (!DATA_CHANGES.includes(k)) problems.push(`\`data_change:\` \`${k}\` is not ${DATA_CHANGES.join(' | ')}`);
      if (!(s.backup ?? '').trim() || s.backup.trim() === '—') problems.push('`backup:` is missing — a change to existing rows names the backup its rollback restores');
      const pbw = head(s.post_backup_writes);
      if (!POST_BACKUP.includes(pbw) || !/\s—\s+\S/.test(s.post_backup_writes ?? ''))
        problems.push(`\`post_backup_writes:\` is not \`${POST_BACKUP.join(' | ')} — <how>\` — say what happens to rows written after the backup`);
      ['backup-restore', 'data-baseline', 'migration-resumable', 'migration-idempotent', 'data-verify-after', 'rollback-data', 'n-1-data'].forEach((c) => required.add(c));
    }
  }
  if (impact.includes('api')) {
    const ac = head(s.api_change);
    if (ac === 'breaking') problems.push('`api_change: breaking` — a breaking change ships only behind a new version (`versioned`) or a deprecation (`deprecated`)');
    else if (!API_CHANGES.includes(ac)) problems.push(`\`api_change:\` is not ${API_CHANGES.join(' | ')}`);
    ['api-old-client', 'api-cached-client', 'rollback-redeploy', 'post-deploy-verify'].forEach((c) => required.add(c));
    if (ac === 'versioned' || ac === 'deprecated') required.add('api-versioning');
  }
  const skipped = new Map();
  for (const part of String(s.deploy_skipped ?? '').split(';').map((x) => x.trim()).filter((x) => x && x !== '—')) {
    const m = /^([a-z0-9-]+)\s+—\s+(\S.*)$/.exec(part);
    const check = m ? m[1] : part;
    if (!CHECKS[check]) problems.push(`\`deploy_skipped:\` \`${check}\` is not a deploy check`);
    else if (!m) problems.push(`\`deploy_skipped:\` \`${check}\` has no reason — write \`${check} — <why>\``);
    else if (NEVER_SKIPPED.has(check)) problems.push(`\`deploy_skipped:\` \`${check}\` cannot be skipped — it is what shows the change can ship and come back`);
    else skipped.set(check, m[2]);
  }
  return { problems, required: [...required], skipped };
}

/**
 * The required checks no planned case proves. `cases`: [{ id, checks: string[] }] — the slug's own,
 * non-deprecated cases that hold a traceability row in the plan.
 */
export function missingChecks(s, cases) {
  const { required, skipped } = deployRequirements(s);
  const have = new Set(cases.flatMap((c) => c.checks));
  return required.filter((c) => !have.has(c) && !skipped.has(c));
}
