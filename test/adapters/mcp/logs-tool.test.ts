import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createLogsTool,
  type LogEntry,
  type LogsInput,
  type LogsResult,
  tryReadLogs,
} from "../../../src/adapters/mcp/logs-tool";

/**
 * Issue #973 — `dysflow.logs(projectId?, options?)` AI-aware log access.
 *
 * Acceptance criteria (issue body):
 *   1. `dysflow.logs` returns log entries from `.dysflow/runtime/` with the
 *      documented schema.
 *   2. `since`, `until`, `level`, `operationId`, `tool` filters work as
 *      documented.
 *   3. `limit` defaults to 100 and `truncated: true` is set when more
 *      entries exist.
 *   4. Logs are ordered by timestamp descending by default.
 *   5. Tool MUST be read-only.
 *
 * TDD discipline (web-tdd-philosophy):
 *   - Fixture gate: every test sets up its OWN data via mkdtempSync +
 *     writeFileSync. No test depends on the live runtime dir state.
 *   - No humo: assertions are on concrete outcome values, not absence of
 *     error.
 *   - Three paths per slice: happy + sad + edge (empty, corrupt, bounds).
 *   - Refactor-safe: tests assert on observable behavior (the structured
 *     LogsResult envelope), not on internal call order.
 */

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "dysflow-logs-"));
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

// ─── Fixture helpers ──────────────────────────────────────────────────────────

type FixtureRecord = {
  operationId: string;
  action?: "vba" | "query" | "diagnostics" | "import" | "test" | "run";
  accessPath?: string;
  projectRootAbs?: string;
  destinationRootAbs?: string;
  accessPid?: number | null;
  processStartTime?: string | null;
  status?:
    | "starting"
    | "running"
    | "completed"
    | "failed"
    | "timed_out"
    | "cleanup_pending"
    | "cleaned"
    | "pid_unknown"
    | "running_untracked"
    | "abandoned";
  metadata?: Record<string, unknown>;
  updatedAt?: string;
};

function writeRuntimeDir(records: FixtureRecord[], markers: Record<string, unknown>[] = []): void {
  const runtimePath = join(workdir, ".dysflow", "runtime");
  mkdirSync(runtimePath, { recursive: true });
  const normalized: Array<Record<string, unknown>> = records.map((record, index) => ({
    operationId: record.operationId ?? `op-${index}`,
    action: record.action ?? "diagnostics",
    accessPath: record.accessPath ?? "C:/data/app.accdb",
    projectRootAbs: record.projectRootAbs ?? workdir,
    destinationRootAbs: record.destinationRootAbs ?? join(workdir, "src"),
    accessPid: record.accessPid ?? null,
    processStartTime: record.processStartTime ?? null,
    status: record.status ?? "completed",
    metadata: record.metadata ?? {},
    updatedAt: record.updatedAt ?? `2026-07-18T10:00:0${index % 10}.000Z`,
  }));
  writeFileSync(
    join(runtimePath, "operations.json"),
    JSON.stringify({ records: normalized }, null, 2),
    "utf-8",
  );
  if (markers.length > 0) {
    const markersPath = join(runtimePath, "markers");
    mkdirSync(markersPath, { recursive: true });
    markers.forEach((marker, index) => {
      writeFileSync(
        join(markersPath, `marker-${index}.json`),
        JSON.stringify(marker),
        "utf-8",
      );
    });
  }
}

// ─── tryReadLogs — pure helper ────────────────────────────────────────────────

