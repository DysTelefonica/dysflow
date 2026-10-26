/**
 * Issue #1914 — `export_modules` with a non-existent `exportPath` failed as
 * `POWERSHELL_SPAWN_FAILED: ... spawn <exe> ENOENT`.
 *
 * The explicit export target also becomes the worker's spawn `cwd` (#1169),
 * and Node reports a missing `cwd` as `spawn <exe> ENOENT`. A missing folder
 * must surface as a path-specific `DESTINATION_ROOT_NOT_FOUND` that names the
 * folder, before any worker is spawned. A genuinely missing PowerShell
 * executable must still surface as `POWERSHELL_SPAWN_FAILED`.
 *
 * The only fake is the PowerShell spawn boundary. It models Node's
 * `child_process.spawn` contract: a missing `cwd` is reported as ENOENT.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type VbaManagerExecutionRequest,
  type VbaManagerExecutionResult,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter.js";

const noOpPreflightCleanup = {
  cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
};

const scratchRoots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of scratchRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeScratch(): string {
  const root = mkdtempSync(join(tmpdir(), "dysflow-1914-"));
  scratchRoots.push(root);
  return root;
}

function spawnLikeExecutor(options: { powershellMissing?: boolean } = {}) {
  const requests: VbaManagerExecutionRequest[] = [];
  const executor = async (
    request: VbaManagerExecutionRequest,
  ): Promise<VbaManagerExecutionResult> => {
    requests.push(request);
    if (
      options.powershellMissing === true ||
      (request.cwd !== undefined && !existsSync(request.cwd))
    ) {
      return {
        exitCode: null,
        stdout: "",
        stderr: "spawn powershell.exe ENOENT",
        durationMs: 1,
        timedOut: false,
        spawnError: "spawn powershell.exe ENOENT",
      };
    }
    return {
      exitCode: 0,
      stdout: 'DYSFLOW_RESULT {"ok":true,"exported":["ModuleA"]}',
      stderr: "",
      durationMs: 1,
      timedOut: false,
    };
  };
  return { executor, requests };
}

function makeAdapter(executor: ReturnType<typeof spawnLikeExecutor>["executor"], cwd: string) {
  return new VbaSyncAdapter({
    executor,
    scriptPath: "fake.ps1",
    cwd,
    accessPath: join(cwd, "front.accdb"),
    destinationRoot: "src",
    preflightCleanup: noOpPreflightCleanup,
  });
}

describe("export with a missing exportPath (#1914)", () => {
  it.each(["export_modules", "export_all"] as const)(
    "%s names the missing exportPath instead of reporting a PowerShell spawn failure",
    async (toolName) => {
      const scratch = makeScratch();
      const exportPath = join(scratch, "bin-export");
      const { executor, requests } = spawnLikeExecutor();

      const result = await makeAdapter(executor, scratch).execute(toolName, {
        exportPath,
        moduleNames: ["ModuleA"],
        apply: true,
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.error.code).not.toBe("POWERSHELL_SPAWN_FAILED");
      expect(result.error.code).toBe("DESTINATION_ROOT_NOT_FOUND");
      expect(result.error.message).toContain(exportPath);
      expect(requests).toHaveLength(0);
    },
  );

  it("names a missing explicit destinationRoot the same way", async () => {
    const scratch = makeScratch();
    const destinationRoot = join(scratch, "missing-src");
    const { executor, requests } = spawnLikeExecutor();

    const result = await makeAdapter(executor, scratch).execute("export_modules", {
      destinationRoot,
      moduleNames: ["ModuleA"],
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("DESTINATION_ROOT_NOT_FOUND");
    expect(result.error.message).toContain(destinationRoot);
    expect(requests).toHaveLength(0);
  });

  it("exports to an existing exportPath unchanged", async () => {
    const scratch = makeScratch();
    const exportPath = mkdtempSync(join(scratch, "bin-export-"));
    const { executor, requests } = spawnLikeExecutor();

    const result = await makeAdapter(executor, scratch).execute("export_modules", {
      exportPath,
      moduleNames: ["ModuleA"],
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.destinationRoot).toBe(exportPath);
  });

  it("keeps the runtime-path guard (#574) ahead of the missing-folder check", async () => {
    const scratch = makeScratch();
    vi.stubEnv("DYSFLOW_HOME", join(scratch, "runtime", "dysflow"));
    const exportPath = join(scratch, "runtime", "dysflow", "missing");
    const { executor, requests } = spawnLikeExecutor();

    const result = await makeAdapter(executor, scratch).execute("export_modules", {
      exportPath,
      moduleNames: ["ModuleA"],
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.message).toMatch(/production runtime/);
    expect(requests).toHaveLength(0);
  });

  it("still reports a genuinely missing PowerShell executable as POWERSHELL_SPAWN_FAILED", async () => {
    const scratch = makeScratch();
    const exportPath = mkdtempSync(join(scratch, "bin-export-"));
    const { executor, requests } = spawnLikeExecutor({ powershellMissing: true });

    const result = await makeAdapter(executor, scratch).execute("export_modules", {
      exportPath,
      moduleNames: ["ModuleA"],
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("POWERSHELL_SPAWN_FAILED");
    expect(requests).toHaveLength(1);
  });
});
