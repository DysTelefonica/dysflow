import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { MCP_TOOL_ROUTES } from "../../../src/adapters/mcp/dispatch-routes.js";
import { DYSFLOW_MCP_TOOL_NAMES } from "../../../src/adapters/mcp/mcp-tool-registry.js";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/vba-sync-schemas.js";
import { TOOL_PARITY_REGISTRY } from "../../../src/adapters/mcp/tool-parity-registry.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { VbaExecutionAdapter } from "../../../src/adapters/vba-sync/vba-execution-adapter.js";
import { successResult } from "../../../src/core/contracts/index.js";
import { COMMIT_FLAG_REGISTRY } from "../../../src/core/runtime/commit-flag-registry.js";

const REMOVED_TOOL = "vba_inline_execution";

describe("#1534 — vba_inline_execution is removed end-to-end in v4", () => {
  it("is absent from every public MCP contract and tools/list", () => {
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute: async () => successResult({}) },
        queryService: { execute: async () => successResult({}) },
        diagnosticsService: { run: async () => successResult({ checks: [] }) },
      },
      toolSurface: "full",
    });

    expect(DYSFLOW_MCP_TOOL_NAMES).not.toContain(REMOVED_TOOL);
    expect(tools.map((tool) => tool.name)).not.toContain(REMOVED_TOOL);
    expect((MCP_TOOL_ROUTES as Record<string, unknown>)[REMOVED_TOOL]).toBeUndefined();
    expect((VBA_SYNC_TOOL_SCHEMAS as Record<string, unknown>)[REMOVED_TOOL]).toBeUndefined();
    expect(TOOL_PARITY_REGISTRY.map((tool) => tool.name)).not.toContain(REMOVED_TOOL);
    expect((COMMIT_FLAG_REGISTRY as Record<string, unknown>)[REMOVED_TOOL]).toBeUndefined();
  });

  it("is not accepted by the VBA execution adapter", () => {
    expect(VbaExecutionAdapter.handles(REMOVED_TOOL)).toBe(false);
  });

  it("leaves no retired identifier in bounded current runtime and reference surfaces", async () => {
    const currentSurfaces = [
      "src/shared/validation/schema-props.ts",
      "src/adapters/mcp/dispatch-common.ts",
      "src/adapters/mcp/dispatch-factory.ts",
      "src/adapters/mcp/schema-tool.ts",
      "src/adapters/vba-sync/vba-execution-adapter.ts",
      "src/adapters/vba-sync/vba-sync-adapter.ts",
      "E2E_testing/mcp-e2e.mjs",
      "README.md",
      "docs/api/mcp-tools.md",
      "references/error-codes.md",
    ] as const;

    for (const path of currentSurfaces) {
      expect(await readFile(path, "utf8"), path).not.toContain(REMOVED_TOOL);
    }
  });
});
