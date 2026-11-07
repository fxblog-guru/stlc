# API test heuristics — endpoint-class checklists beyond CRUD

Read once per session, then apply per endpoint in `designing-api-cases` Step 3b. Step 3's minimums
(CRUD contract + read-back, per-field negatives, boundary rule of 3, enum exhaustion, per-endpoint
authz, schema/leakage) are the floor for *every* endpoint. This file adds the checks that catch the
defects the floor misses — each class says **what breaks in production**, the **minimum probes**,
and the **concrete Expected** shape. A probe whose Expected cannot be grounded in the OpenAPI spec,
the analysis inventory, or a code citation is a `COVERAGE-GAP`, never a guess.

## How to use — classify each endpoint, then apply every matching class

| If the endpoint… | Apply class |
|---|---|
| returns a collection | **1 List / search / filter / sort / paginate** |
| accepts `PATCH` or partial `PUT` | **2 Partial update semantics** |
| mutates a status/state field, or has transition verbs (`/approve`, `/cancel`) | **3 State-transition matrix** |
| creates or charges anything a client might retry | **4 Idempotency & concurrency** |
| returns `202` / a job id / `Location` to poll | **5 Asynchronous operations** |
| accepts arrays of items to create/update/delete | **6 Bulk operations** |
| accepts or serves files | **7 File upload / download** |
| has dates, money, free text, external ids in its payload | **8 Data-type hazards** |
| is versioned, cached, or content-negotiated | **9 HTTP semantics, versioning, caching** |
| serves more than one tenant / account / organisation | **10 Multi-tenancy** |
| deletes or archives | **11 Delete semantics** |
| every endpoint | **12 Error contract & observability** · **13 Contract drift** |

Priority: a class that guards money, data integrity, or tenant isolation (3, 4, 10, 11) is P0/P1 by
default; list/format classes (1, 8, 9) P1/P2 unless the analysis risk table says otherwise.

---

## 1. List / search / filter / sort / paginate

**Breaks in production:** rows dropped or duplicated across page boundaries; unstable sort making
pagination non-deterministic; filters silently ignored (typo in a param name → full unfiltered
result); `pageSize=100000` taking the DB down; total counts wrong after a filter.

**Minimum probes** (one case per collection endpoint, table-driven):
- Empty set → `200` + `[]` (never `404`, unless the contract says so) + `total = 0`.
- Exactly 1, exactly `pageSize`, `pageSize + 1` items → page 1 full, page 2 has 1, no duplicates,
  no omissions (assert the union of ids across pages == the created set).
- `page=0`, `page=-1`, `page=<beyond last>`, `pageSize=0`, `pageSize=max`, `pageSize=max+1`,
  non-numeric → the documented `400` or clamp (assert which — never both).
- Cursor pagination: tampered/expired cursor → `400`; cursor stable under concurrent inserts.
- Every documented filter: a matching set, a non-matching set (→ `[]`), an **unknown filter param**
  (→ `400` or ignored per contract — assert it is not silently applied to the wrong field),
  case sensitivity of values (`status=OPEN` vs `open`), multiple values (`status=open,closed`).
- Every documented sort key asc/desc + **tie-break stability** (two rows with equal sort value keep
  a deterministic secondary order across repeated calls); unknown sort key → `400`.
