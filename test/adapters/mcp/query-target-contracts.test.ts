import { describe, expect, it } from "vitest";
import { QUERY_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/query-schemas.js";
import { validateInput } from "../../../src/shared/validation/validator.js";

describe("DAO MCP target contracts", () => {
  it.each([
    "list_tables",
    "query_sql",
    "get_relationships",
  ] as const)("%s accepts explicit frontend/backend roles but rejects auto without a table identity", (toolName) => {
    const schema = QUERY_TOOL_SCHEMAS[toolName];

    const required = toolName === "query_sql" ? { sql: "SELECT 1" } : {};
    expect(
      validateInput({ ...required, projectId: "split", target: "frontend" }, schema),
    ).toBeUndefined();
    expect(
      validateInput({ ...required, projectId: "split", target: "backend" }, schema),
    ).toBeUndefined();
    expect(validateInput({ ...required, projectId: "split", target: "auto" }, schema)).toContain(
      "frontend, backend",
    );
  });

  it.each([
    "get_schema",
    "count_rows",
    "distinct_values",
  ] as const)("%s exposes auto because its table identity can drive cross-database lookup", (toolName) => {
    const schema = QUERY_TOOL_SCHEMAS[toolName];
    expect(
      validateInput({ projectId: "split", target: "auto", tableName: "People" }, schema),
    ).toBeUndefined();
  });

  it.each([
    "list_linked_tables",
    "list_links",
    "export_queries",
    "link_tables",
    "relink_tables",
    "localize_backend_links",
    "unlink_table",
    "import_queries",
  ] as const)("%s declares an explicit frontend-only role", (toolName) => {
    const schema = QUERY_TOOL_SCHEMAS[toolName];

    // Issue #1074 — `unlink_table` declares a `tableName | table` alias
    // group on the input schema. The "frontend-only role" assertion
    // covers the `target` discrimination, which is independent of the
    // table identity; supplying `tableName` here keeps the assertion
    // focused on the target role without crossing the alias-group gate.
    const identity = toolName === "unlink_table" ? { tableName: "TestTable" } : {};
    expect(
      validateInput({ projectId: "split", target: "frontend", ...identity }, schema),
    ).toBeUndefined();
    expect(validateInput({ projectId: "split", target: "backend", ...identity }, schema)).toContain(
      "frontend",
    );
    expect(validateInput({ projectId: "split", target: "auto", ...identity }, schema)).toContain(
      "frontend",
    );
  });

  it.each([
    "list_tables",
    "get_schema",
    "count_rows",
    "distinct_values",
  ] as const)("%s keeps the shared explicit path aliases", (toolName) => {
    const properties = QUERY_TOOL_SCHEMAS[toolName].properties;
    expect(properties).toHaveProperty("accessPath");
    expect(properties).toHaveProperty("backendPath");
    expect(properties).toHaveProperty("databasePath");
    expect(properties).toHaveProperty("sourcePath");
  });
});
