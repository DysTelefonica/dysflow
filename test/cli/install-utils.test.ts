import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { describe, expect, it } from "vitest";

// Import the helpers to test (these will fail to import or run initially)
import {
  ensureObject,
  fileExists,
  readJson,
  runCommand,
  runCommandOutput,
  writeJson,
} from "../../src/cli/commands/install-utils.js";

describe("install-utils helpers", () => {
  it("fileExists returns true for existing file and false for missing", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "dysflow-utils-test-"));
    try {
      const existingFile = join(tempDir, "exists.txt");
      fs.writeFileSync(existingFile, "hello");
      const missingFile = join(tempDir, "missing.txt");

      expect(await fileExists(existingFile)).toBe(true);
      expect(await fileExists(missingFile)).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("ensureObject coerces non-objects to empty object", () => {
    expect(ensureObject({ a: 1 })).toEqual({ a: 1 });
    expect(ensureObject(null)).toEqual({});
    expect(ensureObject(undefined)).toEqual({});
    expect(ensureObject([])).toEqual({});
    expect(ensureObject("string")).toEqual({});
    expect(ensureObject(123)).toEqual({});
  });

  it("readJson and writeJson round-trip successfully", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "dysflow-utils-test-"));
    try {
      const jsonFile = join(tempDir, "data.json");
      const testData = { name: "Dysflow", nested: { value: 42 } };

      await writeJson(jsonFile, testData);
      expect(fs.existsSync(jsonFile)).toBe(true);

      const readData = await readJson(jsonFile);
      expect(readData).toEqual(testData);

      // readJson on missing file returns empty object
      const missingData = await readJson(join(tempDir, "missing.json"));
      expect(missingData).toEqual({});
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("runCommand executes a real process and runCommandOutput returns stdout", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "dysflow-utils-test-"));
    try {
      // runCommand (we can use 'node' to execute a simple script)
      const testFile = join(tempDir, "out.txt");
      const nodeScript = `require("node:fs").writeFileSync(${JSON.stringify(testFile)}, "runCommand-success");`;

      await runCommand("node", ["-e", nodeScript], tempDir);
      expect(fs.readFileSync(testFile, "utf8")).toBe("runCommand-success");

      // runCommandOutput
      const output = await runCommandOutput(
        "node",
        ["-e", 'console.log("hello-stdout");'],
        tempDir,
      );
      expect(output).toBe("hello-stdout");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("uninstall.ts static import isolation", () => {
  it("asserts that importing from uninstall.ts does NOT transitively or directly import install.ts", () => {
    const uninstallPath = path.resolve("src/cli/commands/uninstall.ts");
    const installPath = path.resolve("src/cli/commands/install.ts");

    const visited = new Set<string>();
    const queue: string[] = [uninstallPath];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      if (visited.has(current)) continue;
      visited.add(current);

      // Read file and parse relative imports
      const dir = path.dirname(current);
      const content = fs.readFileSync(current, "utf8");

      const regex = /(?:import|export)\s+.*?\s+from\s+['"](.*?)['"]/g;
      const imports: string[] = [];
      let match = regex.exec(content);
      while (match !== null) {
        imports.push(match[1]);
        match = regex.exec(content);
      }
      const simpleImportRegex = /import\s+['"](.*?)['"]/g;
      let simpleMatch = simpleImportRegex.exec(content);
      while (simpleMatch !== null) {
        imports.push(simpleMatch[1]);
        simpleMatch = simpleImportRegex.exec(content);
      }

      if (current === uninstallPath) {
        expect(imports.length).toBeGreaterThan(0);
      }

      for (const imp of imports) {
        if (imp.startsWith(".")) {
          // Resolve relative import to full path (supporting both .ts and .js)
          let resolved = path.resolve(dir, imp);
          // Strip extension and try to locate the source file (.ts)
          if (resolved.endsWith(".js")) {
            resolved = `${resolved.slice(0, -3)}.ts`;
          } else if (!resolved.endsWith(".ts")) {
            resolved = `${resolved}.ts`;
          }

          // Check if this resolved path is the forbidden install.ts
          expect(resolved).not.toBe(installPath);

          if (fs.existsSync(resolved)) {
            queue.push(resolved);
          }
        }
      }
    }
  });
});
