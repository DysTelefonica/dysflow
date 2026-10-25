/**
 * Issue #1863 — the import lint gate blocks only NEW error findings.
 *
 * A finding is inherited when the module's previous version (its HEAD commit)
 * already had the same rule and message. Inherited errors are reported as
 * warnings and never block apply:true. A new module has no previous version,
 * so its errors are all new.
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

const HEADER = [
  'Attribute VB_Name = "ModA"',
  "Option Compare Database",
  "Option Explicit",
  "",
].join("\r\n");

// Error-severity finding: p_Error is not the last parameter.
const INHERITED_ERROR_BODY = [
  "Public Sub Demo(Optional ByRef p_Error As String, ByVal x As Long)",
  "End Sub",
  "",
].join("\r\n");

const UNRELATED_ADDITION = ["Public Sub Ok()", "End Sub", ""].join("\r\n");

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function buildAdapter(executor: VbaManagerExecutor, destinationRoot: string) {
  return new VbaSyncAdapter({
    preflightCleanup: noopPreflightCleanup(),
    executor,
    scriptPath: "scripts/dysflow-vba-manager.ps1",
    accessPath: "C:/db/front.accdb",
    destinationRoot,
    env: {},
  });
}

function recordingExecutor(actions: string[]): VbaManagerExecutor {
  return async (request) => {
    actions.push(String(request.action));
    return {
      exitCode: 0,
      stdout: "DYSFLOW_RESULT []",
      stderr: "",
      durationMs: 1,
      timedOut: false,
    };
  };
}

describe("import_modules — only new lint errors block (#1863)", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dysflow-lint-new-errors-"));
    await mkdir(join(root, "modules"), { recursive: true });
    git(root, "init", "-q");
    git(root, "config", "user.email", "test@example.invalid");
    git(root, "config", "user.name", "test");
    git(root, "config", "commit.gpgsign", "false");
  });

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("imports with a warning when the module's error was already committed", async () => {
    await writeFile(join(root, "modules", "ModA.bas"), HEADER + INHERITED_ERROR_BODY, "utf8");
    git(root, "add", ".");
    git(root, "commit", "-q", "-m", "previous version");
    // The working copy keeps the inherited error and adds an unrelated change.
    await writeFile(
      join(root, "modules", "ModA.bas"),
      HEADER + INHERITED_ERROR_BODY + UNRELATED_ADDITION,
      "utf8",
    );
    const actions: string[] = [];
    const adapter = buildAdapter(recordingExecutor(actions), root);

    const result = await adapter.execute("import_modules", {
      destinationRoot: root,
      moduleNames: ["ModA"],
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(actions).toContain("Import");
    expect(JSON.stringify(result)).toContain("inherited");
  });

  it("refuses a change that introduces a new error", async () => {
    await writeFile(join(root, "modules", "ModA.bas"), HEADER + UNRELATED_ADDITION, "utf8");
    git(root, "add", ".");
    git(root, "commit", "-q", "-m", "previous version");
    await writeFile(
      join(root, "modules", "ModA.bas"),
      HEADER + UNRELATED_ADDITION + INHERITED_ERROR_BODY,
      "utf8",
    );
    const actions: string[] = [];
    const adapter = buildAdapter(recordingExecutor(actions), root);

    const result = await adapter.execute("import_modules", {
      destinationRoot: root,
      moduleNames: ["ModA"],
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("LINT_FINDINGS_ERROR");
    expect(result.error.message).toContain("error-param-last");
    expect(actions).not.toContain("Import");
  });

  it("refuses a new module that has errors", async () => {
    await writeFile(join(root, "modules", "ModB.bas"), HEADER + INHERITED_ERROR_BODY, "utf8");
    const actions: string[] = [];
    const adapter = buildAdapter(recordingExecutor(actions), root);

    const result = await adapter.execute("import_modules", {
      destinationRoot: root,
      moduleNames: ["ModB"],
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("LINT_FINDINGS_ERROR");
    expect(actions).not.toContain("Import");
  });

  it("apply:false marks each finding as new or inherited", async () => {
    await writeFile(join(root, "modules", "ModA.bas"), HEADER + INHERITED_ERROR_BODY, "utf8");
    git(root, "add", ".");
    git(root, "commit", "-q", "-m", "previous version");
    const actions: string[] = [];
    const adapter = buildAdapter(recordingExecutor(actions), root);

    const result = await adapter.execute("import_modules", {
      destinationRoot: root,
      moduleNames: ["ModA"],
      apply: false,
    });

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).toContain("error-param-last");
    expect(JSON.stringify(result)).toContain("inherited");
    expect(actions).not.toContain("Import");
  });
});
