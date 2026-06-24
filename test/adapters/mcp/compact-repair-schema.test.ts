import { describe, expect, it } from "vitest";
import { QUERY_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/query-schemas.js";

describe("compact_repair schema", () => {
  const schema = QUERY_TOOL_SCHEMAS.compact_repair;

  it("exposes the apply opt-in alongside dryRun so callers can request a real compaction", () => {
    // Regression: the schema is additionalProperties:false, so `apply` must be declared for
    // `apply: true` to pass validation instead of being rejected as MCP_INPUT_INVALID. The
    // dispatch write-gate already honors `apply: true` via resolveIsDryRun.
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties).toHaveProperty("apply");
    expect(schema.properties).toHaveProperty("dryRun");
  });

  it("accepts both the configured-database and separate-file target arguments", () => {
    expect(schema.properties).toHaveProperty("accessPath");
    expect(schema.properties).toHaveProperty("databasePath");
  });
});
