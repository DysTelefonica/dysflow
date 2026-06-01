import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  VbaExecutionAdapter,
  type VbaSyncOrchestrator,
} from "../../../src/adapters/vba-sync/vba-execution-adapter";
import { successResult } from "../../../src/core/contracts/index";

describe("VbaExecutionAdapter", () => {
  it("handles execution tools", () => {
    expect(VbaExecutionAdapter.handles("run_vba")).toBe(true);
    expect(VbaExecutionAdapter.handles("test_vba")).toBe(true);
    expect(VbaExecutionAdapter.handles("compile_vba")).toBe(true);
    expect(VbaExecutionAdapter.handles("export_modules")).toBe(false);
  });

  it("maps compile_vba to orchestrator executeMappedTool", async () => {
    const executeMappedTool = vi.fn().mockResolvedValue(successResult({ ok: true }));
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("compile_vba", {
      accessPath: "C:/custom/front.accdb",
      destinationRoot: "C:/repo",
    });

    expect(result).toMatchObject({
      ok: true,
      data: { ok: true },
    });
    expect(executeMappedTool).toHaveBeenCalledWith(
      "compile_vba",
      { accessPath: "C:/custom/front.accdb", destinationRoot: "C:/repo" },
      expect.objectContaining({ action: "Compile", json: true }),
    );
  });

  it("maps test_vba direct calls to a Run-Tests procedures JSON payload", async () => {
    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult([{ ok: true, procedure: "Test_RunAll" }]));
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", {
      procedureName: "Test_RunAll",
      argsJson: '["fixture", 1]',
      destinationRoot: "C:/repo",
    });

    expect(result).toMatchObject({
      ok: true,
      data: [{ ok: true, procedure: "Test_RunAll" }],
    });
    expect(executeMappedTool).toHaveBeenCalledWith(
      "test_vba",
      expect.objectContaining({
        proceduresJson: JSON.stringify([{ procedure: "Test_RunAll", args: ["fixture", 1] }]),
      }),
      expect.any(Object),
    );
  });

  it("uses explicit test_vba proceduresJson without resolving a manifest", async () => {
    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult([{ ok: true, procedure: "Test_X" }]));
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify([{ procedure: "Test_X", args: [] }]),
      testsPath: "missing-manifest.json",
    });

    expect(result).toMatchObject({
      ok: true,
      data: [{ ok: true, procedure: "Test_X" }],
    });
    expect(executeMappedTool).toHaveBeenCalledWith(
      "test_vba",
      expect.objectContaining({
        proceduresJson: JSON.stringify([{ procedure: "Test_X", args: [] }]),
      }),
      expect.any(Object),
    );
  });

  it("loads test_vba manifests from testsPath and filters by name, procedure, or tags", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-tests-adapter-"));
    await writeFile(
      join(root, "tests.vba.json"),
      JSON.stringify({
        tests: [
          {
            name: "smoke import",
            procedure: "Test_Import",
            args: ["a"],
            tags: ["smoke"],
          },
          {
            name: "slow export",
            procedure: "Test_Export",
            args: ["b"],
            tags: ["slow"],
          },
        ],
      }),
      "utf8",
    );

    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult([{ ok: true, procedure: "Test_Import" }]));
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: root,
    };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", {
      testsPath: "tests.vba.json",
      filter: "smoke",
    });

    expect(result).toMatchObject({
      ok: true,
      data: [{ ok: true, procedure: "Test_Import" }],
    });
    expect(executeMappedTool).toHaveBeenCalledWith(
      "test_vba",
      expect.objectContaining({
        proceduresJson: JSON.stringify([{ procedure: "Test_Import", args: ["a"] }]),
      }),
      expect.any(Object),
    );
  });

  it("resolves relative test_vba testsPath from project root, not destinationRoot", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-proj-root-tests-adapter-"));
    await mkdir(join(root, "tests"), { recursive: true });
    await writeFile(
      join(root, "tests", "tests.vba.json"),
      JSON.stringify([{ procedure: "Test_ProjectRoot", args: [] }]),
      "utf8",
    );

    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult([{ ok: true, procedure: "Test_ProjectRoot" }]));
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: root,
    };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", {
      testsPath: "tests/tests.vba.json",
      destinationRoot: join(root, "src"),
    });

    expect(result).toMatchObject({
      ok: true,
      data: [{ ok: true, procedure: "Test_ProjectRoot" }],
    });
  });

  it("supports pipe-separated OR filters for test_vba manifests", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-filter-or-adapter-"));
    await writeFile(
      join(root, "tests.vba.json"),
      JSON.stringify([
        { name: "import", procedure: "Test_A", args: ["a"] },
        { name: "export", procedure: "Test_B", args: ["b"] },
        { name: "skip", procedure: "Test_C", args: ["c"] },
      ]),
      "utf8",
    );

    const executeMappedTool = vi.fn().mockResolvedValue(successResult([{ ok: true }]));
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: root,
    };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", {
      testsPath: "tests.vba.json",
      filter: "Test_A|Test_B",
    });

    expect(result.ok).toBe(true);
    expect(executeMappedTool).toHaveBeenCalledWith(
      "test_vba",
      expect.objectContaining({
        proceduresJson: JSON.stringify([
          { procedure: "Test_A", args: ["a"] },
          { procedure: "Test_B", args: ["b"] },
        ]),
      }),
      expect.any(Object),
    );
  });

  it("returns VBA_NO_TESTS_SELECTED without calling orchestrator when test_vba filter matches nothing", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-empty-filter-adapter-"));
    await writeFile(
      join(root, "tests.vba.json"),
      JSON.stringify([{ procedure: "Test_A", args: [] }]),
      "utf8",
    );

    const executeMappedTool = vi.fn();
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: root,
    };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", {
      testsPath: "tests.vba.json",
      filter: "Missing_Test",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VBA_NO_TESTS_SELECTED" },
    });
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("returns VBA_NO_TESTS_SELECTED when proceduresJson is empty", async () => {
    const executeMappedTool = vi.fn();
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", { proceduresJson: "[]" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VBA_NO_TESTS_SELECTED" },
    });
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("runs compile before test_vba plan execution when compile is requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-compile-tests-adapter-"));
    await writeFile(
      join(root, "tests.vba.json"),
      JSON.stringify([{ procedure: "Test_RunAll", args: [] }]),
      "utf8",
    );

    const executeMappedTool = vi.fn().mockImplementation((toolName) => {
      if (toolName === "compile_vba") return Promise.resolve(successResult({ ok: true }));
      return Promise.resolve(successResult([{ ok: true }]));
    });
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: root,
    };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", { compile: true });

    expect(result.ok).toBe(true);
    expect(executeMappedTool).toHaveBeenCalledTimes(2);
    expect(executeMappedTool).toHaveBeenNthCalledWith(
      1,
      "compile_vba",
      expect.objectContaining({ compile: true }),
      expect.objectContaining({ action: "Compile", json: true }),
    );
    expect(executeMappedTool).toHaveBeenNthCalledWith(
      2,
      "test_vba",
      expect.objectContaining({ compile: true }),
      expect.objectContaining({ action: "Run-Tests", json: true }),
    );
  });

  it("returns VBA_INVALID_TEST_PLAN when the test plan file is missing", async () => {
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool: vi.fn(),
      cwd: "C:/nonexistent-dir",
    };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", {
      testsPath: "nonexistent.json",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VBA_INVALID_TEST_PLAN" },
    });
  });

  it("returns VBA_INVALID_TEST_PLAN when argsJson contains invalid JSON", async () => {
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool: vi.fn(),
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", {
      procedureName: "Test_Run",
      argsJson: "{ not valid json }",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VBA_INVALID_TEST_PLAN" },
    });
  });

  it("returns TOOL_NOT_IMPLEMENTED for an unsupported tool name", async () => {
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool: vi.fn(),
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator);
    const result = await adapter.execute("unsupported_tool", {});
    expect(result).toMatchObject({
      ok: false,
      error: { code: "TOOL_NOT_IMPLEMENTED" },
    });
  });

  it("short-circuits when compile_vba fails during test_vba with compile:true", async () => {
    const executeMappedTool = vi.fn().mockImplementation((toolName) => {
      if (toolName === "compile_vba") {
        return Promise.resolve({
          ok: false as const,
          error: {
            code: "VBA_MANAGER_FAILED" as const,
            message: "compile error",
            retryable: false,
          },
          diagnostics: [],
          durationMs: 5,
        });
      }
      return Promise.resolve(successResult([{ ok: true }]));
    });
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", {
      compile: true,
      procedureName: "Test_Compile",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VBA_MANAGER_FAILED");
    // Should not have called executeMappedTool for test_vba (stopped after compile failure)
    expect(executeMappedTool).toHaveBeenCalledTimes(1);
  });

  it("returns result unchanged from orchestrator when test data is not an array (non-array result shape)", async () => {
    // inspectTestResult: when result.ok=true but result.data is not an array, returns result as-is
    const executeMappedTool = vi.fn().mockResolvedValue(successResult({ summary: "all passed" })); // not an array
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", { procedureName: "Test_Run" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ summary: "all passed" });
    }
  });

  it("returns VBA_INVALID_TEST_PLAN when proceduresJson contains invalid JSON", async () => {
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool: vi.fn(),
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", {
      proceduresJson: "{ not valid json }",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VBA_INVALID_TEST_PLAN");
  });

  it("returns VBA_INVALID_TEST_PLAN when proceduresJson has non-object entries", async () => {
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool: vi.fn(),
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify(["string-item-not-object"]),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VBA_INVALID_TEST_PLAN");
  });

  it("returns VBA_TESTS_FAILED when any test result has ok: false", async () => {
    const executeMappedTool = vi.fn().mockResolvedValue(
      successResult([
        { ok: true, procedure: "Test_A" },
        { ok: false, procedure: "Test_B", error: "Assert failed" },
      ]),
    );
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", { procedureName: "Test_B" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VBA_TESTS_FAILED" },
    });
  });
});
