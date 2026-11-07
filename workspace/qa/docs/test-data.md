# Test data

<!-- The single test-data contract (CONTRACTS §7). Written and updated by /qa-data
     (managing-test-data); read by generating-* and executing-tests. qa:lint fails a case whose
     `[DATA:<entity>-<state>]` token has no Glossary row here, so add the row before the case.
     Tokens: lowercase-kebab `<entity>-<state>`, e.g. `[DATA:customer-active]`, `[DATA:order-paid]`.
     Synthetic data only, always. -->

## Glossary

<!-- One row per token. The Token cell is what qa:lint matches: keep it as `[DATA:<entity>-<state>]`.
     Strategy: factory (default: created per run, parallel-safe) | API-created | static seed (reference
     data only — a seed for anything a test mutates breaks parallel runs). -->

| Token | Entity | Strategy | Lifecycle | Needed by | Notes |
|---|---|---|---|---|---|

## Factories

<!-- One line per factory: `<file>#<function>` — the run-unique key it uses and what it cleans up.
     Factories live under <qa-root>/scripts/shared/data/. -->

## Pool accounts

<!-- Named actors the cases' `## Isolation` → `actor:` lines refer to. A pool holds enough accounts
     for the configured Playwright workers; credentials come from <qa-root>/.env.<env>, never from here. -->

| Pool | Role | Size | Source |
|---|---|---|---|

## PII rules

<!-- Fields that identify a person: generator (faker-style synthetic), "never sample production",
     masking expectation where the app displays them. Present even when empty:
     "no PII fields identified — reviewed YYYY-MM-DD". -->

## Per-env notes

<!-- Per environment from PROJECT-PROFILE §Environments: which strategies work there, seeded
     reference data, pools available, refresh cadence. -->

## Open conflicts

<!-- A token used with conflicting constraints by two cases — reported, never merged silently. -->
- none
