import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import {
  createDysflowError,
  failureResult,
  successResult,
} from "../../../src/core/contracts/index";

const roots: string[] = [];
const binaryInspectionCalls: Array<{
  toolName: string;
  input: Record<string, unknown>;
}> = [];

function makeBaseServices(
  options: { exportFails?: boolean; binarySource?: string } = {},
): DysflowMcpServices {
  return {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
    vbaSyncToolService: {
      execute: async (toolName, input) => {
        const params = input as Record<string, unknown>;
        binaryInspectionCalls.push({ toolName, input: params });
        if (options.exportFails === true) {
          return failureResult(createDysflowError("VBA_MANAGER_FAILED", "binary scan failed"));
        }
        return successResult({
          modules: [
            {
              name: "mIndicadorProyectosState",
              type: 1,
              fileType: "bas",
              sourceExists: true,
              binaryExists: true,
              binarySource: options.binarySource ?? VBA_SOURCE,
            },
          ],
          summary: {
            total: 1,
            inBinaryOnly: 0,
            inSourceOnly: 0,
            inBoth: 1,
            totalModules: 1,
            modulesInBinaryOnly: 0,
            modulesInSourceOnly: 0,
            modulesInBoth: 1,
          },
        });
      },
    },
  };
}

const VBA_SOURCE = [
  "Option Explicit",
  "",
  "Public Sub IndicadorState_Init()",
  "End Sub",
  "",
  "Public Sub Caller()",
  "    Call IndicadorState_Init",
  "End Sub",
].join("\r\n");

afterEach(async () => {
  binaryInspectionCalls.length = 0;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("find_references — source/binary comparison", () => {
  it("populates binaryReferences when the caller module exists in source and binary", async () => {
    const destinationRoot = await mkdtemp(join(tmpdir(), "dysflow-findrefs-source-"));
    roots.push(destinationRoot);
    await mkdir(join(destinationRoot, "modules"), { recursive: true });
    await writeFile(
      join(destinationRoot, "modules", "mIndicadorProyectosState.bas"),
      VBA_SOURCE,
      "utf8",
    );

    const tools = createDysflowMcpTools({
      services: makeBaseServices(),
      accessContextResolver: async () =>
        successResult({
          accessPath: join(destinationRoot, "fixture.accdb"),
          projectRoot: destinationRoot,
          destinationRoot,
        }),
    });
    const tool = tools.find((candidate) => candidate.name === "find_references");
    if (tool === undefined) throw new Error("find_references tool not found");

    const response = await tool.handler({ symbol: "IndicadorState_Init", scope: "all" });

    expect(response.isError).toBe(false);
    const result = JSON.parse(response.content[0]?.text ?? "{}");
    expect(binaryInspectionCalls).toEqual([
      {
        toolName: "list_vba_modules",
        input: expect.objectContaining({ includeSource: true }),
      },
    ]);
    expect(binaryInspectionCalls[0]?.input).not.toHaveProperty("apply");
    expect(binaryInspectionCalls[0]?.input).not.toHaveProperty("exportPath");
    expect(result.binaryReferences).toEqual([
      {
        module: "mIndicadorProyectosState",
        kind: "Sub",
        line: 7,
        context: "Call IndicadorState_Init",
      },
    ]);
    expect(result.differences).toEqual({ onlyInSource: [], onlyInBinary: [] });
    expect(result.hasDifferences).toBe(false);
  });

  it("returns BINARY_INSPECTION_UNAVAILABLE instead of phantom drift when export fails", async () => {
    const destinationRoot = await mkdtemp(join(tmpdir(), "dysflow-findrefs-source-"));
    roots.push(destinationRoot);
    await mkdir(join(destinationRoot, "modules"), { recursive: true });
    await writeFile(
      join(destinationRoot, "modules", "mIndicadorProyectosState.bas"),
      VBA_SOURCE,
      "utf8",
    );

    const tools = createDysflowMcpTools({
      services: makeBaseServices({ exportFails: true }),
      accessContextResolver: async () =>
        successResult({
          accessPath: join(destinationRoot, "fixture.accdb"),
          projectRoot: destinationRoot,
          destinationRoot,
        }),
    });
    const tool = tools.find((candidate) => candidate.name === "find_references");
    if (tool === undefined) throw new Error("find_references tool not found");

    const response = await tool.handler({ symbol: "IndicadorState_Init", scope: "all" });

    expect(response).toMatchObject({
      isError: true,
      ok: false,
      error: {
        code: "BINARY_INSPECTION_UNAVAILABLE",
        errorCode: "BINARY_INSPECTION_UNAVAILABLE",
      },
      content: [{ type: "text", text: expect.stringContaining("BINARY_INSPECTION_UNAVAILABLE") }],
    });
  });

  it("keeps real binary-only references visible in code-only inspection mode", async () => {
    const destinationRoot = await mkdtemp(join(tmpdir(), "dysflow-findrefs-source-"));
    roots.push(destinationRoot);
    await mkdir(join(destinationRoot, "modules"), { recursive: true });
    await writeFile(
      join(destinationRoot, "modules", "mIndicadorProyectosState.bas"),
      VBA_SOURCE,
      "utf8",
    );

    const binarySource = [
      VBA_SOURCE,
      "",
      "Public Sub BinaryOnlyCaller()",
      "    Call IndicadorState_Init: DoEvents",
      "End Sub",
    ].join("\r\n");
    const tools = createDysflowMcpTools({
      services: makeBaseServices({ binarySource }),
      accessContextResolver: async () =>
        successResult({
          accessPath: join(destinationRoot, "fixture.accdb"),
          projectRoot: destinationRoot,
          destinationRoot,
        }),
    });
    const tool = tools.find((candidate) => candidate.name === "find_references");
    if (tool === undefined) throw new Error("find_references tool not found");

    const response = await tool.handler({ symbol: "IndicadorState_Init", scope: "all" });

    expect(response.isError).toBe(false);
    const result = JSON.parse(response.content[0]?.text ?? "{}");
    expect(result.hasDifferences).toBe(true);
    expect(result.differences.onlyInSource).toEqual([]);
    expect(result.differences.onlyInBinary).toEqual([
      {
        module: "mIndicadorProyectosState",
        kind: "Sub",
        line: 11,
        context: "Call IndicadorState_Init: DoEvents",
      },
    ]);
  });
});
