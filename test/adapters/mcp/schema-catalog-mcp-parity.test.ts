/**
 * Issue #1072 — make `schema` / `describe_tool` introspection match the
 * input schemas actually advertised by `createDysflowMcpTools` for every
 * tool.
 *
 * Today's catalog (`src/adapters/mcp/schema-tool.ts`) reads input schemas
 * from a hand-maintained `MODERN_TOOL_INPUT_SCHEMAS` lookup plus a fall-
 * through to `NO_INPUT_SCHEMA`. The lookup is missing four modern tools
 * (`schema`, `diagnose`, `state`, `clean_stale_markers`) and registers
 * `schema` itself against `NO_INPUT_SCHEMA` even though the tool
 * advertises real parameters (`projectId`, `toolName`). As a consequence,
 * `buildToolSchemaCatalog(...).parameters` reports `{ }` for those four
 * tools while their MCP advertisement carries the full schema — the two
 * surfaces disagree and an AI consumer can't trust either.
 *
 * Acceptance: a generative parity test walks every advertised tool and
 * compares the catalog parameters against the MCP input schema. The
 * test currently fails for `schema`, `diagnose`, `state`, and
 * `clean_stale_markers`. Fix is to source the schema from the same
 * authority the MCP advertisement uses so the two agree by construction.
 */
import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import {
  buildToolSchemaCatalog,
  type ToolSchema,
} from "../../../src/adapters/mcp/schema-tool.js";
import { successResult } from "../../../src/core/contracts/index.js";

class FakeVbaService {
  async execute() {
    return successResult({ returnValue: "ok" });
  }
}
class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}
class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

const TOOLS = createDysflowMcpTools({
  services: {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  },
});

const ADVERTISED_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

function catalogEntry(name: string): ToolSchema {
  const catalog = buildToolSchemaCatalog({ toolName: name });
  const entry = catalog.tools[0];
  if (entry === undefined) {
    throw new Error(`Catalog missing tool '${name}'`);
  }
  return entry;
}

function advertisedPropertyKeys(name: string): string[] {
  const tool = ADVERTISED_BY_NAME.get(name);
  if (tool === undefined) return [];
  const schema =
    typeof tool.inputSchema === "object" && tool.inputSchema !== null
      ? (tool.inputSchema as { properties?: Record<string, unknown> })
      : { properties: {} };
  return Object.keys(schema.properties ?? {}).sort();
}

function catalogParameterKeys(name: string): string[] {
  return Object.keys(catalogEntry(name).parameters).sort();
}

describe("schema/describe_tool catalog matches MCP input schemas (#1072)", () => {
  it("the four previously broken tools now expose their real parameters", () => {
    for (const name of ["schema", "diagnose", "state", "clean_stale_markers"]) {
      const advertised = advertisedPropertyKeys(name);
      const catalog = catalogParameterKeys(name);
      // Before the fix `catalog` is empty for these tools; after the fix it
      // mirrors every advertised property. Pin equality so future regressions
      // surface here rather than silently in production.
      expect(
        catalog,
        `catalog parameters for '${name}' must mirror advertised properties`,
      ).toEqual(advertised);
      expect(advertised.length, `'${name}' must advertise at least one parameter`).toBeGreaterThan(
        0,
      );
    }
  });

  it("catalog parameter keys match advertised schema properties for every advertised tool", () => {
    const failures: string[] = [];
    for (const tool of TOOLS) {
      const advertised = advertisedPropertyKeys(tool.name);
      const catalog = catalogParameterKeys(tool.name);
      if (advertised.join("|") !== catalog.join("|")) {
        failures.push(
          `tool '${tool.name}': advertised=[${advertised.join(",")}] catalog=[${catalog.join(",")}]`,
        );
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("filtering the catalog by toolName preserves the same parameter contract as the full catalog", () => {
    for (const tool of TOOLS) {
      const full = buildToolSchemaCatalog({}).tools.find((t) => t.name === tool.name);
      const filtered = buildToolSchemaCatalog({ toolName: tool.name }).tools[0];
      expect(filtered).toBeDefined();
      // parameter keys come from the same generator, so this must hold for
      // every tool — pinning it stops future regressions where one path
      // diverges (e.g. an alias-only override).
      expect(Object.keys(filtered?.parameters ?? {}).sort()).toEqual(
        Object.keys(full?.parameters ?? {}).sort(),
      );
    }
  });

  it(
    "every modern tool advertised through createDysflowMcpTools is resolvable in the catalog " +
      "(regression guard for unregistered tools — a future modern tool with no schema " +
      "entry surfaces NO_INPUT_SCHEMA at runtime)",
    () => {
      // Walk the live tools list: any tool the factory advertises must
      // resolve through buildToolSchemaCatalog with a real parameters map
      // (possibly empty for tools that accept no input). A future tool
      // that lands in createDysflowMcpTools WITHOUT a corresponding
      // MODERN_TOOL_INPUT_SCHEMAS entry would slip through this assertion
      // as long as its factory inputSchema equals NO_INPUT_SCHEMA; the
      // real protection is the strict, typed registry above, so this test
      // is the surface that catches human oversight.
      const catalogNames = new Set(buildToolSchemaCatalog({}).tools.map((t) => t.name));
      for (const tool of TOOLS) {
        expect(
          catalogNames.has(tool.name),
          `catalog must surface every advertised tool, missing: '${tool.name}'`,
        ).toBe(true);
      }
    },
  );
});
