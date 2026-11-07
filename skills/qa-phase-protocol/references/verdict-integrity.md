# Verdict integrity — the judgment half (CONTRACTS §31)

A test exists to make one true sentence: *on system S, behaviour B held* — or did not. The contract
section holds the vocabulary and the mechanical checks. This page is the part no check can do: how a
principal tester thinks while writing, running, healing or reporting, so that the sentence stays true.
It applies to every tier and every platform — web, API, mobile, desktop, data, a monolith or forty
services — because each rule is about the claim, not the tool.

## 1. Identity — which system did this run reach?

Ask before trusting any result: *if the wrong thing were deployed, would this run notice?*
- A system is code **and** client **and** config **and** schema **and** data. A green API run on the
  right commit with yesterday's flag set is a statement about yesterday's product.
- Cross-service cases depend on every service they touch; one stale service makes the whole case a
  claim about a mixture nobody ships.
- Clients lag: a CDN bundle, an installed app, a desktop build. Pin what the user actually runs, not
  what the server says it serves.
- Long runs straddle deploys. Re-probe at the end; two identities in one run is two half-runs.
- A system that cannot report its identity is a testability defect. Ask for it; do not work around it.

## 2. Observation — a read has three answers

| The read returned | It means | May support |
|---|---|---|
| a value — `0`, `""`, `[]` included | it was read | PASS or a product FAIL |
| confirmed absent | looked for in the right scope (right page, right tenant, after the right wait), and not there | PASS or a product FAIL |
| could not read | timeout, refusal, error page, changed shape, wrong frame | **neither** — UNKNOWN |

When writing a reader (page object, service, helper), make the third answer impossible to mistake
for the first two: throw with context, or return an explicit unknown the assertion refuses. Shapes
that silently convert, and that `qa:lint` rejects without an `// unknown-ok: <reason>`:
`count().catch(() => 0)` · `isVisible().catch(() => false)` · `innerText().catch(() => '')` ·
`json().catch(() => ({}))` · `list().catch(() => [])`. Also watch the ones no lint sees:
`Number('')` is `0`; an HTML error page parsed as "no rows"; a filter that matched nothing reported as
"the operation produced nothing"; a toast that came and went before the read, reported as "no toast".

Evidence that cannot be read back later — a toast, a transient modal, a flash message, a visual state
— is captured *during* the step that owns it (screenshot, DOM snapshot, response body), or the claim
is unevidenced.

## 3. Oracle — the case judges; nothing moves it to meet the product

Every one of these makes a red run green and destroys the finding the run existed for:

| The move | Why it feels reasonable | What it actually did |
|---|---|---|
| Edit the case | "the case is out of date" | moved the oracle to where the product is. A wrong case is a conversation with its owner and a case review (§18), never a heal |
| Drop or soften an Expected | "not what the case is about" | deleted a promise. A claim you cannot observe is `NOT EVALUATED`; a claim quietly dropped is a lie |
| Skip the step that broke | "the rest still proves it" | a skipped step is not a passing step |
| Widen the comparison or the wait | "same thing, less brittle" | `equals "Sent"` and `contains "Sent"` are different promises; waiting longer for a wrong answer does not make it right |
| **Read through an easier channel** | "the server holds the truth" | answered another question. "The toggle shows ON" is about the screen; an API read cannot see a toggle that renders OFF. Choose the channel from the Expected, not from what is cheap |
| **Substitute an easier subject** | "any record exercises the branch" | the case named its subject (a fixed-price invoice, an offline device, a second-tenant user); another subject answers another case. Cannot prepare it → say so, with the reason |
| **Count a step because its block ran** | "the step executed" | proved a title printed. "Fill all mandatory fields" is performed when the fields were filled |
| **Certify half a compound Expected** | "the main half held" | "returns to disabled **and** its value is cleared" is two claims; read both |

Follow the steps as written, in order, including the ones that look redundant — "click it, then tab
into it, then type into it" asks three questions about one control. A step that genuinely cannot be
automated is a `COVERAGE-GAP` with its reason, never an omission.

## 4. Attribution — before you accuse the product

The default answer to "manual passed, automation failed" is *the automation is wrong*, until shown
otherwise. Three questions, each answered with evidence:

1. **Did the precondition still hold at the failing assertion?** Setup can be undone between arrange
   and assert (a fixture that restores itself, a session that expired, a parallel test that reset the
   shared record) — or the state may never have been reachable (a permission the account's role grants
   regardless of the per-user setting). Re-read the state at the assertion.
2. **Is there a control?** Invert the state and run the same check: denied vs granted, flag off vs on,
   online vs offline. Same result both ways → the check does not measure what it claims.
3. **Does it reproduce outside the harness?** A request, a manual step, a minimal sequence.

And one pattern: several cases of one family failing *identically* point at their shared fixture; a
real defect is rarely that symmetrical. Diff the failures against the family's passing cases — the
difference is the bug.

## 5. Closure — what "fixed" means

A defect is fixed when the case that reproduced it was red on the failing system and is green on a
**different** one — the build that carries the fix. Green on the same identity is a flake or an
environment change. An escaped defect with no case cannot be fixed yet: design the guard first.

## 6. Delta — read results against change

Read every run against the previous one, and against what changed in the system between them:

| Results | System | First suspect |
|---|---|---|
| newly failing | code changed | the change |
| newly failing | only config / data / schema changed | that change — often not a product defect |
| newly failing | nothing changed | the test, its data, or the environment |
| newly passing | nothing changed | not a fix — flake or environment |

## 7. Findings need an oracle

An exploratory observation is a defect when it was seen on the running system and contradicts
something written down. "That looks wrong to me" with nothing written is a question to the owner —
and the answer becomes the rule the next case is grounded in.
