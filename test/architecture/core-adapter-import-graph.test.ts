import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = join(process.cwd(), "scripts", "check-core-adapter-boundary.mjs");
const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function project(coreSource: string): { root: string; coreFile: string; adapterFile: string } {
  const root = mkdtempSync(join(tmpdir(), "dysflow-core-boundary-"));
  fixtures.push(root);
  const coreDir = join(root, "src", "core");
  const adapterDir = join(root, "src", "adapters");
  mkdirSync(coreDir, { recursive: true });
  mkdirSync(adapterDir, { recursive: true });
  const coreFile = join(coreDir, "subject.ts");
  const adapterFile = join(adapterDir, "forbidden.ts");
  writeFileSync(coreFile, coreSource);
  writeFileSync(adapterFile, "export const forbidden = true; export type Forbidden = boolean;\n");
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        baseUrl: ".",
        paths: { "@infra/*": ["src/adapters/*"] },
      },
      include: ["src/**/*.ts"],
    }),
  );
  return { root, coreFile, adapterFile };
}

function run(root: string): string {
  try {
    execFileSync(process.execPath, [script], { cwd: root, encoding: "utf8", stdio: "pipe" });
    return "";
  } catch (error) {
    return String((error as { stderr?: string }).stderr ?? error);
  }
}

describe("core-to-adapter import graph gate", () => {
  it.each([
    ['import { forbidden } from "../adapters/forbidden.js";', "static import"],
    ['import type { Forbidden } from "@infra/forbidden";', "type import through alias"],
    ['export { forbidden } from "../adapters/forbidden.js";', "re-export"],
    ['import "../adapters/forbidden.js";', "side-effect import"],
    ['const value = import("../adapters/forbidden.js");', "literal dynamic import"],
    [
      'const value = import("../adapters/forbidden.js", { with: { type: "json" } });',
      "literal dynamic import with attributes",
    ],
    ['import forbidden = require("@infra/forbidden");', "import equals"],
    [
      'import /* unusual */ { forbidden } /* spacing */ from "../adapters/forbidden.js";',
      "comments and unusual whitespace",
    ],
  ])("rejects %s (%s)", (source) => {
    const fixture = project(`${source}\n`);
    expect(run(fixture.root)).toContain("Core adapter boundary failed");
  });

  it("ignores fake imports in comments, strings, and templates", () => {
    const fixture = project(`
      // import { fake } from "../adapters/forbidden.js";
      const text = 'import "../adapters/forbidden.js"';
      const template = \`import("../adapters/forbidden.js")\`;
    `);
    expect(run(fixture.root)).toBe("");
  });

  it("allows core-to-core and adapter-to-core dependencies", () => {
    const fixture = project('export { value } from "./legal.js";\n');
    writeFileSync(join(fixture.root, "src", "core", "legal.ts"), "export const value = true;\n");
    writeFileSync(fixture.adapterFile, 'export { value } from "../core/legal.js";\n');
    expect(run(fixture.root)).toBe("");
  });

  it("reports each resolved edge once with importer, target, line, and column", () => {
    const fixture = project('\n  import { forbidden } from "@infra/forbidden";\n');
    const output = run(fixture.root);
    const diagnostics = output.split(/\r?\n/).filter((line) => line.includes(" -> "));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toContain("subject.ts:2:3");
    expect(diagnostics[0]).toContain("forbidden.ts");
  });
});
