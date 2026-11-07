#!/usr/bin/env bash
# Self-check for the agentic-fx-qa bundle: the shipped lint must accept the reference fixture
# (tests/fixture/qa) and reject each contract violation below. Run from the repo root:
#   bash tests/selfcheck.sh
# Exit 1 on the first unexpected result. Used by .gitlab-ci.yml.
set -uo pipefail
# Script runs here are tests, not usage: keep them out of the run log (lib/runlog.mjs).
export QA_RUN_LOG=off
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LINT="$ROOT/workspace/qa/scripts/shared/lint-qa.mjs"
FIX="$ROOT/tests/fixture/qa"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ok    $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL  $1"; echo "$2" | sed 's/^/        /'; }

fresh() { rm -rf "$TMP/qa" "$TMP/PROJECT-PROFILE.md"; cp -R "$FIX" "$TMP/qa"; }
lint()  { (cd "$TMP/qa" && QA_LINT_TODAY="${1:-2026-09-15}" node "$LINT" 2>&1); }

echo "── syntax"
for f in $(find "$ROOT/workspace" "$ROOT/skills" -name '*.mjs'); do
  node --check "$f" >/dev/null 2>&1 && ok "node --check ${f#$ROOT/}" || bad "node --check ${f#$ROOT/}" "$(node --check "$f" 2>&1)"
done
for f in $(find "$ROOT/workspace" "$ROOT/tests" -name '*.sh'); do
  bash -n "$f" && ok "bash -n ${f#$ROOT/}" || bad "bash -n ${f#$ROOT/}" ""
done
if command -v python3 >/dev/null; then
  python3 -m py_compile "$ROOT/skills/building-domain-wiki/scripts/raw_to_md_converter.py" && ok "py_compile raw_to_md_converter.py" || bad "py_compile raw_to_md_converter.py" ""
fi
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$ROOT/settings.json" && ok "settings.json parses" || bad "settings.json parses" ""
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$ROOT/workspace/qa/package.json" && ok "package.json parses" || bad "package.json parses" ""

echo "── lint accepts the pristine workspace scaffold"
OUT="$(cd "$ROOT/workspace/qa" && QA_LINT_TODAY=2026-09-15 node "$LINT" 2>&1)"; RC=$?
if [ $RC -eq 0 ] && echo "$OUT" | grep -q "0 error(s)"; then ok "workspace/qa scaffold clean"; else bad "workspace/qa scaffold clean" "$OUT"; fi

echo "── lint accepts the reference fixture"
fresh; OUT="$(lint)"; RC=$?
if [ $RC -eq 0 ] && echo "$OUT" | grep -q "0 error(s)"; then ok "fixture clean"; else bad "fixture clean" "$OUT"; fi

# expect_error <name> <today> <expected substring> <mutation shell snippet run inside $TMP/qa>
expect_error() {
  local name="$1" today="$2" want="$3" mut="$4"
  fresh; (cd "$TMP/qa" && eval "$mut")
  local out; out="$(lint "$today")"; local rc=$?
  if [ $rc -ne 0 ] && echo "$out" | grep -qF -- "$want"; then ok "$name"; else bad "$name (wanted: $want)" "$out"; fi
}

echo "── lint rejects contract violations"
SEC=cases/security/orders/TC-SEC-ORDERS-001-role-matrix.md
A11Y=cases/accessibility/orders/TC-A11Y-ORDERS-001-order-list-axe.md
UNIT=cases/unit/orders/TC-UNIT-ORDERS-001-order-total-rounding.md
DATA=cases/data/orders/TC-DATA-ORDERS-001-staging-to-mart-recon.md
E2E=cases/e2e/orders/TC-E2E-ORDERS-001-create-order-ui.md
API=cases/api/orders/TC-API-ORDERS-001-create-order-contract.md
PLAN=plans/orders/2026-09-01-test-plan.md
expect_error "security case without ## OWASP ref"      2026-09-15 "security case missing section \`## OWASP ref\`"  "sed -i.bak '/^## OWASP ref/d' $SEC"
expect_error "performance case without ## SLOs"       2026-09-15 "performance case missing section \`## SLOs\`"     "sed -i.bak '/^## SLOs/d' cases/performance/orders/TC-PERF-ORDERS-001-create-order-load.md"
expect_error "accessibility case without ## WCAG ref" 2026-09-15 "accessibility case missing section \`## WCAG ref\`" "sed -i.bak '/^## WCAG ref/d' $A11Y"
MOB=cases/mobile/orders/TC-MOB-ORDERS-001-submit-order-offline.md
expect_error "mobile case without ## Platforms"      2026-09-15 "mobile case missing section \`## Platforms\`"       "sed -i.bak '/^## Platforms/d' $MOB"
expect_error "mobile case without ## Device profile" 2026-09-15 "mobile case missing section \`## Device profile\`"  "sed -i.bak '/^## Device profile/d' $MOB"
expect_error "staged mobile spec without HANDOFF row" 2026-09-15 "has no HANDOFF.md row"                              "cp $MOB cases/mobile/orders/TC-MOB-ORDERS-002-ghost.md && sed -i.bak 's/TC-MOB-ORDERS-001/TC-MOB-ORDERS-002/' cases/mobile/orders/TC-MOB-ORDERS-002-ghost.md && cp scripts/mobile/orders/TC-MOB-ORDERS-001-submit-order-offline.spec.ts scripts/mobile/orders/TC-MOB-ORDERS-002-ghost.spec.ts"
expect_error "mobile handoff heading drift"           2026-09-15 "missing exact heading \`# Mobile-test handoff\`"    "sed -i.bak 's/^# Mobile-test handoff/# Mobile handoff/' scripts/mobile/HANDOFF.md"
expect_error "device-matrix columns drift"            2026-09-15 "device-matrix column header is not byte-exact"      "sed -i.bak 's/| Cases run |/| Cases |/' runs/mobile/orders/2026-09-10-1040/device-matrix.md"

