import { describe, expect, it } from "vitest";

import { findReferencesResultContract } from "../../../src/adapters/mcp/contracts/remaining-result-contracts.js";
import { getCapabilitiesAll } from "../../../src/adapters/mcp/get-capabilities-tool.js";
import { buildToolSchemaCatalog } from "../../../src/adapters/mcp/schema-tool.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import {
  createDysflowError,
  failureResult,
  successResult,
} from "../../../src/core/contracts/index.js";
import { validateVbaTestManifest } from "../../../src/core/services/vba-test-manifest-service.js";

function schemaProperties(schema: Record<string, unknown>): Record<string, unknown> {
  return (schema.properties as Record<string, unknown> | undefined) ?? {};
}

describe("schema/runtime drift regressions (#1256)", () => {
  it("publishes a concrete non-empty data schema for every advertised tool", () => {
    const failures: string[] = [];
    for (const tool of buildToolSchemaCatalog({}).tools) {
      if (tool.resultContract.kind !== "dataSchema") {
        failures.push(`${tool.name}: ${tool.resultContract.kind}`);
        continue;
      }
      const schema = tool.resultContract.dataSchema as Record<string, unknown>;
      const hasDocumentedShape =
        Object.keys(schemaProperties(schema)).length > 0 ||
        (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) ||
        (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) ||
        (Array.isArray(schema.allOf) && schema.allOf.length > 0);
      if (!hasDocumentedShape) failures.push(`${tool.name}: empty dataSchema`);
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it.each([
    [
      "list_objects",
      [
        "outputMode",
        "summary",
        "itemCount",
        "forms",
        "reports",
        "modules",
        "classes",
        "documentModules",
      ],
    ],
    ["list_vba_modules", ["modules", "summary"]],
    ["exists", ["moduleExists", "moduleName"]],
  ])("documents the runtime fields returned by %s", (toolName, expectedFields) => {
    const tool = buildToolSchemaCatalog({ toolName }).tools[0];
    expect(tool).toBeDefined();
    if (tool?.resultContract.kind !== "dataSchema") throw new Error(`${toolName} lacks dataSchema`);
    const properties = schemaProperties(tool.resultContract.dataSchema);
    for (const field of expectedFields)
      expect(properties, `${toolName}.${field}`).toHaveProperty(field);
  });

  it("couples find_references binaryReferences with hasDifferences for scope=all", () => {
    const base = {
      symbol: "CallMe",
      scope: "all",
      references: [],
      totalCount: 0,
      truncated: false,
      nextOffset: null,
      sourceReferences: [],
      differences: { onlyInSource: [], onlyInBinary: [] },
    };
    expect(findReferencesResultContract.schema.safeParse(base).success).toBe(false);
    expect(
      findReferencesResultContract.schema.safeParse({
        ...base,
        binaryReferences: [],
        hasDifferences: false,
      }).success,
    ).toBe(true);
  });

  it("keeps effectiveDryRunDefault coherent with describe_tool.defaultBehavior", () => {
    const capabilities = getCapabilitiesAll({
      writesEnabled: false,
      writeAccessResolver: undefined,
      allowedProcedures: undefined,
      allowWrites: false,
      projectId: "issue-1256",
    });
    const failures = buildToolSchemaCatalog({ view: "compact" })
      .tools.filter(
        (tool) =>
          capabilities.effectiveDryRunDefault[tool.name] !==
          (tool.writeIntent?.defaultBehavior !== "writes"),
      )
      .map(
        (tool) =>
          `${tool.name}: effective=${String(capabilities.effectiveDryRunDefault[tool.name])}, default=${tool.writeIntent?.defaultBehavior ?? "none"}`,
      );
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("surfaces an allowlist warning when the requested check has no configured procedures", () => {
    const manifest = { tests: [{ procedure: "Test_A", args: [], tags: [] }] };
    const modules = { Tests: "Public Sub Test_A()\r\nEnd Sub" };
    const withoutCheck = validateVbaTestManifest(manifest, modules);
    const withCheck = validateVbaTestManifest(manifest, modules, {
      includeAllowlistCheck: true,
      allowedProcedures: [],
    });

    expect(withCheck.warnings).toContainEqual(expect.objectContaining({ code: "ALLOWLIST_EMPTY" }));
    expect(withCheck).not.toEqual(withoutCheck);
  });

  it("adds remediation to every SQL-family error envelope", async () => {
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute: async () => successResult({}) },
        diagnosticsService: { run: async () => successResult({ checks: [] }) },
        queryService: {
          execute: async () => failureResult(createDysflowError("QUERY_FAILED", "synthetic")),
        },
      },
    });
    for (const name of [
      "query_execute",
      "create_table",
      "drop_table",
      "list_access_files",
      "seed_fixture",
      "teardown_fixture",
      "list_tables",
    ]) {
      const tool = tools.find((candidate) => candidate.name === name);
      if (tool === undefined) throw new Error(`${name} is not registered`);
      const result = await tool.handler({});
      expect(result.isError, name).toBe(true);
      expect(result.error?.remediation, name).toEqual(expect.anything());
    }
  });
});
