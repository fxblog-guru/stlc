---
name: reviewing-test-pull-requests
description: Use for /qa-review-pr: review a teammate's testing PR for tests that lie.
version: 1.0.0
---

# Reviewing a testing pull request

> Profile first, by section (`profile.mjs`) — `§Test types`, `§Platforms`, `§Environments`. QA root
> defaults to `<qa-root>/`. Contract: CONTRACTS §1 (ids), §2 (layout, case ↔ script mirror), §6 (tags and
> their single writers), §7 (case format, title, priority), §12 (quarantine), §18 (stale reviews),
> §21 (this review's file).

## Prime directive — a test PR is reviewed for what makes a test lie

A code PR fails by doing the wrong thing. A test PR fails by **saying the wrong thing**: green when
the product is broken, red when it is fine, or silent because it stopped running. Every check here
asks one question of each changed test: *if the feature broke tomorrow, would this go red, and
would the failure say what broke?*

You edit nothing: no case, no script, no plan row, no tag. You write
`<qa-root>/reviews/_pr/<pr-id>-<YYYY-MM-DD-HHmm>.md` and print the comment the person posts on the PR.

## How it differs from `/qa-review` (`reviewing-cases`)

| | `/qa-review <slug>` | `/qa-review-pr <n>` |
|---|---|---|
| Scope | every designed case of one feature | exactly what one PR changes, across features |
| When | between `/qa-design` and `/qa-script` | before a teammate's branch merges |
| Judges | coverage and depth of a case set | each changed case, script, config and run plan |
| Verdict | READY FOR /qa-script · REVISE FIRST | APPROVE · REQUEST CHANGES · COMMENT |

A PR that adds a whole feature's cases does not skip `/qa-review`: say in `## Notes` that the slug
needs its case review, and do not do it here.

## Step 1 — scan

```bash
node <qa-root>/scripts/shared/pr-scan.mjs --pr <n>          # GitLab !n or GitHub #n, fetched from origin
node <qa-root>/scripts/shared/pr-scan.mjs --base origin/main --head <branch>
```

Carry every finding into your table with its id, or mark it `dismissed` with the reason. Quote the
header line (cases +/~/-, scripts +/~/-, files outside `<qa-root>/`) in `## Scope`. `QPR-APP-CODE` means
the PR also changes the product. A test that passes *because* the product changed with it needs a
development review too (`/sdlc-review-pr`). Say so and do not review the app code here.

## Step 2 — run what changed, from a throwaway worktree

Never check the branch out over the user's work: `git worktree add --detach .claude/pr-review/<n> <ref>`,
`cd` into its `<qa-root>/`, install, then:

```bash
npm run qa:lint && npm run heal:check                      # contract + tsc + eslint, as CI runs them
npx playwright test <changed spec files> --repeat-each=3 --workers=4   # flaky shows up as 1/3 or 2/3
npx playwright test <changed spec files> --shuffle         # order dependence
```

An environment you cannot reach makes the run rows `N/A (no <env> access)`, never `PASS`. When you
can run them, **prove one changed test can fail**. Pick the riskiest new assertion, break its
expectation in the worktree copy (change the expected value, not the app), run it, and see it go
red. Then discard the edit. A test you have seen fail is evidence. A test you have only seen pass
is an opinion.

## Step 3 — the checklist, per changed case/script pair

One row per line, `PASS` / `FAIL` / `N/A` with evidence (`path:line`, command + output, quote).
Four groups, four questions a merge must answer: does each test tell the truth, does the PR break
what already runs, is it in the agreed form, can it merge now.

**A. Honest — each test goes red when the feature breaks**

| # | Check |
|---|---|
| 1 | Each expected result is a concrete claim (status + body field, row count, visible text, state) and the script asserts that claim, not a weaker one (`toBeTruthy`, `toBeOK`, "no error") (scan `QPR-WEAK-ASSERT`, `QPR-STATUS-ONLY`) |
| 2 | No assertion was removed, loosened or made soft without the case changing to say so (scan `QPR-ASSERT-LOST`, `QPR-SOFT-ONLY`) |
| 3 | Nothing stops running silently: no `.only`, no unconditional `.skip`/`.fixme`; a conditional skip names its reason (scan `QPR-ONLY`, `QPR-SKIP`) |
| 4 | Isolation: each test creates its own data through a factory that registers cleanup, uses `uniqueName`, signs in through `as`/`pageAs` — no shared record, no order dependence, no hard-coded user (`QPR-HARDCODED-USER`) |
| 5 | Waiting is on state, never on time: no `waitForTimeout`/`sleep`/`networkidle`, no raised timeout (scan `QPR-SLEEP`, `QPR-NETWORKIDLE`, `QPR-TIMEOUT`); locators by role/label/registry, no `force: true` (`QPR-FORCE`, `QPR-RAW-SELECTOR`) |
| 6 | Proven: changed specs pass 3/3 and under `--shuffle`, and one new assertion was seen to fail when its expectation was broken (Step 2) |

**B. Does not break — every test that ran before still runs, and means the same**

| # | Check |
|---|---|
| 7 | The whole affected suite still passes: `qa:lint`, `heal:check` (tsc + eslint), and the specs that import a changed shared file, not only this PR's specs (scan `QPR-SHARED-CHANGED`) |
| 8 | No shared export, fixture, page object or factory another spec uses was removed or renamed (scan `QPR-EXPORT-REMOVED` — High when a user remains) |
| 9 | The runner was not loosened: no new `retries`, `testIgnore`, `grepInvert`, `failOnFlakyTests: false`, `forbidOnly: false` (scan `QPR-CONFIG-LOOSENED`); the CI file lost no job or required check |
| 10 | The mirror holds: every new or changed script has its case (same Case ID and basename), and the script's `test.step('Step N…')` count equals the case's numbered steps (scan `QPR-NO-CASE`, `QPR-ORPHAN-SCRIPT`, `QPR-SCRIPT-DELETED`, `QPR-STEP-MISMATCH`) |
| 11 | Ids and tags stay unique and single-writer: no Case ID minted twice or reused (`QPR-DUP-ID`, `QPR-ID-REUSED` → `renumber-case.mjs`); `@quarantined` only via `/qa-quarantine`, `@smoke`/`@regression` only via `/qa-regression` (`QPR-QUARANTINE-TAG`, `QPR-SUITE-TAG`, §6, §12) |
| 12 | Reviews and run plans stay true: a changed case whose review hashed it re-enters `/qa-review` (`QPR-REVIEW-STALE`, §18); a changed run plan still resolves — `npm run qa:plan:resolve -- <name> --check` (§19) |

**C. Right format — the agreed shape**

| # | Check |
|---|---|
| 13 | Case format (§7): H1 is `<Case ID> — [<Module> · <Platform>] <Screen/Operation> — <Actor> <action> → <expected>`; every section present; an `@p0`–`@p3` priority derived from the REQ; title, steps and expected say the same thing (scan `QPR-CASE-H1`, `QPR-CASE-TITLE`, `QPR-CASE-SECTIONS`, `QPR-CASE-PRIORITY`; `qa:lint` for the rest) |
| 14 | Traceability: every new case has its plan row, its REQ/AC ids and the plan's `## AC coverage` updated |
| 15 | Script format: file and folder mirror the case, `caseMeta()` carries the id and tags, eslint clean; comments follow `qa-phase-protocol/references/script-comments.md` (no restated line, no commented-out step, every waiver says why, none contradicts its code); the shipped kit is not edited in place (`QPR-KIT-EDIT`) |
| 16 | Commits are Conventional Commits, no `wip`/`fixup!` left, branch named `<test|qa|feature|fix>/<slug>` (scan `QPR-COMMIT-FORMAT`, `QPR-COMMIT-WIP`, `QPR-BRANCH-NAME`) |
| 17 | Nothing that does not belong: no `.env.*`, `.auth/`, tokens, traces, videos, `state.json`, caches (`QPR-ENV`, `QPR-SECRET`, `QPR-HEAVY-EVIDENCE`, `QPR-STATE`, `QPR-JUNK`) |

**D. Ready to merge — now, into this base**

| # | Check |
|---|---|
| 18 | Merges cleanly, no conflict marker committed (`QPR-CONFLICTS`, `QPR-CONFLICT-MARKER`) |
| 19 | Current with the base: the specs were run against the app and kit they will merge into, not an older one (`QPR-BEHIND`) |
| 20 | Only test work: application code in the PR has its own development review (`QPR-APP-CODE` → `/sdlc-review-pr`) |

## Step 4 — findings, verdict, comment

`| # | Severity | Where | Finding | Why it matters | Prescribed action | Source |`

- Severity is this bundle's: **High** (the test can lie or stop running — a lost assertion, a skip,
  a script with no case, a loosened runner, a secret), **Medium** (it will flake or mislead — sleep,
  shared data, weak assertion, stale review, kit edit), **Low** (style or hygiene).
