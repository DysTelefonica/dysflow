#!/usr/bin/env bash
# =====================================================================
# dysflow plugin installer v2.31.0
# =====================================================================
# Mirrors gentle-ai's installer shape + engram's setup.sh pattern.
#
# Strategy:
#   1. Link skills/ to user-local per-agent dirs.
#   2. Install the dysflow plugin into Claude Code + Codex + OpenCode
#      user-local plugin dirs.
#   3. Install the post-worktree git hook so every new worktree
#      bootstraps .dysflow/ automatically.
#
# Coexistence with engram:
#   - engram owns `engram` name + ~/.engram/  + its own plugin files.
#   - dysflow owns `dysflow` name + .dysflow/ + its own plugin files.
#   - Both plugins fire independently under each agent's plugin loader.
#   - No shared scripts, no shared install paths, no shared env vars.
#
# Naming convention (every file owned by this plugin is prefixed):
#   - Plugin name:        "dysflow"
#   - JSON marker fields: "_dysflow_marker", "_dysflow_*"
#   - Script headers:     "# dysflow-plugin: v2.31.0"
#   - Env-var namespace:   CODEX_PLUGIN_ROOT / CLAUDE_PLUGIN_ROOT (per agent)
#
# Update model:
#   - Source files live in plugin/<agent>/ in this repo.
#   - `setup.sh` regenerates the user-local plugin + skill dirs.
#   - `setup.sh` is idempotent: re-run after each dysflow-plugin update.
# =====================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DYSFLOW_SKILLS_SRC="${REPO_ROOT}/skills"
DYSFLOW_PLUGIN_SRC="${REPO_ROOT}/plugin"

echo "[dysflow-plugin setup v2.31.0]"
echo "  Repo root:    ${REPO_ROOT}"
echo "  Skills source: ${DYSFLOW_SKILLS_SRC}"
echo

# 1. Verify prerequisites.
[ -d "${DYSFLOW_SKILLS_SRC}" ] || { echo "ERROR: skills/ not found at ${DYSFLOW_SKILLS_SRC}" >&2; exit 1; }
[ -d "${DYSFLOW_PLUGIN_SRC}" ] || { echo "ERROR: plugin/ not found at ${DYSFLOW_PLUGIN_SRC}" >&2; exit 1; }

# 2. Link skills to per-agent local config dirs.
#    Same pattern as engram's setup.sh. Linking is reversible (delete
#    the symlinks to uninstall).
link_skills() {
    local agent_dir="$1"
    local agent_name="$2"
    local target_dir="${agent_dir}/skills"
    local source_path=""
    local skill_name=""
    local link_path=""

    mkdir -p "${target_dir}"

    # Remove legacy aggregate link if present.
    if [ -L "${target_dir}/dysflow" ]; then
        rm -f "${target_dir}/dysflow"
    fi

    for source_path in "${DYSFLOW_SKILLS_SRC}"/*; do
        skill_name="$(basename "${source_path}")"
        link_path="${target_dir}/${skill_name}"
        ln -sfn "${source_path}" "${link_path}"
        echo "  [${agent_name}] linked ${link_path} -> ${source_path}"
    done
}

# Per-agent skill links.
[ -d "${REPO_ROOT}/.claude" ]   && link_skills "${REPO_ROOT}/.claude"   "claude-code" || true
[ -d "${REPO_ROOT}/.codex" ]    && link_skills "${REPO_ROOT}/.codex"    "codex"      || true
[ -d "${REPO_ROOT}/.opencode" ] && link_skills "${REPO_ROOT}/.opencode" "opencode"   || true

# 3. Plugin install per agent.
#
# Each agent has its own user-local plugin dir. The plugin dir holds:
#   - plugin.json / codex.json  (manifest)
#   - .mcp.json                  (MCP server config)
#   - hooks/hooks.json           (event handlers)
#   - scripts/*.sh               (hook implementations)
#   - For OpenCode: dysflow.ts   (TypeScript plugin)
#
# We copy the source dir verbatim into the user-local plugin dir.

install_claude_code_plugin() {
    local agent_dir="$1"
    local target_plugin_dir="${agent_dir}/plugins/dysflow"
    mkdir -p "${target_plugin_dir}"
    cp -R "${DYSFLOW_PLUGIN_SRC}/claude-code/." "${target_plugin_dir}/"
    echo "  [claude-code] installed plugin -> ${target_plugin_dir}"
}

install_codex_plugin() {
    local agent_dir="$1"
    local target_plugin_dir="${agent_dir}/plugins/dysflow"
    mkdir -p "${target_plugin_dir}"
    cp -R "${DYSFLOW_PLUGIN_SRC}/codex/." "${target_plugin_dir}/"
    echo "  [codex] installed plugin -> ${target_plugin_dir}"
}

install_opencode_plugin() {
    local agent_dir="$1"
    local target_plugin_dir="${agent_dir}/plugins/dysflow"
    mkdir -p "${target_plugin_dir}"
    cp -R "${DYSFLOW_PLUGIN_SRC}/opencode/." "${target_plugin_dir}/"
    echo "  [opencode] installed plugin -> ${target_plugin_dir}"
}

[ -d "${REPO_ROOT}/.claude" ]   && install_claude_code_plugin "${REPO_ROOT}/.claude"   || true
[ -d "${REPO_ROOT}/.codex" ]    && install_codex_plugin      "${REPO_ROOT}/.codex"    || true
[ -d "${REPO_ROOT}/.opencode" ] && install_opencode_plugin   "${REPO_ROOT}/.opencode" || true

# 4. Install the post-worktree git hook so every new worktree bootstraps
#    its .dysflow/ automatically. Coexists with any engram hook the user
#    may have installed — git fires ALL post-worktree hooks in parallel.
install_worktree_hook() {
    local hooks_dir=".git/hooks"
    local hook_path="${hooks_dir}/post-worktree"
    local source_hook="${REPO_ROOT}/plugin/shared/post-worktree.sh"

    if [ ! -d "${hooks_dir}" ]; then
        echo "  [skip] ${hooks_dir} not present — not in a git repo"
        return 0
    fi

    if [ ! -f "${source_hook}" ]; then
        echo "  [skip] ${source_hook} not found — post-worktree hook not installed"
        return 0
    fi

    cp "${source_hook}" "${hook_path}"
    chmod +x "${hook_path}"
    echo "  [git] installed ${hook_path}"
}

install_worktree_hook

echo
echo "Done. Skills linked + plugins installed + post-worktree hook installed."
echo "Re-run after each dysflow-plugin update to refresh."
echo
echo "Coexistence notes:"
echo "  - engram plugin (Gentleman-Programming/engram) fires its own hooks under the 'engram' namespace."
echo "  - dysflow plugin (this repo) fires its own hooks under the 'dysflow' namespace."
echo "  - Both plugins share the same Claude Code/Codex/OpenCode event surface but never overwrite each other."
