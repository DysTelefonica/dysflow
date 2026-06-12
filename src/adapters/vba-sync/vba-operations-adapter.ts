import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import type { AccessCleanupResult } from "../../core/operations/access-operation-cleanup.js";
import {
  type AccessOperationPreflightCleanup,
  type AccessOperationPreflightCleanupResult,
  AccessOperationPreflightCleanupService,
} from "../../core/operations/access-operation-preflight.js";
import {
  type AccessOperationRegistry,
  createProjectAccessOperationRegistry,
  listRecentAccessOperations,
  resolveAccessOperationRegistry,
} from "../../core/operations/access-operation-registry.js";

export type VbaOperationsCleanupService = {
  cleanup(request: {
    operationId: string;
    accessPath: string;
    force?: boolean;
  }): Promise<OperationResult<AccessCleanupResult>>;
};

export interface VbaOperationsAdapterOptions {
  operationRegistry?: AccessOperationRegistry;
  cleanupService?: VbaOperationsCleanupService;
  preflightCleanup?: AccessOperationPreflightCleanup;
  cwd?: string;
}

export class VbaOperationsAdapter {
  private readonly operationRegistry?: AccessOperationRegistry;
  private readonly cleanupService?: VbaOperationsCleanupService;
  private readonly preflightCleanup?: AccessOperationPreflightCleanup;
  private readonly cwd: string;

  constructor(options: VbaOperationsAdapterOptions = {}) {
    this.operationRegistry = options.operationRegistry;
    this.cleanupService = options.cleanupService;
    this.preflightCleanup = options.preflightCleanup;
    this.cwd = options.cwd ?? process.cwd();
  }

  static handles(toolName: string): boolean {
    return toolName === "list_access_operations" || toolName === "cleanup_access_operation";
  }

  async execute(toolName: string, input: unknown): Promise<OperationResult<unknown>> {
    if (toolName === "list_access_operations") {
      const registry = resolveAccessOperationRegistry(this.operationRegistry, () =>
        createProjectAccessOperationRegistry({ projectRoot: this.cwd }),
      );
      const records = await listRecentAccessOperations(registry);
      return successResult(records);
    }

    if (toolName === "cleanup_access_operation") {
      if (this.cleanupService === undefined) {
        return failureResult(
          createDysflowError("CLEANUP_NOT_CONFIGURED", "Access cleanup service is not configured."),
        );
      }
      const { operationId, accessPath, force } = input as {
        operationId: string;
        accessPath?: string;
        force?: boolean;
      };
      return this.cleanupService.cleanup({
        operationId,
        accessPath: accessPath ?? "",
        force,
      });
    }

    return failureResult(
      createDysflowError(
        "TOOL_NOT_IMPLEMENTED",
        "This tool is tracked for parity but is not implemented by this service yet.",
      ),
    );
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
      await import("../process/windows-processes.js");
    return new AccessOperationPreflightCleanupService({
      registry: createProjectAccessOperationRegistry({ projectRoot }),
      processInspector: new WindowsMsAccessProcessInspector(),
      processKiller: new WindowsProcessKiller(),
      processScanner: new WindowsMsAccessProcessScanner(),
    });
  }
}
