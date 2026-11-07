# Contributing

Written for: someone changing the bundle itself — a command, an agent, a skill, a template, a
script. Using the bundle in a project is `docs/user-guide.md`.

## Before you start

```bash
bash tests/selfcheck.sh            # the artifact lint accepts the fixture and rejects every violation
node --test "tests/*.test.mjs"                # the bundle lints itself: names, sizes, wiring, citations, counts
```

Both must be green before and after your change. `CONTRACTS.md` is the authority. If your change
needs a rule the contract does not have, change the contract first, in its own commit, and cite
the section from the file that depends on it.

## Where a change goes

| You want to… | Edit | Not |
|---|---|---|
| change what one command does | `commands/qa-<name>.md` (deltas only) and the skill it invokes | the protocol |
| change what every command does | `skills/qa-phase-protocol/SKILL.md` | every command file |
| add a check a reviewer or designer must make | `/qa-improve <skill> "<check>"` — one row plus two fixtures | prose in the agent |
| change an artifact's shape | the template under `workspace/qa/_templates/` and `lint-qa.mjs` | the skill that fills it |
| change a rule, a path, a vocabulary word | `CONTRACTS.md` | anywhere else |
| add a test type | a pack under `types/<type>/` (see below) | nine scattered edits |

Nothing lives in two loaded files. If you find yourself pasting a paragraph into a second file,
it belongs in the protocol, the contract, or a sibling reference file the skill links to.

## Naming

The self-lint (`tests/bundle.test.mjs`) enforces these.

| Kind | Pattern | Example |
|---|---|---|
| command | `qa-<verb or noun>` | `qa-design`, `qa-retro` |
| agent | `<role noun>` | `case-designer`, `qa-reporter` |
| skill | `<verb-ing>-<object>` | `designing-api-cases`, `healing-e2e-script` |
| protocol skill | `qa-<noun>-protocol` | `qa-phase-protocol` |
| ids | `REQ-NNN`, `TC-<TYPE>-<MODULE>-<NNN>`, `DEF-<slug>-NNN`, `XS-<slug>-NNN`, `BR-NNN`, `Q-NNN` — permanent, never reused | `CONTRACTS §1` |

All names are lowercase kebab-case. A skill's front matter `name:` equals its directory; an
agent's equals its file name. A name is never shared between an agent and a skill: the installer
merges both into one `.claude/` tree, together with the dev and eval bundles.

## Size budgets

Every file an agent loads is paid for on every spawn. Budgets live at the top of
`tests/bundle.test.mjs`; the test fails when one is exceeded.

| What | Budget | Why |
|---|---|---|
| skill / agent description | 200 / 220 chars, one line, written as a trigger ("Use when…") | all descriptions share ~1% of the context window; overflow is dropped silently |
| command description | 120 chars + `disable-model-invocation: true` | shown in the `/` menu; user-invoked, so not in the model's listing |
| command | 1,100 words | deltas only — the protocol holds the rest |
| `qa-phase-protocol` | 950 words | loaded once per session, stays resident |
| `SKILL.md` | 500 lines | past that, move reference material to `references/` and link it |
| agent `skills:` preloads | 0 | the full file is injected on every spawn whatever type was asked; every agent invokes its skill by name |

## Writing style for agent-facing files

Imperative, numbered where order matters, one rule per bullet. State the rule, then at most one
sentence on the failure it prevents. The long "because" paragraph belongs in `docs/`, not in a
file an agent re-reads on every run. Every number, verdict and path in an artifact traces to a
file; a skill that cannot read something reports a gap, never a guess.

## Tests

- `tests/selfcheck.sh` proves the artifact lint (`lint-qa.mjs`) accepts `tests/fixture/qa` and
  rejects each listed violation. **A new lint rule is not merged without a mutation line that
  fails without it.**
- `tests/bundle.test.mjs` proves the bundle's own shape. Run it against a deliberately broken
  copy before trusting a new assertion:

  ```bash
  cp -r . /tmp/bundle && sed -i 's/^description: .*/description: '"$(printf 'x%.0s' {1..300})"'/' /tmp/bundle/commands/qa-design.md
  STLC_BUNDLE_ROOT=/tmp/bundle node --test tests/bundle.test.mjs   # must fail
  ```

- A new design-skill minimum or review check goes in through `/qa-improve`, which adds the row
  and both fixtures (one the check must flag, one it must leave alone).

## Adding a test type (a pack)

