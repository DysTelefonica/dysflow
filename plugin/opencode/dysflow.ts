/**
 * Dysflow — OpenCode plugin adapter v2.31.0
 * =========================================
 *
 * This file is the OPENCODE side of the dysflow plugin. The Claude Code /
 * Codex sides live in `plugin/claude-code/` and `plugin/codex/` (shell
 * scripts). All three plugins share the `dysflow-plugin` namespace and
 * are designed to coexist with Gentleman-Programming/engram's plugin
 * (no shared state, no shared install path, distinct file ownership).
 *
 * Plugin structure (mirrors engram's `plugin/opencode/engram.ts`):
 *
 *   OpenCode events → this plugin → dysflow CLI / MCP context injection
 *
 * The plugin does NOT spawn a long-running server. It shells out to
 * `dysflow state` (a short-lived CLI call) per hook invocation. The
 * actual MCP server (`npx dysflow mcp`) is launched by OpenCode via
 * the `.mcp.json` MCP server config (declared in `plugin/opencode/.mcp.json`).
 *
 * Namespace: dysflow-plugin
 * Owner:    Andrés Román (DysTelefonica)
 * Companion: Gentleman-Programming/engram (separate file; same OpenCode
 *            plugin loader fires both)
 */

import type { Plugin } from "@opencode-ai/plugin"

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

/** Canonical instructions injected into the agent's system prompt. */
const DYSFLOW_PROTOCOL = `## Dysflow Canonical Workflow — MUST READ

You are operating on a Microsoft Access / VBA project via the dysflow MCP. The runtime gives you primitives; this section gives you the workflow. Full rules: skills/dysflow-protocol/SKILL.md.

### Hard rules (NEVER violate)

- **HR-1 — The HUMAN compiles.** Never call \`apply: true\` on \`test_vba\`/\`run_vba\` while \`humanCompilePending: true\`. Required loop: write source -> \`import_modules({moduleNames:[...], apply:false})\` -> ASK user to compile manually (Debug ▸ Compile) -> WAIT for "ya está" -> THEN \`test_vba\`.
- **HR-2 — NEVER kill MSACCESS.EXE generically.** Use ONLY dysflow-owned cleanup: \`list_access_operations\` -> \`access_force_cleanup_orphaned\` -> \`cleanup_access_operation\`.
- **HR-3 — NEVER write to production backend.** \`m_TestingMode=True\` is the only path for test data.
- **HR-4 — Unified confirmation policy.** For mutating tools with \`implements_check\`: \`requires_confirmation: true\` requires \`confirmedRequiresConfirmation: true\` after explicit ask_user. \`requires_confirmation: false\` rejects the override (\`CONFIRMATION_NOT_NEEDED\`).
- **HR-5 — \`apply: false\` is the plan signal.** Never \`dryRun: true\` (legacy, hard-removed in v2.31.0).
- **HR-6 — Pre-flight BEFORE every write.** get_capabilities -> confirm writes + adapterVersion + humanCompilePending + toolsVisible.
- **HR-9 — Worktrees.** \`git worktree add\` does NOT copy .dysflow/. Hooks auto-bootstrap; if missing, run \`dysflow setup --cwd <path> --apply --access-path <path>\`.

### Anti-patterns

- \`dryRun: true\` (removed) — use \`apply: false\`.
- \`confirm: true\` / \`confirmOverwriteSource: true\` / \`confirmPid: <pid>\` (removed) — use \`confirmedRequiresConfirmation: true\` with \`implements_check: '<check_id>'\`.
- Claiming "TDD-green" without BOTH user-confirmed compile AND all-green \`test_vba\`.

### 8-step canonical loop

1. \`get_capabilities({})\` -> capture adapterVersion + toolsVisible + humanCompilePending.
2. \`doctor({})\` or \`diagnose({})\` -> surface known issues + check_id -> requires_confirmation.
3. Detect \`implements_check\` for the mutating tool (DOCTOR_CHECK_METADATA).
4. Determine confirmation policy: \`requires_confirmation: true|false\`.
5. Plan first: \`apply: false\`.
6. If \`requires_confirmation: true\`: \`ask_user\` -> capture explicit ack.
7. Commit: \`apply: true\` + (if needed) \`confirmedRequiresConfirmation: true\`.
8. \`verify_code({})\` -> check source <-> binary drift.

### Recovery (error.code -> action)

- \`CONFIRMATION_REQUIRED\` -> re-call with \`confirmedRequiresConfirmation: true\` after ask_user.
- \`CONFIRMATION_NOT_NEEDED\` -> drop the override.
- \`MCP_INPUT_INVALID\` -> read \`error.rejectedFlag\` + \`error.toolCommitFlag\`.
- \`MCP_PROCEDURE_NOT_ALLOWED\` -> add procedure to .dysflow/project.json#allowedProcedures OR plan only.
- \`EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION\` -> set \`implements_check: 'export_overwrites_source_precheck'\` + \`confirmedRequiresConfirmation: true\`.
- \`CONFIG_MISSING_ACCESS_PATH\` -> \`dysflow setup --cwd <path> --apply --access-path <path>\`.

### Skills companion

| When you are... | Load this skill FIRST |
|---|---|
| Writing/reviewing VBA | \`vba-access\` |
| Implementing TDD feature | \`access-vba-tdd-loop\` |
| Working on forms | \`access-form-ui-builder\` |
| Syncing source <-> binary | \`vba-binary-sync\` |
`

const DYSFLOW_PROTOCOL_MARKER = "[dysflow-plugin v2.31.0]"

