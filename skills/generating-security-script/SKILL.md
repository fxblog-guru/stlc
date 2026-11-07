---
name: generating-security-script
description: Use to generate a ZAP baseline and Playwright authz specs from TC-SEC cases, only against the authorized app (/qa-script --type security).
version: 1.1.0
---

# Generating Security Script (ZAP baseline + Playwright authz)

## Authorization guardrail — READ FIRST, refuse anything outside it

Security tests target **ONLY the team's own application in authorized test environments** — the
system named in PROJECT-PROFILE `§Application under test`, on environments listed in
`§Environments`. Standard practice only: OWASP-Top-10-derived cases, authn/authz matrices,
input-validation checks, ZAP **baseline (passive)** scanning. **No exploit development. No testing
of third-party systems** (including third-party services the app merely integrates with). Before
generating anything, resolve the target: `ZAP_TARGET_URL` / `BASE_URL` / `API_BASE_URL` MUST match
a host declared in `§Environments` for the application in `§Application under test`, and the
case's `## Authorization` section must name that environment with its scope statement. Target
outside that scope, or a missing/mismatched `## Authorization` section → **REFUSE, generate
nothing, report why.**

> Profile first, by section (`profile.mjs`) — `§Application under test` (the ONLY legitimate
> target), `§Environments`, `§Test types` (is security enabled), `§Quality gates` (alert/severity
> gate — default: no unresolved High/Critical). QA root below is the default `<qa-root>/`
> (profile-overridable).

