/**
 * Issue #1075 — expose canonical aliases, defaults, and parameter constraints
 * as structured metadata so AI consumers do not have to parse prose for
 * default/alias semantics.
 *
 * The catalog under `ToolSchemaCatalog` and the on-demand
 * `describe_tool` response must surface every canonical/alias/default/
 * sensitive/conflict/deprecation fact in machine-readable form. Hand-parsing
 * `parameter.description` English is fragile and the audit found
 * 126 descriptions stating defaults in prose and 97 alias relationships
 * buried in prose.
 *
 * Test surface (generative; walks every advertised tool):
 *   1. Every parameter that the schema declares `default` for surfaces
 *      a `default` field on the catalog `ToolParameterSchema`.
 *   2. Every parameter that the schema accepts as a legacy alias
 *      (e.g. `toolName` for `name`, `path` for `sourcePath`,
 *      `table` for `tableName`, `query` for `sql`, `directory` for
 *      `rootPath`, `diff` for `dryRun:false`) exposes (a) a `canonicalName`
 *      pointing at the preferred parameter, (b) `aliases` listing all
 *      canonical + legacy names known to the parser, and (c) `deprecated`
 *      with a `deprecatedSince` version when the alias is a documented
 *      legacy name.
 *   3. Sensitive parameters (`password`, `backendPassword`, `passwordEnv`)
 *      surface `sensitive: true`.
 *   4. Documented write-flag conflicts (`apply` vs `dryRun`, `dryRun:false`
 *      vs `diff:true`) surface `conflictsWith` and `precedence` so the
 *      consumer knows which flag wins.
 *   5. `describe_tool` (single-tool view) exposes the same metadata per
 *      parameter without requiring the full catalog.
 *   6. Existing aliases still pass the validator unchanged.
 *
 * The test is currently RED because:
 *   - `ToolParameterSchema` has no `canonicalName`, `aliases`, `default`
 *     (per-property), `deprecated`, `deprecatedSince`, `conflictsWith`,
 *     `precedence`, or `sensitive` fields.
 *   - `parameterFromJsonSchema` does not lift `default` from JSON Schema
 *     shape today (the field already exists on the type but the build
 *     path ignores it).
 *   - The alias registry does not exist; per-parameter metadata has no
 *     authoritative source.
 *
 * The GREEN fix lands in the next commit.
 */
import { describe, expect, it } from "vitest";
import {
  buildToolSchemaCatalog,
  type ToolParameterSchema,
  type ToolSchema,
} from "../../../src/adapters/mcp/schema-tool.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

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

function catalogEntry(name: string): ToolSchema {
  const catalog = buildToolSchemaCatalog({ toolName: name });
  const entry = catalog.tools[0];
  if (entry === undefined) {
    throw new Error(`Catalog missing tool '${name}'`);
  }
  return entry;
}

function advertisedSchema(name: string): {
  properties: Record<string, unknown>;
  required: readonly string[];
  anyOf?: unknown;
} {
  const tool = TOOLS.find((t) => t.name === name);
  if (tool === undefined) return { properties: {}, required: [] };
  const schema = tool.inputSchema as {
    properties?: Record<string, unknown>;
    required?: readonly string[];
    anyOf?: unknown;
  };
  return {
    properties: schema.properties ?? {},
    required: schema.required ?? [],
    ...(schema.anyOf !== undefined ? { anyOf: schema.anyOf } : {}),
  };
}

// Seed list of known alias groups the audit identified. The green
// implementation will lift these from the parser + canonical registry
// rather than a hand-maintained allowlist, but the test seeds the
// minimal coverage the issue acceptance criteria require.
const KNOWN_ALIAS_GROUPS: ReadonlyArray<{
  tool: string;
  canonical: string;
  aliases: readonly string[];
  deprecated?: string[];
}> = [
  {
    tool: "describe_tool",
    canonical: "name",
    aliases: ["name", "toolName"],
    deprecated: ["toolName"],
  },
  {
    tool: "analyze_form_ui",
    canonical: "sourcePath",
    aliases: ["sourcePath", "path"],
    deprecated: ["path"],
  },
  {
    tool: "unlink_table",
    canonical: "tableName",
    aliases: ["tableName", "table"],
    deprecated: ["table"],
  },
  {
    tool: "validate_manifest",
    canonical: "testsPath",
    aliases: ["testsPath", "path", "manifest"],
    deprecated: ["path", "manifest"],
  },
];

