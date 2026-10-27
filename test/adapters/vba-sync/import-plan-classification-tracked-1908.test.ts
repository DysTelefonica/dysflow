/**
 * Issue #1908 — the import_all / import_modules dry run classifies every planned
 * module with a verify_code-style export from a snapshot of the binary. That
 * export spawns Access, so it must behave like every other Access run:
 *
 * - it is a tracked operation (visible through list_access_operations), and its
 *   recorded Access PID is reaped when the export times out;
 * - its deadline sits below the caller's budget, so dysflow times out, reaps and
 *   removes the snapshot before the client gives up;
 * - a timed-out classification degrades to the #1866 "unavailable" warning and
 *   the plan still succeeds.
 */

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  VbaManagerExecutionRequest,
  VbaManagerExecutor,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { VbaSyncAdapter } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { AccessOperationPreflightCleanupService } from "../../../src/core/operations/access-operation-preflight";
import {
  type AccessOperationRecord,
  InMemoryAccessOperationRegistry,
} from "../../../src/core/operations/access-operation-registry";

const ACCESS_PID = 24_680;
const ACCESS_START = "2026-10-27T09:00:00.000Z";
const SOURCE = "Public Sub Calcular()\n    x = 2\nEnd Sub\n";

async function listOperations(service: VbaSyncAdapter): Promise<AccessOperationRecord[]> {
  const listed = await service.execute("list_access_operations", {});
  if (!listed.ok) throw new Error("expected list_access_operations success");
  return (listed.data as { operations: AccessOperationRecord[] }).operations;
}

async function setup(executor: VbaManagerExecutor) {
  const root = await mkdtemp(join(tmpdir(), "dysflow-1908-classify-"));
  const sourceRoot = join(root, "src");
  await mkdir(join(sourceRoot, "modules"), { recursive: true });
  await writeFile(join(sourceRoot, "modules", "Calculo.bas"), SOURCE, "utf8");
  const accessPath = join(root, "front.accdb");
  await writeFile(accessPath, "binary", "utf8");

  const registry = new InMemoryAccessOperationRegistry();
  const killed: number[] = [];
  const preflightCleanup = new AccessOperationPreflightCleanupService({
    registry,
    processInspector: {
      getProcess: async (pid) =>
        pid === ACCESS_PID && !killed.includes(pid)
          ? { pid, name: "MSACCESS.EXE", startTime: ACCESS_START, mainWindowHandle: 0 }
          : undefined,
    },
    processKiller: {
      kill: async (pid) => {
        killed.push(pid);
      },
    },
  });
  const service = new VbaSyncAdapter({
    operationRegistry: registry,
    preflightCleanup,
    executor,
    scriptPath: "scripts/dysflow-vba-manager.ps1",
    accessPath,
    destinationRoot: sourceRoot,
    cwd: root,
    env: {},
  });
  return { service, killed, accessPath };
}

/** Mirrors the runner: registers the spawned Access PID in the operation marker. */
async function writeOperationMarker(request: VbaManagerExecutionRequest): Promise<void> {
  if (request.operationFile === undefined) return;
  await mkdir(join(request.operationFile, ".."), { recursive: true });
  await writeFile(
    request.operationFile,
    JSON.stringify({
      operationId: request.operationId,
      accessPid: ACCESS_PID,
      processStartTime: ACCESS_START,
    }),
    "utf8",
  );
}

function timingOutExecutor(seen: VbaManagerExecutionRequest[]): VbaManagerExecutor {
  return async (request) => {
    seen.push(request);
    await writeOperationMarker(request);
    return {
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: request.timeoutMs,
      timedOut: true,
    };
  };
}

describe("import plan classification runs as a bounded, tracked Access operation (#1908)", () => {
  it.each(["import_all", "import_modules"] as const)(
    "%s dry run keeps the classification export well inside the caller's budget",
    async (toolName) => {
      const seen: VbaManagerExecutionRequest[] = [];
      const { service } = await setup(timingOutExecutor(seen));
      const budgetMs = 60_000;

      const result = await service.execute(toolName, {
        dryRun: true,
        timeoutMs: budgetMs,
        ...(toolName === "import_modules" ? { moduleNames: ["Calculo"] } : {}),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected plan success");
      const plan = result.data as { moduleClassifications?: unknown; warnings: string[] };
      expect(plan.moduleClassifications).toBeUndefined();
      expect(plan.warnings.some((w) => w.includes("Module classification unavailable"))).toBe(true);
      const exports = seen.filter((request) => request.action === "Export");
      expect(exports).toHaveLength(1);
      // dysflow keeps at least 10 s of the budget for its own reap + snapshot cleanup.
      expect(exports[0]?.timeoutMs).toBeLessThanOrEqual(budgetMs - 10_000);
    },
  );

  it("derives the bound from the project timeout when the call passes none", async () => {
    const seen: VbaManagerExecutionRequest[] = [];
    const { service } = await setup(timingOutExecutor(seen));

    const result = await service.execute("import_all", { dryRun: true });

    expect(result.ok).toBe(true);
    const exportRequest = seen.find((request) => request.action === "Export");
    // Default project budget is 30 s; the same 10 s reserve applies.
    expect(exportRequest?.timeoutMs).toBeLessThanOrEqual(30_000 - 10_000);
  });

  it("lists the export as a tracked operation while it runs and reaps its Access PID on timeout", async () => {
    const listedDuringRun: AccessOperationRecord[][] = [];
    const { service, killed, accessPath } = await setup(async (request) => {
      await writeOperationMarker(request);
      listedDuringRun.push(await listOperations(service));
      return {
        exitCode: null,
        stdout: "",
        stderr: "",
        durationMs: request.timeoutMs,
        timedOut: true,
      };
    });

    const result = await service.execute("import_all", { dryRun: true, timeoutMs: 60_000 });

    expect(result.ok).toBe(true);
    expect(listedDuringRun).toHaveLength(1);
    const [operation, ...others] = listedDuringRun[0] ?? [];
    expect(others).toEqual([]);
    expect(operation?.metadata).toEqual(expect.objectContaining({ managerAction: "Export" }));
    // The Access holds the disposable snapshot, never the committed binary.
    expect(operation?.accessPath).not.toBe(accessPath);
    expect(killed).toEqual([ACCESS_PID]);
    // The reaped operation is retired, so nothing is left for a later cleanup.
    expect(await listOperations(service)).toEqual([]);
  });

  it("does not reap anything when the classification export succeeds", async () => {
    const listedDuringRun: AccessOperationRecord[][] = [];
    const { service, killed } = await setup(async (request) => {
      await writeOperationMarker(request);
      listedDuringRun.push(await listOperations(service));
      await mkdir(join(request.destinationRoot, "modules"), { recursive: true });
      await writeFile(join(request.destinationRoot, "modules", "Calculo.bas"), SOURCE, "utf8");
      return { exitCode: 0, stdout: "", stderr: "", durationMs: 2, timedOut: false };
    });

    const result = await service.execute("import_all", { dryRun: true });

    if (!result.ok) throw new Error("expected plan success");
    expect((result.data as { moduleClassifications?: unknown }).moduleClassifications).toEqual([
      expect.objectContaining({ module: "Calculo", classification: "matched" }),
    ]);
    expect(listedDuringRun.map((operations) => operations.length)).toEqual([1]);
    expect(killed).toEqual([]);
    expect(await listOperations(service)).toEqual([]);
  });
});
