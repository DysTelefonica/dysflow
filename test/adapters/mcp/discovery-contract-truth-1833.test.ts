/**
 * Issue #1833 — every discovery view must describe what the runtime actually
 * accepts and enforces. Three drifts were observed on 4.4.14:
 *
 *   1. `test_vba.filter` accepts a string OR `{ tag }`, but the inputSchema
 *      declared no shape at all and the `schema` / `describe_tool` parameter
 *      projections reported `type: "string"`.
 *   2. `MCP_WRITES_DISABLED` recovery text recommended `dryRun:true` to tools
 *      whose schema rejects `dryRun` (`additionalProperties: false`).
 *   3. `run_vba` / `test_vba` summaries implied that `allowedProcedures`
 *      alone decides enforcement, omitting `procedureStrictMode`.
 *
 * Every assertion is derived from the live catalog, the live boundary
 * validator, or the live procedure gate — never from a literal sentence.
 */

import { describe, expect, it } from "vitest";
import { ensureProcedureAllowed } from "../../../src/adapters/mcp/canonical-handlers";
import { CAPABILITY_BLOCK_NAMES } from "../../../src/adapters/mcp/capabilities-discovery";
import { allowlistNotConfigured } from "../../../src/adapters/mcp/dispatch-common";
import {
  buildToolSchemaCatalog,
  createDescribeToolTool,
  type ToolSchema,
} from "../../../src/adapters/mcp/schema-tool";
import { validateInput } from "../../../src/shared/validation/validator";

type JsonNode = Record<string, unknown>;

function toolSchema(name: string): ToolSchema {
  const tool = buildToolSchemaCatalog({ toolName: name, view: "full" }).tools[0];
  if (tool === undefined) throw new Error(`tool ${name} missing from catalog`);
  return tool;
}

async function describeParameters(name: string): Promise<Record<string, JsonNode>> {
  const result = await createDescribeToolTool().handler({ name, sections: ["parameters"] });
  const structured = (result as { structuredContent?: JsonNode }).structuredContent;
  const payload =
    structured ??
    (JSON.parse((result.content[0]?.text ?? "{}").replace(/^[A-Z_]+: /, "")) as JsonNode);
  const params = (payload.params ?? payload.parameters) as Record<string, JsonNode> | undefined;
  if (params === undefined) throw new Error(`describe_tool(${name}) returned no parameters`);
  return params;
}

/** Minimal JSON Schema matcher for the keywords the filter contract uses. */
function matches(schema: JsonNode, value: unknown): boolean {
  if (Array.isArray(schema.anyOf)) {
    return (schema.anyOf as JsonNode[]).some((alternative) => matches(alternative, value));
  }
  switch (schema.type) {
    case "string":
      return (
        typeof value === "string" &&
        (typeof schema.minLength !== "number" || value.trim().length >= schema.minLength)
      );
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
      const record = value as JsonNode;
      const properties = (schema.properties ?? {}) as Record<string, JsonNode>;
      for (const key of (schema.required ?? []) as string[]) {
        if (record[key] === undefined) return false;
      }
      for (const [key, child] of Object.entries(record)) {
        const childSchema = properties[key];
        if (childSchema === undefined) {
          if (schema.additionalProperties === false) return false;
          continue;
        }
        if (!matches(childSchema, child)) return false;
      }
      return true;
    }
    default:
      return false;
  }
}

describe("#1833 rule 1 — test_vba.filter shapes agree across discovery views", () => {
  const validShapes: unknown[] = ["smoke", "smoke|regression", { tag: "smoke" }];
  const invalidShapes: unknown[] = [
    {},
    { tags: ["smoke"] },
    { tag: "smoke", name: "x" },
    { tag: 3 },
    { tag: "" },
    42,
  ];

  it("advertises both accepted shapes in inputSchema and rejects the documented invalid ones", () => {
    const filter = (toolSchema("test_vba").inputSchema.properties as Record<string, JsonNode>)
      .filter as JsonNode;
    expect(Array.isArray(filter.anyOf), "filter must declare its shape union").toBe(true);
    for (const value of validShapes)
      expect(matches(filter, value), JSON.stringify(value)).toBe(true);
    for (const value of invalidShapes) {
      expect(matches(filter, value), JSON.stringify(value)).toBe(false);
    }
  });

  it("schema parameter projection and describe_tool report the same union as inputSchema", async () => {
    const tool = toolSchema("test_vba");
    const inputFilter = (tool.inputSchema.properties as Record<string, JsonNode>)
      .filter as JsonNode;
    const advertisedTypes = (inputFilter.anyOf as JsonNode[]).map((alt) => alt.type);

    const projected = tool.parameters.filter as unknown as JsonNode;
    expect(projected.type).not.toBe("string");
    expect((projected.anyOf as JsonNode[]).map((alt) => alt.type)).toEqual(advertisedTypes);

    const described = (await describeParameters("test_vba")).filter as JsonNode;
    expect(described.type).toBe(projected.type);
    expect(described.anyOf).toEqual(projected.anyOf);
  });

  it("preserves the boundary validator: both shapes still pass and string-only filters stay strict", () => {
    const testVba = toolSchema("test_vba").inputSchema;
    for (const value of validShapes)
      expect(validateInput({ filter: value }, testVba)).toBeUndefined();
    // export_modules shares the plain `filter` property and must keep its string guard.
    const exportModules = toolSchema("export_modules");
    expect(exportModules.parameters.filter?.type).toBe("string");
    expect(validateInput({ filter: { tag: "x" } }, exportModules.inputSchema)).toMatch(
      /filter must be a string/,
    );
  });
});