echo "── lint rejects Maestro flows that drift from the kit (CONTRACTS §15 Maestro, scripts/shared/maestro/README.md)"
FLOW=scripts/mobile/orders/TC-MOB-ORDERS-002-reopen-draft-after-restart.yaml
expect_error "maestro: name without the Case ID"      2026-09-15 "\`name:\` must start with \`TC-MOB-ORDERS-002 — \`"   "sed -i.bak 's/^name: TC-MOB-ORDERS-002 — /name: /' $FLOW"
expect_error "maestro: literal appId"                 2026-09-15 "\`appId:\` must be \`\${APP_ID}\`"                  "sed -i.bak 's/^appId: .*/appId: com.example.app/' $FLOW"
expect_error "maestro: raw id selector"               2026-09-15 "raw selector \`id: orders-tab\`"                     "sed -i.bak 's/id: \${output.orders.tab}/id: orders-tab/' $FLOW"
expect_error "maestro: literal timeout"               2026-09-15 "literal \`timeout: 10000\`"                           "sed -i.bak 's/timeout: \${output.T.screen}/timeout: 10000/' $FLOW"
expect_error "maestro: step labels out of order"      2026-09-15 "step labels 1, 3, 3 are not 1..3 in order"            "sed -i.bak 's/\"Step 2: /\"Step 3: /' $FLOW"
expect_error "maestro: suite tag missing"             2026-09-15 "tags lack \`smoke\`"                                   "sed -i.bak '/^  - smoke\$/d' $FLOW"
expect_error "maestro: @-prefixed tag"                2026-09-15 "Maestro tags are bare words"                          "sed -i.bak 's/^  - smoke\$/  - \"@smoke\"/' $FLOW"
expect_error "maestro: subflow path does not exist"   2026-09-15 "\`../../shared/maestro/flows/sign-in-typo.yaml\` does not exist" "sed -i.bak 's#flows/sign-in.yaml#flows/sign-in-typo.yaml#' $FLOW"
expect_error "maestro: flow with no case"             2026-09-15 "no mirrored case"                                     "cp $FLOW scripts/mobile/orders/TC-MOB-ORDERS-009-ghost.yaml"
expect_error "maestro: flow and WDIO spec for one case" 2026-09-15 "a case has ONE mobile script"                         "cp scripts/mobile/orders/TC-MOB-ORDERS-001-submit-order-offline.spec.ts scripts/mobile/orders/TC-MOB-ORDERS-002-reopen-draft-after-restart.spec.ts && printf '| TC-MOB-ORDERS-002 | qa/scripts/mobile/orders/TC-MOB-ORDERS-002-reopen-draft-after-restart.spec.ts | tests/smoke/orders.smoke.spec.ts | propose | proposed | — | — |\n' >> scripts/mobile/HANDOFF.md"
expect_error "unit case without ## Doubles"           2026-09-15 "unit case missing section \`## Doubles\`"          "sed -i.bak '/^## Doubles/d' $UNIT"
expect_error "unit matrix columns drift"              2026-09-15 "test-matrix columns are not byte-exact"            "sed -i.bak 's/| Guards |/| Guard |/' $UNIT"
expect_error "quarantine tag on a unit case"          2026-09-15 "UNIT cases are never quarantined"                  "sed -i.bak 's/@agentic:gen/@quarantined:2026-09-30 @agentic:gen/' $UNIT"
expect_error "quarantine expired"                     2026-10-15 "quarantine expired on 2026-09-30"                  "true"
expect_error "quarantine grant over 30 days"          2026-09-15 "exceeds 30 days"                                   "sed -i.bak 's/2026-09-30/2026-10-30/g' regression/quarantine.md $E2E"
expect_error "quarantine tag without ledger row"      2026-09-15 "the ledger has no unreleased row"                  "sed -i.bak 's/| — |\$/| 2026-09-14 |/' regression/quarantine.md"
expect_error "ledger row without tag"                 2026-09-15 "carries no @quarantined: tag"                      "sed -i.bak 's/ @quarantined:2026-09-30//' $E2E"
expect_error "tag date differs from ledger Until"     2026-09-15 "tag date 2026-09-29 ≠ ledger Until 2026-09-30"     "sed -i.bak 's/@quarantined:2026-09-30/@quarantined:2026-09-29/' $E2E"
expect_error "CLOSED defect without Verification"     2026-09-15 "requires a \`## Verification\` line"               "sed -i.bak '/^## Verification/,\$d' defects/orders/DEF-orders-002-total-off-by-one.md"
expect_error "CLOSED defect without Resolution"       2026-09-15 "CLOSED defect without a **Resolution:**"          "sed -i.bak 's/^\*\*Resolution:\*\* fixed.*/**Resolution:** —/' defects/orders/DEF-orders-002-total-off-by-one.md"
expect_error "OPEN defect with a Closed date"         2026-09-15 "OPEN defect must have **Closed:** —"               "sed -i.bak 's/\*\*Closed:\*\* —/**Closed:** 2026-09-11/' defects/orders/DEF-orders-001-order-list-blank.md"
expect_error "bad Origin"                             2026-09-15 "not in INTERNAL|ESCAPED|EXPLORATORY"               "sed -i.bak 's/\*\*Origin:\*\* INTERNAL/**Origin:** PROD/' defects/orders/DEF-orders-001-order-list-blank.md"
expect_error "ESCAPED defect without escape analysis" 2026-09-15 "missing \`## Escape analysis\`"                    "sed -i.bak '/^## Escape analysis/,\$d' defects/orders/DEF-orders-003-discount-lost-prod.md"
expect_error "escape phase outside vocabulary"        2026-09-15 "not in ANALYZE|PLAN|DESIGN"                        "sed -i.bak 's/^- DESIGN/- TESTING/' defects/orders/DEF-orders-003-discount-lost-prod.md"
expect_error "ESCAPES row without a DEF file"         2026-09-15 "no defect file under defects/"                     "sed -i.bak 's/DEF-orders-003 | orders/DEF-orders-009 | orders/' defects/ESCAPES.md"
expect_error "exploratory Bugs status drift"          2026-09-15 "not in candidate | raised DEF-"                    "sed -i.bak 's/| candidate |/| maybe |/' exploratory/orders/XS-orders-001-multi-currency-discounts.md"
expect_error "exploratory heading order"              2026-09-15 "out of order"                                      "python3 - <<'PY'
import re
p='exploratory/orders/XS-orders-001-multi-currency-discounts.md'; s=open(p).read()
a=s.index('## Notes'); b=s.index('## Bugs'); c=s.index('## Follow-ups')
s=s[:a]+s[b:c]+s[a:b]+s[c:]; open(p,'w',encoding='utf-8').write(s)
PY"
expect_error "unknown tag"                            2026-09-15 "not in qa/docs/tag-taxonomy.md vocabulary"         "sed -i.bak 's/@tms:PROJ-1234/@tms:proj-1234/' $API"
expect_error "type tag vs stem"                       2026-09-15 "type tag \`@e2e\` disagrees with id stem \`API\`"   "sed -i.bak 's/@api @orders/@e2e @orders/' $API"
expect_error "traceability Type vs stem"              2026-09-15 "Type column \`e2e\` disagrees with the id stem"    "sed -i.bak 's/| TC-API-ORDERS-001 | api |/| TC-API-ORDERS-001 | e2e |/' $PLAN"
expect_error "missing Feature header"                 2026-09-15 "missing \`**Feature:** <slug>\` header"            "sed -i.bak '/^\*\*Feature:\*\*/d' $API"
expect_error "findings id prefix"                     2026-09-15 "must be A11Y-F-NNN"                                "sed -i.bak 's/A11Y-F-001/SEC-F-001/' runs/accessibility/orders/2026-09-10-1030/findings.md"
expect_error "findings severity vocabulary"           2026-09-15 "not in Critical|High|Medium|Low"                   "sed -i.bak 's/| Medium |/| Moderate |/' runs/security/orders/2026-09-10-1020/findings.md"
expect_error "script without mirrored case"           2026-09-15 "no mirrored case"                                  "cp scripts/api/orders/TC-API-ORDERS-001-create-order-contract.spec.ts scripts/api/orders/TC-API-ORDERS-002-ghost.spec.ts"
echo "── data cases (CONTRACTS §28): each rule must be able to fail"
expect_error "data case without ## Oracle"            2026-09-15 "data case missing section \`## Oracle\`"          "sed -i.bak '/^## Oracle/d' $DATA"
expect_error "data hop with an unknown relationship"  2026-09-15 "relationship \`fuzzy\` is not one of"               "sed -i.bak 's/^- relationship: dedup/- relationship: fuzzy/' $DATA"
expect_error "dedup hop without a dedup order"        2026-09-15 "a dedup hop needs \`- dedup order:\`"               "sed -i.bak '/^- dedup order:/d' $DATA"
expect_error "data hop without a window"              2026-09-15 "has no \`- window:\` line"                         "sed -i.bak '/^- window:/d' $DATA"
expect_error "P0 data case with only count checks"    2026-09-15 "P0 with only count checks"                        "sed -i.bak '/^- sum:/d; /^- row-hash:/d' $DATA"
expect_error "unknown oracle kind"                    2026-09-15 "\`eyeball\` is not one of"                         "sed -i.bak 's/^- sum:/- eyeball:/' $DATA"
expect_error "tolerance without owner"                2026-09-15 "needs \`reason:\` and \`owner:\`"                  "sed -i.bak 's/^- exact\$/- sum ±0.01 reason: rounding/' $DATA"
expect_error "quarantine tag on a data case"          2026-09-15 "DATA cases are never quarantined"                  "sed -i.bak 's/@agentic:gen/@quarantined:2026-09-30 @agentic:gen/' $DATA"
expect_error "staged data script without HANDOFF row" 2026-09-15 "has no HANDOFF.md row"                             "sed -i.bak '/TC-DATA-ORDERS-001/d' scripts/data/HANDOFF.md"
expect_error "staged unit script without HANDOFF row" 2026-09-15 "has no HANDOFF.md row"                             "cp $UNIT cases/unit/orders/TC-UNIT-ORDERS-002-ghost.md && sed -i.bak 's/TC-UNIT-ORDERS-001/TC-UNIT-ORDERS-002/' cases/unit/orders/TC-UNIT-ORDERS-002-ghost.md && cp scripts/unit/orders/TC-UNIT-ORDERS-001-order-total-rounding.cs scripts/unit/orders/TC-UNIT-ORDERS-002-ghost.cs"

