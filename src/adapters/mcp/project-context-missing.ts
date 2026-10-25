import { createDysflowError, type DysflowError } from "../../core/contracts/index.js";

/**
 * Startup errors that mean "there is no project at the MCP startup cwd". Only these
 * are replaced by PROJECT_CONTEXT_MISSING; other startup errors (a broken config, a
 * stale target) keep their own cause and their own contracts.
 */
const NO_PROJECT_STARTUP_CODES: ReadonlySet<string> = new Set([
  "CONFIG_MISSING_ACCESS_PATH",
  "CONFIG_PROJECT_FILE_NOT_FOUND",
]);

/**
 * Issue #1867 — the error for a call that names no project context.
 *
 * A call is in context when it carries `cwd`, `projectRoot` or `projectId`, or when
 * resolve_project fixed a project for the session. Without any of them the MCP
 * startup cwd decides; when that cwd holds no project, the config loader's error
 * (CONFIG_MISSING_ACCESS_PATH) names the wrong cause, so the call fails with
 * PROJECT_CONTEXT_MISSING and a remediation instead.
 *
 * Returns undefined when the call is in context or the startup error has another cause.
 */
export function projectContextMissingError(
  input: unknown,
  options: { sessionCwd: () => string | undefined; startupError?: { code: string } },
): DysflowError | undefined {
  if (
    options.startupError === undefined ||
    !NO_PROJECT_STARTUP_CODES.has(options.startupError.code)
  ) {
    return undefined;
  }
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
