#!/usr/bin/env bash
# =====================================================================
# dysflow-plugin:session-start (Codex)
# =====================================================================
# Mirror of plugin/claude-code/scripts/session-start.sh with the Codex
# env-var convention (CODEX_PLUGIN_ROOT instead of CLAUDE_PLUGIN_ROOT).
# Same lifecycle, same namespace marker. Update BOTH files together.
# DO NOT EDIT MANUALLY — replaced on plugin update.
# =====================================================================
set -euo pipefail

PLUGIN_ROOT="${CODEX_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

cat <<'EOF'
[dysflow-plugin] Loading canonical workflow.

First calls:
  1. bootstrap({cwd}) -- the only mandatory first call; humanCompilePending is a reminder, never a block (HR-1)
  2. schema({view:"index"}), then describe_tool for the tool you will call (HR-5)
  3. writes: plan (apply: false), then commit (apply: true)
  4. destructive tools: implements_check + confirmedRequiresConfirmation: true after the human approves (HR-2)
  5. verify_code after a sync; gate on actionableOk (HR-15)

TDD (HR-1): RED runs without a compile; the human compiles once before GREEN.
NEVER: dryRun: true, kill MSACCESS by name, write to production.
Full hard rules: skills/dysflow-arnes/SKILL.md
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
