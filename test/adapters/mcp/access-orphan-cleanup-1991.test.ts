import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";
import type {
  OsProcessInfo,
  ProcessInspector,
  ProcessKiller,
  ProcessScanner,
} from "../../../src/core/operations/access-operation-cleanup.js";
import {
  type AccessOperationRecord,
  createInMemoryAccessOperationRegistry,
} from "../../../src/core/operations/access-operation-registry.js";
import { AccessOrphanCleanupService } from "../../../src/core/operations/access-orphan-cleanup.js";

// Issue #1991 — the listing attributed every headless MSACCESS -Embedding on
// the machine to the caller's accessPath, so the kill guard accepted another
// session's live test run. Three processes:
//   P1 — leftover of a timed_out test_vba of THIS project (the only orphan)
//   P2 — LIVE test_vba of THIS project (its record is active)
//   P3 — LIVE test_vba of another project (no record in this registry)

const ACCESS_PATH = "C:\\projectA\\app.accdb";
const PROJECT_ROOT = "C:\\projectA";
const NOW = new Date("2026-11-05T12:00:00.000Z");
const STARTED = "2026-11-05T11:50:00.000Z";
const P1 = 11_001;
const P2 = 22_002;
const P3 = 33_003;
const CONFIRMATION = {
  implements_check: "orphans_msaccess",
  confirmedRequiresConfirmation: true,
} as const;

function comChild(pid: number): OsProcessInfo {
  return {
    pid,
    name: "MSACCESS.EXE",
    startTime: STARTED,
    commandLine: `"C:\\Program Files\\Microsoft Office\\root\\Office16\\MSACCESS.EXE" -Embedding`,
    mainWindowHandle: 0,
  };
}

function record(
  operationId: string,
  status: AccessOperationRecord["status"],
  accessPid: number | null,
): AccessOperationRecord {
  return {
    operationId,
    action: "vba",
    accessPath: ACCESS_PATH,
    projectRootAbs: PROJECT_ROOT,
    accessPid,
    processStartTime: accessPid === null ? null : STARTED,
    status,
    metadata: { toolName: "test_vba" },
    updatedAt: STARTED,
  };
}

async function scenario(p2Record: AccessOperationRecord) {
  return harness(
    [comChild(P1), comChild(P2), comChild(P3)],
    [record("op-p1-timed-out", "timed_out", P1), p2Record],
  );
}

async function harness(processes: OsProcessInfo[], records: readonly AccessOperationRecord[]) {
  const registry = createInMemoryAccessOperationRegistry();
  for (const entry of records) await registry.create(entry);
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
    registry,
    processScanner: scanner,
    processInspector: inspector,
    processKiller: killer,
    clock: () => NOW,
  });
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
  if (tool === undefined) throw new Error("access_force_cleanup_orphaned is not registered");
  return { tool, killed };
}

type Listing = {
  orphans: Array<{ pid: number; accessPath: string | null }>;
  unattributed?: Array<{ pid: number; accessPath: string | null }>;
  totalCount: number;
};

describe.each([
  ["running with its PID recorded", record("op-p2-live", "running", P2)],
  ["starting before its PID is recorded", record("op-p2-live", "starting", null)],
])("access_force_cleanup_orphaned with a live operation %s (#1991)", (_name, p2Record) => {
  it("lists only the timed_out leftover as an orphan of this project", async () => {
    const { tool, killed } = await scenario(p2Record);

    const result = await tool.handler({ pid: null });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as Listing;
    expect(payload.orphans).toEqual([
      expect.objectContaining({ pid: P1, accessPath: ACCESS_PATH }),
    ]);
    expect(payload.totalCount).toBe(1);
    // Every process the runtime cannot tie to a database is reported with an
    // unknown accessPath, never with the caller's project path.
    for (const entry of payload.unattributed ?? []) {
      expect(entry.accessPath).toBeNull();
      expect(entry.pid).not.toBe(P1);
    }
    if (p2Record.accessPid === P2) {
      expect((payload.unattributed ?? []).map((entry) => entry.pid)).toEqual([P3]);
    }
    expect(killed).toEqual([]);
  });

  it("kills the timed_out leftover of this project", async () => {
    const { tool, killed } = await scenario(p2Record);

    const result = await tool.handler({ pid: P1, ...CONFIRMATION });

    expect(result.isError, result.content[0]?.text).toBe(false);
    expect(killed).toEqual([P1]);
  });

  it("refuses the live process of this project and kills nothing", async () => {
    const { tool, killed } = await scenario(p2Record);

    const result = await tool.handler({ pid: P2, ...CONFIRMATION });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(
      p2Record.accessPid === P2
        ? /ORPHAN_CLEANUP_REGISTRY_OWNED/
        : /ORPHAN_CLEANUP_PATH_UNVERIFIED/,
    );
    expect(killed).toEqual([]);
  });

  it("refuses the live process of another project and kills nothing", async () => {
    const { tool, killed } = await scenario(p2Record);

    const result = await tool.handler({ pid: P3, ...CONFIRMATION });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/ORPHAN_CLEANUP_PATH_UNVERIFIED/);
    expect(killed).toEqual([]);
  });
});