REPORT=reports/orders/2026-09-11-report.md
SIGNOFF=reports/release/2026-09/2026-09-12-signoff.md
expect_error "report overall typed, not derived"     2026-09-15 "disagrees with the gate rows"                      "sed -i.bak 's/^overall: fail/overall: pass/' $REPORT"
expect_error "report gate columns drift"              2026-09-15 "quality-gates column header is not byte-exact"     "sed -i.bak 's#| Gate | Target | Actual | Verdict | Evidence |#| Gate | Target | Actual | Verdict |#' $REPORT"
expect_error "report gate verdict vocabulary"         2026-09-15 "not in pass|fail|not evaluable"                    "sed -i.bak 's#| not evaluable | no run under qa/runs/performance#| n/a | no run under qa/runs/performance#' $REPORT"
expect_error "report heading missing"                 2026-09-15 "missing exact heading \`## Residual risk\`"        "sed -i.bak '/^## Residual risk/d' $REPORT"
expect_error "report shipped_sha malformed"           2026-09-15 "is not a 7–40 hex sha"                             "sed -i.bak 's/^shipped_sha: 8556e8f/shipped_sha: v1.2/' $REPORT"
expect_error "report gate without evidence"           2026-09-15 "empty Evidence"                                    "sed -i.bak 's#| pass | traceability table, 9 rows |#| pass | — |#' $REPORT"
expect_error "signoff GO with unmet criterion"        2026-09-15 "GO requires every criterion met"                   "sed -i.bak 's/^recommendation: NO-GO/recommendation: GO/' $SIGNOFF"
expect_error "signoff CONDITIONAL without conditions" 2026-09-15 "CONDITIONAL GO without a conditions row"           "sed -i.bak 's/^recommendation: NO-GO/recommendation: CONDITIONAL GO/' $SIGNOFF"
expect_error "signoff exit verdict vocabulary"        2026-09-15 "not in met|NOT met|not evaluable"                  "sed -i.bak 's#| NOT met | orders report overall: fail |#| failed | orders report overall: fail |#' $SIGNOFF"
expect_error "signoff recommendation vocabulary"      2026-09-15 "not in GO|NO-GO|CONDITIONAL GO"                    "sed -i.bak 's/^recommendation: NO-GO/recommendation: HOLD/' $SIGNOFF"
REVIEW=reviews/orders/2026-09-05-case-review.md
READINESS=runs/env-checks/uat/2026-09-10-0900/readiness.md
# CONTRACTS §18 — a verdict says what it judged, once.
expect_error "review verdict vocabulary"             2026-09-15 "not in READY FOR /qa-script | REVISE FIRST" "sed -i.bak 's/^verdict: REVISE FIRST/verdict: LOOKS FINE/' $REVIEW"
expect_error "review front matter vs body verdict"   2026-09-15 "one file, one verdict"                      "sed -i.bak 's/^verdict: REVISE FIRST/verdict: READY FOR \/qa-script/' $REVIEW"
expect_error "review without a reviewed list"        2026-09-15 "can never go STALE"                         "sed -i.bak '/^reviewed:/,/^---$/{/^reviewed:/d;/^  - path:/d;/^    sha256:/d}' $REVIEW"
expect_error "review hash is not a sha256"           2026-09-15 "is not a sha256"                            "sed -i.bak 's/^    sha256: [0-9a-f]*/    sha256: deadbeef/' $REVIEW"
PRREV=reviews/_pr/gitlab-42-2026-09-14-1030.md
# CONTRACTS §21 — a PR review is a testing review, says which head it judged, and never approves a High.
expect_error "PR review verdict vocabulary"          2026-09-15 "not in APPROVE | REQUEST CHANGES | COMMENT" "sed -i.bak 's/^verdict: REQUEST CHANGES/verdict: LGTM/' $PRREV"
expect_error "PR review approves a High"             2026-09-15 "APPROVE with a High finding"            "sed -i.bak 's/^verdict: REQUEST CHANGES/verdict: APPROVE/' $PRREV"
expect_error "PR review kind"                        2026-09-15 "a qa/ PR review is \`testing\`"         "sed -i.bak 's/^kind: testing/kind: development/' $PRREV"
expect_error "PR review head without a sha"          2026-09-15 "names no commit sha"                    "sed -i.bak 's/^head: .*/head: test\/orders-refunds/' $PRREV"
expect_error "PR review section missing"             2026-09-15 "missing section \`## Comment to post\`" "sed -i.bak 's/^## Comment to post/## Comment/' $PRREV"
expect_error "readiness verdict vocabulary"          2026-09-15 "not in READY | NOT READY | BLOCKED"         "sed -i.bak 's/api: READY/api: MAYBE/' $READINESS"
expect_error "readiness env vs folder"               2026-09-15 "does not match the folder"                  "sed -i.bak 's/^env: uat/env: dev/' $READINESS"
expect_error "readiness without an inputs list"      2026-09-15 "can never go STALE"                         "sed -i.bak '/^inputs:/,/^---$/{/^inputs:/d;/^  - path:/d;/^    sha256:/d}' $READINESS"

# CONTRACTS §1/§3/§6/§10 — a new slug landing on an existing suite (ids across files, re-verify, deprecation).
INT=cases/integration/orders/TC-INT-ORDERS-001-order-row-persisted.md
# a second feature whose plan re-verifies a baseline orders case
BILLING="mkdir -p plans/billing && sed -e 's/^# Test Plan — orders/# Test Plan — billing/' -e 's/^slug: orders$/slug: billing/' -e '/^| REQ-0/d' $PLAN > plans/billing/2026-09-12-test-plan.md"
REVERIFY_ROW='| re-verify:orders | TC-API-ORDERS-001 | api | orders | P0 | ✅ | — | — | — |'
expect_error "duplicate Case ID (two branches, same NNN)" 2026-09-15 "duplicate Case ID TC-API-ORDERS-001"         "cp $API cases/api/orders/TC-API-ORDERS-001-cancel-order.md"
expect_error "traceability row without a case file"   2026-09-15 "traceability row has no case file"                "sed -i.bak 's/| TC-INT-ORDERS-001 |/| TC-INT-ORDERS-009 |/' $PLAN"
expect_error "case whose Feature has no plan"          2026-09-15 "has no test plan under plans/billing/"            "sed -i.bak 's/^\*\*Feature:\*\* orders/**Feature:** billing/' $INT"
expect_error "@req names a slug with no plan"          2026-09-15 "names slug \`billing\`, which has no test plan"   "sed -i.bak 's#@req:REQ-001#@req:billing/REQ-001#' $INT"
expect_error "traceability Status vocabulary"          2026-09-15 "not in ✅ | ❌ | ⛔ <reason> | ⊘ deprecated | —"  "sed -i.bak 's#| ❌ | qa/runs/e2e#| failed | qa/runs/e2e#' $PLAN"
expect_error "deprecated tag without ⊘ deprecated row" 2026-09-15 "is not Status \`⊘ deprecated\`"                   "sed -i.bak 's/@req:REQ-001 @agentic:gen/@req:REQ-001 @deprecated:orders @agentic:gen/' $INT"
expect_error "⊘ deprecated row without the tag"        2026-09-15 "carries no @deprecated:<slug> tag"               "sed -i.bak 's#| TC-INT-ORDERS-001 | integration | orders | P1 | ❌ | — | — |#| TC-INT-ORDERS-001 | integration | orders | P1 | ❌ | — | ⊘ deprecated |#' $PLAN"
expect_error "deprecated case still tagged @smoke"     2026-09-15 "a deprecated case is never in a curated suite"   "sed -i.bak 's/@smoke @req:REQ-001/@smoke @req:REQ-001 @deprecated:orders/' $API && sed -i.bak 's#| TC-API-ORDERS-001 | api | orders | P0 | ✅ | 2026-09-10-1000 | ✅ |#| TC-API-ORDERS-001 | api | orders | P0 | ✅ | 2026-09-10-1000 | ⊘ deprecated |#' $PLAN"
expect_error "deprecated case in the suite manifest"   2026-09-15 "deprecated case in a curated suite"              "sed -i.bak 's/@req:REQ-001 @agentic:gen/@req:REQ-001 @deprecated:orders @agentic:gen/' $INT && sed -i.bak 's#| TC-INT-ORDERS-001 | integration | orders | P1 | ❌ | — | — |#| TC-INT-ORDERS-001 | integration | orders | P1 | ❌ | — | ⊘ deprecated |#' $PLAN && printf '# Regression suite\n\n| Case ID | Feature | Type | Tier(s) | Why selected | Last 3 runs |\n|---|---|---|---|---|---|\n| TC-INT-ORDERS-001 | orders | integration | @regression | P1 | ✅ ✅ ✅ |\n' > regression/regression-suite.md"
expect_error "re-verify row naming its own slug"       2026-09-15 "re-verify row names its own slug"                "$BILLING && printf '%s\n' '| re-verify:billing | TC-API-ORDERS-001 | api | orders | P0 | ✅ | — | — | — |' > /tmp/rv.txt && sed -i.bak '/^|-----|/r /tmp/rv.txt' plans/billing/2026-09-12-test-plan.md"
expect_error "re-verify row pointing at the wrong baseline" 2026-09-15 "but the case's **Feature:** is \`orders\`"  "$BILLING && mkdir -p plans/payments && cp plans/billing/2026-09-12-test-plan.md plans/payments/ && printf '%s\n' '| re-verify:payments | TC-API-ORDERS-001 | api | orders | P0 | ✅ | — | — | — |' > /tmp/rv.txt && sed -i.bak '/^|-----|/r /tmp/rv.txt' plans/billing/2026-09-12-test-plan.md"
expect_error "impact-map row appended out of order"    2026-09-15 "is out of order"                                 "printf '%s\n' '| BR-000 | orders | ? | — | — | — |' >> docs/impact-map.md"

# expect_clean <name> <wanted substring or ''> <unwanted substring or ''> <mutation>
expect_clean() {
  local name="$1" want="$2" unwanted="$3" mut="$4"
  fresh; (cd "$TMP/qa" && eval "$mut")
  local out; out="$(lint)"; local rc=$?
  if [ $rc -eq 0 ] && { [ -z "$want" ] || echo "$out" | grep -qF -- "$want"; } && { [ -z "$unwanted" ] || ! echo "$out" | grep -qF -- "$unwanted"; }; then ok "$name"; else bad "$name" "$out"; fi
}
expect_clean "tolerance with reason and owner"        "" "needs \`reason:\`"                                          "sed -i.bak 's/^- exact\$/- sum ±0.01 reason: source rounds to cents owner: finance/' $DATA"
expect_clean "legacy @req:REQ-NNN is a warning, not an error" "WARN  $API: @req:REQ-001 is slug-less" "" "true"
expect_clean "slug-qualified @req/@ac accepted, no warning"  "" "WARN  $API:" "sed -i.bak 's#@req:REQ-001#@req:orders/REQ-001 @ac:orders/AC-001#' $API"
expect_clean "a new slug re-verifies a baseline case"         "" "re-verify" "$BILLING && printf '%s\n' '$REVERIFY_ROW' > /tmp/rv.txt && sed -i.bak '/^|-----|/r /tmp/rv.txt' plans/billing/2026-09-12-test-plan.md"
expect_clean "deprecated case, row and tag agree"             "1 deprecated case(s)" "" "sed -i.bak 's/@req:REQ-001 @agentic:gen/@req:REQ-001 @deprecated:orders @agentic:gen/' $INT && sed -i.bak 's#| TC-INT-ORDERS-001 | integration | orders | P1 | ❌ | — | — |#| TC-INT-ORDERS-001 | integration | orders | P1 | ❌ | — | ⊘ deprecated |#' $PLAN"

