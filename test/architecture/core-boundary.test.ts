import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools";
import { successResult } from "../../src/core/contracts/index";

const coreRoot = join(process.cwd(), "src", "core");

function collectTypeScriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

describe("MCP/core architecture boundary", () => {
  it("keeps src/core independent from adapter implementations", () => {
    const coreFiles = collectTypeScriptFiles(coreRoot);

    const violations = coreFiles.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      const importsAdapter =
        /^\s*import\s+.*(?:\.\.\/)+adapters\//m.test(source) ||
        /^\s*export\s+.*(?:\.\.\/)+adapters\//m.test(source) ||
        /from\s+["'](?:\.\.\/)+adapters\//.test(source);

      return importsAdapter ? [relative(process.cwd(), file)] : [];
    });

    expect(violations).toEqual([]);
  });

  it("drives core behavior through injected service interfaces", async () => {
    const requests: unknown[] = [];
    const tools = createDysflowMcpTools({
      vbaService: {
        execute: async (request) => {
          requests.push({ service: "vba", request });
          return successResult({ returnValue: "ok" });
        },
      },
      queryService: {
        execute: async (request) => {
          requests.push({ service: "query", request });
          return successResult({ rows: [{ id: 1 }] });
        },
      },
      diagnosticsService: {
        run: async (request) => {
          requests.push({ service: "diagnostics", request });
          return successResult({ checks: [] });
        },
      },
    });

    await expect(
      tools
        .find((tool) => tool.name === "dysflow_vba_execute")
        ?.handler({ procedureName: "Smoke" }),
    ).resolves.toMatchObject({ isError: false });
    await expect(
      tools
        .find((tool) => tool.name === "dysflow_query_execute")
        ?.handler({ sql: "SELECT 1", mode: "read" }),
    ).resolves.toMatchObject({ isError: false });
    await expect(
      tools.find((tool) => tool.name === "dysflow_doctor")?.handler({ includeEnvironment: true }),
    ).resolves.toMatchObject({ isError: false });

    expect(requests).toEqual([
      { service: "vba", request: { procedureName: "Smoke" } },
      { service: "query", request: { sql: "SELECT 1", mode: "read" } },
      { service: "diagnostics", request: { includeEnvironment: true } },
    ]);
  });

});
