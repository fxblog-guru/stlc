# Deploy-change cases — testing how a change ships and how it comes back

Read this when the plan's `## Sizing` says `deploy_impact: db`, `api` or `db, api` (CONTRACTS §30).
A change to the schema, to existing rows or to an API contract can be right and still break the
release: during the deploy window two app versions share one database, old clients keep calling,
and a rollback meets data the migration already changed. These cases test that window. The
functional cases of the slug still test what the change does.

Each case below proves one **deploy check**, which it names on a header line under `**Tags:**`:

```markdown
**Deploy check:** migration-volume
```

A case may name more than one check when one run genuinely proves both. `qa:lint` fails the plan
when a required check has no case in its traceability table, unless `deploy_skipped:` gives the
reason. Some checks cannot be skipped (§30).

## 1. Declare the impact (planning-tests, Step 2.0)

Read the analysis, the dev handoff's `## Interfaces changed` (endpoints, MIG ids, anything called
breaking) and `## Risk areas`, and the impact note's `Change kind` column. Then write:

| Key | When | Values |
|---|---|---|
| `deploy_impact` | always (plans from 2026-11-03) | `none` · `none — <why>` · `db` · `api` · `db, api` |
| `db_change` | `db` | `additive` (new table, nullable column) · `expand` (new shape beside the old) · `contract — <release from which the code no longer uses the old shape>` (drop, rename, narrow) |
| `data_change` | `db` | `none` (schema only) · one or more of `backfill`, `transform`, `split-merge`, `type-change`, `delete`, `import` |
| `rollback` | `db` | `redeploy` · `down-migration` · `snapshot-restore`, comma-separated, as the dev plan says |
| `backup` | `data_change` ≠ none | the backup the rollback restores (name, where, when it is taken) |
| `post_backup_writes` | `data_change` ≠ none | `delta-export — <how>` · `replay — <how>` · `write-freeze — <how>` |
| `api_change` | `api` | `additive` · `versioned` · `deprecated`; `breaking` alone is refused |
| `deploy_skipped` | a required check that does not apply | `<check> — <why>; …` |

Take the values from the dev bundle's deploy plan when the handoff cites one; when it is silent,
ask a `Q-NNN` rather than guess. A rename is never `additive`.

## 2. The checks each impact requires

| Impact | Required checks |
|---|---|
| `db` (any) | `migration-round-trip` · `migration-volume` · `migration-integrity` · `n-1-compat` · `rollback-redeploy` · `post-deploy-verify` |
| `db` with `rollback` naming `down-migration` or `snapshot-restore` | `rollback-restore` as well |
| `db` with `data_change` ≠ none | `backup-restore` · `data-baseline` · `migration-resumable` · `migration-idempotent` · `data-verify-after` · `rollback-data` · `n-1-data` as well |
| `api` | `api-old-client` · `api-cached-client` · `rollback-redeploy` · `post-deploy-verify` |
| `api` with `versioned` or `deprecated` | `api-versioning` as well |

A purely additive schema change (`data_change: none`) needs only the first row. The data set is for
a change that rewrites rows people already have.

## 3. Designing each check

Schema and data checks are `integration` cases (`TC-INT`), API checks are `api` cases (`TC-API`),
and the post-deploy and cached-bundle checks may be `e2e` when a browser is the only way in. All of
them run against a **disposable copy** (a scratch database or an ephemeral staging), never the
shared test database: `## Isolation` says `lock: schema — <copy name>`. Applying migrations and
restoring backups is the action under test here, so the integration rule "SQL only reads" applies to
the application's data, not to these steps. A step that needs an operator (a restore through the
cloud console, killing a job) keeps the case `@manual`; say so in `## Data`.

| Check | Steps the case takes | What every Expected states |
|---|---|---|
| `migration-round-trip` | on a copy of the current schema: up, down, up | the schema dump after the second up equals the one after the first (diff empty); no migration error |
| `migration-volume` | seed the copy to the production row counts the plan gives, run the migration, time it | duration ≤ the deploy window; the lock taken (table, mode, longest hold) ≤ the budget; reads and writes during the run do not time out |
| `migration-integrity` | after the migration | row counts per affected table as expected; constraints valid (`NOT VALID` constraints validated); no NULL in a column now `NOT NULL`; foreign keys hold |
| `n-1-compat` | run the previous release's smoke against the new schema | its reads and writes succeed; for `contract`, the previous release is the one from which the code stopped using the dropped shape — run that one |
| `rollback-redeploy` | migrate, then deploy the previous build | it starts, its readiness probe passes, its smoke passes on the migrated database |
| `rollback-restore` | on staging, run the down migration or restore the snapshot the plan names | the schema equals the pre-change dump; data written before the change is intact; the time it took is recorded |
| `post-deploy-verify` | after migrate, and again after the code goes out | readiness and health endpoints pass; the slug's smoke cases pass; migration version = the expected id |
| `backup-restore` | take the backup the plan names, restore it to a scratch database | counts and per-table checksums of the restored copy equal the source |
| `data-baseline` | before the change, on the affected tables | row counts, checksums and the results of 3–5 named sample queries recorded in the run folder; the case after the change reads them |
| `migration-resumable` | on a production-like volume copy, kill the data migration midway, rerun it | the batches resume from where they stopped; no duplicate rows, no gaps (count and key range equal a clean run) |
| `migration-idempotent` | run the data migration twice | the data after the second run equals the data after the first (checksums) |
| `data-verify-after` | after the data migration | counts and checksums equal the baseline, or the baseline under the stated transform; no orphan rows; constraints hold; the sample queries return the expected results; the slug's smoke passes on the migrated data |
| `rollback-data` | restore from the backup after the change has taken writes | rows written after the backup are detected and handled as `post_backup_writes` says (exported and re-applied, or replayed); the count of such rows is reported, never zero by assumption |
| `n-1-data` | deploy the previous build against data the migration already transformed | it reads the transformed rows without error and shows them correctly; it writes rows the new build can still read |
| `api-old-client` | send the previous contract's requests (from the old OpenAPI or recorded traffic) | old request shapes accepted; every old response field still present with the same name and type; enum values only added; no new required request field |
| `api-cached-client` | load the previous frontend bundle (the build cached in a browser or CDN) against the new API | its screens load and its main journey completes; no 4xx from a field it does not know |
| `api-versioning` | call the old version or deprecated path | it is still served with the old schema; `Deprecation` / `Sunset` headers (or the documented announcement) are present; the new version serves the new shape |

Priority: P0 for `backup-restore`, `rollback-data`, `data-verify-after` and `rollback-redeploy` —
they guard data loss and the way back (a data-integrity case may sit above its REQ with a
`Priority reason:` line, CONTRACTS §7). The rest are P1.

## 4. Grounding

Cite the dev handoff section and the migration ids the case exercises (`- ticket:` or `- code:`),
and the plan's `## Sizing` line the check comes from. A volume, a window or a lock budget the
plan does not state is a `COVERAGE-GAP` with a `/qa-clarify` question, never an invented number.
