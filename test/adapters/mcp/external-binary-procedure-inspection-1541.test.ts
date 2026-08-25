import { describe, expect, it } from "vitest";
import { sharedBlockPolicyForTool } from "../../../src/adapters/mcp/mcp-tool-risks";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

const EXTERNAL_ACCESS_PATH = "C:/archives/legacy.accdb";
const CONTROL_CAMBIOS_SOURCE = [
  'Attribute VB_Name = "ControlCambios"',
  "Option Explicit",
  "",
  "Public Function ControlCambios_CalcularFilasEdicion() As Long",
  "    ControlCambios_CalcularFilasEdicion = 17",
  "End Function",
  "",
  "Private Sub ResetState()",
  "End Sub",
].join("\r\n");

type InspectionCall = { toolName: string; input: Record<string, unknown> };

function makeTools(options: { modules?: readonly Record<string, unknown>[] } = {}) {
  const calls: InspectionCall[] = [];
  const services: DysflowMcpServices = {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
    vbaSyncToolService: {
      execute: async (toolName, input) => {
        calls.push({ toolName, input: input as Record<string, unknown> });
        return successResult({
          modules: options.modules ?? [
            {
              name: "ControlCambios",
              binaryExists: true,
              binarySource: CONTROL_CAMBIOS_SOURCE,
            },
          ],
          summary: { total: 1 },
        });
      },
    },
  };

  return {
    calls,
    tools: createDysflowMcpTools({ services }),
  };
}

function tool(
  name: "get_procedure" | "list_procedures",
  tools: ReturnType<typeof makeTools>["tools"],
) {
  const found = tools.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`${name} tool not found`);
  return found;
}

describe("external Access binary procedure inspection (#1541)", () => {
  it("lists procedures from the requested external binary without exporting files", async () => {
    const harness = makeTools();

    const result = await tool("list_procedures", harness.tools).handler({
      module: "ControlCambios",
      source: "binary",
      accessPath: EXTERNAL_ACCESS_PATH,
      allowExternalAccessPath: true,
      timeoutMs: 45_000,
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0]?.text ?? "{}")).toMatchObject({
      module: "ControlCambios",
      procedures: [
        { name: "ControlCambios_CalcularFilasEdicion", kind: "Function" },
        { name: "ResetState", kind: "Sub" },
      ],
    });
    expect(harness.calls).toEqual([
      {
        toolName: "list_vba_modules",
        input: expect.objectContaining({
          accessPath: EXTERNAL_ACCESS_PATH,
          allowExternalAccessPath: true,
          includeSource: true,
          namePattern: "ControlCambios",
          timeoutMs: 45_000,
        }),
      },
    ]);
    expect(harness.calls[0]?.input).not.toHaveProperty("apply");
    expect(harness.calls[0]?.input).not.toHaveProperty("destinationRoot");
  });

  it("advertises timeout control for both process-backed binary procedure tools", () => {
    expect(sharedBlockPolicyForTool("list_procedures").timeoutMs).toBe("required");
    expect(sharedBlockPolicyForTool("get_procedure").timeoutMs).toBe("required");
  });

  it("returns one procedure body directly from the requested external binary", async () => {
    const harness = makeTools();

    const result = await tool("get_procedure", harness.tools).handler({
      module: "ControlCambios",
      procedure: "ControlCambios_CalcularFilasEdicion",
      source: "binary",
      accessPath: EXTERNAL_ACCESS_PATH,
      allowExternalAccessPath: true,
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0]?.text ?? "{}")).toMatchObject({
      module: "ControlCambios",
      procedure: "ControlCambios_CalcularFilasEdicion",
      body: expect.stringContaining("= 17"),
    });
  });

  it("rejects external binary inspection unless the caller explicitly opts in", async () => {
    const harness = makeTools();

    const result = await tool("list_procedures", harness.tools).handler({
      module: "ControlCambios",
      source: "binary",
      accessPath: EXTERNAL_ACCESS_PATH,
    });

    expect(result).toMatchObject({ isError: true, ok: false });
    expect(result.content[0]?.text).toContain("allowExternalAccessPath:true");
    expect(harness.calls).toEqual([]);
  });

  it("rejects non-Access external targets before invoking the inspection port", async () => {
    const harness = makeTools();

    const result = await tool("get_procedure", harness.tools).handler({
      module: "ControlCambios",
      procedure: "ResetState",
      source: "binary",
      accessPath: "C:/archives/legacy.txt",
      allowExternalAccessPath: true,
    });

    expect(result).toMatchObject({ isError: true, ok: false });
    expect(result.content[0]?.text).toContain(".accdb or .mdb");
    expect(harness.calls).toEqual([]);
  });

  it("returns MODULE_NOT_FOUND when the binary does not contain the requested module", async () => {
    const harness = makeTools({ modules: [] });

    const result = await tool("get_procedure", harness.tools).handler({
      module: "MissingModule",
      procedure: "MissingProcedure",
      source: "binary",
      accessPath: EXTERNAL_ACCESS_PATH,
      allowExternalAccessPath: true,
    });

    expect(result).toMatchObject({ isError: true, ok: false });
    expect(result.content[0]?.text).toContain("MODULE_NOT_FOUND");
  });
});
