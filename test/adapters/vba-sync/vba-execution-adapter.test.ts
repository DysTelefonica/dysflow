import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  VbaExecutionAdapter,
  type VbaSyncOrchestrator,
} from "../../../src/adapters/vba-sync/vba-execution-adapter";
import {
  createDysflowError,
  failureResult,
  successResult,
} from "../../../src/core/contracts/index";

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
    // feat-759-no-compile (v1.19.0) — compile_vba is no longer handled.
    expect(VbaExecutionAdapter.handles("compile_vba")).toBe(false);
    expect(VbaExecutionAdapter.handles("export_modules")).toBe(false);
  });

  it("compile_vba is refused as TOOL_NOT_IMPLEMENTED (feat-759-no-compile hard break)", async () => {
    // v1.19.0 — compile_vba is removed end-to-end. VbaExecutionAdapter.execute
    // refuses it with TOOL_NOT_IMPLEMENTED (defense-in-depth; the upstream
    // dispatch never routes it).
    const executeMappedTool = vi.fn();
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: "C:/repo",
    };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, TEST_ALLOWED_PROCEDURES);

    const result = await adapter.execute("compile_vba", {
      accessPath: "C:/custom/front.accdb",
      destinationRoot: "C:/repo",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected compile_vba refusal, not success");
    expect(result.error.code).toBe("TOOL_NOT_IMPLEMENTED");
    expect(executeMappedTool).not.toHaveBeenCalled();
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

  it("rejects a trailing bare string literal before any write with caller-relative remediation (#850)", async () => {
    const { adapter, executeMappedTool, fileSystem } = makeInlineAdapter();
    const result = await adapter.execute("vba_inline_execution", {
      code: 'Dim value As String\nvalue = "valid"\n"OK" \' return it',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error).toMatchObject({
      code: "INVALID_INPUT",
      details: { line: 3 },
      remediation: 'Assign the return value explicitly: result = "OK"',
    });
    expect(fileSystem.writeFile).not.toHaveBeenCalled();
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("renders embedded quotes with VBA escaping in bare-literal remediation (#850)", async () => {
    const { adapter } = makeInlineAdapter();
    const result = await adapter.execute("vba_inline_execution", { code: '"a""b"' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.remediation).toBe('Assign the return value explicitly: result = "a""b"');
  });

  it("rejects an unterminated string with a caller-relative line before any write (#850)", async () => {
    const { adapter, executeMappedTool, fileSystem } = makeInlineAdapter();
    const result = await adapter.execute("vba_inline_execution", {
      code: 'Dim value As String\nvalue = "unterminated',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error).toMatchObject({
      code: "INVALID_INPUT",
      details: { line: 2 },
      remediation: "Close the string literal on line 2 before retrying.",
    });
    expect(fileSystem.writeFile).not.toHaveBeenCalled();
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("accepts quotes inside a VBA Rem comment without reporting an unterminated string (#850)", async () => {
    const { adapter } = makeInlineAdapter();
    const result = await adapter.execute("vba_inline_execution", {
      code: '  Rem explain the "legacy value',
    });
    expect(result.ok).toBe(true);
  });

  it("does not mistake strings or comments in valid statements for trailing bare literals (#850)", async () => {
    const { adapter, executeMappedTool } = makeInlineAdapter();
    for (const code of [
      'result = "OK"',
      'Debug.Print "OK"',
      'result = "a""b" \' quoted content',
      '\' "OK" is only a comment\nresult = 1',
    ]) {
      const result = await adapter.execute("vba_inline_execution", { code });
      expect(result.ok, code).toBe(true);
    }
    expect(executeMappedTool).toHaveBeenCalled();
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

  it("executes inline code using a stable __dysflow_inline__ module name, runs, and cleans up (compile is gone in v1.19.0)", async () => {
    // feat-759-no-compile (v1.19.0) — inline execution no longer makes an
    // explicit compile step. The flow is now import -> run -> cleanup.
    // Access implicitly validates the procedure at call time.
    const { adapter, executeMappedTool, fileSystem } = makeInlineAdapter();

    executeMappedTool.mockImplementation((toolName, _params) => {
      if (toolName === "delete_module") return Promise.resolve(successResult({ ok: true }));
      if (toolName === "import_modules") return Promise.resolve(successResult({ ok: true }));
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
    expect(callNames).toEqual(["delete_module", "import_modules", "run_vba", "delete_module"]);
  });

  it("wraps the snippet in a Function that returns `result` (#786)", async () => {
    // #786 — inline must be able to RETURN a value so it is usable for
    // read-only introspection (e.g. `result = "Attrs=" & fld.Attributes`).
    // The snippet is wrapped in a Function whose return is a bare `result`
    // variable; a `Sub` wrapper would silently discard the value. Assert on
    // the exact source written to the temp .bas — the byte contract the VBE
    // imports.
    const { adapter, fileSystem } = makeInlineAdapter();

    await adapter.execute("vba_inline_execution", { code: 'result = "ok"' });

    const written = fileSystem.writeFile.mock.calls[0]?.[1] as string;
    expect(written).toContain("Public Function ExecuteInline() As Variant");
    expect(written).toContain("ExecuteInline = result");
    expect(written).not.toContain("Public Sub ExecuteInline");
  });

  it("runs the inline snippet by its BARE procedure name, not module-qualified (#786)", async () => {
    // #786 — Application.Run treats a dotted prefix as a PROJECT qualifier, so
    // passing "__dysflow_inline__.ExecuteInline" made Access look for a project
    // named "__dysflow_inline__" and fail with "no encuentra el procedimiento".
    // run_vba must receive the bare procedure name so the snippet resolves.
    const { adapter, executeMappedTool } = makeInlineAdapter();

    await adapter.execute("vba_inline_execution", { code: 'result = "ok"' });

    const runCall = executeMappedTool.mock.calls.find((c) => c[0] === "run_vba");
    expect(runCall, "expected a run_vba call").toBeDefined();
    const runParams = runCall?.[1] as { procedureName?: string };
    expect(runParams.procedureName).toBe("ExecuteInline");
    expect(runParams.procedureName).not.toContain("__dysflow_inline__.");
  });

  it("returns run_vba's public returnValue payload for explicit result assignment (#850)", async () => {
    const { adapter, executeMappedTool } = makeInlineAdapter();
    executeMappedTool.mockImplementation((toolName) =>
      Promise.resolve(
        toolName === "run_vba"
          ? successResult({ result: "OK", returnValue: "OK" })
          : successResult({ ok: true }),
      ),
    );
    const result = await adapter.execute("vba_inline_execution", { code: 'result = "OK"' });
    expect(result).toMatchObject({ ok: true, data: { returnValue: "OK" } });
  });

  it("inspects cleanup OperationResult failures, preserves the primary error, and attempts both cleanups (#850)", async () => {
    const { adapter, executeMappedTool, fileSystem } = makeInlineAdapter();
    let deleteCalls = 0;
    executeMappedTool.mockImplementation((toolName) => {
      if (toolName === "run_vba") {
        return Promise.resolve(failureResult(createDysflowError("VBA_SYNTAX_ERROR", "bad syntax")));
      }
      if (toolName === "delete_module" && ++deleteCalls === 2) {
        return Promise.resolve(
          failureResult(createDysflowError("DELETE_FAILED", "module remained")),
        );
      }
      return Promise.resolve(successResult({ ok: true }));
    });
    fileSystem.rm
      .mockRejectedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("file remained"));

    const result = await adapter.execute("vba_inline_execution", { code: "result = missingName" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected primary failure");
    expect(result.error.code).toBe("VBA_SYNTAX_ERROR");
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "warning",
          message: expect.stringContaining("DELETE_FAILED"),
        }),
        expect.objectContaining({
          level: "warning",
          message: expect.stringContaining("file remained"),
        }),
      ]),
    );
    expect(executeMappedTool.mock.calls.filter((call) => call[0] === "delete_module")).toHaveLength(
      2,
    );
    expect(fileSystem.rm).toHaveBeenCalledTimes(2);
  });

  it("fails a successful execution when the temporary module cannot be removed (#850)", async () => {
    const { adapter, executeMappedTool } = makeInlineAdapter();
    let deleteCalls = 0;
    executeMappedTool.mockImplementation((toolName) => {
      if (toolName === "run_vba") return Promise.resolve(successResult({ returnValue: "OK" }));
      if (toolName === "delete_module" && ++deleteCalls === 2) {
        return Promise.resolve(
          failureResult(createDysflowError("DELETE_FAILED", "module remained")),
        );
      }
      return Promise.resolve(successResult({ ok: true }));
    });

    const result = await adapter.execute("vba_inline_execution", { code: 'result = "OK"' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected cleanup failure");
    expect(result.error.code).toBe("INLINE_CLEANUP_FAILED");
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("DELETE_FAILED") }),
      ]),
    );
  });

  it.each([
    ["import failure", "import_modules", "IMPORT_FAILED"],
    ["execution timeout", "run_vba", "VBA_MANAGER_TIMEOUT"],
  ])("cleans both temporary artifacts after %s (#850)", async (_case, failingTool, code) => {
    const { adapter, executeMappedTool, fileSystem } = makeInlineAdapter();
    executeMappedTool.mockImplementation((toolName) => {
      if (toolName === failingTool) {
        return Promise.resolve(failureResult(createDysflowError(code, `${failingTool} failed`)));
      }
      return Promise.resolve(successResult({ ok: true }));
    });

    const result = await adapter.execute("vba_inline_execution", { code: 'result = "OK"' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected phase failure");
    expect(result.error.code).toBe(code);
    expect(executeMappedTool.mock.calls.at(-1)?.[0]).toBe("delete_module");
    expect(fileSystem.rm).toHaveBeenCalledTimes(2);
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

  // feat-759-no-compile (v1.19.0) — the "runs compile before test_vba
  // when compile is requested" test was deleted because compile is gone.
  // The runner no longer makes a compile_vba call before test_vba; the
  // human compiles in Access (Debug > Compile).

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

  // feat-759-no-compile (v1.19.0) — the "short-circuits when compile_vba
  // fails during test_vba" test was deleted because compile is gone.
  // No runner call is made before test_vba anymore.

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
    // #757 (F6) — same `MCP_ALLOWLIST_NOT_CONFIGURED` code as PR1a's MCP-handler
    // gate so consumers grep for the same string regardless of which layer caught
    // the call (was the generic MCP_INPUT_INVALID before the split).
    expect(result.error.code).toBe("MCP_ALLOWLIST_NOT_CONFIGURED");
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
    expect(result.error.code).toBe("MCP_ALLOWLIST_NOT_CONFIGURED");
    expect(result.error.message).toContain("allowedProcedures");
    expect(result.error.message).toContain("Test_DeleteAll");
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("PR1b + Round-3 Item 5 — test_vba with dryRun:true is plan-only (no runner call, no Access spawn)", async () => {
    // Round-3 Item 5: when dryRun:true is set, test_vba short-circuits to a
    // plan-shaped result WITHOUT invoking the orchestrator's executeMappedTool.
    // Previously dryRun:true was an "escape hatch" that let the runner fire;
    // the unified contract is now "dryRun=true → plan, dryRun absent → execute"
    // so consumers can review the plan before committing real test execution.
    // The gate's default-deny bypass for unconfigured allowlists still fires
    // (dryRun:true satisfies the gate so execution would otherwise be allowed);
    // the short-circuit just replaces the runner call with the plan shape.
    const { adapter, executeMappedTool } = makeUnconfiguredAdapter(
      vi.fn().mockResolvedValue(successResult([{ ok: true, procedure: "Test_Anything" }])),
    );

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify([{ procedure: "Test_Anything", args: [] }]),
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected dry-run plan success");
    expect(result.data).toMatchObject({
      dryRun: true,
      willExecute: false,
      willModifyAccess: false,
      plan: {
        procedureName: ["Test_Anything"],
        proceduresCount: 1,
        warnings: [],
        errors: [],
      },
    });
    // No PowerShell / no Access — the short-circuit fires before the runner.
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("Round-3 Item 5 — test_vba with dryRun:true and configured allowlist returns a plan WITHOUT calling the runner", async () => {
    // Round-3 Item 5 RED test: the consumer-facing contract that must hold.
    // When allowedProcedures is configured and contains the procedure, dryRun:true
    // must return a plan-shaped result (no runner call) — matching the spec.
    const executeMappedTool = vi.fn();
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: "C:/repo" };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, ["Test_A"]);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify([{ procedure: "Test_A", args: [] }]),
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected plan-only success");
    expect(result.data).toMatchObject({
      dryRun: true,
      willExecute: false,
      willModifyAccess: false,
      plan: {
        procedureName: ["Test_A"],
        proceduresCount: 1,
      },
    });
    // The orchestrator must NOT receive a test_vba call — no runner spawn.
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  // feat-759-no-compile (v1.19.0) — the "Round-3 Item 5 — test_vba with
  // dryRun:true and compile:true" test was deleted because compile is
  // gone from the runtime; compile no longer participates in any path.

  it("Round-3 Item 5 — test_vba WITHOUT dryRun executes the runner (existing behavior preserved)", async () => {
    // Contraparte: when dryRun is absent, the original execute path runs —
    // plan resolution → gate → executeMappedTool (compile is gone in v1.19.0,
    // so the runner now follows the gate directly without a preceding
    // acCmdCompileAndSaveAllModules step).
    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult([{ ok: true, procedure: "Test_A" }]));
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: "C:/repo" };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, ["Test_A"]);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify([{ procedure: "Test_A", args: [] }]),
    });

    expect(result.ok).toBe(true);
    expect(executeMappedTool).toHaveBeenCalledTimes(1);
    expect(executeMappedTool).toHaveBeenCalledWith(
      "test_vba",
      expect.objectContaining({
        proceduresJson: JSON.stringify([{ procedure: "Test_A", args: [] }]),
      }),
      expect.any(Object),
    );
  });

  it("Round-3 Item 5 — test_vba with dryRun:false executes the runner (explicit opt-out)", async () => {
    // Explicit dryRun:false must preserve the legacy "execute" path.
    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult([{ ok: true, procedure: "Test_A" }]));
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: "C:/repo" };
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, ["Test_A"]);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify([{ procedure: "Test_A", args: [] }]),
      dryRun: false,
    });

    expect(result.ok).toBe(true);
    expect(executeMappedTool).toHaveBeenCalledTimes(1);
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

  // #748 — VbaExecutionAdapter must accept a per-input resolver function
  // (AllowedProcedures resolver from #674) instead of a frozen array captured
  // at constructor time. This is the fix for the "stale allowedProcedures"
  // issue where the project config was edited but the MCP runtime kept the
  // old allowlist because it was loaded once at startup.
  it("#748 — accepts test_vba when allowedProcedures is a per-input resolver function (cross-project leak fix #674)", async () => {
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool: vi
        .fn()
        .mockResolvedValue(successResult([{ ok: true, procedure: "Test_Allowed" }])),
      cwd: "C:/repo",
    };
    // Resolver function: returns the allowlist based on the input each call.
    // In production this reads the project config of the target project.
    const resolver = vi.fn().mockResolvedValue(["Test_Allowed", "Test_AlsoAllowed"]);
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, resolver);

    const result = await adapter.execute("test_vba", {
      procedureName: "Test_Allowed",
      argsJson: "[]",
    });

    // Resolver MUST be invoked with the input (per-input, not frozen).
    expect(resolver).toHaveBeenCalledWith(
      expect.objectContaining({ procedureName: "Test_Allowed" }),
    );
    // Gate accepted — procedure is in the resolved allowlist.
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
    // Issue #659 — split: case (b) (allowlist IS configured AND the
    // procedure is not in it) now emits `PROCEDURE_NOT_ALLOWED` with the
    // current allowlist + a remediation line. Case (a) (no allowlist AND
    // no `dryRun:true`) keeps the legacy `MCP_INPUT_INVALID` code.
    expect(result.error.code).toBe("PROCEDURE_NOT_ALLOWED");
    expect(result.error.message).toContain("Test_NotInList");
    expect(result.error.message).toContain("allowedProcedures");
    expect(result.error.allowedProcedures).toEqual(["Test_Allowed"]);
    expect(result.error.remediation).toMatch(/Test_NotInList/);
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
    // Issue #659 — case (b): PROCEDURE_NOT_ALLOWED with the allowlist and
    // a remediation line that names ALL the offending procedures.
    expect(result.error.code).toBe("PROCEDURE_NOT_ALLOWED");
    expect(result.error.message).toContain("Test_NotInList");
    expect(result.error.allowedProcedures).toEqual(["Test_Allowed"]);
    expect(result.error.remediation).toMatch(/Test_NotInList/);
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
    // Issue #659 — case (b) (manifest resolved a procedure not in the
    // allowlist). Emits PROCEDURE_NOT_ALLOWED with the current allowlist
    // and a remediation line that names the offending procedure.
    expect(result.error.code).toBe("PROCEDURE_NOT_ALLOWED");
    expect(result.error.message).toContain("Test_FromManifest");
    expect(result.error.message).toContain("allowedProcedures");
    expect(result.error.allowedProcedures).toEqual(["Test_Other"]);
    expect(result.error.remediation).toMatch(/Test_FromManifest/);
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  // feat-759-no-compile (v1.19.0) — the "#667 — compile_vba does NOT
  // run when plan resolution fails (no manifest)" test was deleted because
  // compile is gone from the runtime. The plan-resolution-fails path
  // itself is still covered by the standard VBA_INVALID_TEST_PLAN atoms.
});

// ========================================================================
// feat-759-no-compile (v1.19.0) — deleted #667 tests
//
// Both #667 atoms asserted the (gate → compile_vba → test_vba) ordering
// fixed in earlier PRs. compile is gone in v1.19.0, so the ordering is
// (gate → test_vba). The gate-side rejection contract is still covered
// above by the standard PROCEDURE_NOT_ALLOWED atoms.
// ========================================================================
