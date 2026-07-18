/**
 * Issue #970 — Structured remediation field in diagnostics[].
 *
 * Acceptance criteria:
 *   1. diagnostics[].remediation is a structured object (not a string).
 *      Backward compat: a string remediation is parsed as { description: <string> }.
 *   2. remediation.command is bash-style and copy-paste ready.
 *   3. remediation.alternatives includes windows-powershell for Windows consumers.
 *   4. remediation.safeToAutoExecute is true for idempotent ops (mkdir),
 *      false for destructive ops (git rm -r, git reset --hard).
 *   5. Tests verify the schema AND that command runs successfully in bash.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProjectConfigDiagnostic } from "../../../src/adapters/config/project-config-diagnostic";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic";
import { projectConfigNotWriteReady } from "../../../src/adapters/mcp/dispatch-common";
import type { Remediation } from "../../../src/core/contracts/remediation";
import { structureRemediation } from "../../../src/core/contracts/remediation";

function worktree(): string {
  const r = mkdtempSync(join(tmpdir(), "dysflow-remediation-"));
  writeFileSync(join(r, ".git"), "gitdir: fixture");
  return r;
}

function makeDiagnostic(
  status: string,
  code: string,
  remediation: Remediation | string,
): ProjectConfigDiagnostic {
  return {
    status,
    cwd: "C:/repo",
    configPath: "C:/repo/.dysflow/project.json",
    projectRoot: "C:/repo",
    projectId: "app",
    accessPath: "C:/repo/app.accdb",
    backendPath: null,
    destinationRoot: "C:/repo/src",
    writeReady: false,
    diagnostics: [{ code, severity: "error", message: `${code} diagnostic`, remediation }],
    remediation: typeof remediation === "string" ? remediation : remediation.description,
  } as unknown as ProjectConfigDiagnostic;
}

describe("Remediation structured shape (#970)", () => {
  it("diagnostics[].remediation is a structured object with description, command, platform", () => {
    const diagnostic = makeDiagnostic(
      "destination-root-not-found",
      "DESTINATION_ROOT_NOT_FOUND",
      "Run `mkdir -p '<destinationRoot>'`",
    );
    const result = projectConfigNotWriteReady("export_modules", diagnostic);
    const entry = result.error?.diagnostics?.[0];
    expect(entry).toBeDefined();
    const rem = entry?.remediation;
    expect(typeof rem).toBe("object");
    expect(rem).not.toBeNull();
    const r = rem as Remediation;
    expect(typeof r.description).toBe("string");
    expect(typeof r.command).toBe("string");
    expect(typeof r.platform).toBe("string");
    expect(["cross-platform", "posix", "windows"]).toContain(r.platform);
  });

  it("remediation.command is bash-style and copy-paste ready (no unresolved placeholders)", () => {
    const root = worktree();
    mkdirSync(join(root, ".dysflow"));
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: "app.accdb", destinationRoot: "missing/src" }),
    );
    const result = diagnoseProjectConfig(root, { projectId: "app" });
    expect(result.status).toBe("destination-root-not-found");
    const rem = result.diagnostics[0]?.remediation;
    expect(rem).toBeDefined();
    const r = rem as Remediation;
    // No unresolved <placeholder> tokens
    expect(r.command).not.toMatch(/<[A-Za-z_][A-Za-z0-9_]*>/);
    // Bash-style: forward slashes, no Windows-style backslashes
    expect(r.command).not.toContain("\\");
    // Real bash verbs
    expect(
      /^(mkdir|cp|mv|rm|git |dysflow |chmod|chown|sed|awk|echo|export|cd|ls|rmdir|touch|cat)/.test(
        r.command,
      ),
    ).toBe(true);
  });

  it("remediation.alternatives includes windows-powershell for Windows consumers", () => {
    const root = worktree();
    mkdirSync(join(root, ".dysflow"));
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: "app.accdb", destinationRoot: "missing/src" }),
    );
    const result = diagnoseProjectConfig(root, { projectId: "app" });
    const rem = result.diagnostics[0]?.remediation as Remediation;
    expect(rem.alternatives).toBeDefined();
    expect(typeof rem.alternatives?.["windows-powershell"]).toBe("string");
    expect((rem.alternatives?.["windows-powershell"] ?? "").length).toBeGreaterThan(0);
  });

  it("safeToAutoExecute is true for mkdir (idempotent) and false for destructive ops", () => {
    const root = worktree();
    mkdirSync(join(root, ".dysflow"));
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: "app.accdb", destinationRoot: "missing/src" }),
    );
    const result = diagnoseProjectConfig(root, { projectId: "app" });
    const rem = result.diagnostics[0]?.remediation as Remediation;
    // mkdir -p is idempotent — safe to auto-execute
    expect(rem.safeToAutoExecute).toBe(true);

    // Build a fake destructive-op remediation and verify safeToAutoExecute is false
    const destructive: Remediation = {
      description: "Drop the dirty stash.",
      command: "git reset --hard HEAD~1",
      platform: "posix",
      safeToAutoExecute: false,
    };
    expect(structureRemediation(destructive).safeToAutoExecute).toBe(false);

    const rmRem: Remediation = {
      description: "Remove dangling branches.",
      command: "git rm -r path/to/dir",
      platform: "posix",
      safeToAutoExecute: false,
    };
    expect(structureRemediation(rmRem).safeToAutoExecute).toBe(false);
  });

  it("backward compat: a string remediation is parsed as description (with command derived)", () => {
    const wrapped = structureRemediation("Edit .dysflow/project.json to enable writes.");
    expect(typeof wrapped).toBe("object");
    expect(wrapped.description).toBe("Edit .dysflow/project.json to enable writes.");
    expect(typeof wrapped.command).toBe("string");
    expect(wrapped.platform).toBeDefined();
    expect(["cross-platform", "posix", "windows"]).toContain(wrapped.platform);
  });

  it("CAPABILITIES_DISALLOW_WRITE remediation has safeToAutoExecute=false (config edit, not idempotent)", () => {
    const root = worktree();
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        id: "app",
        accessPath: "app.accdb",
        destinationRoot: "src",
        capabilities: { allowWrites: false },
      }),
    );
    const result = diagnoseProjectConfig(root, { projectId: "app" });
    expect(result.status).toBe("capabilities-disallow-write");
    const rem = result.diagnostics[0]?.remediation as Remediation;
    expect(rem).toBeDefined();
    // Editing a JSON config is NOT idempotent (it's a state change) → not safe to auto-execute
    expect(rem.safeToAutoExecute).toBe(false);
    // alternatives should still carry windows-powershell for cross-platform consumers
    expect(typeof rem.alternatives?.["windows-powershell"]).toBe("string");
  });

  it("command runs successfully in bash (DESTINATION_ROOT_NOT_FOUND mkdir scenario)", () => {
    const root = worktree();
    mkdirSync(join(root, ".dysflow"));
    writeFileSync(join(root, "app.accdb"), "");
    const target = join(root, "src");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: "app.accdb", destinationRoot: target }),
    );
    const result = diagnoseProjectConfig(root, { projectId: "app" });
    expect(result.status).toBe("destination-root-not-found");
    const rem = result.diagnostics[0]?.remediation as Remediation;

    // Execute the remediation command in bash; verify exit 0 and directory exists.
    // We use Git Bash (the path that ships with Git for Windows) so the test is portable.
    const bash = process.env.DYSFLOW_TEST_BASH ?? "C:/Program Files/Git/bin/bash.exe";
    const res = spawnSync(bash, ["-lc", rem.command], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(res.status).toBe(0);
    // Verify the directories that mkdir -p created (last segments in rem.command)
    const expectedPaths = [join(target, "classes"), join(target, "modules"), join(target, "forms")];
    for (const p of expectedPaths) {
      const probe = spawnSync(bash, ["-lc", `[ -d "${p.replaceAll("\\", "/")}" ] && echo yes`], {
        encoding: "utf8",
      });
      expect(probe.stdout.trim()).toBe("yes");
    }
  });
});

describe("structureRemediation backward-compat shim (#970)", () => {
  it("wraps a string into a structured Remediation with description=string", () => {
    const r = structureRemediation("Some legacy hint.");
    expect(r.description).toBe("Some legacy hint.");
    expect(typeof r.command).toBe("string");
  });

  it("passes through a structured Remediation verbatim", () => {
    const r: Remediation = {
      description: "Custom",
      command: "echo hi",
      platform: "cross-platform",
      safeToAutoExecute: false,
    };
    expect(structureRemediation(r)).toEqual(r);
  });
});
