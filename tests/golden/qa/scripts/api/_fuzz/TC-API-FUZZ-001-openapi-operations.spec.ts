// Golden: schema-driven fuzzing (shared/fuzz/openapi-fuzz.ts). Generic on purpose — it walks every
// operation of OPENAPI_SPEC, so a new endpoint is fuzzed the day it is documented. The only
// project-specific lines are where path ids come from (a factory, a pool account) and which valid
// body a create starts from (the factory's, so names carry the run prefix). Opt-in per operation is
// the case's `## Data` (`fuzz-allow` / `fuzz-deny`). One test per actor row; the seed is printed on
// failure (QA_FUZZ_SEED replays it). Seeded bugs: DEMO_BUG=fuzz-500 (whitespace-only name → 500),
// DEMO_BUG=leak (a stack trace in a 400 body).
import { join } from 'node:path';
import { test, expect, caseMeta } from '../../shared/fixtures';
import type { ApiClient } from '../../shared/http/api.client';
import { Prng, streamSeed } from '../../shared/data/prng';
import { bugHunt, seedFrom } from '../../shared/config/env';
import { createdCleanup, formatFindings, fuzzAll, fuzzOperations, fuzzSelection } from '../../shared/fuzz/openapi-fuzz';

const CASE = join(__dirname, '../../../cases/api/_fuzz/TC-API-FUZZ-001-openapi-operations.md');
const SPEC = 'scripts/api/_fuzz/TC-API-FUZZ-001-openapi-operations.spec.ts';
const SEED = seedFrom(bugHunt.fuzzSeed);

type Who = 'owner' | 'anonymous';
const ROWS: readonly { id: Who; label: string }[] = [
  { id: 'owner', label: 'the generated inputs, sent as the Owner' },
  { id: 'anonymous', label: 'the generated inputs, sent with no session' },
];
const CLIENT: Record<Who, (f: { as: (s: string) => Promise<ApiClient>; anonymous: ApiClient }) => Promise<ApiClient>> = {
  owner: ({ as }) => as('owner'),
  anonymous: async ({ anonymous }) => anonymous,
};

for (const row of ROWS) {
  test(`TC-API-FUZZ-001 — row ${row.id}: ${row.label} → zero findings`, caseMeta({
    id: 'TC-API-FUZZ-001', type: 'api', module: 'fuzz', priority: 'P1', req: ['demo/REQ-001'], suites: ['regression'],
    // minLength rows create 1-character names, which cannot carry the run prefix (TC-API-PROJECTS-002 row b)
    lock: ['projects:short-name'],
  }), async ({ as, anonymous, pool, projectsFactory, cleanup }) => {
    const { allowed } = fuzzSelection(CASE);
    const ops = (await fuzzOperations()).filter((o) => allowed(o.operationId));
    const client = await CLIENT[row.id]({ as, anonymous });
    expect(ops.length, 'the case allows no operation of OPENAPI_SPEC').toBeGreaterThan(0);

    const findings = await fuzzAll({
      ops, client, actor: row.id, seed: SEED, max: bugHunt.fuzzMax,
      ids: {
        projectId: async () => (await projectsFactory.create()).id,
        accountId: async () => pool[1]?.id ?? '',
      },
      bodies: { createProject: () => projectsFactory.build() },
      onCreated: createdCleanup(ops, await as('owner'), cleanup),
      prngFor: (label) => new Prng(streamSeed(SEED, label)),
    });

    expect(findings, formatFindings(findings, SEED, SPEC)).toEqual([]);
  });
}
