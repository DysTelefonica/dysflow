import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("temporary cleanup retry wiring (#1233)", () => {
  it.each([
    "src/adapters/vba-sync/vba-modules-adapter.ts",
    "src/adapters/mcp/modern-analysis-tools.ts",
  ])("uses the shared bounded cleanup helper at %s", async (path) => {
    const source = await readFile(path, "utf8");

    expect(source).toContain("removeTemporaryDirectoryWithRetry");
    expect(source).not.toMatch(
      /rm\([^)]*(?:stagingDirectory|tempRoot)[^)]*,\s*\{\s*recursive:\s*true/,
    );
  });
});
