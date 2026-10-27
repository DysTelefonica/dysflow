import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { VbaModulesOrchestrator } from "../../../src/adapters/vba-sync/vba-modules-adapter";
import { VbaModulesAdapter } from "../../../src/adapters/vba-sync/vba-modules-adapter";
import type { VbaManagerExecutor } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import type { OperationResult } from "../../../src/core/contracts/index";
import { runNoopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";
import { resolveDestinationRootForTest } from "../../_helpers/resolve-destination-root.js";

/**
 * The transactional commit is an atomic rename(2) of the staging copy onto
 * the original binary. A rename cannot cross devices (EXDEV), so the staging
 * copy must live next to the binary, never under the project root: an
 * `accessPath` on another drive or network share than the project must
 * still commit.
 *
 * The project root here is a regular FILE, so nothing can ever be staged
 * beneath it. The write must succeed regardless, which proves staging does
 * not depend on where the project lives.
 */

const MODULE_FOO = [
  'Attribute VB_Name = "Module_Foo"',
  "Option Compare Database",
  "Option Explicit",
  "",
].join("\r\n");

function makeAdapter(executor: VbaManagerExecutor, projectRoot: string): VbaModulesAdapter {
  const orchestrator: VbaModulesOrchestrator = {
    scriptPath: "scripts/dysflow-vba-manager.ps1",
    cwd: projectRoot,
    env: {},
    executor,
    resolveExecutionTarget: async (params) => {
      const accessPath = String(params.accessPath);
      return {
        ok: true,
        data: {
          configSource: "explicit-request",
          accessDbPath: accessPath,
          accessPath,
          backendPath: undefined,
          destinationRoot: await resolveDestinationRootForTest(projectRoot),
          projectRoot,
          projectId: "test-project",
          timeoutMs: 30_000,
        },
        diagnostics: [],
        durationMs: 0,
      };
    },
    validateStrictContext: () => ({ ok: true, data: undefined, diagnostics: [], durationMs: 0 }),
    runPreflightCleanup: runNoopPreflightCleanup,
    executeMappedTool: async (toolName, params) => {
      const accessPath = String(params.accessPath);
      const executorResult = await executor({
        scriptPath: "scripts/dysflow-vba-manager.ps1",
        action: toolName === "import_modules" ? "Import" : "Export",
        accessPath,
        destinationRoot: projectRoot,
        moduleNames: [],
        json: false,
        extra: {},
        timeoutMs: 30_000,
        cwd: projectRoot,
      });
      const ok = executorResult.exitCode === 0;
      return {
        ok,
        ...(ok
          ? { data: { accessPath } }
          : { error: { code: "RUNNER_FAILED", message: "runner failed", retryable: false } }),
        diagnostics: [],
        durationMs: executorResult.durationMs,
      } as OperationResult<unknown>;
    },
  };
  return new VbaModulesAdapter(orchestrator, {
    mkdtemp: async () => projectRoot,
    readdir: async () => [],
    readFile: async () => MODULE_FOO,
    readFileBytes: async () => new Uint8Array(),
    rm: async () => undefined,
    tmpdir: () => tmpdir(),
  });
}

describe("transactional staging location", () => {
  let workdir: string;
  let binaryPath: string;
  let projectRootFile: string;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), "dysflow-tx-staging-"));
    await mkdir(join(workdir, "data"));
    binaryPath = join(workdir, "data", "App.accdb");
    await writeFile(binaryPath, "original-binary");
    projectRootFile = join(workdir, "not-a-directory");
    await writeFile(projectRootFile, "a file where a project root would be");
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it("commits even when nothing can be staged under the project root", async () => {
    let stagedAt: string | undefined;
    const executor: VbaManagerExecutor = async (request) => {
      stagedAt = request.accessPath;
      if (request.accessPath !== undefined) await writeFile(request.accessPath, "imported");
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"ok":true}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };

    const result = await makeAdapter(executor, projectRootFile).execute("import_modules", {
      accessPath: binaryPath,
      moduleNames: ["Module_Foo"],
      apply: true,
      transactional: true,
    });

    expect(result).toMatchObject({ ok: true });
    expect((await readFile(binaryPath)).toString("utf8")).toBe("imported");
    // The runner wrote a copy beside the binary, not the binary itself.
    expect(stagedAt).not.toBe(binaryPath);
    expect(stagedAt?.startsWith(join(dirname(binaryPath), ""))).toBe(true);
  });

  it("leaves no staging copy behind next to the binary after a failed write", async () => {
    const executor: VbaManagerExecutor = async (request) => {
      if (request.accessPath !== undefined) await writeFile(request.accessPath, "corrupted");
      return {
        exitCode: 1,
        stdout: 'DYSFLOW_RESULT {"ok":false}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };

    const result = await makeAdapter(executor, projectRootFile).execute("import_modules", {
      accessPath: binaryPath,
      moduleNames: ["Module_Foo"],
      apply: true,
      transactional: true,
    });

    expect(result.ok).toBe(false);
    expect((await readFile(binaryPath)).toString("utf8")).toBe("original-binary");
    const { readdir } = await import("node:fs/promises");
    const leftovers = await readdir(dirname(binaryPath), { recursive: true });
    expect(leftovers.filter((entry) => String(entry).endsWith(".accdb"))).toEqual(["App.accdb"]);
  });
});
