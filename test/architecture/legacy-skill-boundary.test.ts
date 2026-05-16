import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const sourceRoot = join(process.cwd(), "src");

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = join(directory, entry);
    if (statSync(absolutePath).isDirectory()) {
      return collectTypeScriptFiles(absolutePath);
    }
    return absolutePath.endsWith(".ts") ? [absolutePath] : [];
  });
}

describe("legacy MCP migration boundary", () => {
  it("does not depend on old workflow skill folders at runtime", () => {
    const violations = collectTypeScriptFiles(sourceRoot).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [
        /C:\\Proyectos\\workflow\\skills/i,
        /workflow[\\/]skills[\\/](access-vba-sync|access-query|dysflow)/i,
        /skill-access-vba-sync|skill-access-query/i,
      ].filter((pattern) => pattern.test(source)).map((pattern) => `${file} matches ${pattern}`);
    });

    expect(violations).toEqual([]);
  });
});
