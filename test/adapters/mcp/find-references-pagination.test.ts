/**
 * Issue #1019 — `find_references` MCP -32001 timeout for popular symbols.
 *
 * The MCP layer test exercises the handler surface: `find_references` should
 * accept `limit`/`offset` from the caller, slice the references accordingly,
 * and surface `truncated`/`nextOffset` in the response envelope. For the
 * typical small-symbol case (< default limit) the response is identical to
 * the pre-fix behavior modulo two additive fields.
 */
import { describe, expect, it } from "vitest";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

function makeBaseServices(): DysflowMcpServices {
  return {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
  };
}

function buildPopularSymbolFixture(refCount: number): Record<string, string> {
  const lines: string[] = ["Option Explicit", "", "Public Sub PopularSymbol()", "End Sub", ""];
  for (let i = 0; i < refCount; i++) {
    lines.push(`Public Sub Caller${i}()`);
    lines.push("    PopularSymbol");
    lines.push("End Sub");
    lines.push("");
  }
  return { modWithRefs: lines.join("\r\n") };
}

function getFindReferencesTool(services: DysflowMcpServices) {
  const tools = createDysflowMcpTools({ services });
  const tool = tools.find((t) => t.name === "find_references");
  if (tool === undefined) throw new Error("find_references tool not registered");
  return tool;
}

describe("find_references — pagination contract (#1019)", () => {
  it("slices references when the caller passes an explicit limit", async () => {
    const tool = getFindReferencesTool(makeBaseServices());

    const response = await tool.handler({
      symbol: "PopularSymbol",
      scope: "binary",
      modules: buildPopularSymbolFixture(600),
      limit: 25,
    });

    expect(response.isError).toBe(false);
    const parsed = JSON.parse(response.content[0]?.text ?? "{}");

    expect(parsed.symbol).toBe("PopularSymbol");
    expect(parsed.scope).toBe("binary");
    expect(parsed.references).toHaveLength(25);
    expect(parsed.totalCount).toBe(600);
    expect(parsed.truncated).toBe(true);
    expect(parsed.nextOffset).toBe(25);
  });

  it("backward-compat: small symbol with no limit/offset returns truncated=false + nextOffset=null", async () => {
    const tool = getFindReferencesTool(makeBaseServices());

    const response = await tool.handler({
      symbol: "EstablecerDatos",
      scope: "binary",
      modules: {
        modRiesgoEstadoGateHelper: [
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
        ].join("\r\n"),
      },
    });

    expect(response.isError).toBe(false);
    const parsed = JSON.parse(response.content[0]?.text ?? "{}");

    // Pre-fix existing fields preserved verbatim
    expect(parsed.symbol).toBe("EstablecerDatos");
    expect(parsed.scope).toBe("binary");
    expect(parsed.references).toHaveLength(2);
    expect(parsed.totalCount).toBe(2);
    // Additive pagination metadata — small symbol, default limit not reached
    expect(parsed.truncated).toBe(false);
    expect(parsed.nextOffset).toBe(null);
  });

  it("returns the next page when the caller supplies offset", async () => {
    const tool = getFindReferencesTool(makeBaseServices());

    const response = await tool.handler({
      symbol: "PopularSymbol",
      scope: "binary",
      modules: buildPopularSymbolFixture(120),
      limit: 50,
      offset: 100,
    });

    expect(response.isError).toBe(false);
    const parsed = JSON.parse(response.content[0]?.text ?? "{}");
    expect(parsed.references).toHaveLength(20);
    expect(parsed.totalCount).toBe(120);
    expect(parsed.truncated).toBe(false);
    expect(parsed.nextOffset).toBe(null);
  });

  it("FIND_REFERENCES_SCHEMA input declares limit and offset as optional parameters", () => {
    const tool = getFindReferencesTool(makeBaseServices());

    const inputSchema = tool.inputSchema as { properties?: Record<string, unknown> };
    const properties = inputSchema.properties;
    expect(properties).toBeDefined();
    if (properties === undefined) throw new Error("schema.properties missing");
    expect(properties).toHaveProperty("limit");
    expect(properties).toHaveProperty("offset");
    expect(properties.symbol).toBeDefined();
    expect(properties.scope).toBeDefined();
  });
});
