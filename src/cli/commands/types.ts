import type { OperationResult } from "../../core/contracts/index.js";
import type { DysflowConfig } from "../../core/config/dysflow-config.js";
import type { AccessDiagnosticsResult } from "../../core/services/diagnostics-service.js";
import type { StartHttpAdapter } from "./serve.js";
import type { AgentName } from "./install.js";

export type CliResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};

export type TuiKey = "up" | "down" | "enter" | "space" | "q";

export type CliCommandContext = {
	env?: Record<string, string | undefined>;
	cwd?: string;
	startMcpAdapter?: (config?: DysflowConfig, options?: { writesEnabled?: boolean }) => Promise<void>;
	diagnosticsService?: {
		run(request?: {
			includeEnvironment?: boolean;
		}): Promise<OperationResult<AccessDiagnosticsResult>>;
	};
	startHttpAdapter?: StartHttpAdapter;
	runTui?: (
		args: readonly string[],
		context?: CliCommandContext,
	) => Promise<CliResult> | CliResult;
	localVersion?: string;
	latestVersion?: string;
	tuiSelectedAgents?: readonly AgentName[];
	tuiApplyIntegrationSelection?: (
		agents: readonly AgentName[],
	) => Promise<CliResult> | CliResult;
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
	"  tui     Open the Dysflow terminal UI",
	"  serve   Start local HTTP API",
].join("\n");

export type CommandHandler = (
	args: readonly string[],
	context?: CliCommandContext,
) => Promise<CliResult> | CliResult;
