#!/usr/bin/env bash
# =====================================================================
# dysflow-plugin:post-compaction (Codex) v2.31.0
# =====================================================================
# Mirror of plugin/claude-code/scripts/post-compaction.sh. Update BOTH.
# DO NOT EDIT MANUALLY — replaced on plugin update.
# =====================================================================
set -euo pipefail

cat <<'EOF'
[dysflow-plugin v2.31.0] Re-establishing context after compaction.

Reminders: 8-step loop; NEVER dryRun/kill MSACCESS/write-prod; apply:false for plan.
EOF

if command -v dysflow >/dev/null 2>&1; then
    dysflow state 2>/dev/null || true
fi

exit 0
