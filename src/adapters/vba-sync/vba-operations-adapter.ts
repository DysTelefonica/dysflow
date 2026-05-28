import {
  createDysflowError,
  failureResult,
  type OperationResult,
} from "../../core/contracts/index.js";
import {
  type AccessOperationPreflightCleanup,
  type AccessOperationPreflightCleanupResult,
  AccessOperationPreflightCleanupService,
} from "../../core/operations/access-operation-preflight.js";
import {
  FileAccessOperationRegistry,
  resolveProjectOperationRegistryPath,
} from "../../core/operations/access-operation-registry.js";

const TOOL_NOT_IMPLEMENTED_MESSAGE =
  "This tool is tracked for parity but is not implemented by this service yet.";

export interface VbaOperationsAdapterOptions {
  preflightCleanup?: AccessOperationPreflightCleanup;
  cwd?: string;
}

export class VbaOperationsAdapter {
  private readonly preflightCleanup?: AccessOperationPreflightCleanup;
  private readonly cwd: string;

  constructor(options: VbaOperationsAdapterOptions = {}) {
    this.preflightCleanup = options.preflightCleanup;
    this.cwd = options.cwd ?? process.cwd();
  }

  static handles(toolName: string): boolean {
    return toolName === "list_access_operations" || toolName === "cleanup_access_operation";
  }

  async execute(_toolName: string, _input: unknown): Promise<OperationResult<unknown>> {
    return failureResult(createDysflowError("TOOL_NOT_IMPLEMENTED", TOOL_NOT_IMPLEMENTED_MESSAGE));
  }

  async runPreflightCleanup(target: {
    accessPath?: string;
    projectRoot?: string;
  }): Promise<AccessOperationPreflightCleanupResult> {
    if (target.accessPath === undefined)
      return { cleaned: [], killed: [], orphanedKilled: [], errors: [] };
    const projectRoot = target.projectRoot ?? this.cwd;
    try {
      const cleanup =
        this.preflightCleanup ?? (await this.createDefaultPreflightCleanup(projectRoot));
      return await cleanup.cleanup({ accessPath: target.accessPath, projectRoot });
    } catch (error) {
      return {
        cleaned: [],
        killed: [],
        orphanedKilled: [],
        errors: [
          {
            operationId: "preflight",
            message: `Pre-flight cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  private async createDefaultPreflightCleanup(
    projectRoot: string,
  ): Promise<AccessOperationPreflightCleanup> {
    const { WindowsMsAccessProcessInspector, WindowsMsAccessProcessScanner, WindowsProcessKiller } =
      await import("../../core/operations/windows-processes.js");
    return new AccessOperationPreflightCleanupService({
      registry: new FileAccessOperationRegistry({
        filePath: resolveProjectOperationRegistryPath({ projectRoot }),
      }),
      processInspector: new WindowsMsAccessProcessInspector(),
      processKiller: new WindowsProcessKiller(),
      processScanner: new WindowsMsAccessProcessScanner(),
    });
  }
}
