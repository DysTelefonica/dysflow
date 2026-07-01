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
      // F1 (#620): contract — unattributed orphan is refused, refusal names the PID.
      expect(result.errors.some((e) => e.operationId === "orphan" && /PID 9999/.test(e.message))).toBe(
        true,
      );
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
      // F1 (#620): contract — case-insensitive match also refuses, names PID.
      expect(result.errors.some((e) => e.operationId === "orphan" && /PID 9999/.test(e.message))).toBe(
        true,
      );
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
      // F1 (#620): contract — unquoted-token path also refuses, names PID.
      expect(result.errors.some((e) => e.operationId === "orphan" && /PID 9999/.test(e.message))).toBe(
        true,
      );
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
      // F1 (#620): contract — explicit scanner path also refuses, names PID.
      expect(result.errors.some((e) => e.operationId === "orphan" && /PID 5555/.test(e.message))).toBe(
        true,
      );
      expect(killed).toEqual([]);
    });

    // F1 (#620): FLIP — substring + undefined window handle must refuse, not kill.
    it("scanAndCleanOrphans: with -Embedding but mainWindowHandle undefined → refuses", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      const killed: number[] = [];
      const scanner = {
        listProcesses: async (): Promise<OsProcessInfo[]> => [
          {
            pid: 5555,
            name: "MSACCESS.EXE",
            startTime: "2026-05-15T12:00:00.000Z",
            commandLine: 'MSACCESS.EXE "C:/data/app.accdb" -Embedding',
            // mainWindowHandle is intentionally omitted → undefined (Get-Process fallback).
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
      // Refusal diagnostic carries mainWindowHandle-related language so operators can audit.
      expect(result.errors).not.toEqual([]);
      expect(result.errors.some((e) => /mainWindowHandle/i.test(e.message))).toBe(true);
      expect(killed).toEqual([]);
    });

    // F1 (#620): FLIP — mirror in retireUnownedRecord.
    it("retireUnownedRecord: with -Embedding but mainWindowHandle undefined → refuses", async () => {
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
            // mainWindowHandle is intentionally omitted → undefined (Get-Process fallback).
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

      expect(result.cleaned).not.toContain("op-unowned");
      expect(result.killed).toEqual([]);
      expect(result.errors.some((e) => /mainWindowHandle/i.test(e.message))).toBe(true);
      expect(killed).toEqual([]);
    });

    // F1 (#620): undefined mainWindowHandle = refusal (treat as "unknown").
    it("scanAndCleanOrphans refuses when mainWindowHandle is undefined even if commandLine matches (#620)", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      const killed: number[] = [];
      const scanner = {
        listProcesses: async (): Promise<OsProcessInfo[]> => [
          {
            pid: 5555,
            name: "MSACCESS.EXE",
            startTime: "2026-05-15T12:00:00.000Z",
            commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
            mainWindowHandle: undefined,
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
      expect(killed).toEqual([]);
      expect(result.errors).not.toEqual([]);
      expect(result.errors[0]?.message).toMatch(/mainWindowHandle/i);
    });

    // F1 (#620): visible window = refusal. Substring is not a kill signal.
    it("scanAndCleanOrphans refuses when mainWindowHandle is non-zero even if commandLine contains -embedding (#620)", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      const killed: number[] = [];
      const scanner = {
        listProcesses: async (): Promise<OsProcessInfo[]> => [
          {
            pid: 5555,
            name: "MSACCESS.EXE",
            startTime: "2026-05-15T12:00:00.000Z",
            commandLine: 'MSACCESS.EXE "C:/data/app.accdb" -Embedding',
            mainWindowHandle: 0xbeef,
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
      expect(killed).toEqual([]);
      expect(result.errors).not.toEqual([]);
      // Refusal message must surface the window-handle reason so an operator can audit.
      expect(result.errors[0]?.message).toMatch(/mainWindowHandle/i);
      // Substring is explicitly NOT the signal — message must mention the visible window.
      expect(result.errors[0]?.message).toMatch(/0xBEEF|visible|not headless/i);
    });

    // F1 (#620): regression guard — real headless is still killed when path has -embedding.
    it("scanAndCleanOrphans kills when mainWindowHandle === 0 and accessPath contains -embedding (#620)", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      const killed: number[] = [];
      const liveProcess: OsProcessInfo = {
        pid: 5555,
        name: "MSACCESS.EXE",
        startTime: "2026-05-15T12:00:00.000Z",
        commandLine: 'MSACCESS.EXE "C:/data/my-embedding-app.accdb"',
        mainWindowHandle: 0,
      };
      const scanner = {
        listProcesses: async (): Promise<OsProcessInfo[]> => [liveProcess],
      };
      // F3a (#620): revalidation must see the same process the scanner listed —
      // otherwise F3a's gone/mismatch gates would (correctly) suppress the kill.
      // This regression guard pins "real headless + still alive" → kill proceeds.
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => liveProcess },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        processScanner: scanner,
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/my-embedding-app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.orphanedKilled).toEqual([5555]);
      expect(killed).toEqual([5555]);
      expect(result.errors).toEqual([]);
    });

    // F1 (#620): undefined mainWindowHandle mirror in retireUnownedRecord.
    it("retireUnownedRecord refuses when mainWindowHandle is undefined even if commandLine matches (#620)", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create({
        ...baseRecord,
        operationId: "op-unowned-undef",
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
            commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
            mainWindowHandle: undefined,
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

      expect(result.killed).toEqual([]);
      expect(killed).toEqual([]);
      // Without a matching live PID, retireUnownedRecord would normally call markCleaned.
      // Refusal here must therefore block the "cleaned" transition as well.
      expect(result.cleaned).not.toContain("op-unowned-undef");
      expect(result.errors).not.toEqual([]);
      expect(result.errors[0]?.message).toMatch(/mainWindowHandle/i);
    });

    // F1 (#620): visible window mirror in retireUnownedRecord.
    it("retireUnownedRecord refuses when mainWindowHandle is non-zero even if commandLine contains -embedding (#620)", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create({
        ...baseRecord,
        operationId: "op-unowned-visible",
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
            mainWindowHandle: 0x1234,
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

      expect(result.killed).toEqual([]);
      expect(killed).toEqual([]);
      expect(result.cleaned).not.toContain("op-unowned-visible");
      expect(result.errors[0]?.message).toMatch(/mainWindowHandle/i);
      expect(result.errors[0]?.message).toMatch(/0x1234|visible|not headless/i);
    });

    // F1 (#620): regression guard — headless killed even when path has -embedding.
    it("retireUnownedRecord kills when mainWindowHandle === 0 and accessPath contains -embedding (#620)", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create({
        ...baseRecord,
        operationId: "op-unowned-path-emb",
        accessPath: "C:/data/my-embedding-app.accdb",
        accessPid: null,
        processStartTime: null,
      });
      const killed: number[] = [];
      const liveProcess: OsProcessInfo = {
        pid: 6666,
        name: "MSACCESS.EXE",
        startTime: "2026-05-15T12:00:00.000Z",
        commandLine: 'MSACCESS.EXE "C:/data/my-embedding-app.accdb"',
        mainWindowHandle: 0,
      };
      const scanner = {
        listProcesses: async (): Promise<OsProcessInfo[]> => [liveProcess],
      };
      // F3a (#620): mirror of the scanAndCleanOrphans regression guard —
      // revalidation must see the same process the scanner listed.
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => liveProcess },
        processKiller: {
          kill: async (pid) => {
            killed.push(pid);
          },
        },
        processScanner: scanner,
        clock: () => "2026-05-15T10:02:00.000Z",
      });

      const result = await service.cleanup({
        accessPath: "C:/data/my-embedding-app.accdb",
        projectRoot: "C:/repo/app",
      });

      expect(result.killed).toEqual([6666]);
      expect(killed).toEqual([6666]);
      expect(result.cleaned).toContain("op-unowned-path-emb");
      expect(result.errors).toEqual([]);
    });
  });

  // F3a (#620): TOCTOU revalidation gate immediately before kill.
  // Closes the race where a PID is recycled or the process exits between
  // scan and kill. Mirrors the `access-orphan-cleanup.ts:124-141` pattern
  // (revalidate via `processInspector.getProcess(pid)`; refuse on
  // mismatch; suppress on gone).
  describe("orphan-kill TOCTOU revalidation (F3a, #620)", () => {
    const HEADLESS_PROCESS: OsProcessInfo = {
      pid: 5555,
      name: "MSACCESS.EXE",
      startTime: "2026-05-15T12:00:00.000Z",
      commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
      mainWindowHandle: 0,
    };

    it("scanAndCleanOrphans suppresses kill when revalidation returns undefined (#620)", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      const killed: number[] = [];
      const scanner = {
        listProcesses: async (): Promise<OsProcessInfo[]> => [HEADLESS_PROCESS],
      };
      // F3a: process was headless at scan time, but is GONE by the time we
      // revalidate (process exited between scan and kill). Kill must be
      // suppressed, NOT invoked on a recycled PID.
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
      expect(killed).toEqual([]);
      // The diagnostic names the PID so operators can audit which kill was suppressed.
      expect(
        result.errors.some((e) => /PID 5555/.test(e.message) && /no longer exists|gone/i.test(e.message)),
      ).toBe(true);
    });

    it("scanAndCleanOrphans refuses kill with CLEANUP_RACE_PID_REUSED when revalidation shows a different process name (#620)", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      const killed: number[] = [];
      const scanner = {
        listProcesses: async (): Promise<OsProcessInfo[]> => [HEADLESS_PROCESS],
      };
      // F3a: PID was recycled — the scan listed MSACCESS.EXE, but by the
      // time we revalidate, the same PID is owned by notepad.exe. Killing
      // it would kill an unrelated process. Must refuse with the typed
      // CLEANUP_RACE_PID_REUSED code embedded in the diagnostic message.
      const recycledProcess: OsProcessInfo = {
        pid: 5555,
        name: "notepad.exe",
        startTime: "2026-05-15T12:30:00.000Z",
        commandLine: "notepad.exe",
      };
      const service = new AccessOperationPreflightCleanupService({
        registry,
        processInspector: { getProcess: async () => recycledProcess },
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
      expect(killed).toEqual([]);
      expect(
        result.errors.some((e) => /CLEANUP_RACE_PID_REUSED/.test(e.message) && /PID 5555/.test(e.message)),
      ).toBe(true);
    });

    it("retireUnownedRecord suppresses kill when revalidation returns undefined (#620)", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create({
        ...baseRecord,
        operationId: "op-unowned",
        accessPid: null,
        processStartTime: null,
      });
      const killed: number[] = [];
      const scanner = {
        listProcesses: async (): Promise<OsProcessInfo[]> => [HEADLESS_PROCESS],
      };
      // F3a: mirror of the scanAndCleanOrphans suppression in the
      // retireUnownedRecord path. Process is headless at scan time but
      // gone by the time we revalidate.
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

      expect(result.killed).toEqual([]);
      expect(killed).toEqual([]);
      expect(
        result.errors.some((e) => /PID 5555/.test(e.message) && /no longer exists|gone/i.test(e.message)),
      ).toBe(true);
      // The record was NOT marked cleaned because the kill was suppressed;
      // retireUnownedRecord only marks cleaned after a successful kill.
      await expect(registry.get("op-unowned")).resolves.toMatchObject({ status: "timed_out" });
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
