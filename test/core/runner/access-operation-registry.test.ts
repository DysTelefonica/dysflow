import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry.js";
import { AccessOperationCleanupService } from "../../../src/core/operations/access-operation-cleanup.js";

const base = {
  operationId: "op-1",
  action: "run" as const,
  accessPath: "C:/data/app.accdb",
  projectRootAbs: "C:/repo/app",
  destinationRootAbs: "C:/repo/app/out",
  metadata: { procedureName: "Refresh" },
};

describe("Access operation registry and cleanup safety", () => {
  it("keeps AccessOperationAction as a strict union instead of widening to string", () => {
    const source = readFileSync("src/core/operations/access-operation-registry.ts", "utf8");

    expect(source).toContain("export type AccessOperationAction =");
    expect(source).not.toContain("| string");
  });

  it("lists the latest operation including completed records", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({ ...base, operationId: "old", status: "completed", accessPid: 1, processStartTime: "2026-05-15T10:00:00.000Z", updatedAt: "2026-05-15T10:00:00.000Z" });
    await registry.create({ ...base, operationId: "new", status: "timed_out", accessPid: 2, processStartTime: "2026-05-15T11:00:00.000Z", updatedAt: "2026-05-15T11:00:00.000Z" });

    await expect(registry.listRecent({ limit: 1 })).resolves.toMatchObject([{ operationId: "new", status: "timed_out" }]);
  });

  it("kills only the registered PID when every ownership check passes", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({ ...base, status: "timed_out", accessPid: 1234, processStartTime: "2026-05-15T10:00:00.000Z", commandLine: 'MSACCESS.EXE "C:/data/app.accdb"', updatedAt: "2026-05-15T10:00:00.000Z" });
    const killed: number[] = [];
    const service = new AccessOperationCleanupService({
      registry,
      processInspector: { getProcess: async () => ({ pid: 1234, name: "MSACCESS.EXE", startTime: "2026-05-15T10:00:00.000Z", commandLine: 'MSACCESS.EXE "C:/data/app.accdb"' }) },
      processKiller: { kill: async (pid) => { killed.push(pid); } },
    });

    const result = await service.cleanup({ operationId: "op-1", accessPath: "C:/data/app.accdb" });

    expect(result.ok).toBe(true);
    expect(killed).toEqual([1234]);
    await expect(registry.get("op-1")).resolves.toMatchObject({ status: "cleaned" });
  });

  it("accepts cleanup when accessPath differs only by case", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({ ...base, status: "timed_out", accessPid: 1234, processStartTime: "2026-05-15T10:00:00.000Z", commandLine: 'MSACCESS.EXE "C:/DATA/APP.ACCDB"', updatedAt: "2026-05-15T10:00:00.000Z" });
    const killed: number[] = [];
    const service = new AccessOperationCleanupService({
      registry,
      processInspector: { getProcess: async () => ({ pid: 1234, name: "MSACCESS.EXE", startTime: "2026-05-15T10:00:00.000Z", commandLine: 'MSACCESS.EXE "C:/DATA/APP.ACCDB"' }) },
      processKiller: { kill: async (pid) => { killed.push(pid); } },
    });

    const result = await service.cleanup({ operationId: "op-1", accessPath: "c:/DATA/APP.accdb" });

    expect(result.ok).toBe(true);
    expect(killed).toEqual([1234]);
  });

  it("refuses cleanup when accessPath does not match", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({ ...base, status: "timed_out", accessPid: 1234, processStartTime: "2026-05-15T10:00:00.000Z", updatedAt: "2026-05-15T10:00:00.000Z" });
    const service = new AccessOperationCleanupService({ registry, processInspector: { getProcess: async () => undefined }, processKiller: { kill: async () => undefined } });

    const result = await service.cleanup({ operationId: "op-1", accessPath: "C:/other.accdb" });

    expect(result).toMatchObject({ ok: false, error: { code: "CLEANUP_ACCESS_PATH_MISMATCH" } });
  });

  it("refuses cleanup when PID start time differs", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({ ...base, status: "timed_out", accessPid: 1234, processStartTime: "2026-05-15T10:00:00.000Z", updatedAt: "2026-05-15T10:00:00.000Z" });
    const service = new AccessOperationCleanupService({
      registry,
      processInspector: { getProcess: async () => ({ pid: 1234, name: "MSACCESS.EXE", startTime: "2026-05-15T10:05:00.000Z" }) },
      processKiller: { kill: async () => undefined },
    });

    const result = await service.cleanup({ operationId: "op-1", accessPath: "C:/data/app.accdb" });

    expect(result).toMatchObject({ ok: false, error: { code: "CLEANUP_PROCESS_START_TIME_MISMATCH" } });
  });

  it("refuses pid_unknown operations", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({ ...base, status: "pid_unknown", accessPid: null, processStartTime: null, updatedAt: "2026-05-15T10:00:00.000Z" });
    const service = new AccessOperationCleanupService({ registry, processInspector: { getProcess: async () => undefined }, processKiller: { kill: async () => undefined } });

    const result = await service.cleanup({ operationId: "op-1", accessPath: "C:/data/app.accdb" });

    expect(result).toMatchObject({ ok: false, error: { code: "CLEANUP_PID_UNKNOWN" } });
  });
});
