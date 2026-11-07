// Golden: a model test (shared/model/model-runner.ts + shared/model/projects.model.ts). Random,
// seeded sequences of create / grant / revoke / rename / delete run against the real API, and the
// invariants in the case's ## Model are checked after EVERY step. A failure prints the shortest
// sequence that still fails and the seed that replays the run (QA_MODEL_SEED). Seeded bug:
// DEMO_BUG=member-count (a re-grant counts the member twice) — a sequence no scripted case wrote.
import { test, expect, caseMeta } from '../../shared/fixtures';
import { Prng } from '../../shared/data/prng';
import { bugHunt, seedFrom } from '../../shared/config/env';
import { runModel } from '../../shared/model/model-runner';
import { projectsModel } from '../../shared/model/projects.model';

const SEED = seedFrom(bugHunt.modelSeed);

test('TC-API-PROJECTS-003 — [Projects · API] model projects + memberships — Owner runs random action sequences → every invariant holds at each step', caseMeta({
  id: 'TC-API-PROJECTS-003', type: 'api', module: 'projects', priority: 'P1', req: ['demo/REQ-002'],
}), async ({ projectsAs, pool, cleanup }) => {
  test.slow(); // a model run is QA_MODEL_RUNS × QA_MODEL_STEPS calls plus invariant reads and shrinking — long by design
  const owner = await projectsAs('owner');
  const accounts = pool.slice(0, 2);
  const ctx = { owner, accounts, as: (i: number) => projectsAs(accounts[i]), cleanup };

  const report = await test.step('Step 1: run QA_MODEL_RUNS seeded sequences of QA_MODEL_STEPS actions, checking every invariant after each step → no violation', () =>
    runModel(projectsModel(accounts.length), ctx, new Prng(SEED), {
      seed: SEED, runs: bugHunt.modelRuns, steps: bugHunt.modelSteps, spec: 'scripts/api/projects/TC-API-PROJECTS-003-membership-model.spec.ts',
      // shrink inside the test's own time budget, and record the raw failure before shrinking starts
      deadline: Date.now() + test.info().timeout * 0.6,
      onFailure: (message) => test.info().annotations.push({ type: 'model-failure', description: message }),
    }));

  await test.step('Step 2: read the action coverage → every action ran at least once', async () => {
    test.info().annotations.push({ type: 'model', description: `seed ${report.seed} · ${report.steps} steps · ${JSON.stringify(report.coverage)}` });
    expect(Object.entries(report.coverage).filter(([, count]) => count === 0).map(([name]) => name), 'actions the random sequences never ran — raise QA_MODEL_RUNS/STEPS or their weight').toEqual([]);
  });
});
