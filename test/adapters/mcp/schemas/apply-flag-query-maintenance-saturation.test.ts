/**
 * Issue #1031 — 24 saturation pins align four query-maintenance schemas with
 * their registry commit flag and safe no-flag default.
 */
import { describe, expect, it } from "vitest";
import { QUERY_TOOL_SCHEMAS } from "../../../../src/adapters/mcp/schemas/query-schemas.js";
import { COMMIT_FLAG_REGISTRY } from "../../../../src/core/runtime/commit-flag-registry.js";
import {
  type JsonObjectSchema,
  SCHEMA_PROPS,
  validateInput,
} from "../../../../src/shared/validation/index.js";

const QUERY_MAINTENANCE_SIBLINGS = [
  "relink_tables",
  "unlink_table",
  "import_queries",
  "localize_backend_links",
] as const;

type QueryMaintenanceSibling = (typeof QUERY_MAINTENANCE_SIBLINGS)[number];

const BASE_INPUTS: Record<QueryMaintenanceSibling, Record<string, unknown>> = {
  relink_tables: {
    accessPath: "C:/project/Foo.accdb",
    backendPath: "C:/project/Backend.accdb",
  },
  unlink_table: {
    accessPath: "C:/project/Foo.accdb",
    tableName: "LinkedTable",
  },
  import_queries: {
    accessPath: "C:/project/Foo.accdb",
    queryDefinitions: [{ name: "Q_Issue1031", sql: "SELECT 1" }],
  },
  localize_backend_links: {
    accessPath: "C:/project/Foo.accdb",
    backendPath: "C:/project/Backend.accdb",
  },
};

function schemaFor(toolName: QueryMaintenanceSibling): JsonObjectSchema {
  const schema = (QUERY_TOOL_SCHEMAS as Record<string, JsonObjectSchema>)[toolName];
  if (schema === undefined) throw new Error(`Missing schema for ${toolName}`);
  return schema;
}

function inputFor(
  toolName: QueryMaintenanceSibling,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...BASE_INPUTS[toolName], ...extra };
}

describe("Issue #1031 — query-maintenance apply:true saturation", () => {
  for (const toolName of QUERY_MAINTENANCE_SIBLINGS) {
    describe(toolName, () => {
      it("keeps commitFlag:apply in the canonical registry", () => {
        expect(COMMIT_FLAG_REGISTRY[toolName]).toEqual({
          commitFlag: "apply",
          noWriteAlias: "dryRun",
          defaultBehavior: "plan",
        });
      });

      it("declares the shared SCHEMA_PROPS.apply atom", () => {
        expect(schemaFor(toolName).properties.apply).toBe(SCHEMA_PROPS.apply);
      });

      it("accepts apply:true without an apply-is-not-allowed rejection", () => {
        expect(
          validateInput(inputFor(toolName, { apply: true }), schemaFor(toolName)),
        ).toBeUndefined();
      });

      it("rejects a non-boolean apply value with the typed validation message", () => {
        expect(validateInput(inputFor(toolName, { apply: "yes" }), schemaFor(toolName))).toMatch(
          /apply must be a boolean/i,
        );
      });

      it("continues to reject unrelated unknown fields", () => {
        expect(
          validateInput(inputFor(toolName, { notARealFlag: true }), schemaFor(toolName)),
        ).toMatch(/notARealFlag is not allowed/i);
      });

      it("continues to accept the safe no-flag default", () => {
        expect(validateInput(inputFor(toolName), schemaFor(toolName))).toBeUndefined();
      });
    });
  }
});