describe("tryReadLogs — pure helper (issue #973)", () => {
  it("returns the documented LogsResult schema (entries, totalCount, truncated)", async () => {
    writeRuntimeDir([{ operationId: "a" }]);

    const result = await tryReadLogs({}, workdir);

    expect(result).toHaveProperty("entries");
    expect(result).toHaveProperty("totalCount");
    expect(result).toHaveProperty("truncated");
    expect(Array.isArray(result.entries)).toBe(true);
    expect(typeof result.totalCount).toBe("number");
    expect(typeof result.truncated).toBe("boolean");
  });

  it("each entry conforms to the LogEntry shape", async () => {
    writeRuntimeDir([
      {
        operationId: "abc",
        action: "vba",
        status: "completed",
        metadata: { foo: "bar" },
        updatedAt: "2026-07-18T10:00:00.000Z",
      },
    ]);

    const result = await tryReadLogs({}, workdir);

    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0] as LogEntry;
    expect(entry.timestamp).toBe("2026-07-18T10:00:00.000Z");
    expect(["error", "warning", "info", "debug"]).toContain(entry.level);
    expect(entry.operationId).toBe("abc");
    expect(entry.tool).toBe("vba");
    expect(typeof entry.message).toBe("string");
    expect(entry.context).toEqual({ foo: "bar" });
  });

  it("orders logs by timestamp DESCENDING by default", async () => {
    writeRuntimeDir([
      { operationId: "old", updatedAt: "2026-07-18T08:00:00.000Z" },
      { operationId: "newest", updatedAt: "2026-07-18T12:00:00.000Z" },
      { operationId: "middle", updatedAt: "2026-07-18T10:00:00.000Z" },
    ]);

    const result = await tryReadLogs({}, workdir);

    expect(result.entries.map((e) => e.operationId)).toEqual(["newest", "middle", "old"]);
    expect(result.entries.map((e) => e.timestamp)).toEqual([
      "2026-07-18T12:00:00.000Z",
      "2026-07-18T10:00:00.000Z",
      "2026-07-18T08:00:00.000Z",
    ]);
  });

  it("orders logs ASCENDING when orderBy:'asc' is supplied", async () => {
    writeRuntimeDir([
      { operationId: "old", updatedAt: "2026-07-18T08:00:00.000Z" },
      { operationId: "newest", updatedAt: "2026-07-18T12:00:00.000Z" },
      { operationId: "middle", updatedAt: "2026-07-18T10:00:00.000Z" },
    ]);

    const result = await tryReadLogs({ options: { orderBy: "asc" } }, workdir);

    expect(result.entries.map((e) => e.operationId)).toEqual(["old", "middle", "newest"]);
  });

  it("level filter returns only matching entries (error -> failed/timed_out/abandoned)", async () => {
    writeRuntimeDir([
      { operationId: "a", status: "failed" },
      { operationId: "b", status: "timed_out" },
      { operationId: "c", status: "completed" },
      { operationId: "d", status: "starting" },
      { operationId: "e", status: "abandoned" },
    ]);

    const result = await tryReadLogs({ options: { level: "error" } }, workdir);

    expect(result.entries).toHaveLength(3);
    for (const entry of result.entries) {
      expect(entry.level).toBe("error");
    }
    const ids = result.entries.map((e) => e.operationId).sort();
    expect(ids).toEqual(["a", "b", "e"]);
  });

  it("level filter info -> completed/cleaned", async () => {
    writeRuntimeDir([
      { operationId: "a", status: "completed" },
      { operationId: "b", status: "cleaned" },
      { operationId: "c", status: "failed" },
    ]);

    const result = await tryReadLogs({ options: { level: "info" } }, workdir);

    expect(result.entries).toHaveLength(2);
    const ids = result.entries.map((e) => e.operationId).sort();
    expect(ids).toEqual(["a", "b"]);
  });

  it("since/until filters bound the time range", async () => {
    writeRuntimeDir([
      { operationId: "before", updatedAt: "2026-07-18T09:00:00.000Z" },
      { operationId: "low", updatedAt: "2026-07-18T10:00:00.000Z" },
      { operationId: "mid", updatedAt: "2026-07-18T10:30:00.000Z" },
      { operationId: "high", updatedAt: "2026-07-18T11:00:00.000Z" },
      { operationId: "after", updatedAt: "2026-07-18T12:00:00.000Z" },
    ]);

    const result = await tryReadLogs(
      {
        options: {
          since: "2026-07-18T09:30:00.000Z",
          until: "2026-07-18T11:30:00.000Z",
        },
      },
      workdir,
    );

    const ids = result.entries.map((e) => e.operationId).sort();
    expect(ids).toEqual(["high", "low", "mid"]);
  });

  it("operationId filter narrows to one operation", async () => {
    writeRuntimeDir([
      { operationId: "target", updatedAt: "2026-07-18T10:00:00.000Z" },
      { operationId: "other1", updatedAt: "2026-07-18T11:00:00.000Z" },
      { operationId: "other2", updatedAt: "2026-07-18T12:00:00.000Z" },
    ]);

    const result = await tryReadLogs({ options: { operationId: "target" } }, workdir);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.operationId).toBe("target");
    expect(result.totalCount).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it("tool filter narrows to one tool/action", async () => {
    writeRuntimeDir([
      { operationId: "a1", action: "vba" },
      { operationId: "a2", action: "query" },
      { operationId: "a3", action: "vba" },
      { operationId: "a4", action: "diagnostics" },
    ]);

    const result = await tryReadLogs({ options: { tool: "vba" } }, workdir);

    expect(result.entries).toHaveLength(2);
    for (const entry of result.entries) {
      expect(entry.tool).toBe("vba");
    }
  });

  it("limit defaults to 100 and truncated:true when more entries exist", async () => {
    const records: FixtureRecord[] = Array.from({ length: 150 }, (_, i) => ({
      operationId: `op-${i.toString().padStart(3, "0")}`,
      updatedAt: new Date(Date.UTC(2026, 6, 18, 10, 0, i)).toISOString(),
    }));
    writeRuntimeDir(records);

    const result = await tryReadLogs({}, workdir);

    expect(result.entries).toHaveLength(100);
    expect(result.totalCount).toBe(150);
    expect(result.truncated).toBe(true);
  });

  it("explicit limit caps the result and sets truncated accordingly", async () => {
    const records: FixtureRecord[] = Array.from({ length: 25 }, (_, i) => ({
      operationId: `op-${i}`,
      updatedAt: new Date(Date.UTC(2026, 6, 18, 10, 0, i)).toISOString(),
    }));
    writeRuntimeDir(records);

    const result = await tryReadLogs({ options: { limit: 10 } }, workdir);

    expect(result.entries).toHaveLength(10);
    expect(result.totalCount).toBe(25);
    expect(result.truncated).toBe(true);
  });

  it("returns empty entries (totalCount:0, truncated:false) when no records", async () => {
    writeRuntimeDir([]);

    const result = await tryReadLogs({}, workdir);

    expect(result.entries).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("returns empty entries when runtime directory is missing", async () => {
    const result = await tryReadLogs({}, workdir);

    expect(result.entries).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("does not throw when operations.json is missing", async () => {
    const runtimePath = join(workdir, ".dysflow", "runtime");
    mkdirSync(runtimePath, { recursive: true });

    const result = await tryReadLogs({}, workdir);

    expect(result.entries).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("does not throw when operations.json is malformed JSON", async () => {
    const runtimePath = join(workdir, ".dysflow", "runtime");
    mkdirSync(runtimePath, { recursive: true });
    writeFileSync(join(runtimePath, "operations.json"), "{ not valid json", "utf-8");

    const result = await tryReadLogs({}, workdir);

    expect(result.entries).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("does not throw when operations.json is not an object", async () => {
    const runtimePath = join(workdir, ".dysflow", "runtime");
    mkdirSync(runtimePath, { recursive: true });
    writeFileSync(join(runtimePath, "operations.json"), '"just a string"', "utf-8");

    const result = await tryReadLogs({}, workdir);

    expect(result.entries).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("ignores records missing operationId", async () => {
    const runtimePath = join(workdir, ".dysflow", "runtime");
    mkdirSync(runtimePath, { recursive: true });
    writeFileSync(
      join(runtimePath, "operations.json"),
      JSON.stringify({
        records: [
          { operationId: "good", status: "completed", updatedAt: "2026-07-18T10:00:00.000Z" },
          { status: "completed", updatedAt: "2026-07-18T10:30:00.000Z" },
        ],
      }),
      "utf-8",
    );

    const result = await tryReadLogs({}, workdir);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.operationId).toBe("good");
  });
});

// ─── createLogsTool — factory ─────────────────────────────────────────────────

describe("createLogsTool — factory (issue #973)", () => {
  it("returns a tool with name 'logs' and the documented input schema", () => {
    const tool = createLogsTool({ cwd: workdir });

    expect(tool.name).toBe("logs");
    expect(tool.inputSchema).toBeDefined();
    const properties = tool.inputSchema?.properties as Record<string, unknown>;
    expect(properties).toHaveProperty("projectId");
    expect(properties).toHaveProperty("options");

    const optionsSchema = properties.options as { properties: Record<string, unknown> };
    expect(optionsSchema.properties).toHaveProperty("since");
    expect(optionsSchema.properties).toHaveProperty("until");
    expect(optionsSchema.properties).toHaveProperty("level");
    expect(optionsSchema.properties).toHaveProperty("operationId");
    expect(optionsSchema.properties).toHaveProperty("tool");
    expect(optionsSchema.properties).toHaveProperty("limit");
    expect(optionsSchema.properties).toHaveProperty("orderBy");
  });

  it("handler returns the LogsResult envelope on success", async () => {
    writeRuntimeDir([{ operationId: "a", status: "completed" }]);

    const tool = createLogsTool({ cwd: workdir });
    const result = await tool.handler({ projectId: "test-project" });

    expect(result.isError).toBe(false);
    expect(result.ok).toBe(true);
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as LogsResult;
    expect(payload).toHaveProperty("entries");
    expect(payload).toHaveProperty("totalCount");
    expect(payload).toHaveProperty("truncated");
    expect(payload.entries).toHaveLength(1);
  });

  it("handler is read-only: does not mutate the runtime directory", async () => {
    writeRuntimeDir([{ operationId: "a", status: "completed" }]);
    const opPath = join(workdir, ".dysflow", "runtime", "operations.json");
    const beforeContent = readFileSync(opPath, "utf-8");
    const beforeStat = statSync(opPath);

    const tool = createLogsTool({ cwd: workdir });
    await tool.handler({ options: { level: "info", limit: 50 } });
    await tool.handler({ options: { since: "2026-07-18T09:00:00.000Z" } });
    await tool.handler({ options: { operationId: "a" } });

    const afterContent = readFileSync(opPath, "utf-8");
    const afterStat = statSync(opPath);

    expect(afterContent).toBe(beforeContent);
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
  });

  it("handler refuses non-object input without throwing", async () => {
    const tool = createLogsTool({ cwd: workdir });
    const result = await tool.handler("not-an-object");

    expect(result.isError).toBe(false);
    expect(result.ok).toBe(true);
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as LogsResult;
    expect(payload.entries).toEqual([]);
    expect(payload.totalCount).toBe(0);
  });
});

// ─── Integration with createDysflowMcpTools ──────────────────────────────────

describe("createDysflowMcpTools registration (issue #973)", () => {
  it("registers the logs tool alongside the existing read-only tools", async () => {
    const { createDysflowMcpTools } = await import("../../../src/adapters/mcp/tools");
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute: async () => ({ ok: true, data: { returnValue: "ok" } }) },
        queryService: { execute: async () => ({ ok: true, data: { rows: [] } }) },
        diagnosticsService: { run: async () => ({ ok: true, data: { checks: [] } }) },
      },
    });

    const logsTool = tools.find((t) => t.name === "logs");
    expect(logsTool).toBeDefined();
    expect(logsTool?.inputSchema).toBeDefined();
    expect((logsTool?.inputSchema?.properties as Record<string, unknown>)?.options).toBeDefined();
  });
});
