import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../contracts/index.js";
import type { AccessOperationRegistry } from "./access-operation-registry.js";

export type OsProcessInfo = {
  pid: number;
  name: string;
  startTime: string;
  commandLine?: string;
};

export type ProcessInspector = {
  getProcess(pid: number): Promise<OsProcessInfo | undefined>;
};

export type ProcessKiller = {
  kill(pid: number): Promise<void>;
};

export type ProcessScanner = {
  listProcesses(): Promise<OsProcessInfo[]>;
};

export type AccessCleanupResult = {
  operationId: string;
  accessPid: number;
  status: "cleaned";
};

const ELIGIBLE_STATUSES = new Set(["timed_out", "failed", "cleanup_pending"]);

export class AccessOperationCleanupService {
  constructor(
    private readonly options: {
      registry: AccessOperationRegistry;
      processInspector: ProcessInspector;
      processKiller: ProcessKiller;
    },
  ) {}

  async cleanup(request: {
    operationId: string;
    accessPath: string;
    force?: boolean;
  }): Promise<OperationResult<AccessCleanupResult>> {
    const record = await this.options.registry.get(request.operationId);
    if (record === undefined) {
      return failureResult(
        createDysflowError(
          "CLEANUP_OPERATION_NOT_FOUND",
          `Operation ${request.operationId} was not found.`,
        ),
      );
    }

    if (record.accessPath.toLowerCase() !== request.accessPath.toLowerCase()) {
      return failureResult(
        createDysflowError(
          "CLEANUP_ACCESS_PATH_MISMATCH",
          "Cleanup refused because accessPath does not match the registered operation.",
        ),
      );
    }

    if (
      record.accessPid === null ||
      record.processStartTime === null ||
      record.status === "pid_unknown" ||
      record.status === "running_untracked"
    ) {
      return failureResult(
        createDysflowError(
          "CLEANUP_PID_UNKNOWN",
          "Cleanup refused because the operation has no owned Access PID.",
        ),
      );
    }

    if (!request.force && !ELIGIBLE_STATUSES.has(record.status)) {
      return failureResult(
        createDysflowError(
          "CLEANUP_STATUS_NOT_ELIGIBLE",
          `Cleanup refused for operation status ${record.status}.`,
        ),
      );
    }

    const process = await this.options.processInspector.getProcess(record.accessPid);
    if (process === undefined) {
      return failureResult(
        createDysflowError(
          "CLEANUP_PROCESS_NOT_FOUND",
          `Process ${record.accessPid} no longer exists.`,
        ),
      );
    }

    if (process.name.toUpperCase() !== "MSACCESS.EXE") {
      return failureResult(
        createDysflowError(
          "CLEANUP_PROCESS_NAME_MISMATCH",
          `Cleanup refused because PID ${record.accessPid} is ${process.name}.`,
        ),
      );
    }

    if (process.startTime !== record.processStartTime) {
      return failureResult(
        createDysflowError(
          "CLEANUP_PROCESS_START_TIME_MISMATCH",
          "Cleanup refused because processStartTime differs from the registry.",
        ),
      );
    }

    const commandLine = process.commandLine ?? record.commandLine ?? "";
    if (
      commandLine.length > 0 &&
      !commandLine.toLowerCase().includes(record.accessPath.toLowerCase())
    ) {
      return failureResult(
        createDysflowError(
          "CLEANUP_COMMAND_LINE_MISMATCH",
          "Cleanup refused because commandLine is not compatible with the registered Access path.",
        ),
      );
    }

    await this.options.processKiller.kill(record.accessPid);
    await this.options.registry.update(record.operationId, {
      status: "cleaned",
      updatedAt: new Date().toISOString(),
    });
    return successResult({
      operationId: record.operationId,
      accessPid: record.accessPid,
      status: "cleaned",
    });
  }
}
