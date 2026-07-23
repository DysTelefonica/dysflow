/**
 * Issue #1074 — required alias groups must be expressed in the schema,
 * not buried in a handler-only rule.
 *
 * Today the catalog flattens "one of these is required" to per-parameter
 * `required: false`, while the handler rejects empty input. The fix
 * moves the constraint into a declarative `anyOf` on the JSON Schema
 * (and surfaces it in the `schema` catalog via `compositionConstraints`)
 * so the catalog and the handler agree by construction.
 *
 * Every alias group below is composed of `{toolName, alternatives, canonical}`:
 *   - `toolName` — an advertised Dysflow MCP tool
 *   - `alternatives` — the parameter names that satisfy the alias group
 *   - `canonical` — the preferred parameter when callers pass both
 *
 * The test:
 *   1. Walks the live advertised tool list and asserts every entry in
 *      ALIAS_GROUPS has an `anyOf` clause on its MCP input schema.
 *   2. Asserts the validator rejects `{}` for the tool (because at least
 *      one alternative must be present).
 *   3. Asserts the validator accepts each alternative in isolation AND
 *      accepts the canonical when both are supplied.
 *   4. Asserts the `schema` catalog surfaces the constraint via
 *      `compositionConstraints` so a consumer can introspect the rule
 *      without hand-parsing the raw JSON Schema.
 *
 * Acceptance is "every declared alias group has a corresponding
 * declarative schema constraint AND the catalog surfaces it".
 */
import { describe, expect, it } from "vitest";
import { buildToolSchemaCatalog } from "../../../src/adapters/mcp/schema-tool.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";
import type { JsonObjectSchema } from "../../../src/shared/validation/schemas.js";
import { validateInput } from "../../../src/shared/validation/validator.js";

type AliasGroup = {
  toolName: string;
  alternatives: readonly string[];
  canonical: string;
};

const ALIAS_GROUPS: readonly AliasGroup[] = [
  {
    toolName: "describe_tool",
    alternatives: ["name", "toolName"],
    canonical: "name",
  },
  {
    toolName: "analyze_form_ui",
    alternatives: ["sourcePath", "path"],
    canonical: "sourcePath",
  },
  {
    toolName: "unlink_table",
    alternatives: ["tableName", "table"],
    canonical: "tableName",
  },
  {
    toolName: "validate_manifest",
    alternatives: ["testsPath", "path", "manifest"],
    canonical: "testsPath",
  },
];

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

const TOOL_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

function inputSchemaFor(toolName: string): JsonObjectSchema | undefined {
  const tool = TOOL_BY_NAME.get(toolName);
  if (tool === undefined) return undefined;
  const raw = tool.inputSchema;
  if (typeof raw !== "object" || raw === null) return undefined;
  return raw as JsonObjectSchema;
}

function readAnyOf(
  schema: JsonObjectSchema,
): readonly { required?: readonly string[] }[] | undefined {
  if (!Array.isArray(schema.anyOf)) return undefined;
  return schema.anyOf as readonly { required?: readonly string[] }[];
}

describe("alias-group declarations (#1074)", () => {
  for (const group of ALIAS_GROUPS) {
    it(`${group.toolName} declares an anyOf on every documented alias`, () => {
      const schema = inputSchemaFor(group.toolName);
      expect(schema, `MCP input schema for '${group.toolName}' must be defined`).toBeDefined();
      const alts = readAnyOf(schema as JsonObjectSchema);
      expect(
        alts,
        `${group.toolName} must declare anyOf; the alias-group requirement is currently a handler-only rule`,
      ).toBeDefined();
      const requiredByAlt = (alts ?? []).map((alt) => alt.required ?? []);
      const expectedSets = group.alternatives.map((param) => [param]);
      for (const expected of expectedSets) {
        expect(
          requiredByAlt.some(
            (set) => set.length === expected.length && expected.every((p) => set.includes(p)),
          ),
          `${group.toolName} must declare anyOf with required:${JSON.stringify(expected)} (one of the alternatives)`,
        ).toBe(true);
      }
    });
  }

  it("every alias-group tool rejects an empty input via the validator", () => {
    for (const group of ALIAS_GROUPS) {
      const schema = inputSchemaFor(group.toolName);
      if (schema === undefined) throw new Error(`Schema missing for ${group.toolName}`);
      const result = validateInput({}, schema);
      expect(
        result,
        `validateInput({}, ${group.toolName}Schema) must reject empty input — the alias-group constraint must be declarative`,
      ).toBeDefined();
      expect(result ?? "").toMatch(/required|anyOf|one of|missing/i);
    }
  });

  it("every alias-group tool accepts each alternative in isolation", () => {
    for (const group of ALIAS_GROUPS) {
      const schema = inputSchemaFor(group.toolName);
      if (schema === undefined) throw new Error(`Schema missing for ${group.toolName}`);
      for (const alternative of group.alternatives) {
        const fixture: Record<string, string> = { [alternative]: "ok" };
        const result = validateInput(fixture, schema);
        expect(
          result,
          `validateInput({ ${alternative}: 'ok' }, ${group.toolName}Schema) must accept the alternative '${alternative}' without other group members present`,
        ).toBeUndefined();
      }
    }
  });

  it("alias-group tools accept the canonical parameter when both are supplied", () => {
    for (const group of ALIAS_GROUPS) {
      const schema = inputSchemaFor(group.toolName);
      if (schema === undefined) throw new Error(`Schema missing for ${group.toolName}`);
      const fixture: Record<string, string> = { [group.canonical]: "canonical-value" };
      for (const other of group.alternatives) {
        if (other === group.canonical) continue;
        fixture[other] = "alias-value";
      }
      const result = validateInput(fixture, schema);
      expect(
        result,
        `validateInput({ ${group.canonical}: 'canonical', [alias]: 'alias' }, ${group.toolName}Schema) must accept the canonical + alias combination`,
      ).toBeUndefined();
    }
  });

  it("the schema catalog surfaces compositionConstraints for every alias-group tool", () => {
    const catalog = buildToolSchemaCatalog({});
    const byName = new Map(catalog.tools.map((t) => [t.name, t]));
    for (const group of ALIAS_GROUPS) {
      const entry = byName.get(group.toolName);
      expect(entry, `catalog must include '${group.toolName}'`).toBeDefined();
      const entryRecord = entry as unknown as Record<string, unknown>;
      const constraints = entryRecord.compositionConstraints;
      expect(
        Array.isArray(constraints),
        `${group.toolName} must surface compositionConstraints (alias-group requirements) in the catalog`,
      ).toBe(true);
      const list = constraints as Array<{
        kind: string;
        alternatives: Array<{ parameters: readonly string[]; canonical?: string }>;
      }>;
      const anyOf = list.find((c) => c.kind === "anyOf");
      expect(anyOf, `${group.toolName} must declare an anyOf compositionConstraint`).toBeDefined();
      const altParams = (anyOf?.alternatives ?? []).flatMap((a) => a.parameters);
      for (const expected of group.alternatives) {
        expect(
          altParams.includes(expected),
          `${group.toolName} compositionConstraints must list '${expected}' as an alternative parameter`,
        ).toBe(true);
      }
      const canonicalAlt = (anyOf?.alternatives ?? []).find((a) => a.canonical === group.canonical);
      expect(
        canonicalAlt,
        `${group.toolName} must mark '${group.canonical}' as canonical in compositionConstraints[anyOf]`,
      ).toBeDefined();
    }
  });
});
