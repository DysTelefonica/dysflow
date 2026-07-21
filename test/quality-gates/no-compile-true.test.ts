import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

async function collectTypeScriptFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(path);
    }
  };
  await visit(root);
  return files;
}

describe("HR-1 compile guard", () => {
  it("contains no compile:true object value in vba-sync TypeScript adapters", async () => {
    const root = join(process.cwd(), "src", "adapters", "vba-sync");
    const files = await collectTypeScriptFiles(root);
    const violations: string[] = [];
    const compileObjectValue = /(?:[,{]\s*)["']?compile["']?\s*:\s*true\b/g;

    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (compileObjectValue.test(source)) violations.push(file);
      compileObjectValue.lastIndex = 0;
    }

    expect(violations).toEqual([]);
  });
});
