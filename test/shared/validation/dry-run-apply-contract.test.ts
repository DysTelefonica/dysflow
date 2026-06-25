import { describe, expect, it } from "vitest";
import { HTTP_WRITE_QUERY_SCHEMA } from "../../../src/shared/validation/http-schemas";
import { SCHEMA_PROPS } from "../../../src/shared/validation/schema-props";

/**
 * Contract test for #545: the write-family dryRun/apply contract must be
 * ADVERTISED on the schema props (consuming agents only see the schema), and MCP
 * and HTTP must share the exact same prop so the contract cannot diverge.
 *
 * The resolved behavior itself (default dry-run; apply:true or dryRun:false to
 * commit; apply wins) is exercised in test/adapters/mcp/tools.dry-run.test.ts.
 */
describe("write-family dryRun/apply contract is advertised (#545)", () => {
  it("dryRun description states that writes default to dry-run", () => {
    const description = (SCHEMA_PROPS.dryRun as { description?: string }).description ?? "";
    expect(description).toMatch(/default/i);
    expect(description).toMatch(/dry[- ]?run/i);
  });

  it("apply description states it commits and takes precedence", () => {
    const description = (SCHEMA_PROPS.apply as { description?: string }).description ?? "";
    expect(description).toMatch(/commit|appl/i);
    expect(description).toMatch(/precedence|default/i);
  });

  it("MCP and HTTP reference the same dryRun/apply prop (cannot diverge)", () => {
    expect(HTTP_WRITE_QUERY_SCHEMA.properties?.dryRun).toBe(SCHEMA_PROPS.dryRun);
    expect(HTTP_WRITE_QUERY_SCHEMA.properties?.apply).toBe(SCHEMA_PROPS.apply);
  });
});
