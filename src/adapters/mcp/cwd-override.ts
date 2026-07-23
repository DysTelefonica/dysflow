import { existsSync, statSync } from "node:fs";
import path from "node:path";
import type { McpToolResult } from "./result-translation.js";

/**
 * Issue #1057 (F10) — per-call `cwd` override for project-scoped read
 * tools (`resolve_project`, `diagnose`, `state`, `logs`).
 *
 * The MCP factories capture `cwd` once at construction (stdio starts
 * with `process.cwd()`), which forced consumers operating on sibling
 * worktrees to restart the MCP. The override contract:
 *
 *   - absent → factory cwd, behavior unchanged (backwards compatible).
 *   - present → must be an existing directory containing a
 *     `.dysflow/project.json`; anything else is rejected with
 *     `MCP_INPUT_INVALID` and a "not a dysflow project" hint.
 *
 * Write tools are intentionally OUT of scope: they already accept
 * explicit per-call `projectRoot` / `accessPath` overrides through the
 * project-context params.
 */
export const CWD_OVERRIDE_SCHEMA_PROP = {
  type: "string",
  description:
    "Optional per-call override of the factory cwd (#1057 F10). Must be an existing directory containing a valid .dysflow/project.json — lets one MCP session target a sibling worktree without a restart. Omit to use the cwd the MCP was started from.",
} as const;

export type CwdOverrideResolution = { ok: true; cwd: string } | { ok: false; error: McpToolResult };

/**
 * Resolve the effective cwd for a handler: the validated `input.cwd`
 * override when present, else the factory cwd.
 */
export function resolveCwdOverride(input: unknown, factoryCwd: string): CwdOverrideResolution {
  const params =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const override =
    typeof params.cwd === "string" && params.cwd.trim().length > 0 ? params.cwd.trim() : undefined;
  if (override === undefined) return { ok: true, cwd: factoryCwd };

  const resolved = path.resolve(override);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    return { ok: false, error: cwdOverrideInvalid(`${resolved} is not an existing directory`) };
  }
  const projectJson = path.join(resolved, ".dysflow", "project.json");
  if (!existsSync(projectJson)) {
    return {
      ok: false,
      error: cwdOverrideInvalid(
        `${resolved} is not a dysflow project (missing .dysflow/project.json)`,
      ),
    };
  }
  return { ok: true, cwd: resolved };
}

function cwdOverrideInvalid(reason: string): McpToolResult {
  const message = `cwd override rejected: ${reason}. Pass the root of a worktree that contains .dysflow/project.json, or omit cwd to use the MCP's startup directory.`;
  return {
    content: [{ type: "text", text: `MCP_INPUT_INVALID: ${message}` }],
    isError: true,
    ok: false,
    error: { code: "MCP_INPUT_INVALID", message },
  };
}
