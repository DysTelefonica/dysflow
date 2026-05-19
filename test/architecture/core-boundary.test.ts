import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const coreRoot = join(process.cwd(), "src", "core");
const forbiddenImportPatterns = [
  /(?:from|import(?:\s+type)?|import\s*\()\s*["'][^"']*adapters\/(?:mcp|http)[^"']*["']/,
  /require\(\s*["'][^"']*adapters\/(?:mcp|http)[^"']*["']\s*\)/,
  /(?:from|import(?:\s+type)?|import\s*\()\s*["']@modelcontextprotocol\//,
  /require\(\s*["']@modelcontextprotocol\//,
  /(?:from|import(?:\s+type)?|import\s*\()\s*["'](?:express|fastify|hono)["']\s*\)?/,
  /require\(\s*["'](?:express|fastify|hono)["']\s*\)/,
  /(?:from|import(?:\s+type)?|import\s*\()\s*["'](?:node:)?http(?:s)?["']\s*\)?/,
  /require\(\s*["'](?:node:)?http(?:s)?["']\s*\)/,
];

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = join(directory, entry);
    if (statSync(absolutePath).isDirectory()) {
      return collectTypeScriptFiles(absolutePath);
    }

    return absolutePath.endsWith(".ts") ? [absolutePath] : [];
  });
}

describe("core dependency direction", () => {
  it("keeps src/core free of MCP and HTTP adapter imports", () => {
    const coreFiles = collectTypeScriptFiles(coreRoot);
    expect(coreFiles.length).toBeGreaterThan(0);

    const violations = coreFiles.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return forbiddenImportPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${file} matches ${pattern}`);
    });

    expect(violations).toEqual([]);
  });
});

describe("http adapter dependency direction", () => {
  const httpAdapterRoot = join(process.cwd(), "src", "adapters", "http");
  // Matches both absolute paths (adapters/mcp) and relative paths (../mcp/) from within http adapter
  const httpForbiddenPatterns = [
    /(?:from|import(?:\s+type)?|import\s*\()\s*["'][^"']*adapters\/mcp[^"']*["']/,
    /(?:from|import(?:\s+type)?|import\s*\()\s*["'][^"']*\.\.\/mcp\/[^"']*["']/,
  ];

  it("src/adapters/http does not import from src/adapters/mcp", () => {
    const httpFiles = collectTypeScriptFiles(httpAdapterRoot);
    expect(httpFiles.length).toBeGreaterThan(0);

    const violations = httpFiles.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return httpForbiddenPatterns.some((pattern) => pattern.test(source))
        ? [`${file}: imports from adapters/mcp`]
        : [];
    });

    expect(violations).toEqual([]);
  });
});
