---
description: Review a teammate's testing PR/MR (GitLab or GitHub): scan, run, read the <qa-root>/ diff → APPROVE / REQUEST CHANGES.
argument-hint: <pr-number | branch> [--base <ref>] [--env <env>]
disable-model-invocation: true
---

Follow `qa-phase-protocol` (invoke the skill if it is not already in context); this file holds only what is specific to this command.

> Profile first, by section (`profile.mjs`) — `§Test types`, `§Platforms`, `§Environments`. QA root
> defaults to `<qa-root>/`. Contract: CONTRACTS §21.

Review the testing pull request `$ARGUMENTS` — cases, scripts, run plans and QA config a teammate
changed under `<qa-root>/`. Several people write tests in one repository; this is the second pair of eyes
before their branch merges. It is not a phase: it does not move a feature forward, and it writes
one file.

A PR that changes the product's code is a development PR. Review it with `/sdlc-review-pr` from
the dev bundle, which looks for code that does the wrong thing. This command looks for **tests that
lie**: green when the product is broken, or no longer running at all. A PR that changes both gets
both reviews. The scan reports the overlap as `QPR-APP-CODE`.

## Preconditions (check before delegating)

- [ ] `$ARGUMENTS` names a PR number or a branch that git can resolve
- [ ] The repository has a `<qa-root>/` folder (this bundle is installed)

A number is fetched read-only from `origin`: `merge-requests/<n>/head` on GitLab, `pull/<n>/head`
on GitHub. No `glab`/`gh` CLI and no token are needed. The base is `--base`, else `origin`'s
default branch. If git cannot read the PR, stop and show the error.

## Execution

1. Run `node <qa-root>/scripts/shared/pr-scan.mjs --pr <n>` (or `--base … --head …`) and keep its
   output: it is the review's first input.
2. Delegate to the `test-planner` agent with the refs, the scan output and `--env` if given. It
   invokes the `reviewing-test-pull-requests` skill. The planner did not write the PR, so its read
   is independent. It reads the branch with `git show` and runs the changed specs from a throwaway
   worktree (`.claude/pr-review/<n>`), never by checking the branch out over the user's work.
3. Output: `<qa-root>/reviews/_pr/<pr-id>-<YYYY-MM-DD-HHmm>.md` (`<pr-id>` = `gitlab-<n>`, `github-<n>`,
   or the branch with `/` → `-`), ending in `## Comment to post`.

A second round (the author pushed fixes): run again with the same `$ARGUMENTS`; the reviewer
resolves each prior finding on the new head.

## Hard rules

The review edits NOTHING in `<qa-root>/` except its own file: no case, script, plan row, tag, run plan or
config. It never posts to the platform. The person posts the comment. A run that could not reach
the environment is `N/A` with the reason, never `PASS`.

## Done criteria

Report back:

```
✓ Wrote <qa-root>/reviews/_pr/<pr-id>-<stamp>.md
Verdict: APPROVE | REQUEST CHANGES | COMMENT   (head <sha>)
Findings: <h> High · <m> Medium · <l> Low — worst: <one line, path:line>
Ran: <n> changed specs ×3 + shuffle → <pass/fail>  |  fail-proof: <spec:line went red when broken | not run (why)>
Post: copy "## Comment to post" into the PR — this command never posts it
```
