import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { OsProcessInfo } from "../../../src/core/operations/access-operation-cleanup.js";
import {
  AccessOperationPreflightCleanupService,
  reapOrphanedAccessOnTimeout,
} from "../../../src/core/operations/access-operation-preflight.js";
import {
  type AccessOperationRecord,
  InMemoryAccessOperationRegistry,
} from "../../../src/core/operations/access-operation-registry.js";

const baseRecord: AccessOperationRecord = {
  operationId: "op-stale",
  action: "run",
  accessPath: "C:/data/app.accdb",
  projectRootAbs: "C:/repo/app",
  destinationRootAbs: "C:/repo/app/src",
  accessPid: 1234,
  processStartTime: "2026-05-15T10:00:00.000Z",
  commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
  status: "timed_out",
  metadata: {},
  updatedAt: "2026-05-15T10:01:00.000Z",
};

describe("AccessOperationPreflightCleanupService", () => {
  it("marks matching stale operations with a dead pid as cleaned without killing", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(baseRecord);
    const killed: number[] = [];
    const service = new AccessOperationPreflightCleanupService({
      registry,
      processInspector: { getProcess: async () => undefined },
      processKiller: {
        kill: async (pid) => {
          killed.push(pid);
        },
      },
      clock: () => "2026-05-15T10:02:00.000Z",
    });

    const result = await service.cleanup({
      accessPath: "C:/DATA/app.accdb",
      projectRoot: "C:/repo/app",
    });

    expect(result).toEqual({
      cleaned: ["op-stale"],
      killed: [],
      orphanedKilled: [],
      errors: [],
      transitioned: [],
    });
    expect(killed).toEqual([]);
    // cleaned records are purged from InMemory registry (parity with FileRegistry)
    await expect(registry.get("op-stale")).resolves.toBeUndefined();
  });

  it("refuses to mark stale operations without a pid as cleaned when processes cannot be scanned", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({ ...baseRecord, accessPid: null, processStartTime: null });
    const service = new AccessOperationPreflightCleanupService({
      registry,
      processInspector: {
        getProcess: async () => {
          throw new Error("should not inspect");
        },
      },
      processKiller: {
        kill: async () => {
          throw new Error("should not kill");
        },
      },
      clock: () => "2026-05-15T10:02:00.000Z",
    });

    await expect(
      service.cleanup({ accessPath: "C:/data/app.accdb", projectRoot: "C:/repo/app" }),
    ).resolves.toEqual({
      cleaned: [],
      killed: [],
      orphanedKilled: [],
      errors: [
        {
          operationId: "op-stale",
          message:
            "Refused to mark operation cleaned because it has no owned Access PID and processes cannot be scanned.",
        },
      ],
      transitioned: [],
    });
    await expect(registry.get("op-stale")).resolves.toMatchObject({ status: "timed_out" });
  });

  it("kills the registered live pid before marking the operation cleaned", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(baseRecord);
    const killed: number[] = [];
    const liveProcess: OsProcessInfo = {
      pid: 1234,
      name: "MSACCESS.EXE",
      startTime: "2026-05-15T10:00:00.000Z",
      commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
    };
    const service = new AccessOperationPreflightCleanupService({
      registry,
      processInspector: { getProcess: async () => liveProcess },
      processKiller: {
        kill: async (pid) => {
          killed.push(pid);
        },
      },
      clock: () => "2026-05-15T10:02:00.000Z",
    });

    const result = await service.cleanup({
      accessPath: "C:/data/app.accdb",
      projectRoot: "C:/repo/app",
    });

    expect(result).toEqual({
      cleaned: ["op-stale"],
      killed: [1234],
      orphanedKilled: [],
      errors: [],
      transitioned: [],
    });
    expect(killed).toEqual([1234]);
    // cleaned records are purged from InMemory registry (parity with FileRegistry)
    await expect(registry.get("op-stale")).resolves.toBeUndefined();
  });

  it("ignores records with a different accessPath", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(baseRecord);
    const service = new AccessOperationPreflightCleanupService({
      registry,
      processInspector: {
        getProcess: async () => {
          throw new Error("should not inspect");
        },
      },
      processKiller: {
        kill: async () => {
          throw new Error("should not kill");
        },
      },
    });

    await expect(
      service.cleanup({ accessPath: "C:/other.accdb", projectRoot: "C:/repo/app" }),
    ).resolves.toEqual({
      cleaned: [],
      killed: [],
      orphanedKilled: [],
      errors: [],
      transitioned: [],
    });
    await expect(registry.get("op-stale")).resolves.toMatchObject({ status: "timed_out" });
  });

  it("ignores statuses that are not eligible for preflight cleanup (e.g. starting)", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({ ...baseRecord, status: "starting" });
    const service = new AccessOperationPreflightCleanupService({
      registry,
      processInspector: {
        getProcess: async () => {
          throw new Error("should not inspect");
        },
      },
      processKiller: {
        kill: async () => {
          throw new Error("should not kill");
        },
      },
    });

    await expect(
      service.cleanup({ accessPath: "C:/data/app.accdb", projectRoot: "C:/repo/app" }),
    ).resolves.toEqual({
      cleaned: [],
      killed: [],
      orphanedKilled: [],
      errors: [],
      transitioned: [],
    });
    await expect(registry.get("op-stale")).resolves.toMatchObject({ status: "starting" });
  });

  it("ignores records outside the current projectRoot scope", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(baseRecord);
    const service = new AccessOperationPreflightCleanupService({
      registry,
      processInspector: {
        getProcess: async () => {
          throw new Error("should not inspect");
        },
      },
      processKiller: {
        kill: async () => {
          throw new Error("should not kill");
        },
      },
    });

    await expect(
      service.cleanup({ accessPath: "C:/data/app.accdb", projectRoot: "C:/repo/other" }),
    ).resolves.toEqual({
      cleaned: [],
      killed: [],
      orphanedKilled: [],
      errors: [],
      transitioned: [],
    });
    await expect(registry.get("op-stale")).resolves.toMatchObject({ status: "timed_out" });
  });

  it("records inspector failures without throwing or aborting cleanup", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(baseRecord);
    const service = new AccessOperationPreflightCleanupService({
      registry,
      processInspector: {
        getProcess: async () => {
          throw new Error("cim unavailable");
        },
      },
      processKiller: {
        kill: async () => {
          throw new Error("should not kill");
        },
      },
    });

    const result = await service.cleanup({
      accessPath: "C:/data/app.accdb",
      projectRoot: "C:/repo/app",
    });

    expect(result.cleaned).toEqual([]);
    expect(result.killed).toEqual([]);
    expect(result.orphanedKilled).toEqual([]);
    expect(result.errors).toEqual([
      {
        operationId: "op-stale",
        message: "Failed to inspect process 1234: cim unavailable",
      },
    ]);
    await expect(registry.get("op-stale")).resolves.toMatchObject({ status: "timed_out" });
  });

  it("does not block cleanup when process inspection hangs", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(baseRecord);
    const service = new AccessOperationPreflightCleanupService({
      registry,
      processInspector: {
        getProcess: async () => new Promise<OsProcessInfo | undefined>(() => undefined),
      },
      processKiller: {
        kill: async () => {
          throw new Error("should not kill");
        },
      },
      operationTimeoutMs: 10,
    });

    const result = await service.cleanup({
      accessPath: "C:/data/app.accdb",
      projectRoot: "C:/repo/app",
    });

    expect(result.cleaned).toEqual([]);
    expect(result.killed).toEqual([]);
    expect(result.orphanedKilled).toEqual([]);
    expect(result.errors).toEqual([
      {
        operationId: "op-stale",
        message: "Failed to inspect process 1234: operation timed out after 10ms",
      },
    ]);
  });

  describe("orphan MSACCESS process scanning", () => {
    it("does not block cleanup when orphan process scanning hangs", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => undefined },
        processKiller: {
          kill: async () => {
            throw new Error("should not kill");
          },
        },
        processScanner: {
          listProcesses: async () => new Promise<OsProcessInfo[]>(() => undefined),
        },
        operationTimeoutMs: 10,
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.cleaned).toEqual([]);
      expect(result.killed).toEqual([]);
      expect(result.orphanedKilled).toEqual([]);
      expect(result.errors).toEqual([
        {
          operationId: "orphan_scanner",
          message: "Failed to enumerate processes: operation timed out after 10ms",
        },
      ]);
    });

    it("reports and blocks an unattributed orphan MSACCESS with commandLine containing the same accessPath", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create(baseRecord);
      const killed: number[] = [];
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => undefined },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        processScanner: {
          listProcesses: async () => [
            {
              pid: 9999,
              name: "MSACCESS.EXE",
              startTime: "2026-05-15T12:00:00.000Z",
              commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
            },
          ],
        },
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.orphanedKilled).toEqual([]);
      expect(result.errors).toContainEqual({
        operationId: "orphan",
        message:
          "Blocked cleanup because PID 9999 is an unattributed MSACCESS process for the requested accessPath.",
      });
      expect(killed).toEqual([]);
    });

    it("does NOT kill an orphan MSACCESS for a different accessPath", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create({
        ...baseRecord,
        operationId: "op-other",
        accessPath: "C:/other/app.accdb",
      });
      const killed: number[] = [];
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => undefined },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        processScanner: {
          listProcesses: async () => [
            {
              pid: 9999,
              name: "MSACCESS.EXE",
              startTime: "2026-05-15T12:00:00.000Z",
              commandLine: 'MSACCESS.EXE "C:/other/app.accdb"',
            },
          ],
        },
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.orphanedKilled).toEqual([]);
      expect(killed).toEqual([]);
    });

    it("does NOT kill an MSACCESS process with missing commandLine", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      const killed: number[] = [];
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => undefined },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        processScanner: {
          listProcesses: async () => [
            {
              pid: 9999,
              name: "MSACCESS.EXE",
              startTime: "2026-05-15T12:00:00.000Z",
              commandLine: undefined,
            },
          ],
        },
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.orphanedKilled).toEqual([]);
      expect(killed).toEqual([]);
    });

    it("does NOT kill a non-MSACCESS process even if commandLine matches", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      const killed: number[] = [];
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => undefined },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        processScanner: {
          listProcesses: async () => [
            {
              pid: 9999,
              name: "EXCEL.EXE",
              startTime: "2026-05-15T12:00:00.000Z",
              commandLine: 'EXCEL.EXE "C:/data/app.accdb"',
            },
          ],
        },
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.orphanedKilled).toEqual([]);
      expect(killed).toEqual([]);
    });

    it("does NOT double-kill a process already handled by a registry record", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create({ ...baseRecord, accessPid: 9999, status: "timed_out" });
      const killed: number[] = [];
      const liveProcess: OsProcessInfo = {
        pid: 9999,
        name: "MSACCESS.EXE",
        startTime: "2026-05-15T10:00:00.000Z",
        commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
      };
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => liveProcess },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        processScanner: {
          listProcesses: async () => [
            {
              pid: 9999,
              name: "MSACCESS.EXE",
              startTime: "2026-05-15T10:00:00.000Z",
              commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
            },
          ],
        },
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.killed).toEqual([9999]);
      expect(result.orphanedKilled).toEqual([]);
      expect(killed).toEqual([9999]);
    });

    it("treats enumeration failure as a warning and does not throw", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create({
        ...baseRecord,
        operationId: "op-scanner-err",
        accessPid: null,
        processStartTime: null,
      });
      const killed: number[] = [];
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => undefined },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        processScanner: {
          listProcesses: async () => {
            throw new Error("WMI query failed");
          },
        },
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.cleaned).toEqual([]);
      expect(result.orphanedKilled).toEqual([]);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          operationId: "op-scanner-err",
          message: expect.stringContaining("WMI query failed"),
        }),
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          operationId: "orphan_scanner",
          message: expect.stringContaining("WMI query failed"),
        }),
      );
      expect(killed).toEqual([]);
    });

    it("reports and blocks MSACCESS for same path in different casing (case-insensitive match)", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      const killed: number[] = [];
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => undefined },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        processScanner: {
          listProcesses: async () => [
            {
              pid: 9999,
              name: "MSACCESS.EXE",
              startTime: "2026-05-15T12:00:00.000Z",
              commandLine: 'MSACCESS.EXE "C:/DATA/APP.ACCDB"',
            },
          ],
        },
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.orphanedKilled).toEqual([]);
      expect(result.errors).toContainEqual({
        operationId: "orphan",
        message:
          "Blocked cleanup because PID 9999 is an unattributed MSACCESS process for the requested accessPath.",
      });
      expect(killed).toEqual([]);
    });

    it("does not kill MSACCESS for path that is a substring match (e.g. .accdb.bak)", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      const killed: number[] = [];
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => undefined },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        processScanner: {
          listProcesses: async () => [
            {
              pid: 9999,
              name: "MSACCESS.EXE",
              startTime: "2026-05-15T12:00:00.000Z",
              commandLine: 'MSACCESS.EXE "C:/data/app.accdb.bak"',
            },
          ],
        },
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.orphanedKilled).toEqual([]);
      expect(killed).toEqual([]);
    });

    it("reports and blocks MSACCESS when commandLine has path as unquoted token", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      const killed: number[] = [];
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => undefined },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        processScanner: {
          listProcesses: async () => [
            {
              pid: 9999,
              name: "MSACCESS.EXE",
              startTime: "2026-05-15T12:00:00.000Z",
              commandLine: "MSACCESS.EXE C:/data/app.accdb",
            },
          ],
        },
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.orphanedKilled).toEqual([]);
      expect(result.errors).toContainEqual({
        operationId: "orphan",
        message:
          "Blocked cleanup because PID 9999 is an unattributed MSACCESS process for the requested accessPath.",
      });
      expect(killed).toEqual([]);
    });
  });

  describe("scanAndCleanOrphans — explicit scanner parameter (no non-null assertion)", () => {
    it("does NOT use non-null assertion on processScanner in scanAndCleanOrphans", () => {
      const source = readFileSync("src/core/operations/access-operation-preflight.ts", "utf8");
      // The method should not have processScanner! (non-null assertion)
      expect(source).not.toContain("this.options.processScanner!");
    });

    it("scanAndCleanOrphans accepts an explicit ProcessScanner parameter and reports unattributed orphans", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      const killed: number[] = [];
      const scanner = {
        listProcesses: async (): Promise<OsProcessInfo[]> => [
          {
            pid: 5555,
            name: "MSACCESS.EXE",
            startTime: "2026-05-15T12:00:00.000Z",
            commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
          },
        ],
      };
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => undefined },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        processScanner: scanner,
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.orphanedKilled).toEqual([]);
      expect(result.errors).toContainEqual({
        operationId: "orphan",
        message:
          "Blocked cleanup because PID 5555 is an unattributed MSACCESS process for the requested accessPath.",
      });
      expect(killed).toEqual([]);
    });

    it("scanAndCleanOrphans terminates a headless process with -Embedding and adds to orphanedKilled", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      const killed: number[] = [];
      const scanner = {
        listProcesses: async (): Promise<OsProcessInfo[]> => [
          {
            pid: 5555,
            name: "MSACCESS.EXE",
            startTime: "2026-05-15T12:00:00.000Z",
            commandLine: 'MSACCESS.EXE "C:/data/app.accdb" -Embedding',
          },
        ],
      };
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => undefined },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        processScanner: scanner,
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.orphanedKilled).toEqual([5555]);
      expect(result.errors).toEqual([]);
      expect(killed).toEqual([5555]);
    });

    it("retireUnownedRecord terminates a headless process with -Embedding, kills it and marks record cleaned", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create({
        ...baseRecord,
        operationId: "op-unowned",
        accessPid: null,
        processStartTime: null,
      });
      const killed: number[] = [];
      const scanner = {
        listProcesses: async (): Promise<OsProcessInfo[]> => [
          {
            pid: 6666,
            name: "MSACCESS.EXE",
            startTime: "2026-05-15T12:00:00.000Z",
            commandLine: 'MSACCESS.EXE "C:/data/app.accdb" -Embedding',
          },
        ],
      };
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => undefined },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        processScanner: scanner,
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.cleaned).toContain("op-unowned");
      expect(result.killed).toEqual([6666]);
      expect(result.errors).toEqual([]);
      expect(killed).toEqual([6666]);
    });
  });

  describe("dead-PID reconciliation for running records", () => {
    it("marks a running record cleaned when its PID is gone (not in killed)", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create({ ...baseRecord, status: "running" });
      const killed: number[] = [];
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => undefined },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.cleaned).toContain("op-stale");
      expect(result.killed).not.toContain(1234);
      expect(killed).toEqual([]);
    });

    it("leaves a running record untouched when its process is alive, MSACCESS.EXE, and startTime matches", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create({ ...baseRecord, status: "running" });
      const killed: number[] = [];
      const liveProcess: OsProcessInfo = {
        pid: 1234,
        name: "MSACCESS.EXE",
        startTime: "2026-05-15T10:00:00.000Z",
        commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
      };
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => liveProcess },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.cleaned).not.toContain("op-stale");
      expect(result.killed).not.toContain(1234);
      expect(killed).toEqual([]);
      await expect(registry.get("op-stale")).resolves.toMatchObject({ status: "running" });
    });

    it("leaves a running record untouched when startTime differs only in sub-second precision (same process)", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create({ ...baseRecord, status: "running" });
      const killed: number[] = [];
      // Inspector returns 7-digit PS format; registry stored 3-digit TS format
      const liveProcess: OsProcessInfo = {
        pid: 1234,
        name: "MSACCESS.EXE",
        startTime: "2026-05-15T10:00:00.0000000Z",
        commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
      };
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => liveProcess },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.cleaned).not.toContain("op-stale");
      expect(result.killed).not.toContain(1234);
      expect(killed).toEqual([]);
      await expect(registry.get("op-stale")).resolves.toMatchObject({ status: "running" });
    });

    it("does NOT block cleanup or treat as orphan when running record's process is alive and scanner lists it", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create({ ...baseRecord, status: "running" });
      const killed: number[] = [];
      const liveProcess: OsProcessInfo = {
        pid: 1234,
        name: "MSACCESS.EXE",
        startTime: "2026-05-15T10:00:00.000Z",
        commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
      };
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => liveProcess },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        processScanner: {
          listProcesses: async () => [liveProcess],
        },
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.errors).toEqual([]);
      expect(result.orphanedKilled).toEqual([]);
      expect(killed).toEqual([]);
    });
  });

  describe("tolerant start-time comparison for stale records", () => {
    it("kills the registered pid when inspected startTime differs only in fractional digits", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create(baseRecord); // processStartTime: "2026-05-15T10:00:00.000Z"
      const killed: number[] = [];
      const liveProcess: OsProcessInfo = {
        pid: 1234,
        name: "MSACCESS.EXE",
        // 7-digit PS format — same second, different sub-second precision
        startTime: "2026-05-15T10:00:00.0000000Z",
        commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
      };
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => liveProcess },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.killed).toContain(1234);
      expect(result.errors).toEqual([]);
      expect(killed).toEqual([1234]);
    });

    it("refuses to kill when startTime differs by a full second (genuine PID reuse)", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create(baseRecord); // processStartTime: "2026-05-15T10:00:00.000Z"
      const killed: number[] = [];
      const reusedPidProcess: OsProcessInfo = {
        pid: 1234,
        name: "MSACCESS.EXE",
        startTime: "2026-05-15T10:00:01.000Z", // 1 second later → different process
        commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
      };
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => reusedPidProcess },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.killed).not.toContain(1234);
      expect(killed).toEqual([]);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining("processStartTime differs"),
        }),
      );
    });
  });
});

describe("reapOrphanedAccessOnTimeout", () => {
  it("returns the cleanup diagnostics on success", async () => {
    const diagnostics = await reapOrphanedAccessOnTimeout(async () => ({
      cleaned: [],
      killed: [],
      orphanedKilled: [],
      errors: [{ operationId: "op-x", message: "could not kill 42" }],
    }));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("op-x: could not kill 42");
  });

  it("degrades to a warning diagnostic instead of throwing when cleanup fails", async () => {
    // A timeout is already a failure path: a throwing cleanup must NOT mask the
    // original timeout. The helper swallows it into a warning diagnostic.
    const diagnostics = await reapOrphanedAccessOnTimeout(async () => {
      throw new Error("registry unavailable");
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.level).toBe("warning");
    expect(diagnostics[0]?.message).toContain("orphan cleanup after timeout failed");
    expect(diagnostics[0]?.message).toContain("registry unavailable");
  });
});
