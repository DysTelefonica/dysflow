import type { DysflowConfig } from "../../core/config/dysflow-config.js";
import type { OperationResult } from "../../core/contracts/index.js";
import type { AccessDiagnosticsResult } from "../../core/services/diagnostics-service.js";
import type { AccessQueryService } from "../../core/services/query-service.js";
import type { AgentName } from "./install-utils.js";
import type { McpWiringCheck } from "./opencode-mcp-wiring.js";
import type { StartHttpAdapter } from "./serve.js";

export type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type TuiKey = "up" | "down" | "enter" | "space" | "q";

export type CliCommandContext = {
  env?: Record<string, string | undefined>;
  cwd?: string;
  startMcpAdapter?: (
    config?: DysflowConfig,
    options?: { writesEnabled?: boolean },
  ) => Promise<void>;
  diagnosticsService?: {
    run(request?: {
      includeEnvironment?: boolean;
    }): Promise<OperationResult<AccessDiagnosticsResult>>;
  };
  /** Injectable for testing doctor's OpenCode MCP wiring check. */
  checkMcpWiring?: () => Promise<McpWiringCheck | null>;
  accessQueryService?: Pick<AccessQueryService, "execute">;
  startHttpAdapter?: StartHttpAdapter;
  runTui?: (args: readonly string[], context?: CliCommandContext) => Promise<CliResult> | CliResult;
  localVersion?: string;
  latestVersion?: string;
  tuiSelectedAgents?: readonly AgentName[];
  tuiApplyIntegrationSelection?: (agents: readonly AgentName[]) => Promise<CliResult> | CliResult;
  tuiInteractive?: boolean;
  readTuiKey?: () => Promise<TuiKey>;
  writeTuiFrame?: (frame: string) => void;
};

export const HELP_TEXT = [
  "Usage: dysflow [command]",
  "",
  "Default:",
  "  dysflow Open the Dysflow terminal UI dashboard",
  "",
  "Commands:",
  "  mcp     Start the MCP stdio adapter",
  "  setup   Prepare local Dysflow configuration",
  "  doctor  Check local Dysflow requirements",
  "  install Run Dysflow installer (interactive MCP wiring + runtime copy)",
  "  update  Reinstall runtime when source version is newer",
  "  uninstall Run Dysflow uninstaller (revert integrations + clean runtime)",
  "  tui     Open the Dysflow terminal UI",
  "  serve   Start local HTTP API",
  "  access  Batch Access database operations (e.g. relink-directory)",
].join("\n");

export type CommandHandler = (
  args: readonly string[],
  context?: CliCommandContext,
) => Promise<CliResult> | CliResult;