> **Project setup required:** Docker (for `zaproxy/zap-stable`). Shipped: the `<qa-root>/package.json`
> scripts `test:security` (runs the ZAP baseline wrapper AND the Playwright security specs) and
> `heal:check` (`tsc --noEmit` + `<qa-root>/eslint.config.mjs`), plus the kit under `<qa-root>/scripts/shared/`
> (read its `README.md`): fixtures `pool` (this worker's own accounts), `as(actor)`, `anonymous`,
> `<module>As(actor | client)`, `<module>Factory.withMember(role, account)`, `cleanup`; ApiClient
> variants `withoutCsrf()`, `withCsrf(t)`, `withToken(t)`, `withHeaders(h)`; `caseMeta`. Golden
> reference: `tests/golden/qa/scripts/security/projects/TC-SEC-PROJECTS-001-role-matrix.spec.ts`.

## Action

Generate the automated artifact(s) for ONE security case — a ZAP baseline config for scan-type
cases, a Playwright spec for authz/authn cases. **Automate exactly what the case specifies —
nothing more.** A security check no case states is designed first (`designing-security-cases`),
never improvised here. Invoked by the `nonfunctional-engineer` agent via
`/qa-script --type security`.

## Input

| What | Where |
|---|---|
| The case | `<qa-root>/cases/security/<module>/TC-SEC-<MODULE>-<NNN>-<short-desc>.md` — contract case format plus `## OWASP ref` and `## Authorization` (env + scope statement) |
| Case discovery | The plan's `## Traceability (Requirement ↔ Case)` table in `<qa-root>/plans/<slug>/YYYY-MM-DD-test-plan.md`; fallback: grep `**Feature:** <slug>` under `<qa-root>/cases/`. **NEVER glob `<slug>.md` filenames.** |
| Target + creds | `<qa-root>/.env.<env>`: `ZAP_TARGET_URL` (scans), `BASE_URL`/`API_BASE_URL` (authz specs), `AUTH_MODE` + `AUTH_*`, `TEST_USER*` named actors, `TEST_POOL_*` account pool |
| Shared layer | `<qa-root>/scripts/shared/` — fixtures, services, factories, endpoint map (reused by the authz specs exactly as in `generating-api-script`) |

> **Project setup required:** role-matrix cases need (a) an **account pool** — `TEST_POOL_USER`,
> `TEST_POOL_PASSWORD`, `TEST_POOL_SIZE` (≥ workers × `TEST_POOL_PER_WORKER`) seeded in the app,
> plus `AUTH_ID_PATH` so the factory can grant per-object roles to an account id; and (b) one named
> actor per GLOBAL role the matrix names (`TEST_USER_ADMIN` / `TEST_PASSWORD_ADMIN`). PROJECT-PROFILE
> §Application under test records which roles are which. The setup project signs them all in once.

## Output — script path mirrors the case path 1:1

| Case kind (from its Steps/Expected) | Artifact | Path |
|---|---|---|
| Baseline scan case (Expected = scan completes with the alert gate) | ZAP baseline config | `<qa-root>/scripts/security/<module>/<same-TC-basename>.conf` |
| Authz / authn / session case (role matrix, token, session checks) | Playwright spec | `<qa-root>/scripts/security/<module>/<same-TC-basename>.spec.ts` |

Plus: the case's traceability row flipped `Scripted` ❌ → ✅ (Step 6).

## Grounding rules

| # | Rule |
|---|---|
| 1 | **Scope first.** The guardrail above is checked before anything is written; the resolved target is recorded in the artifact's header comment. |
| 2 | **Only what the case specifies.** Roles, endpoints/pages, tokens, and session behaviors come from the case's Steps/Expected — no extra roles "while we're here", no endpoint sweeps the case never named. |
| 3 | **Every assertion from an Expected.** 401 vs 403 vs redirect-to-login is asserted exactly as the case states it; cookie flags (`Secure`/`HttpOnly`/`SameSite`) only when the case lists them. |
| 4 | **The alert gate comes from `§Quality gates`** (default: FAIL on High/Critical, WARN on Medium/Low) — encoded in the `.conf` so the scan run fails automatically on a gated alert. Never invent a stricter or looser gate. |
| 5 | **Baseline = passive.** `zap-baseline.py` spiders and passively scans; no active attack policies, no auth brute-forcing, no payload fuzzing beyond what a designed case explicitly states as an input-validation check. |
| 6 | **Endpoints via the shared layer** — authz specs reuse `endpoints/*` + services from `generating-api-script`'s reference architecture; zero raw URL-path literals. |
| 7 | **Never weaken to green.** A gated alert or a role that CAN reach a forbidden resource is a finding to triage (below), never an assertion to soften or an IGNORE rule to add silently. Every `IGNORE` in the `.conf` carries a reviewed-false-positive reason comment. |

## Procedure

### 1. Parse the case + scope check
Extract: Case ID, Feature slug, Plan path, Tags, `## OWASP ref`, `## Authorization` (env + scope),
Preconditions, Steps (Action/Expected), Expected Result, Data. Run the guardrail check. Then the
completeness gate (≥1 step + real Expected — else stop and report). Classify the case kind per the
Output table.

### 2a. Scan-type case → ZAP baseline config

```
# TC-SEC-ORDERS-001 — [Orders] /orders surface — Anonymous ZAP baseline scan → no High/Critical alerts
# Source: <qa-root>/cases/security/orders/TC-SEC-ORDERS-001-baseline-scan.md
# Target: $ZAP_TARGET_URL (must match §Environments — verified <env> on <date>)
# Gate (§Quality gates): FAIL High/Critical · WARN Medium/Low
# Format: <ruleid>\t<FAIL|WARN|IGNORE|OUTOFSCOPE>\t(<rule name>)
40012	FAIL	(Cross Site Scripting (Reflected))
40018	FAIL	(SQL Injection)
10202	WARN	(Absence of Anti-CSRF Tokens)
# IGNORE only with a reviewed false-positive reason:
# 10096	IGNORE	(Timestamp Disclosure — build stamp on the public footer, reviewed 2026-08-09)
```

Tune rule levels from the case's `## OWASP ref` (rules mapping to the referenced category at
least WARN; gated severities FAIL per rule 4). Documented run command (wired into
`test:security`):

```bash
# run from <qa-root>/ — scripts/security/zap-baseline.sh wraps exactly this
docker run --rm -v "$(pwd):/zap/wrk:rw" -t zaproxy/zap-stable zap-baseline.py \
  -t "$ZAP_TARGET_URL" \
  -c scripts/security/orders/TC-SEC-ORDERS-001-baseline-scan.conf \
  -J runs/security/<slug>/<run-id>/zap-report.json \
  -r runs/security/<slug>/<run-id>/zap-report.html
```

