import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";
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

// Issue #1862 — retiring a verified project orphan must not need allowWrites.
// The ownership guards stay in AccessOrphanCleanupService and are exercised
// here through the real service, so a regression in any guard fails the test.

const ACCESS_PATH = "C:\\bench\\app.accdb";
const PROJECT_ROOT = "C:\\bench";
const NOW = new Date("2026-07-31T12:00:00.000Z");
const CONFIRMATION = {
  implements_check: "orphans_msaccess",
  confirmedRequiresConfirmation: true,
} as const;

function projectOrphan(pid: number): OsProcessInfo {
  return {
    pid,
    name: "MSACCESS.EXE",
    startTime: "2026-07-31T11:50:00.000Z",
    commandLine: `"C:\\Program Files\\Microsoft Office\\root\\Office16\\MSACCESS.EXE" "${ACCESS_PATH}" -Embedding`,
    mainWindowHandle: 0,
  };
}

function foreignOrphan(pid: number): OsProcessInfo {
  return {
    pid,
    name: "MSACCESS.EXE",
    startTime: "2026-07-31T11:50:00.000Z",
    commandLine: `"C:\\Program Files\\Microsoft Office\\root\\Office16\\MSACCESS.EXE" "D:\\other\\elsewhere.accdb" -Embedding`,
    mainWindowHandle: 0,
  };
}

function toolFor(processes: OsProcessInfo[]) {
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

describe("access_force_cleanup_orphaned without allowWrites (#1862)", () => {
  it("returns the orphan listing for pid:null with writes disabled", async () => {
    const { tool, killed } = toolFor([projectOrphan(20_824)]);

    const result = await tool.handler({ pid: null });

    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).not.toContain("MCP_WRITES_DISABLED");
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
      orphans: Array<{ pid: number }>;
      totalCount: number;
    };
    expect(payload.totalCount).toBe(1);
    expect(payload.orphans[0]?.pid).toBe(20_824);
    expect(killed).toEqual([]);
  });

  it("retires a listed PID that holds this project's accessPath with writes disabled", async () => {
    const { tool, killed } = toolFor([projectOrphan(20_824)]);

    const result = await tool.handler({ pid: 20_824, ...CONFIRMATION });

    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).not.toContain("MCP_WRITES_DISABLED");
    expect(killed).toEqual([20_824]);
  });

  it("refuses a PID whose process holds only files outside the project and kills nothing", async () => {
    const { tool, killed } = toolFor([foreignOrphan(31_444)]);

    const result = await tool.handler({ pid: 31_444, ...CONFIRMATION });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).not.toContain("MCP_WRITES_DISABLED");
    expect(result.content[0]?.text).toMatch(/ORPHAN_CLEANUP_/);
    expect(killed).toEqual([]);
  });

  it("keeps the confirmation requirement for a destructive retire (#1537)", async () => {
    const { tool, killed } = toolFor([projectOrphan(20_824)]);

    const result = await tool.handler({ pid: 20_824 });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("CONFIRMATION_REQUIRED");
    expect(killed).toEqual([]);
  });
});

describe("project-level capabilities.allowWrites:false and the orphan retire (#1862)", () => {
  function projectWithAllowWritesOff(): string {
    const root = mkdtempSync(join(tmpdir(), "dysflow-1862-allowwrites-off-"));
    writeFileSync(join(root, ".git"), "gitdir: fixture");
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        id: "app",
        accessPath: "app.accdb",
        destinationRoot: "src",
        capabilities: { allowWrites: false },
      }),
    );
    return root;
  }

  it("lifts the allowWrites:false refusal for a numeric-PID retire only", () => {
    const root = projectWithAllowWritesOff();
    try {
      const retire = diagnoseProjectConfig(root, {
        operation: "access_force_cleanup_orphaned",
        pid: 20_824,
      });
      expect(retire.status).not.toBe("capabilities-disallow-write");
      expect(retire.diagnostics.map((d) => d.code)).not.toContain("CAPABILITIES_DISALLOW_WRITE");

      const importing = diagnoseProjectConfig(root, { operation: "import_modules" });
      expect(importing.status).toBe("capabilities-disallow-write");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
