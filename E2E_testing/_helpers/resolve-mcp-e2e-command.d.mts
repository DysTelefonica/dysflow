// Type declarations for E2E_testing/_helpers/resolve-mcp-e2e-command.mjs.
// The helper is plain ESM JavaScript; this file gives the Vitest test
// (and any other TS consumer) a typed surface without compiling the .mjs.

export type ResolveMcpE2eCommandSource = "env-override" | "test-runtime";

export type ResolveMcpE2eCommandFailureCode =
  | "MCP_E2E_OVERRIDE_NOT_FOUND"
  | "MCP_E2E_REFUSES_PRODUCTION_RUNTIME"
  | "MCP_E2E_NO_RUNTIME_AVAILABLE";

export type ResolveMcpE2eCommandSuccess = {
  ok: true;
  command: string;
  source: ResolveMcpE2eCommandSource;
};

export type ResolveMcpE2eCommandFailure = {
  ok: false;
  code: ResolveMcpE2eCommandFailureCode;
  message: string;
  candidates: string[];
};

export type ResolveMcpE2eCommandResult =
  | ResolveMcpE2eCommandSuccess
  | ResolveMcpE2eCommandFailure;

export type ResolveMcpE2eCommandOptions = {
  env: Record<string, string | undefined>;
  repoRoot: string;
  fs?: { existsSync: (path: string) => boolean };
};

export function resolveMcpE2eCommand(
  options: ResolveMcpE2eCommandOptions,
): ResolveMcpE2eCommandResult;

export function isProductionRuntimePath(candidatePath: string): boolean;
