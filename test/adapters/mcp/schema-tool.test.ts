import { describe, expect, it } from "vitest";
import { EXPECTED_ADVERTISED_TOOL_COUNT } from "../../../E2E_testing/_helpers/advertised-tool-count.mjs";
import {
  buildToolSchemaCatalog,
  type SchemaInput,
  type ToolSchema,
} from "../../../src/adapters/mcp/schema-tool.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

/**
 * Issue #971 — `dysflow.schema(projectId?, toolName?)` runtime contract
 * discovery. The tool returns the documented schema for every tool in the
 * consumer's dysflow installation:
 *
 *   {
 *     name,
 *     description,
 *     parameters,          // typed + required + description + enumValues + default
 *     returns,             // JSON Schema fragment
 *     errorCodes,          // [{code, description, recoverable}]
 *     crossReferences,     // issue numbers
 *     requiredCapabilities,
 *     safeByDefault,       // boolean
 *   }
 *
 * The acceptance criteria:
 *  1. dysflow.schema() returns schema for ALL advertised tools.
 *  2. dysflow.schema({toolName}) returns schema for that tool only.
 *  3. Schema includes errorCodes, crossReferences, requiredCapabilities,
 *     safeByDefault for each tool.
 *  4. Tests verify schema completeness by checking each tool has at
 *     least one errorCode where applicable.
 *
 * The tool is read-only — never opens Access, never spawns PowerShell,
 * never mutates state. Tests assert on observable behavior (catalog
 * contents), not on internal call order, so the suite stays
 * refactor-safe per the project testing philosophy.
 */

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

function makeServices() {
  return {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  };
}

function findTool(schemas: readonly ToolSchema[], name: string): ToolSchema {
  const tool = schemas.find((t) => t.name === name);
  if (tool === undefined) {
    throw new Error(`Tool '${name}' missing from schema catalog`);
  }
  return tool;
}

