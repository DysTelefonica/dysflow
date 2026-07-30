#!/usr/bin/env bash
# =====================================================================
# dysflow-plugin installer v2.31.0
# =====================================================================
# One-shot install: links skills + installs plugin + MCP config +
# post-worktree git hook for Claude Code + Codex + OpenCode.
#
# Auto-creates user-local agent dirs if missing. Mirrors engram's
# plugin install pattern but ships in a single shell script (no Go
# binary install required for the plugin/skill layer).
#
# Usage: ./setup.sh [--scope=project|user]
#   default --scope=user: install to ~/.claude, ~/.codex, ~/.config/opencode
#   --scope=project: install only to ./<project>/.claude, etc. (for CI)
#
# Update model: re-run after each dysflow-plugin update to refresh.
# =====================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DYSFLOW_SKILLS_SRC="${REPO_ROOT}/skills"
DYSFLOW_PLUGIN_SRC="${REPO_ROOT}/plugin"

# Parse args
SCOPE="user"
for arg in "$@"; do
    case "$arg" in
        --scope=project) SCOPE="project" ;;
        --scope=user)   SCOPE="user" ;;
        *) echo "[warn] unknown arg: $arg (use --scope=user|project)" ;;
    esac
done

HOME_DIR="${HOME:-$(eval echo ~)}"

# ─── User-local agent dirs ───────────────────────────────────────────
CLAUDE_USER_DIR="${HOME_DIR}/.claude"
CODEX_USER_DIR="${HOME_DIR}/.codex"
OPENCODE_USER_DIR="${HOME_DIR}/.config/opencode"

# ─── Project-local agent dirs (if --scope=project) ──────────────────
CLAUDE_PROJ_DIR="${REPO_ROOT}/.claude"
CODEX_PROJ_DIR="${REPO_ROOT}/.codex"
OPENCODE_PROJ_DIR="${REPO_ROOT}/.opencode"

echo "[dysflow-plugin installer v2.31.0]"
echo "  Repo:     ${REPO_ROOT}"
echo "  Scope:    ${SCOPE}"
echo "  Home:     ${HOME_DIR}"
echo

# ═══════════════════════════════════════════════════════════════════════
# 1. Skill linking — same shape as engram/setup.sh
# ═══════════════════════════════════════════════════════════════════════

