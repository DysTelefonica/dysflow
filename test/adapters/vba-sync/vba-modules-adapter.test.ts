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
    expect(VbaModulesAdapter.handles("delete_module")).toBe(true);
    expect(VbaModulesAdapter.handles("fix_encoding")).toBe(true);
    expect(VbaModulesAdapter.handles("run_vba")).toBe(false);
    // Collapsed into verify_code — these names no longer exist.
    expect(VbaModulesAdapter.handles("verify_binary")).toBe(false);
    expect(VbaModulesAdapter.handles("reconcile_binary")).toBe(false);
    expect(VbaModulesAdapter.handles("compare_module")).toBe(false);
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

  // --- Round-3 Item 5 (P2) — delete_module accepts dryRun:true ---------------
  //
  // Pre-Item-5: the vba-sync schema for `delete_module` had no `dryRun` property
  // and `additionalProperties: false` rejected the flag silently with
  // "dryRun is not allowed", forcing consumers to commit real deletions before
  // they could review the plan.
  //
  // Post-Item-5: `delete_module` declares `dryRun` in its schema AND the handler
  // short-circuits to a plan-shaped result when `dryRun: true` is set
  // EXPLICITLY. The default for `delete_module` (no flag, no dryRun) stays the
  // legacy "execute" path so existing call sites keep working — this differs
  // from `import_*`/`import_all` which default to dry-run.
  //
  // Contraparte tests pin the existing behavior: no dryRun, or dryRun:false,
  // MUST still call the runner (consumer relies on this for production deletes).

  it("Round-3 Item 5 — delete_module with dryRun:true short-circuits to a plan shape (no runner call)", async () => {
    const calls: Array<{ action: string; moduleNames: readonly string[] }> = [];
    const executor: VbaManagerExecutor = async (request) => {
      calls.push({ action: request.action, moduleNames: [...(request.moduleNames ?? [])] });
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const root = await mkdtemp(join(tmpdir(), "dysflow-delete-dryrun-"));
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await writeFile(join(root, "front.accdb"), "", "utf8");
    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        id: "delete-dryrun",
        accessPath: "front.accdb",
        destinationRoot: "src",
      }),
      "utf8",
    );
    const service = new VbaSyncAdapter({ cwd: root, env: {}, executor });

    const result = await service.execute("delete_module", {
      moduleNames: ["Module_Foo", "Module_Bar"],
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected dry-run plan success");
    expect(result.data).toMatchObject({
      operation: "delete_module",
      dryRun: true,
      willModifyAccess: false,
      modulesPlanned: ["Module_Foo", "Module_Bar"],
      modulesCount: 2,
      force: false,
    });
    // The runner MUST NOT be invoked — no PowerShell spawn, no Access.
    expect(calls).toHaveLength(0);
  });

  it("Round-3 Item 5 — delete_module with dryRun:true and singular moduleName plans one entry", async () => {
    // Singular `moduleName` is the historical delete_module input shape; the
    // short-circuit must plan exactly that one module.
    const calls: unknown[] = [];
    const executor: VbaManagerExecutor = async (request) => {
      calls.push({ action: request.action, moduleNames: [...(request.moduleNames ?? [])] });
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const root = await mkdtemp(join(tmpdir(), "dysflow-delete-dryrun-singular-"));
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await writeFile(join(root, "front.accdb"), "", "utf8");
    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        id: "delete-dryrun-singular",
        accessPath: "front.accdb",
        destinationRoot: "src",
      }),
      "utf8",
    );
    const service = new VbaSyncAdapter({ cwd: root, env: {}, executor });

    const result = await service.execute("delete_module", {
      moduleName: "Module_Foo",
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected dry-run plan success");
    expect(result.data).toMatchObject({
      operation: "delete_module",
      dryRun: true,
      willModifyAccess: false,
      modulesPlanned: ["Module_Foo"],
      modulesCount: 1,
    });
    expect(calls).toHaveLength(0);
  });

  it("Round-3 Item 5 — delete_module with dryRun:true and force:true plans a forced delete (does not actually force)", async () => {
    // force:true is a destructive option; the dry-run plan must reflect it
    // for transparency but obviously never apply it.
    const calls: unknown[] = [];
    const executor: VbaManagerExecutor = async (request) => {
      calls.push({ action: request.action, moduleNames: [...(request.moduleNames ?? [])] });
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const root = await mkdtemp(join(tmpdir(), "dysflow-delete-dryrun-force-"));
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await writeFile(join(root, "front.accdb"), "", "utf8");
    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        id: "delete-dryrun-force",
        accessPath: "front.accdb",
        destinationRoot: "src",
      }),
      "utf8",
    );
    const service = new VbaSyncAdapter({ cwd: root, env: {}, executor });

    const result = await service.execute("delete_module", {
      moduleNames: ["Module_Foo"],
      force: true,
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected dry-run plan success");
    expect(result.data).toMatchObject({
      operation: "delete_module",
      dryRun: true,
      willModifyAccess: false,
      modulesPlanned: ["Module_Foo"],
      force: true,
    });
    expect(calls).toHaveLength(0);
  });

  it("Round-3 Item 5 — delete_module WITHOUT dryRun calls the runner (existing behavior preserved)", async () => {
    // Contraparte: no dryRun → real delete. Pins the historical contract that
    // consumer production workflows rely on.
    const calls: Array<{ action: string; moduleNames: readonly string[]; force?: boolean }> = [];
    const executor: VbaManagerExecutor = async (request) => {
      calls.push({
        action: request.action,
        moduleNames: [...(request.moduleNames ?? [])],
        force: request.extra.force as boolean | undefined,
      });
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const root = await mkdtemp(join(tmpdir(), "dysflow-delete-no-dryrun-"));
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await writeFile(join(root, "front.accdb"), "", "utf8");
    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        id: "delete-no-dryrun",
        accessPath: "front.accdb",
        destinationRoot: "src",
      }),
      "utf8",
    );
    const service = new VbaSyncAdapter({ cwd: root, env: {}, executor });

    await service.execute("delete_module", { moduleNames: ["Module_Foo"] });

    expect(calls).toHaveLength(1);
    const [firstCall] = calls;
    expect(firstCall?.action).toBe("Delete");
    expect(firstCall?.moduleNames).toEqual(["Module_Foo"]);
  });

  it("Round-3 Item 5 — delete_module with dryRun:false calls the runner (explicit opt-out)", async () => {
    // Explicit dryRun:false is the documented "I really want to delete" escape
    // — the runner MUST be called exactly once.
    const calls: Array<{ action: string; moduleNames: readonly string[] }> = [];
    const executor: VbaManagerExecutor = async (request) => {
      calls.push({ action: request.action, moduleNames: [...(request.moduleNames ?? [])] });
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const root = await mkdtemp(join(tmpdir(), "dysflow-delete-dryrun-false-"));
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await writeFile(join(root, "front.accdb"), "", "utf8");
    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        id: "delete-dryrun-false",
        accessPath: "front.accdb",
        destinationRoot: "src",
      }),
      "utf8",
    );
    const service = new VbaSyncAdapter({ cwd: root, env: {}, executor });

    await service.execute("delete_module", {
      moduleNames: ["Module_Foo"],
      dryRun: false,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.action).toBe("Delete");
    expect(calls[0]?.moduleNames).toEqual(["Module_Foo"]);
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
    ["form", "Auto"],
    ["code", "Code"],
    ["Form", "Auto"],
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
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(capturedImportMode).toBe(expectedMode);
  });

  it.each([
    ["replace", "Auto"],
    ["auto", "Auto"],
    ["form", "Auto"],
    ["code", "Code"],
    ["Form", "Auto"],
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

    const result = await service.execute("import_all", { importMode: inputMode, apply: true });

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
    });
  });

  it("import_modules / import_all with explicit dryRun:true plan; without flags the runner path is reached (capa 2 contract)", async () => {
    // Issue #785 (v2.1.1, capa 2) — the adapter no longer hardcodes
    // `params.dryRun !== false` (the implicit "absence = plan" rule).
    // The dispatch seam is now the SINGLE source of truth for policy
    // defaults. This test reframes the historical "default-dry-run" pin:
    //
    //   - With explicit `dryRun: true` → plan (preserved contract).
    //   - Without flags                → runner path is reached
    //                                    (the adapter delegate is now
    //                                    driven by explicit intent only —
    //                                    direct adapter callers MUST pass
    //                                    an explicit flag).
    //
    // Direct adapter callers that want plan behavior therefore pass an
    // explicit `dryRun: true`. The dispatch seam applies the same
    // policy default at the MCP boundary (#785 capa 1).
    const root = await mkdtemp(join(tmpdir(), "dysflow-import-default-dryrun-"));
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "front.accdb"), "", "utf8");
    const service = new VbaSyncAdapter({
      cwd: root,
      accessPath: join(root, "front.accdb"),
      destinationRoot: root,
    });

    const planModules = await service.execute("import_modules", {
      moduleNames: ["Entorno"],
      dryRun: true,
    });
    expect(planModules.ok).toBe(true);
    if (!planModules.ok) throw new Error("expected plan success");
    expect(planModules.data).toMatchObject({
      operation: "import_modules",
      dryRun: true,
      willModifyAccess: false,
    });

    const planAll = await service.execute("import_all", { dryRun: true });
    expect(planAll.ok).toBe(true);
    if (!planAll.ok) throw new Error("expected plan success");
    expect(planAll.data).toMatchObject({
      operation: "import_all",
      dryRun: true,
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
      apply: true,
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

  // ========================================================================
  // feat-759-no-compile (v1.19.0) — compile-related tests removed.
  //
  // The following 9 atoms were deleted because their behavior is gone
  // from the runtime (no compile_vba tool, no compile parameter, no
  // rollbackOnCompileFail parameter, no VBA_COMPILE_ERROR, no
  // document-module-compile-not-verifiable-headless downgrade):
  //
  //   - "import_modules with compile:true calls compile after successful
  //     import"
  //   - "import_modules with compile:true propagates compile failure"
  //   - "import_modules with compile:true and rollbackOnCompileFail:false
  //     preserves the legacy partial-write behavior (#732)"
  //   - "compile_vba failure forwards module and line context from the
  //     runner — #557"
  //   - "import_modules of a FORM with compile:true downgrades a compile
  //     failure to unverified (does NOT hard-fail) — #543"
  //   - "import_modules of a .cls-only FORM with compile:true downgrades
  //     a compile failure to unverified — #551"
  //   - "import_modules with compile:false (default) does NOT call
  //     compile"
  //   - "import_all with compile:true calls compile after successful
  //     import"
  //
  // Save-only persistence (acCmdSaveAllModules = RunCommand 280) is now
  // the canonical mutation path per
  // openspec/specs/vba-manager-actions/spec.md "Save-only persistence".
  // ========================================================================

  it("import_all with prune:true deletes binary modules absent from source before import — #555", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-import-all-prune-adapter-"));
    const sourceRoot = join(root, "src");
    await mkdir(join(sourceRoot, "modules"), { recursive: true });
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await writeFile(join(root, "front.accdb"), "", "utf8");
    await writeFile(join(sourceRoot, "modules", "Live.bas"), "", "utf8");
    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "import-prune", accessPath: "front.accdb", destinationRoot: "src" }),
      "utf8",
    );

    const actions: string[] = [];
    const deletedBatches: string[][] = [];
    const service = new VbaSyncAdapter({
      cwd: root,
      env: {},
      executor: async (request) => {
        actions.push(request.action);
        if (request.action === "List-Objects") {
          return {
            exitCode: 0,
            stdout:
              'DYSFLOW_RESULT {"modules":["Live","Ghost"],"classes":[],"forms":[],"reports":[],"documentModules":[]}',
            stderr: "",
            durationMs: 1,
            timedOut: false,
          };
        }
        if (request.action === "Delete") {
          deletedBatches.push([...request.moduleNames]);
          return {
            exitCode: 0,
            stdout: 'DYSFLOW_RESULT {"ok":true,"deleted":["Ghost"]}',
            stderr: "",
            durationMs: 1,
            timedOut: false,
          };
        }
        return {
          exitCode: 0,
          stdout: 'DYSFLOW_RESULT {"ok":true}',
          stderr: "",
          durationMs: 1,
          timedOut: false,
        };
      },
    });

    const result = await service.execute("import_all", { prune: true, apply: true });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected import_all prune success");
    expect(actions).toEqual(["List-Objects", "Delete", "Import"]);
    expect(deletedBatches).toEqual([["Ghost"]]);
    expect(result.data).toMatchObject({
      operation: "import_all",
      prune: { applied: true, deleted: ["Ghost"] },
    });
  });

  it("import_all prune:true fails safely before delete when destinationRoot is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-import-prune-missing-root-"));
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await writeFile(join(root, "front.accdb"), "", "utf8");
    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "missing-src", accessPath: "front.accdb", destinationRoot: "src" }),
      "utf8",
    );

    const actions: string[] = [];
    const service = new VbaSyncAdapter({
      cwd: root,
      env: {},
      executor: async (request) => {
        actions.push(request.action);
        return {
          exitCode: 0,
          stdout:
            'DYSFLOW_RESULT {"modules":["Ghost"],"classes":[],"forms":[],"reports":[],"documentModules":[]}',
          stderr: "",
          durationMs: 1,
          timedOut: false,
        };
      },
    });

    const result = await service.execute("import_all", { prune: true, apply: true });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected missing source root failure");
    expect(result.error.code).toBe("IMPORT_PRUNE_SOURCE_UNSAFE");
    expect(actions).toEqual([]);
  });

  it("import_all prune:true fails safely before delete when source root has no managed source files", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-import-prune-empty-root-"));
    const sourceRoot = join(root, "src");
    await mkdir(sourceRoot, { recursive: true });
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await writeFile(join(root, "front.accdb"), "", "utf8");
    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "empty-src", accessPath: "front.accdb", destinationRoot: "src" }),
      "utf8",
    );

    const actions: string[] = [];
    const service = new VbaSyncAdapter({
      cwd: root,
      env: {},
      executor: async (request) => {
        actions.push(request.action);
        return {
          exitCode: 0,
          stdout:
            'DYSFLOW_RESULT {"modules":["Ghost"],"classes":[],"forms":[],"reports":[],"documentModules":[]}',
          stderr: "",
          durationMs: 1,
          timedOut: false,
        };
      },
    });

    const result = await service.execute("import_all", { prune: true, apply: true });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected empty source root failure");
    expect(result.error.code).toBe("IMPORT_PRUNE_SOURCE_UNSAFE");
    expect(actions).toEqual([]);
  });

  it("import_all prune:true fails safely before delete when source discovery fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-import-prune-discovery-fails-"));
    const sourceRoot = join(root, "src");
    await mkdir(sourceRoot, { recursive: true });
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await writeFile(join(root, "front.accdb"), "", "utf8");
    await writeFile(join(sourceRoot, "Live.bas"), "", "utf8");
    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "discovery-fails", accessPath: "front.accdb", destinationRoot: "src" }),
      "utf8",
    );

    const actions: string[] = [];
    const adapter = new VbaModulesAdapter(
      {
        scriptPath: "scripts/dysflow-vba-manager.ps1",
        cwd: root,
        env: {},
        executor: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: "",
          durationMs: 1,
          timedOut: false,
        }),
        resolveExecutionTarget: async () => ({
          ok: true,
          data: {
            configSource: "explicit-request",
            accessDbPath: join(root, "front.accdb"),
            accessPath: join(root, "front.accdb"),
            destinationRoot: sourceRoot,
            projectRoot: root,
          },
          diagnostics: [],
          durationMs: 0,
        }),
        validateStrictContext: () => ({
          ok: true,
          data: undefined,
          diagnostics: [],
          durationMs: 0,
        }),
        runPreflightCleanup: async () => ({
          cleaned: [],
          killed: [],
          orphanedKilled: [],
          errors: [],
          diagnostics: [],
        }),
        executeMappedTool: async (toolName) => {
          actions.push(toolName);
          return {
            ok: true,
            data: { modules: ["Ghost"], classes: [], forms: [], reports: [], documentModules: [] },
            diagnostics: [],
            durationMs: 0,
          };
        },
      },
      {
        mkdtemp: async () => root,
        readdir: async (path) => {
          if (path === sourceRoot) throw new Error("permission denied");
          return [];
        },
        readFile: async () => "",
        readFileBytes: async () => new Uint8Array(),
        rm: async () => undefined,
        tmpdir: () => tmpdir(),
      },
    );

    const result = await adapter.execute("import_all", { prune: true, apply: true });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected discovery failure");
    expect(result.error.code).toBe("IMPORT_PRUNE_SOURCE_UNSAFE");
    expect(actions).toEqual([]);
  });

  it("import_all prune:true fails safely before delete when a managed subfolder cannot be read", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-import-prune-subfolder-fails-"));
    const sourceRoot = join(root, "src");
    const modulesRoot = join(sourceRoot, "modules");
    const formsRoot = join(sourceRoot, "forms");
    await mkdir(modulesRoot, { recursive: true });
    await mkdir(formsRoot, { recursive: true });
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await writeFile(join(root, "front.accdb"), "", "utf8");
    await writeFile(join(modulesRoot, "Live.bas"), "", "utf8");
    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "subfolder-fails", accessPath: "front.accdb", destinationRoot: "src" }),
      "utf8",
    );

    const actions: string[] = [];
    const adapter = new VbaModulesAdapter(
      {
        scriptPath: "scripts/dysflow-vba-manager.ps1",
        cwd: root,
        env: {},
        executor: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: "",
          durationMs: 1,
          timedOut: false,
        }),
        resolveExecutionTarget: async () => ({
          ok: true,
          data: {
            configSource: "explicit-request",
            accessDbPath: join(root, "front.accdb"),
            accessPath: join(root, "front.accdb"),
            destinationRoot: sourceRoot,
            projectRoot: root,
          },
          diagnostics: [],
          durationMs: 0,
        }),
        validateStrictContext: () => ({
          ok: true,
          data: undefined,
          diagnostics: [],
          durationMs: 0,
        }),
        runPreflightCleanup: async () => ({
          cleaned: [],
          killed: [],
          orphanedKilled: [],
          errors: [],
          diagnostics: [],
        }),
        executeMappedTool: async (toolName) => {
          actions.push(toolName);
          return {
            ok: true,
            data: {
              modules: ["Live"],
              classes: [],
              forms: ["Main"],
              reports: [],
              documentModules: ["Form_Main"],
            },
            diagnostics: [],
            durationMs: 0,
          };
        },
      },
      {
        mkdtemp: async () => root,
        readdir: async (path) => {
          if (path === sourceRoot) return [];
          if (path === modulesRoot)
            return [{ name: "Live.bas", isDirectory: () => false, isFile: () => true }];
          if (path === formsRoot) throw new Error("permission denied reading forms");
          return [];
        },
        readFile: async () => "",
        readFileBytes: async () => new Uint8Array(),
        rm: async () => undefined,
        tmpdir: () => tmpdir(),
      },
    );

    const result = await adapter.execute("import_all", { prune: true, apply: true });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected managed subfolder discovery failure");
    expect(result.error.code).toBe("IMPORT_PRUNE_SOURCE_UNSAFE");
    expect(result.error.message).toContain("permission denied reading forms");
    expect(actions).toEqual([]);
  });

  it("import_all prune:true treats form/report source aliases as protecting Access objects and document modules", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-import-prune-doc-aliases-"));
    const sourceRoot = join(root, "src");
    await mkdir(join(sourceRoot, "forms"), { recursive: true });
    await mkdir(join(sourceRoot, "reports"), { recursive: true });
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await writeFile(join(root, "front.accdb"), "", "utf8");
    await writeFile(join(sourceRoot, "forms", "Form_Main.form.txt"), "", "utf8");
    await writeFile(join(sourceRoot, "reports", "Report_Invoice.report.txt"), "", "utf8");
    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "doc-aliases", accessPath: "front.accdb", destinationRoot: "src" }),
      "utf8",
    );

    const actions: string[] = [];
    const deletedBatches: string[][] = [];
    const service = new VbaSyncAdapter({
      cwd: root,
      env: {},
      executor: async (request) => {
        actions.push(request.action);
        if (request.action === "List-Objects") {
          return {
            exitCode: 0,
            stdout:
              'DYSFLOW_RESULT {"modules":["Ghost"],"classes":[],"forms":["Main"],"reports":["Invoice"],"documentModules":["Form_Main","Report_Invoice"]}',
            stderr: "",
            durationMs: 1,
            timedOut: false,
          };
        }
        if (request.action === "Delete") {
          deletedBatches.push([...request.moduleNames]);
          return {
            exitCode: 0,
            stdout: 'DYSFLOW_RESULT {"ok":true,"deleted":["Ghost"]}',
            stderr: "",
            durationMs: 1,
            timedOut: false,
          };
        }
        return {
          exitCode: 0,
          stdout: 'DYSFLOW_RESULT {"ok":true}',
          stderr: "",
          durationMs: 1,
          timedOut: false,
        };
      },
    });

    const result = await service.execute("import_all", { prune: true, apply: true });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected import_all prune success");
    expect(actions).toEqual(["List-Objects", "Delete", "Import"]);
    expect(deletedBatches).toEqual([["Ghost"]]);
    expect(result.data).toMatchObject({ prune: { applied: true, deleted: ["Ghost"] } });
  });

  it("import_all without prune keeps historical merge behavior — #555", async () => {
    const actions: string[] = [];
    const service = new VbaSyncAdapter({
      executor: async (request) => {
        actions.push(request.action);
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

    const result = await service.execute("import_all", { apply: true });

    expect(result.ok).toBe(true);
    expect(actions).toEqual(["Import"]);
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

    expect(calls[0]).toMatchObject({
      action: "Export",
      moduleNames: [],
      moduleNamesProvided: false,
    });
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

  it("verify_code supports selective module comparison", async () => {
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

    const result = await service.execute("verify_code", { moduleNames: ["Module1"] });

    expect(calls[0]).toMatchObject({
      action: "Export",
      moduleNames: ["Module1"],
      moduleNamesProvided: true,
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        operation: "verify_code",
        ok: true,
        matched: [{ moduleName: "Module1", fileType: "bas" }],
        different: [],
        missingInSource: [],
        missingInBinary: [],
      },
    });
  });

  it("verify_code with a moduleNames filter that matches nothing returns MODULE_NOT_FOUND", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-verify-notfound-adapter-"));
    const sourceRoot = join(root, "src");
    await mkdir(join(sourceRoot, "modules"), { recursive: true });
    await writeFile(join(sourceRoot, "modules", "Module1.bas"), "same", "utf8");
    const service = new VbaSyncAdapter({
      executor: async (request) => {
        await mkdir(join(request.destinationRoot, "modules"), { recursive: true });
        await writeFile(join(request.destinationRoot, "modules", "Module1.bas"), "same", "utf8");
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 2, timedOut: false };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: sourceRoot,
      env: {},
    });

    const result = await service.execute("verify_code", { moduleNames: ["GhostModule"] });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("MODULE_NOT_FOUND");
  });

  it("verify_code aggregates a source-newer recommendation when only source has functional lines", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-verify-reco-adapter-"));
    const sourceRoot = join(root, "src");
    await mkdir(join(sourceRoot, "modules"), { recursive: true });
    await writeFile(join(sourceRoot, "modules", "Module1.bas"), "Line A\nLine B\nLine C", "utf8");
    const service = new VbaSyncAdapter({
      executor: async (request) => {
        await mkdir(join(request.destinationRoot, "modules"), { recursive: true });
        await writeFile(
          join(request.destinationRoot, "modules", "Module1.bas"),
          "Line A\nLine B",
          "utf8",
        );
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 3, timedOut: false };
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
        recommendedAction: "import_to_binary",
        recommendation: expect.stringContaining("import"),
      },
    });
  });

  it("verify_code stays a safe dry-run and recommends a manual merge when both sides changed", async () => {
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

    const result = await service.execute("verify_code", { diff: true });

    expect(result).toMatchObject({
      ok: true,
      data: {
        operation: "verify_code",
        ok: false,
        dryRun: true,
        willModifyAccess: false,
        different: [{ moduleName: "Module1" }],
        recommendedAction: "manual_merge",
        recommendation: expect.any(String),
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

  it("import_all dry-run dedupes a form's .form.txt + .cls pair into a single module entry — #554", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-scan-dedup-"));
    await mkdir(join(root, "src", "forms"), { recursive: true });
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await writeFile(join(root, "front.accdb"), "", "utf8");

    // A form exported as BOTH artifacts: layout (.form.txt) and code-behind (.cls).
    await writeFile(join(root, "src", "forms", "Form_Main.form.txt"), "", "utf8");
    await writeFile(join(root, "src", "forms", "Form_Main.cls"), "", "utf8");

    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "dedup-project", accessPath: "front.accdb", destinationRoot: "src" }),
      "utf8",
    );
    const service = new VbaSyncAdapter({ cwd: root, env: {} });

    const result = await service.execute("import_all", { dryRun: true });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected dry-run success");
    const planned = (result.data as { modulesPlanned: string[] }).modulesPlanned;
    // The pair must collapse to exactly one module, not two.
    expect(planned).toEqual(["Form_Main"]);
  });

  it("export_all --prune deletes disk modules absent from the exported set after a clean export", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-prune-clean-"));
    const sourceRoot = join(root, "src");
    await mkdir(join(sourceRoot, "modules"), { recursive: true });
    await mkdir(join(sourceRoot, "forms"), { recursive: true });
    await mkdir(join(sourceRoot, "queries"), { recursive: true });
    await writeFile(join(sourceRoot, "modules", "Live.bas"), "live", "utf8");
    await writeFile(join(sourceRoot, "modules", "Obsolete.bas"), "old", "utf8");
    await writeFile(join(sourceRoot, "forms", "Form_Gone.form.txt"), "ui", "utf8");
    await writeFile(join(sourceRoot, "forms", "Form_Gone.cls"), "code", "utf8");
    await writeFile(join(sourceRoot, "queries", "qryActive.sql"), "SELECT 1", "utf8");

    const service = new VbaSyncAdapter({
      executor: async () => ({
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true,"exported":["Live"]}',
        stderr: "",
        durationMs: 5,
        timedOut: false,
      }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: sourceRoot,
      env: {},
    });

    const result = await service.execute("export_all", { prune: true });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.data).toMatchObject({ prune: { applied: true } });

    // Live module and saved queries survive — queries are never pruned.
    expect(await readFile(join(sourceRoot, "modules", "Live.bas"), "utf8")).toBe("live");
    expect(await readFile(join(sourceRoot, "queries", "qryActive.sql"), "utf8")).toBe("SELECT 1");

    // Orphans (both the .form.txt UI and its .cls code-behind) are removed.
    await expect(readFile(join(sourceRoot, "modules", "Obsolete.bas"), "utf8")).rejects.toThrow();
    await expect(
      readFile(join(sourceRoot, "forms", "Form_Gone.form.txt"), "utf8"),
    ).rejects.toThrow();
    await expect(readFile(join(sourceRoot, "forms", "Form_Gone.cls"), "utf8")).rejects.toThrow();
  });

  it("export_all --prune does NOT delete anything when the export reported warnings", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-prune-warned-"));
    const sourceRoot = join(root, "src");
    await mkdir(join(sourceRoot, "modules"), { recursive: true });
    await writeFile(join(sourceRoot, "modules", "Live.bas"), "live", "utf8");
    await writeFile(join(sourceRoot, "modules", "Obsolete.bas"), "old", "utf8");

    const service = new VbaSyncAdapter({
      executor: async () => ({
        exitCode: 0,
        stdout:
          'DYSFLOW_RESULT {"ok":true,"exported":["Live"],"warnings":[{"module":"Form_X","error":"open in design view"}]}',
        stderr: "",
        durationMs: 5,
        timedOut: false,
      }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: sourceRoot,
      env: {},
    });

    const result = await service.execute("export_all", { prune: true });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.data).toMatchObject({ prune: { applied: false, reason: "export-had-warnings" } });

    // A non-clean export must never trigger deletions: the orphan survives.
    expect(await readFile(join(sourceRoot, "modules", "Obsolete.bas"), "utf8")).toBe("old");
  });

  it("export_all without prune never deletes orphan files", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-prune-off-"));
    const sourceRoot = join(root, "src");
    await mkdir(join(sourceRoot, "modules"), { recursive: true });
    await writeFile(join(sourceRoot, "modules", "Obsolete.bas"), "old", "utf8");

    const service = new VbaSyncAdapter({
      executor: async () => ({
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true,"exported":["Live"]}',
        stderr: "",
        durationMs: 5,
        timedOut: false,
      }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: sourceRoot,
      env: {},
    });

    const result = await service.execute("export_all", {});

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(await readFile(join(sourceRoot, "modules", "Obsolete.bas"), "utf8")).toBe("old");
    expect(result.data).not.toHaveProperty("prune");
  });

  it("export_all --prune rejects a filtered export (would delete everything else)", async () => {
    let executorCalled = false;
    const service = new VbaSyncAdapter({
      executor: async () => {
        executorCalled = true;
        return {
          exitCode: 0,
          stdout: 'DYSFLOW_RESULT {"ok":true}',
          stderr: "",
          durationMs: 1,
          timedOut: false,
        };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo/src",
      env: {},
    });

    const result = await service.execute("export_all", { prune: true, filter: "Live" });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("INVALID_INPUT");
    // Must fail BEFORE running any export — a filtered prune is never partially applied.
    expect(executorCalled).toBe(false);
  });

  it("export_all --prune does NOT delete when exported is entirely absent from payload (#689)", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-prune-no-exported-"));
    const sourceRoot = join(root, "src");
    await mkdir(join(sourceRoot, "modules"), { recursive: true });
    await writeFile(join(sourceRoot, "modules", "Live.bas"), "live", "utf8");
    await writeFile(join(sourceRoot, "modules", "Orphan.bas"), "old", "utf8");

    // Malformed success payload: no `exported` field at all.
    const service = new VbaSyncAdapter({
      executor: async () => ({
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true}',
        stderr: "",
        durationMs: 5,
        timedOut: false,
      }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: sourceRoot,
      env: {},
    });

    const result = await service.execute("export_all", { prune: true });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.data).toMatchObject({
      prune: { applied: false, reason: "exported-missing-or-invalid", deleted: [] },
    });
    // No orphan deletion must have occurred.
    expect(await readFile(join(sourceRoot, "modules", "Live.bas"), "utf8")).toBe("live");
    expect(await readFile(join(sourceRoot, "modules", "Orphan.bas"), "utf8")).toBe("old");
  });

  it("export_all --prune does NOT delete when exported is not an array (#689)", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-prune-exported-not-array-"));
    const sourceRoot = join(root, "src");
    await mkdir(join(sourceRoot, "modules"), { recursive: true });
    await writeFile(join(sourceRoot, "modules", "Live.bas"), "live", "utf8");
    await writeFile(join(sourceRoot, "modules", "Orphan.bas"), "old", "utf8");

    // Malformed success payload: `exported` is a string instead of an array.
    const service = new VbaSyncAdapter({
      executor: async () => ({
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true,"exported":"Live"}',
        stderr: "",
        durationMs: 5,
        timedOut: false,
      }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: sourceRoot,
      env: {},
    });

    const result = await service.execute("export_all", { prune: true });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.data).toMatchObject({
      prune: { applied: false, reason: "exported-missing-or-invalid", deleted: [] },
    });
    // No orphan deletion must have occurred.
    expect(await readFile(join(sourceRoot, "modules", "Live.bas"), "utf8")).toBe("live");
    expect(await readFile(join(sourceRoot, "modules", "Orphan.bas"), "utf8")).toBe("old");
  });

  it("export_all --prune does NOT delete when exported is null (#689)", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-prune-exported-null-"));
    const sourceRoot = join(root, "src");
    await mkdir(join(sourceRoot, "modules"), { recursive: true });
    await writeFile(join(sourceRoot, "modules", "Live.bas"), "live", "utf8");
    await writeFile(join(sourceRoot, "modules", "Orphan.bas"), "old", "utf8");

    // Null is not an array.
    const service = new VbaSyncAdapter({
      executor: async () => ({
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true,"exported":null}',
        stderr: "",
        durationMs: 5,
        timedOut: false,
      }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: sourceRoot,
      env: {},
    });

    const result = await service.execute("export_all", { prune: true });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.data).toMatchObject({
      prune: { applied: false, reason: "exported-missing-or-invalid", deleted: [] },
    });
    expect(await readFile(join(sourceRoot, "modules", "Live.bas"), "utf8")).toBe("live");
    expect(await readFile(join(sourceRoot, "modules", "Orphan.bas"), "utf8")).toBe("old");
  });

  it.each([
    ['[{"name":"Live"}]', "an object"],
    ["[null]", "null"],
    ["[123]", "a number"],
  ])("export_all --prune does NOT delete when exported contains %s (#689)", async (exportedJson) => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-prune-exported-bad-entry-"));
    const sourceRoot = join(root, "src");
    await mkdir(join(sourceRoot, "modules"), { recursive: true });
    await writeFile(join(sourceRoot, "modules", "Live.bas"), "live", "utf8");
    await writeFile(join(sourceRoot, "modules", "Orphan.bas"), "old", "utf8");

    const service = new VbaSyncAdapter({
      executor: async () => ({
        exitCode: 0,
        stdout: `DYSFLOW_RESULT {"ok":true,"exported":${exportedJson}}`,
        stderr: "",
        durationMs: 5,
        timedOut: false,
      }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: sourceRoot,
      env: {},
    });

    const result = await service.execute("export_all", { prune: true });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.data).toMatchObject({
      prune: { applied: false, reason: "exported-missing-or-invalid", deleted: [] },
    });
    expect(await readFile(join(sourceRoot, "modules", "Live.bas"), "utf8")).toBe("live");
    expect(await readFile(join(sourceRoot, "modules", "Orphan.bas"), "utf8")).toBe("old");
  });

  describe("export_all prune allow-list parity (#619)", () => {
    it("export_all prune never deletes .frm orphan files (#619)", async () => {
      const root = await mkdtemp(join(tmpdir(), "dysflow-prune-frm-orphan-"));
      const sourceRoot = join(root, "src");
      await mkdir(join(sourceRoot, "modules"), { recursive: true });
      await writeFile(join(sourceRoot, "modules", "Live.bas"), "live", "utf8");
      // Legacy .frm binary form format — NOT in the AGENTS.md documented allow-list
      // (`.bas`/`.cls`/`.form.txt`/`.report.txt`). Prune must leave it alone.
      await writeFile(join(sourceRoot, "modules", "LegacyForm.frm"), "binary", "utf8");

      const service = new VbaSyncAdapter({
        executor: async () => ({
          exitCode: 0,
          stdout: 'DYSFLOW_RESULT {"ok":true,"exported":["Live"]}',
          stderr: "",
          durationMs: 5,
          timedOut: false,
        }),
        scriptPath: "scripts/dysflow-vba-manager.ps1",
        accessPath: "C:/db/front.accdb",
        destinationRoot: sourceRoot,
        env: {},
      });

      const result = await service.execute("export_all", { prune: true });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      const prune = (result.data as { prune: { applied: boolean; deleted: string[] } }).prune;
      expect(prune.applied).toBe(true);
      expect(prune.deleted).not.toContain(join(sourceRoot, "modules", "LegacyForm.frm"));
      // The .frm file must still exist on disk — prune never touched it.
      expect(await readFile(join(sourceRoot, "modules", "LegacyForm.frm"), "utf8")).toBe("binary");
    });

    it("export_all prune keeps .bas and .cls orphans deletable (#619)", async () => {
      const root = await mkdtemp(join(tmpdir(), "dysflow-prune-bas-cls-allow-list-"));
      const sourceRoot = join(root, "src");
      await mkdir(join(sourceRoot, "modules"), { recursive: true });
      await mkdir(join(sourceRoot, "classes"), { recursive: true });
      await writeFile(join(sourceRoot, "modules", "Live.bas"), "live", "utf8");
      // Positive control: .bas and .cls ARE in the AGENTS.md documented allow-list,
      // so orphans with these extensions MUST still be pruned normally.
      await writeFile(join(sourceRoot, "modules", "OrphanMod.bas"), "old", "utf8");
      await writeFile(join(sourceRoot, "classes", "OrphanClass.cls"), "old", "utf8");

      const service = new VbaSyncAdapter({
        executor: async () => ({
          exitCode: 0,
          stdout: 'DYSFLOW_RESULT {"ok":true,"exported":["Live"]}',
          stderr: "",
          durationMs: 5,
          timedOut: false,
        }),
        scriptPath: "scripts/dysflow-vba-manager.ps1",
        accessPath: "C:/db/front.accdb",
        destinationRoot: sourceRoot,
        env: {},
      });

      const result = await service.execute("export_all", { prune: true });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      const prune = (result.data as { prune: { applied: boolean; deleted: string[] } }).prune;
      expect(prune.applied).toBe(true);
      expect(prune.deleted).toContain(join(sourceRoot, "modules", "OrphanMod.bas"));
      expect(prune.deleted).toContain(join(sourceRoot, "classes", "OrphanClass.cls"));
      // Both orphan files are gone from disk.
      await expect(
        readFile(join(sourceRoot, "modules", "OrphanMod.bas"), "utf8"),
      ).rejects.toThrow();
      await expect(
        readFile(join(sourceRoot, "classes", "OrphanClass.cls"), "utf8"),
      ).rejects.toThrow();
    });

    it("export_all prune ignores .txt and other non-allow-listed extensions (#619)", async () => {
      const root = await mkdtemp(join(tmpdir(), "dysflow-prune-txt-allow-list-"));
      const sourceRoot = join(root, "src");
      await mkdir(join(sourceRoot, "modules"), { recursive: true });
      await writeFile(join(sourceRoot, "modules", "Live.bas"), "live", "utf8");
      // Arbitrary non-allow-listed extension: prune must not delete it even when
      // the basename has no matching VBE module.
      await writeFile(join(sourceRoot, "modules", "notes.txt"), "scratch", "utf8");

      const service = new VbaSyncAdapter({
        executor: async () => ({
          exitCode: 0,
          stdout: 'DYSFLOW_RESULT {"ok":true,"exported":["Live"]}',
          stderr: "",
          durationMs: 5,
          timedOut: false,
        }),
        scriptPath: "scripts/dysflow-vba-manager.ps1",
        accessPath: "C:/db/front.accdb",
        destinationRoot: sourceRoot,
        env: {},
      });

      const result = await service.execute("export_all", { prune: true });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      const prune = (result.data as { prune: { applied: boolean; deleted: string[] } }).prune;
      expect(prune.applied).toBe(true);
      expect(prune.deleted).not.toContain(join(sourceRoot, "modules", "notes.txt"));
      // .txt file remains untouched.
      expect(await readFile(join(sourceRoot, "modules", "notes.txt"), "utf8")).toBe("scratch");
    });

    it("export_all prune adversarial .frm masquerade attempt — not deleted even when no VBE match (#619)", async () => {
      const root = await mkdtemp(join(tmpdir(), "dysflow-prune-frm-masquerade-"));
      const sourceRoot = join(root, "src");
      await mkdir(join(sourceRoot, "modules"), { recursive: true });
      await writeFile(join(sourceRoot, "modules", "Live.bas"), "live", "utf8");
      // Adversarial case: a .frm named after a module name that does NOT exist in the
      // live VBE inventory. The name matches the basename pattern that *would* be
      // considered an orphan for a .bas/.cls file, but the .frm extension must keep
      // prune from touching it.
      await writeFile(join(sourceRoot, "modules", "ImportantModule.frm"), "binary", "utf8");

      const service = new VbaSyncAdapter({
        executor: async () => ({
          exitCode: 0,
          stdout: 'DYSFLOW_RESULT {"ok":true,"exported":["Live"]}',
          stderr: "",
          durationMs: 5,
          timedOut: false,
        }),
        scriptPath: "scripts/dysflow-vba-manager.ps1",
        accessPath: "C:/db/front.accdb",
        destinationRoot: sourceRoot,
        env: {},
      });

      const result = await service.execute("export_all", { prune: true });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      const prune = (result.data as { prune: { applied: boolean; deleted: string[] } }).prune;
      expect(prune.applied).toBe(true);
      expect(prune.deleted).not.toContain(join(sourceRoot, "modules", "ImportantModule.frm"));
      // Masquerading .frm survives prune.
      expect(await readFile(join(sourceRoot, "modules", "ImportantModule.frm"), "utf8")).toBe(
        "binary",
      );
    });
  });
});
