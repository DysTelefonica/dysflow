/**
 * Issue #1186 — a wrong `ACCESS_VBA_PASSWORD` used to surface as an opaque
 * `RUNNER_FAILED` carrying a raw, host-locale-dependent DAO message
 * (`Excepción al llamar a "OpenDatabase" ... "No es una contraseña válida."`).
 * Reading that required recognising a localized Access string to conclude the
 * only broken thing was an environment variable.
 *
 * The observable contract locked here: when the runner output carries the DAO
 * 3031 invalid-password signature, the runner emits the typed
 * `ACCESS_PASSWORD_INVALID` code (which the MCP dispatch seam already remaps
 * to the canonical `BINARY_PASSWORD_INVALID`) with remediation naming the
 * configured password env var — and every other runner failure keeps
 * propagating as `RUNNER_FAILED`.
 */
import { describe, expect, it } from "vitest";
import { nodeLockFileSystem } from "../../../src/adapters/runner/node-lock-file-system.js";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { AccessOperationPreflightCleanup } from "../../../src/core/operations/access-operation-preflight.js";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry.js";
import {
  AccessPowerShellRunner,
  type PowerShellExecutionResult,
  type PowerShellExecutor,
} from "../../../src/core/runner/access-runner.js";

const SPANISH_DAO_3031 =
  'Excepción al llamar a "OpenDatabase" con los argumentos "4": "No es una contraseña válida."';
const ENGLISH_DAO_3031 =
  'Exception calling "OpenDatabase" with "4" argument(s): "Not a valid password."';
/** Same failure after the PowerShell/UTF-8 boundary mangles the accents. */
const MOJIBAKE_DAO_3031 =
  'Excepci\uFFFDn al llamar a "OpenDatabase": "No es una contrase\uFFFDa v\uFFFDlida."';

const noOpPreflight: AccessOperationPreflightCleanup = {
  cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
};

function configWith(overrides: Partial<DysflowConfig> = {}): DysflowConfig {
  return {
    configSource: "explicit-request",
    allowWrites: false,
    accessDbPath: "C:/data/NoConformidades.accdb",
    accessPassword: "wrong-value",
    timeoutMs: 1_500,
    ...overrides,
  };
}

function runnerFailingWith(stderr: string): AccessPowerShellRunner {
  const executor: PowerShellExecutor = async (): Promise<PowerShellExecutionResult> => ({
    exitCode: 1,
    stdout: "",
    stderr,
    durationMs: 5,
    timedOut: false,
  });
  return new AccessPowerShellRunner({
    lockFileSystem: nodeLockFileSystem,
    executor,
    operationRegistry: new InMemoryAccessOperationRegistry(),
    operationIdFactory: () => "op-1186-password-classification",
    preflightCleanup: noOpPreflight,
    scriptPath: "C:/tools/runner.ps1",
  });
}

async function failureFrom(stderr: string, config: DysflowConfig = configWith()) {
  const result = await runnerFailingWith(stderr).run(
    { kind: "vba", request: { moduleName: "M", procedureName: "P" } },
    config,
  );
  if (result.ok) throw new Error("expected the runner invocation to fail");
  return result.error;
}

describe("AccessPowerShellRunner — invalid-password classification (#1186)", () => {
  it.each([
    ["Spanish", SPANISH_DAO_3031],
    ["English", ENGLISH_DAO_3031],
    ["mojibake", MOJIBAKE_DAO_3031],
  ])("classifies a %s DAO 3031 rejection as ACCESS_PASSWORD_INVALID", async (_locale, stderr) => {
    const error = await failureFrom(stderr);
    expect(error.code).toBe("ACCESS_PASSWORD_INVALID");
  });

  it("names the configured password env var in the remediation", async () => {
    const error = await failureFrom(
      SPANISH_DAO_3031,
      configWith({ accessPasswordEnv: "NC_FRONTEND_PWD" }),
    );
    expect(error.remediation).toContain("NC_FRONTEND_PWD");
  });

  it("falls back to ACCESS_VBA_PASSWORD when the config declares no env name", async () => {
    const error = await failureFrom(SPANISH_DAO_3031);
    expect(error.remediation).toContain("ACCESS_VBA_PASSWORD");
  });

  it("preserves the original Access diagnostic and the target path", async () => {
    const error = await failureFrom(SPANISH_DAO_3031);
    expect(error.message).toContain("OpenDatabase");
    expect(error.message).toContain("NoConformidades.accdb");
  });

  it("never echoes the configured password", async () => {
    const error = await failureFrom(
      `${SPANISH_DAO_3031} (tried wrong-value)`,
      configWith({ accessPassword: "wrong-value" }),
    );
    expect(JSON.stringify(error)).not.toContain("wrong-value");
  });

  it("leaves unrelated runner failures as RUNNER_FAILED", async () => {
    const error = await failureFrom("The system cannot find the path specified.");
    expect(error.code).toBe("RUNNER_FAILED");
  });

  it("does not misfire on a failure that merely mentions a password", async () => {
    const error = await failureFrom("Password protection is enabled on this project.");
    expect(error.code).toBe("RUNNER_FAILED");
  });
});
