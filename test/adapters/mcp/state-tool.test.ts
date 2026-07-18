import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createStateTool,
  type StateInput,
  type StateResult,
} from "../../../src/adapters/mcp/state-tool.js";
import { createDysflowMcpTools, MODERN_TOOL_NAMES } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";
import { createInMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry.js";

/**
 * Round-12 (#978) — `dysflow.state` runtime operational state tool.
 *
 * `state` is the structured complement to `resolve_project` (config
 * diagnosis) and `logs` (timeline of events): it answers "what is
 * happening right now?". The tool surfaces three live aggregates:
 *
 *   - `operations` — every recorded AccessOperationRecord (cross-ref
 *     `list_access_operations`).
 *   - `markers` — every `<projectRoot>/.dysflow/runtime/markers/*.json`
 *     marker, normalized with age in minutes.
 *   - `locks` — file-level mutex inventory. Today this is empty; the
 *     schema is reserved for a future lock-registry split (#967 follow-up).
 *
 * Plus the rolling `counters` aggregate over the last 24 hours.
 *
 * Acceptance criteria from #978:
 *   1. `dysflow.state` returns the documented `StateResult` schema.
 *   2. `operations` array reflects current pending/running operations.
 *   3. `markers` array reflects all markers including their age.
 *   4. `counters` aggregates stats over the last 24 hours.
 *   5. Tool is read-only.
 *
 * The tool is read-only — it never opens Access, never spawns PowerShell,
 * never mutates state. Tests assert on observable behavior (the catalog
 * the handler returns), not on internal call order, so the suite stays
 * refactor-safe per the project testing philosophy.
 */

class FakeVbaService {
  async execute() {
    return successResult({ returnValue: "ok" });
  }
}
class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}
class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

function makeBaseServices(overrides?: Record<string, unknown>) {
  return {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
    ...overrides,
  };
}

function makeBaseInput(): StateInput {
  return {};
}

