#!/usr/bin/env bash
# Mobile-tier runner wrapper (the `mobile` type's CONTRACTS §9.6 exception in one place).
# Runs ONLY the command declared in PROJECT-PROFILE §Mobile testing, inside the declared mobile
# automation repo, tees the output into the run's evidence folder, and copies the Allure results and
# logs next to it so executing-tests can write device-matrix.md. It never edits that repo.
#
# Usage (executing-tests passes the profile values explicitly):
#   npm run test:mobile -- --repo <path> --cmd "<run command>" --platform android|ios \
#                          [--devices "<names>"] [--matrix full] [--instances <n>] \
#                          [--tags "@smoke"] [--app <path-or-farm-id>] [--env <name>]
# RUN_DIR env var (set by executing-tests) takes precedence; ad-hoc runs get a dated default.
set -euo pipefail

REPO="" CMD="" PLATFORM="" DEVICES="" MATRIX="" INSTANCES="" TAGS="" APP="" TEST_ENV=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --cmd) CMD="$2"; shift 2 ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    --devices) DEVICES="$2"; shift 2 ;;
    --matrix) MATRIX="$2"; shift 2 ;;
    --instances) INSTANCES="$2"; shift 2 ;;
    --tags) TAGS="$2"; shift 2 ;;
    --app) APP="$2"; shift 2 ;;
    --env) TEST_ENV="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$REPO" ] || [ -z "$CMD" ] || [ -z "$PLATFORM" ]; then
  echo "run-mobile.sh: --repo, --cmd and --platform are required (values come from PROJECT-PROFILE §Mobile testing). Aborting." >&2
  exit 2
fi
if [ ! -d "$REPO" ]; then
  echo "run-mobile.sh: mobile framework repo not found: $REPO (fix PROJECT-PROFILE §Mobile testing → Framework repo)." >&2
  exit 2
fi
case "$PLATFORM" in android|ios) ;; *) echo "run-mobile.sh: --platform must be android or ios (got '$PLATFORM')." >&2; exit 2 ;; esac

QA_DIR="$(pwd)"
export RUN_DIR="${RUN_DIR:-runs/mobile/_adhoc/$(date +%Y-%m-%d-%H%M)}"
mkdir -p "$RUN_DIR/allure-results" "$RUN_DIR/logs"
ABS_RUN_DIR="$QA_DIR/$RUN_DIR"

# Record the repo state so evidence is attributable (read-only git; never checkout/reset).
if git -C "$REPO" rev-parse --short HEAD >/dev/null 2>&1; then
  {
    echo "repo: $REPO"
    echo "head: $(git -C "$REPO" rev-parse --short HEAD)"
    echo "branch: $(git -C "$REPO" rev-parse --abbrev-ref HEAD)"
    echo "dirty: $(git -C "$REPO" status --porcelain | wc -l | tr -d ' ') path(s)"
    echo "platform: $PLATFORM"
    echo "devices: ${DEVICES:-<default tier>}${MATRIX:+ (MATRIX=$MATRIX)}"
    echo "tags: ${TAGS:-<all>}"
    echo "app: ${APP:-<from the framework environment config>}"
  } > "$ABS_RUN_DIR/repo-state.txt"
fi

# The framework reads its knobs from the environment (see its .env.example): TEST_ENV, DEVICES,
# MATRIX, MAX_INSTANCES, TEST_TAGS, ANDROID_APP/IOS_APP. We pass only what the profile declared.
ENV_ARGS=()
[ -n "$TEST_ENV" ] && ENV_ARGS+=("TEST_ENV=$TEST_ENV")
[ -n "$DEVICES" ] && ENV_ARGS+=("DEVICES=$DEVICES")
[ -n "$MATRIX" ] && ENV_ARGS+=("MATRIX=$MATRIX")
[ -n "$INSTANCES" ] && ENV_ARGS+=("MAX_INSTANCES=$INSTANCES")
[ -n "$TAGS" ] && ENV_ARGS+=("TEST_TAGS=$TAGS")
if [ -n "$APP" ]; then
  if [ "$PLATFORM" = "android" ]; then ENV_ARGS+=("ANDROID_APP=$APP"); else ENV_ARGS+=("IOS_APP=$APP"); fi
fi

echo "mobile run → repo=$REPO"
echo "mobile run → platform=$PLATFORM cmd=$CMD"
echo "mobile run → ${ENV_ARGS[*]:-<framework defaults>}"
echo "mobile run → evidence=$RUN_DIR"
set +e
( cd "$REPO" && env ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} bash -lc "$CMD" ) 2>&1 | tee "$ABS_RUN_DIR/mobile-output.log"
MOBILE_EXIT=${PIPESTATUS[0]}
set -e

# Copy the framework's evidence into the run folder (Allure results + runner logs).
for src in "reports/allure-results" "allure-results"; do
  if [ -d "$REPO/$src" ]; then
    cp -R "$REPO/$src/." "$ABS_RUN_DIR/allure-results/" 2>/dev/null || true
    echo "evidence: copied $src → $RUN_DIR/allure-results/"
    break
  fi
done
if [ -d "$REPO/logs" ]; then
  cp -R "$REPO/logs/." "$ABS_RUN_DIR/logs/" 2>/dev/null || true
  echo "evidence: copied logs → $RUN_DIR/logs/"
fi
RESULT_COUNT="$(find "$ABS_RUN_DIR/allure-results" -name '*-result.json' 2>/dev/null | wc -l | tr -d ' ')"
if [ "$RESULT_COUNT" = "0" ]; then
  echo "WARNING: no Allure result files copied — per-device verdicts will be 'not evaluable' in device-matrix.md." >&2
else
  echo "evidence: $RESULT_COUNT test result file(s)"
fi

echo "Done. Exit $MOBILE_EXIT. Evidence: $RUN_DIR (mobile-output.log, allure-results/, logs/, repo-state.txt)."
exit "$MOBILE_EXIT"