# CONTRACTS §17 — state.json is derived, never hand-edited; a stale one is a warning, not an error.
expect_error "state.json hand-edited (no source_hash)" 2026-09-15 "never hand-edited"                                "sed -i.bak 's/\"source_hash\": \"[0-9a-f]*\"/\"source_hash\": \"\"/' state.json"
expect_error "state.json not JSON"                     2026-09-15 "state.json: not valid JSON"                       "echo '{' > state.json"
fresh; (cd "$TMP/qa" && sed -i.bak 's/^\*\*Status:\*\* OPEN/**Status:** CLOSED/' defects/orders/DEF-orders-001-order-list-blank.md)
OUT="$(lint)"
if echo "$OUT" | grep -q "WARN  state.json: out of date"; then ok "state.json stale after an artifact changes (warn)"; else bad "state.json stale after an artifact changes (warn)" "$OUT"; fi

# CONTRACTS §7 — case quality: a case says what it proves, how, and what it owns.
echo "── lint rejects weak cases (CONTRACTS §7 quality)"
INT=cases/integration/orders/TC-INT-ORDERS-001-order-row-persisted.md
expect_error "step with empty Expected"               2026-09-15 "step 1 has no Expected"                            "sed -i.bak '0,/   Expected: 201; body.id non-null; body.status = \"Open\"/s//   Expected:/' $API"
expect_error "step without any Expected line"         2026-09-15 "step 2 has no Expected"                            "sed -i.bak '/^   Expected: exactly one row/d' $INT"
expect_error "case without ## Objective"              2026-09-15 "missing section \`## Objective\`"                  "sed -i.bak '/^## Objective/d' $API"
expect_error "Objective with two intents"             2026-09-15 "must be ONE sentence"                              "sed -i.bak 's/^POST \/orders creates an order.*/POST \/orders creates an order. It also emails the customer./' $API"
expect_error "empty core section"                     2026-09-15 "section \`## Data\` is empty"                      "sed -i.bak '/^- none\$/d' $SEC"
expect_error "unknown technique"                      2026-09-15 "\`gut-feel\` not in EP"                            "sed -i.bak 's/^- EP → positive/- gut-feel → positive/' $API"
expect_error "unknown coverage axis"                  2026-09-15 "axis \`happy\` not in positive"                    "sed -i.bak 's/^- EP → positive/- EP → happy/' $API"
expect_error "Isolation without an actor"             2026-09-15 "has no \`actor:\` line"                            "sed -i.bak '/^- actor: pool \`standard\`/d' $API"
expect_error "undefined DATA token"                   2026-09-15 "[DATA:customer-vip] is not defined in docs/test-data.md" "sed -i.bak 's/^- \[DATA:customer-active\]\$/- [DATA:customer-vip]/' $API"
expect_error "malformed DATA token"                   2026-09-15 "is not \`[DATA:<entity>-<state>]\`"                "sed -i.bak 's/^- \[DATA:customer-active\]\$/- [DATA:Customer]/' $API"
expect_error "Variants columns drift"                 2026-09-15 "## Variants column header is not byte-exact"      "sed -i.bak 's/^| Row | Technique | Input | Expected |\$/| Row | Input | Expected |/' $API"
expect_error "Variants row without Expected"          2026-09-15 "## Variants row 3: empty Expected"                 "sed -i.bak 's/^| 3 | error-guessing | no session cookie | .*/| 3 | error-guessing | no session cookie | — |/' $API"
expect_error "header Priority vs tag"                 2026-09-15 "**Priority:** P1 disagrees with tag @P0"           "sed -i.bak 's/\*\*Priority:\*\* P0/**Priority:** P1/' $API"
expect_error "missing header line"                    2026-09-15 "missing header line \`**Type:**"                  "sed -i.bak '/^\*\*Type:\*\*/d' $API"
expect_error "AC not in the register"                 2026-09-15 "**AC:** AC-009 is not in the AC register"          "sed -i.bak 's/^\*\*AC:\*\* AC-001, AC-002/**AC:** AC-001, AC-009/' $API"
expect_error "grounding: BR with no wiki page"        2026-09-15 "BR-009 has no compiled wiki page"                  "sed -i.bak 's/^- BR-001 — wiki/- BR-009 — wiki/' $API"
expect_error "grounding: cited page does not exist"   2026-09-15 "\`wiki/compiled/business-rules/br-001-gone.md\` does not exist" "sed -i.bak 's#br-001-order-needs-a-line.md#br-001-gone.md#' $API"
expect_error "grounding: free-text line"              2026-09-15 "## Grounding: \`- read the BRD\` is not one of"     "sed -i.bak 's/^- code: backend.*/- read the BRD/' $API"
expect_error "grounding: case with no ## Grounding"   2026-09-15 "no \`## Grounding\`"                               "sed -i.bak '/^## Grounding/,/^\$/d' $SEC"
expect_error "grounding: empty ## Grounding"          2026-09-15 "no \`## Grounding\`"                               "sed -i.bak '/^## Grounding/{n;d}' $A11Y"
expect_error "grounding: none without a reason"       2026-09-15 "\`- none\` needs its reason"                       "sed -i.bak 's/^- standard: WCAG 2.2 AA\$/- none/' $A11Y"
expect_error "case without an AC line"              2026-09-15 "missing \`**AC:**\` header line"                  "sed -i.bak '/^\*\*AC:\*\*/d' $SEC"

