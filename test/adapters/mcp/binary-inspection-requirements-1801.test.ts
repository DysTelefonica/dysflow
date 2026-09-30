import { describe, expect, it } from "vitest";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

const ACCESS_PATH = "C:/archives/legacy.accdb";
const SOURCE = [
  'Attribute VB_Name = "ControlCambios"',
  "Option Explicit",
  "",
  "Private Sub ResetState()",
  "End Sub",
].join("\r\n");

function makeTools() {
  const calls: string[] = [];
  const services: DysflowMcpServices = {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
    vbaSyncToolService: {
      execute: async (toolName) => {
        calls.push(toolName);
        return successResult({
          modules: [{ name: "ControlCambios", binaryExists: true, binarySource: SOURCE }],
        });
      },
    },
  };
  const tools = createDysflowMcpTools({ services });
  const get = (name: string) => {
    const found = tools.find((candidate) => candidate.name === name);
    if (found === undefined) throw new Error(`${name} tool not found`);
    return found;
  };
  return { calls, get };
}

const BINARY_TOOLS = [
  { name: "get_procedure", base: { module: "ControlCambios", procedure: "ResetState" } },
  { name: "list_procedures", base: { module: "ControlCambios" } },
  { name: "lint_module", base: { module: "ControlCambios" } },
] as const;

describe("binary inspection names every missing requirement at once (#1801)", () => {
  for (const { name, base } of BINARY_TOOLS) {
    it(`${name}: one rejection lists both accessPath and allowExternalAccessPath`, async () => {
      const harness = makeTools();

      const result = await harness.get(name).handler({ ...base, source: "binary" });

      expect(result).toMatchObject({ isError: true, ok: false });
      const text = result.content[0]?.text ?? "";
      expect(text).toContain("accessPath");
      expect(text).toContain("allowExternalAccessPath:true");
      expect(harness.calls).toEqual([]);
    });
  }

  it("names accessPath as the missing piece when only the opt-in is present", async () => {
    const harness = makeTools();

    const result = await harness.get("get_procedure").handler({
      module: "ControlCambios",
      procedure: "ResetState",
      source: "binary",
      allowExternalAccessPath: true,
    });

    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/missing[^.]*accessPath/);
    expect(text).not.toMatch(/missing[^.]*allowExternalAccessPath/);
  });

  it("redirects a databasePath caller to accessPath instead of a bare unknown-key rejection", async () => {
    const harness = makeTools();

    const result = await harness.get("get_procedure").handler({
      module: "ControlCambios",
      procedure: "ResetState",
      source: "binary",
      allowExternalAccessPath: true,
      databasePath: ACCESS_PATH,
    });

    expect(result).toMatchObject({ isError: true, ok: false });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("databasePath");
    expect(text).toMatch(/pass (it|the same path) as accessPath/);
    expect(harness.calls).toEqual([]);
  });

  it("keeps the complete call shape working unchanged", async () => {
    const harness = makeTools();

    const result = await harness.get("get_procedure").handler({
      module: "ControlCambios",
      procedure: "ResetState",
      source: "binary",
      allowExternalAccessPath: true,
      accessPath: ACCESS_PATH,
    });

    expect(result.isError).toBe(false);
    expect(harness.calls).toEqual(["list_vba_modules"]);
  });
});
