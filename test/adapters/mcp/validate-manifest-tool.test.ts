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
  const tool = tools.find((t) => t.name === "dysflow_validate_manifest");
  if (tool === undefined) throw new Error("dysflow_validate_manifest tool not found");
  return tool;
}

const modules = {
  TestModule: [
    "Option Explicit",
    "Public Sub Test_NoArgs()",
    "End Sub",
    "Public Sub Test_WithArgs(ByVal name As String, ByVal count As Long)",
    "End Sub",
  ].join("\r\n"),
};

describe("dysflow_validate_manifest", () => {
  it("returns a valid report for a manifest whose procedures and args match", async () => {
    const result = await getTool().handler({
      manifest: { tests: [{ procedure: "Test_WithArgs", args: ["fixture", 1], tags: ["smoke"] }] },
      modules,
    });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed).toMatchObject({ valid: true, errors: [], summary: { totalTests: 1 } });
  });

  it("accepts inline array manifests through the MCP schema", async () => {
    const result = await getTool().handler({
      manifest: [{ procedure: "Test_NoArgs" }],
      modules,
    });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed).toMatchObject({ valid: true, summary: { totalTests: 1, validTests: 1 } });
  });

  it("returns typed validation errors for missing procedures and arg type mismatches", async () => {
    const result = await getTool().handler({
      manifest: {
        tests: [
          { procedure: "Test_Missing", args: [] },
          { procedure: "Test_WithArgs", args: ["fixture", "bad"] },
        ],
      },
      modules,
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "PROCEDURE_NOT_FOUND", procedure: "Test_Missing" }),
        expect.objectContaining({ code: "ARG_TYPE_MISMATCH", procedure: "Test_WithArgs" }),
      ]),
    );
  });

  it("returns a typed error when testsPath cannot be read", async () => {
    const result = await getTool().handler({
      testsPath: "C:/definitely/missing/tests.vba.json",
      modules,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("VBA_INVALID_TEST_PLAN");
  });

  it("reads a manifest from testsPath", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-validate-manifest-"));
    const manifestPath = join(root, "tests.vba.json");
    await writeFile(manifestPath, JSON.stringify([{ procedure: "Test_NoArgs" }]), "utf8");

    const result = await getTool().handler({ testsPath: manifestPath, modules });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed).toMatchObject({ valid: true, summary: { totalTests: 1, validTests: 1 } });
  });

  it("resolves relative testsPath from projectRoot instead of destinationRoot", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "dysflow-validate-manifest-project-"));
    const destinationRoot = await mkdtemp(join(tmpdir(), "dysflow-validate-manifest-src-"));
    await mkdir(join(projectRoot, "tests"));
    await writeFile(
      join(projectRoot, "tests", "tests.vba.json"),
      JSON.stringify([{ procedure: "Test_NoArgs" }]),
      "utf8",
    );
    await writeFile(
      join(destinationRoot, "tests.vba.json"),
      JSON.stringify([{ procedure: "Test_Missing" }]),
      "utf8",
    );

    const result = await getTool(async () =>
      successResult({ accessPath: "C:/fake/frontend.accdb", projectRoot, destinationRoot }),
    ).handler({ testsPath: "tests/tests.vba.json", modules });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed).toMatchObject({ valid: true, summary: { totalTests: 1, validTests: 1 } });
  });
});