# expect_warn <name> <expected substring> <mutation>: lint exits 0 but prints the warning.
expect_warn() {
  local name="$1" want="$2" mut="$3"
  fresh; (cd "$TMP/qa" && eval "$mut")
  local out; out="$(lint)"; local rc=$?
  if [ $rc -eq 0 ] && echo "$out" | grep -F -- "WARN" | grep -qF -- "$want"; then ok "$name"; else bad "$name (wanted warning: $want)" "$out"; fi
}
expect_warn  "2.0 _template/ folder left behind"      "2.0 template folder — the formats moved to qa/_templates/" "mkdir -p plans/_template && cp plans/orders/2026-09-01-test-plan.md plans/_template/YYYY-MM-DD-test-plan.md"
expect_warn  "front matter missing (grace in 2.1.x)"  "no front matter — open with"                          "sed -i.bak '1,9d' plans/orders/2026-09-01-test-plan.md"
expect_error "front matter: slug disagrees with folder" 2026-09-15 "\`slug: invoices\` disagrees with the folder"       "sed -i.bak 's/^slug: orders\$/slug: invoices/' analysis/orders/2026-09-01-analysis.md"
expect_error "front matter: approved is not a status"  2026-09-15 "\`status: approved\` not in draft"                    "sed -i.bak 's/^status: in-review\$/status: approved/' defects/orders/DEF-orders-001-order-list-blank.md"
expect_error "front matter: author reviews itself"     2026-09-15 "a reviewer never judges its own work"              "sed -i.bak 's/^reviewed_by: pending\$/reviewed_by: planning-tests/' plans/orders/2026-09-01-test-plan.md"
CLAR=analysis/orders/2026-09-01-clarifications.md
expect_error "clarify: question with no marker"       2026-09-15 "Q-002: carries 0 of"                              "sed -i.bak 's/^### Q-002 \[NON-BLOCKING\] /### Q-002 /' $CLAR"
expect_error "clarify: question with both markers"    2026-09-15 "Q-001: carries 2 of"                              "sed -i.bak 's/^### Q-001 \[BLOCKING\] /### Q-001 [BLOCKING] [NON-BLOCKING] /' $CLAR"
expect_error "clarify: question with no Status"       2026-09-15 "Q-002: no \`**Status:**\` line"                 "sed -i.bak '/^\*\*Status:\*\* OPEN/d' $CLAR"
expect_error "clarify: plan made over an open BLOCKING" 2026-09-15 "has open BLOCKING Q-001"                         "sed -i.bak 's/^\*\*Status:\*\* ANSWERED .*/**Status:** OPEN/' $CLAR"
expect_error "clarify: assumed BLOCKING is still open" 2026-09-15 "has open BLOCKING Q-001"                         "sed -i.bak 's/^\*\*Status:\*\* ANSWERED .*/**Status:** assumed — autonomous-run 2026-09-01-0900 (started by fixture)/' $CLAR"
expect_clean "clarify: a plan dated before the sheet is history" "" "open BLOCKING" "sed -i.bak 's/^\*\*Status:\*\* ANSWERED .*/**Status:** OPEN/' $CLAR && mv $CLAR analysis/orders/2026-09-02-clarifications.md"
# CONTRACTS §27 — a plan sizes the change before anything is spawned for it.
SZ="sed -i.bak"
expect_error "sizing: new plan with no ## Sizing"      2026-10-27 "no \`## Sizing\`"                                  "$SZ '/^## Sizing/,/^- spawns:/d' $PLAN && mv $PLAN plans/orders/2026-10-27-test-plan.md"
expect_clean "sizing: an older plan is not re-sized"   "" "## Sizing" "$SZ '/^## Sizing/,/^- spawns:/d' $PLAN"
expect_error "sizing: unknown change_class"            2026-09-15 "\`change_class: medium\` is not"                    "$SZ 's/^- change_class: high-risk/- change_class: medium/' $PLAN"
expect_error "sizing: worth_testing with no reason"    2026-09-15 "\`worth_testing:\` is not"                          "$SZ 's/^- worth_testing: .*/- worth_testing: yes/' $PLAN"
expect_error "sizing: skipped but cases designed"      2026-09-15 "\`worth_testing: no\` but the traceability table has rows" "$SZ 's/^- worth_testing: .*/- worth_testing: no — copy change only/; s/^- types: .*/- types: —/' $PLAN"
expect_error "sizing: trivial change with many types"  2026-09-15 "a trivial change needs at most 1 type"            "$SZ 's/^- change_class: high-risk/- change_class: trivial/' $PLAN"
expect_error "sizing: designed a type it did not size" 2026-09-15 "traceability has \`mobile\` rows but \`types:\` does not list it" "$SZ 's/, mobile, data\$/, data/' $PLAN"
expect_error "sizing: skip without a reason"           2026-09-15 "\`skipped:\` \`ui\` has no reason"                 "$SZ 's/ ui,//; s/^- skipped: .*/- skipped: ui/' $PLAN"
expect_error "sizing: high-risk leaves security out"   2026-09-15 "a high-risk change tests \`security\`"            "$SZ 's/ security,//' $PLAN && $SZ '/security/d' cases/security/orders/*.md && rm -rf cases/security && $SZ '/| security |/d' $PLAN"
expect_error "sizing: estimate is not a number"        2026-09-15 "\`estimate_tokens:\` is not a whole number"         "$SZ 's/^- estimate_tokens: .*/- estimate_tokens: about 400k/' $PLAN"
expect_error "sizing: over the profile budget"         2026-09-15 "over the profile budget 100000"                    "printf '**Token budget per run:** \`100000\`\n' > ../PROJECT-PROFILE.md"
expect_clean "sizing: over budget, approved by a human" "" "over the profile budget" "printf '**Token budget per run:** \`100000\`\n' > ../PROJECT-PROFILE.md && $SZ 's/^- spawns: 9/- spawns: 9\n- over_budget: approved — Luan 2026-09-02/' $PLAN"
expect_error "sizing: enabled type neither tested nor skipped" 2026-09-15 "enabled type \`ui\` is neither"             "printf '## Test types\n\n| Type | Enabled | Tool | Output |\n|---|---|---|---|\n| \`api\` | yes | x | x |\n| \`ui\` | yes | x | x |\n' > ../PROJECT-PROFILE.md && $SZ 's/ ui,//' $PLAN"
expect_error "sizing: spawns past the class budget"    2026-09-15 "over the high-risk budget of 12"                   "mkdir -p logs && for i in 1 2 3 4 5 6 7 8 9 10 11 12 13; do echo '{\"at\":\"2026-09-02T10:00:00Z\",\"slug\":\"orders\",\"agent\":\"case-designer\"}' >> logs/spawns.jsonl; done"
expect_clean "sizing: spawns past budget with a reason" "" "over the high-risk budget" "mkdir -p logs && for i in 1 2 3 4 5 6 7 8 9 10 11 12 13; do echo '{\"at\":\"2026-09-02T10:00:00Z\",\"slug\":\"orders\"}' >> logs/spawns.jsonl; done && $SZ 's/^- spawns: 9/- spawns: 9\n- spawn_reason: a second design pass after the retry defect/' $PLAN"
# CONTRACTS §30 — a change to the schema, existing rows or an API contract proves how it ships and comes back.
DI="$SZ 's/^- spawns: 9/- spawns: 9\n- deploy_impact: db\n- db_change: additive\n- data_change: none\n- rollback: redeploy/' $PLAN"
expect_error "deploy: db impact with no deploy cases"   2026-09-15 "deploy check \`migration-round-trip\` has no planned case" "$DI"
expect_error "deploy: a breaking API change"            2026-09-15 "\`api_change: breaking\`"                        "$SZ 's/^- spawns: 9/- spawns: 9\n- deploy_impact: api\n- api_change: breaking/' $PLAN"
expect_clean "deploy: none declared needs no case"      "" "deploy check" "$SZ 's/^- spawns: 9/- spawns: 9\n- deploy_impact: none/' $PLAN"
expect_error "sizing: scripted before the review"      2026-09-15 "scripted with no case review"                      "rm -rf reviews/orders"
# CONTRACTS §18 — the reviewer is never the agent that wrote the cases.
expect_error "review: reviewer designed the cases"     2026-09-15 "reviewer \`case-designer\` designed cases it reviews" "$SZ 's/\*\*Reviewer:\*\* test-planner/**Reviewer:** case-designer/' reviews/orders/2026-09-05-case-review.md"
expect_error "review: no named reviewer"               2026-09-15 "no \`**Reviewer:** <agent> (<skill>)\`"           "$SZ 's/\*\*Reviewer:\*\* test-planner (reviewing-cases)//' reviews/orders/2026-09-05-case-review.md"
expect_warn  "grounding: P0/P1 grounded in nothing"  "grounded in nothing"                                   "sed -i.bak 's/^- ticket: PROJ-1234 .*/- none — exploratory scope, no rule yet/' $SEC"
expect_warn  "vague Expected (works)"                 "vague Expected \`works\`"                               "sed -i.bak 's/^   Expected: 200; status = \"Open\"; lines echo the payload/   Expected: the read-back works/' $API"
expect_warn  "vague Expected (as expected)"           "vague Expected \`as expected\`"                         "sed -i.bak 's/^   Expected: list visible/   Expected: list loads as expected/' $MOB"
expect_warn  "bare successfully"                      "vague Expected \`successfully\`"                        "sed -i.bak 's/^   Expected: 0 critical\/serious violations/   Expected: completes successfully/' $A11Y"

# CONTRACTS §7 Title — the H1 says module, screen/operation, scenario and outcome; specs mirror it.
echo "── lint rejects weak titles and specs that drift from their case (CONTRACTS §7 Title, scripts/shared/README.md)"
SPEC=scripts/api/orders/TC-API-ORDERS-001-create-order-contract.spec.ts
A11Y2=cases/accessibility/orders/TC-A11Y-ORDERS-002-order-form-keyboard.md
expect_error "title without [Module]"                 2026-09-15 "title: missing \`[<Module> · <Platform>]\`"        "sed -i.bak 's/^# TC-API-ORDERS-001 — \[Orders · API\] /# TC-API-ORDERS-001 — /' $API"
expect_error "title module ≠ module folder"           2026-09-15 "\`[Invoices]\` disagrees with the module folder \`orders\`" "sed -i.bak 's/^# TC-API-ORDERS-001 — \[Orders · API\]/# TC-API-ORDERS-001 — [Invoices · API]/' $API"
expect_error "title without → expected"               2026-09-15 "missing \`→ <expected>\`"                         "sed -i.bak 's/^\(# TC-API-ORDERS-001 — .*\) → 201, order Open\$/\1/' $API"
expect_error "title says Verify that"                 2026-09-15 "banned wording \`Verify that\`"                    "sed -i.bak 's/^\(# TC-API-ORDERS-001 — \[Orders · API\] POST \/orders — \)/\1Verify that /' $API"
expect_error "title with a bare successfully"         2026-09-15 "bare \`successfully\`"                             "sed -i.bak 's/^\(# TC-API-ORDERS-001 — .*\) → 201, order Open\$/\1 → order created successfully/' $API"
expect_error "spec title id ≠ case id"                2026-09-15 "test title id TC-API-ORDERS-002 ≠ case id TC-API-ORDERS-001" "sed -i.bak \"s/^test('TC-API-ORDERS-001 — /test('TC-API-ORDERS-002 — /\" $SPEC"
expect_error "spec step numbers with a gap"           2026-09-15 "test.step numbers 1, 3 are not 1..2"               "sed -i.bak \"s/'Step 2: GET/'Step 3: GET/\" $SPEC"
expect_error "spec row not in the case's Variants"    2026-09-15 "row \`9\` is not a Row id"                         "sed -i.bak \"s/{ id: '3',/{ id: '9',/\" $SPEC"
expect_warn  "Variants row with no spec row"          "## Variants row 2 of TC-API-ORDERS-001 has no \`row 2:\` test" "sed -i.bak \"/{ id: '2',/d\" $SPEC"
expect_warn  "spec title does not mirror the case title" "test title should mirror the case title"           "sed -i.bak \"s/^test('TC-API-ORDERS-001 — \[Orders · API\] POST \/orders/test('TC-API-ORDERS-001 — creates an order/\" $SPEC"
expect_warn  "title joins two outcomes"               "\`and\` joins two outcomes"                           "sed -i.bak 's/→ 201, order Open\$/→ 201 and a confirmation email/' $API"
expect_warn  "title with an ASCII arrow"              "ASCII \`->\`"                                         "sed -i.bak 's/→ 201, order Open\$/-> 201, order Open/' $API"
# CONTRACTS §7 Priority — a case sits at or below its REQ's priority unless it says why; header, tag and row agree.
A11Y2_P0="sed -i.bak 's/\*\*Priority:\*\* P2/**Priority:** P0/; s/@P2/@P0/' $A11Y2 && sed -i.bak 's/| TC-A11Y-ORDERS-002 | accessibility | orders | P2 |/| TC-A11Y-ORDERS-002 | accessibility | orders | P0 |/' $PLAN"
expect_error "case priority above its REQ, no reason" 2026-09-15 "**Priority:** P0 is above its REQ priority P1"       "$A11Y2_P0"
expect_clean "case priority above its REQ, with a reason" "" "is above its REQ priority" "$A11Y2_P0 && sed -i.bak 's/^\*\*AC:\*\* —\$/**AC:** —\nPriority reason: keyboard denial blocks the only order path for keyboard users/' $A11Y2"
expect_error "traceability Priority ≠ case Priority"  2026-09-15 "traceability Priority P2 ≠ the case's **Priority:** P1" "sed -i.bak 's/| TC-INT-ORDERS-001 | integration | orders | P1 |/| TC-INT-ORDERS-001 | integration | orders | P2 |/' $PLAN"

