import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const httpAdapterRoot = join(process.cwd(), "src", "adapters", "http");
const architectureDocPath = join(
  process.cwd(),
  "docs",
  "architecture",
  "dysflow-core-and-adapters.md",
);

function collectTypeScriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

describe("adapter architecture boundary", () => {
  it("keeps the HTTP adapter independent from MCP adapter modules", () => {
    const httpFiles = collectTypeScriptFiles(httpAdapterRoot);

    const violations = httpFiles.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      const importsMcpAdapter = /from\s+["'](?:\.\.\/)+mcp(?:\/|["'])/.test(source);

      return importsMcpAdapter ? [relative(process.cwd(), file)] : [];
    });

    expect(violations).toEqual([]);
  });

  it("documents the adapter-to-adapter import convention", () => {
    const architectureDoc = readFileSync(architectureDocPath, "utf8");

    expect(architectureDoc).toContain("Adapters MUST NOT import from sibling adapters");
    expect(architectureDoc).toContain("Use `src/shared/**` for protocol-neutral shared kernels");
  });
});
