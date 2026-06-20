/**
 * Verification guard for the MCP review finding about accessPassword redaction.
 *
 * The MCP dispatch layer passes only `backendPassword` as an explicit in-scope
 * secret to sanitizeMcpErrorMessage (dispatch-factory.ts, query-maintenance
 * branch). A review flagged that `accessPassword` is never passed there and
 * asked whether it could leak through an error message.
 *
 * It cannot: the AccessPowerShellRunner owns the accessPassword and redacts it
 * from EVERY error message at the source (secrets = [accessPassword,
 * backendPassword]), before any failureResult leaves the runner — and the value
 * travels to PowerShell via env only, never via argv. This test locks that
 * primary defense for the RUNNER_FAILED path (the gap not covered by the #417
 * marker-sanitization test, which only exercises the registry commandLine path).
 *
 * Because this passes, the MCP-layer asymmetry is verified-safe, not a defect —
 * see the comment in src/adapters/mcp/dispatch-factory.ts.
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
};

const noOpPreflight: AccessOperationPreflightCleanup = {
  cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
};

describe("AccessPowerShellRunner — accessPassword redaction in error output", () => {
  it("redacts accessPassword from a RUNNER_FAILED error message", async () => {
    // Executor simulates a failed run whose stderr echoes the configured password.
    const executor: PowerShellExecutor = async (): Promise<PowerShellExecutionResult> => ({
      exitCode: 1,
      stdout: "",
      stderr: `Cannot open database: password ${SECRET} rejected by the Access engine`,
      durationMs: 5,
      timedOut: false,
    });

    const runner = new AccessPowerShellRunner({
      executor,
      operationRegistry: new InMemoryAccessOperationRegistry(),
      operationIdFactory: () => "op-runner-failed-redaction",
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/runner.ps1",
    });

    const result = await runner.run(
      { kind: "vba", request: { moduleName: "M", procedureName: "P" } },
      config,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a RUNNER_FAILED failure");
    expect(result.error.message).not.toContain(SECRET);
    expect(result.error.message).toContain(REDACTED_SECRET);
  });
});
