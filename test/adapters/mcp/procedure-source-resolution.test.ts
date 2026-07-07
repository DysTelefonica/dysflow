import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

function makeBaseServices() {
  return {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
  };
}

function createToolsWithMockContext(tempDir: string) {
  return createDysflowMcpTools(
    makeBaseServices() as DysflowMcpServices,
    false,
    undefined,
    process.env,
    undefined,
    async () =>
      successResult({
        accessPath: join(tempDir, "dummy.accdb"),
        projectRoot: tempDir,
        destinationRoot: tempDir,
      }),
  );
}

function parseJsonContent<T>(text: string | undefined): T {
  try {
    return JSON.parse(text ?? "{}") as T;
  } catch (error) {
    throw new Error(`Expected MCP tool response to contain JSON: ${String(error)}`);
  }
}

type ProcedureCatalogResponse = {
  module: string;
  procedures: Array<{ name: string; kind?: string }>;
};

type ProcedureDetailResponse = {
  module: string;
  procedure: string;
  startLine: number;
  body: string;
};

describe("list_procedures — source resolution from disk", () => {
  const tempDir = join(process.env.TEMP ?? "/tmp", `procedure-test-${Date.now()}`);

  beforeAll(async () => {
    await mkdir(join(tempDir, "modules"), { recursive: true });
    await writeFile(
      join(tempDir, "modules", "TestModule.bas"),
      [
        "Option Explicit",
        "",
        "Public Sub DoWork()",
        "    Dim x As Long",
        "End Sub",
        "",
        "Private Function GetValue() As Long",
        "    GetValue = 42",
        "End Function",
      ].join("\r\n"),
      "utf-8",
    );
    await writeFile(
      join(tempDir, "Escape.bas"),
      ["Option Explicit", "", "Public Sub ShouldNotBeReadable()", "End Sub"].join("\r\n"),
      "utf-8",
    );
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("resolves module from disk when source is omitted and destinationRoot is provided", async () => {
    const tools = createToolsWithMockContext(tempDir);
    const tool = tools.find((t) => t.name === "list_procedures");
    if (tool === undefined) throw new Error("list_procedures tool not found");

    const result = await tool.handler({
      module: "TestModule",
      destinationRoot: tempDir,
    });

    expect(result.isError).toBe(false);
    const text = result.content[0]?.text ?? "";
    const parsed = parseJsonContent<ProcedureCatalogResponse>(text);

    expect(parsed.module).toBe("TestModule");
    expect(parsed.procedures).toHaveLength(2);
    expect(parsed.procedures.map((p: { name: string }) => p.name)).toContain("DoWork");
    expect(parsed.procedures.map((p: { name: string }) => p.name)).toContain("GetValue");
  });

  it("returns MODULE_NOT_FOUND when module file does not exist on disk", async () => {
    const tools = createToolsWithMockContext(tempDir);
    const tool = tools.find((t) => t.name === "list_procedures");
    if (tool === undefined) throw new Error("list_procedures tool not found");

    const result = await tool.handler({
      module: "NonExistentModule",
      destinationRoot: tempDir,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MODULE_NOT_FOUND");
  });

  it("does not resolve path-like module names outside managed source folders", async () => {
    const tools = createToolsWithMockContext(tempDir);
    const tool = tools.find((t) => t.name === "list_procedures");
    if (tool === undefined) throw new Error("list_procedures tool not found");

    const result = await tool.handler({
      module: "../Escape",
      destinationRoot: tempDir,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MODULE_NOT_FOUND");
  });

  it("returns MODULE_NOT_FOUND when destinationRoot is not provided", async () => {
    const tools = createDysflowMcpTools(makeBaseServices() as DysflowMcpServices);
    const tool = tools.find((t) => t.name === "list_procedures");
    if (tool === undefined) throw new Error("list_procedures tool not found");

    const result = await tool.handler({
      module: "AnyModule",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MODULE_NOT_FOUND");
  });

  it("resolves destinationRoot from the MCP access context when the caller omits it", async () => {
    const tools = createDysflowMcpTools(
      makeBaseServices() as DysflowMcpServices,
      false,
      undefined,
      process.env,
      undefined,
      async () =>
        successResult({
          accessPath: join(tempDir, "dummy.accdb"),
          projectRoot: tempDir,
          destinationRoot: tempDir,
        }),
    );
    const tool = tools.find((t) => t.name === "list_procedures");
    if (tool === undefined) throw new Error("list_procedures tool not found");

    const result = await tool.handler({ module: "TestModule" });

    expect(result.isError).toBe(false);
    const parsed = parseJsonContent<ProcedureCatalogResponse>(result.content[0]?.text);
    expect(parsed.procedures.map((p: { name: string }) => p.name)).toEqual(["DoWork", "GetValue"]);
  });

  it("kind filter returns only matching procedure kinds", async () => {
    const tools = createToolsWithMockContext(tempDir);
    const tool = tools.find((t) => t.name === "list_procedures");
    if (tool === undefined) throw new Error("list_procedures tool not found");

    // Filter for Sub only
    const subResult = await tool.handler({
      module: "TestModule",
      destinationRoot: tempDir,
      kind: "Sub",
    });

    const subText = subResult.content[0]?.text ?? "";
    const subParsed = parseJsonContent<ProcedureCatalogResponse>(subText);
    expect(subParsed.procedures).toHaveLength(1);
    expect(subParsed.procedures[0]?.name).toBe("DoWork");
    expect(subParsed.procedures[0]?.kind).toBe("Sub");

    // Filter for Function only
    const funcResult = await tool.handler({
      module: "TestModule",
      destinationRoot: tempDir,
      kind: "Function",
    });

    const funcText = funcResult.content[0]?.text ?? "";
    const funcParsed = parseJsonContent<ProcedureCatalogResponse>(funcText);
    expect(funcParsed.procedures).toHaveLength(1);
    expect(funcParsed.procedures[0]?.name).toBe("GetValue");
    expect(funcParsed.procedures[0]?.kind).toBe("Function");
  });
});

describe("get_procedure — source resolution from disk", () => {
  const tempDir = join(process.env.TEMP ?? "/tmp", `procedure-get-test-${Date.now()}`);

  beforeAll(async () => {
    await mkdir(join(tempDir, "classes"), { recursive: true });
    await writeFile(
      join(tempDir, "classes", "Calculator.cls"),
      [
        "Option Explicit",
        "",
        "Public Function Add(a As Long, b As Long) As Long",
        "    Add = a + b",
        "End Function",
        "",
        "Public Sub Clear()",
        "End Sub",
      ].join("\r\n"),
      "utf-8",
    );
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("resolves module from disk when source is omitted and destinationRoot is provided", async () => {
    const tools = createToolsWithMockContext(tempDir);
    const tool = tools.find((t) => t.name === "get_procedure");
    if (tool === undefined) throw new Error("get_procedure tool not found");

    const result = await tool.handler({
      module: "Calculator",
      procedure: "Add",
      destinationRoot: tempDir,
    });

    expect(result.isError).toBe(false);
    const text = result.content[0]?.text ?? "";
    const parsed = parseJsonContent<ProcedureDetailResponse>(text);

    expect(parsed.module).toBe("Calculator");
    expect(parsed.procedure).toBe("Add");
    expect(parsed.startLine).toBe(3); // Function declaration on line 3
    expect(parsed.body).toContain("Add = a + b");
  });

  it("returns MODULE_NOT_FOUND when module file does not exist on disk", async () => {
    const tools = createToolsWithMockContext(tempDir);
    const tool = tools.find((t) => t.name === "get_procedure");
    if (tool === undefined) throw new Error("get_procedure tool not found");

    const result = await tool.handler({
      module: "NonExistentClass",
      procedure: "AnyMethod",
      destinationRoot: tempDir,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MODULE_NOT_FOUND");
  });

  it("returns MODULE_NOT_FOUND when destinationRoot is not provided", async () => {
    const tools = createDysflowMcpTools(makeBaseServices() as DysflowMcpServices);
    const tool = tools.find((t) => t.name === "get_procedure");
    if (tool === undefined) throw new Error("get_procedure tool not found");

    const result = await tool.handler({
      module: "AnyModule",
      procedure: "AnyProc",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MODULE_NOT_FOUND");
  });

  it("resolves destinationRoot from the MCP access context when the caller omits it", async () => {
    const tools = createDysflowMcpTools(
      makeBaseServices() as DysflowMcpServices,
      false,
      undefined,
      process.env,
      undefined,
      async () =>
        successResult({
          accessPath: join(tempDir, "dummy.accdb"),
          projectRoot: tempDir,
          destinationRoot: tempDir,
        }),
    );
    const tool = tools.find((t) => t.name === "get_procedure");
    if (tool === undefined) throw new Error("get_procedure tool not found");

    const result = await tool.handler({ module: "Calculator", procedure: "Add" });

    expect(result.isError).toBe(false);
    const parsed = parseJsonContent<ProcedureDetailResponse>(result.content[0]?.text);
    expect(parsed.body).toContain("Add = a + b");
  });

  it("returns PROCEDURE_NOT_FOUND when procedure exists in module but name doesn't match", async () => {
    const tools = createToolsWithMockContext(tempDir);
    const tool = tools.find((t) => t.name === "get_procedure");
    if (tool === undefined) throw new Error("get_procedure tool not found");

    const result = await tool.handler({
      module: "Calculator",
      procedure: "NonExistentMethod",
      destinationRoot: tempDir,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("PROCEDURE_NOT_FOUND");
  });
});

describe("issue #713 merged VBA tools — project context source resolution", () => {
  const tempDir = join(process.env.TEMP ?? "/tmp", `procedure-context-tools-${Date.now()}`);

  beforeAll(async () => {
    await mkdir(join(tempDir, "modules"), { recursive: true });
    await writeFile(
      join(tempDir, "modules", "Workflow.bas"),
      [
        "Option Explicit",
        "",
        "Public Sub ReferencedProc()",
        "End Sub",
        "",
        "Public Sub Caller()",
        "    ReferencedProc",
        "End Sub",
        "",
        "Public Sub UnusedProc()",
        "End Sub",
      ].join("\r\n"),
      "utf-8",
    );
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeToolsWithProjectContext() {
    return createDysflowMcpTools(
      makeBaseServices() as DysflowMcpServices,
      false,
      undefined,
      process.env,
      undefined,
      async () =>
        successResult({
          accessPath: join(tempDir, "dummy.accdb"),
          projectRoot: tempDir,
          destinationRoot: tempDir,
        }),
    );
  }

  it("find_references resolves project source modules when explicit source paths are omitted", async () => {
    const tools = makeToolsWithProjectContext();
    const tool = tools.find((t) => t.name === "find_references");
    if (tool === undefined) throw new Error("find_references tool not found");

    const result = await tool.handler({
      projectId: "configured-project",
      symbol: "ReferencedProc",
      scope: "source",
    });

    expect(result.isError).toBe(false);
    const parsed = parseJsonContent<{
      symbol: string;
      totalCount: number;
      references: Array<{ module: string; context: string }>;
    }>(result.content[0]?.text);
    expect(parsed.symbol).toBe("ReferencedProc");
    expect(parsed.totalCount).toBe(1);
    expect(parsed.references).toEqual([
      expect.objectContaining({ module: "Workflow", context: "ReferencedProc" }),
    ]);
  });

  it("detect_dead_code resolves project source modules when explicit modules/destinationRoot are omitted", async () => {
    const tools = makeToolsWithProjectContext();
    const tool = tools.find((t) => t.name === "detect_dead_code");
    if (tool === undefined) throw new Error("detect_dead_code tool not found");

    const result = await tool.handler({ projectId: "configured-project", scope: "source" });

    expect(result.isError).toBe(false);
    const parsed = parseJsonContent<{
      scannedModules: string[];
      findings: Array<{ symbol: string; module: string }>;
    }>(result.content[0]?.text);
    expect(parsed.scannedModules).toEqual(["Workflow"]);
    expect(parsed.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: "UnusedProc", module: "Workflow" }),
      ]),
    );
  });

  it("validate_manifest resolves project source modules when explicit modules/destinationRoot are omitted", async () => {
    const tools = makeToolsWithProjectContext();
    const tool = tools.find((t) => t.name === "validate_manifest");
    if (tool === undefined) throw new Error("validate_manifest tool not found");

    const result = await tool.handler({
      projectId: "configured-project",
      manifest: { tests: ["ReferencedProc"] },
    });

    expect(result.isError).toBe(false);
    const parsed = parseJsonContent<{
      valid: boolean;
      summary: { totalTests: number; validTests: number };
    }>(result.content[0]?.text);
    expect(parsed.valid).toBe(true);
    expect(parsed.summary).toMatchObject({ totalTests: 1, validTests: 1 });
  });
});

// ---------------------------------------------------------------------------
// Security / source-root containment (#701 review blocker).
//
// A caller-controlled `destinationRoot` MUST NOT let the procedure read
// tools read arbitrary local source roots. The tools must be contained to
// the configured project source root (resolved via the MCP access context).
// An explicit `destinationRoot` that does not match the configured root
// must be rejected, surfacing MODULE_NOT_FOUND rather than reading the
// caller's path. Inline `source` is exempt — the caller already supplied
// the bytes, so there is nothing on disk to validate.
// ---------------------------------------------------------------------------
describe("list_procedures / get_procedure — strict source-root containment", () => {
  // The configured project root that the MCP access context will resolve to.
  const configuredRoot = join(process.env.TEMP ?? "/tmp", `procedure-configured-${Date.now()}`);
  // A totally unrelated directory the caller is trying to read from.
  const externalRoot = join(process.env.TEMP ?? "/tmp", `procedure-external-${Date.now()}`);

  beforeAll(async () => {
    // Configured project tree — contains a real module.
    await mkdir(join(configuredRoot, "modules"), { recursive: true });
    await writeFile(
      join(configuredRoot, "modules", "ConfiguredModule.bas"),
      ["Public Sub ConfiguredProc()", "End Sub"].join("\r\n"),
      "utf-8",
    );
    // External tree — contains a different module the caller is trying to read.
    await mkdir(join(externalRoot, "modules"), { recursive: true });
    await writeFile(
      join(externalRoot, "modules", "LeakedProc.bas"),
      ["Public Sub LeakedProc()", '    MsgBox "should never be read"', "End Sub"].join("\r\n"),
      "utf-8",
    );
  });

  afterAll(async () => {
    await rm(configuredRoot, { recursive: true, force: true });
    await rm(externalRoot, { recursive: true, force: true });
  });

  function makeToolsWithConfiguredRoot() {
    return createDysflowMcpTools(
      makeBaseServices() as DysflowMcpServices,
      false,
      undefined,
      process.env,
      undefined,
      async () =>
        successResult({
          accessPath: join(configuredRoot, "dummy.accdb"),
          projectRoot: configuredRoot,
          destinationRoot: configuredRoot,
        }),
    );
  }

  it("reads the configured project root when no explicit destinationRoot is provided", async () => {
    const tools = makeToolsWithConfiguredRoot();
    const listTool = tools.find((t) => t.name === "list_procedures");
    if (listTool === undefined) throw new Error("list_procedures tool not found");

    const result = await listTool.handler({ module: "ConfiguredModule" });

    expect(result.isError).toBe(false);
    const parsed = parseJsonContent<ProcedureCatalogResponse>(result.content[0]?.text);
    expect(parsed.procedures.map((p: { name: string }) => p.name)).toContain("ConfiguredProc");
  });

  it("rejects an explicit destinationRoot that points outside the configured project", async () => {
    const tools = makeToolsWithConfiguredRoot();
    const listTool = tools.find((t) => t.name === "list_procedures");
    if (listTool === undefined) throw new Error("list_procedures tool not found");

    const result = await listTool.handler({
      module: "LeakedProc",
      destinationRoot: externalRoot,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MODULE_NOT_FOUND");

    // Hard guarantee: the external file was not read. The file's body
    // (procedure declarations and source text from the caller's tree)
    // must not appear anywhere in the response — even if the module name
    // itself is echoed in the error message (it is the caller's own input,
    // so echoing it is correct).
    expect(result.content[0]?.text).not.toContain("should never be read");
    // The file contains a single procedure "LeakedProc" — if the file
    // had been read, the response body would contain that procedure name
    // AS A PROCEDURE DECLARATION (with line number etc.), not just as a
    // quoted echo. A simple `not.toContain("LeakedProc")` would over-match
    // the legitimate echo. Use a substring that only appears in a parsed
    // response: `"name": "LeakedProc"` (JSON catalog entry).
    expect(result.content[0]?.text).not.toContain('"name": "LeakedProc"');
  });

  it("rejects an explicit destinationRoot that is a sibling of the configured project", async () => {
    const tools = makeToolsWithConfiguredRoot();
    const getTool = tools.find((t) => t.name === "get_procedure");
    if (getTool === undefined) throw new Error("get_procedure tool not found");

    const siblingRoot = join(process.env.TEMP ?? "/tmp", `procedure-sibling-${Date.now()}`);
    await mkdir(join(siblingRoot, "modules"), { recursive: true });
    try {
      await writeFile(
        join(siblingRoot, "modules", "SiblingProc.bas"),
        ["Public Sub SiblingProc()", '    MsgBox "also should never be read"', "End Sub"].join(
          "\r\n",
        ),
        "utf-8",
      );

      const result = await getTool.handler({
        module: "SiblingProc",
        procedure: "SiblingProc",
        destinationRoot: siblingRoot,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("MODULE_NOT_FOUND");
      // The sibling file's body must not have been parsed. The error
      // message may echo the module/procedure name as the caller's own
      // input; we instead assert the body substring is absent.
      expect(result.content[0]?.text).not.toContain("also should never be read");
    } finally {
      await rm(siblingRoot, { recursive: true, force: true });
    }
  });

  it("accepts an explicit destinationRoot that is byte-equivalent to the configured root", async () => {
    const tools = makeToolsWithConfiguredRoot();
    const listTool = tools.find((t) => t.name === "list_procedures");
    if (listTool === undefined) throw new Error("list_procedures tool not found");

    // Pass the SAME root back — must still resolve. This is the
    // "I trust the configured root and I'm passing it through for symmetry"
    // case the review explicitly requested us to keep working.
    const result = await listTool.handler({
      module: "ConfiguredModule",
      destinationRoot: configuredRoot,
    });

    expect(result.isError).toBe(false);
    const parsed = parseJsonContent<ProcedureCatalogResponse>(result.content[0]?.text);
    expect(parsed.procedures.map((p: { name: string }) => p.name)).toContain("ConfiguredProc");
  });

  it("accepts an explicit destinationRoot whose separator style differs from the configured root", async () => {
    // Path-equivalence check must tolerate `C:\foo\bar` vs `C:/foo/bar`.
    // POSIX is byte-exact case-sensitive, so this scenario only matters on
    // Windows. Skip without failing on other platforms.
    if (process.platform !== "win32") return;

    const tools = makeToolsWithConfiguredRoot();
    const listTool = tools.find((t) => t.name === "list_procedures");
    if (listTool === undefined) throw new Error("list_procedures tool not found");

    const normalized = configuredRoot.replace(/\\/g, "/");
    const result = await listTool.handler({
      module: "ConfiguredModule",
      destinationRoot: normalized,
    });

    expect(result.isError).toBe(false);
  });

  it("ignores explicit destinationRoot when the MCP access context has no destinationRoot", async () => {
    // When the resolver returns success but the project config lacks a
    // destinationRoot, an explicit destinationRoot must NOT be enough to
    // read from disk. The tools should refuse.
    const tools = createDysflowMcpTools(
      makeBaseServices() as DysflowMcpServices,
      false,
      undefined,
      process.env,
      undefined,
      async () =>
        successResult({
          accessPath: join(configuredRoot, "dummy.accdb"),
          projectRoot: configuredRoot,
          // destinationRoot intentionally undefined → tools should refuse.
        }),
    );
    const listTool = tools.find((t) => t.name === "list_procedures");
    if (listTool === undefined) throw new Error("list_procedures tool not found");

    const result = await listTool.handler({
      module: "LeakedProc",
      destinationRoot: externalRoot,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MODULE_NOT_FOUND");
    // External file's body must not have been parsed.
    expect(result.content[0]?.text).not.toContain("should never be read");
  });

  it("ignores explicit destinationRoot when the resolver returns an error envelope", async () => {
    const { failureResult } = await import("../../../src/core/contracts/index");
    const tools = createDysflowMcpTools(
      makeBaseServices() as DysflowMcpServices,
      false,
      undefined,
      process.env,
      undefined,
      async () =>
        failureResult({
          code: "ORPHAN_CLEANUP_PATH_UNRESOLVED",
          message: "no .dysflow/project.json",
          retryable: false,
        }),
    );
    const getTool = tools.find((t) => t.name === "get_procedure");
    if (getTool === undefined) throw new Error("get_procedure tool not found");

    const result = await getTool.handler({
      module: "LeakedProc",
      procedure: "LeakedProc",
      destinationRoot: externalRoot,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MODULE_NOT_FOUND");
    expect(result.content[0]?.text).not.toContain("should never be read");
  });

  it("still honors inline `source` regardless of destinationRoot (no I/O containment needed)", async () => {
    // The security boundary is the DISK READ path. When the caller provides
    // inline `source`, the bytes are theirs already — no filesystem access
    // occurs and no source-root containment is required. This pins the
    // existing inline-source contract from the review.
    const tools = makeToolsWithConfiguredRoot();
    const getTool = tools.find((t) => t.name === "get_procedure");
    if (getTool === undefined) throw new Error("get_procedure tool not found");

    const inlineSource = ["Public Sub InlineProc()", "    Dim x As Long", "End Sub"].join("\r\n");

    // destinationRoot explicitly points to the external tree — but inline
    // source bypasses disk I/O entirely, so this must succeed.
    const result = await getTool.handler({
      module: "AnyName",
      procedure: "InlineProc",
      source: inlineSource,
      destinationRoot: externalRoot,
    });

    expect(result.isError).toBe(false);
    const parsed = parseJsonContent<ProcedureDetailResponse>(result.content[0]?.text);
    expect(parsed.procedure).toBe("InlineProc");
    expect(parsed.body).toContain("Dim x As Long");
  });
});