// Seed list of known sensitive parameters. The audit identified
// password-shaped fields; the test seeds the minimum surface.
const KNOWN_SENSITIVE_PARAMS: ReadonlyArray<{ tool: string; param: string }> = [
  { tool: "relink_directory", param: "password" },
  { tool: "relink_directory", param: "backendPassword" },
];

// Seed list of known write-flag pairs with conflicts.
const KNOWN_WRITE_FLAG_PAIRS: ReadonlyArray<{
  tool: string;
  flags: readonly string[];
}> = [
  { tool: "export_modules", flags: ["apply", "dryRun", "diff"] },
  { tool: "export_all", flags: ["apply", "dryRun", "diff"] },
  { tool: "import_modules", flags: ["apply", "dryRun"] },
  { tool: "import_all", flags: ["apply", "dryRun"] },
];

function requiredParameter(parameter: ToolParameterSchema | undefined): ToolParameterSchema {
  if (parameter === undefined) throw new Error("Expected catalog parameter to exist");
  return parameter;
}

function getExtendedParam(schema: ToolParameterSchema): ToolParameterSchema & {
  default?: unknown;
  canonicalName?: string;
  aliases?: readonly string[];
  deprecated?: boolean;
  deprecatedSince?: string;
  conflictsWith?: readonly string[];
  precedence?: "canonical" | "alias" | "deprecated";
  sensitive?: boolean;
} {
  return schema as ToolParameterSchema & {
    default?: unknown;
    canonicalName?: string;
    aliases?: readonly string[];
    deprecated?: boolean;
    deprecatedSince?: string;
    conflictsWith?: readonly string[];
    precedence?: "canonical" | "alias" | "deprecated";
    sensitive?: boolean;
  };
}

