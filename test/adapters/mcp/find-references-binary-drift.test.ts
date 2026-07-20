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

function makeBaseServices(options: { exportFails?: boolean } = {}): DysflowMcpServices {
  return {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
    vbaSyncToolService: {
      execute: async (_toolName, input) => {
        const params = input as Record<string, unknown>;
        if (options.exportFails === true) {
          return failureResult(createDysflowError("VBA_MANAGER_FAILED", "binary export failed"));
        }
        if (params.apply !== true) {
          return successResult({ dryRun: true, exported: [] });
        }
        const exportPath = params.exportPath as string;
        const modulesPath = join(exportPath, "modules");
        await mkdir(modulesPath, { recursive: true });
        await writeFile(join(modulesPath, "mIndicadorProyectosState.bas"), VBA_SOURCE, "utf8");
        return successResult({ exported: ["mIndicadorProyectosState"] });
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
});