link_skills() {
    local agent_dir="$1"
    local agent_name="$2"
    local target_dir="${agent_dir}/skills"
    local source_path=""
    local skill_name=""
    local link_path=""

    mkdir -p "${target_dir}"

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

echo "[1/4] Linking skills..."

if [ "${SCOPE}" = "user" ]; then
    [ -d "${CLAUDE_USER_DIR}" ]   || mkdir -p "${CLAUDE_USER_DIR}"
    [ -d "${CODEX_USER_DIR}" ]    || mkdir -p "${CODEX_USER_DIR}"
    [ -d "${OPENCODE_USER_DIR}" ] || mkdir -p "${OPENCODE_USER_DIR}"
    link_skills "${CLAUDE_USER_DIR}"   "claude-code"
    link_skills "${CODEX_USER_DIR}"    "codex"
    link_skills "${OPENCODE_USER_DIR}" "opencode"
else
    mkdir -p "${CLAUDE_PROJ_DIR}" "${CODEX_PROJ_DIR}" "${OPENCODE_PROJ_DIR}"
    link_skills "${CLAUDE_PROJ_DIR}"   "claude-code"
    link_skills "${CODEX_PROJ_DIR}"    "codex"
    link_skills "${OPENCODE_PROJ_DIR}" "opencode"
fi
echo

# ═══════════════════════════════════════════════════════════════════════
# 2. Plugin install — Claude Code + Codex + OpenCode
# ═══════════════════════════════════════════════════════════════════════

install_claude_code_plugin() {
    local agent_dir="$1"
    local target_plugin_dir="${agent_dir}/plugins/dysflow"
    mkdir -p "${target_plugin_dir}"
    cp -R "${DYSFLOW_PLUGIN_SRC}/claude-code/." "${target_plugin_dir}/"
    echo "  [claude-code] plugin -> ${target_plugin_dir}"
}

install_codex_plugin() {
    local agent_dir="$1"
    local target_plugin_dir="${agent_dir}/plugins/dysflow"
    mkdir -p "${target_plugin_dir}"
    cp -R "${DYSFLOW_PLUGIN_SRC}/codex/." "${target_plugin_dir}/"
    echo "  [codex] plugin -> ${target_plugin_dir}"
}

install_opencode_plugin() {
    local agent_dir="$1"
    local target_plugin_dir="${agent_dir}/plugins/dysflow"
    mkdir -p "${target_plugin_dir}"
    cp -R "${DYSFLOW_PLUGIN_SRC}/opencode/." "${target_plugin_dir}/"
    echo "  [opencode] plugin -> ${target_plugin_dir}"
}

echo "[2/4] Installing plugins..."

if [ "${SCOPE}" = "user" ]; then
    install_claude_code_plugin "${CLAUDE_USER_DIR}"
    install_codex_plugin      "${CODEX_USER_DIR}"
    install_opencode_plugin   "${OPENCODE_USER_DIR}"
else
    install_claude_code_plugin "${CLAUDE_PROJ_DIR}"
    install_codex_plugin      "${CODEX_PROJ_DIR}"
    install_opencode_plugin   "${OPENCODE_PROJ_DIR}"
fi
echo

# ═══════════════════════════════════════════════════════════════════════
# 3. MCP server config — Claude Code + Codex + OpenCode
# ═══════════════════════════════════════════════════════════════════════

# Claude Code reads .mcp.json from the plugin dir (already copied in step 2).
# Codex reads .mcp.json from the plugin dir (already copied in step 2).
# OpenCode reads .mcp.json from the plugin dir (already copied in step 2).
#
# All three agents auto-launch the dysflow MCP server when the plugin is
# loaded. The .mcp.json in each plugin dir is the canonical config.

# ═══════════════════════════════════════════════════════════════════════
# 4. Git hook — post-worktree bootstrap of .dysflow/
# ═══════════════════════════════════════════════════════════════════════

install_worktree_hook() {
    local hooks_dir=".git/hooks"
    local hook_path="${hooks_dir}/post-worktree"
    local source_hook="${REPO_ROOT}/plugin/shared/post-worktree.sh"

    if [ ! -d "${hooks_dir}" ]; then
        echo "  [skip] not in a git repo"
        return 0
    fi

    if [ ! -f "${source_hook}" ]; then
        echo "  [skip] post-worktree.sh not found at ${source_hook}"
        return 0
    fi

    cp "${source_hook}" "${hook_path}"
    chmod +x "${hook_path}"
    echo "  [git] installed ${hook_path}"
}

echo "[3/4] Installing post-worktree git hook..."
install_worktree_hook
echo

# ═══════════════════════════════════════════════════════════════════════
# 5. Optional: also link the plugin into agent's global plugins dir if
#    the agent supports a marketplace-style install (Claude Code does).
# ═══════════════════════════════════════════════════════════════════════

echo "[4/4] Plugin manifest registration..."

# Claude Code auto-discovers ~/.claude/plugins/* without registration.
# Codex auto-discovers ~/.codex/plugins/* without registration.
# OpenCode auto-loads ~/.config/opencode/plugins/* without registration.

echo "  No manual registration needed — agents auto-load plugins from the dirs above."
echo

# ═══════════════════════════════════════════════════════════════════════
# Status
# ═══════════════════════════════════════════════════════════════════════

if [ "${SCOPE}" = "user" ]; then
    CATALOG_BASE="${HOME_DIR}"
    CLAUDE_LABEL="${CLAUDE_USER_DIR}"
    CODEX_LABEL="${CODEX_USER_DIR}"
    OPENCODE_LABEL="${OPENCODE_USER_DIR}"
else
    CATALOG_BASE="${REPO_ROOT}"
    CLAUDE_LABEL="${CLAUDE_PROJ_DIR} (project-local)"
    CODEX_LABEL="${CODEX_PROJ_DIR} (project-local)"
    OPENCODE_LABEL="${OPENCODE_PROJ_DIR} (project-local)"
fi

echo "Done. Installed at:"
echo "  Claude Code: ${CLAUDE_LABEL}/plugins/dysflow/"
echo "  Codex:       ${CODEX_LABEL}/plugins/dysflow/"
echo "  OpenCode:    ${OPENCODE_LABEL}/plugins/dysflow/"
echo "  Skills:      ${CLAUDE_LABEL}/skills/  (linked from ${DYSFLOW_SKILLS_SRC})"
echo
echo "Restart your agent to load the plugin."
echo "Re-run after each dysflow-plugin update to refresh."
echo
echo "Coexistence notes:"
echo "  - engram plugin (Gentleman-Programming/engram) is at the same paths but under 'engram' namespace."
echo "  - dysflow plugin (this repo) is under 'dysflow' namespace."
echo "  - Both plugins fire independently. No shared scripts, no shared state."
