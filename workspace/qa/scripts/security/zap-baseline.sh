#!/usr/bin/env bash
# ZAP baseline scan (passive) against the team's OWN application.
# Authorized environments only — see PROJECT-PROFILE §Environments.
# Usage: npm run test:security  (or: bash scripts/security/zap-baseline.sh [run-dir] [rules.conf])
# RUN_DIR env var (set by executing-tests) takes precedence over the positional arg.
set -euo pipefail

ENV_FILE=".env.${QA_ENV:-uat}"
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a

if [ -z "${ZAP_TARGET_URL:-}" ]; then
  echo "ZAP_TARGET_URL is not set (fill it in $ENV_FILE). Aborting." >&2
  exit 1
fi

RUN_DIR="${RUN_DIR:-${1:-runs/security/_adhoc/$(date +%Y-%m-%d-%H%M)}}"
mkdir -p "$RUN_DIR"

# Alert gate: use the generated per-case rules file when present
# (generating-security-script writes scripts/security/<module>/TC-SEC-*-baseline-scan.conf).
# Without it the scan is report-only and SAYS so — it cannot fail the §Quality gates alert gate.
CONF="${2:-$(find scripts/security -name '*.conf' 2>/dev/null | head -1)}"
CONF_ARGS=()
if [ -n "$CONF" ] && [ -f "$CONF" ]; then
  echo "Alert gate: $CONF (FAIL-level alerts exit non-zero)"
  CONF_ARGS=(-c "$CONF")
else
  echo "WARNING: no scripts/security/**/*.conf rules file found — scan is report-only; the alert gate CANNOT fail this run." >&2
fi

echo "ZAP baseline scan → $ZAP_TARGET_URL (report: $RUN_DIR)"
set +e
docker run --rm -v "$(pwd):/zap/wrk:rw" -t zaproxy/zap-stable \
  zap-baseline.py -t "$ZAP_TARGET_URL" ${CONF_ARGS[@]+"${CONF_ARGS[@]}"} \
  -r "$RUN_DIR/zap-report.html" -J "$RUN_DIR/zap-report.json"
ZAP_EXIT=$?
set -e

echo "Done. Review $RUN_DIR/zap-report.html; triage findings per the reporting-results skill."
exit $ZAP_EXIT