echo "── lint rejects thin plans (CONTRACTS §4)"
expect_error "plan without ## Approvals"              2026-09-15 "missing exact plan heading \`## Approvals\`"       "sed -i.bak 's/^## Approvals/## Sign-off/' $PLAN"
expect_error "plan headings out of order"             2026-09-15 "out of order (CONTRACTS §4 order)"                 "python3 - <<'PY'
p='$PLAN'; s=open(p,encoding='utf-8').read()
a=s.index('## Test environment'); b=s.index('## Suspension & resumption'); c=s.index('## Risk register')
s=s[:a]+s[b:c]+s[a:b]+s[c:]; open(p,'w',encoding='utf-8').write(s)
PY"
expect_error "empty gates table once cases exist"     2026-09-15 "\`## Quality gates\` table is empty"               "sed -i.bak '/^| Functional | 0 failing P0\/P1 | §Quality gates |\$/d' $PLAN"
expect_error "register AC with no coverage row"       2026-09-15 "register AC-003 has no row"                        "sed -i.bak '/^| AC-003 | REQ-002 |/d' $PLAN"
expect_error "AC coverage lists a case that does not claim it" 2026-09-15 "does not list AC-003 on its **AC:** line" "sed -i.bak 's/^\*\*AC:\*\* AC-003/**AC:** —/' $E2E"
expect_error "AC coverage status vocabulary"          2026-09-15 "not in covered | partial | not covered"            "sed -i.bak 's/| TC-E2E-ORDERS-001 | covered |/| TC-E2E-ORDERS-001 | done |/' $PLAN"

# CONTRACTS §7 — case-score: P0/P1 REQs need negative (api: authz + error-contract; e2e: journey).
SCORE="$ROOT/workspace/qa/scripts/shared/case-score.mjs"
score() { (cd "$TMP/qa" && node "$SCORE" "$@" 2>&1); }
expect_score() {
  local name="$1" want_rc="$2" want="$3" mut="$4"; shift 4
  fresh; (cd "$TMP/qa" && eval "$mut")
  local out; out="$(score "$@")"; local rc=$?
  if [ $rc -eq "$want_rc" ] && echo "$out" | grep -qF -- "$want"; then ok "$name"; else bad "$name (wanted rc=$want_rc and: $want)" "$out"; fi
}
echo "── qa:score"
expect_score "fixture scores clean"                    0 "0 blocking gap(s)"           "true"
expect_score "P1 REQ without negative → exit 1"        1 "GAP   orders/REQ-002/negative" "sed -i.bak '/^- error-guessing → negative\$/d' $E2E"
expect_score "P0 api REQ without authz → exit 1"       1 "GAP   orders/REQ-001/authz"   "sed -i.bak '/^- error-guessing → negative, error-contract, authz\$/d' $API"
expect_score "baseline grandfathers a known gap"       0 "1 baselined"                 "sed -i.bak '/^- error-guessing → negative\$/d' $E2E && printf '# grandfathered\norders/REQ-002/negative\n' > baseline.txt" --baseline baseline.txt
expect_score "write-baseline records today's gaps"     0 "wrote baseline.txt (1 gap(s))" "sed -i.bak '/^- error-guessing → negative\$/d' $E2E" --write-baseline baseline.txt
expect_score "covered baseline entry is flagged"       0 "now covered — remove: orders/REQ-003/negative" "printf 'orders/REQ-003/negative\n' > baseline.txt" --baseline baseline.txt

# CONTRACTS §19 — run plans: front matter the runner can trust, and a resolver that cannot drift.
RP=run-plans/orders-release.md
echo "── lint rejects broken run plans (CONTRACTS §19)"
expect_error "run plan: unknown front-matter key"      2026-09-15 "unknown front-matter key \`schedule\`"            "sed -i.bak 's/^owner: qa-lead/owner: qa-lead\nschedule: nightly/' $RP"
expect_error "run plan: name not lowercase-kebab"      2026-09-15 "is not lowercase-kebab"                           "sed -i.bak 's/^name: orders-release/name: Orders_Release/' $RP"
expect_error "run plan: name differs from file"        2026-09-15 "differs from the file name"                       "sed -i.bak 's/^name: orders-release/name: orders-hotfix/' $RP"
expect_error "run plan: retries not 0"                 2026-09-15 "\`retries: 2\` — must be 0"                       "sed -i.bak 's/^retries: 0/retries: 2/' $RP"
expect_error "run plan: missing case id"               2026-09-15 "TC-API-ORDERS-099 has no case file"               "sed -i.bak 's/^  types: \[api, accessibility\]/  types: [api, accessibility]\n  cases: [TC-API-ORDERS-099]/' $RP"
expect_error "run plan: explicit deprecated case"      2026-09-15 "TC-INT-ORDERS-001 is deprecated"                  "sed -i.bak 's/@integration @orders @P1 @platform:api @req:REQ-001/@integration @orders @P1 @platform:api @req:REQ-001 @deprecated:orders/' cases/integration/orders/TC-INT-ORDERS-001-order-row-persisted.md && sed -i.bak 's/| REQ-001 | TC-INT-ORDERS-001 | integration | orders | P1 | ❌ | — | — | — |/| REQ-001 | TC-INT-ORDERS-001 | integration | orders | P1 | ❌ | — | ⊘ deprecated | — |/' $PLAN && sed -i.bak 's/^  types: \[api, accessibility\]/  types: [api, accessibility]\n  cases: [TC-INT-ORDERS-001]/' $RP"
expect_error "run plan: unit is another runner"        2026-09-15 "\`unit\` runs in its own repo"                    "sed -i.bak 's/^  types: \[api, accessibility\]/  types: [api, unit]/' $RP"
expect_error "run plan: feature without a plan"        2026-09-15 "\`select.features\`: \`billing\` has no test plan" "sed -i.bak 's/^  features: \[orders\]/  features: [billing]/' $RP"
expect_warn  "run plan: stale Resolved cases table"    "is stale"                                                    "sed -i.bak 's/^  types: \[api, accessibility\]/  types: [api]/' $RP"

# Bug-hunting cases (CONTRACTS §7): a model test's ## Model shape, a fuzz case's opt-in line.
MODEL_SECTION='printf "\n## Model\n- State: orders\n- Actions (pre → call → model update):\n  - create () → POST /orders 201 → add\n- Invariants (after every step, against the API):\n  - total equals the sum of lines\n- Budget: QA_MODEL_RUNS × QA_MODEL_STEPS\n" >> '"$API"
echo "── lint: bug-hunting cases"
expect_error "model case without state-transition"    2026-09-15 "a \`## Model\` case uses Technique \`state-transition\`"   "$MODEL_SECTION"
expect_error "model case without Invariants"          2026-09-15 "\`## Model\` has no \`- Invariants…:\` line"              "$MODEL_SECTION && sed -i.bak 's/^- Invariants (after every step, against the API):/- Checks:/' $API && sed -i.bak 's/^- EP → positive/- state-transition → positive/' $API"
expect_error "fuzz case without fuzz-allow"           2026-09-15 "has no \`- fuzz-allow:"                                 "mkdir -p cases/api/_fuzz && sed 's/TC-API-ORDERS-001/TC-API-FUZZ-001/; s/\[Orders\] POST \/orders/[Fuzz] every OpenAPI operation/; s/\*\*Module:\*\* orders/**Module:** fuzz/; s/@orders/@fuzz/' $API > cases/api/_fuzz/TC-API-FUZZ-001-openapi-operations.md"
fresh; (cd "$TMP/qa" && eval "$MODEL_SECTION" && sed -i.bak 's/^- EP → positive/- state-transition → positive/' $API && rm -f $API.bak)
OUT="$(lint)"; RC=$?
if [ $RC -eq 0 ] && ! echo "$OUT" | grep -q "## Model"; then ok "a well-formed model case lints clean"; else bad "a well-formed model case lints clean" "$OUT"; fi

