#!/bin/bash
set -eu
test "$CHANGES_RESULT" = success
if test "$EVENT" = push; then
  test "$INTEGRITY_RESULT" = success
  test "$SMOKE_RESULT" = skipped
  if test "$VALIDATED_PR_MERGE" = true; then
    echo "validated PR merge: full quality already passed before merge"
    test "$QUALITY_RESULT" = skipped
  else
    echo "direct or unverifiable push: full quality required"
    test "$QUALITY_RESULT" = success
  fi
else
  test "$INTEGRITY_RESULT" = skipped
  if test "$CODE_REQUIRED" = true; then
    test "$QUALITY_RESULT" = success
    case "$HEAD_REF" in
      skill-fleet/*)
        echo "skill-fleet/* propagation: Windows smoke skipped (#1763)"
        test "$SMOKE_RESULT" = skipped
        ;;
      *)
        test "$SMOKE_RESULT" = success
        ;;
    esac
  else
    echo "docs-only: code quality jobs intentionally skipped"
    test "$QUALITY_RESULT" = skipped
    test "$SMOKE_RESULT" = skipped
  fi
fi