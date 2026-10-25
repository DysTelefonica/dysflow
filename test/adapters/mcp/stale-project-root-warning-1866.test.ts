/**
 * Issue #1866 item 6 — a `projectRoot` in `.dysflow/project.json` that points at
 * another worktree is stale. Calls still resolve the real cwd, so the config is
 * usable, but bootstrap/doctor must say so with a typed warning.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";
import { buildDiagnoseChecks } from "../../../src/adapters/mcp/diagnose-tool.js";
import { useHermeticTmpdir } from "../../_helpers/hermetic-tmpdir";

useHermeticTmpdir();

let worktree: string;
let staleRoot: string;

beforeEach(() => {
  worktree = mkdtempSync(join(tmpdir(), "dysflow-1866-cfg-"));
  writeFileSync(join(worktree, ".git"), "gitdir: isolated-fixture", "utf-8");
  mkdirSync(join(worktree, ".dysflow"), { recursive: true });
  mkdirSync(join(worktree, "src"), { recursive: true });
  writeFileSync(join(worktree, "app.accdb"), "fake", "utf-8");
  staleRoot = mkdtempSync(join(tmpdir(), "dysflow-1866-stale-"));
});

afterEach(() => {
  rmSync(worktree, { recursive: true, force: true });
  rmSync(staleRoot, { recursive: true, force: true });
});

function writeConfig(contents: object): void {
  writeFileSync(join(worktree, ".dysflow", "project.json"), JSON.stringify(contents), "utf-8");
}

describe("stale projectRoot is reported (#1866 item 6)", () => {
  it("warns when projectRoot points at another worktree", () => {
    writeConfig({
      id: "project-a",
      accessPath: "app.accdb",
      destinationRoot: "src",
      projectRoot: staleRoot,
    });

    const result = diagnoseProjectConfig(worktree);

    expect(result.status).toBe("valid");
    expect(
      result.diagnostics.some(
        (d) => d.code === "CONFIG_PROJECT_ROOT_STALE" && d.severity === "warning",
      ),
    ).toBe(true);
  });

  it("does not warn when projectRoot matches the resolved worktree", () => {
    writeConfig({
      id: "project-a",
      accessPath: "app.accdb",
      destinationRoot: "src",
      projectRoot: worktree,
    });

    const result = diagnoseProjectConfig(worktree);

    expect(result.diagnostics.some((d) => d.code === "CONFIG_PROJECT_ROOT_STALE")).toBe(false);
  });
});

describe("bootstrap/doctor surface the stale projectRoot warning (#1866 item 6)", () => {
  it("lists CONFIG_PROJECT_ROOT_STALE in the project warnings check", () => {
    const checks = buildDiagnoseChecks({
      projectConfig: {
        status: "valid",
        projectId: "project-a",
        writeReady: true,
        diagnostics: [
          {
            code: "CONFIG_PROJECT_ROOT_STALE",
            severity: "warning",
            message: "projectRoot does not match",
            remediation: "",
          },
        ],
        owningWorktree: "cwd",
      },
      filesystem: {
        accessPath: {
          path: null,
          exists: false,
          readable: false,
          sizeBytes: 0,
          lastModified: null,
        },
        backendPath: { path: null, exists: false, hint: null },
        destinationRoot: { path: null, exists: false, hint: null },
        projectRoot: { path: worktree, exists: true },
      },
      runtime: {
        staleMarkers: 0,
        activeOps: 0,
        orphans: { msaccess: 0, pwshWorkers: 0 },
        dysflowVersion: "test",
        writeExecutionPolicy: "safe-by-default",
      },
    });
    const warnings = checks.find((check) => check.name === "diagnose.projectConfig.warnings");
    expect(warnings?.ok).toBe(false);
    expect(JSON.stringify(warnings?.value ?? "")).toContain("CONFIG_PROJECT_ROOT_STALE");
  });
});