A type touches: a `PROJECT-PROFILE §Test types` row, a `CONTRACTS §1` stem and `§7` sections, a
designing skill, a generating skill, a `<qa-root>/package.json` runner, a `lint-qa.mjs` section check, a
`reporting-results` step, and the CLI's `RUNNER_BY_TYPE`. Keep them together under
`types/<type>/` with a `TYPE.md` that states each of those slices, plus a fixture (one case, one
script, one run folder) that `selfcheck.sh` lints. `docs/testing-coverage-map.md` lists the packs
that are planned and the order.

## Adding a runner (Selenium, Cypress, Detox …)

A runner is HOW a platform's cases execute. Playwright, Maestro and Appium are entries in
`workspace/qa/scripts/shared/lib/runners.mjs`; nothing else names a runner by hand. To add one:

1. A registry entry: engine `wrapper`, the `types` it runs, the script `ext` (`.java`, `.cy.ts`), the
   `wrapper` path, the `evidence` folder, and the `idPattern` its test names start with.
2. The wrapper script. It runs one platform's cases and writes the results contract (CONTRACTS §20).
   For a JUnit-producing tool, `lib/junit.mjs` `readJunit` + `resultsOf` is the whole parse.
3. The id in `config/platforms.ts` `PlatformRunner` and a row in `PROJECT-PROFILE.md`. The bundle
   test fails until both agree with the registry.
4. Its shipped kit under `scripts/shared/<runner>/` (element maps, actors, data, cleanup, the same
   layers as the Playwright kit) and a `references/<runner>.md` in the generating skill.
5. Optional: static rules in `lib/<runner>.mjs`, called from `lint-qa.mjs` §3 for its extension.

Routing, the dry run, the run, verdicts, the write-back and `summary.md` need no change. The test
`runners: a new wrapper runner needs only its registry entry` proves it with a stub Selenium entry.

## Releasing

1. Update `VERSION`, `GENERATOR_VERSION` in `workspace/qa/scripts/shared/build-state.mjs`, the README
   `**vX.Y.Z**` line and the `generator_version` of the committed `state.json` fixtures
   (`tests/fixture/qa/`, `editor/vscode-stlc/src/test/fixtures/`). Work in progress sits under
   `## [Unreleased]`; at release it becomes `## [X.Y.Z] — YYYY-MM-DD` below a fresh, empty
   `## [Unreleased]` (what changed, and any budget that moved). `tests/bundle.test.mjs` fails when
   these disagree or the headings are out of order.
   - Every **MAJOR** adds a `### Breaking` subsection to its CHANGELOG entry (what breaks in a
     project on the previous major, and the fix) and a `## X.0.0 (MAJOR, from …)` section to
     [UPGRADE.md](UPGRADE.md) from its template, with before/after snippets and a rollback. A MINOR
     that needs manual steps adds a section too. The bundle test enforces the MAJOR rule.
   - The `CONTRACTS.md` header classifies by `§16` (the dev bundle's seam); the workspace kit
     (`workspace/qa/`: shared layer, `.env` keys, case and plan formats `qa:lint` errors on) follows
     semver on its own, and whichever of the two is larger sets the bump.
2. `bash tests/selfcheck.sh`, `node --test "tests/*.test.mjs"`, `editor/vscode-stlc` `npm run
   compile && npm test`, and the golden run (`node tests/golden/run.mjs`) green.
   - **CHANGELOG.md, every release, in English.** Move `[Unreleased]` into the new version. Write
     for someone outside the project: a one-line summary, then at most about ten bullets under
     Added / Changed / Fixed / Removed, each saying what a user can now do or must change. No
     internal project names, no file-by-file inventory, no word or token counts, and no credit to
     outside repositories (that lives in `docs/skill-sources.md`). Migration detail goes in
     UPGRADE.md, linked from the entry. The entry states its benchmark: a committed
     `docs/bench/bench-X.Y.Z.json`, or `Benchmark: not run — <reason>` (tested).
3. Merge to `main`, then tag `vX.Y.Z` **on `main`** after the merge (never on a lane branch) and
   push the tag. Projects pick it up with `afx update --bundle qa`; `afx` reads the tag and the
   CHANGELOG to tell them the kind.

## Language

Prose in this repository is English. Vietnamese (or any team language) is data inside an artifact
when `PROJECT-PROFILE §Project → Artifact language` says so; structural tokens stay English
(`CONTRACTS §8`).
