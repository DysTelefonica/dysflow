/**
 * Issue #1057 (Round-15 F9) — potent `dysflow doctor` with 4 read-only
 * check categories:
 *
 *   A — `.dysflow/project.json` schema + path resolution + conventions.
 *   B — VBA source-tree structure (Attribute VB_Name, Option Explicit).
 *   C — runtime consumer contract (apply polarity, param naming, version).
 *   D — external deps (.laccdb orphan locks, .codegraph freshness).
 *
 * `--category <A|B|C|D|all>` runs ONLY the requested category checks —
 * completely side-effect free: no PowerShell, no Access COM, no writes.
 * The plain `dysflow doctor` (no flag) keeps its legacy behavior. Exit
 * code reflects critical findings only; warnings exit 0.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleDoctorCommand } from "../../src/cli/commands/doctor";

let root: string;

function writeFixture(options: { missingVbName?: boolean; accessPathExists?: boolean }): string {
  const dir = mkdtempSync(path.join(tmpdir(), "dysflow-doctor-1057-"));
  const src = path.join(dir, "src");
  mkdirSync(path.join(src, "classes"), { recursive: true });
  mkdirSync(path.join(dir, ".dysflow"), { recursive: true });
  const accessPath = path.join(dir, "App.accdb");
  if (options.accessPathExists !== false) writeFileSync(accessPath, "stub");
  writeFileSync(
    path.join(dir, ".dysflow", "project.json"),
    JSON.stringify({
      id: "doctor-fixture-1057",
      accessPath: "App.accdb",
      destinationRoot: "src",
      capabilities: { allowWrites: true, writeExecutionPolicy: "safe-by-default" },
    }),
  );
  const cls = options.missingVbName
    ? "Sub Foo()\nEnd Sub\n"
    : 'Attribute VB_Name = "Thing"\nOption Explicit\nSub Foo()\nEnd Sub\n';
  writeFileSync(path.join(src, "classes", "Thing.cls"), cls);
  return dir;
}

beforeAll(() => {
  root = writeFixture({});
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("dysflow doctor --category (#1057 F9)", () => {
  it("Category A validates project.json schema, path resolution, and projectId convention", async () => {
    const result = await handleDoctorCommand(["--category", "A"], { cwd: root });
    expect(result.stdout).toMatch(/project\.json schema/i);
    expect(result.stdout).toMatch(/accessPath resolves/i);
    expect(result.stdout).toMatch(/projectId matches convention/i);
    expect(result.exitCode).toBe(0);
  });

  it("Category A reports a critical when accessPath does not resolve", async () => {
    const broken = writeFixture({ accessPathExists: false });
    try {
      const result = await handleDoctorCommand(["--category", "A"], { cwd: broken });
      expect(result.stdout).toMatch(/✗.*accessPath/i);
      expect(result.exitCode).toBe(1);
    } finally {
      rmSync(broken, { recursive: true, force: true });
    }
  });

  it("Category B detects source files without Attribute VB_Name", async () => {
    const missing = writeFixture({ missingVbName: true });
    try {
      const result = await handleDoctorCommand(["--category", "B"], { cwd: missing });
      expect(result.stdout).toMatch(/Attribute VB_Name missing in \d+ file/i);
      // Structure findings are warnings, not criticals.
      expect(result.exitCode).toBe(0);
    } finally {
      rmSync(missing, { recursive: true, force: true });
    }
  });

  it("Category C reports the apply-polarity contract", async () => {
    const result = await handleDoctorCommand(["--category", "C"], { cwd: root });
    expect(result.stdout).toMatch(/apply polarity/i);
    expect(result.exitCode).toBe(0);
  });

  it("Category D reports .laccdb lock status", async () => {
    const result = await handleDoctorCommand(["--category", "D"], { cwd: root });
    expect(result.stdout).toMatch(/laccdb/i);
    expect(result.exitCode).toBe(0);
  });

  it("--category all runs all four categories", async () => {
    const result = await handleDoctorCommand(["--category", "all"], { cwd: root });
    for (const label of ["Category A", "Category B", "Category C", "Category D"]) {
      expect(result.stdout).toContain(label);
    }
  });

  it("rejects an unknown category with a usage error", async () => {
    const result = await handleDoctorCommand(["--category", "Z"], { cwd: root });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/category/i);
  });

  it("--help documents --category", async () => {
    const result = await handleDoctorCommand(["--help"], { cwd: root });
    expect(result.stdout).toMatch(/--category/);
  });
});
