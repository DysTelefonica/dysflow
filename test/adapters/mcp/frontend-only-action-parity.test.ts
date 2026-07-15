import { describe, expect, it } from "vitest";
import { QUERY_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/query-schemas.js";
import { FRONTEND_ONLY_ACTIONS } from "../../../src/core/mapping/access-query-request-mapper.js";

/**
 * #870 — the frontend-only role is declared in two layers that must agree:
 * the MCP schema (a `target` enum of exactly `["frontend"]`) and the core
 * mapper's FRONTEND_ONLY_ACTIONS (which forces the role, letting the runner
 * resolve it to the configured accessDbPath). If a tool is declared
 * frontend-only in the schema but missing from the core set, the runner never
 * forces the frontend and the tool silently falls through to the configured
 * backend in a split project — the exact defect #870 exists to remove.
 */
function frontendOnlyToolsDeclaredInMcpSchemas(): string[] {
  return Object.entries(QUERY_TOOL_SCHEMAS)
    .filter(([, schema]) => {
      const target = schema.properties?.target as { enum?: unknown[] } | undefined;
      return (
        Array.isArray(target?.enum) && target.enum.length === 1 && target.enum[0] === "frontend"
      );
    })
    .map(([toolName]) => toolName)
    .sort();
}

describe("frontend-only action parity (#870)", () => {
  it("declares the same frontend-only tools in the MCP schemas and the core mapper", () => {
    expect(frontendOnlyToolsDeclaredInMcpSchemas()).toEqual([...FRONTEND_ONLY_ACTIONS].sort());
  });

  it("never leaves a frontend-only tool able to select a backend role", () => {
    for (const toolName of FRONTEND_ONLY_ACTIONS) {
      const target = QUERY_TOOL_SCHEMAS[toolName as keyof typeof QUERY_TOOL_SCHEMAS]?.properties
        ?.target as { enum?: unknown[] } | undefined;

      expect(target?.enum, `${toolName} must expose a target enum`).toBeDefined();
      expect(target?.enum, `${toolName} must not offer backend or auto`).toEqual(["frontend"]);
    }
  });
});
