import { describe, expect, it } from "vitest";
import { EXPECTED_ADVERTISED_TOOL_COUNT } from "../../../E2E_testing/_helpers/advertised-tool-count.mjs";
import {
  buildToolSchemaCatalog,
  SCHEMA_TOOL_INPUT_SCHEMA,
  type SchemaInput,
  type ToolSchema,
} from "../../../src/adapters/mcp/schema-tool.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";
import { validateInput } from "../../../src/shared/validation/index.js";

const COMPACT_TOOL_KEYS = [
  "access",
  "defaults",
  "name",
  "primaryResult",
  "purpose",
  "recommendations",
  "requiredParameterGroups",
  "requiredParameters",
  "writeIntent",
];

const PRIMARY_RESULT_KEYS = ["fields", "kind", "modes", "outputModes", "requiredFields", "summary"];

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

const ADVERTISED_TOOLS = createDysflowMcpTools({
  services: {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  },
});

type CompactTool = {
  name: string;
  purpose: string;
  access: "read-only" | "read-write" | "conditional-write";
  requiredParameters: string[];
  requiredParameterGroups: unknown[];
  defaults: Record<string, unknown>;
  writeIntent: {
    canonicalCommitFlag: string;
    noWriteAlias: string | null;
    defaultBehavior: string;
    legacyAliases: string[];
  } | null;
  primaryResult: {
    kind: string;
    summary: string;
    fields: string[];
    requiredFields: string[];
    modes: string[];
    outputModes: string[];
  };
  recommendations: {
    deepView: "describe_tool";
    useCases: string[];
  };
};

type CompactCatalog = {
  projectId: string | null;
  tools: CompactTool[];
};

type FullTool = ToolSchema & {
  access: CompactTool["access"];
  inputSchema: Record<string, unknown>;
};

type FullCatalog = {
  projectId: string | null;
  tools: FullTool[];
};

function buildCompact(toolName?: string): CompactCatalog {
  const input = {
    view: "compact",
    ...(toolName === undefined ? {} : { toolName }),
  } as SchemaInput;
  return buildToolSchemaCatalog(input) as unknown as CompactCatalog;
}

function buildFull(toolName?: string): FullCatalog {
  const input = {
    view: "full",
    ...(toolName === undefined ? {} : { toolName }),
  } as SchemaInput;
  return buildToolSchemaCatalog(input) as unknown as FullCatalog;
}

function defaultsFrom(tool: ToolSchema): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(tool.parameters)
      .filter(([, parameter]) => Object.hasOwn(parameter, "default"))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, parameter]) => [name, parameter.default]),
  );
}

