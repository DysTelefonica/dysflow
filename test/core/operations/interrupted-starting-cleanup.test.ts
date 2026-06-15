import { describe, expect, it, vi } from "vitest";
import { AccessOperationCleanupService } from "../../../src/core/operations/access-operation-cleanup.js";
import { AccessOperationPreflightCleanupService } from "../../../src/core/operations/access-operation-preflight.js";
import {
  INTERRUPTED_BEFORE_PID_REASON,
  InMemoryAccessOperationRegistry,
  isInterruptedStartingRecord,
} from "../../../src/core/operations/access-operation-registry.js";

const NOW = Date.parse("2026-06-15T10:10:00.000Z");
const STALE_AT = "2026-06-15T10:00:00.000Z"; // 10 min earlier
const RECENT_AT = "2026-06-15T10:09:50.000Z"; // 10s earlier
const STALE_MS = 120_000;

const base = {
  action: "vba" as const,
  accessPath: "C:/projA/NoConformidades.accdb",
  projectRootAbs: "C:/projA",
  destinationRootAbs: "C:/projA/src",
  metadata: { toolName: "test_vba" },
};

const clockAt = (iso: string) => () => iso;

describe("isInterruptedStartingRecord", () => {
  const startingNullPid = {
    status: "starting" as const,
    accessPid: null,
    processStartTime: null,
    updatedAt: STALE_AT,
  };

  it("is true for a stale starting record with no PID and no start time", () => {
    expect(isInterruptedStartingRecord(startingNullPid, NOW, STALE_MS)).toBe(true);
  });

  it("is false while still within the in-flight grace window", () => {
    expect(
      isInterruptedStartingRecord({ ...startingNullPid, updatedAt: RECENT_AT }, NOW, STALE_MS),
    ).toBe(false);
  });

  it("is false once a PID has been recorded (ownership exists)", () => {
    expect(
      isInterruptedStartingRecord(
        { ...startingNullPid, accessPid: 4321, processStartTime: STALE_AT },
        NOW,
        STALE_MS,
      ),
    ).toBe(false);
  });

  it("is false for any status other than starting", () => {
    expect(
      isInterruptedStartingRecord({ ...startingNullPid, status: "running" }, NOW, STALE_MS),
    ).toBe(false);
    expect(
      isInterruptedStartingRecord({ ...startingNullPid, status: "failed" }, NOW, STALE_MS),
    ).toBe(false);
  });

  it("is false when updatedAt is not parseable", () => {
    expect(
      isInterruptedStartingRecord({ ...startingNullPid, updatedAt: "not-a-date" }, NOW, STALE_MS),
    ).toBe(false);
  });
});

