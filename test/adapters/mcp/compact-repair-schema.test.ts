import { describe, expect, it } from "vitest";
import { QUERY_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/query-schemas.js";

describe("compact_repair schema", () => {
  const schema = QUERY_TOOL_SCHEMAS.compact_repair;

  it("exposes apply and unified confirmation fields without dryRun", () => {
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties).toHaveProperty("apply");
    expect(schema.properties).toHaveProperty("implements_check");
    expect(schema.properties).toHaveProperty("confirmedRequiresConfirmation");
    expect(schema.properties).not.toHaveProperty("dryRun");
  });

  it("accepts both the configured-database and separate-file target arguments", () => {
    expect(schema.properties).toHaveProperty("accessPath");
    expect(schema.properties).toHaveProperty("databasePath");
  });

  it("exposes frontend and backend semantic targets", () => {
    expect(schema.properties.target).toMatchObject({
      type: "string",
      enum: ["frontend", "backend"],
    });
  });
});
