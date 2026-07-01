import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  VbaExecutionAdapter,
  type VbaSyncOrchestrator,
} from "../../../src/adapters/vba-sync/vba-execution-adapter";
import { successResult } from "../../../src/core/contracts/index";

/**
 * PR1b (#621 F1) — allowlist forwarded to `new VbaExecutionAdapter(...)` so
 * the default-deny gate does NOT fire on the existing test fixtures (which
 * were written before the gate existed and use these synthetic procedure
 * names). The new gate-specific tests deliberately pass their own allowlists
 * (or `undefined` to exercise the refusal branches) instead of this constant.
 *
 * Keep this list in sync with every `procedureName`, `"procedure": "..."`,
 * and `procedure: "..."` literal used in `adapter.execute("test_vba", ...)`
 * calls below. The gate's per-test-plan atomicity check compares every
 * extracted procedure name against this set; a missing entry turns a
 * previously-green test red with `MCP_INPUT_INVALID`.
 */
const TEST_ALLOWED_PROCEDURES: readonly string[] = [
  "Test_A",
  "Test_Allowed",
  "Test_AlsoAllowed",
  "Test_B",
  "Test_C",
  "Test_Compile",
  "Test_D",
  "Test_DefaultDiscovery",
  "Test_DefaultDiscovery_NotUsed",
  "Test_DeleteAll",
  "Test_Export",
  "Test_FromAbsolutePath",
  "Test_FromCwd",
  "Test_FromDestinationRoot",
  "Test_FromManifest",
  "Test_FromRootManifest",
  "Test_FromTestsSubdir",
  "Test_Import",
  "Test_NoMessage",
  "Test_ProjectRoot",
  "Test_Run",
  "Test_RunAll",
  "Test_Sanitized",
  "Test_Shorthand",
  "Test_Throws",
  "Test_X",
];

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, fileSystem, TEST_ALLOWED_PROCEDURES);
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

  it("rejects inline code containing blocklisted unsafe keywords case-insensitively while allowing concatenated words", async () => {
    const { adapter, fileSystem } = makeInlineAdapter();

    for (const kw of ["Declare", "Shell", "CreateObject", "GetObject", "Lib"]) {
      const result = await adapter.execute("vba_inline_execution", {
        code: `Debug.Print "hello"\n${kw} something`,
      });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error(`expected rejection for keyword ${kw}`);
      expect(result.error.code).toBe("INVALID_INPUT");
      expect(result.error.message).toContain("Unsafe keywords detected in inline VBA snippet");
      expect(fileSystem.writeFile).not.toHaveBeenCalled();
    }

    const resultUpper = await adapter.execute("vba_inline_execution", {
      code: 'CREATEOBJECT("Scripting.FileSystemObject")',
    });
    expect(resultUpper.ok).toBe(false);
    if (resultUpper.ok) throw new Error("expected rejection for CREATEOBJECT");
    expect(resultUpper.error.code).toBe("INVALID_INPUT");

    const resultAllowed = await adapter.execute("vba_inline_execution", {
      code: 'Dim myLib As String\nShellExecute 0, "open", "cmd.exe"',
    });
    expect(resultAllowed.ok).toBe(true);

    const resultLibBlocked = await adapter.execute("vba_inline_execution", {
      code: "Dim lib As Object",
    });
    expect(resultLibBlocked.ok).toBe(false);
    if (resultLibBlocked.ok) throw new Error("expected rejection for lib keyword");
    expect(resultLibBlocked.error.code).toBe("INVALID_INPUT");

    const resultLibVarAllowed = await adapter.execute("vba_inline_execution", {
      code: "Dim libVar As Object",
    });
    expect(resultLibVarAllowed.ok).toBe(true);
  });

  it("refuses inline execution when destinationRoot is inside the production runtime (#548)", async () => {
    const executeMappedTool = vi.fn().mockResolvedValue(successResult({ ok: true }));
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: "C:/runtime/dysflow",
      env: { DYSFLOW_HOME: "C:/runtime/dysflow" } as NodeJS.ProcessEnv,
      resolveExecutionTarget: vi
        .fn()
        .mockResolvedValue(successResult({ destinationRoot: "C:/runtime/dysflow/app" })),
    };
    const fileSystem = {
      writeFile: vi.fn().mockResolvedValue(undefined),
      rm: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = new VbaExecutionAdapter(orchestrator, fileSystem, TEST_ALLOWED_PROCEDURES);

    const result = await adapter.execute("vba_inline_execution", { code: 'Debug.Print "x"' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(fileSystem.writeFile).not.toHaveBeenCalled();
    expect(executeMappedTool).not.toHaveBeenCalled();
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

  it("executes inline code using a stable __dysflow_inline__ module name, compiles, runs, and cleans up", async () => {
    const { adapter, executeMappedTool, fileSystem } = makeInlineAdapter();

    executeMappedTool.mockImplementation((toolName, _params) => {
      if (toolName === "delete_module") return Promise.resolve(successResult({ ok: true }));
      if (toolName === "import_modules") return Promise.resolve(successResult({ ok: true }));
      if (toolName === "compile_vba") return Promise.resolve(successResult({ ok: true }));
      if (toolName === "run_vba") return Promise.resolve(successResult("success return"));
      return Promise.resolve(successResult({ ok: true }));
    });

    const result = await adapter.execute("vba_inline_execution", {
      code: 'Debug.Print "Hello World"',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe("success return");
    }

    expect(fileSystem.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("__dysflow_inline__.bas"),
      expect.stringContaining('Attribute VB_Name = "__dysflow_inline__"'),
    );
    expect(fileSystem.rm).toHaveBeenCalledWith(
      expect.stringContaining("__dysflow_inline__.bas"),
      expect.objectContaining({ force: true }),
    );

    const callNames = executeMappedTool.mock.calls.map((c) => c[0]);
    expect(callNames).toEqual([
      "delete_module",
      "import_modules",
      "compile_vba",
      "run_vba",
      "delete_module",
    ]);
  });

  it("maps test_vba direct calls to a Run-Tests procedures JSON payload", async () => {
    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult([{ ok: true, procedure: "Test_RunAll" }]));
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);
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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

    const result = await adapter.execute("test_vba", {
      proceduresJson: "{ not valid json }",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VBA_INVALID_TEST_PLAN");
  });

  it("sanitizes proceduresJson by stripping leading BOM, whitespace, and markdown code blocks", async () => {
    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult([{ ok: true, procedure: "Test_Sanitized" }]));
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: "C:/repo" };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

    const payloads = [
      '\uFEFF[\n  "Test_Sanitized"\n]',
      '   \n\t   ["Test_Sanitized"]  \n  ',
      '```json\n[\n  "Test_Sanitized"\n]\n```',
      '```\n["Test_Sanitized"]\n```',
      ' \n\t  ```json\n["Test_Sanitized"]\n```\t ',
    ];

    for (const payload of payloads) {
      const result = await adapter.execute("test_vba", {
        proceduresJson: payload,
      });

      expect(result.ok).toBe(true);
      expect(executeMappedTool).toHaveBeenCalledWith(
        "test_vba",
        expect.objectContaining({
          proceduresJson: JSON.stringify([{ procedure: "Test_Sanitized", args: [] }]),
        }),
        expect.any(Object),
      );
      vi.clearAllMocks();
    }
  });

  it("returns VBA_INVALID_TEST_PLAN when proceduresJson has entries that are neither strings nor objects", async () => {
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool: vi.fn(),
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

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

  // --- Hotfix: resolveTestProceduresJson guardrails + default discovery -------------
  //
  // Regression coverage for the bug where dysflow_test_vba returned
  //   `VBA_INVALID_TEST_PLAN: ENOENT: no such file or directory ... [PATH]`
  // because `resolveTestProceduresJson` had no guard on projectRoot/cwd and
  // never searched the `tests/tests.vba.json` location real projects use.

  it("discovers tests/tests.vba.json at project root when testsPath is omitted (hotfix default-search)", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-default-discovery-tests-subdir-"));
    await mkdir(join(root, "tests"), { recursive: true });
    await writeFile(
      join(root, "tests", "tests.vba.json"),
      JSON.stringify([{ procedure: "Test_FromTestsSubdir", args: [] }]),
      "utf8",
    );

    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult([{ ok: true, procedure: "Test_FromTestsSubdir" }]));
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: root };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

    const result = await adapter.execute("test_vba", {}); // no testsPath

    expect(result).toMatchObject({
      ok: true,
      data: [{ ok: true, procedure: "Test_FromTestsSubdir" }],
    });
  });

  it("discovers tests.vba.json at project root when testsPath is omitted (hotfix default-search)", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-default-discovery-root-"));
    await writeFile(
      join(root, "tests.vba.json"),
      JSON.stringify([{ procedure: "Test_FromRootManifest", args: [] }]),
      "utf8",
    );

    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult([{ ok: true, procedure: "Test_FromRootManifest" }]));
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: root };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

    const result = await adapter.execute("test_vba", {}); // no testsPath

    expect(result).toMatchObject({
      ok: true,
      data: [{ ok: true, procedure: "Test_FromRootManifest" }],
    });
  });

  it("returns VBA_INVALID_TEST_PLAN with details.candidates when default discovery finds no manifest (hotfix)", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-default-discovery-none-"));
    // intentionally do NOT create any tests.vba.json anywhere

    const executeMappedTool = vi.fn();
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: root };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

    const result = await adapter.execute("test_vba", {}); // no testsPath

    expect(result).toMatchObject({ ok: false, error: { code: "VBA_INVALID_TEST_PLAN" } });
    if (result.ok) return;
    const details = result.error.details as { candidates?: unknown };
    expect(Array.isArray(details?.candidates)).toBe(true);
    const candidates = details?.candidates as string[];
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((c) => c.includes("tests.vba.json"))).toBe(true);
    expect(result.error.message).toContain("Provide proceduresJson");
    // Must not have invoked the runner with no manifest.
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("uses an absolute testsPath literally and does not fall back to default discovery (hotfix)", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-abs-tests-path-"));
    // Create a manifest at the default-discovery location so default search WOULD find it.
    await writeFile(
      join(root, "tests.vba.json"),
      JSON.stringify([{ procedure: "Test_DefaultDiscovery", args: [] }]),
      "utf8",
    );

    const absolutePath = join(root, "elsewhere", "my-tests.json");
    const executeMappedTool = vi.fn();
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: root };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

    const result = await adapter.execute("test_vba", { testsPath: absolutePath });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VBA_INVALID_TEST_PLAN" },
    });
    // Absolute path is passed literally; default discovery must NOT substitute the root manifest.
    if (result.ok) return;
    const details = result.error.details as { candidates?: unknown };
    expect(Array.isArray(details?.candidates)).toBe(true);
    const candidates = details?.candidates as string[];
    expect(candidates).toContain(absolutePath);
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("returns VBA_INVALID_TEST_PLAN with details.candidates when an explicit relative testsPath is missing (hotfix)", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-rel-tests-missing-"));

    const executeMappedTool = vi.fn();
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: root };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

    const result = await adapter.execute("test_vba", { testsPath: "missing.json" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VBA_INVALID_TEST_PLAN" },
    });
    if (result.ok) return;
    const details = result.error.details as { candidates?: unknown };
    expect(Array.isArray(details?.candidates)).toBe(true);
    const candidates = details?.candidates as string[];
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toBe(join(root, "missing.json"));
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("falls back to orchestrator cwd when params.projectRoot is empty (hotfix)", async () => {
    // Explicit empty projectRoot means "no projectRoot provided" — fall back to cwd.
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-empty-projectroot-"));
    await writeFile(
      join(root, "tests.vba.json"),
      JSON.stringify([{ procedure: "Test_FromCwd", args: [] }]),
      "utf8",
    );

    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult([{ ok: true, procedure: "Test_FromCwd" }]));
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: root };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

    const result = await adapter.execute("test_vba", { projectRoot: "" });

    expect(result).toMatchObject({
      ok: true,
      data: [{ ok: true, procedure: "Test_FromCwd" }],
    });
  });

  it("returns a clear VBA_INVALID_TEST_PLAN error when both projectRoot and orchestrator cwd are empty (hotfix)", async () => {
    const executeMappedTool = vi.fn();
    // Cast to bypass the `cwd: string` interface contract while exercising the defensive guardrail.
    const orchestrator = {
      executeMappedTool,
      cwd: "",
    } as unknown as VbaSyncOrchestrator;
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

    const result = await adapter.execute("test_vba", { projectRoot: "" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VBA_INVALID_TEST_PLAN" },
    });
    if (result.ok) return;
    expect(result.error.message).toMatch(/projectRoot|orchestrator cwd|cannot be located/);
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("uses an absolute testsPath literally and succeeds when the file exists (hotfix absolute-success)", async () => {
    // Regression test: the existing absolute-path hotfix tests only the FAILURE
    // branch (absolute path missing). This test proves the SUCCESS branch: when
    // the absolute path points to a real manifest, the adapter MUST use it
    // literally and MUST NOT silently fall back to default discovery at
    // projectRoot — even when a same-named default-discovery file exists.
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-abs-tests-path-exists-"));
    // Same-named default-discovery file at projectRoot MUST NOT win.
    await writeFile(
      join(root, "tests.vba.json"),
      JSON.stringify([{ procedure: "Test_DefaultDiscovery_NotUsed", args: [] }]),
      "utf8",
    );

    const absoluteDir = join(root, "absolute-manifest-folder");
    await mkdir(absoluteDir, { recursive: true });
    const absolutePath = join(absoluteDir, "absolute-manifest.json");
    await writeFile(
      absolutePath,
      JSON.stringify([{ procedure: "Test_FromAbsolutePath", args: ["abs"] }]),
      "utf8",
    );

    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult([{ ok: true, procedure: "Test_FromAbsolutePath" }]));
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: root };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

    const result = await adapter.execute("test_vba", { testsPath: absolutePath });

    expect(result).toMatchObject({
      ok: true,
      data: [{ ok: true, procedure: "Test_FromAbsolutePath" }],
    });
    // The proceduresJson MUST derive from the absolute manifest — if the
    // adapter had silently fallen back to default discovery at projectRoot,
    // it would carry "Test_DefaultDiscovery_NotUsed" instead.
    expect(executeMappedTool).toHaveBeenCalledWith(
      "test_vba",
      expect.objectContaining({
        proceduresJson: JSON.stringify([{ procedure: "Test_FromAbsolutePath", args: ["abs"] }]),
      }),
      expect.any(Object),
    );
  });

  it("falls back to destinationRoot when it differs from projectRoot and carries tests/tests.vba.json (hotfix dest-root-fallback)", async () => {
    // Regression test: `buildTestManifestCandidates` MUST search destinationRoot
    // when it differs from projectRoot and the default-discovery file lives
    // there. Without this branch, real projects whose projectRoot is bare
    // (e.g. only sources) but whose manifest lives under a different
    // destinationRoot would still get VBA_INVALID_TEST_PLAN.
    const projectRoot = await mkdtemp(
      join(tmpdir(), "dysflow-vba-destroot-fallback-project-root-"),
    );
    const destinationRoot = await mkdtemp(
      join(tmpdir(), "dysflow-vba-destroot-fallback-destination-root-"),
    );
    // Intentionally do NOT seed any manifest under projectRoot.
    // Seed `tests/tests.vba.json` (the new location) under destinationRoot only.
    await mkdir(join(destinationRoot, "tests"), { recursive: true });
    await writeFile(
      join(destinationRoot, "tests", "tests.vba.json"),
      JSON.stringify([{ procedure: "Test_FromDestinationRoot", args: ["dest"] }]),
      "utf8",
    );

    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult([{ ok: true, procedure: "Test_FromDestinationRoot" }]));
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: projectRoot };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

    // No testsPath: adapter must walk projectRoot first (no manifest there),
    // then fall back to destinationRoot and find the manifest there.
    const result = await adapter.execute("test_vba", {
      projectRoot,
      destinationRoot,
    });

    expect(result).toMatchObject({
      ok: true,
      data: [{ ok: true, procedure: "Test_FromDestinationRoot" }],
    });
    expect(executeMappedTool).toHaveBeenCalledWith(
      "test_vba",
      expect.objectContaining({
        proceduresJson: JSON.stringify([{ procedure: "Test_FromDestinationRoot", args: ["dest"] }]),
      }),
      expect.any(Object),
    );
  });

  // --- PR1b (#621 F1) — test_vba default-deny gate in VbaExecutionAdapter -------
  //
  // PR1a added the gate at the MCP adapter boundary (`handleMcpVbaExecute`),
  // which covers `run_vba` and `dysflow_vba_execute`. `test_vba` does NOT
  // route through that handler — it routes through `VbaSyncAdapter` →
  // `VbaExecutionAdapter.executeTestVba`. This block exercises the parallel
  // gate added in PR1b so the contract-truth gap ("read-only" tool that ran
  // arbitrary compiled VBA via `proceduresJson: '[{"procedure":"DeleteAll",
  // "args":[]}]'`) stays closed for `test_vba` too.
  //
  // Gate semantics mirror the MCP-handler gate in `canonical-handlers.ts`:
  //   1. When `allowedProcedures` is undefined OR empty, refuse unless the
  //      caller passes `dryRun: true` (default-deny).
  //   2. When `allowedProcedures` is configured, ALL procedures in the plan
  //      must be in the list — the plan is atomic.
  //
  // The tests construct an adapter with no allowlist (the default) and assert
  // the observable gate behavior at the port: `result.ok` is false AND the
  // runner (`executeMappedTool`) is NOT invoked. They do NOT assert on private
  // call order or internal data shape.

  function makeUnconfiguredAdapter(executeMappedTool = vi.fn()): {
    adapter: VbaExecutionAdapter;
    executeMappedTool: typeof executeMappedTool;
  } {
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: "C:/repo",
    };
    // No `allowedProcedures` passed — exercises the default-deny branch.
    return { adapter: new VbaExecutionAdapter(orchestrator), executeMappedTool };
  }

  it("PR1b — refuses test_vba when allowedProcedures is unconfigured AND no dryRun (default-deny)", async () => {
    const { adapter, executeMappedTool } = makeUnconfiguredAdapter();
    const result = await adapter.execute("test_vba", {
      procedureName: "Test_RunAll",
      argsJson: "[]",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected default-deny refusal");
    // Same `MCP_INPUT_INVALID` code as PR1a's MCP-handler gate so consumers can
    // grep for the same string regardless of which layer caught the call.
    expect(result.error.code).toBe("MCP_INPUT_INVALID");
    expect(result.error.message).toContain("allowedProcedures");
    expect(result.error.message).toContain("dryRun");
    expect(result.error.message).toContain("Test_RunAll");
    // The runner MUST NOT be invoked — the gate short-circuits before any
    // PowerShell spawn.
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("PR1b — refuses test_vba when allowedProcedures is empty AND no dryRun (default-deny)", async () => {
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool: vi.fn(),
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, []);
    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify([{ procedure: "Test_DeleteAll", args: [] }]),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected default-deny refusal for empty allowlist");
    expect(result.error.code).toBe("MCP_INPUT_INVALID");
    expect(result.error.message).toContain("allowedProcedures");
    expect(result.error.message).toContain("Test_DeleteAll");
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("PR1b — accepts test_vba when allowedProcedures is unconfigured AND dryRun:true (escape hatch)", async () => {
    const { adapter, executeMappedTool } = makeUnconfiguredAdapter(
      vi.fn().mockResolvedValue(successResult([{ ok: true, procedure: "Test_Anything" }])),
    );

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify([{ procedure: "Test_Anything", args: [] }]),
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([{ ok: true, procedure: "Test_Anything" }]);
    }
    expect(executeMappedTool).toHaveBeenCalledWith(
      "test_vba",
      expect.objectContaining({
        proceduresJson: JSON.stringify([{ procedure: "Test_Anything", args: [] }]),
      }),
      expect.any(Object),
    );
  });

  it("PR1b — accepts test_vba when procedure is in the configured allowedProcedures list", async () => {
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool: vi
        .fn()
        .mockResolvedValue(successResult([{ ok: true, procedure: "Test_Allowed" }])),
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, [
      "Test_Allowed",
      "Test_AlsoAllowed",
    ]);

    const result = await adapter.execute("test_vba", {
      procedureName: "Test_Allowed",
      argsJson: "[]",
    });

    expect(result.ok).toBe(true);
    expect(orchestrator.executeMappedTool).toHaveBeenCalledWith(
      "test_vba",
      expect.objectContaining({
        proceduresJson: JSON.stringify([{ procedure: "Test_Allowed", args: [] }]),
      }),
      expect.any(Object),
    );
  });

  it("PR1b — refuses test_vba when procedure is NOT in the configured allowedProcedures list (even with dryRun:true)", async () => {
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool: vi.fn(),
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, ["Test_Allowed"]);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify([{ procedure: "Test_NotInList", args: [] }]),
      dryRun: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected refusal for procedure outside allowlist");
    expect(result.error.code).toBe("MCP_INPUT_INVALID");
    expect(result.error.message).toContain("Test_NotInList");
    expect(result.error.message).toContain("allowedProcedures");
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("PR1b — refuses a multi-procedure plan when ANY procedure is outside the allowlist", async () => {
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool: vi.fn(),
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, ["Test_Allowed"]);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify([
        { procedure: "Test_Allowed", args: [] },
        { procedure: "Test_NotInList", args: [] },
      ]),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected refusal when plan mixes allowed + disallowed");
    expect(result.error.code).toBe("MCP_INPUT_INVALID");
    // The message MUST name the offending procedure(s) so the consumer can
    // adjust the allowlist or the plan.
    expect(result.error.message).toContain("Test_NotInList");
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("PR1b — accepts a multi-procedure plan when ALL procedures are in the allowlist", async () => {
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool: vi.fn().mockResolvedValue(successResult([{ ok: true }])),
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, [
      "Test_Allowed",
      "Test_AlsoAllowed",
    ]);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify([
        { procedure: "Test_Allowed", args: [] },
        { procedure: "Test_AlsoAllowed", args: ["x"] },
      ]),
    });

    expect(result.ok).toBe(true);
    expect(orchestrator.executeMappedTool).toHaveBeenCalledWith(
      "test_vba",
      expect.objectContaining({
        proceduresJson: JSON.stringify([
          { procedure: "Test_Allowed", args: [] },
          { procedure: "Test_AlsoAllowed", args: ["x"] },
        ]),
      }),
      expect.any(Object),
    );
  });

  it("PR1b — gate fires AFTER manifest resolution (procedures from testsPath still go through the gate)", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vba-pr1b-manifest-gate-"));
    await writeFile(
      join(root, "tests.vba.json"),
      JSON.stringify([{ procedure: "Test_FromManifest", args: [] }]),
      "utf8",
    );

    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool: vi.fn(),
      cwd: root,
    };
    // Allowlist does NOT contain Test_FromManifest — gate must catch it after
    // the adapter loads the manifest.
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, ["Test_Other"]);

    const result = await adapter.execute("test_vba", { testsPath: "tests.vba.json" });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected gate to fire after manifest resolution");
    expect(result.error.code).toBe("MCP_INPUT_INVALID");
    expect(result.error.message).toContain("Test_FromManifest");
    expect(result.error.message).toContain("allowedProcedures");
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("PR1b — compile_vba is NOT subject to the test_vba gate (only execution is gated)", async () => {
    // PR1b scope: the gate is on EXECUTING test plans. `compile_vba` only
    // compiles the VBA project — it does not run any procedure — so the gate
    // does not apply to it. This pins the boundary so a future refactor does
    // not silently widen the gate to cover `compile_vba`.
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool: vi.fn().mockResolvedValue(successResult({ ok: true })),
      cwd: "C:/repo",
    };
    // No allowlist, no dryRun — the gate would normally refuse test execution.
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

    // Compile-only path with no plan: compile_vba still runs; the result is
    // VBA_INVALID_TEST_PLAN (existing behavior, NOT a gate error).
    const result = await adapter.execute("test_vba", { compile: true });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected VBA_INVALID_TEST_PLAN, not success");
    expect(result.error.code).toBe("VBA_INVALID_TEST_PLAN");
    expect(result.error.code).not.toBe("MCP_INPUT_INVALID");
    expect(orchestrator.executeMappedTool).toHaveBeenCalledTimes(1);
    expect(orchestrator.executeMappedTool).toHaveBeenCalledWith(
      "compile_vba",
      expect.objectContaining({ compile: true }),
      expect.any(Object),
    );
  });
});
