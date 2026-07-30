#!/usr/bin/env bash
# =====================================================================
# dysflow-plugin:session-start (Codex) v2.31.0
# =====================================================================
# Mirror of plugin/claude-code/scripts/session-start.sh with the Codex
# env-var convention (CODEX_PLUGIN_ROOT instead of CLAUDE_PLUGIN_ROOT).
# Same lifecycle, same namespace marker. Update BOTH files together.
# DO NOT EDIT MANUALLY — replaced on plugin update.
# =====================================================================
set -euo pipefail

PLUGIN_ROOT="${CODEX_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

cat <<'EOF'
[dysflow-plugin v2.31.0] Loading canonical workflow.

8-step loop:
  1. get_capabilities -> adapterVersion + humanCompilePending + toolsVisible
  2. doctor          -> known issues
  3. detect check_id for the mutating tool
  4. determine confirmation policy (requires_confirmation)
  5. plan first (apply: false)
  6. ask_user if confirmation needed
  7. commit (apply: true) + confirmedRequiresConfirmation: true
  8. verify_code -> source<->binary drift

NEVER: dryRun: true, kill MSACCESS, write to production, claim TDD-green without compile.
EOF

if command -v dysflow >/dev/null 2>&1; then
    dysflow state 2>/dev/null || echo "[dysflow-plugin] dysflow state unavailable"
fi

if [ -d .git ] || [ -f .git ]; then
    if [ ! -d .dysflow ]; then
        echo "[dysflow-plugin] WARNING: git worktree without .dysflow/."
        echo "  Bootstrap: dysflow setup --cwd $(pwd) --apply --access-path <path>"
    fi
fi

exit 0