describe("#1833 rule 2 — recovery guidance produces a schema-valid call", () => {
  const FLAG = /\b([A-Za-z]+):(true|false)\b/g;

  function recommendedFlags(text: string): Array<[string, boolean]> {
    return [...text.matchAll(FLAG)].map((m) => [m[1] as string, m[2] === "true"]);
  }

  it("every write-class tool's MCP_WRITES_DISABLED guidance names only flags its schema accepts", () => {
    const catalog = buildToolSchemaCatalog({ view: "full" }).tools;
    const offenders: string[] = [];
    for (const tool of catalog) {
      const entry = tool.errorCodes.find((code) => code.code === "MCP_WRITES_DISABLED");
      if (entry === undefined) continue;
      for (const [flag, value] of recommendedFlags(entry.description)) {
        const property = (tool.inputSchema.properties as Record<string, JsonNode>)[flag];
        if (property === undefined || property.type !== "boolean") {
          offenders.push(`${tool.name}: ${flag}:${value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("test_vba recommends the canonical planning input apply:false, which validates", () => {
    const tool = toolSchema("test_vba");
    const entry = tool.errorCodes.find((code) => code.code === "MCP_WRITES_DISABLED");
    const flags = recommendedFlags(entry?.description ?? "");
    expect(flags).toContainEqual(["apply", false]);
    expect(validateInput({ apply: false }, tool.inputSchema)).toBeUndefined();
    expect(validateInput({ dryRun: true }, tool.inputSchema)).toMatch(/dryRun is not allowed/);
  });

  it("run_vba's strict-mode allowlist refusal recommends a plan input run_vba accepts", () => {
    const tool = toolSchema("run_vba");
    const refusal = allowlistNotConfigured("Mod.Proc");
    const remediation = (refusal as { error?: { remediation?: string } }).error?.remediation ?? "";
    for (const [flag] of recommendedFlags(remediation)) {
      expect(Object.keys(tool.inputSchema.properties), flag).toContain(flag);
    }
    expect(recommendedFlags(remediation)).toContainEqual(["apply", false]);
  });
});

describe("#1833 rule 3 — procedure summaries state the strictMode dependency", () => {
  const strictModeKey = CAPABILITY_BLOCK_NAMES.find((name) => name === "procedureStrictMode");

  it("the live gate enforces a populated list only under strictMode:true", () => {
    const list = ["Mod.Allowed"];
    expect(ensureProcedureAllowed("Mod.Other", list, false, undefined)).toBeUndefined();
    expect(ensureProcedureAllowed("Mod.Other", list, false, false)).toBeUndefined();
    expect(ensureProcedureAllowed("Mod.Other", list, false, true)?.isError).toBe(true);
  });

  it.each(["run_vba", "test_vba"])(
    "%s summary names the capability that decides enforcement, including the unresolved state",
    (name) => {
      const description = toolSchema(name).description;
      expect(strictModeKey).toBeDefined();
      expect(description).toContain(strictModeKey as string);
      expect(description).toMatch(/unresolved/i);
      expect(description).toMatch(/default-allow/i);
      // Recovery/planning advice in the summary must be schema-valid too.
      const properties = Object.keys(toolSchema(name).inputSchema.properties);
      for (const match of description.matchAll(/\b([A-Za-z]+):(true|false)\b/g)) {
        expect(properties, match[0]).toContain(match[1]);
      }
    },
  );
});
