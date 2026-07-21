/**
 * #1045 — `run_vba` flattens the runner's underlying PowerShell exception
 * text into a generic `RUNNER_FAILED`. The reported message contained
 * mojibake (`Excepci�n`) because the PowerShell script's
 * `[Console]::OutputEncoding` defaulted to the OEM codepage (CP1252 on
 * Western Windows) so Node.js read non-ASCII bytes as U+FFFD.
 *
 * Two layers of fix:
 *   1. PowerShell side: `scripts/dysflow-access-runner.ps1` now defines
 *      `Set-ScriptOutputEncodingUtf8` and calls it at the top, so
 *      Write-Output / ConvertTo-Json emit valid UTF-8. Pester pin lives in
 *      `scripts/tests/dysflow-access-runner.Tests.ps1`.
 *   2. Runner side (this file): the runner MUST NOT re-encode, sanitize, or
 *      mangle executor stdout/stderr text. Whatever bytes the executor
 *      returned get surfaced verbatim in the error envelope (modulo
 *      secret-redaction — see `access-runner-error-redaction.test.ts`).
 *
 * These tests pin the contract: any non-ASCII character (e.g. `Excepción`,
 * `Niño`, `Acción`) MUST round-trip through the runner unchanged, both on
 * the success path (parsed JSON) and the failure path (`RUNNER_FAILED`
 * envelope). No U+FFFD replacement character anywhere.
 */

import { describe, expect, it } from "vitest";
import { nodeLockFileSystem } from "../../../src/adapters/runner/node-lock-file-system.js";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { AccessOperationPreflightCleanup } from "../../../src/core/operations/access-operation-preflight.js";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry.js";
import {
  AccessPowerShellRunner,
  type PowerShellExecutor,
} from "../../../src/core/runner/access-runner.js";

const config: DysflowConfig = {
  configSource: "explicit-request",
  allowWrites: false,
  accessDbPath: "C:/data/expedientes.accdb",
  accessPassword: "irrelevant-secret",
  backendPassword: "irrelevant-backend",
  timeoutMs: 5_000,
};

const noOpPreflight: AccessOperationPreflightCleanup = {
  cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
};

describe("AccessPowerShellRunner — Unicode preservation end-to-end (#1045)", () => {
  it("Test 3 — preserves Excepción and other non-ASCII characters from executor stderr in RUNNER_FAILED message (no mojibake)", async () => {
    const unicodeStderr =
      'Excepción al llamar a "Run" con los argumentos "31": "EXPEDIENTES no encuentra el procedimiento \'DumpWhereForTest\'."';
    const executor: PowerShellExecutor = async () => ({
      exitCode: 1,
      stdout: "",
      stderr: unicodeStderr,
      durationMs: 5,
      timedOut: false,
    });

    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      operationRegistry: new InMemoryAccessOperationRegistry(),
      operationIdFactory: () => "op-1045-failed-unicode",
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/scripts/dysflow-access-runner.ps1",
    });

    const result = await runner.run(
      {
        kind: "vba",
        request: { moduleName: "EXPEDIENTES", procedureName: "DumpWhereForTest", arguments: [] },
      },
      config,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a RUNNER_FAILED failure");
    expect(result.error.code).toBe("RUNNER_FAILED");
    // No U+FFFD replacement character anywhere in the surfaced message.
    expect(result.error.message).not.toContain("\uFFFD");
    // Verbatim preservation of the original Unicode text.
    expect(result.error.message).toContain("Excepción");
    expect(result.error.message).toContain("DumpWhereForTest");
    expect(result.error.message).toContain("EXPEDIENTES");
    // The Spanish inverted marks, accented letters, and quotation marks MUST
    // round-trip exactly as the executor emitted them.
    expect(result.error.message).toContain('"Run"');
    expect(result.error.message).toContain('"31"');
  });

  it("Test 3 — preserves Unicode text in success-path stdout JSON too (no mojibake on the parsed data)", async () => {
    const unicodeReturnValue = "Niño – Año – Acción";
    const executor: PowerShellExecutor = async () => ({
      exitCode: 0,
      stdout: `DYSFLOW_RESULT ${JSON.stringify({ returnValue: unicodeReturnValue })}`,
      stderr: "",
      durationMs: 5,
      timedOut: false,
    });

    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      operationRegistry: new InMemoryAccessOperationRegistry(),
      operationIdFactory: () => "op-1045-success-unicode",
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/scripts/dysflow-access-runner.ps1",
    });

    const result = await runner.run(
      { kind: "vba", request: { moduleName: "M", procedureName: "P", arguments: [] } },
      config,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ returnValue: unicodeReturnValue });
      // Belt-and-suspenders: explicit assertion against the exact codepoints.
      expect(JSON.stringify(result.data)).toContain(unicodeReturnValue);
    }
  });

  it("Test 4 (no-regression) — preserves the RUNNER_FAILED taxonomy for genuine PowerShell/Access failures (no reclassification)", async () => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: 2,
      stdout: "",
      stderr: "Cannot open database: archivo en uso exclusivo",
      durationMs: 4,
      timedOut: false,
    });

    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
      executor,
      operationRegistry: new InMemoryAccessOperationRegistry(),
      operationIdFactory: () => "op-1045-genuine-failure",
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/scripts/dysflow-access-runner.ps1",
    });

    const result = await runner.run(
      { kind: "vba", request: { moduleName: "M", procedureName: "P", arguments: [] } },
      config,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected RUNNER_FAILED");
    expect(result.error.code).toBe("RUNNER_FAILED");
    expect(result.error.retryable).toBe(false);
    expect(result.error.message).toContain("exit code 2");
    expect(result.error.message).toContain("archivo en uso exclusivo");
    expect(result.error.message).not.toContain("\uFFFD");
  });
});
