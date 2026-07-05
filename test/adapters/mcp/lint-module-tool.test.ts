import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

function makeBaseServices() {
  return {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
  };
}

function getTool(accessContextResolver?: Parameters<typeof createDysflowMcpTools>[5]) {
  const tools = createDysflowMcpTools(
    makeBaseServices() as DysflowMcpServices,
    false,
    undefined,
    process.env,
    undefined,
    accessContextResolver,
  );
  const tool = tools.find((t) => t.name === "dysflow_lint_module");
  if (tool === undefined) throw new Error("dysflow_lint_module tool not found");
  return tool;
}

describe("dysflow_lint_module", () => {
  it("lints inline source and returns the stable output shape", async () => {
    const result = await getTool().handler({
      module: "InlineModule",
      source: ['Attribute VB_Name = "InlineModule"', "Public Sub Run()", "End Sub"].join("\r\n"),
    });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed).toMatchObject({
      module: "InlineModule",
      rules: ["option-declaration", "identifier-safety", "declaration-order", "arg-type-match"],
      isClean: false,
      summary: { errors: 2, warnings: 0 },
    });
    expect(parsed.flatDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "option-declaration", line: 2, severity: "error" }),
      ]),
    );
    expect(parsed.diagnostics["option-declaration"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "option-declaration", line: 2, severity: "error" }),
      ]),
    );
  });

  it("returns MODULE_NOT_FOUND when source cannot be resolved", async () => {
    const result = await getTool().handler({ module: "MissingModule" });

    expect(result.isError).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.content[0]?.text).toContain("MODULE_NOT_FOUND");
  });

  it("resolves module source from the configured project source root", async () => {
    const destinationRoot = await mkdtemp(join(tmpdir(), "dysflow-lint-module-src-"));
    await mkdir(join(destinationRoot, "modules"));
    await writeFile(
      join(destinationRoot, "modules", "ResolvedModule.bas"),
      [
        'Attribute VB_Name = "ResolvedModule"',
        "Option Compare Database",
        "Option Explicit",
        "Public Sub Run()",
        "End Sub",
      ].join("\r\n"),
      "utf8",
    );

    const result = await getTool(async () =>
      successResult({
        accessPath: "C:/fake/frontend.accdb",
        projectRoot: destinationRoot,
        destinationRoot,
      }),
    ).handler({ module: "ResolvedModule" });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed).toMatchObject({ module: "ResolvedModule", isClean: true });
  });

  it("honors rule filtering", async () => {
    const result = await getTool().handler({
      module: "FilteredModule",
      rules: ["identifier-safety"],
      source: [
        "Public Sub GuardarÑ()",
        "    Me._Value = 1",
        "End Sub",
        "Private lateValue As Long",
      ].join("\r\n"),
    });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.rules).toEqual(["identifier-safety"]);
    expect(
      parsed.flatDiagnostics.every((d: { rule: string }) => d.rule === "identifier-safety"),
    ).toBe(true);
    expect(parsed.flatDiagnostics).toHaveLength(2);
    expect(parsed.diagnostics["identifier-safety"]).toHaveLength(2);
    for (const rule of parsed.rules) {
      expect(parsed.diagnostics[rule]?.every((d: { rule: string }) => d.rule === rule)).toBe(true);
    }
  });

  it("returns a clean report when rules is explicitly an empty array", async () => {
    const result = await getTool().handler({
      module: "AnyModule",
      rules: [],
      source: ['Attribute VB_Name = "AnyModule"', "Public Sub Run()", "End Sub"].join("\r\n"),
    });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.rules).toEqual([]);
    expect(parsed.isClean).toBe(true);
    expect(parsed.flatDiagnostics).toEqual([]);
    expect(parsed.summary).toMatchObject({ errors: 0, warnings: 0 });
  });

  it("rejects unknown rule names at the schema level", async () => {
    const result = await getTool().handler({
      module: "AnyModule",
      rules: JSON.parse('["not-a-real-rule"]'),
      source: ['Attribute VB_Name = "AnyModule"', "Public Sub Run()", "End Sub"].join("\r\n"),
    });

    expect(result.isError).toBe(true);
    expect(result.ok).toBe(false);
  });
});