- Search: exact, prefix, mid-string per contract; special characters (`'`, `%`, `_`, `"`, `\`, unicode,
  emoji); whitespace trimming; minimum length rule; a search term that matches nothing.
- Server-side filtering by permission: a filtered list never contains rows the caller may not read
  (ties to class 10).
- Response shape: `total`/`hasNext`/`nextCursor` consistent with the page contents.

## 2. Partial update semantics (PATCH / partial PUT)

**Breaks in production:** a field the client omitted gets nulled; `null` meant "clear" is ignored;
read-only fields (`id`, `createdAt`, `tenantId`, `status`) silently overwritten; unknown fields
accepted and dropped without warning; a PATCH with an empty body "succeeds".

**Minimum probes:**
- Omit a field → unchanged (read back); send `null` → cleared **or** `400`, per contract.
- Send every read-only/system field → `400`, or ignored with the persisted value unchanged (assert which).
- Unknown field → `400` (strict) or ignored (lenient) per contract; never persisted.
- Empty body `{}` → documented `400` or no-op `200` — and the entity's `updatedAt` behaviour.
- Concurrent PATCH of two different fields → both persisted (no lost update); same field → last
  write wins **or** `409`/`412` when the contract has ETags (class 9).
- Validation still applies on partial payloads (a PATCH that pushes a field over max → `400`).
- PUT is full replacement where the contract says so: omitted optional field becomes default/null.

## 3. State-transition matrix

**Breaks in production:** a forbidden transition succeeds via the API even though the UI hides the
button (paid → draft; cancelled → approved); a transition skips its side effect (approved without
`approvedAt`/audit/event); guard evaluated at the wrong boundary.

**Minimum probes:** build `from-state × transition endpoint` from the spec/wiki state diagram (or
the code's enum, cited). One case per state machine, table-driven:
- Every **allowed** cell → success status, new `status` in the response **and** on independent
  read-back, the documented side-effect fields (`approvedAt`, `approvedBy`), downstream visibility
  where API-provable.
- Every **forbidden** cell → the documented `409`/`422` (never `500`, never `200`) with an error
  code naming the transition, **and** the state unchanged on read-back.
- Guards (`approve` only when `total > 0`, only by role X) → boundary triple on the guard; role
  axis ties to the authz case.
- Re-applying an already-applied transition (approve twice) → idempotent `200`/`204` or `409` per contract.
- Terminal states reject every transition.

## 4. Idempotency & concurrency

**Breaks in production:** double charge on retry; two identical orders from a double-click; unique
constraint surfacing as `500`; a race producing negative stock.

**Minimum probes:**
- Same `POST` twice with the same `Idempotency-Key` → same status + same resource id, exactly one
  entity persisted (list/count read-back). Same key + different body → `422`/`409` per contract.
- Missing key on an endpoint that requires it → `400`.
- Two identical creates **in parallel** (`Promise.all`) without a key → contract-defined outcome:
  both created, or one `409`; never two "successes" over a uniqueness rule, never a `500`.
- Parallel decrements/increments on a counter (stock, credit) → final value consistent with the
  number of successful calls; no negative where forbidden.
- `PUT`/`DELETE` repeated → same terminal state (`200`/`204`, or `404` on the second delete per contract).

## 5. Asynchronous operations (202 + polling / webhooks)

**Breaks in production:** job never reaches a terminal state; polling URL `404`s; result available
before status says `completed`; failure state loses the error reason.

**Minimum probes:**
- Submit → `202` + `Location`/job id; poll → documented state sequence (`queued → running →
  completed|failed`), each with a concrete schema; terminal within the SLA window stated in the
  case (poll interval + max wait — never a bare sleep).
- Result endpoint before completion → `404`/`409`/`202` per contract, never a partial result.
- Failure path (invalid input discovered asynchronously) → `failed` + machine-readable `error.code`.
- Re-submitting the same job (with/without idempotency key) → class 4 behaviour.
- Cancel while running (if offered) → `cancelled` and no side effects afterwards (read back).
- Webhook variants (when API-provable via a receiver endpoint the environment supplies): payload
  schema, signature header present, retry on receiver `500` (count + backoff), no duplicate
  side effects on redelivery (idempotent consumer).

## 6. Bulk operations

**Breaks in production:** one bad item fails the batch silently or, worse, half the batch is
applied; no per-item status; batch size unbounded.

**Minimum probes:**
- All-valid batch → `200`/`207` with per-item results in **input order** and ids; count read-back.
- Mixed batch → documented atomicity: all-or-nothing (`400` + nothing persisted) **or** partial
  (`207` with per-item `status`/`error`) — assert the persisted set matches the response exactly.
- Empty array → `400` or no-op per contract; `max + 1` items → `413`/`400`; duplicate items within
  one batch → documented handling.
- Bulk delete: items the caller may not delete → per-item `403` and the rest applied (or the whole
  batch refused) per contract; ties to class 10.

## 7. File upload / download

**Breaks in production:** unlimited size; content-type trusted from the header; path traversal in
filenames; a `.exe` renamed `.pdf`; download leaks another tenant's file by id.

**Minimum probes** (defence-oriented; deeper abuse cases belong to `designing-security-cases`):
- Allowed type/size → `201` + metadata; download returns identical bytes (hash), correct
  `Content-Type`, `Content-Disposition` filename sanitised.
- `max size + 1` → `413`; disallowed extension **and** mismatched magic bytes → `415`/`400`;
  empty file → per contract; filename `../../x`, `CON`, 300-char, unicode → stored name sanitised.
- Multipart missing the file part → `400` naming the part.
- Download by another tenant's file id → `403`/`404` (class 10).

## 8. Data-type hazards (dates, money, text, ids)

**Breaks in production:** off-by-one-day across timezones; `0.1 + 0.2`; JS numbers truncating a
64-bit id; emoji breaking a `VARCHAR(50)`; a `"true"` string accepted as boolean once and not later.

**Minimum probes:**
- **Dates**: ISO-8601 with offset vs `Z` vs no offset (→ contract: reject or assume UTC — assert
  which and read back the stored instant); date-only vs date-time fields; `2026-02-30`,
  `2024-02-29`, DST-gap local time (`02:30` on spring-forward day); far past/future; ordering
  filters across a TZ boundary.
- **Money/decimals**: `0.005` rounding (half-up vs banker's, per contract), 3-dp input on a 2-dp
  field → `400` or round (assert), negative where forbidden, `1e2` scientific notation, string
  `"10.00"` vs number `10`, currency code case (`gbp`), amounts near `MAX_SAFE_INTEGER` if ids or
  minor units cross 2^53.
- **Text**: empty vs whitespace-only vs `null`; max length in **characters vs bytes** (a 50-char
  emoji string); leading/trailing whitespace trimmed?; control characters (U+0000 NUL, U+001F) and
  zero-width characters (U+200B, U+FEFF BOM); bidi/RTL override marks (U+202E); HTML/script strings
  stored verbatim and returned encoded (the leak check belongs to security, the *storage contract*
  belongs here). Write these as escape sequences in the case's `## Data`, never as raw characters.
- **Ids**: numeric id as string (`"123"`), UUID uppercase/lowercase/braces, non-existent id → `404`
  vs malformed id → `400` (two distinct rows); very large numeric id; negative/zero.
- **Booleans/enums**: `"true"`/`1`/`yes` → `400` unless the contract coerces; enum case mismatch
  (already in Step 3) plus leading/trailing space.
- **Numbers**: `NaN`, `Infinity`, `-0`, `"12abc"`, integer field given `12.0`/`12.5`.

## 9. HTTP semantics, versioning, caching

**Breaks in production:** `405` missing (a stray `DELETE` on a collection); `HEAD` diverging from
`GET`; a client on `v1` broken by a `v2` change; stale cached 200s after an update; `304` never issued.

**Minimum probes:**
- Unsupported method on each route → `405` + `Allow` header listing exactly the supported set.
- `HEAD` mirrors `GET` headers (`Content-Length`, `ETag`) with an empty body; `OPTIONS`/CORS
  preflight per contract (allowed origins/methods/headers exact).
- Content negotiation: `Accept: application/xml` (unsupported) → `406`; `Content-Type: text/plain`
  on a JSON endpoint → `415`; missing `Content-Type` with a body → `415`/`400`; charset handling.
- Conditional requests where the contract defines them: `ETag` present and changes on update;
  `If-None-Match` → `304`; `If-Match` stale → `412` (optimistic locking — ties to class 2/4).
- `Cache-Control`/`Vary` on personalised responses forbid shared caching (`private`/`no-store`).
- Versioning: the documented mechanism (path `/v1/`, header, query) — old version still serves the
  old schema; unknown version → `404`/`400`; deprecation headers if defined.
- Trailing slash, double slashes, URL-encoded path segments, query param repetition
  (`?id=1&id=2`), case sensitivity of paths — each → the documented behaviour, never a `500`.
- `429` + `Retry-After` when a rate limit is documented (one probe at limit+1; never a load test).
- Compression (`Accept-Encoding: gzip`) round-trips; large responses (`> 1 MB`) still valid JSON.

## 10. Multi-tenancy & horizontal isolation

**Breaks in production:** the worst class — data of tenant B visible to tenant A via a guessed
id, a list filter, a report, a bulk operation, a nested resource, or a search index.

**Minimum probes** (every endpoint that carries a tenant/account/user scope; coordinate with
`designing-security-cases`' IDOR cases — the security case proves denial, this class proves the
*business data* is right):
- Read/update/delete by **another tenant's id** on every resource and every **nested** route
  (`/orders/{other}/lines`) → `403`/`404` per contract, and *no body fields leaked in the error*.
- List/search/report endpoints as tenant A → zero rows from tenant B even with filters that would
  match B (`?customerId=<B's>`), and `total` counts exclude B.
- Create with a foreign key pointing at tenant B's entity (`customerId` of B) → `400`/`403`/`404`,
  never a cross-tenant link persisted (read back).
- Bulk endpoints with a mix of own and foreign ids → class 6 partial semantics with foreign ids
  rejected individually.
- Tenant-scoped uniqueness: the same natural key (order number, email) may exist in two tenants
  if the contract says so — and may not collide.

## 11. Delete semantics

**Breaks in production:** soft-deleted rows still appear in lists or still block uniqueness;
cascades delete more than documented; a deleted parent leaves orphans; restore brings back
children it should not.

**Minimum probes:**
- `DELETE` → `204`/`200`; read-back `404` (hard) **or** `status = deleted`/`deletedAt` set (soft)
  per contract; the row absent from default lists and present with `?includeDeleted=true` if offered.
- Second `DELETE` → `404` or idempotent `204` per contract (class 4).
- Children/dependants: documented cascade → each child read-back reflects it; documented
  restriction → `409` naming the dependency, parent unchanged.
- Restore (if offered) → state and children per contract; uniqueness after soft-delete
  (can the same email be re-created?) per contract.
- Delete by another tenant/role → class 10 / authz.

## 12. Error contract & observability

**Breaks in production:** three different error shapes across endpoints; a `500` for a validation
error; stack traces in bodies; no correlation id to find the log line.

**Minimum probes** (one shared case per API, referenced by the others):
- Every `4xx` uses the **one** documented error schema (`code`, `message`, `details[]/errors{}`,
  `traceId`) — validated against the OpenAPI error component; multiple field errors are all
  reported in one response, not first-only, if the contract says so.
- Error `code` values are stable machine tokens (enum in the spec), messages never contain
  stack traces, SQL, file paths, internal hostnames, or other users' data.
- A correlation/request id header (`X-Request-Id`/`traceparent`) is echoed when supplied and
  generated when not; present on errors too.
- Malformed JSON body → `400` (never `500`); wrong top-level type (`[]` instead of `{}`) → `400`;
  deeply nested / huge payload → `413`/`400`.
- Any `500` observed during design probes is recorded as a FUNCTIONAL finding in `## Data`, not
  encoded as an expectation.

## 13. Contract drift (the OpenAPI spec vs the running API)

**Breaks in production:** clients generated from the spec break because the API added a required
field, renamed an enum value, or changed a type — nobody updated the spec, nobody noticed.

**Minimum probes** (one case per resource, or one `contract` case per API when the generator's
schema validator is shared):
- Every response of every designed step validates against the spec's response schema (the
  generator compiles it — `generating-api-script` rule 12); **additional undeclared properties**
  are reported (spec `additionalProperties`), required properties present and typed, nullable
  respected.
