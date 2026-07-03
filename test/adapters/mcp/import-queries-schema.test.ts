/**
 * #672 — import_queries exposes the `importPath` field in the MCP schema so
 * callers can point at a file of query definitions without inlining the
 * array. The runner and the request mapper already support importPath;
 * this test pins the schema-level acceptance.
 */

import { describe, expect, it } from "vitest";
import { MCP_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas";

describe("MCP schema — import_queries exposes importPath (#672)", () => {
  it("import_queries schema includes the importPath property", () => {
    const schema = MCP_TOOL_SCHEMAS.import_queries;
    expect(schema).toBeDefined();
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();
    expect(schema.properties).toHaveProperty("importPath");
  });

  it("importPath is a string type and is documented", () => {
    const importPath = MCP_TOOL_SCHEMAS.import_queries?.properties?.importPath;
    expect(importPath).toBeDefined();
    expect(importPath?.type).toBe("string");
    expect(importPath?.description).toBeTruthy();
  });

  it("importPath coexists with the existing queryDefinitions/queries fields", () => {
    const props = MCP_TOOL_SCHEMAS.import_queries?.properties ?? {};
    // All three should be available — caller can pick one or the other.
    expect(props).toHaveProperty("importPath");
    expect(props).toHaveProperty("queryDefinitions");
    expect(props).toHaveProperty("queries");
  });

  it("additionalProperties is false so unknown fields are rejected (regression pin)", () => {
    // The fix is additive; we MUST NOT widen the schema by relaxing the
    // strict object shape. A caller that passes a typo'd field name
    // should still get MCP_INPUT_INVALID.
    expect(MCP_TOOL_SCHEMAS.import_queries?.additionalProperties).toBe(false);
  });
});
