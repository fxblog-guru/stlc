#!/usr/bin/env bash
# k6 wrapper: loads <qa-root>/.env.<env> before running k6, so PERF_TARGET_URL / PERF_VUS /
# PERF_DURATION reach the script — plain `k6 run` never reads .env files.
# Usage: npm run test:perf -- scripts/performance/<module>/<TC>.js
# RUN_DIR env var (set by executing-tests) takes precedence; ad-hoc runs get a dated default.
set -euo pipefail

ENV_FILE=".env.${QA_ENV:-uat}"
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a

if [ -z "${PERF_TARGET_URL:-}" ]; then
  echo "PERF_TARGET_URL is not set (fill it in $ENV_FILE). Aborting." >&2
  exit 1
fi

export RUN_DIR="${RUN_DIR:-runs/performance/_adhoc/$(date +%Y-%m-%d-%H%M)}"
mkdir -p "$RUN_DIR"

exec k6 run \
  -e RUN_DIR="$RUN_DIR" \
  -e PERF_TARGET_URL="$PERF_TARGET_URL" \
  -e PERF_VUS="${PERF_VUS:-}" \
  -e PERF_DURATION="${PERF_DURATION:-}" \
  "$@"