- Every request example in the spec is accepted (`2xx`); every documented error status is
  producible by at least one designed step (an error code in the spec that no probe can trigger
  is a `COVERAGE-GAP` or a spec defect for `/qa-clarify`).
- Enum lists in responses ⊆ the spec's enum; date-time fields parse as RFC 3339.
- Breaking-change watch on `update_existing` runs: compare the endpoint inventory with the previous
  analysis — removed fields, narrowed enums, new required request fields → P0 rows.

---

## Sizing guidance (feeds `estimating-effort`)

| Class | Typical extra cases per applicable endpoint/resource |
|---|---|
| 1 list/search | 1 query-matrix case (table-driven, 10–20 rows) |
| 2 PATCH | 1 semantics case |
| 3 state machine | 1 matrix case per state machine (all cells) |
| 4 idempotency/concurrency | 1 case per create/charge endpoint |
| 5 async | 1 lifecycle case per job type |
| 6 bulk | 1 case per bulk endpoint |
| 7 files | 1 case per upload/download pair |
| 8 data types | rows inside the existing negative cases; +1 case for date/TZ-heavy resources |
| 9 HTTP semantics | 1 shared case per API + rows in CRUD cases for ETag/version |
| 10 multi-tenancy | rows in every authz case + 1 list/report isolation case per module |
| 11 delete | rows in the CRUD contract case; +1 case when cascade/restore is documented |
| 12 error contract | 1 shared case per API |
| 13 contract drift | 1 shared case per API (or per resource when schemas are large) |
