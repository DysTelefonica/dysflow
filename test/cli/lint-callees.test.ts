import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function workspace(text: string): string {
  const root = mkdtempSync(join(tmpdir(), "dysflow-lint-callees-"));
  roots.push(root);
  mkdirSync(join(root, "src", "modules"), { recursive: true });
  writeFileSync(join(root, "src", "modules", "Example.bas"), text, "utf8");
  return root;
}

describe("dysflow lint callees", () => {
  it("returns structured JSON and exit code 1 for missing callees", async () => {
    const root = workspace("Public Sub Run()\n  MissingHelper (42)\nEnd Sub");
    const result = await runCli(["lint", "callees", "src", "--json"], { cwd: root, env: {} });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      totals: { declarations: 1, missing: 1 },
      missing: [{ file: "src/modules/Example.bas", name: "MissingHelper" }],
    });
  });

  it("loads configurable exclusions from DYSFLOW_LINT_EXTRAS", async () => {
    const root = workspace("Public Sub Run()\n  ConsumerHelper (42)\nEnd Sub");
    const result = await runCli(["lint", "callees", "src", "--json"], {
      cwd: root,
      env: { DYSFLOW_LINT_EXTRAS: JSON.stringify({ keywords: ["ConsumerHelper"] }) },
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).missing).toEqual([]);
  });

  it("uses exit code 2 for invocation errors", async () => {
    const result = await runCli(["lint", "unknown"]);
    expect(result).toMatchObject({ exitCode: 2, stdout: "" });
    expect(result.stderr).toContain("Usage: dysflow lint callees");
  });

  it("rejects an existing source root with no VBA files", async () => {
    const root = workspace("Public Sub Run()\nEnd Sub");
    mkdirSync(join(root, "empty"));
    const result = await runCli(["lint", "callees", "empty"], { cwd: root, env: {} });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("No .bas or .cls files found");
  });
});