/** Detect if cwd looks like a dysflow project. */
function isDysflowProject(directory: string): boolean {
  return (
    directory.includes(".dysflow") ||
    Bun.spawnSync(["test", "-d", `${directory}/.dysflow`]).exitCode === 0
  )
}

/** Detect if cwd is a git worktree missing .dysflow/ (the bootstrap friction). */
function worktreeMissingDysflow(directory: string): boolean {
  const isGit =
    Bun.spawnSync(["test", "-d", `${directory}/.git`]).exitCode === 0 ||
    Bun.spawnSync(["test", "-f", `${directory}/.git`]).exitCode === 0
  if (!isGit) return false
  const hasDysflow =
    Bun.spawnSync(["test", "-d", `${directory}/.dysflow`]).exitCode === 0
  return !hasDysflow
}

/** Run `dysflow state` (short-lived) to capture live project context. */
function captureDysflowState(directory: string): string | null {
  try {
    const result = Bun.spawnSync(["dysflow", "state", "--cwd", directory], {
      stdout: "pipe",
      stderr: "pipe",
    })
    if (result.exitCode !== 0) return null
    return result.stdout?.toString() ?? null
  } catch {
    return null
  }
}

/** Run `dysflow doctor` for drift surface at session start / compaction. */
function runDysflowDoctor(directory: string): string | null {
  try {
    const result = Bun.spawnSync(["dysflow", "doctor", "--cwd", directory], {
      stdout: "pipe",
      stderr: "pipe",
    })
    if (result.exitCode !== 0) return null
    return result.stdout?.toString() ?? null
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Plugin export
// ═══════════════════════════════════════════════════════════════════════════

export const Dysflow: Plugin = async (ctx) => {
  const projectIsDysflow = isDysflowProject(ctx.directory)
  const worktreeNeedsBootstrap = worktreeMissingDysflow(ctx.directory)

  return {
    // ─── Session-start hook (lifecycle) ────────────────────────────────
    //
    // Fires once when the OpenCode session begins. We inject the
    // canonical workflow into the system prompt + surface project state.
    //
    // Equivalent to engram's `experimental.chat.system.transform` but on
    // session start (OpenCode fires `event` with `session.created`).

    event: async ({ event }) => {
      if (event.type === "session.created") {
        // Surface a one-line marker so the user can see in the log that
        // the dysflow plugin fired. Useful for debugging "is my plugin loaded?".
        console.log(
          `${DYSFLOW_PROTOCOL_MARKER} session.start cwd=${ctx.directory}`,
        )
      }
    },

    // ─── System prompt: always-on workflow ────────────────────────────
    //
    // Injects DYSFLOW_PROTOCOL into the system prompt so the agent
    // ALWAYS knows how to use dysflow, even after compaction.
    //
    // Mirrors engram's `experimental.chat.system.transform` pattern.
    // We append to the last existing system entry instead of pushing a
    // new one — some models reject multiple system messages (Qwen3.5,
    // Mistral via llama.cpp). Concat avoids breaking those models.

    "experimental.chat.system.transform": async (_input, output) => {
      // Only inject for dysflow projects. For non-dysflow directories
      // (e.g., the user is working on something else), do nothing.
      if (!projectIsDysflow) return

      let systemAddition = `\n\n${DYSFLOW_PROTOCOL}`

      // Worktree bootstrap nudge — fires when cwd is a git worktree
      // missing .dysflow/. Silent otherwise.
      if (worktreeNeedsBootstrap) {
        systemAddition += `\n\n${DYSFLOW_PROTOCOL_MARKER} WARNING: cwd is a git worktree without .dysflow/. Bootstrap: \`dysflow setup --cwd ${ctx.directory} --apply --access-path <path>\``
      }

      // Capture live project state via short-lived CLI call. The output
      // gets injected so the agent sees adapterVersion + writesProcess +
      // humanCompilePending without needing to call get_capabilities first.
      const state = captureDysflowState(ctx.directory)
      if (state) {
        systemAddition += `\n\n## Live dysflow state (cwd=${ctx.directory})\n\`\`\`json\n${state}\n\`\`\``
      }

      if (output.system.length > 0) {
        output.system[output.system.length - 1] += systemAddition
      } else {
        output.system.push(systemAddition)
      }
    },

    // ─── Compaction hook: re-establish context ───────────────────────
    //
    // Compaction kills working memory. We re-inject the workflow +
    // fresh project state so the agent doesn't "go crazy" after.

    "experimental.session.compacting": async (_input, output) => {
      if (!projectIsDysflow) return

      const state = captureDysflowState(ctx.directory)
      const doctor = runDysflowDoctor(ctx.directory)

      if (state) {
        output.context.push(
          `${DYSFLOW_PROTOCOL_MARKER} context re-established after compaction.\n\n## Live dysflow state\n\`\`\`json\n${state}\n\`\`\``,
        )
      }

      if (doctor) {
        output.context.push(
          `${DYSFLOW_PROTOCOL_MARKER} doctor output (drift surface):\n\`\`\`\n${doctor}\n\`\`\``,
        )
      }

      // Remind the agent to call get_capabilities + state on resume so
      // it has fresh context before continuing.
      output.context.push(
        `${DYSFLOW_PROTOCOL_MARKER} FIRST ACTION on resume:\n` +
          `1. Call \`get_capabilities({})\` to confirm adapterVersion + toolsVisible + humanCompilePending.\n` +
          `2. Call \`doctor({})\` to surface drift before any write.\n` +
          `3. If cwd is a worktree without .dysflow/, run \`dysflow setup --cwd ${ctx.directory} --apply --access-path <path>\`.\n` +
          `4. Then resume your 8-step canonical loop.`,
      )
    },
  }
}
