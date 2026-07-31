import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";
import type {
  OsProcessInfo,
  ProcessInspector,
  ProcessKiller,
  ProcessScanner,
} from "../../../src/core/operations/access-operation-cleanup.js";
import { createInMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry.js";
import { AccessOrphanCleanupService } from "../../../src/core/operations/access-orphan-cleanup.js";

const ACCESS_PATH = "C:\\bench\\app.accdb";
const PROJECT_ROOT = "C:\\bench";
const NOW = new Date("2026-07-31T12:00:00.000Z");

function makeOrphan(pid: number): OsProcessInfo {
  return {
    pid,
    name: "MSACCESS.EXE",
    startTime: "2026-07-31T11:50:00.000Z",
    commandLine: `"C:\\Program Files\\Microsoft Office\\root\\Office16\\MSACCESS.EXE" -Embedding`,
    mainWindowHandle: 0,
  };
}

function makeServices(processes: OsProcessInfo[]) {
  const killed: number[] = [];
  const scanner: ProcessScanner = { listProcesses: async () => processes };
  const inspector: ProcessInspector = {
    getProcess: async (pid) => processes.find((process) => process.pid === pid),
  };
  const killer: ProcessKiller = {
    kill: async (pid) => {
      killed.push(pid);
    },
  };
  const orphanCleanupService = new AccessOrphanCleanupService({
    registry: createInMemoryAccessOperationRegistry(),
    processScanner: scanner,
    processInspector: inspector,
    processKiller: killer,
    clock: () => NOW,
  });
  return { orphanCleanupService, killed };
}

describe("orphan cleanup tools enumerate all orphans", () => {
  it("returns every unowned headless MSACCESS COM orphan with totalCount and age", async () => {
    const processes = [makeOrphan(20_824), makeOrphan(31_444)];
    const { orphanCleanupService } = makeServices(processes);
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
        queryService: { execute: async () => successResult({ rows: [] }) },
        diagnosticsService: { run: async () => successResult({ checks: [] }) },
        orphanCleanupService,
      },
      accessContextResolver: async () =>
        successResult({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT }),
    });
    const tool = tools.find((candidate) => candidate.name === "access_force_cleanup_orphaned");

    const result = await tool?.handler({ pid: null });
    expect(result?.isError).toBe(false);
    const payload = JSON.parse(result?.content[0]?.text ?? "{}") as {
      orphans: Array<{ pid: number; ageSeconds: number }>;
      totalCount: number;
    };
    expect(payload.orphans).toHaveLength(2);
    expect(payload.totalCount).toBe(2);
    expect(payload.orphans.map((orphan) => orphan.pid)).toEqual([20_824, 31_444]);
    expect(payload.orphans.every((orphan) => orphan.ageSeconds === 600)).toBe(true);
  });

  it("requires typed confirmation and cleans only the explicitly selected orphan PID", async () => {
    const processes = [makeOrphan(20_824), makeOrphan(31_444)];
    const { orphanCleanupService, killed } = makeServices(processes);
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
        queryService: { execute: async () => successResult({ rows: [] }) },
        diagnosticsService: { run: async () => successResult({ checks: [] }) },
        orphanCleanupService,
      },
      writes: true,
      accessContextResolver: async () =>
        successResult({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT }),
    });
    const tool = tools.find((candidate) => candidate.name === "access_force_cleanup_orphaned");
    expect(tool).toBeDefined();

    const refused = await tool?.handler({ pid: 20_824 });
    expect(refused?.isError).toBe(true);
    expect(refused?.content[0]?.text).toContain("CONFIRMATION_REQUIRED");
    expect(killed).toEqual([]);

    const cleaned = await tool?.handler({
      pid: 20_824,
      confirmedRequiresConfirmation: true,
    });
    expect(cleaned?.isError).toBe(false);
    expect(killed).toEqual([20_824]);
  });
});
