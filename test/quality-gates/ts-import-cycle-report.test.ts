import { execFileSync, spawnSync } from "node:child_process";
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

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "dysflow-cycle-gate-"));
  mkdirSync(join(root, "src"));
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(join(root, "src", name), source);
  }
  return root;
}

function check(
  root: string,
  cycles: readonly (readonly string[])[],
): { status: number | null; stderr: string } {
  const baseline = join(root, "cycle-baseline.json");
  writeFileSync(baseline, JSON.stringify({ version: 1, cycles }));
  const result = spawnSync(process.execPath, [script, "--root", root, "--check", baseline], {
    encoding: "utf8",
  });
  return { status: result.status, stderr: result.stderr };
}

const monotonicImprovementFixtures: Array<{
  scenario: string;
  baseline: string[][];
  files: Record<string, string>;
}> = [
  {
    scenario: "shrinks an existing SCC",
    baseline: [["src/a.ts", "src/b.ts", "src/c.ts"]],
    files: {
      "a.ts": 'import "./b.js";\n',
      "b.ts": 'import "./a.js";\n',
      "c.ts": "export const c = true;\n",
    },
  },
  {
    scenario: "splits an existing SCC",
    baseline: [["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"]],
    files: {
      "a.ts": 'import "./b.js";\n',
      "b.ts": 'import "./a.js";\n',
      "c.ts": 'import "./d.js";\n',
      "d.ts": 'import "./c.js";\n',
    },
  },
  {
    scenario: "eliminates an existing SCC",
    baseline: [["src/a.ts", "src/b.ts"]],
    files: {
      "a.ts": 'import "./b.js";\n',
      "b.ts": "export const b = true;\n",
    },
  },
];

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

  it("rejects a new cyclic SCC and reports its members and internal import edges", () => {
    const root = project({
      "a.ts": 'import "./b.js";\n',
      "b.ts": 'import "./a.js";\n',
    });

    const result = check(root, []);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("src/a.ts");
    expect(result.stderr).toContain("src/b.ts");
    expect(result.stderr).toContain("src/a.ts -> src/b.ts");
    expect(result.stderr).toContain("src/b.ts -> src/a.ts");
  });

  it("rejects growth of a reviewed SCC", () => {
    const root = project({
      "a.ts": 'import "./b.js";\n',
      "b.ts": 'import "./a.js";\nimport "./c.js";\n',
      "c.ts": 'import "./b.js";\n',
    });

    const result = check(root, [["src/a.ts", "src/b.ts"]]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unapproved cyclic members: src/c.ts");
    expect(result.stderr).toContain("src/b.ts -> src/c.ts");
  });

  it("rejects a merge of two independently reviewed SCCs", () => {
    const root = project({
      "a.ts": 'import "./b.js";\n',
      "b.ts": 'import "./a.js";\nimport "./c.js";\n',
      "c.ts": 'import "./d.js";\n',
      "d.ts": 'import "./c.js";\nimport "./a.js";\n',
    });

    const result = check(root, [
      ["src/a.ts", "src/b.ts"],
      ["src/c.ts", "src/d.ts"],
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("baseline SCCs were merged");
    expect(result.stderr).toContain("src/b.ts -> src/c.ts");
    expect(result.stderr).toContain("src/d.ts -> src/a.ts");
  });

  it.each(monotonicImprovementFixtures)("allows monotonic improvement when it $scenario", ({
    baseline,
    files,
  }) => {
    const result = check(project(files), baseline);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
