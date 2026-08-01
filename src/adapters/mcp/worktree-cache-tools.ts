import type { WorktreeContextCache } from "../config/worktree-context-cache.js";
import {
  clearWorktreeCacheResultContract,
  registerWorktreeResultContract,
} from "./contracts/bootstrap-result-contracts.js";
import { invalidInput } from "./dispatch-common.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";
import type { DysflowMcpTool, McpToolResult } from "./result-translation.js";
import { validateInput } from "./validator.js";
import { CLEAR_WORKTREE_CACHE_SCHEMA, REGISTER_WORKTREE_SCHEMA } from "./worktree-cache-schemas.js";

export function createWorktreeCacheTools(cache: WorktreeContextCache): DysflowMcpTool[] {
  return [
    {
      name: "register_worktree",
      resultContract: registerWorktreeResultContract,
      description: `Eagerly resolve and cache one canonical Git worktree context without opening Access or changing files. ${MCP_TOOL_CONTRACTS.register_worktree.summary}`,
      inputSchema: REGISTER_WORKTREE_SCHEMA,
      handler: async (input): Promise<McpToolResult> => {
        const validation = validateInput(input, REGISTER_WORKTREE_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        const cwd = (input as { cwd: string }).cwd;
        const result = await cache.getContext(cwd, "register");
        const diagnostic = result.context.projectConfig;
        if (diagnostic.status === "outside-project-root") {
          return failure(
            "OUTSIDE_PROJECT_ROOT",
            diagnostic.diagnostics[0]?.message ?? diagnostic.status,
          );
        }
        return success({
          ok: true,
          context: contextProjection(result.context),
          cache: { status: result.status },
          telemetry: cache.telemetry(),
        });
      },
    },
    {
      name: "clear_worktree_cache",
      resultContract: clearWorktreeCacheResultContract,
      description: `Clear one canonical cwd entry or the complete bounded worktree-context cache without changing project files or Access. ${MCP_TOOL_CONTRACTS.clear_worktree_cache.summary}`,
      inputSchema: CLEAR_WORKTREE_CACHE_SCHEMA,
      handler: async (input): Promise<McpToolResult> => {
        const validation = validateInput(input, CLEAR_WORKTREE_CACHE_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        const cwd = (input as { cwd?: string }).cwd;
        return success({
          ok: true,
          cleared: cache.clear(cwd),
          scope: cwd ? "cwd" : "all",
          telemetry: cache.telemetry(),
        });
      },
    },
  ];
}

function contextProjection(
  context: Awaited<ReturnType<WorktreeContextCache["getContext"]>>["context"],
) {
  return {
    cwd: context.cwd,
    projectRoot: context.projectRoot,
    configPath: context.configPath,
    projectId: context.projectConfig.projectId,
    status: context.projectConfig.status,
    writeReady: context.projectConfig.writeReady,
    discoveredProjects: context.discoveredProjects,
    scannedAt: context.scannedAt,
    sourceHint: context.sourceHint,
  };
}

function success(value: Record<string, unknown>): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }], isError: false, ok: true };
}

function failure(code: string, message: string): McpToolResult {
  const error = { code, message, errorCode: code, errorMessage: message };
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: false, error }) }],
    isError: true,
    ok: false,
    error,
  };
}
