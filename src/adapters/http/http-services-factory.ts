import { loadDysflowConfigAsync } from "../../core/config/dysflow-config.js";
import { createDysflowError, failureResult } from "../../core/contracts/index.js";
import { AccessOperationCleanupService } from "../../core/operations/access-operation-cleanup.js";
import {
  FileAccessOperationRegistry,
  resolveProjectOperationRegistryPath,
} from "../../core/operations/access-operation-registry.js";
import {
  WindowsMsAccessProcessInspector,
  WindowsProcessKiller,
} from "../../core/operations/windows-processes.js";
import {
  AccessPowerShellRunner,
  getDefaultAccessOperationRegistry,
} from "../../core/runner/access-runner.js";
import { AccessDiagnosticsService } from "../../core/services/diagnostics-service.js";
import { AccessQueryService } from "../../core/services/query-service.js";
import { AccessVbaService } from "../../core/services/vba-service.js";
import type { DysflowHttpServices } from "./server.js";

export async function createHttpServices(
  env?: Record<string, string | undefined>,
  cwd?: string,
): Promise<DysflowHttpServices> {
  const configResult = await loadDysflowConfigAsync({ env, cwd });
  if (!configResult.ok) {
    process.stderr.write(
      `[dysflow] HTTP server starting in degraded mode: ${configResult.error.code}: ${configResult.error.message}\n`,
    );
    return createUnavailableHttpServices();
  }

  const operationRegistry = new FileAccessOperationRegistry({
    filePath: resolveProjectOperationRegistryPath(configResult.data),
  });
  const runner = new AccessPowerShellRunner({ operationRegistry });
  return {
    diagnosticsService: new AccessDiagnosticsService({ runner, config: configResult.data }),
    queryService: new AccessQueryService({ runner, config: configResult.data }),
    vbaService: new AccessVbaService({ runner, config: configResult.data }),
    operationRegistry,
    cleanupService: new AccessOperationCleanupService({
      registry: operationRegistry,
      processInspector: new WindowsMsAccessProcessInspector(),
      processKiller: new WindowsProcessKiller(),
    }),
  };
}

export function createUnavailableHttpServices(): DysflowHttpServices {
  const unavailable = async () =>
    failureResult(
      createDysflowError(
        "SERVICE_UNAVAILABLE",
        "Service is unavailable. Check the server configuration.",
      ),
    );
  return {
    diagnosticsService: { run: unavailable },
    queryService: { execute: unavailable },
    vbaService: { execute: unavailable },
    operationRegistry: getDefaultAccessOperationRegistry(),
  };
}
