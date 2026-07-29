import { describe, expect, it } from "vitest";
import { buildToolSchemaCatalog, type ToolSchema } from "../../../src/adapters/mcp/schema-tool.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

type InputError = {
  code?: string;
  rejectedFlag?: string;
  rejectedFlags?: readonly string[];
  toolCommitFlag?: string;
  remediation?: string;
};

type ErrorEnvelopeShape = Record<string, { type: string; optional?: true; items?: { type: string } }>;

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

const tools = createDysflowMcpTools({
  services: {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  },
  writes: true,
});

const full = buildToolSchemaCatalog({ view: "full" });
const compact = buildToolSchemaCatalog({ view: "compact" });

function toolByName(catalog: { tools: readonly ToolSchema[] }, name: string): ToolSchema {
  const tool = catalog.tools.find((entry) => entry.name === name);
  if (tool === undefined) throw new Error(`Missing tool ${name}`);
  return tool;
}

function isSecretParameter(name: string): boolean {
  return /password|secret|credential|apiKey|authToken/i.test(name);
}

describe("MCP metadata normalization for issue #1230", () => {
  it("exposes the complete contradiction envelope and returns it for export_modules", async () => {
    const writeTools = full.tools.filter((tool) => tool.access !== "read-only");
    for (const tool of writeTools) {
      const contract = tool.resultContract;
      const shape = contract.errorEnvelope.shape as ErrorEnvelopeShape;
      expect(shape.rejectedFlag, `${tool.name}.rejectedFlag`).toEqual({
        type: "string",
        optional: true,
      });
      expect(shape.rejectedFlags, `${tool.name}.rejectedFlags`).toEqual({
        type: "array",
        optional: true,
        items: { type: "string" },
      });
      expect(shape.toolCommitFlag, `${tool.name}.toolCommitFlag`).toEqual({
        type: "string",
        optional: true,
      });
      expect(shape.remediation, `${tool.name}.remediation`).toEqual({
        type: "string",
        optional: true,
      });
    }

    const exportModules = tools.find((tool) => tool.name === "export_modules");
    if (exportModules === undefined) throw new Error("export_modules is not registered");
    const result = await exportModules.handler({ apply: true, dryRun: true });
    const error = result.error as InputError | undefined;
    expect(result.isError).toBe(true);
    expect(error?.code).toBe("MCP_INPUT_INVALID");
    expect([error?.rejectedFlag, ...(error?.rejectedFlags ?? [])]).toEqual(
      expect.arrayContaining(["apply", "dryRun"]),
    );
    expect(error?.toolCommitFlag).toBe("apply");
    expect(error?.remediation).toMatch(/apply|dryRun/i);
  });

  it("uses only canonical or deprecated precedence values", () => {
    for (const tool of full.tools) {
      for (const [name, parameter] of Object.entries(tool.parameters)) {
        if (parameter.precedence === undefined) continue;
        expect(parameter.precedence, `${tool.name}.${name}`).toMatch(/^(canonical|deprecated)$/);
      }
    }
  });

  it("aligns compact required parameter groups with full anyOf required groups", () => {
    const fullByName = new Map(full.tools.map((tool) => [tool.name, tool]));
    for (const compactTool of compact.tools) {
      const fullTool = fullByName.get(compactTool.name);
      if (fullTool === undefined) throw new Error(`Missing full tool ${compactTool.name}`);
      const expected: string[][] = (fullTool.inputSchema.anyOf ?? []).map((alternative) =>
        [...(alternative.required ?? [])].sort(),
      );
      const actual: string[][] = compactTool.requiredParameterGroups.flatMap((group) =>
        group.alternatives.map((alt) => [...alt.parameters].sort()),
      );
      expect(actual, compactTool.name).toEqual(expected);
    }
  });

  it("emits concrete defaults or no default instead of runtime-defined", () => {
    for (const tool of full.tools) {
      for (const [name, parameter] of Object.entries(tool.parameters)) {
        expect(parameter.default, `${tool.name}.${name}`).not.toBe("runtime-defined");
      }
    }
    const timeout = full.tools
      .flatMap((tool) => Object.values(tool.parameters))
      .find((parameter) => /timeoutMs/.test(parameter.description));
    expect(timeout?.default).toBeUndefined();
  });

  it("keeps canonicalName references live and sensitive metadata credential-specific", () => {
    for (const tool of full.tools) {
      const parameterNames = new Set(Object.keys(tool.parameters));
      for (const [name, parameter] of Object.entries(tool.parameters)) {
        if (parameter.canonicalName !== undefined) {
          expect(parameterNames.has(parameter.canonicalName), `${tool.name}.${name}`).toBe(true);
          expect(parameter.enumValues ?? [], `${tool.name}.${name}`).not.toContain(
            parameter.canonicalName,
          );
        }
        // Issue #1230: `token` is part of the legacy sensitive heuristic but
        // `tokenMap` is a structural key/value map (not a credential). The
        // fix in schema-tool resets `sensitive` for non-credential tokens;
        // accept the explicit unset (undefined) as the success signal.
        const expected = isSecretParameter(name);
        if (expected) {
          expect(parameter.sensitive === true, `${tool.name}.${name}`).toBe(true);
        } else {
          expect(parameter.sensitive === true, `${tool.name}.${name}`).toBe(false);
        }
      }
    }
  });
});
