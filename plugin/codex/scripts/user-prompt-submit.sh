#!/usr/bin/env bash
# =====================================================================
# dysflow-plugin:user-prompt-submit (Codex) v2.31.0
# =====================================================================
# DO NOT EDIT MANUALLY — replaced on plugin update.
# =====================================================================
set -euo pipefail

if [ -d .dysflow ]; then
    exit 0
fi
if [ ! -d .git ] && [ ! -f .git ]; then
    exit 0
fi

sibling=""
for path in ../*/.dysflow; do
    if [ -d "$path" ]; then
        sibling="$(dirname "$path")"
        break
    fi
done

if [ -n "$sibling" ]; then
    echo "[dysflow-plugin v2.31.0] Detected git worktree without .dysflow/."
    echo "  Sibling:   $sibling"
    echo "  Bootstrap: dysflow setup --cwd $(pwd) --apply --access-path <sibling-accessPath>"
fi

exit 0
