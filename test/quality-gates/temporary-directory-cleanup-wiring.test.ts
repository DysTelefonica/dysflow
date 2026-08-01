import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("temporary cleanup retry wiring (#1233)", () => {
  it.each([
    "src/adapters/vba-sync/vba-modules-adapter.ts",
  ])("uses the shared bounded cleanup helper at %s", async (path) => {
    const source = await readFile(path, "utf8");

    expect(source).toContain("removeTemporaryDirectoryWithRetry");
    expect(source).not.toMatch(
      /rm\([^)]*(?:stagingDirectory|tempRoot)[^)]*,\s*\{\s*recursive:\s*true/,
    );
  });

  it("does not create a disposable export directory for find_references", async () => {
    const path = "src/adapters/mcp/modern-analysis-tools.ts";
    const source = await readFile(path, "utf8");

    expect(source).not.toContain("dysflow-vba-findrefs-");
    expect(source).not.toContain('execute("export_all"');
    expect(source).toContain('"list_vba_modules"');
  });
});
