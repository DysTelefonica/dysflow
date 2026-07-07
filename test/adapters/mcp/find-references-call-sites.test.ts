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

describe("find_references — returns call sites of a symbol", () => {
  it("returns every call site of the symbol across the binary scope", async () => {
    const sourceFixture = [
      "Option Explicit",
      "",
      "Private Sub EstablecerDatos(ByVal x As Long)",
      "    x = x + 1",
      "End Sub",
      "",
      "Private Sub Notificar()",
      "    Call EstablecerDatos m_Error",
      "End Sub",
      "",
      "Private Sub ProgramarCierre()",
      "    Call EstablecerDatos(m_Error)",
      "End Sub",
    ];

    const tools = createDysflowMcpTools(makeBaseServices() as DysflowMcpServices);
    const tool = tools.find((t) => t.name === "find_references");
    expect(tool).toBeDefined();

    const result = (await tool?.handler({
      symbol: "EstablecerDatos",
      scope: "binary",
      modules: { modRiesgoEstadoGateHelper: sourceFixture.join("\r\n") },
    })) ?? { content: [], isError: true };

    expect(result.isError).toBe(false);
    const text = result.content[0]?.text ?? "";
    const parsed = JSON.parse(text);

    expect(parsed).toEqual({
      symbol: "EstablecerDatos",
      scope: "binary",
      references: [
        {
          module: "modRiesgoEstadoGateHelper",
          kind: "Sub",
          line: 8,
          context: "Call EstablecerDatos m_Error",
        },
        {
          module: "modRiesgoEstadoGateHelper",
          kind: "Sub",
          line: 12,
          context: "Call EstablecerDatos(m_Error)",
        },
      ],
      totalCount: 2,
    });
  });
});