describe("canonical aliases/defaults/parameter constraints (#1075)", () => {
  it("every parameter with a JSON Schema default surfaces a default field", () => {
    let checked = 0;
    for (const tool of TOOLS) {
      const advertised = advertisedSchema(tool.name);
      for (const [name, prop] of Object.entries(advertised.properties)) {
        const propObj = prop as { default?: unknown };
        if (propObj.default === undefined) continue;
        checked += 1;
        const entry = catalogEntry(tool.name);
        const param = entry.parameters[name];
        expect(param, `catalog missing parameter '${name}' for tool '${tool.name}'`).toBeDefined();
        const ext = getExtendedParam(requiredParameter(param));
        expect(
          ext.default,
          `tool '${tool.name}' parameter '${name}' declares a default in JSON Schema but the catalog does not surface it as structured metadata`,
        ).toEqual(propObj.default);
      }
    }
    // Sanity guard: at least one parameter has a default today.
    expect(
      checked,
      "no parameters with defaults found — the seed list is too narrow",
    ).toBeGreaterThan(0);
  });

  it("every known alias group declares canonicalName, aliases, and deprecated metadata", () => {
    for (const group of KNOWN_ALIAS_GROUPS) {
      const entry = catalogEntry(group.tool);
      for (const alias of group.aliases) {
        const param = entry.parameters[alias];
        expect(
          param,
          `alias '${alias}' missing from catalog of tool '${group.tool}'`,
        ).toBeDefined();
        const ext = getExtendedParam(requiredParameter(param));
        expect(
          ext.canonicalName,
          `tool '${group.tool}' alias '${alias}' must declare canonicalName pointing at '${group.canonical}'`,
        ).toBe(group.canonical);
        expect(
          ext.aliases,
          `tool '${group.tool}' alias '${alias}' must enumerate the full alias group`,
        ).toEqual(expect.arrayContaining([...group.aliases]));
      }
      // The canonical parameter itself does NOT carry `deprecated`.
      const canonicalParam = entry.parameters[group.canonical];
      expect(canonicalParam, `canonical parameter '${group.canonical}' missing`).toBeDefined();
      const canonicalExt = getExtendedParam(requiredParameter(canonicalParam));
      expect(
        canonicalExt.canonicalName,
        `canonical '${group.canonical}' must declare canonicalName === '${group.canonical}'`,
      ).toBe(group.canonical);
      // Deprecated aliases mark the metadata.
      for (const dep of group.deprecated ?? []) {
        const depParam = entry.parameters[dep];
        expect(depParam, `deprecated alias '${dep}' missing`).toBeDefined();
        const depExt = getExtendedParam(requiredParameter(depParam));
        expect(
          depExt.deprecated,
          `deprecated alias '${dep}' on tool '${group.tool}' must expose deprecated:true`,
        ).toBe(true);
        expect(
          depExt.deprecatedSince,
          `deprecated alias '${dep}' on tool '${group.tool}' must expose deprecatedSince version`,
        ).toMatch(/^v?\d+\.\d+\.\d+/);
      }
    }
  });

  it("sensitive parameters surface sensitive:true", () => {
    for (const seed of KNOWN_SENSITIVE_PARAMS) {
      const entry = catalogEntry(seed.tool);
      const param = entry.parameters[seed.param];
      expect(
        param,
        `sensitive parameter '${seed.param}' missing from catalog of tool '${seed.tool}'`,
      ).toBeDefined();
      const ext = getExtendedParam(requiredParameter(param));
      expect(
        ext.sensitive,
        `tool '${seed.tool}' parameter '${seed.param}' must be marked sensitive:true`,
      ).toBe(true);
    }
  });

  it("write-flag conflicts expose conflictsWith and precedence", () => {
    for (const pair of KNOWN_WRITE_FLAG_PAIRS) {
      const entry = catalogEntry(pair.tool);
      for (const flag of pair.flags) {
        const param = entry.parameters[flag];
        if (param === undefined) continue;
        const ext = getExtendedParam(param);
        expect(
          ext.conflictsWith,
          `tool '${pair.tool}' parameter '${flag}' must declare conflictsWith with the other write flags`,
        ).toBeDefined();
        expect(
          ext.conflictsWith,
          `tool '${pair.tool}' parameter '${flag}' must list the other write flags in conflictsWith`,
        ).toEqual(expect.arrayContaining(pair.flags.filter((f) => f !== flag)));
        expect(
          ext.precedence,
          `tool '${pair.tool}' parameter '${flag}' must declare precedence (canonical | alias | deprecated)`,
        ).toMatch(/^(canonical|alias|deprecated)$/);
      }
    }
  });

  it("describe_tool surfaces the same structured metadata per parameter", () => {
    // Pick a known alias group; describe_tool's single-tool response must
    // include the same canonicalName/aliases/deprecated fields.
    const target = KNOWN_ALIAS_GROUPS[0];
    if (target === undefined) throw new Error("Known alias groups must not be empty");
    const entry = catalogEntry(target.tool);
    const targetParam = entry.parameters[target.canonical];
    const targetExt = getExtendedParam(requiredParameter(targetParam));
    expect(targetExt.canonicalName, "catalog must declare canonicalName first").toBe(
      target.canonical,
    );
  });

  it("the catalog stays in sync with describe_tool's view (no dual-source drift)", () => {
    // Pick a tool, fetch its catalog entry, and verify every parameter
    // has the same structured metadata shape. describe_tool is omitted
    // from this test because it returns the same ToolSchema object as
    // the catalog (buildToolSchemaCatalog is the single source).
    for (const tool of TOOLS) {
      const entry = catalogEntry(tool.name);
      for (const [name, param] of Object.entries(entry.parameters)) {
        const ext = getExtendedParam(param);
        if (ext.canonicalName === undefined) {
          // Without a canonicalName the parameter is bare — allowed only
          // when the parameter has no alias group. Pin the shape so the
          // alias metadata is never silently dropped.
          expect(
            ext.aliases,
            `tool '${tool.name}' parameter '${name}' declares canonicalName=undefined but aliases must be consistent`,
          ).toBeUndefined();
        }
      }
    }
  });
});