describe("schema compact and full introspection views (#1079)", () => {
  it("publishes a deterministic stable compact shape for every advertised tool", () => {
    const first = buildCompact();
    const second = buildCompact();

    expect(first).toEqual(second);
    expect(first.tools).toHaveLength(EXPECTED_ADVERTISED_TOOL_COUNT);
    expect(first.tools.map((tool) => tool.name)).toEqual(
      first.tools.map((tool) => tool.name).sort(),
    );

    for (const tool of first.tools) {
      expect(Object.keys(tool).sort()).toEqual(COMPACT_TOOL_KEYS);
      expect(tool.purpose.length, `${tool.name} must have a purpose`).toBeGreaterThan(0);
      expect(Object.keys(tool.primaryResult).sort()).toEqual(PRIMARY_RESULT_KEYS);
      expect(Object.keys(tool.recommendations).sort()).toEqual(["deepView", "useCases"]);
      expect(tool.recommendations.deepView).toBe("describe_tool");
    }
  });

  it("derives compact parameters, defaults, results and recommendations from full entries", () => {
    const full = buildFull();
    const compact = buildCompact();
    const fullByName = new Map(full.tools.map((tool) => [tool.name, tool]));

    expect(compact.tools.map((tool) => tool.name)).toEqual(full.tools.map((tool) => tool.name));

    for (const tool of compact.tools) {
      const source = fullByName.get(tool.name);
      expect(source, `full view missing ${tool.name}`).toBeDefined();
      if (source === undefined) continue;

      expect(tool.access).toBe(source.access);
      expect(tool.requiredParameters).toEqual(
        Object.entries(source.parameters)
          .filter(([, parameter]) => parameter.required)
          .map(([name]) => name)
          .sort(),
      );
      expect(tool.requiredParameterGroups).toEqual(source.compositionConstraints);
      expect(tool.defaults).toEqual(defaultsFrom(source));
      expect(tool.primaryResult.kind).toBe(source.resultContract.kind);
      expect(tool.recommendations.useCases).toEqual(source.useCases);
    }

    expect(compact.tools.find((tool) => tool.name === "export_modules")?.writeIntent).toEqual({
      canonicalCommitFlag: "apply",
      noWriteAlias: "diff",
      defaultBehavior: "writes",
      legacyAliases: ["diff", "dryRun"],
    });
    expect(compact.tools.find((tool) => tool.name === "resolve_project")?.writeIntent).toBeNull();
  });

  it("filters both views without changing their respective shapes", () => {
    for (const view of ["compact", "full"] as const) {
      const catalog =
        view === "compact" ? buildCompact("export_modules") : buildFull("export_modules");
      expect(catalog.tools).toHaveLength(1);
      expect(catalog.tools[0]?.name).toBe("export_modules");

      const missing = view === "compact" ? buildCompact("no-such-tool") : buildFull("no-such-tool");
      expect(missing.tools).toEqual([]);
    }

    expect(buildCompact("").tools).toHaveLength(EXPECTED_ADVERTISED_TOOL_COUNT);
  });

  it("keeps omitted view backward compatible with full and exposes complete advertised input schemas", () => {
    const legacy = buildToolSchemaCatalog({}) as unknown as FullCatalog;
    const full = buildFull();

    expect(full).toEqual(legacy);
    expect(full).not.toHaveProperty("view");

    const fullByName = new Map(full.tools.map((tool) => [tool.name, tool]));
    for (const advertised of ADVERTISED_TOOLS) {
      expect(fullByName.get(advertised.name)?.inputSchema, advertised.name).toEqual(
        advertised.inputSchema,
      );
    }
  });

  it("is materially smaller than full and carries no issue-history prose", () => {
    const compact = buildCompact();
    const compactJson = JSON.stringify(compact);
    const fullJson = JSON.stringify(buildFull());

    expect(Buffer.byteLength(compactJson)).toBeLessThan(Buffer.byteLength(fullJson) * 0.45);
    for (const tool of compact.tools) {
      expect(tool).not.toHaveProperty("crossReferences");
      expect(tool).not.toHaveProperty("errorCodes");
      expect(tool).not.toHaveProperty("parameters");
    }
    expect(compactJson).not.toMatch(/\b(?:issue|pull request|PR)\s*#?\d+|#\d+/i);
  });

  it("advertises compact and full views and returns compact data through the MCP handler", async () => {
    expect(validateInput({ view: "compact" }, SCHEMA_TOOL_INPUT_SCHEMA)).toBeUndefined();
    expect(validateInput({ view: "full" }, SCHEMA_TOOL_INPUT_SCHEMA)).toBeUndefined();
    expect(validateInput({ view: "summary" }, SCHEMA_TOOL_INPUT_SCHEMA)).toMatch(/view/i);

    const viewSchema = SCHEMA_TOOL_INPUT_SCHEMA.properties.view as
      | { enum?: readonly string[]; default?: string }
      | undefined;
    expect(viewSchema?.enum).toEqual(["compact", "full"]);
    expect(viewSchema?.default).toBe("full");

    const schemaTool = ADVERTISED_TOOLS.find((tool) => tool.name === "schema");
    expect(schemaTool).toBeDefined();
    const result = await schemaTool?.handler({ view: "compact", toolName: "export_modules" });
    if (result === undefined) throw new Error("schema handler returned undefined");

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as CompactCatalog;
    expect(payload.tools).toHaveLength(1);
    expect(Object.keys(payload.tools[0] ?? {}).sort()).toEqual(COMPACT_TOOL_KEYS);
  });
});
