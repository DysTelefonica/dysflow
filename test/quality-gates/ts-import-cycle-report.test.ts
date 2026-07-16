import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = resolve("scripts/report-ts-import-cycles.mjs");

function run(root: string, files?: string[]): Record<string, unknown> {
  const args = [script, "--root", root];
  if (files !== undefined) args.push("--files", ...files);
  return JSON.parse(execFileSync(process.execPath, args, { encoding: "utf8" }));
}

function runRaw(root: string): string {
  return execFileSync(process.execPath, [script, "--root", root], { encoding: "utf8" });
}

describe("TypeScript import cycle report", () => {
  it("reports deterministic SCC evidence from relative imports and re-exports", () => {
    const root = mkdtempSync(join(tmpdir(), "dysflow-cycle-report-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/a.ts"), 'import "./b.js";\n');
    writeFileSync(
      join(root, "src/b.ts"),
      'export { value } from "./a.js";\nexport const value = 1;\n',
    );
    writeFileSync(join(root, "src/c.ts"), 'import "./a.js";\n');

    const first = run(root);
    const second = run(root);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      modules: 3,
      edges: 3,
      sccs: 2,
      cyclicSccs: 1,
      cyclicSizes: [2],
      cycles: [["src/a.ts", "src/b.ts"]],
    });
    expect(run(root, ["src/a.ts", "src/b.ts"])).toMatchObject({
      modules: 2,
      edges: 2,
      sccs: 1,
      cyclicSccs: 1,
    });
  });

  it("uses locale-independent code-unit ordering for mixed-case and punctuation paths", () => {
    const root = mkdtempSync(join(tmpdir(), "dysflow-cycle-order-"));
    mkdirSync(join(root, "src"));
    const fixtures: Array<[string, string]> = [
      ["A.ts", "./b.js"],
      ["b.ts", "./A.js"],
      ["Z.ts", "./_q.js"],
      ["_q.ts", "./Z.js"],
    ];
    for (const [name, target] of fixtures) {
      writeFileSync(join(root, "src", name), `import "${target}";\n`);
    }

    const first = runRaw(root);
    const second = runRaw(root);

    expect(second).toBe(first);
    expect(JSON.parse(first)).toMatchObject({
      cycles: [
        ["src/A.ts", "src/b.ts"],
        ["src/Z.ts", "src/_q.ts"],
      ],
    });
  });
});