describe("dysflow.state (Round-12 #978)", () => {
  describe("schema surface", () => {
    it("returns the documented StateResult shape (operations, markers, locks, counters)", async () => {
      const tool = createStateTool({
        cwd: process.cwd(),
        registry: createInMemoryAccessOperationRegistry(),
      });
      const result = await tool.handler(makeBaseInput());
      expect(result).toBeDefined();
      expect(result.isError).toBe(false);
      const payload = JSON.parse(result.content[0]?.text ?? "{}") as StateResult;

      expect(Array.isArray(payload.operations)).toBe(true);
      expect(Array.isArray(payload.markers)).toBe(true);
      expect(Array.isArray(payload.locks)).toBe(true);
      expect(payload.counters).toHaveProperty("totalOperations");
      expect(payload.counters).toHaveProperty("succeededLast24h");
      expect(payload.counters).toHaveProperty("failedLast24h");
      expect(payload.counters).toHaveProperty("abandonedLast24h");
      expect(typeof payload.counters.totalOperations).toBe("number");
      expect(typeof payload.counters.succeededLast24h).toBe("number");
      expect(typeof payload.counters.failedLast24h).toBe("number");
      expect(typeof payload.counters.abandonedLast24h).toBe("number");
    });

    it("operations entries carry the documented shape (operationId, tool, status, startedAt, updatedAt, metadata)", async () => {
      const registry = createInMemoryAccessOperationRegistry();
      await registry.create({
        operationId: "op-shape-1",
        action: "vba",
        accessPath: "C:/proj/app.accdb",
        accessPid: 1234,
        processStartTime: new Date().toISOString(),
        status: "running",
        metadata: { test: true },
        updatedAt: new Date().toISOString(),
      });
      const tool = createStateTool({ cwd: process.cwd(), registry });
      const result = await tool.handler({});
      const payload = JSON.parse(result.content[0]?.text ?? "{}") as StateResult;
      const op = payload.operations.find((o) => o.operationId === "op-shape-1");
      expect(op).toBeDefined();
      expect(op).toHaveProperty("operationId");
      expect(op).toHaveProperty("tool");
      expect(op).toHaveProperty("status");
      expect(op).toHaveProperty("startedAt");
      expect(op).toHaveProperty("updatedAt");
      expect(op).toHaveProperty("metadata");
      expect(typeof op?.operationId).toBe("string");
      expect(typeof op?.tool).toBe("string");
      expect(typeof op?.startedAt).toBe("string");
      expect(typeof op?.updatedAt).toBe("string");
      expect(typeof op?.metadata).toBe("object");
    });

    it("markers entries include operationId, action, status, updatedAt, ageMinutes", async () => {
      let workdir = "";
      try {
        workdir = mkdtempSync(join(tmpdir(), "dysflow-state-markers-shape-"));
        const markersDir = join(workdir, ".dysflow", "runtime", "markers");
        mkdirSync(markersDir, { recursive: true });
        writeFileSync(
          join(markersDir, "op-shape-marker.json"),
          JSON.stringify({
            operationId: "op-shape-marker",
            action: "import",
            status: "running",
            updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          }),
          "utf-8",
        );

        const tool = createStateTool({
          cwd: workdir,
          registry: createInMemoryAccessOperationRegistry(),
        });
        const result = await tool.handler({});
        const payload = JSON.parse(result.content[0]?.text ?? "{}") as StateResult;
        const marker = payload.markers.find((m) => m.operationId === "op-shape-marker");
        expect(marker).toBeDefined();
        expect(marker).toHaveProperty("operationId");
        expect(marker).toHaveProperty("action");
        expect(marker).toHaveProperty("status");
        expect(marker).toHaveProperty("updatedAt");
        expect(marker).toHaveProperty("ageMinutes");
        expect(typeof marker?.ageMinutes).toBe("number");
      } finally {
        if (workdir.length > 0) {
          rmSync(workdir, { recursive: true, force: true });
        }
      }
    });
  });

  describe("operations array reflects the live registry", () => {
    it("exposes every persisted record (pending/running/failed/abandoned) from the registry", async () => {
      const registry = createInMemoryAccessOperationRegistry();
      const now = new Date();
      const ts = (offsetMs: number) => new Date(now.getTime() - offsetMs).toISOString();
      // NOTE: the access operation registry purges `completed`/`cleaned`
      // records on create() — terminal-success records are ephemeral by
      // design (a successful op has nothing left to track, so the
      // registry drops it). `state.operations` therefore surfaces the
      // non-terminal lifecycle (starting / running / failed / abandoned /
      // timed_out / cleanup_pending / pid_unknown / running_untracked).
      // The `succeededLast24h` counter reads the same registry, so it
      // also reports 0 for the in-memory registry — that is the
      // expected contract. The full `completed` history lives in
      // `.dysflow/runtime/operations.json` which the `logs` tool reads.
      await registry.create({
        operationId: "op-pending-1",
        action: "vba",
        accessPath: "C:/proj/app.accdb",
        accessPid: 1001,
        processStartTime: ts(1000),
        status: "starting",
        metadata: {},
        updatedAt: ts(1000),
      });
      await registry.create({
        operationId: "op-running-1",
        action: "import",
        accessPath: "C:/proj/app.accdb",
        accessPid: 1002,
        processStartTime: ts(2000),
        status: "running",
        metadata: { modules: 5 },
        updatedAt: ts(500),
      });
      await registry.create({
        operationId: "op-failed-1",
        action: "test",
        accessPath: "C:/proj/app.accdb",
        accessPid: null,
        processStartTime: ts(120_000),
        status: "failed",
        metadata: {},
        updatedAt: ts(120_000),
      });
      await registry.create({
        operationId: "op-abandoned-1",
        action: "diagnostics",
        accessPath: "C:/proj/app.accdb",
        accessPid: null,
        processStartTime: ts(180_000),
        status: "abandoned",
        metadata: {},
        updatedAt: ts(180_000),
      });

      const tool = createStateTool({ cwd: process.cwd(), registry });
      const result = await tool.handler({});
      const payload = JSON.parse(result.content[0]?.text ?? "{}") as StateResult;

      const ids = payload.operations.map((o) => o.operationId);
      expect(ids).toContain("op-pending-1");
      expect(ids).toContain("op-running-1");
      expect(ids).toContain("op-failed-1");
      expect(ids).toContain("op-abandoned-1");

      const running = payload.operations.find((o) => o.operationId === "op-running-1");
      expect(running?.status).toBe("running");
      const failed = payload.operations.find((o) => o.operationId === "op-failed-1");
      expect(failed?.status).toBe("failed");
    });
  });

  describe("markers aggregate", () => {
    let workdir: string;

    beforeEach(() => {
      workdir = mkdtempSync(join(tmpdir(), "dysflow-state-markers-"));
    });

    afterEach(() => {
      rmSync(workdir, { recursive: true, force: true });
    });

    it("returns empty markers when the markers directory is absent (idempotent)", async () => {
      const tool = createStateTool({
        cwd: workdir,
        registry: createInMemoryAccessOperationRegistry(),
      });
      const result = await tool.handler({});
      const payload = JSON.parse(result.content[0]?.text ?? "{}") as StateResult;
      expect(payload.markers).toEqual([]);
    });

    it("computes ageMinutes relative to the wall clock (with the configured nowMs)", async () => {
      const markersDir = join(workdir, ".dysflow", "runtime", "markers");
      mkdirSync(markersDir, { recursive: true });
      const now = Date.parse("2026-07-18T12:00:00.000Z");
      const updatedAt = new Date(now - 30 * 60 * 1000).toISOString();
      writeFileSync(
        join(markersDir, "op-age.json"),
        JSON.stringify({
          operationId: "op-age",
          action: "import",
          status: "running",
          updatedAt,
        }),
        "utf-8",
      );

      const tool = createStateTool({
        cwd: workdir,
        registry: createInMemoryAccessOperationRegistry(),
        nowMs: now,
      });
      const result = await tool.handler({});
      const payload = JSON.parse(result.content[0]?.text ?? "{}") as StateResult;
      const marker = payload.markers.find((m) => m.operationId === "op-age");
      expect(marker).toBeDefined();
      expect(marker?.ageMinutes).toBe(30);
    });

    it("includes every marker, even when the payload shape varies", async () => {
      const markersDir = join(workdir, ".dysflow", "runtime", "markers");
      mkdirSync(markersDir, { recursive: true });
      const now = Date.now();
      writeFileSync(
        join(markersDir, "op-a.json"),
        JSON.stringify({
          operationId: "op-a",
          action: "import",
          status: "running",
          updatedAt: new Date(now - 5 * 60 * 1000).toISOString(),
        }),
        "utf-8",
      );
      writeFileSync(
        join(markersDir, "op-b.json"),
        JSON.stringify({
          marker: {
            operationId: "op-b",
            action: "vba",
            status: "abandoned",
            updatedAt: new Date(now - 10 * 60 * 1000).toISOString(),
          },
        }),
        "utf-8",
      );

      const tool = createStateTool({
        cwd: workdir,
        registry: createInMemoryAccessOperationRegistry(),
      });
      const result = await tool.handler({});
      const payload = JSON.parse(result.content[0]?.text ?? "{}") as StateResult;
      const ids = payload.markers.map((m) => m.operationId);
      expect(ids).toContain("op-a");
      expect(ids).toContain("op-b");
    });
  });

  describe("counters aggregation (last 24h)", () => {
    it("aggregates failed/abandoned counts over the last 24 hours; succeeded reflects the registry's purge semantics", async () => {
      const registry = createInMemoryAccessOperationRegistry();
      const nowMs = Date.parse("2026-07-18T12:00:00.000Z");
      const within = (offsetMs: number) => new Date(nowMs - offsetMs).toISOString();
      const outside = new Date(nowMs - 48 * 60 * 60 * 1000).toISOString();

      // The registry purges `completed` / `cleaned` records on create
      // (terminal-success records are ephemeral by design — see the
      // operations array test above). To exercise the counter, we use
      // `running` for what would be "in-flight succeeded" and rely on
      // the registry's purge to keep `succeededLast24h` honest at 0.
      await registry.create({
        operationId: "within-failed-1",
        action: "vba",
        accessPath: "C:/proj/app.accdb",
        accessPid: null,
        processStartTime: within(60_000),
        status: "failed",
        metadata: {},
        updatedAt: within(60_000),
      });
      await registry.create({
        operationId: "within-abandoned-1",
        action: "vba",
        accessPath: "C:/proj/app.accdb",
        accessPid: null,
        processStartTime: within(60_000),
        status: "abandoned",
        metadata: {},
        updatedAt: within(60_000),
      });
      await registry.create({
        operationId: "within-running-1",
        action: "vba",
        accessPath: "C:/proj/app.accdb",
        accessPid: 1234,
        processStartTime: within(60_000),
        status: "running",
        metadata: {},
        updatedAt: within(60_000),
      });
      // Outside 24h - must NOT count
      await registry.create({
        operationId: "outside-failed",
        action: "vba",
        accessPath: "C:/proj/app.accdb",
        accessPid: null,
        processStartTime: outside,
        status: "failed",
        metadata: {},
        updatedAt: outside,
      });

      const tool = createStateTool({
        cwd: process.cwd(),
        registry,
        nowMs,
      });
      const result = await tool.handler({});
      const payload = JSON.parse(result.content[0]?.text ?? "{}") as StateResult;

      // totalOperations = registry.listRecent() length (every persisted record).
      expect(payload.counters.totalOperations).toBe(4);
      // completed/cleaned records are purged on create by design — so
      // the in-memory registry's succeeded counter is 0. A consumer that
      // wants the success rate reads `.dysflow/runtime/operations.json`
      // through the `logs` tool.
      expect(payload.counters.succeededLast24h).toBe(0);
      expect(payload.counters.failedLast24h).toBe(1);
      expect(payload.counters.abandonedLast24h).toBe(1);
    });

    it("the 24h filter respects updatedAt — old records do not count", async () => {
      const registry = createInMemoryAccessOperationRegistry();
      const nowMs = Date.parse("2026-07-18T12:00:00.000Z");
      const way_ago = new Date(nowMs - 1000 * 60 * 60 * 24 * 7).toISOString(); // 7 days ago

      await registry.create({
        operationId: "old-failed",
        action: "vba",
        accessPath: "C:/proj/app.accdb",
        accessPid: null,
        processStartTime: way_ago,
        status: "failed",
        metadata: {},
        updatedAt: way_ago,
      });

      const tool = createStateTool({ cwd: process.cwd(), registry, nowMs });
      const result = await tool.handler({});
      const payload = JSON.parse(result.content[0]?.text ?? "{}") as StateResult;

      expect(payload.counters.totalOperations).toBe(1);
      expect(payload.counters.failedLast24h).toBe(0);
    });
  });

  describe("read-only invariant", () => {
    it("does NOT require writes to be enabled — tool is registered with default writes:false", () => {
      const tools = createDysflowMcpTools({
        services: makeBaseServices(),
      });
      const tool = tools.find((t) => t.name === "state");
      expect(tool).toBeDefined();
    });

    it("MODERN_TOOL_NAMES advertises 'state'", () => {
      expect(MODERN_TOOL_NAMES).toContain("state");
    });

    it("MCP tool contract is 'read-only' for the state tool (issue #962)", async () => {
      const { MCP_TOOL_CONTRACTS } = await import(
        "../../../src/adapters/mcp/mcp-tool-contracts.js"
      );
      const contract = MCP_TOOL_CONTRACTS.state;
      expect(contract).toBeDefined();
      expect(contract.access).toBe("read-only");
      expect(contract.writeGate).toBe("none");
    });

    it("state tool handler returns ok when writes are disabled", async () => {
      const tools = createDysflowMcpTools({
        services: makeBaseServices(),
        writes: false,
      });
      const tool = tools.find((t) => t.name === "state");
      expect(tool).toBeDefined();
      const result = await tool?.handler({ projectId: "test-project" });
      expect(result?.isError).toBe(false);
    });
  });

  describe("input schema", () => {
    it("exposes projectId as the only documented input field", () => {
      const tools = createDysflowMcpTools({
        services: makeBaseServices(),
      });
      const tool = tools.find((t) => t.name === "state");
      expect(tool).toBeDefined();
      const properties = tool?.inputSchema?.properties ?? {};
      expect(properties).toHaveProperty("projectId");
    });
  });
});