describe("buildToolSchemaCatalog — pure aggregate (#971)", () => {
  it("returns schema for every advertised tool (>= 84)", () => {
    const catalog = buildToolSchemaCatalog({});
    expect(catalog.tools.length).toBeGreaterThanOrEqual(EXPECTED_ADVERTISED_TOOL_COUNT - 1);
    const names = catalog.tools.map((t) => t.name);
    expect(names).toContain("export_modules");
    expect(names).toContain("import_modules");
    expect(names).toContain("resolve_project");
    expect(names).toContain("get_capabilities");
    expect(names).toContain("schema");
  });

  it("filters to a single tool when toolName is provided", () => {
    const catalog = buildToolSchemaCatalog({ toolName: "export_modules" });
    expect(catalog.tools).toHaveLength(1);
    expect(catalog.tools[0]?.name).toBe("export_modules");
  });

  it("returns an empty array when toolName does not match anything", () => {
    const catalog = buildToolSchemaCatalog({ toolName: "no-such-tool-xyz" });
    expect(catalog.tools).toHaveLength(0);
  });

  it("every schema entry has parameters, returns, errorCodes, crossReferences, requiredCapabilities, safeByDefault", () => {
    const catalog = buildToolSchemaCatalog({});
    for (const tool of catalog.tools) {
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("parameters");
      expect(tool).toHaveProperty("returns");
      expect(tool).toHaveProperty("errorCodes");
      expect(tool).toHaveProperty("crossReferences");
      expect(tool).toHaveProperty("requiredCapabilities");
      expect(tool).toHaveProperty("safeByDefault");
      expect(typeof tool.safeByDefault).toBe("boolean");
      expect(Array.isArray(tool.errorCodes)).toBe(true);
      expect(Array.isArray(tool.crossReferences)).toBe(true);
      expect(Array.isArray(tool.requiredCapabilities)).toBe(true);
      expect(typeof tool.parameters).toBe("object");
      expect(typeof tool.returns).toBe("object");
    }
  });

  it("write-tools expose the #962 error-code taxonomy", () => {
    const catalog = buildToolSchemaCatalog({ toolName: "export_modules" });
    const exportModules = findTool(catalog.tools, "export_modules");
    const codes = exportModules.errorCodes.map((e) => e.code);
    expect(codes).toContain("DESTINATION_ROOT_NOT_FOUND");
    expect(codes).toContain("OUTSIDE_PROJECT_ROOT");
    expect(codes).toContain("WRITE_LOCKED_BY_RUNNING_OP");
    expect(codes).toContain("CAPABILITIES_DISALLOW_WRITE");
    expect(codes).toContain("PROJECT_ID_MISMATCH");
  });

  it("write-tools also expose MCP_WRITES_DISABLED and MCP_INPUT_INVALID", () => {
    const catalog = buildToolSchemaCatalog({ toolName: "import_modules" });
    const importModules = findTool(catalog.tools, "import_modules");
    const codes = importModules.errorCodes.map((e) => e.code);
    expect(codes).toContain("MCP_WRITES_DISABLED");
    expect(codes).toContain("MCP_INPUT_INVALID");
  });

  it("read-only tools (e.g. resolve_project) have safeByDefault:true and no write-gate codes", () => {
    const catalog = buildToolSchemaCatalog({ toolName: "resolve_project" });
    const resolveProject = findTool(catalog.tools, "resolve_project");
    expect(resolveProject.safeByDefault).toBe(true);
    const codes = resolveProject.errorCodes.map((e) => e.code);
    expect(codes).not.toContain("DESTINATION_ROOT_NOT_FOUND");
    expect(codes).not.toContain("WRITE_LOCKED_BY_RUNNING_OP");
  });

  it("write-tools have at least one crossReference", () => {
    const catalog = buildToolSchemaCatalog({ toolName: "export_modules" });
    const exportModules = findTool(catalog.tools, "export_modules");
    expect(exportModules.crossReferences.length).toBeGreaterThan(0);
  });

  it("write-tools list 'allowWrites' as a required capability", () => {
    const catalog = buildToolSchemaCatalog({ toolName: "export_modules" });
    const exportModules = findTool(catalog.tools, "export_modules");
    expect(exportModules.requiredCapabilities).toContain("allowWrites");
  });

  it("read-only tools do not require allowWrites capability", () => {
    const catalog = buildToolSchemaCatalog({ toolName: "resolve_project" });
    const resolveProject = findTool(catalog.tools, "resolve_project");
    expect(resolveProject.requiredCapabilities).not.toContain("allowWrites");
  });

  it("schema tool itself is read-only and self-reports as safeByDefault:true", () => {
    const catalog = buildToolSchemaCatalog({ toolName: "schema" });
    const schemaEntry = findTool(catalog.tools, "schema");
    expect(schemaEntry.safeByDefault).toBe(true);
    expect(schemaEntry.requiredCapabilities).not.toContain("allowWrites");
  });

  it("parameters expose type, required, description fields where defined", () => {
    const catalog = buildToolSchemaCatalog({ toolName: "export_modules" });
    const exportModules = findTool(catalog.tools, "export_modules");
    // `apply` is a documented boolean flag on export_modules.
    const apply = exportModules.parameters.apply;
    expect(apply).toBeDefined();
    expect(apply?.type).toBe("boolean");
    expect(apply?.required).toBe(false);
    expect(typeof apply?.description).toBe("string");
  });

  it("schema is duplicate-free by tool name", () => {
    const catalog = buildToolSchemaCatalog({});
    const names = catalog.tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("createDysflowMcpTools — schema tool wiring (#971)", () => {
  it("exposes 'schema' as a registered MCP tool", () => {
    const tools = createDysflowMcpTools({ services: makeServices() });
    const names = tools.map((t) => t.name);
    expect(names).toContain("schema");
  });

  it("schema tool handler returns the full catalog when no toolName is supplied", async () => {
    const tools = createDysflowMcpTools({ services: makeServices() });
    const schemaTool = tools.find((t) => t.name === "schema");
    expect(schemaTool).toBeDefined();
    const result = await schemaTool?.handler({}, undefined as never);
    if (result === undefined) throw new Error("schema handler returned undefined");
    expect(result.isError).toBe(false);
    expect(result.ok).toBe(true);
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
      tools: Array<{ name: string }>;
    };
    expect(payload.tools.length).toBeGreaterThanOrEqual(EXPECTED_ADVERTISED_TOOL_COUNT - 1);
    const names = payload.tools.map((t) => t.name);
    expect(names).toContain("export_modules");
    expect(names).toContain("schema");
  });

  it("schema tool handler returns a single tool when toolName is supplied", async () => {
    const tools = createDysflowMcpTools({ services: makeServices() });
    const schemaTool = tools.find((t) => t.name === "schema");
    expect(schemaTool).toBeDefined();
    const result = await schemaTool?.handler({ toolName: "export_modules" }, undefined as never);
    if (result === undefined) throw new Error("schema handler returned undefined");
    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
      tools: Array<{ name: string }>;
    };
    expect(payload.tools).toHaveLength(1);
    expect(payload.tools[0]?.name).toBe("export_modules");
  });

  it("schema tool is read-only — does not require writes enabled", async () => {
    // createDysflowMcpTools with default `writes:false` should still expose
    // schema (and schema's handler should run without touching writes).
    const tools = createDysflowMcpTools({ services: makeServices() });
    const schemaTool = tools.find((t) => t.name === "schema");
    expect(schemaTool).toBeDefined();
    const result = await schemaTool?.handler({ toolName: "schema" }, undefined as never);
    if (result === undefined) throw new Error("schema handler returned undefined");
    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
      tools: Array<{ name: string; safeByDefault: boolean }>;
    };
    expect(payload.tools[0]?.safeByDefault).toBe(true);
  });

  it("schema input shape is object with projectId and toolName optional strings", () => {
    const tools = createDysflowMcpTools({ services: makeServices() });
    const schemaTool = tools.find((t) => t.name === "schema");
    expect(schemaTool).toBeDefined();
    const properties = schemaTool?.inputSchema?.properties ?? {};
    expect(properties).toHaveProperty("projectId");
    expect(properties).toHaveProperty("toolName");
  });
});

describe("SchemaInput — type contract smoke test (#971)", () => {
  it("accepts empty input as the canonical 'all tools' selector", () => {
    const input: SchemaInput = {};
    const catalog = buildToolSchemaCatalog(input);
    expect(catalog.tools.length).toBeGreaterThan(0);
  });
});
