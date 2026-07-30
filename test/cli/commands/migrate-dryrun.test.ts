import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../../src/cli/index";

const fixture = resolve("test/fixtures/migrate-dryrun-consumer");
const workspaces: string[] = [];

function createConsumer(): string {
  const root = mkdtempSync(join(tmpdir(), "dysflow-migrate-dryrun-"));
  cpSync(fixture, root, { recursive: true });
  workspaces.push(root);
  return root;
}

afterEach(() => {
  for (const root of workspaces.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("dysflow migrate-dryrun", () => {
  it("scans consumer fixtures without writing and reports per-file source/new lines", async () => {
    const root = createConsumer();
    const modulePath = join(root, "src", "ModuleA.bas");
    const before = readFileSync(modulePath, "utf8");

    const result = await runCli(["migrate-dryrun", "--cwd", root, "--dry-run"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Files matched: 3");
    expect(result.stdout).toContain("Edits proposed: 3");
    expect(result.stdout).toContain("dryRun");
    expect(result.stdout).toContain("apply");
    expect(result.stdout).toContain("confidence=1");
    expect(result.stdout).toContain("confidence=0.5");
    expect(readFileSync(modulePath, "utf8")).toBe(before);
    expect(existsSync(join(root, ".dysflow-runtime"))).toBe(false);
  });

  it("--apply rewrites supported files and writes a replayable undo manifest", async () => {
    const root = createConsumer();

    const applied = await runCli(["migrate-dryrun", "--cwd", root, "--apply"]);

    expect(applied.exitCode).toBe(0);
    expect(applied.stdout).toContain("Files matched: 3");
    expect(applied.stdout).toMatch(/Undo manifest: .+migration-.+\.undo\.json/);
    expect(readFileSync(join(root, "src", "ModuleA.bas"), "utf8")).toContain('""apply"": false');
    expect(readFileSync(join(root, "src", "Worker.cls"), "utf8")).toContain('""apply"": true');
    expect(readFileSync(join(root, "forms", "Form_Work.form.txt"), "utf8")).toContain(
      '""apply"": Not (shouldPlan)',
    );
    expect(readFileSync(join(root, "README.md"), "utf8")).toContain("dryRun: true");

    const match = applied.stdout.match(/Undo manifest: (.+)$/m);
    expect(match?.[1]).toBeDefined();
    const manifestPath = match?.[1] as string;
    expect(existsSync(manifestPath)).toBe(true);

    const undone = await runCli(["migrate-dryrun", "--cwd", root, "--undo", manifestPath]);
    expect(undone.exitCode).toBe(0);
    expect(undone.stdout).toContain("Restored files: 3");
    expect(readFileSync(join(root, "src", "ModuleA.bas"), "utf8")).toContain('""dryRun"": true');
  });

  it("refuses undo when a migrated file changed after apply", async () => {
    const root = createConsumer();
    const applied = await runCli(["migrate-dryrun", "--cwd", root, "--apply"]);
    const manifestPath = applied.stdout.match(/Undo manifest: (.+)$/m)?.[1];
    expect(manifestPath).toBeDefined();

    const modulePath = join(root, "src", "ModuleA.bas");
    const current = readFileSync(modulePath, "utf8");
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(modulePath, `${current}\n' consumer edit`, "utf8"),
    );

    const undone = await runCli([
      "migrate-dryrun",
      "--cwd",
      root,
      "--undo",
      manifestPath as string,
    ]);

    expect(undone.exitCode).toBe(1);
    expect(undone.stderr).toMatch(/changed since migration/i);
  });
});