describe("access_force_cleanup_orphaned live-operation guard (#1991)", () => {
  it("refuses a PID a live record owns even when the record carries no project root", async () => {
    const live = { ...record("op-p2-live", "running", P2), projectRootAbs: undefined };
    const { tool, killed } = await scenario(live);

    const listing = await tool.handler({ pid: null });
    const payload = JSON.parse(listing.content[0]?.text ?? "{}") as Listing;
    expect(payload.orphans.map((entry) => entry.pid)).toEqual([P1]);
    expect((payload.unattributed ?? []).map((entry) => entry.pid)).toEqual([P3]);

    const result = await tool.handler({ pid: P2, ...CONFIRMATION });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/ORPHAN_CLEANUP_REGISTRY_OWNED/);
    expect(killed).toEqual([]);
  });
});

// Issue #1991 follow-up — a record without a start time cannot tell the
// process it recorded from whatever process Windows later gave the same PID.
describe("access_force_cleanup_orphaned with an unknown start time (#1991)", () => {
  it("refuses a recycled PID whose finished record has no start time", async () => {
    // P1's timed_out record could not resolve the start time; the PID now
    // belongs to another project's live -Embedding run.
    const leftover = { ...record("op-p1-timed-out", "timed_out", P1), processStartTime: null };
    const { tool, killed } = await harness([comChild(P1)], [leftover]);

    const listing = await tool.handler({ pid: null });
    const payload = JSON.parse(listing.content[0]?.text ?? "{}") as Listing;
    expect(payload.orphans).toEqual([]);
    expect((payload.unattributed ?? []).map((entry) => entry.pid)).toEqual([P1]);

    const result = await tool.handler({ pid: P1, ...CONFIRMATION });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/ORPHAN_CLEANUP_PATH_UNVERIFIED/);
    expect(killed).toEqual([]);
  });

  it("refuses a PID whose live start time is unavailable", async () => {
    const live = { ...comChild(P1), startTime: undefined };
    const { tool, killed } = await harness([live], [record("op-p1-timed-out", "timed_out", P1)]);

    const result = await tool.handler({ pid: P1, ...CONFIRMATION });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/ORPHAN_CLEANUP_PATH_UNVERIFIED/);
    expect(killed).toEqual([]);
  });
});

const W = 44_004;

function pwshWorker(pid: number): OsProcessInfo {
  return {
    pid,
    name: "pwsh.exe",
    startTime: STARTED,
    commandLine: "pwsh.exe -NoProfile -ExecutionPolicy Bypass -File dysflow-access-runner.ps1",
    mainWindowHandle: 0,
  };
}

describe("access_force_cleanup_orphaned PowerShell workers (#1991)", () => {
  it("never lists or kills the worker of a live operation", async () => {
    const live = { ...record("op-p2-live", "running", P2), powershellWorkerPid: W };
    const { tool, killed } = await harness([comChild(P2), pwshWorker(W)], [live]);

    const listing = await tool.handler({ pid: null });
    const payload = JSON.parse(listing.content[0]?.text ?? "{}") as Listing;
    expect(payload.orphans.map((entry) => entry.pid)).not.toContain(W);

    const result = await tool.handler({ pid: W, ...CONFIRMATION });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/ORPHAN_CLEANUP_REGISTRY_OWNED/);
    expect(killed).toEqual([]);
  });

  it("lists and kills the leftover worker of a finished operation", async () => {
    const finished = { ...record("op-p1-timed-out", "timed_out", P1), powershellWorkerPid: W };
    const { tool, killed } = await harness([pwshWorker(W)], [finished]);

    const listing = await tool.handler({ pid: null });
    const payload = JSON.parse(listing.content[0]?.text ?? "{}") as Listing;
    expect(payload.orphans).toEqual([expect.objectContaining({ pid: W, accessPath: ACCESS_PATH })]);

    const result = await tool.handler({ pid: W, ...CONFIRMATION });
    expect(result.isError, result.content[0]?.text).toBe(false);
    expect(killed).toEqual([W]);
  });
});