describe("cleanup of interrupted starting operations (point 3 — safe, no force)", () => {
  it("retires a stale starting op WITHOUT force and never calls the killer", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({
      ...base,
      operationId: "op-stale",
      status: "starting",
      accessPid: null,
      processStartTime: null,
      updatedAt: STALE_AT,
    });
    const kill = vi.fn();
    const service = new AccessOperationCleanupService({
      registry,
      processInspector: { getProcess: async () => undefined },
      processKiller: { kill },
      processScanner: { listProcesses: async () => [] },
      clock: clockAt("2026-06-15T10:10:00.000Z"),
      startingStaleMs: STALE_MS,
    });

    const result = await service.cleanup({
      operationId: "op-stale",
      accessPath: "C:/projA/NoConformidades.accdb",
      // no force
    });

    expect(result.ok).toBe(true);
    expect(kill).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.data.status).toBe("cleaned");
      expect(result.diagnostics.some((d) => d.message === INTERRUPTED_BEFORE_PID_REASON)).toBe(
        true,
      );
    }
  });

  it("NEVER kills MSACCESS of another project even when other Access processes are running", async () => {
    // The stale op is for projA. A live MSACCESS for projB (different .accdb) is running.
    // Retiring projA's record must not touch projB's process.
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({
      ...base,
      operationId: "op-stale",
      status: "starting",
      accessPid: null,
      processStartTime: null,
      updatedAt: STALE_AT,
    });
    const kill = vi.fn();
    const service = new AccessOperationCleanupService({
      registry,
      processInspector: { getProcess: async () => undefined },
      processKiller: { kill },
      processScanner: {
        listProcesses: async () => [
          {
            pid: 9999,
            name: "MSACCESS.EXE",
            commandLine: 'MSACCESS.EXE "C:/projB/OtherProject.accdb"',
          },
        ],
      },
      clock: clockAt("2026-06-15T10:10:00.000Z"),
      startingStaleMs: STALE_MS,
    });

    const result = await service.cleanup({
      operationId: "op-stale",
      accessPath: "C:/projA/NoConformidades.accdb",
    });

    expect(result.ok).toBe(true);
    expect(kill).not.toHaveBeenCalled();
  });

  it("refuses (without killing) when a live MSACCESS matches THIS accessPath", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({
      ...base,
      operationId: "op-stale",
      status: "starting",
      accessPid: null,
      processStartTime: null,
      updatedAt: STALE_AT,
    });
    const kill = vi.fn();
    const service = new AccessOperationCleanupService({
      registry,
      processInspector: { getProcess: async () => undefined },
      processKiller: { kill },
      processScanner: {
        listProcesses: async () => [
          {
            pid: 4242,
            name: "MSACCESS.EXE",
            commandLine: 'MSACCESS.EXE "C:/projA/NoConformidades.accdb"',
          },
        ],
      },
      clock: clockAt("2026-06-15T10:10:00.000Z"),
      startingStaleMs: STALE_MS,
    });

    const result = await service.cleanup({
      operationId: "op-stale",
      accessPath: "C:/projA/NoConformidades.accdb",
    });

    expect(result).toMatchObject({ ok: false, error: { code: "CLEANUP_UNOWNED_ACCESS_PROCESS" } });
    expect(kill).not.toHaveBeenCalled();
  });

  it("still refuses a recent (non-stale) starting op without force", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({
      ...base,
      operationId: "op-recent",
      status: "starting",
      accessPid: null,
      processStartTime: null,
      updatedAt: RECENT_AT,
    });
    const kill = vi.fn();
    const service = new AccessOperationCleanupService({
      registry,
      processInspector: { getProcess: async () => undefined },
      processKiller: { kill },
      processScanner: { listProcesses: async () => [] },
      clock: clockAt("2026-06-15T10:10:00.000Z"),
      startingStaleMs: STALE_MS,
    });

    const result = await service.cleanup({
      operationId: "op-recent",
      accessPath: "C:/projA/NoConformidades.accdb",
    });

    expect(result).toMatchObject({ ok: false, error: { code: "CLEANUP_PID_UNKNOWN" } });
    expect(kill).not.toHaveBeenCalled();
  });
});

describe("preflight auto-transition of interrupted starting operations (point 2)", () => {
  it("transitions a stale starting op to failed with a structured reason and never kills", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({
      ...base,
      operationId: "op-stale",
      status: "starting",
      accessPid: null,
      processStartTime: null,
      updatedAt: STALE_AT,
    });
    const kill = vi.fn();
    const service = new AccessOperationPreflightCleanupService({
      registry,
      processInspector: { getProcess: async () => undefined },
      processKiller: { kill },
      clock: clockAt("2026-06-15T10:10:00.000Z"),
      startingStaleMs: STALE_MS,
    });

    const result = await service.cleanup({
      accessPath: "C:/projA/NoConformidades.accdb",
      projectRoot: "C:/projA",
    });

    expect(kill).not.toHaveBeenCalled();
    expect(result.transitioned).toContain("op-stale");
    const record = await registry.get("op-stale");
    expect(record?.status).toBe("failed");
    expect(record?.metadata.interruptedReason).toBe(INTERRUPTED_BEFORE_PID_REASON);
  });

  it("leaves a recent (non-stale) starting op untouched", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({
      ...base,
      operationId: "op-recent",
      status: "starting",
      accessPid: null,
      processStartTime: null,
      updatedAt: RECENT_AT,
    });
    const kill = vi.fn();
    const service = new AccessOperationPreflightCleanupService({
      registry,
      processInspector: { getProcess: async () => undefined },
      processKiller: { kill },
      clock: clockAt("2026-06-15T10:10:00.000Z"),
      startingStaleMs: STALE_MS,
    });

    const result = await service.cleanup({
      accessPath: "C:/projA/NoConformidades.accdb",
      projectRoot: "C:/projA",
    });

    expect(result.transitioned).not.toContain("op-recent");
    const record = await registry.get("op-recent");
    expect(record?.status).toBe("starting");
  });
});
