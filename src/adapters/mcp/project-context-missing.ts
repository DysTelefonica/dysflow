import { createDysflowError, type DysflowError } from "../../core/contracts/index.js";

/**
 * Issue #1867 — the error for a call that names no project context at all.
 *
 * A call is in context when it carries `cwd`, `projectRoot` or `projectId`, or when
 * resolve_project fixed a project for the session. Without any of them, the MCP
 * startup cwd decides. When the startup cwd is not a configured project, the
 * config loader's error (for example CONFIG_MISSING_ACCESS_PATH) names the wrong
 * cause, so the call fails with PROJECT_CONTEXT_MISSING instead.
 *
 * Returns undefined when the call is in context or the startup cwd is configured.
 */
export function projectContextMissingError(
  input: unknown,
  options: { sessionCwd: () => string | undefined; startupConfigured: boolean },
): DysflowError | undefined {
  if (options.startupConfigured) return undefined;
  const params =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  for (const key of ["cwd", "projectRoot", "projectId"]) {
    if (typeof params[key] === "string" && params[key] !== "") return undefined;
  }
  if (options.sessionCwd() !== undefined) return undefined;
  return createDysflowError(
    "PROJECT_CONTEXT_MISSING",
    "No project context for this call: it names no cwd, projectRoot or projectId, and no project is fixed for the session.",
    {
      remediation:
        "Pass cwd set to the worktree root, or call resolve_project with that cwd first.",
    },
  );
}