- **Where** is `path:line` on the head commit. **Source** is `scan:<id>`, `read`, or `ran:<command>`.
- **Prescribed action** names the command that fixes it when there is one (`/qa-design <slug> --fix`,
  `renumber-case.mjs <file>`, `/qa-quarantine`, `/qa-review <slug>`).

| Verdict | When |
|---|---|
| `APPROVE` | no High; no Medium in groups A or B; and rows 6, 7 and 18 are `PASS` from a run, not `N/A` |
| `REQUEST CHANGES` | any High, or a Medium in group A (the test can lie) or B (something that ran stops meaning the same) |
| `COMMENT` | part of it could not be reviewed or run: say which part, and who must act |

The file opens with this front matter:

```yaml
---
pr: <gitlab!n | github#n | branch>
kind: testing
base: <ref> @ <merge-base sha>
head: <ref> @ <head sha>
reviewer: reviewing-test-pull-requests
verdict: <APPROVE | REQUEST CHANGES | COMMENT>
date: <YYYY-MM-DD>
---
```

Sections in order: `## Scope`, `## Run` (commands and their result lines), `## Checklist`,
`## Findings`, `## Notes`, `## Comment to post`. The comment is for the author. Write it plainly,
with the High findings first and one line each with `path:line`.

A second round adds `## Resolution`. It has one row per prior finding, marked `RESOLVED`,
`ACCEPTED` or `REOPENED`, and each is checked on the new head.

## Findings that are usually wrong

1. **"Add more cases."** Coverage gaps of a feature are `/qa-review`'s job; here, name a gap only
   when this PR's own change creates it (a case deleted with nothing covering its AC).
2. **Formatting.** eslint and tsc run in CI.
3. **Restyling a passing, isolated, honest test.** `Low` at most.
4. **Product bugs the tests revealed.** They are defects (`/qa-defect`), not review findings. Note
   them; they do not block the test PR unless the test was changed to hide them.

## Done — ALL must be true
- [ ] `pr-scan.mjs` ran; every finding carried or dismissed with a reason.
- [ ] Every changed case/script pair checked against all 20 rows, or a row marked `N/A` with why.
- [ ] Changed specs run 3× and shuffled where an environment was reachable; one assertion seen to fail.
- [ ] Verdict follows the table; front matter and body agree.
- [ ] Zero edits to cases, scripts, plans, tags or configs; the worktree removed.
