/**
 * #1440 — full-chain test that exercises the production wiring: a real
 * file on disk, the actual `nodeVbaSourceResolver`, and the
 * `AccessVbaService` preflight wired together. Catches regressions the
 * lean in-memory tests miss (e.g. a stale service cache, a path
 * divergence between the resolver and the parser, or a wiring break in
 * `createConfiguredServices`).
 *
 * Cost: a few ms of real fs I/O, no Access, no PowerShell. The full
 * Access roundtrip lives in
 * `test/e2e/run-vba-procedure-exists-after-import-1448.e2e.test.ts`.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNodeVbaSourceResolver } from "../../../src/adapters/services/node-vba-source-resolver.js";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { OperationResult } from "../../../src/core/contracts/index.js";
import type {
  AccessRunner,
  AccessRunnerOperation,
} from "../../../src/core/runner/access-runner.js";
import { AccessVbaService } from "../../../src/core/services/vba-service.js";

const config: DysflowConfig = {
  configSource: "explicit-request",
  allowWrites: true,
  accessDbPath: "C:/data/procedural-import.accdb",
  accessPassword: "irrelevant-secret",
  backendPassword: "irrelevant-backend",
  timeoutMs: 30_000,
};

const freshModuleSource = [
  'Attribute VB_Name = "modDiagnosticoMigracionTbCambiosParaPublicacion"',
  "Option Compare Database",
  "Option Explicit",
  "",
  "Public Function DumpSchema() As String",
  '    DumpSchema = "ok"',
  "End Function",
].join("\r\n");

class RecordingRunner implements AccessRunner {
  public callCount = 0;
  public lastOperation: AccessRunnerOperation | undefined;

  constructor(private readonly nextResult: OperationResult<unknown> = defaultResult()) {}

  async run<TData>(operation: AccessRunnerOperation): Promise<OperationResult<TData>> {
    this.callCount += 1;
    this.lastOperation = operation;
    return this.nextResult as OperationResult<TData>;
  }

  async runProbe<TData>(): Promise<OperationResult<TData>> {
    throw new Error("RecordingRunner.runProbe: not used by these tests");
  }
}

function defaultResult(): OperationResult<unknown> {
  return {
    ok: true,
    data: { returnValue: "ok" },
    diagnostics: [],
    durationMs: 5,
  };
}

describe("#1440 — full chain: disk file → nodeVbaSourceResolver → AccessVbaService preflight", () => {
  let destinationRoot: string;

  beforeEach(async () => {
    destinationRoot = await mkdtemp(join(tmpdir(), "dysflow-1448-chain-"));
    await mkdir(join(destinationRoot, "modules"), { recursive: true });
  });

  afterEach(async () => {
    if (destinationRoot) await rm(destinationRoot, { recursive: true, force: true });
  });

  it("a freshly-imported module file is accepted by the preflight", async () => {
    await writeFile(
      join(destinationRoot, "modules", "modDiagnosticoMigracionTbCambiosParaPublicacion.bas"),
      freshModuleSource,
      "utf8",
    );

    const runner = new RecordingRunner();
    const service = new AccessVbaService({
      runner,
      config: { ...config, destinationRoot },
      sourceResolver: createNodeVbaSourceResolver(destinationRoot),
    });

    const result = await service.execute({
      moduleName: "",
      procedureName: "modDiagnosticoMigracionTbCambiosParaPublicacion.DumpSchema",
    });

    expect(result.ok).toBe(true);
    expect(runner.callCount).toBe(1);
  });

  it("two consecutive run_vba calls on the same module — neither returns PROCEDURE_NOT_FOUND", async () => {
    await writeFile(
      join(destinationRoot, "modules", "modDiagnosticoMigracionTbCambiosParaPublicacion.bas"),
      freshModuleSource,
      "utf8",
    );

    const runner = new RecordingRunner();
    const service = new AccessVbaService({
      runner,
      config: { ...config, destinationRoot },
      sourceResolver: createNodeVbaSourceResolver(destinationRoot),
    });

    const first = await service.execute({
      moduleName: "",
      procedureName: "modDiagnosticoMigracionTbCambiosParaPublicacion.DumpSchema",
    });
    const second = await service.execute({
      moduleName: "",
      procedureName: "modDiagnosticoMigracionTbCambiosParaPublicacion.DumpSchema",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(runner.callCount).toBe(2);
  });

  it("multi-module scenario: two modules on disk, run_vba resolves the right one", async () => {
    const secondModule = [
      'Attribute VB_Name = "modOtroHelper"',
      "Option Compare Database",
      "Option Explicit",
      "",
      "Public Function OtherProc() As String",
      '    OtherProc = "ok"',
      "End Function",
    ].join("\r\n");
    await writeFile(
      join(destinationRoot, "modules", "modDiagnosticoMigracionTbCambiosParaPublicacion.bas"),
      freshModuleSource,
      "utf8",
    );
    await writeFile(join(destinationRoot, "modules", "modOtroHelper.bas"), secondModule, "utf8");

    const runner = new RecordingRunner();
    const service = new AccessVbaService({
      runner,
      config: { ...config, destinationRoot },
      sourceResolver: createNodeVbaSourceResolver(destinationRoot),
    });

    const a = await service.execute({
      moduleName: "",
      procedureName: "modDiagnosticoMigracionTbCambiosParaPublicacion.DumpSchema",
    });
    const b = await service.execute({
      moduleName: "",
      procedureName: "modOtroHelper.OtherProc",
    });

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(runner.callCount).toBe(2);
  });
});