# run-plan.mjs itself: resolve fails on an unscripted selection; security is refused on an env the
# profile does not authorize. PROJECT-PROFILE.md is written next to the QA root, as the installer does.
RUNPLAN="$ROOT/workspace/qa/scripts/shared/run-plan.mjs"
expect_runplan() {
  local name="$1" want_rc="$2" want="$3" mut="$4"; shift 4
  fresh; (cd "$TMP/qa" && eval "$mut")
  local out; out="$(cd "$TMP/qa" && node "$RUNPLAN" "$@" 2>&1)"; local rc=$?
  if [ $rc -eq "$want_rc" ] && echo "$out" | grep -qF -- "$want"; then ok "$name"; else bad "$name (wanted rc=$want_rc and: $want)" "$out"; fi
}
PROFILE='printf "## Test types\n\n| Type | Enabled | Tool | Output |\n|---|---|---|---|\n| \`api\` | yes | x | x |\n| \`e2e\` | yes | x | x |\n| \`security\` | yes | x | x |\n| \`accessibility\` | yes | x | x |\n\n## Environments\n\n| Env | Purpose | Security testing authorized | Performance testing authorized |\n|---|---|---|---|\n| \`uat\` (default) | full | yes | yes |\n| \`prod\` | — | **no** | **no** |\n" > ../PROJECT-PROFILE.md'
echo "── run-plan.mjs"
expect_runplan "resolve: fixture plan is current"        0 "3 case(s) — api 1 · accessibility 2" "true" resolve orders-release
expect_runplan "resolve: unscripted selection fails"     1 "TC-INT-ORDERS-001: selected but has no script" "sed -i.bak 's/^  types: \[api, accessibility\]/  types: [api, integration]/' $RP" resolve orders-release
expect_runplan "dry-run: exact-id grep + projects"       0 "--project setup api web-chromium" "$PROFILE" run orders-release --dry-run
expect_runplan "dry-run: e2e counts as enabled (e2e has a digit)" 0 "TC-API-ORDERS-001" "$PROFILE && sed -i.bak 's/^  types: \[api, accessibility\]/  types: [api, e2e]/' $RP && sed -i.bak 's/^  quarantined: true/  quarantined: false/' $RP" run orders-release --dry-run
expect_runplan "security refused on an unauthorized env" 2 "does not authorize security testing on \`prod\`" "$PROFILE && sed -i.bak 's/^  types: \[api, accessibility\]/  types: [api, security]/' $RP && mkdir -p scripts/security/orders && cp scripts/api/orders/TC-API-ORDERS-001-create-order-contract.spec.ts scripts/security/orders/TC-SEC-ORDERS-001-role-matrix.spec.ts" run orders-release --dry-run --env prod
expect_runplan "security refused without a profile"      2 "PROJECT-PROFILE.md not found" "rm -f ../PROJECT-PROFILE.md && sed -i.bak 's/^  types: \[api, accessibility\]/  types: [api, security]/' $RP && mkdir -p scripts/security/orders && cp scripts/api/orders/TC-API-ORDERS-001-create-order-contract.spec.ts scripts/security/orders/TC-SEC-ORDERS-001-role-matrix.spec.ts" run orders-release --dry-run
expect_runplan "list counts every plan"                  0 "| orders-release | 3 |" "true" list
expect_runplan "standard writes the standard set"        0 "run-plans/feature-orders.md" "$PROFILE" standard --release r1 --features orders

# CONTRACTS §20 — platforms: header, tags and title agree; the profile enables the platform; the type fits.
echo "── lint rejects platform drift (CONTRACTS §20)"
PLATPROFILE='printf "## Test types\n\n| Type | Enabled | Tool | Output |\n|---|---|---|---|\n| \`api\` | yes | x | x |\n| \`e2e\` | yes | x | x |\n| \`ui\` | yes | x | x |\n| \`accessibility\` | yes | x | x |\n| \`mobile\` | yes | x | x |\n\n## Platforms\n\n| Platform | Kind | Runner | Targets | Tier | Enabled |\n|---|---|---|---|---|---|\n| \`web\` | web | playwright | chromium (gate) | gate | yes |\n| \`api\` | service | playwright-request | api | gate | yes |\n| \`android\` | mobile | appium-wdio | devices | gate | yes |\n| \`ios\` | mobile | appium-wdio | devices | gate | yes |\n| \`windows\` | desktop | playwright-electron | electron | nightly | no |\n\n## Environments\n\n| Env | Purpose | Security testing authorized | Performance testing authorized |\n|---|---|---|---|\n| \`uat\` (default) | full | yes | yes |\n" > ../PROJECT-PROFILE.md'
expect_error "platform header vs tags"                2026-09-15 "disagree with **Platform:** api"                   "sed -i.bak 's/@P0 @platform:api/@P0 @platform:web/' $API"
expect_error "platform title vs header"               2026-09-15 "title: platform \`Web\` disagrees with **Platform:** api" "sed -i.bak 's/^# TC-API-ORDERS-001 — \[Orders · API\]/# TC-API-ORDERS-001 — [Orders · Web]/' $API"
expect_error "platform id malformed"                  2026-09-15 "\`Linux\` is not a platform id"                   "sed -i.bak 's/^\*\*Platform:\*\* api/**Platform:** Linux/' $API"
expect_error "mobile case on web"                     2026-09-15 "a mobile case runs on android or ios, not \`web\`" "sed -i.bak 's/^\*\*Platform:\*\* android, ios/**Platform:** web/; s/@platform:android @platform:ios/@platform:web/; s/\[Orders · Android, iOS\]/[Orders · Web]/' $MOB"
expect_error "e2e case on api"                        2026-09-15 "a e2e case runs on a UI platform"                  "sed -i.bak 's/^\*\*Platform:\*\* web/**Platform:** api/; s/@platform:web/@platform:api/; s/\[Orders · Web\]/[Orders · API]/' $E2E"
expect_error "platform disabled in §Platforms"        2026-09-15 "\`windows\` is disabled in PROJECT-PROFILE §Platforms" "$PLATPROFILE && sed -i.bak 's/^\*\*Platform:\*\* web/**Platform:** windows/; s/@platform:web/@platform:windows/; s/\[Orders · Web\]/[Orders · Windows]/' $E2E"
expect_error "platform missing from §Platforms"       2026-09-15 "\`macos\` has no row in PROJECT-PROFILE §Platforms" "$PLATPROFILE && sed -i.bak 's/^\*\*Platform:\*\* web/**Platform:** macos/; s/@platform:web/@platform:macos/; s/\[Orders · Web\]/[Orders · macOS]/' $E2E"
expect_error "§Platforms runner vocabulary"           2026-09-15 "Runner \`selenium\` not in"                       "$PLATPROFILE && sed -i.bak 's/| playwright | chromium/| selenium | chromium/' ../PROJECT-PROFILE.md"
expect_warn  "case without **Platform:** (grace until 2.1)" "no \`**Platform:**\` header — inferred \`api\`"       "sed -i.bak '/^\*\*Platform:\*\*/d; s/ @platform:api//; s/\[Orders · API\]/[Orders]/' $API"
expect_warn  "api case driven through a UI platform"  "a api case runs on \`api\`; \`web\` is right only when" "sed -i.bak 's/^\*\*Platform:\*\* api/**Platform:** web/; s/@platform:api/@platform:web/; s/\[Orders · API\]/[Orders · Web]/' $API"
expect_clean "legacy profile (no §Platforms) still lints" "no \`## Platforms\` table" "" "$PROFILE"
expect_clean "desktop case on an enabled windows row"  "" "ERROR" "$PLATPROFILE && sed -i.bak 's/| electron | nightly | no |/| electron | nightly | yes |/' ../PROJECT-PROFILE.md && sed -i.bak 's/^\*\*Platform:\*\* web/**Platform:** windows/; s/@platform:web/@platform:windows/; s/\[Orders · Web\]/[Orders · Windows]/' $E2E && sed -i.bak \"s/\[Orders · Web\]/[Orders · Windows]/\" scripts/e2e/orders/TC-E2E-ORDERS-001-create-order-ui.spec.ts"

