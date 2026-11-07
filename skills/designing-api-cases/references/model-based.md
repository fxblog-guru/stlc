# Model-based tests — writing a model the runner can drive

Read when `designing-api-cases` Step 3c calls for a model case (a new state machine, counter,
membership, quota or uniqueness rule). The runner is `<qa-root>/scripts/shared/model/model-runner.ts`; the
worked example is the bundle's golden `projects.model.ts` + `TC-API-PROJECTS-003`.

## Why a model finds what rows do not

A scripted case fixes one order: create → grant → read. Bugs live in the orders nobody wrote: grant
the same person twice, revoke after a rename, delete while a viewer is reading. A model states what
must ALWAYS be true and lets a seeded random generator try hundreds of orders against the real API,
checking those truths after every step. When one breaks, the runner shrinks the sequence to the
shortest one that still fails — a bug report that is already a minimal reproduction.

## The four parts

| Part | What it is | Rule |
|---|---|---|
| **State** | a small in-memory picture of what the product should hold (`init()` → empty) | only what the invariants need; never a copy of the product's schema |
| **Actions** | `{ name, weight, pre, args, valid, run }` | `pre(m)`: may it run now? · `args(m, prng)`: plain data only (indexes, role names) so the sequence prints and replays · `run(m, args, ctx)`: call the API through a service, throw on a broken postcondition (status, echoed field), then update the model · `valid(m, args)`: are these args still meaningful after shrinking removed earlier steps? |
| **Invariants** | `{ name, check(m, ctx) → string[] }` | read the REAL product (API, as the right actor) and compare with the model; return one message per violation; never mutate |
| **Budget + seed** | QA_MODEL_RUNS × QA_MODEL_STEPS, QA_MODEL_SEED | the case's `## Model` states them; CI uses the defaults, a hunt raises them |

## Choosing invariants (the part that finds bugs)

- **Counters equal their source**: `member_count == granted members`, `order.total == Σ lines`, `stock == initial − Σ shipped`.
- **Permissions hold in every state**: a viewer cannot write; a removed member cannot read; the Owner always can.
- **Deletion is total**: a deleted entity is 404 for every actor and absent from every list and count.
- **Uniqueness**: no two live entities share a key, ignoring case/whitespace the way the product does.
- **State machine legality**: the status is always one the diagram allows; a forbidden transition is refused (put the forbidden call in an action that expects 409/422).
- **Round-trip**: what you wrote is what you read, by id and in the list.

Write each as the business rule's sentence — it is the invariant's `name` and appears in the failure.

## Actions: include the refusals

Model the calls that must FAIL too (`renameToTakenName` expects 409, `viewerEdits` expects 403): a
product that accepts a forbidden call is the bug, and the postcondition catches it on the spot.
Weight the actions so each runs; Step 2 of the golden case asserts every action ran at least once —
a model whose actions never fire proves nothing.

## Isolation

- Names come from `uniqueName()` inside `run()` — never in `args`, so every replay (and shrink) uses fresh data.
- Register cleanup in `run()` the moment something is created (`ctx.cleanup.add`).
- Roles are granted to the worker's pool accounts (`pool[0]`, `pool[1]`), never to shared logins.
- Invariants that read lists filter to the model's own entities (`q=<name>`), never assume an empty system.

## The case file

An api case, Technique `state-transition` (axes it buys after `→`), and a `## Model` section after
`## Steps` (CONTRACTS §7):

```markdown
## Model
- State: <entities and the relations the invariants need>
- Actions (pre → call → model update):
  - <name> (<precondition>) → <METHOD /path> <status> → <model change>
- Invariants (after every step, against the API):
  - <business rule as a sentence>
- Budget: QA_MODEL_RUNS (default 5) × QA_MODEL_STEPS (default 15), seed QA_MODEL_SEED (default 1), shrink ≤ 40 replays
- Model code: scripts/shared/model/<module>.model.ts
```

Steps: (1) run the sequences → no postcondition or invariant fails; (2) read the action coverage →
every action ran. The model file lives in `scripts/shared/model/<module>.model.ts` (support code, like
a factory); the spec is ten lines that build `ctx` and call `runModel`.

## Reading a failure

```
model "projects + memberships" failed — run 1/5, step 8: invariant "member_count equals the members granted": … member_count 2, granted 1
minimal sequence (4 of 8 steps, 16 replays):
  1. create()  2. create()  3. grant(project=1, account=0, role=admin)  4. grant(project=1, account=0, role=viewer)
replay: QA_MODEL_SEED=1 npx playwright test scripts/api/projects/TC-API-PROJECTS-003-….spec.ts
```

Triage: the invariant is a business rule → FUNCTIONAL; the minimal sequence becomes the defect's
steps to reproduce, and a scripted regression case (`/qa-design`) pins it. "Did not reproduce on
replay" in the message means the failure depends on state outside the model — re-run once (FLAKY
rule) and look for shared data.
