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

describe("list_procedures — substring filter narrows procedures to matching names", () => {
  it("returns only procedures whose name contains the filter substring", async () => {
    const sourceFixture = [
      "Option Explicit",
      "",
      "Private Sub CargarPermisos()",
      "    Dim a As Long",
      "End Sub",
      "",
      "Private Sub CargarDatos()",
      "    Dim b As Long",
      "End Sub",
      "",
      "Private Sub AplicarEstado()",
      "    Dim c As Long",
      "End Sub",
      "",
      "Private Sub RenderizarControles()",
      "    Dim d As Long",
      "End Sub",
    ];

    const tools = createDysflowMcpTools({ services: makeBaseServices() as DysflowMcpServices });
    const tool = tools.find((t) => t.name === "list_procedures");
    if (tool === undefined) throw new Error("list_procedures tool not found");

    const result = await tool.handler({
      module: "modRiesgoEstadoGateHelper",
      filter: "Cargar",
      source: sourceFixture.join("\r\n"),
    });

    expect(result.isError).toBe(false);
    const text = result.content[0]?.text ?? "";
    const parsed = JSON.parse(text);

    expect(parsed).toEqual({
      module: "modRiesgoEstadoGateHelper",
      procedures: [
        { name: "CargarPermisos", kind: "Sub", visibility: "Private", line: 3 },
        { name: "CargarDatos", kind: "Sub", visibility: "Private", line: 7 },
      ],
    });
  });
});
