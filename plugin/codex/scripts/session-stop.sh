#!/usr/bin/env bash
# =====================================================================
# dysflow-plugin:session-stop (Codex) v2.31.0
# =====================================================================
# DO NOT EDIT MANUALLY — replaced on plugin update.
# =====================================================================
set -euo pipefail

if command -v dysflow >/dev/null 2>&1; then
    dysflow doctor 2>/dev/null || true
fi

exit 0
