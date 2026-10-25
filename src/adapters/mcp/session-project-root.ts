/**
 * Issue #1867 — the project the MCP session fixed with `resolve_project`.
 *
 * Resolution order for a call: explicit `cwd` / `projectRoot` on the call, then
 * this session project, then the MCP startup cwd. Without this holder, a call
 * that follows a successful `resolve_project` but carries no `cwd` falls back to
 * the startup worktree and fails with an unrelated `MODULE_NOT_FOUND`.
 *
 * Process-local and per MCP server instance. `resolve_project` sets it on a
 * resolved outcome and `clearResolution` clears it.
 */
export type SessionProjectRoot = {
  get(): string | undefined;
  set(projectRoot: string): void;
  clear(): void;
};

export function createSessionProjectRoot(): SessionProjectRoot {
  let current: string | undefined;
  return {
    get: () => current,
    set: (projectRoot) => {
      current = projectRoot;
    },
    clear: () => {
      current = undefined;
    },
  };
}
