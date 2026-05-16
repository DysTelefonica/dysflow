import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { failureResult } from "../../../src/core/contracts/index";
import { VbaSyncLegacyService, resolveDefaultVbaManagerScriptPath, type VbaManagerExecutor } from "../../../src/core/services/vba-sync-legacy-service";

describe("VbaSyncLegacyService", () => {
  it("rejects Access-touching legacy tools when only a stale session/env Access path is available", async () => {
    const calls: unknown[] = [];
    const service = new VbaSyncLegacyService({
      executor: async (request) => {
        calls.push(request);
        return { exitCode: 0, stdout: "{}", stderr: "", durationMs: 1 };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: {
        DYSFLOW_ACCESS_DB_PATH: "C:/Proyectos/dysflow/NoConformidades.accdb",
        ACCESS_VBA_PASSWORD: "env-secret",
      },
      cwd: "C:/00repos/codigo/00_GESTION_RIESGOS_develop",
    });

    await expect(service.execute("import_modules", {
      destinationRoot: "C:/00repos/codigo/00_GESTION_RIESGOS_develop",
      moduleNames: ["Test_ManifestContracts"],
      importMode: "Code",
    })).resolves.toMatchObject({
      ok: false,
      error: { code: "ACCESS_PATH_REQUIRED" },
    });
    expect(calls).toEqual([]);
  });

  it("rejects explicit Access paths outside the declared project root before invoking Access", async () => {
    const calls: unknown[] = [];
    const service = new VbaSyncLegacyService({
      executor: async (request) => {
        calls.push(request);
        return { exitCode: 0, stdout: "{}", stderr: "", durationMs: 1 };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: { ACCESS_VBA_PASSWORD: "env-secret" },
      cwd: "C:/00repos/codigo/00_GESTION_RIESGOS_develop",
    });

    await expect(service.execute("run_vba", {
      accessPath: "C:/Proyectos/dysflow/NoConformidades.accdb",
      projectRoot: "C:/00repos/codigo/00_GESTION_RIESGOS_develop",
      procedureName: "Smoke",
    })).resolves.toMatchObject({
      ok: false,
      error: { code: "ACCESS_PATH_PROJECT_MISMATCH" },
    });
    expect(calls).toEqual([]);
  });

  it("supports explicit safe import_modules calls and resolves password only from ACCESS_VBA_PASSWORD", async () => {
    const calls: unknown[] = [];
    const service = new VbaSyncLegacyService({
      executor: async (request) => {
        calls.push(request);
        return { exitCode: 0, stdout: '{"ok":true}', stderr: "", durationMs: 2 };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: {
        ACCESS_VBA_PASSWORD: "env-secret",
        DYSFLOW_ACCESS_PASSWORD: "legacy-secret",
      },
      cwd: "C:/00repos/codigo/00_GESTION_RIESGOS_develop",
    });

    await expect(service.execute("import_modules", {
      accessPath: "C:/00repos/codigo/00_GESTION_RIESGOS_develop/Gestion_Riesgos.accdb",
      destinationRoot: "C:/00repos/codigo/00_GESTION_RIESGOS_develop",
      projectRoot: "C:/00repos/codigo/00_GESTION_RIESGOS_develop",
      moduleNames: ["Test_ManifestContracts"],
      importMode: "Code",
    })).resolves.toMatchObject({ ok: true, data: { ok: true } });

    expect(calls).toEqual([expect.objectContaining({
      action: "Import",
      accessPath: "C:/00repos/codigo/00_GESTION_RIESGOS_develop/Gestion_Riesgos.accdb",
      destinationRoot: "C:/00repos/codigo/00_GESTION_RIESGOS_develop",
      moduleNames: ["Test_ManifestContracts"],
      password: "env-secret",
      extra: { importMode: "Code" },
    })]);
  });

  it("supports explicit safe test_vba calls with testsPath, procedureName, compile and reuseInstance", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-safe-tests-"));
    await mkdir(join(root, "tests"), { recursive: true });
    await writeFile(join(root, "tests", "tests.vba.json"), JSON.stringify([{ procedure: "Test_ManifestContracts", args: [] }]), "utf8");
    const calls: unknown[] = [];
    const service = new VbaSyncLegacyService({
      executor: async (request) => {
        calls.push(request);
        return { exitCode: 0, stdout: '[{"ok":true,"procedure":"Test_ManifestContracts"}]', stderr: "", durationMs: 3 };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: { ACCESS_VBA_PASSWORD: "env-secret" },
      cwd: root,
    });

    await expect(service.execute("test_vba", {
      accessPath: join(root, "Gestion_Riesgos.accdb"),
      destinationRoot: root,
      projectRoot: root,
      testsPath: "tests/tests.vba.json",
      procedureName: "Test_ManifestContracts",
      compile: false,
      reuseInstance: false,
    })).resolves.toMatchObject({ ok: true });

    expect(calls).toEqual([expect.objectContaining({
      action: "Run-Tests",
      accessPath: join(root, "Gestion_Riesgos.accdb"),
      destinationRoot: root,
      password: "env-secret",
      extra: {
        proceduresJson: JSON.stringify([{ procedure: "Test_ManifestContracts", args: [] }]),
        reuseInstance: false,
      },
    })]);
  });

  it("maps export_modules to a product-owned PowerShell runner invocation", async () => {
    const calls: unknown[] = [];
    const executor: VbaManagerExecutor = async (request) => {
      calls.push(request);
      return { exitCode: 0, stdout: '{"ok":true}', stderr: "", durationMs: 12 };
    };
    const service = new VbaSyncLegacyService({
      executor,
      scriptPath: "C:/Users/alice/AppData/Local/dysflow/app/scripts/dysflow-vba-manager.ps1",
      env: { ACCESS_VBA_PASSWORD: "secret" },
    });

    await expect(service.execute("export_modules", { accessPath: "C:/repo/front.accdb", projectRoot: "C:/repo", moduleNames: ["Module1"], destinationRoot: "C:/repo/src" })).resolves.toMatchObject({
      ok: true,
      data: { ok: true },
      durationMs: 12,
    });

    expect(calls).toEqual([{ 
      scriptPath: "C:/Users/alice/AppData/Local/dysflow/app/scripts/dysflow-vba-manager.ps1",
      action: "Export",
      accessPath: "C:/repo/front.accdb",
      destinationRoot: "C:/repo/src",
      moduleNames: ["Module1"],
      password: "secret",
      json: false,
      extra: {},
    }]);
  });

  it("maps legacy list/exists tools with JSON output enabled", async () => {
    const calls: unknown[] = [];
    const service = new VbaSyncLegacyService({
      executor: async (request) => {
        calls.push(request);
        return { exitCode: 0, stdout: '{"exists":true}', stderr: "", durationMs: 1 };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: {},
      cwd: "C:/db",
    });

    await service.execute("exists", { accessPath: "C:/db/front.accdb", moduleName: "Form_Main" });
    await service.execute("list_objects", { accessPath: "C:/db/front.accdb" });

    expect(calls).toEqual([
      expect.objectContaining({ action: "Exists", moduleNames: ["Form_Main"], json: true }),
      expect.objectContaining({ action: "List-Objects", moduleNames: [], json: true }),
    ]);
  });

  it("maps compile_vba to the repo-owned compile action with JSON output", async () => {
    const calls: unknown[] = [];
    const service = new VbaSyncLegacyService({
      executor: async (request) => {
        calls.push(request);
        return { exitCode: 0, stdout: '{"ok":true}', stderr: "", durationMs: 2 };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: {},
      cwd: "C:/custom",
    });

    await expect(service.execute("compile_vba", { accessPath: "C:/custom/front.accdb", destinationRoot: "C:/custom" })).resolves.toMatchObject({
      ok: true,
      data: { ok: true },
    });

    expect(calls).toEqual([
      expect.objectContaining({
        action: "Compile",
        accessPath: "C:/custom/front.accdb",
        destinationRoot: "C:/custom",
        moduleNames: [],
        json: true,
        extra: {},
      }),
    ]);
  });

  it("maps direct test_vba calls to a Run-Tests procedures JSON payload", async () => {
    const calls: unknown[] = [];
    const service = new VbaSyncLegacyService({
      executor: async (request) => {
        calls.push(request);
        return { exitCode: 0, stdout: '[{"ok":true,"procedure":"Test_RunAll"}]', stderr: "", durationMs: 5 };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: {},
      cwd: "C:/repo",
    });

    await expect(service.execute("test_vba", {
      accessPath: "C:/repo/front.accdb",
      procedureName: "Test_RunAll",
      argsJson: "[\"fixture\", 1]",
      destinationRoot: "C:/repo",
    })).resolves.toMatchObject({
      ok: true,
      data: {
        ok: true,
        total: 1,
        passed: 1,
        failed: 0,
        results: [{ ok: true, procedure: "Test_RunAll", failures: [] }],
      },
    });

    expect(calls).toEqual([
      expect.objectContaining({
        action: "Run-Tests",
        destinationRoot: "C:/repo",
        json: true,
        extra: {
          proceduresJson: JSON.stringify([{ procedure: "Test_RunAll", args: ["fixture", 1] }]),
        },
      }),
    ]);
  });

  it("loads test_vba manifests from testsPath and filters by name, procedure, or tags", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-tests-"));
    await writeFile(join(root, "tests.vba.json"), JSON.stringify({
      tests: [
        { name: "smoke import", procedure: "Test_Import", args: ["a"], tags: ["smoke"] },
        { name: "slow export", procedure: "Test_Export", args: ["b"], tags: ["slow"] },
      ],
    }), "utf8");
    const calls: unknown[] = [];
    const service = new VbaSyncLegacyService({
      executor: async (request) => {
        calls.push(request);
        return { exitCode: 0, stdout: '[{"ok":true,"procedure":"Test_Import"}]', stderr: "", durationMs: 7 };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: {},
      cwd: root,
    });

    await expect(service.execute("test_vba", { accessPath: join(root, "front.accdb"), testsPath: "tests.vba.json", filter: "smoke" })).resolves.toMatchObject({
      ok: true,
      data: {
        ok: true,
        total: 1,
        passed: 1,
        failed: 0,
        skipped: 1,
        results: [{ name: "smoke import", procedure: "Test_Import", ok: true }],
      },
    });

    expect(calls).toEqual([
      expect.objectContaining({
        action: "Run-Tests",
        destinationRoot: root,
        json: true,
        extra: {
          proceduresJson: JSON.stringify([{ procedure: "Test_Import", args: ["a"] }]),
        },
      }),
    ]);
  });

  it("evaluates manifest expectations and returns a legacy-style test report", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-report-tests-"));
    await writeFile(join(root, "tests.vba.json"), JSON.stringify([
      { name: "returns answer", procedure: "Test_ReturnAnswer", args: [], tags: ["unit"], expect: { returnValue: 42 } },
      { name: "wrong answer", procedure: "Test_WrongAnswer", args: [], tags: ["unit"], expect: { returnValue: 7 } },
    ]), "utf8");
    const service = new VbaSyncLegacyService({
      executor: async () => ({
        exitCode: 0,
        stdout: JSON.stringify([
          { ok: true, procedure: "Test_ReturnAnswer", returnValue: 42, logs: ["ok"] },
          { ok: true, procedure: "Test_WrongAnswer", returnValue: 8, logs: ["bad"] },
        ]),
        stderr: "",
        durationMs: 9,
      }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: {},
      cwd: root,
    });

    await expect(service.execute("test_vba", { accessPath: join(root, "front.accdb") })).resolves.toMatchObject({
      ok: true,
      data: {
        ok: false,
        total: 2,
        passed: 1,
        failed: 1,
        summary: {
          total: 2,
          passed: 1,
          failed: 1,
        },
        results: [
          { name: "returns answer", ok: true, failures: [] },
          { name: "wrong answer", ok: false, failures: ['returnValue esperado 7, recibido 8'] },
        ],
      },
    });
  });

  it("runs compile before test_vba plan execution when compile is requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-compile-tests-"));
    await writeFile(join(root, "tests.vba.json"), JSON.stringify([{ procedure: "Test_RunAll", args: [] }]), "utf8");
    const calls: unknown[] = [];
    const service = new VbaSyncLegacyService({
      executor: async (request) => {
        calls.push(request);
        return { exitCode: 0, stdout: request.action === "Compile" ? '{"ok":true}' : '[{"ok":true}]', stderr: "", durationMs: 4 };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: {},
      cwd: root,
    });

    await expect(service.execute("test_vba", { accessPath: join(root, "front.accdb"), compile: true })).resolves.toMatchObject({ ok: true });

    expect(calls).toEqual([
      expect.objectContaining({ action: "Compile", json: true }),
      expect.objectContaining({
        action: "Run-Tests",
        extra: { proceduresJson: JSON.stringify([{ procedure: "Test_RunAll", args: [] }]) },
      }),
    ]);
  });

  it("returns a safe failure when a direct runner mapping is not available yet", async () => {
    const service = new VbaSyncLegacyService({
      executor: async () => ({ exitCode: 0, stdout: "{}", stderr: "", durationMs: 1 }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/db/front.accdb" },
    });

    expect(await service.execute("init_project", {})).toEqual(failureResult({
      code: "LEGACY_TOOL_NOT_IMPLEMENTED",
      message: "init_project requires project bootstrap orchestration and is tracked by #25.",
      retryable: false,
    }));
  });

  it("verifies document CodeBehind against sidecar cls files without opening Access", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-verify-code-"));
    await mkdir(join(root, "forms"), { recursive: true });
    await writeFile(join(root, "forms", "Customer.form.txt"), [
      "Version =20",
      "Begin Form",
      "End",
      "CodeBehindForm",
      "Option Compare Database",
      "",
      "Public Sub Hello()",
      "  Debug.Print \"ok\"",
      "End Sub",
    ].join("\n"), "utf8");
    await writeFile(join(root, "forms", "Customer.cls"), [
      "Option Compare Database",
      "",
      "Public Sub Hello()",
      "Debug.Print \"ok\"",
      "End Sub",
    ].join("\n"), "utf8");
    const service = new VbaSyncLegacyService({
      executor: async () => { throw new Error("verify_code must not invoke the PowerShell runner"); },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: {},
      cwd: root,
    });

    await expect(service.execute("verify_code", {})).resolves.toMatchObject({
      ok: true,
      data: {
        ok: true,
        checked: 1,
        mismatches: 0,
        results: [{ moduleName: "Customer", status: "in_sync" }],
      },
    });
  });

  it("reports verify_code mismatches in strict mode", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-verify-code-mismatch-"));
    await mkdir(join(root, "forms"), { recursive: true });
    await writeFile(join(root, "forms", "Customer.form.txt"), "Begin Form\nEnd\nCodeBehindForm\nPublic Sub Hello()\n  Debug.Print \"form\"\nEnd Sub", "utf8");
    await writeFile(join(root, "forms", "Customer.cls"), "Public Sub Hello()\n  Debug.Print \"cls\"\nEnd Sub", "utf8");
    const service = new VbaSyncLegacyService({
      executor: async () => { throw new Error("verify_code must not invoke the PowerShell runner"); },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: {},
      cwd: root,
    });

    await expect(service.execute("verify_code", { strict: true, moduleNames: ["Customer"] })).resolves.toMatchObject({
      ok: true,
      data: {
        ok: false,
        checked: 1,
        mismatches: 1,
        results: [{ moduleName: "Customer", status: "mismatch" }],
      },
    });
  });

  it("exports Access to a temp folder and reports verify_binary differences", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-verify-binary-"));
    await mkdir(join(root, "modules"), { recursive: true });
    await writeFile(join(root, "modules", "SourceOnly.bas"), "Public Sub SourceOnly()\nEnd Sub", "utf8");
    await writeFile(join(root, "modules", "Shared.bas"), "Public Sub Shared()\nDebug.Print \"source\"\nEnd Sub", "utf8");
    const calls: unknown[] = [];
    const service = new VbaSyncLegacyService({
      executor: async (request) => {
        calls.push(request);
        await mkdir(join(request.destinationRoot, "modules"), { recursive: true });
        await writeFile(join(request.destinationRoot, "modules", "BinaryOnly.bas"), "Public Sub BinaryOnly()\nEnd Sub", "utf8");
        await writeFile(join(request.destinationRoot, "modules", "Shared.bas"), "Public Sub Shared()\nDebug.Print \"binary\"\nEnd Sub", "utf8");
        return { exitCode: 0, stdout: "OK", stderr: "", durationMs: 11 };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: {},
      cwd: root,
    });

    await expect(service.execute("verify_binary", { accessPath: join(root, "front.accdb") })).resolves.toMatchObject({
      ok: true,
      data: {
        ok: false,
        same: [],
        different: [{ module: "Shared", file: "modules/Shared.bas" }],
        sourceOnly: [{ module: "SourceOnly", file: "modules/SourceOnly.bas" }],
        binaryOnly: [{ module: "BinaryOnly", file: "modules/BinaryOnly.bas" }],
        plan: {
          import: ["Shared", "SourceOnly"],
          delete: ["BinaryOnly"],
        },
      },
      durationMs: 11,
    });

    expect(calls).toEqual([
      expect.objectContaining({
        action: "Export",
        accessPath: join(root, "front.accdb"),
        moduleNames: [],
        json: false,
      }),
    ]);
  });

  it("filters verify_binary reports by moduleNames", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-verify-binary-filter-"));
    await mkdir(join(root, "modules"), { recursive: true });
    await writeFile(join(root, "modules", "Keep.bas"), "Public Sub Keep()\nEnd Sub", "utf8");
    await writeFile(join(root, "modules", "Ignore.bas"), "Public Sub Ignore()\nEnd Sub", "utf8");
    const service = new VbaSyncLegacyService({
      executor: async (request) => {
        await mkdir(join(request.destinationRoot, "modules"), { recursive: true });
        await writeFile(join(request.destinationRoot, "modules", "Keep.bas"), "Public Sub Keep()\nEnd Sub", "utf8");
        await writeFile(join(request.destinationRoot, "modules", "Ignore.bas"), "Public Sub Changed()\nEnd Sub", "utf8");
        return { exitCode: 0, stdout: "OK", stderr: "", durationMs: 3 };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: {},
      cwd: root,
    });

    await expect(service.execute("verify_binary", { accessPath: join(root, "front.accdb"), moduleNames: ["Keep"] })).resolves.toMatchObject({
      ok: true,
      data: {
        ok: true,
        same: [{ module: "Keep" }],
        different: [],
      },
    });
  });

  it("returns reconcile_binary dry-run plans without mutating Access", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-reconcile-binary-"));
    await mkdir(join(root, "modules"), { recursive: true });
    await writeFile(join(root, "modules", "Shared.bas"), "Public Sub Shared()\nDebug.Print \"source\"\nEnd Sub", "utf8");
    const calls: unknown[] = [];
    const service = new VbaSyncLegacyService({
      executor: async (request) => {
        calls.push(request);
        await mkdir(join(request.destinationRoot, "modules"), { recursive: true });
        await writeFile(join(request.destinationRoot, "modules", "Shared.bas"), "Public Sub Shared()\nDebug.Print \"binary\"\nEnd Sub", "utf8");
        return { exitCode: 0, stdout: "OK", stderr: "", durationMs: 6 };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: {},
      cwd: root,
    });

    await expect(service.execute("reconcile_binary", { accessPath: join(root, "front.accdb") })).resolves.toMatchObject({
      ok: true,
      data: {
        ok: false,
        applied: false,
        plan: { import: ["Shared"], delete: [] },
      },
    });

    expect(calls).toEqual([expect.objectContaining({ action: "Export" })]);
  });

  it("refuses reconcile_binary apply until the mutating slice is implemented", async () => {
    const service = new VbaSyncLegacyService({
      executor: async () => ({ exitCode: 0, stdout: "OK", stderr: "", durationMs: 1 }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/db/front.accdb" },
    });

    await expect(service.execute("reconcile_binary", { apply: true })).resolves.toMatchObject({
      ok: false,
      error: {
        code: "RECONCILE_BINARY_APPLY_NOT_IMPLEMENTED",
      },
    });
  });

  it("redacts passwords from runner failures", async () => {
    const service = new VbaSyncLegacyService({
      executor: async () => ({ exitCode: 1, stdout: "", stderr: "bad password secret", durationMs: 3 }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: { ACCESS_VBA_PASSWORD: "secret" },
      cwd: "C:/db",
    });

    const result = await service.execute("export_all", { accessPath: "C:/db/front.accdb" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("[REDACTED]");
      expect(result.error.message).not.toContain("secret");
    }
  });

  it("resolves installed script path from DYSFLOW_HOME", () => {
    expect(resolveDefaultVbaManagerScriptPath({ DYSFLOW_HOME: "C:/Users/alice/AppData/Local/dysflow" })).toBe("C:/Users/alice/AppData/Local/dysflow/app/scripts/dysflow-vba-manager.ps1");
  });
});
