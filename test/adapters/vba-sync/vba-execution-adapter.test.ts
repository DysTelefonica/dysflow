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

  // --- vba_inline_execution guardrails (#533) ---------------------------------

  function makeInlineAdapter() {
    const executeMappedTool = vi.fn().mockResolvedValue(successResult({ ok: true }));
    const resolveExecutionTarget = vi
      .fn()
      .mockResolvedValue(successResult({ destinationRoot: "C:/repo/src", projectRoot: "C:/repo" }));
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: "C:/repo",
      resolveExecutionTarget,
    };
    const fileSystem = {
      writeFile: vi.fn().mockResolvedValue(undefined),
      rm: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = new VbaExecutionAdapter(orchestrator, fileSystem);
    return { adapter, executeMappedTool, fileSystem };
  }

  it("rejects inline code over the 1024-char cap before doing any work (#533)", async () => {
    const { adapter, executeMappedTool, fileSystem } = makeInlineAdapter();
    const result = await adapter.execute("vba_inline_execution", { code: "a".repeat(1025) });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(fileSystem.writeFile).not.toHaveBeenCalled();
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("rejects inline code that closes its own procedure block (#533)", async () => {
    const { adapter, fileSystem } = makeInlineAdapter();
    const result = await adapter.execute("vba_inline_execution", {
      code: 'Debug.Print "x"\nEnd Sub',
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(fileSystem.writeFile).not.toHaveBeenCalled();
  });

  it("clamps the inline timeout to the 30s ceiling (#533)", async () => {
    const { adapter, executeMappedTool } = makeInlineAdapter();
    await adapter.execute("vba_inline_execution", {
      code: 'Debug.Print "ok"',
      timeoutMs: 120_000,
    });
    for (const toolName of ["import_modules", "run_vba"]) {
      const call = executeMappedTool.mock.calls.find((c) => c[0] === toolName);
      expect(call, `expected a ${toolName} call`).toBeDefined();
      expect((call?.[1] as { timeoutMs?: number }).timeoutMs).toBe(30_000);
    }
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

  it("returns VBA_INVALID_TEST_PLAN when proceduresJson has entries that are neither strings nor objects", async () => {
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool: vi.fn(),
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify([123]),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VBA_INVALID_TEST_PLAN");
      // The error should teach the valid shape, not just reject.
      expect(result.error.message).toContain("procedure");
    }
  });

  it("accepts proceduresJson shorthand: an array of procedure-name strings", async () => {
    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult([{ ok: true, procedure: "Test_Shorthand" }]));
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: "C:/repo" };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify(["Test_Shorthand"]),
    });

    expect(result.ok).toBe(true);
    // Shorthand strings are normalized to the canonical { procedure, args } shape.
    expect(executeMappedTool).toHaveBeenCalledWith(
      "test_vba",
      expect.objectContaining({
        proceduresJson: JSON.stringify([{ procedure: "Test_Shorthand", args: [] }]),
      }),
      expect.any(Object),
    );
  });

  it("accepts proceduresJson mixing shorthand strings and full objects", async () => {
    const executeMappedTool = vi.fn().mockResolvedValue(successResult([{ ok: true }]));
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: "C:/repo" };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify(["Test_A", { procedure: "Test_B", args: ["x"] }]),
    });

    expect(result.ok).toBe(true);
    expect(executeMappedTool).toHaveBeenCalledWith(
      "test_vba",
      expect.objectContaining({
        proceduresJson: JSON.stringify([
          { procedure: "Test_A", args: [] },
          { procedure: "Test_B", args: ["x"] },
        ]),
      }),
      expect.any(Object),
    );
  });

  it("rejects an empty or whitespace procedure-name string in proceduresJson", async () => {
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool: vi.fn(),
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify(["   "]),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VBA_INVALID_TEST_PLAN");
  });

  it("accepts a shorthand string array from a testsPath manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-shorthand-manifest-"));
    await writeFile(join(root, "tests.vba.json"), JSON.stringify(["Test_FromManifest"]), "utf8");
    const executeMappedTool = vi.fn().mockResolvedValue(successResult([{ ok: true }]));
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: root };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", { testsPath: "tests.vba.json" });

    expect(result.ok).toBe(true);
    expect(executeMappedTool).toHaveBeenCalledWith(
      "test_vba",
      expect.objectContaining({
        proceduresJson: JSON.stringify([{ procedure: "Test_FromManifest", args: [] }]),
      }),
      expect.any(Object),
    );
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

  it("preserves structured failure detail when one procedure fails among passing ones", async () => {
    const results = [
      { ok: true, procedure: "Test_A", durationMs: 5 },
      {
        ok: false,
        procedure: "Test_B",
        error: "Assert failed",
        logs: ["expected 1", "got 2"],
        durationMs: 123,
        payload: { ok: false, error: "Assert failed" },
      },
    ];
    const executeMappedTool = vi.fn().mockResolvedValue(successResult(results));
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: "C:/repo" };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", { procedureName: "Test_B" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VBA_TESTS_FAILED");
    // The message must name the failing procedure so the MCP text rendering shows it.
    expect(result.error.message).toContain("Test_B");
    expect(result.error.message).toContain("Assert failed");
    expect(result.error.details).toMatchObject({
      failedCount: 1,
      failures: [
        {
          procedure: "Test_B",
          error: "Assert failed",
          logs: ["expected 1", "got 2"],
          durationMs: 123,
          payload: { ok: false, error: "Assert failed" },
        },
      ],
    });
    // The full per-procedure report (including the passing one) is retained.
    expect((result.error.details?.results as unknown[]).length).toBe(2);
  });

  it("captures every failing procedure when multiple tests fail", async () => {
    const results = [
      { ok: false, procedure: "Test_B", error: "Assert failed", durationMs: 10 },
      { ok: true, procedure: "Test_C" },
      { ok: false, procedure: "Test_D", error: "Timeout", logs: ["slow"], durationMs: 999 },
    ];
    const executeMappedTool = vi.fn().mockResolvedValue(successResult(results));
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: "C:/repo" };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify([
        { procedure: "Test_B" },
        { procedure: "Test_C" },
        { procedure: "Test_D" },
      ]),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("2 VBA test(s) failed");
    const details = result.error.details as {
      failedCount: number;
      failures: { procedure?: string }[];
    };
    expect(details.failedCount).toBe(2);
    expect(details.failures.map((f) => f.procedure)).toEqual(["Test_B", "Test_D"]);
  });

  it("preserves a COM exception captured as ok:false (null payload, empty logs)", async () => {
    const results = [
      {
        ok: false,
        procedure: "Test_Throws",
        error: "Run-time error '91': Object variable not set",
        payload: null,
        logs: [],
        durationMs: 7,
      },
    ];
    const executeMappedTool = vi.fn().mockResolvedValue(successResult(results));
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: "C:/repo" };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", { procedureName: "Test_Throws" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("Test_Throws");
    const details = result.error.details as {
      failures: { procedure?: string; error?: string; payload: unknown; logs: unknown[] }[];
    };
    expect(details.failures[0]).toMatchObject({
      procedure: "Test_Throws",
      error: "Run-time error '91': Object variable not set",
      payload: null,
      logs: [],
    });
  });

  it("still reports a failure with no error string and an unparseable payload", async () => {
    const results = [{ ok: false, procedure: "Test_NoMessage", payload: "<<not-json>>" }];
    const executeMappedTool = vi.fn().mockResolvedValue(successResult(results));
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: "C:/repo" };
    const adapter = new VbaExecutionAdapter(orchestrator);

    const result = await adapter.execute("test_vba", { procedureName: "Test_NoMessage" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("Test_NoMessage");
    const details = result.error.details as {
      failures: { procedure?: string; error?: string; payload: unknown }[];
    };
    const [failure] = details.failures;
    expect(failure?.procedure).toBe("Test_NoMessage");
    expect(failure?.payload).toBe("<<not-json>>");
    expect(failure?.error).toBeUndefined();
  });
});
