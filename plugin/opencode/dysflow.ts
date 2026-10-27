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
const DYSFLOW_PROTOCOL = `## Dysflow operating rules — MUST READ

You are operating on a Microsoft Access / VBA project via the dysflow MCP. The rules below are copied verbatim from the canonical arnés in skills/dysflow-arnes/SKILL.md; test/docs/plugin-protocol-arnes-alignment-1947.test.ts keeps them identical. Tool names, flags and error codes: skills/dysflow-usage/SKILL.md.

# dysflow — operating rules

Load \`dysflow-usage\` first for tool names, flags and error codes. Call
\`bootstrap({})\` before any static diagnosis or config change. The live runtime
wins over any document; if they disagree, follow the runtime and report the drift.
Bootstrap first is the only mandatory pre-call step: a closed gate answers with a
typed error. Rule numbers are stable; HR-4 is retired.

- **HR-1 — The human compiles once, before GREEN.** Run the RED test without asking for a compile; a RED counts only when it fails on the expected assertion, never on a compile error or a procedure that was not found. After the implementation is imported, ask the human to compile in Access once and wait for confirmation before the GREEN run. Dysflow never compiles the user's binary; the only exception is the temporary sandbox copy \`test_vba\` compiles before running tests. \`humanCompilePending\` is a reminder: no tool refuses a call because of it. Do not trust \`humanCompilePending:false\` when its scope is \`no-project-in-scope\`.
- **HR-2 — Confirm destructive operations.** Pass \`implements_check\` and \`confirmedRequiresConfirmation:true\` only after the human approves the risk. Never kill \`MSACCESS.EXE\` by name; clean up through \`list_access_operations\` and the dysflow cleanup tools.
- **HR-3 — Never write to a production backend.** Test data goes only through \`m_TestingMode=True\`. If the sandbox is unreachable, report "TESTS BLOCKED" and do not touch data.
- **HR-5 — The runtime is the source of truth.** Re-read \`bootstrap\`, \`schema({view:"index"})\` and the needed \`describe_tool\` block before a non-trivial sequence; expand \`get_capabilities({view:"compact"})\` only for the fields you need. Never memorize names, defaults or codes.
- **HR-6 — Tests live in \`tests/*.json\`.** Never add test names to \`.dysflow/project.json\` as a fix. The allowlist gates only when \`capabilities.procedures.strictMode\` is true; ask the human before changing it.
- **HR-7 — Verify liveness before asserting.** Check \`list_access_operations\` before claiming a process exists or blocks a write. Never invent process details.
- **HR-8 — Serialize writes.** One write call, then audit, then the next. Batch related work through list arguments in one call.
- **HR-9 — Select the worktree per call.** Pass \`cwd\`; never restart the MCP or edit configs to switch worktrees.
- **HR-10 — Bootstrap a missing config first.** When \`projectConfig.status\` is \`missing\`, run \`setup_project\` as a plan, review it, then apply with an explicit \`projectId\`.
- **HR-11 — Ask on ambiguity.** When \`resolve_project\` returns \`ambiguous\`, ask the human to pick one \`availableProjects\` entry; never guess. The recovery trio is one-shot.
- **HR-12 — Let metadata route discovery.** Use \`tools/list\`, \`annotations\` and \`describe_tool\`; the full schema decides parameters and errors.
- **HR-13 — Parse envelopes defensively.** Require \`schemaVersion: "dysflow.result/v1"\`, parse a string once, and prefer \`structuredContent\` first; use \`content[0].text\` only when it contains the complete payload. Never audit a bounded summary as the contract.
- **HR-14 — Empty \`.form.txt\` bindings are not a bug.** The unattended form assigns them in \`Form_Open\`/\`Form_Load\` of the \`.cls\`; trace it through \`map_form_behavior\`, never by reading the \`.form.txt\`.
- **HR-15 — Gate \`verify_code\` on \`actionableOk\`.** Read \`recommendedAction\`. The aggregate counts never identify modules: use one \`diagnostic:true\` call and read \`actionableDifferent[]\` / \`nonActionableDifferent[]\`. One form can produce entries for \`.cls\` and \`.form.txt\`, classified separately.
- **HR-16 — Keep the gate order.** Write gate, then procedure gate. A lower gate's refusal is never the cause of a higher one. The human compile is a team convention, not a runtime gate (HR-1).
- **HR-17 — Reconcile with fresh evidence.** Compare \`.form.txt\` with \`.form.txt\` and \`.cls\` with \`.cls\`, never database hashes. \`manual_merge\` never picks a winner.
dysflow harness v2.0.0 · requires dysflow MCP >= 4.4 · Apache-2.0

### First calls

1. \`bootstrap({cwd})\` — the only mandatory first call. \`humanCompilePending\` in its answer is a reminder, never a block (HR-1).
2. \`schema({view:"index"})\`, then \`describe_tool\` for the one tool you will call (HR-5, HR-12).
3. Writes: plan with \`apply: false\`, then commit with \`apply: true\`, one write at a time (HR-8). A destructive tool also needs \`implements_check\` + \`confirmedRequiresConfirmation: true\` after the human approves (HR-2).
4. After a sync, \`verify_code\` and gate on \`actionableOk\` (HR-15).

### TDD loop (HR-1)

RED: run \`test_vba\` without asking for a compile; it must fail on the expected assertion. Import the implementation, ask the human to compile in Access once, wait for confirmation, then run \`test_vba\` for GREEN. \`test_vba\` compiles only its temporary sandbox copy, never the user's binary.

### Anti-patterns

- \`dryRun: true\` (removed) — use \`apply: false\`.
- \`confirm: true\` / \`confirmOverwriteSource: true\` / \`confirmPid: <pid>\` (removed) — use \`confirmedRequiresConfirmation: true\` with \`implements_check: '<check_id>'\`.
- Asking for a compile before the RED run, or treating \`humanCompilePending: true\` as a reason not to call a tool.

### Recovery (error.code -> action)

- \`CONFIRMATION_REQUIRED\` -> ask the human; re-call with \`confirmedRequiresConfirmation: true\` only after approval (HR-2).
- \`CONFIRMATION_NOT_NEEDED\` -> drop the override.
- \`MCP_INPUT_INVALID\` -> read \`error.rejectedFlag\`, \`error.missingParam\` and \`error.toolCommitFlag\`.
- \`MCP_PROCEDURE_NOT_ALLOWED\` -> reachable only under \`capabilities.procedures.strictMode\`; surface \`error.allowedProcedures\` and ask the human before changing the allowlist (HR-6).
- \`EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION\` -> pass an explicit \`destinationRoot\`, or after human approval set \`implements_check: 'export_overwrites_source_precheck'\` + \`confirmedRequiresConfirmation: true\`.
- \`CONFIG_MISSING_ACCESS_PATH\` -> run \`setup_project\` as a plan, review it, then apply with an explicit \`projectId\` (HR-10).

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

      // Remind the agent to re-bootstrap on resume so it has fresh
      // context before continuing (arnés: bootstrap first is the only
      // mandatory pre-call step).
      output.context.push(
        `${DYSFLOW_PROTOCOL_MARKER} FIRST ACTION on resume:\n` +
          `1. Call \`bootstrap({cwd})\`; \`humanCompilePending\` is a reminder, never a block (HR-1).\n` +
          `2. If cwd is a worktree without .dysflow/, run \`dysflow setup --cwd ${ctx.directory} --apply --access-path <path>\`.\n` +
          `3. Then resume under the rules in skills/dysflow-arnes/SKILL.md.`,
      )
    },
  }
}