# The `ui` type: its four sections, its id stem, its folder.
echo "── lint rejects incomplete ui cases (CONTRACTS §7, §20)"
UI=cases/ui/orders/TC-UI-ORDERS-001-orders-list-visual.md
UIMAKE="mkdir -p cases/ui/orders && sed -e 's/TC-E2E-ORDERS-001/TC-UI-ORDERS-001/; s/^\*\*Type:\*\* e2e/**Type:** ui/; s/@e2e @orders/@ui @orders/; s/ @defect:DEF-orders-001 @quarantined:2026-09-30//' $E2E > $UI && printf '\n## Screen states\n- empty — a pool account with no orders\n\n## Viewports\n- 320, 768, 1280\n- skin: light\n\n## Visual baseline\n- orders-list-empty-320.png; masked: none\n\n## Layout rules\n- no horizontal page scroll\n' >> $UI && sed -i.bak 's/^| REQ-002 | TC-E2E-ORDERS-001 |\(.*\)$/&\n| REQ-002 | TC-UI-ORDERS-001 | ui | orders | P1 | ❌ | — | — | — |/' $PLAN"
expect_clean "a complete ui case lints clean"          "" "ERROR" "$UIMAKE"
expect_error "ui case without ## Visual baseline"      2026-09-15 "ui case missing section \`## Visual baseline\`"  "$UIMAKE && sed -i.bak '/^## Visual baseline/d' $UI"
expect_clean "ui case that names no skin warns, not yet an error" "WARN  $UI: ui case \`## Viewports\` names no skin" "" "$UIMAKE && sed -i.bak '/^- skin: light/d' $UI"
expect_clean "ui case that names its skin has no skin warning"    "" "names no skin" "$UIMAKE"
expect_error "ui case without ## Layout rules"        2026-09-15 "ui case missing section \`## Layout rules\`"     "$UIMAKE && sed -i.bak '/^## Layout rules/d' $UI"
expect_error "ui case on the api platform"             2026-09-15 "a ui case runs on a UI platform"                 "$UIMAKE && sed -i.bak 's/^\*\*Platform:\*\* web/**Platform:** api/; s/@platform:web/@platform:api/; s/\[Orders · Web\]/[Orders · API]/' $UI"
expect_error "ui case in the e2e folder"               2026-09-15 "type folder \`e2e\` vs id stem \`UI\` mismatch"  "$UIMAKE && mv $UI cases/e2e/orders/"

# CONTRACTS §19 + §20 — run plans select by platform and list the platforms they cannot run.
echo "── run plans route by platform (CONTRACTS §19, §20)"
expect_runplan "run plan: platforms select and mobile is listed as handoff" 0 "handoff: TC-MOB-ORDERS-001 on android — npm run test:mobile -- --platform android" "$PLATPROFILE && sed -i.bak 's/^  types: \[api, accessibility\]/  types: [api, accessibility, mobile]\n  platforms: [api, web, android]/' $RP" run orders-release --dry-run
expect_error "run plan: unknown platform"              2026-09-15 "\`select.platforms\`: \`linux\` is not a platform id" "sed -i.bak 's/^  types: \[api, accessibility\]/  types: [api, accessibility]\n  platforms: [linux]/' $RP"
expect_error "run plan: mobile without a mobile platform" 2026-09-15 "\`mobile\` runs in its own repo"              "sed -i.bak 's/^  types: \[api, accessibility\]/  types: [api, mobile]/' $RP"
expect_runplan "run plan: exclude.platforms drops web-only cases" 0 "1 case(s) — api 1" "sed -i.bak 's/^  quarantined: true/  quarantined: true\n  platforms: [web]/' $RP" resolve orders-release

echo "── verdict integrity (CONTRACTS §31): every rule must be able to fail"
REP=reports/orders/2026-09-11-report.md
ESPEC=scripts/e2e/orders/TC-E2E-ORDERS-001-create-order-ui.spec.ts
D1=defects/orders/DEF-orders-001-order-list-blank.md
D2=defects/orders/DEF-orders-002-total-off-by-one.md
TPROF="printf '## Environments\n\n### Target identity\n\n| Env | Component | Kind | Probe | Read | Expect |\n|---|---|---|---|---|---|\n| uat | api | code | GET \${API_URL}/version | json:commit | shipped-sha |\n| * | flags | config | FILE config/flags.json | sha256 | recorded |\n' > ../PROJECT-PROFILE.md"
TROW="sed -i.bak 's/^| Unit | .*\$/&\n| Target identity | every run reached 8556e8f | VERDICT | VERDICT | target.json of each run |/' $REP"
MATCH_JSON='{"schema":1,"env":"uat","verdict":"MATCH","shipped_sha":"8556e8f","components":[{"component":"api","kind":"code","observed":"8556e8f0c1","expected":"8556e8f","status":"MATCH"}]}'
ALL_MATCH="for r in 2026-09-10-1000 2026-09-10-1005 2026-09-10-1010 2026-09-10-1030; do mkdir -p runs/x/orders/\$r && echo '$MATCH_JSON' > runs/x/orders/\$r/target.json; done"
expect_error "target identity: malformed declaration"          2026-09-15 "Kind \`build\` not in"                        "$TPROF && sed -i.bak 's/| code |/| build |/' ../PROJECT-PROFILE.md"
expect_error "target identity: shipped_sha with no gate row"   2026-09-15 "has no \`Target identity\` gate row"          "$TPROF"
expect_clean "target identity: undeclared is only a warning"   "no §Environments ### Target identity is declared" "" "true"
expect_error "target identity: pass with no target.json"       2026-09-15 "the runs' target.json say \`not evaluable\`"  "$TPROF && ${TROW//VERDICT/pass}"
expect_clean "target identity: not evaluable with no target.json" "" "Target identity\`: Verdict"                         "$TPROF && ${TROW//VERDICT/not evaluable}"
expect_clean "target identity: pass when every run MATCHed"    "" "Target identity\`: Verdict"                          "$TPROF && ${TROW//VERDICT/pass} && $ALL_MATCH"
expect_error "target identity: one run NOT_DEPLOYED"           2026-09-15 "say \`fail\`"                                 "$TPROF && ${TROW//VERDICT/pass} && $ALL_MATCH && sed -i.bak 's/\"verdict\":\"MATCH\"/\"verdict\":\"NOT_DEPLOYED\"/' runs/x/orders/2026-09-10-1005/target.json"
expect_error "target identity: run judged another commit"      2026-09-15 "judged 1111111, not 8556e8f"                  "$TPROF && ${TROW//VERDICT/pass} && $ALL_MATCH && sed -i.bak 's/\"shipped_sha\":\"8556e8f\"/\"shipped_sha\":\"1111111\"/' runs/x/orders/2026-09-10-1030/target.json"
expect_error "swallowed read in a spec"                        2026-09-15 "turns a failed read into a value"             "echo \"const n = await page.getByRole('row').count().catch(() => 0);\" >> $ESPEC"
expect_clean "swallowed read with unknown-ok reason"           "" "turns a failed read into a value"                    "echo \"await settle().catch(() => null); // unknown-ok: waits only, reads nothing\" >> $ESPEC"
expect_error "empty step in a spec"                            2026-09-15 "has an empty body"                            "echo \"await test.step('Step 9: confirm', async () => {});\" >> $ESPEC"
expect_error "FUNCTIONAL failure without attribution"          2026-09-15 "FUNCTIONAL without attribution (control, repro)" "mkdir -p runs/e2e/orders/2026-09-10-1005 && printf '## TC-E2E-ORDERS-001\n- class: FUNCTIONAL\n- attribution: precondition held at assert (trace step 4)\n' > runs/e2e/orders/2026-09-10-1005/failures.md"
expect_clean "FUNCTIONAL failure with full attribution"        "" "without attribution"                                 "mkdir -p runs/e2e/orders/2026-09-10-1005 && printf '## TC-E2E-ORDERS-001\n- class: FUNCTIONAL\n- attribution: precondition held (trace step 4) · control n/a — read-only list · repro curl in Evidence\n' > runs/e2e/orders/2026-09-10-1005/failures.md"
expect_error "fixed defect with no guard case"                 2026-09-15 "\`fixed\` without a **Case:**"                "sed -i.bak 's/\*\*Case:\*\* TC-UNIT-ORDERS-001/**Case:** —/' $D2"
expect_error "fixed on the same system it failed on"           2026-09-15 "the same system it failed on"                "sed -i.bak 's/^- 2026-09-05-0900 · — · 2026-09-05\$/& · target 8556e8f/; s/^- 2026-09-10-1010 · — · TC-UNIT-ORDERS-001 ✅ · 2026-09-10\$/& · target 8556e8f0/' $D2"
expect_clean "fixed on a different system"                     "" "the same system it failed on"                        "sed -i.bak 's/^- 2026-09-05-0900 · — · 2026-09-05\$/& · target 8556e8f/; s/^- 2026-09-10-1010 · — · TC-UNIT-ORDERS-001 ✅ · 2026-09-10\$/& · target 9a0b1c2/' $D2"
expect_error "exploratory defect with no oracle"               2026-09-15 "names no oracle"                              "sed -i.bak 's/\*\*Origin:\*\* INTERNAL/**Origin:** EXPLORATORY/; s/\*\*REQ:\*\* REQ-002/**REQ:** —/' $D1"

echo
echo "selfcheck — $PASS ok, $FAIL failed"
[ $FAIL -eq 0 ]
