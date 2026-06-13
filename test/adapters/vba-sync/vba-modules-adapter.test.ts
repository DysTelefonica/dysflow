import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VbaModulesAdapter } from "../../../src/adapters/vba-sync/vba-modules-adapter";
import {
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { buildImportPlanResult } from "../../../src/core/services/vba-import-plan";

describe("VbaModulesAdapter", () => {
  it("handles module tools", () => {
    expect(VbaModulesAdapter.handles("export_modules")).toBe(true);
    expect(VbaModulesAdapter.handles("export_all")).toBe(true);
    expect(VbaModulesAdapter.handles("import_modules")).toBe(true);
    expect(VbaModulesAdapter.handles("import_all")).toBe(true);
    expect(VbaModulesAdapter.handles("list_objects")).toBe(true);
    expect(VbaModulesAdapter.handles("exists")).toBe(true);
    expect(VbaModulesAdapter.handles("verify_code")).toBe(true);
    expect(VbaModulesAdapter.handles("verify_binary")).toBe(true);
    expect(VbaModulesAdapter.handles("reconcile_binary")).toBe(true);
    expect(VbaModulesAdapter.handles("delete_module")).toBe(true);
    expect(VbaModulesAdapter.handles("fix_encoding")).toBe(true);
    expect(VbaModulesAdapter.handles("run_vba")).toBe(false);
  });

  it("characterizes import plan result shaping for explicit overrides", () => {
    const result = buildImportPlanResult({
      toolName: "import_all",
      params: {
        projectId: "develop",
        contextId: "ctx-develop",
        importMode: "Code",
      },
      target: {
        configSource: "explicit-request",
        projectId: "develop",
        projectRoot: "C:/repo",
        accessDbPath: "C:/repo/front.accdb",
        accessPath: "C:/repo/front.accdb",
        backendPath: "C:/repo/backend.accdb",
        destinationRoot: "C:/repo/src",
      },
      modulesPlanned: ["Entorno", "Variables Globales"],
      warnings: ["preview warning"],
      errors: [],
    });

    expect(result).toEqual({
      operation: "import_all",
      dryRun: true,
      willModifyAccess: false,
      requestedProjectId: "develop",
      requestedContextId: "ctx-develop",
      resolvedProjectId: "develop",
      configSource: "explicit-overrides",
      projectRoot: "C:/repo",
      accessPath: "C:/repo/front.accdb",
      backendPath: "C:/repo/backend.accdb",
      destinationRoot: "C:/repo/src",
      importMode: "Code",
      modulesPlanned: ["Entorno", "Variables Globales"],
      modulesCount: 2,
      warnings: ["preview warning"],
      errors: [],
    });
  });

  it("characterizes import module dry-run result shaping with diagnostics", () => {
    const result = buildImportPlanResult({
      toolName: "import_modules",
      params: {},
      target: {
        configSource: "runtime-default",
        projectRoot: "C:/repo",
        accessDbPath: "",
        destinationRoot: "C:/repo/src",
      },
      modulesPlanned: [],
      warnings: [],
      errors: ["destinationRoot not found: C:/repo/src"],
    });

    expect(result).toEqual({
      operation: "import_modules",
      dryRun: true,
      willModifyAccess: false,
      requestedProjectId: undefined,
      requestedContextId: undefined,
      resolvedProjectId: undefined,
      configSource: "runtime-default",
      projectRoot: "C:/repo",
      accessPath: undefined,
      backendPath: undefined,
      destinationRoot: "C:/repo/src",
      importMode: undefined,
      modulesPlanned: [],
      modulesCount: 0,
      warnings: [],
      errors: ["destinationRoot not found: C:/repo/src"],
    });
  });

  it("maps export_modules to a product-owned PowerShell runner invocation", async () => {
    const calls: unknown[] = [];
    const executor: VbaManagerExecutor = async (request) => {
      calls.push(request);
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true}',
        stderr: "",
        durationMs: 12,
        timedOut: false,
      };
    };
    const service = new VbaSyncAdapter({
      executor,
      scriptPath: "C:/Users/alice/AppData/Local/dysflow/app/scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      env: { DYSFLOW_ACCESS_PASSWORD: "secret" },
    });

    await expect(
      service.execute("export_modules", {
        moduleNames: ["Module1"],
        destinationRoot: "C:/repo/src",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { ok: true },
      durationMs: 12,
    });

    expect(calls).toEqual([
      expect.objectContaining({
        action: "Export",
        accessPath: "C:/db/front.accdb",
        destinationRoot: "C:/repo/src",
        moduleNames: ["Module1"],
      }),
    ]);
  });

  it.each([
    ["replace", "Auto"],
    ["auto", "Auto"],
    ["form", "Form"],
    ["code", "Code"],
  ])("normalizes import_modules importMode=%s before invoking the runner", async (inputMode, expectedMode) => {
    let capturedImportMode: unknown;
    const service = new VbaSyncAdapter({
      executor: async (request) => {
        capturedImportMode = request.extra.importMode;
        return {
          exitCode: 0,
          stdout: 'DYSFLOW_RESULT {"ok":true}',
          stderr: "",
          durationMs: 1,
          timedOut: false,
        };
      },
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo/src",
      env: {},
    });

    const result = await service.execute("import_modules", {
      moduleNames: ["Variables Globales"],
      importMode: inputMode,
    });

    expect(result.ok).toBe(true);
    expect(capturedImportMode).toBe(expectedMode);
  });

  it.each([
    ["replace", "Auto"],
    ["auto", "Auto"],
    ["form", "Form"],
    ["code", "Code"],
  ])("normalizes import_all importMode=%s before invoking the runner", async (inputMode, expectedMode) => {
    let capturedImportMode: unknown;
    const service = new VbaSyncAdapter({
      executor: async (request) => {
        capturedImportMode = request.extra.importMode;
        return {
          exitCode: 0,
          stdout: 'DYSFLOW_RESULT {"ok":true}',
          stderr: "",
          durationMs: 1,
          timedOut: false,
        };
      },
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo/src",
      env: {},
    });

    const result = await service.execute("import_all", { importMode: inputMode });

    expect(result.ok).toBe(true);
    expect(capturedImportMode).toBe(expectedMode);
  });

  it("dry-run import_all with mismatched projectId returns CONFIG_PROJECT_ID_MISMATCH", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-worktrees-adapter-"));
    const staging = join(root, "staging");
    const develop = join(root, "develop");
    const registryPath = join(root, "projects.json");
    await mkdir(join(staging, ".dysflow"), { recursive: true });
    await mkdir(join(develop, ".dysflow"), { recursive: true });
    await mkdir(join(develop, "src", "modules"), { recursive: true });
    await writeFile(join(staging, "front.accdb"), "", "utf8");
    await writeFile(join(develop, "front.accdb"), "", "utf8");
    await writeFile(
      join(develop, "src", "modules", "Entorno.bas"),
      'Attribute VB_Name = "Entorno"',
      "utf8",
    );
    await writeFile(
      join(staging, ".dysflow", "project.json"),
      JSON.stringify({
        id: "staging",
        accessPath: "front.accdb",
        destinationRoot: "src",
      }),
      "utf8",
    );
    await writeFile(
      join(develop, ".dysflow", "project.json"),
      JSON.stringify({
        id: "develop",
        accessPath: "front.accdb",
        destinationRoot: "src",
      }),
      "utf8",
    );
    await writeFile(
      registryPath,
      JSON.stringify({
        projects: {
          develop: { configPath: join(develop, ".dysflow", "project.json") },
        },
      }),
      "utf8",
    );
    const service = new VbaSyncAdapter({
      cwd: staging,
      env: { DYSFLOW_PROJECT_REGISTRY_PATH: registryPath },
      executor: async () => ({
        exitCode: 0,
        stdout: "{}",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      }),
    });

    const result = await service.execute("import_all", {
      projectId: "develop",
      dryRun: true,
      importMode: "Code",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("CONFIG_PROJECT_ID_MISMATCH");
  });

  it("dry-run import_all fails unknown explicit project when repo config id differs", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-worktrees-missing-adapter-"));
    const staging = join(root, "staging");
    await mkdir(join(staging, ".dysflow"), { recursive: true });
    await writeFile(join(staging, "front.accdb"), "", "utf8");
    await writeFile(
      join(staging, ".dysflow", "project.json"),
      JSON.stringify({
        id: "staging",
        accessPath: "front.accdb",
        destinationRoot: "src",
      }),
      "utf8",
    );
    const service = new VbaSyncAdapter({
      cwd: staging,
      env: {
        DYSFLOW_PROJECT_REGISTRY_PATH: join(root, "missing-projects.json"),
      },
    });

    const result = await service.execute("import_all", {
      projectId: "missing-project",
      dryRun: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("CONFIG_PROJECT_ID_MISMATCH");
  });

  it("dry-run explicit overrides win over requested project id", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-overrides-adapter-"));
    const staging = join(root, "staging");
    const develop = join(root, "develop");
    await mkdir(join(develop, "src", "modules"), { recursive: true });
    await writeFile(join(develop, "front.accdb"), "", "utf8");
    await writeFile(join(develop, "src", "modules", "Variables Globales.bas"), "", "utf8");
    const service = new VbaSyncAdapter({ cwd: staging, env: {} });

    const result = await service.execute("import_all", {
      projectId: "staging",
      dryRun: true,
      accessPath: join(develop, "front.accdb"),
      destinationRoot: join(develop, "src"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected dry-run success");
    expect(result.data).toMatchObject({
      configSource: "explicit-overrides",
      accessPath: join(develop, "front.accdb"),
      destinationRoot: join(develop, "src"),
      modulesPlanned: ["Variables Globales"],
    });
  });

  it("reports runtime fallback source when no repo config is loaded", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-fallback-source-adapter-"));
    await writeFile(join(root, "front.accdb"), "", "utf8");
    const service = new VbaSyncAdapter({
      cwd: root,
      accessPath: join(root, "front.accdb"),
      destinationRoot: root,
    });

    const result = await service.execute("import_modules", {
      dryRun: true,
      moduleNames: ["Entorno"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected dry-run success");
    expect(result.data).toMatchObject({
      configSource: "runtime-default",
      modulesPlanned: ["Entorno"],
    });
  });

  it("dry-run import_modules only plans requested modules", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-import-modules-adapter-"));
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "front.accdb"), "", "utf8");
    const service = new VbaSyncAdapter({
      cwd: root,
      accessPath: join(root, "front.accdb"),
      destinationRoot: root,
    });

    const result = await service.execute("import_modules", {
      dryRun: true,
      moduleNames: ["Entorno", "Variables Globales"],
      importMode: "Code",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected dry-run success");
    expect(result.data).toMatchObject({
      operation: "import_modules",
      modulesPlanned: ["Entorno", "Variables Globales"],
      modulesCount: 2,
      willModifyAccess: false,
    });
  });

  it("dry-run without explicit project loads cwd project config identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-cwd-project-adapter-"));
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await mkdir(join(root, "src", "modules"), { recursive: true });
    await writeFile(join(root, "front.accdb"), "", "utf8");
    await writeFile(join(root, "src", "modules", "Entorno.bas"), "", "utf8");
    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        id: "cwd-project",
        accessPath: "front.accdb",
        destinationRoot: "src",
      }),
      "utf8",
    );
    const service = new VbaSyncAdapter({ cwd: root, env: {} });

    const result = await service.execute("import_all", { dryRun: true });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected dry-run success");
    expect(result.data).toMatchObject({
      resolvedProjectId: "cwd-project",
      accessPath: join(root, "front.accdb"),
      destinationRoot: join(root, "src"),
      modulesPlanned: ["Entorno"],
    });
  });

  it("fails fast when no accessPath or project config can be resolved", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-strict-missing-adapter-"));
    const service = new VbaSyncAdapter({ cwd: root, env: {} });

    const result = await service.execute("import_all", {
      dryRun: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected missing accessPath failure");
    expect(result.error.code).toBe("CONFIG_MISSING_ACCESS_PATH");
  });

  it("destinationRoot override wins even when projectId is registered", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-dest-registered-adapter-"));
    const project = join(root, "project");
    const overrideRoot = join(root, "override-src");
    const registryPath = join(root, "projects.json");
    await mkdir(join(project, ".dysflow"), { recursive: true });
    await mkdir(join(project, "src", "modules"), { recursive: true });
    await mkdir(join(overrideRoot, "modules"), { recursive: true });
    await writeFile(join(project, "front.accdb"), "", "utf8");
    await writeFile(join(project, "src", "modules", "Wrong.bas"), "", "utf8");
    await writeFile(join(overrideRoot, "modules", "Right.bas"), "", "utf8");
    await writeFile(
      join(project, ".dysflow", "project.json"),
      JSON.stringify({
        id: "registered",
        accessPath: "front.accdb",
        destinationRoot: "src",
      }),
      "utf8",
    );
    await writeFile(
      registryPath,
      JSON.stringify({
        projects: {
          registered: { configPath: join(project, ".dysflow", "project.json") },
        },
      }),
      "utf8",
    );
    const service = new VbaSyncAdapter({
      cwd: root,
      env: { DYSFLOW_PROJECT_REGISTRY_PATH: registryPath },
    });

    const result = await service.execute("import_all", {
      projectId: "registered",
      dryRun: true,
      destinationRoot: overrideRoot,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected registry deprecation failure");
    expect(result.error.code).toBe("CONFIG_PROJECT_NOT_REGISTERED");
  });

  it("destinationRoot-only override wins over configured cwd project", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-dest-override-adapter-"));
    const overrideRoot = join(root, "override-src");
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await mkdir(join(root, "src", "modules"), { recursive: true });
    await mkdir(join(overrideRoot, "modules"), { recursive: true });
    await writeFile(join(root, "front.accdb"), "", "utf8");
    await writeFile(join(root, "src", "modules", "Wrong.bas"), "", "utf8");
    await writeFile(join(overrideRoot, "modules", "Right.bas"), "", "utf8");
    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        id: "cwd-project",
        accessPath: "front.accdb",
        destinationRoot: "src",
      }),
      "utf8",
    );
    const service = new VbaSyncAdapter({ cwd: root, env: {} });

    const result = await service.execute("import_all", {
      dryRun: true,
      destinationRoot: overrideRoot,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected dry-run success");
    expect(result.data).toMatchObject({
      destinationRoot: overrideRoot,
      modulesPlanned: ["Right"],
    });
  });

  it("real import returns target diagnostics", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-real-diag-adapter-"));
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await writeFile(join(root, "front.accdb"), "", "utf8");
    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        id: "real-project",
        accessPath: "front.accdb",
        destinationRoot: "src",
      }),
      "utf8",
    );
    const service = new VbaSyncAdapter({
      cwd: root,
      env: {},
      executor: async () => ({
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      }),
    });

    const result = await service.execute("import_modules", {
      moduleNames: ["Entorno"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected import success");
    expect(result.data).toMatchObject({
      operation: "import_modules",
      dryRun: false,
      willModifyAccess: true,
      resolvedProjectId: "real-project",
      accessPath: join(root, "front.accdb"),
      destinationRoot: join(root, "src"),
      result: { ok: true },
    });
  });

  it("maps list/exists tools with JSON output enabled", async () => {
    const calls: unknown[] = [];
    const service = new VbaSyncAdapter({
      executor: async (request) => {
        calls.push(request);
        return {
          exitCode: 0,
          stdout: 'DYSFLOW_RESULT {"exists":true}',
          stderr: "",
          durationMs: 1,
          timedOut: false,
        };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      env: {},
    });

    await service.execute("exists", { moduleName: "Form_Main" });
    await service.execute("exists", { name: "Form_Secondary" });
    await service.execute("list_objects", {});

    expect(calls).toEqual([
      expect.objectContaining({
        action: "Exists",
        moduleNames: ["Form_Main"],
        json: true,
      }),
      expect.objectContaining({
        action: "Exists",
        moduleNames: ["Form_Secondary"],
        json: true,
      }),
      expect.objectContaining({
        action: "List-Objects",
        moduleNames: [],
        json: true,
      }),
    ]);
  });

  it("verify_code exports to a temporary directory and compares without overwriting source", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-verify-code-adapter-"));
    const sourceRoot = join(root, "src");
    await mkdir(join(sourceRoot, "modules"), { recursive: true });
    await writeFile(join(sourceRoot, "modules", "Module1.bas"), "same", "utf8");
    await writeFile(join(sourceRoot, "modules", "Module2.bas"), "disk", "utf8");
    const calls: unknown[] = [];
    const service = new VbaSyncAdapter({
      executor: async (request) => {
        calls.push(request);
        expect(request.destinationRoot).not.toBe(sourceRoot);
        await mkdir(join(request.destinationRoot, "modules"), { recursive: true });
        await writeFile(join(request.destinationRoot, "modules", "Module1.bas"), "same", "utf8");
        await writeFile(join(request.destinationRoot, "modules", "Module2.bas"), "binary", "utf8");
        await writeFile(
          join(request.destinationRoot, "modules", "OnlyBinary.bas"),
          "binary only",
          "utf8",
        );
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 6, timedOut: false };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: sourceRoot,
      env: {},
    });

    const result = await service.execute("verify_code", { diff: true });

    expect(result).toMatchObject({
      ok: true,
      data: {
        operation: "verify_code",
        ok: false,
        dryRun: true,
        willModifyAccess: false,
        matched: [{ moduleName: "Module1", fileType: "bas" }],
        different: [{ moduleName: "Module2", fileType: "bas" }],
        missingInSource: [{ moduleName: "OnlyBinary", fileType: "bas" }],
        missingInBinary: [],
        diffs: [
          {
            moduleName: "Module2",
            sourceSnippet: "source:1: disk",
            binarySnippet: "binary:1: binary",
          },
        ],
      },
    });
    expect(await readFile(join(sourceRoot, "modules", "Module2.bas"), "utf8")).toBe("disk");
  });

  it("verify_binary supports selective module comparison", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-verify-binary-adapter-"));
    const sourceRoot = join(root, "src");
    await mkdir(join(sourceRoot, "modules"), { recursive: true });
    await writeFile(join(sourceRoot, "modules", "Module1.bas"), "same", "utf8");
    await writeFile(join(sourceRoot, "modules", "Other.bas"), "disk only", "utf8");
    const calls: unknown[] = [];
    const service = new VbaSyncAdapter({
      executor: async (request) => {
        calls.push(request);
        await mkdir(join(request.destinationRoot, "modules"), { recursive: true });
        await writeFile(join(request.destinationRoot, "modules", "Module1.bas"), "same", "utf8");
        await writeFile(
          join(request.destinationRoot, "modules", "Other.bas"),
          "binary only",
          "utf8",
        );
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 4, timedOut: false };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: sourceRoot,
      env: {},
    });

    const result = await service.execute("verify_binary", { moduleNames: ["Module1"] });

    expect(result).toMatchObject({
      ok: true,
      data: {
        operation: "verify_binary",
        ok: true,
        matched: [{ moduleName: "Module1", fileType: "bas" }],
        different: [],
        missingInSource: [],
        missingInBinary: [],
      },
    });
  });

  it("reconcile_binary returns a safe dry-run plan instead of mutating Access", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-reconcile-adapter-"));
    const sourceRoot = join(root, "src");
    await mkdir(join(sourceRoot, "modules"), { recursive: true });
    await writeFile(join(sourceRoot, "modules", "Module1.bas"), "disk", "utf8");
    const service = new VbaSyncAdapter({
      executor: async (request) => {
        await mkdir(join(request.destinationRoot, "modules"), { recursive: true });
        await writeFile(join(request.destinationRoot, "modules", "Module1.bas"), "binary", "utf8");
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 3, timedOut: false };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: sourceRoot,
      env: {},
    });

    const result = await service.execute("reconcile_binary", { diff: true });

    expect(result).toMatchObject({
      ok: true,
      data: {
        operation: "reconcile_binary",
        ok: false,
        dryRun: true,
        willModifyAccess: false,
        different: [{ moduleName: "Module1" }],
        recommendation: expect.stringContaining("Dry-run only"),
      },
    });
  });

  it("import_all dry-run scans and discovers *.report.txt and *.form.txt files in reports/ and forms/ folders", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-scan-reports-"));
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "src", "modules"), { recursive: true });
    await mkdir(join(root, "src", "forms"), { recursive: true });
    await mkdir(join(root, "src", "reports"), { recursive: true });
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await writeFile(join(root, "front.accdb"), "", "utf8");

    await writeFile(join(root, "src", "modules", "Entorno.bas"), "", "utf8");
    await writeFile(join(root, "src", "forms", "Form_Main.form.txt"), "", "utf8");
    await writeFile(join(root, "src", "reports", "Report_Invoice.report.txt"), "", "utf8");

    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        id: "cwd-project",
        accessPath: "front.accdb",
        destinationRoot: "src",
      }),
      "utf8",
    );
    const service = new VbaSyncAdapter({ cwd: root, env: {} });

    const result = await service.execute("import_all", { dryRun: true });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected dry-run success");
    expect(result.data).toMatchObject({
      modulesPlanned: ["Entorno", "Form_Main", "Report_Invoice"],
    });
  });
});