Non-zero exit on any FAIL-level alert = the gate fails automatically; `executing-tests` supplies
the run dir.

### 2b. Authz/authn case → Playwright spec
An authorization case is a **matrix**: every cell (actor × operation → expected status) from the
case's `## Authorization` / Steps table is its OWN parallel test. The running reference is
`tests/golden/qa/scripts/security/projects/TC-SEC-PROJECTS-001-role-matrix.spec.ts` (in the bundle
repo; three seeded product bugs each turn exactly one of its cells red).

- **Roles are data.** A per-object role (viewer, member, admin of THIS project) is granted by the
  factory to this worker's pool account (`projectsFactory.withMember('viewer', pool[0])`) on an
  entity the test just created — no two tests or workers share a "viewer". A global role (system
  admin, auditor) is a named actor `TEST_USER_<ROLE>` used read-only (`as('admin')`).
- **Negative axes are client variants, as rows of the same matrix**: `anonymous` (401),
  `client.withoutCsrf()` / `client.withCsrf('forged')` (403 on every state-changing call under
  `AUTH_MODE=session-csrf`), `client.withToken(expired)` (401), non-member (404 when the API must not
  reveal existence — exactly as the case states).
- **No branches in the test body**: arrangement and caller per row live in lookup tables keyed by
  the row's actor (`ARRANGE[who]`, `CALLER[who]`).

```ts
import { test, expect, caseMeta } from '../../shared/fixtures';
import type { ApiResponse, Session } from '../../shared/fixtures';
import type { ApiClient } from '../../shared/http/api.client';
import type { OrdersService } from '../../shared/services/orders.service';
import type { OrdersFactory } from '../../shared/data/orders.factory';

type Who = 'viewer' | 'editor' | 'non-member' | 'anonymous' | 'no-csrf';
const OPS = {
  read:   { name: 'GET /orders/{id}',         call: (s: OrdersService, id: string) => s.get(id) },
  cancel: { name: 'POST /orders/{id}/cancel', call: (s: OrdersService, id: string) => s.cancel(id) },
} satisfies Record<string, { name: string; call: (s: OrdersService, id: string) => Promise<ApiResponse<unknown>> }>;

// From the case's ## Authorization table, verbatim.
const MATRIX: readonly { who: Who; op: keyof typeof OPS; status: number }[] = [
  { who: 'viewer', op: 'read', status: 200 },     { who: 'viewer', op: 'cancel', status: 403 },
  { who: 'editor', op: 'read', status: 200 },     { who: 'editor', op: 'cancel', status: 200 },
  { who: 'non-member', op: 'read', status: 404 }, { who: 'anonymous', op: 'read', status: 401 },
  { who: 'no-csrf', op: 'cancel', status: 403 },
];

type Ctx = { account: Session; as: (s: Session) => Promise<ApiClient>; anonymous: ApiClient };
const ARRANGE: Record<Who, (f: OrdersFactory, a: Session) => Promise<{ id: string }>> = {
  viewer: (f, a) => f.withMember('viewer', a), editor: (f, a) => f.withMember('editor', a),
  'non-member': (f) => f.create(), anonymous: (f, a) => f.withMember('editor', a), 'no-csrf': (f, a) => f.withMember('editor', a),
};
const self = async ({ account, as }: Ctx) => as(account);
const CALLER: Record<Who, (c: Ctx) => Promise<ApiClient>> = {
  viewer: self, editor: self, 'non-member': self,
  anonymous: async ({ anonymous }) => anonymous,
  'no-csrf': async (c) => (await self(c)).withoutCsrf(),
};

for (const cell of MATRIX) {
  test(`TC-SEC-ORDERS-002 — [Orders] ${OPS[cell.op].name} — ${cell.who} calls it → ${cell.status}`, caseMeta({
    id: 'TC-SEC-ORDERS-002', type: 'security', module: 'orders', priority: 'P0', req: ['checkout/REQ-031'],
  }), async ({ pool, ordersFactory, ordersAs, as, anonymous }) => {
    const [account] = pool;
    const order = await ARRANGE[cell.who](ordersFactory, account);
    const caller = await ordersAs(await CALLER[cell.who]({ account, as, anonymous }));

    const res = await OPS[cell.op].call(caller, order.id);

    expect(res.status, `${cell.who} × ${OPS[cell.op].name}`).toBe(cell.status);
  });
}
```

