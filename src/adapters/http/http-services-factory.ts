import { createDysflowError, failureResult } from "../../core/contracts/index.js";
import { AccessOperationCleanupService } from "../../core/operations/access-operation-cleanup.js";
import {
  createInMemoryAccessOperationRegistry,
  createProjectAccessOperationRegistry,
} from "../../core/operations/access-operation-registry.js";
import { AccessPowerShellRunner } from "../../core/runner/access-runner.js";
import { AccessDiagnosticsService } from "../../core/services/diagnostics-service.js";
import { AccessQueryService } from "../../core/services/query-service.js";
import { AccessVbaService } from "../../core/services/vba-service.js";
import { loadDysflowConfigAsync } from "../config/dysflow-config-node.js";
import { nodeRegistryFileSystem } from "../operations/node-registry-file-system.js";
import { createDefaultPowerShellExecutor } from "../powershell/default-executor.js";
import {
  createWindowsAccessOperationPreflightCleanup,
  WindowsMsAccessProcessInspector,
  WindowsMsAccessProcessScanner,
  WindowsProcessKiller,
} from "../process/windows-processes.js";
import { nodeLockFileSystem } from "../runner/node-lock-file-system.js";
import { VbaSyncAdapter } from "../vba-sync/vba-sync-adapter.js";
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

  const operationRegistry = createProjectAccessOperationRegistry({
    ...configResult.data,
    fileSystem: nodeRegistryFileSystem,
  });
  const runner = new AccessPowerShellRunner({
    executor: createDefaultPowerShellExecutor(),
    lockFileSystem: nodeLockFileSystem,
    operationRegistry,
    preflightCleanup: createWindowsAccessOperationPreflightCleanup({
      registry: operationRegistry,
    }),
  });

  // PR1b (#621 F1) — VbaSyncAdapter carries the test_vba default-deny gate
  // (ensureTestProceduresAllowed). Creating it here so the /vba/test HTTP route
  // can route through it and get the same allowlist enforcement as MCP.
  const vbaSyncToolService = new VbaSyncAdapter({
    operationRegistry,
    cleanupService: undefined, // VBA sync operations don't need Access-level cleanup
    timeoutMs: configResult.data.timeoutMs,
    cwd: configResult.data.projectRoot ?? process.cwd(),
    env: env ?? process.env,
    accessPassword: configResult.data.accessPassword,
    // PR1b: forward allowlist so VbaExecutionAdapter can enforce the gate
    allowedProcedures: configResult.data.allowedProcedures,
  });

  return {
    diagnosticsService: new AccessDiagnosticsService({ runner, config: configResult.data }),
    queryService: new AccessQueryService({ runner, config: configResult.data }),
    vbaService: new AccessVbaService({ runner, config: configResult.data }),
    operationRegistry,
    cleanupService: new AccessOperationCleanupService({
      registry: operationRegistry,
      processInspector: new WindowsMsAccessProcessInspector(),
      processKiller: new WindowsProcessKiller(),
      processScanner: new WindowsMsAccessProcessScanner(),
    }),
    // PR1b (#621 F1): VBA sync tool service for test_vba with default-deny gate
    vbaSyncToolService,
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
    operationRegistry: createInMemoryAccessOperationRegistry(),
    // vbaSyncToolService is omitted when services are unavailable
  };
}
