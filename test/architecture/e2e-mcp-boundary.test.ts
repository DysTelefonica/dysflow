import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const e2eRoot = join(repoRoot, "E2E_testing");

function collectFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = join(directory, entry);
    if (statSync(absolutePath).isDirectory()) return collectFiles(absolutePath);
    return [absolutePath];
  });
}

describe("E2E MCP boundary", () => {
  it("does not hide E2E_testing source trees behind a blanket gitignore", () => {
    const gitignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");

    expect(gitignore.split(/\r?\n/)).not.toContain("E2E_testing/");
  });

  it("does not maintain a shadow MCP adapter under E2E_testing", () => {
    const shadowFiles = collectFiles(join(e2eRoot, "src", "adapters", "mcp"));

    expect(shadowFiles).toEqual([]);
  });

  it("keeps any E2E helper source pointed at production MCP modules", () => {
    const helperFiles = collectFiles(e2eRoot).filter((file) => file.endsWith(".ts"));
    const violations = helperFiles.filter((file) => {
      const source = readFileSync(file, "utf8");
      return /version:\s*["']0\.1\.0["']/.test(source)
        || /additionalProperties:\s*true/.test(source)
        || /startMcpStdioAdapter\(\s*\)/.test(source);
    });

    expect(violations).toEqual([]);
  });
});
