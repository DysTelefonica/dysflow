import { describe, expect, it } from "vitest";
import { buildToolSchemaCatalog } from "../../../src/adapters/mcp/schema-tool.js";
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
});
