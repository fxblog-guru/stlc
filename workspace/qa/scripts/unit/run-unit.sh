#!/usr/bin/env bash
# Unit-tier runner wrapper (the `unit` type's CONTRACTS §9.6 exception in one place).
# Runs ONLY the command declared in PROJECT-PROFILE §Unit testing, inside the declared repo,
# tees the output into the run's evidence folder, and copies the coverage report (if any)
# next to it so executing-tests / coverage-summary.mjs can read it. It never edits the repo.
#
# Usage (executing-tests passes the profile values explicitly):
#   npm run test:unit -- --repo <path> --cmd "<run command>" [--coverage-cmd "<cmd>"] \
#                        [--report "<glob relative to repo>"] [--format cobertura|lcov|jacoco|istanbul-json] \
#                        [--filter "<framework filter args>"]
# RUN_DIR env var (set by executing-tests) takes precedence; ad-hoc runs get a dated default.
set -euo pipefail

REPO="" CMD="" COV_CMD="" REPORT_GLOB="" FORMAT="" FILTER=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --cmd) CMD="$2"; shift 2 ;;
    --coverage-cmd) COV_CMD="$2"; shift 2 ;;
    --report) REPORT_GLOB="$2"; shift 2 ;;
    --format) FORMAT="$2"; shift 2 ;;
    --filter) FILTER="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$REPO" ] || [ -z "$CMD" ]; then
  echo "run-unit.sh: --repo and --cmd are required (values come from PROJECT-PROFILE §Unit testing). Aborting." >&2
  exit 2
fi
if [ ! -d "$REPO" ]; then
  echo "run-unit.sh: repo path not found: $REPO (fix PROJECT-PROFILE §Unit testing → Repo path)." >&2
  exit 2
fi

QA_DIR="$(pwd)"
export RUN_DIR="${RUN_DIR:-runs/unit/_adhoc/$(date +%Y-%m-%d-%H%M)}"
mkdir -p "$RUN_DIR/coverage"
ABS_RUN_DIR="$QA_DIR/$RUN_DIR"

# Refuse to run with uncommitted production changes we did not make? No — we simply record the
# repo state so the evidence is attributable. (Read-only git; never checkout/reset here.)
if git -C "$REPO" rev-parse --short HEAD >/dev/null 2>&1; then
  {
    echo "repo: $REPO"
    echo "head: $(git -C "$REPO" rev-parse --short HEAD)"
    echo "branch: $(git -C "$REPO" rev-parse --abbrev-ref HEAD)"
    echo "dirty: $(git -C "$REPO" status --porcelain | wc -l | tr -d ' ') path(s)"
  } > "$ABS_RUN_DIR/repo-state.txt"
fi

FULL_CMD="$CMD"
[ -n "$FILTER" ] && FULL_CMD="$CMD $FILTER"
if [ -n "$COV_CMD" ]; then
  FULL_CMD="$COV_CMD"
  [ -n "$FILTER" ] && FULL_CMD="$COV_CMD $FILTER"
fi

echo "unit run → repo=$REPO"
echo "unit run → cmd=$FULL_CMD"
echo "unit run → evidence=$RUN_DIR"
set +e
( cd "$REPO" && bash -lc "$FULL_CMD" ) 2>&1 | tee "$ABS_RUN_DIR/unit-output.log"
UNIT_EXIT=${PIPESTATUS[0]}
set -e

# Copy the coverage report(s) into the evidence folder (newest first when the glob matches many).
# The glob is repo-relative (e.g. coverage/lcov.info, **/coverage.cobertura.xml); matched with
# `case` so `**` works on macOS bash 3 as well. node_modules is always excluded.
if [ -n "$REPORT_GLOB" ]; then
  MATCHES="$(cd "$REPO" && find . -type f -name "$(basename "$REPORT_GLOB")" -not -path '*/node_modules/*' 2>/dev/null \
    | sed 's#^\./##' | while IFS= read -r f; do case "$f" in $REPORT_GLOB|*/$REPORT_GLOB) echo "$f";; esac; done)"
  FOUND=0
  if [ -n "$MATCHES" ]; then
    # shellcheck disable=SC2086  # word-split on purpose: newest report first
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      FOUND=$((FOUND+1))
      cp "$REPO/$f" "$ABS_RUN_DIR/coverage/"
    done < <(cd "$REPO" && ls -t $MATCHES 2>/dev/null | head -5)
  fi
  if [ "$FOUND" -eq 0 ]; then
    echo "WARNING: no coverage report matched '$REPORT_GLOB' under $REPO — coverage gate will be not evaluable." >&2
  else
    echo "coverage: copied $FOUND report(s) → $RUN_DIR/coverage/"
    if [ -n "$FORMAT" ]; then
      FIRST="$(ls -t "$ABS_RUN_DIR/coverage/" | head -1)"
      node "$QA_DIR/scripts/unit/coverage-summary.mjs" --report "$ABS_RUN_DIR/coverage/$FIRST" --format "$FORMAT" \
        --out "$ABS_RUN_DIR/coverage-summary.md" ${UNIT_MODULES:+--modules "$UNIT_MODULES"} \
        ${UNIT_BRANCH_MIN:+--branch-min "$UNIT_BRANCH_MIN"} ${UNIT_LINE_MIN:+--line-min "$UNIT_LINE_MIN"} || true
    fi
  fi
fi

echo "Done. Exit $UNIT_EXIT. Evidence: $RUN_DIR (unit-output.log, coverage/, coverage-summary.md)."
exit "$UNIT_EXIT"
