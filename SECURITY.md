# Security

This bundle is a set of Markdown instructions, Node and shell scripts and templates that run
inside Claude Code on your machine. It ships no server and makes no network calls of its own.
Telemetry is **opt-in**: two hooks in `settings.json` call the `recall`
CLI (team memory and usage per command and skill) only where it is installed and `RECALL_URL` is
set, and exit silently otherwise; `/qa-feedback` pushes only what the user typed. The only things it executes are the scripts under `workspace/qa/` and
the runners the project declares in `<qa-root>/package.json`, against the application and environments
named in `PROJECT-PROFILE.md`.

## What the bundle will not do

- Run a security scan or a load test against an environment whose `§Environments` row says `no`
  (`CONTRACTS.md §9.5`). CI never authorizes an environment; the person who clicks the job does.
- Scan or load anything other than the application declared in `§Application under test`.
- Write to an external tracker or test-management system (Azure DevOps, Jira) without the user's
  explicit confirmation of the exact list being pushed (`§9.9`). Reads are free.
- Edit application source. The `unit` and `mobile` types may write *test files* under the test
  directories declared in the profile, only in Write mode `apply` (`§9.6`, `§11`, `§15`).
- Echo a credential. `/qa-env` names a missing variable, never a value; `<qa-root>/.env.*` is never
  committed (`workspace/qa/.gitignore`).
- Write a secret into a case, a run artifact, a defect or a report.

## Reporting a vulnerability

Open a confidential issue on the GitLab project, or email the maintainers listed on the project
page. Include the bundle version (`VERSION`), the command that was running, and the run folder
(`<qa-root>/runs/<type>/<slug>/<run-id>/`) if one was written. We aim to acknowledge within five
working days.

## Supply chain

Third-party ideas adapted into skills are listed with their upstream repository, commit and
licence in `docs/skill-sources.md`. The shared TypeScript layer's dependencies are pinned in
`workspace/qa/package.json`. The bundle's own checks (`bash tests/selfcheck.sh`,
`node --test tests/`) run in CI on every change.
