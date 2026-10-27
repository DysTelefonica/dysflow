#!/usr/bin/env bash
# =====================================================================
# dysflow-plugin:post-compaction (Codex)
# =====================================================================
# Mirror of plugin/claude-code/scripts/post-compaction.sh. Update BOTH.
# DO NOT EDIT MANUALLY — replaced on plugin update.
# =====================================================================
set -euo pipefail

cat <<'EOF'
[dysflow-plugin] Re-establishing context after compaction.

Reminders: bootstrap first; RED runs without a compile, the human compiles once before GREEN (HR-1);
NEVER dryRun/kill MSACCESS/write-prod; apply:false for plan. Rules: skills/dysflow-arnes/SKILL.md
EOF

if command -v dysflow >/dev/null 2>&1; then
    dysflow state 2>/dev/null || true
fi

exit 0
