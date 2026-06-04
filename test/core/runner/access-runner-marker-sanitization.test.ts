/**
 * Behavior tests for marker payload sanitization (#417).
 *
 * Secrets present in ACCESS_PROCESS marker fields (commandLine, etc.) must be
 * redacted BEFORE the value is stored in the operation registry, so they never
 * surface through list_access_operations or any registry read.
 *
 * The test port: PowerShellExecutor (the I/O boundary). We inject a mock
 * executor that simulates the real spawnPowerShell behavior — calling
 * onAccessProcessCaptured with a parsed marker payload whose commandLine
 * contains a known secret. We then assert that the registry record stores
 * "[REDACTED]", not the raw secret.
 */
import { describe, expect, it } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { AccessOperationPreflightCleanup } from "../../../src/core/operations/access-operation-preflight.js";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry.js";
import {
  AccessPowerShellRunner,
  type PowerShellExecutionResult,
  type PowerShellExecutor,
} from "../../../src/core/runner/access-runner.js";
import { REDACTED_SECRET } from "../../../src/core/utils/index.js";

const SECRET = "p@$$w0rd-very-secret";

const config: DysflowConfig = {
  configSource: "explicit-request",
  allowWrites: false,
  accessDbPath: "C:/data/app.accdb",
  accessPassword: SECRET,
  timeoutMs: 1_500,
  processTimeoutMs: 1_500,
};

const noOpPreflight: AccessOperationPreflightCleanup = {
  cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
};

describe("AccessPowerShellRunner — marker payload sanitization (#417)", () => {
  it("redacts secrets in commandLine before storing the ACCESS_PROCESS marker in the registry", async () => {
    const registry = new InMemoryAccessOperationRegistry();

    /**
     * This executor simulates the real spawnPowerShell parse path:
     * it calls onAccessProcessCaptured with a marker payload whose commandLine
     * contains the configured secret in plain text — exactly what would happen
     * if a PS script echoed "DYSFLOW_ACCESS_PROCESS {"pid":42,...,"commandLine":"...p@$$w0rd..."}"
     * to stderr.
     */
    const executor: PowerShellExecutor = async (
      _command,
      _args,
      options,
    ): Promise<PowerShellExecutionResult> => {
      await options.onAccessProcessCaptured({
        pid: 42,
        processStartTime: "2026-06-01T00:00:00.000Z",
        // commandLine contains the raw secret — simulates a PS marker with a password arg
        commandLine: `MSACCESS.EXE "C:/data/app.accdb" /password ${SECRET}`,
      });
      return {
        exitCode: 0,
        stdout: '{"returnValue":null}',
        stderr: "",
        durationMs: 5,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
      executor,
      operationRegistry: registry,
      operationIdFactory: () => "op-redact-test",
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/runner.ps1",
    });

    await runner.run(
      { kind: "vba", request: { moduleName: "M", procedureName: "P" } },
      config,
    );

    // The registry record for a completed op is purged from InMemory (parity with FileRegistry).
    // We need to intercept the update call. Instead, use a registry that persists completed records.
    // Alternatively, assert on the operation metadata returned in the result.
    // The result.operation is the AccessOperationMetadata (no commandLine field).
    // We need to check what was stored DURING the running phase.
    //
    // Strategy: spy on the registry's update method to capture what commandLine was stored.
    const capturedUpdates: Array<{ commandLine?: string }> = [];
    const spyRegistry = new InMemoryAccessOperationRegistry();
    const origUpdate = spyRegistry.update.bind(spyRegistry);
    spyRegistry.update = async (id, patch) => {
      capturedUpdates.push({ commandLine: patch.commandLine });
      return origUpdate(id, patch);
    };

    const runner2 = new AccessPowerShellRunner({
      executor,
      operationRegistry: spyRegistry,
      operationIdFactory: () => "op-redact-test-2",
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/runner.ps1",
    });

    await runner2.run(
      { kind: "vba", request: { moduleName: "M", procedureName: "P" } },
      config,
    );

    // Find the update that stored the commandLine (from onAccessProcessCaptured)
    const markerUpdate = capturedUpdates.find((u) => u.commandLine !== undefined);
    expect(markerUpdate).toBeDefined();

    // The stored commandLine must NOT contain the raw secret
    expect(markerUpdate?.commandLine).not.toContain(SECRET);

    // The stored commandLine MUST contain the redaction placeholder
    expect(markerUpdate?.commandLine).toContain(REDACTED_SECRET);
  });

  it("does not modify commandLine when no secrets are configured", async () => {
    const configNoSecrets: DysflowConfig = {
      configSource: "explicit-request",
      allowWrites: false,
      accessDbPath: "C:/data/app.accdb",
      timeoutMs: 1_500,
      processTimeoutMs: 1_500,
    };

    const capturedUpdates: Array<{ commandLine?: string }> = [];
    const spyRegistry = new InMemoryAccessOperationRegistry();
    const origUpdate = spyRegistry.update.bind(spyRegistry);
    spyRegistry.update = async (id, patch) => {
      capturedUpdates.push({ commandLine: patch.commandLine });
      return origUpdate(id, patch);
    };

    const plainCommandLine = 'MSACCESS.EXE "C:/data/app.accdb"';
    const executor: PowerShellExecutor = async (
      _command,
      _args,
      options,
    ): Promise<PowerShellExecutionResult> => {
      await options.onAccessProcessCaptured({
        pid: 99,
        processStartTime: "2026-06-01T00:00:00.000Z",
        commandLine: plainCommandLine,
      });
      return {
        exitCode: 0,
        stdout: '{"returnValue":null}',
        stderr: "",
        durationMs: 5,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
      executor,
      operationRegistry: spyRegistry,
      operationIdFactory: () => "op-no-secrets",
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/runner.ps1",
    });

    await runner.run(
      { kind: "vba", request: { moduleName: "M", procedureName: "P" } },
      configNoSecrets,
    );

    const markerUpdate = capturedUpdates.find((u) => u.commandLine !== undefined);
    expect(markerUpdate).toBeDefined();
    // Without secrets, commandLine is stored as-is
    expect(markerUpdate?.commandLine).toBe(plainCommandLine);
  });
});