A forbidden write is also proven not to have happened when the case says so (read the entity back
as the owner in the same test). Session/logout checks sign a POOL account in through its own
context and prove the old session is dead (reuse → 401/redirect) — never sign out a named actor,
whose session every worker shares. A global-role actor the env does not declare fails the setup
project in CI; locally the cells that need it are `test.skip(!namedActors().includes('admin'), …)`
— an honest gap, never a silent pass.


### 3. Findings triage format
Every gated alert or failing authz assertion becomes a finding — recorded in the run's
`findings.md` (under `<qa-root>/runs/security/<slug>/<run-id>/`) and consumed by `reporting-results`:

| Field | Content |
|---|---|
| ID | `SEC-F-<NNN>` (sequential per run) |
| Severity | Critical / High / Medium / Low (ZAP risk, or the case's Priority for spec failures) |
| Source | ZAP rule `<id>` or spec `TC-SEC-…` step |
| Evidence | Alert instance URL + request/response excerpt, or the failing assertion output + trace path |
| Affected REQ | the REQ id from the case's `@req:` tag (the spec's `req` annotation without its `<slug>/` prefix) |
| Case | the Case ID |
| Status | open / triaged / false-positive (with reviewer + reason) / resolved |

Gate (`§Quality gates`): **no unresolved High/Critical findings** before sign-off — `/qa-report`
renders it from this table.

### 4. Header comments
Every artifact opens with: source case path, resolved target + env, `## OWASP ref`, gate source,
and the case's Tags line verbatim (taxonomy order per `<qa-root>/docs/tag-taxonomy.md`).

### 5. Validate — offline gate
Specs: `cd qa && npm run heal:check` (tsc 0 · eslint 0). Configs: rule-id lines parse
(`<id><TAB><LEVEL><TAB>(name)`), every IGNORE carries a reason. Running belongs to
`executing-tests` (`/qa-run` → `npm run test:security`).

### 6. Traceability write-back + report
Open the plan from the case's `**Plan:**` line, flip this Case ID's `Scripted` ❌ → ✅ in
`## Traceability (Requirement ↔ Case)`; `Last run`/`Status`/`Report` stay with `executing-tests`.
Report: artifact path + kind, resolved target, gate encoding, roles covered vs skipped
(missing creds), any refusals with the scope reason.

## Done — ALL must be true

- [ ] Guardrail passed: target resolves inside `§Application under test` + `§Environments`; case's `## Authorization` names the env + scope — or the generation was REFUSED with the reason reported
- [ ] Case located via traceability table / `**Feature:**` grep — never a filename glob
- [ ] Artifact mirrors the case path 1:1 under `<qa-root>/scripts/security/<module>/` (`.conf` for scan cases, `.spec.ts` for authz cases)
- [ ] Scan config: passive baseline only; alert levels from `§Quality gates` + the case's `## OWASP ref`; every IGNORE justified; FAIL-level alerts fail the run automatically
- [ ] Authz spec: one parallel test per matrix cell the case enumerates; per-object roles granted to a pool account by the factory, global roles as read-only named actors; anonymous / no-CSRF / bad-token as client-variant rows; 401 vs 403 vs 404 exactly as stated; no branches in the test body; `caseMeta()` with slug-qualified `req`
- [ ] Zero invented checks, zero softened assertions — gated alerts and reachable-forbidden-resources become triage findings, never IGNOREs/weakened expects
- [ ] Findings triage columns (ID, Severity, Source, Evidence, Affected REQ, Case, Status) documented for the run consumer
- [ ] Offline gate clean (`heal:check` for specs; config format check for `.conf`)
- [ ] Traceability `Scripted` flipped to ✅; report delivered (artifact, target, gate, coverage, skips/refusals)
