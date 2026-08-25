import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, rmdir, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildInvocationTelemetryEntry,
  createInvocationTelemetryContextResolver,
  createInvocationTelemetryRecorder,
  type InvocationTelemetryEntry,
  invocationActionForTool,
  resolveInvocationWriteIntent,
} from "../../../src/adapters/mcp/invocation-telemetry.js";
import { translateCoreResultToMcpContent } from "../../../src/adapters/mcp/result-translation.js";
import { successResult } from "../../../src/core/contracts/index.js";

const releaseRenameBarrier = vi.hoisted(() => ({
  targetLockPath: null as string | null,
  signalStarted: null as (() => void) | null,
  waitUntilReleased: null as Promise<void> | null,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: async (
      oldPath: Parameters<typeof actual.rename>[0],
      newPath: Parameters<typeof actual.rename>[1],
    ) => {
      await actual.rename(oldPath, newPath);
      const target = releaseRenameBarrier.targetLockPath;
      const destination = String(newPath);
      if (
        target !== null &&
        destination.startsWith(target) &&
        destination.slice(target.length + 1).startsWith("release-")
      ) {
        releaseRenameBarrier.signalStarted?.();
        await releaseRenameBarrier.waitUntilReleased;
      }
    },
  };
});

const roots: string[] = [];
const PENDING_LOCK_ENTRY: InvocationTelemetryEntry = {
  timestamp: "2026-07-28T00:00:00.000Z",
  tool: "schema",
  action: "diagnostics",
  operationId: null,
  projectId: null,
  outcome: "ok",
  failureClass: "none",
  errorCode: null,
  durationMs: 1,
  writeIntent: "read",
  paramNamesPresent: [],
  missingParams: [],
  rejectedParams: [],
  unknownToolName: null,
};

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "dysflow-invocations-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  releaseRenameBarrier.targetLockPath = null;
  releaseRenameBarrier.signalStarted = null;
  releaseRenameBarrier.waitUntilReleased = null;
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

async function createStalePendingLock(
  lockPath: string,
  pid: number,
  options: { marker?: "owner" | "unexpected"; fresh?: boolean } = {},
): Promise<string> {
  const pendingPath = `${lockPath}.pending-${pid}-123e4567-e89b-42d3-a456-426614174000`;
  await mkdir(dirname(lockPath), { recursive: true });
  await mkdir(pendingPath);
  if (options.marker === "owner") {
    await writeFile(
      join(pendingPath, `owner-${pid}-123e4567-e89b-42d3-a456-426614174001`),
      "",
      "utf8",
    );
  }
  if (options.marker === "unexpected") {
    await writeFile(join(pendingPath, "unexpected"), "", "utf8");
  }
  if (!options.fresh) {
    await utimes(pendingPath, new Date(0), new Date(0));
    if (options.marker !== undefined) {
      await utimes(
        join(
          pendingPath,
          options.marker === "owner"
            ? `owner-${pid}-123e4567-e89b-42d3-a456-426614174001`
            : "unexpected",
        ),
        new Date(0),
        new Date(0),
      );
    }
  }
  return pendingPath;
}

async function recordAgainstLiveStableLock(
  cwd: string,
  isProcessAlive: (pid: number) => boolean,
): Promise<ReturnType<typeof createInvocationTelemetryRecorder>> {
  const runtime = join(cwd, ".dysflow", "runtime");
  const lockPath = join(runtime, "invocations.jsonl.lock");
  await mkdir(lockPath, { recursive: true });
  await writeFile(join(lockPath, "owner-stable"), "", "utf8");
  const recorder = createInvocationTelemetryRecorder({
    cwd,
    lockTimeoutMs: 30,
    staleLockMs: 60_000,
    isProcessAlive,
  });
  await expect(recorder.record(PENDING_LOCK_ENTRY)).rejects.toThrow(
    "Timed out acquiring invocation telemetry lock",
  );
  return recorder;
}

describe("invocation telemetry privacy contract (#1197)", () => {
  it("records parameter names and typed contract failure metadata, never values", () => {
    const entry = buildInvocationTelemetryEntry({
      toolName: "relink_directory",
      toolKnown: true,
      args: {
        projectId: "expedientes",
        password: "super-secret",
        sql: "DELETE FROM Customers",
        sourcePath: "C:/private/customer.accdb",
        dryRun: true,
      },
      result: {
        content: [{ type: "text", text: "MCP_INPUT_INVALID" }],
        isError: true,
        error: {
          code: "MCP_INPUT_INVALID",
          message: "invalid",
          missingParam: "databasePath",
          rejectedFlag: "dryRun",
        },
      },
      durationMs: 17,
      writeIntent: "dryRun",
    });

    expect(entry).toMatchObject({
      tool: "relink_directory",
      projectId: "expedientes",
      outcome: "error",
      failureClass: "contract",
      errorCode: "MCP_INPUT_INVALID",
      durationMs: 17,
      writeIntent: "dryRun",
      missingParams: ["databasePath"],
      rejectedParams: ["dryRun"],
      paramNamesPresent: ["dryRun", "password", "projectId", "sourcePath", "sql"],
      unknownToolName: null,
    });
    const serialized = JSON.stringify(entry);
    expect(serialized).toContain('"projectId":"expedientes"');
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("DELETE FROM");
    expect(serialized).not.toContain("customer.accdb");
  });

  it("records privacy-safe recovery trio consumption evidence", () => {
    const entry = buildInvocationTelemetryEntry({
      toolName: "test_vba",
      toolKnown: true,
      args: { projectId: "shared-id", recoveryToken: "secret-token" },
      result: { content: [], isError: false },
      durationMs: 1,
      writeIntent: "dryRun",
      auditEvents: ["trio-consumed:shared-id"],
    });

    expect(entry.auditEvents).toEqual(["trio-consumed:shared-id"]);
    expect(JSON.stringify(entry)).not.toContain("secret-token");
  });

  it("records warning codes without persisting warning text or arguments", () => {
    const entry = buildInvocationTelemetryEntry({
      toolName: "import_modules",
      toolKnown: true,
      args: { moduleNames: ["PrivateModule"] },
      result: {
        content: [],
        structuredContent: {
          warnings: [
            {
              code: "PREFERRED_TOOL_AVAILABLE",
              rationale: "sensitive free-form text is not telemetry",
            },
          ],
        },
        isError: false,
      },
      durationMs: 1,
      writeIntent: "dryRun",
    });

    expect(entry.warningCodes).toEqual(["PREFERRED_TOOL_AVAILABLE"]);
    expect(JSON.stringify(entry)).not.toContain("PrivateModule");
    expect(JSON.stringify(entry)).not.toContain("sensitive free-form text");
  });

  it("classifies unknown names and runtime failures separately", () => {
    const unknown = buildInvocationTelemetryEntry({
      toolName: "import_module",
      toolKnown: false,
      args: {},
      result: { content: [], isError: true },
      durationMs: 1,
      writeIntent: "read",
    });
    const runtime = buildInvocationTelemetryEntry({
      toolName: "run_vba",
      toolKnown: true,
      args: { procedureName: "Main" },
      result: {
        content: [],
        isError: true,
        error: { code: "PROCEDURE_NOT_FOUND", message: "missing" },
      },
      durationMs: 9,
      writeIntent: "apply",
    });

    expect(unknown).toMatchObject({
      failureClass: "contract",
      errorCode: "MCP_TOOL_NOT_FOUND",
      unknownToolName: "import_module",
    });
    expect(runtime).toMatchObject({
      failureClass: "runtime",
      errorCode: "PROCEDURE_NOT_FOUND",
      unknownToolName: null,
    });
  });

  it("reads operationId only from structural operation metadata, never result data", () => {
    const build = (result: Parameters<typeof buildInvocationTelemetryEntry>[0]["result"]) =>
      buildInvocationTelemetryEntry({
        toolName: "query_execute",
        toolKnown: true,
        args: {},
        result,
        durationMs: 1,
        writeIntent: "read",
      });

    const translated = translateCoreResultToMcpContent(
      successResult(
        { operationId: "business-top", rows: [{ operationId: "customer-secret" }] },
        {
          operation: {
            operationId: "runtime-op",
            accessPath: "C:/runtime.accdb",
            accessPid: null,
            processStartTime: null,
            status: "completed",
          },
        },
      ),
    );
    expect(build(translated).operationId).toBe("runtime-op");
    expect(
      build({
        content: [
          {
            type: "text",
            text: '{"operationId":"business-top","rows":[{"operationId":"customer-secret"}]}',
          },
        ],
        isError: false,
      }).operationId,
    ).toBeNull();
    expect(
      build({
        content: [{ type: "text", text: "failed" }],
        isError: true,
        error: {
          code: "RUNTIME_FAILURE",
          message: "failed",
          details: { operationId: "business-error-detail" },
        },
      }).operationId,
    ).toBeNull();
  });

  it("resolves write intent from tool class, explicit flags, and execution policy", () => {
    expect(resolveInvocationWriteIntent("schema", true, {}, "developer")).toBe("read");
    expect(resolveInvocationWriteIntent("import_modules", true, {}, "safe-by-default")).toBe(
      "dryRun",
    );
    expect(resolveInvocationWriteIntent("import_modules", true, {}, "developer")).toBe("apply");
    expect(
      resolveInvocationWriteIntent("import_modules", true, { dryRun: true }, "developer"),
    ).toBe("dryRun");
    expect(
      resolveInvocationWriteIntent("import_modules", true, { apply: true }, "safe-by-default"),
    ).toBe("apply");
  });

  it("keeps import, test, and run filters compatible with the operation ledger", () => {
    expect(invocationActionForTool("import_modules")).toBe("import");
    expect(invocationActionForTool("test_vba")).toBe("test");
    expect(invocationActionForTool("run_vba")).toBe("run");
    expect(invocationActionForTool("query_execute")).toBe("query");
    expect(invocationActionForTool("run_script")).toBe("run");
    expect(invocationActionForTool("schema")).toBe("diagnostics");
    expect(invocationActionForTool("doctor")).toBe("diagnostics");
  });
});

describe("local invocation JSONL sink (#1197)", () => {
  const entry = (tool: string): InvocationTelemetryEntry => ({
    timestamp: "2026-07-28T00:00:00.000Z",
    tool,
    action: "diagnostics",
    operationId: null,
    projectId: "test",
    outcome: "ok",
    failureClass: "none",
    errorCode: null,
    durationMs: 1,
    writeIntent: "read",
    paramNamesPresent: [],
    missingParams: [],
    rejectedParams: [],
    unknownToolName: null,
  });

  it("appends to a separate sink without changing operations.json", async () => {
    const cwd = tempRoot();
    const runtime = join(cwd, ".dysflow", "runtime");
    await mkdir(runtime, { recursive: true });
    const operationsPath = join(runtime, "operations.json");
    await writeFile(operationsPath, '{"records":[{"operationId":"keep"}]}', "utf8");
    const recorder = createInvocationTelemetryRecorder({ cwd });

    await recorder.record(entry("describe_tool"));

    expect(await readFile(operationsPath, "utf8")).toBe('{"records":[{"operationId":"keep"}]}');
    const lines = (await readFile(join(runtime, "invocations.jsonl"), "utf8"))
      .trim()
      .split(/\r?\n/);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ tool: "describe_tool" });
  });

  it("rotates at the configured cap and retains only the bounded generations", async () => {
    const cwd = tempRoot();
    const recorder = createInvocationTelemetryRecorder({
      cwd,
      maxBytes: 700,
      maxFiles: 2,
    });

    for (let index = 0; index < 12; index += 1) {
      await recorder.record(entry(`tool_${index}`));
    }

    const runtime = join(cwd, ".dysflow", "runtime");
    const files = ["invocations.jsonl", "invocations.jsonl.1", "invocations.jsonl.2"];
    const existing: string[] = [];
    for (const name of files) {
      try {
        await readFile(join(runtime, name), "utf8");
        existing.push(name);
      } catch {}
    }
    expect(existing).toEqual(files);
    await expect(readFile(join(runtime, "invocations.jsonl.3"), "utf8")).rejects.toThrow();
  });

  it("does not create a sink when project telemetry is disabled", async () => {
    const cwd = tempRoot();
    const recorder = createInvocationTelemetryRecorder({ cwd, enabled: false });

    await recorder.record(entry("schema"));

    await expect(
      readFile(join(cwd, ".dysflow", "runtime", "invocations.jsonl"), "utf8"),
    ).rejects.toThrow();
  });

  it("routes resolved calls, falls back only when untargeted, and fails closed for unknown targets", async () => {
    const fallback = tempRoot();
    const target = tempRoot();
    const disabled = tempRoot();
    const resolveContext = createInvocationTelemetryContextResolver({
      fallback: {
        cwd: fallback,
        enabled: true,
        writeExecutionPolicy: "safe-by-default",
      },
      resolveTarget: async (args) => {
        const projectId =
          args !== null && typeof args === "object"
            ? (args as Record<string, unknown>).projectId
            : undefined;
        if (projectId === "target") {
          return { cwd: target, enabled: true, writeExecutionPolicy: "developer" };
        }
        if (projectId === "disabled") {
          return { cwd: disabled, enabled: false, writeExecutionPolicy: "safe-by-default" };
        }
        if (projectId === "throws") throw new Error("target lookup failed");
        return undefined;
      },
    });

    const targetContext = await resolveContext({ projectId: "target" });
    const disabledContext = await resolveContext({ projectId: "disabled" });
    const fallbackContext = await resolveContext({});
    const unresolvedContext = await resolveContext({ projectId: "missing" });
    const failedContext = await resolveContext({ projectId: "throws" });
    await targetContext.recorder.record(entry("schema"));
    await disabledContext.recorder.record(entry("schema"));
    await fallbackContext.recorder.record(entry("schema"));
    await unresolvedContext.recorder.record({ ...entry("schema"), projectId: "missing" });
    await failedContext.recorder.record({ ...entry("schema"), projectId: "throws" });
    for (const [field, value] of Object.entries({
      projectId: 42,
      contextId: 42,
      cwd: null,
      projectRoot: false,
      accessPath: "",
      accessDbPath: 0,
      databasePath: [],
      sourcePath: {},
      backendPath: null,
      destinationRoot: "",
    })) {
      const invalidContext = await resolveContext({ [field]: value });
      await invalidContext.recorder.record({
        ...entry("schema"),
        projectId: `invalid-${field}`,
      });
    }

    expect(targetContext.writeExecutionPolicy).toBe("developer");
    expect(
      await readFile(join(target, ".dysflow", "runtime", "invocations.jsonl"), "utf8"),
    ).toContain('"tool":"schema"');
    await expect(
      readFile(join(disabled, ".dysflow", "runtime", "invocations.jsonl"), "utf8"),
    ).rejects.toThrow();
    expect(
      await readFile(join(fallback, ".dysflow", "runtime", "invocations.jsonl"), "utf8"),
    ).not.toMatch(/"projectId":"(?:missing|throws|invalid-)/);
  });

  it("waits for the cross-process lock before appending", async () => {
    const cwd = tempRoot();
    const runtime = join(cwd, ".dysflow", "runtime");
    const lockPath = join(runtime, "invocations.jsonl.lock");
    await mkdir(lockPath, { recursive: true });
    const recorder = createInvocationTelemetryRecorder({
      cwd,
      lockTimeoutMs: 1_000,
    });
    let settled = false;
    const pending = recorder.record(entry("schema")).then(() => {
      settled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(settled).toBe(false);
    await rm(lockPath, { recursive: true, force: true });
    await pending;
    expect(await readFile(join(runtime, "invocations.jsonl"), "utf8")).toContain('"tool":"schema"');
  });

  it("reclaims a stale cross-process lock", async () => {
    const cwd = tempRoot();
    const runtime = join(cwd, ".dysflow", "runtime");
    const lockPath = join(runtime, "invocations.jsonl.lock");
    await mkdir(lockPath, { recursive: true });
    await writeFile(join(lockPath, "owner-stale"), "", "utf8");
    await utimes(lockPath, new Date(0), new Date(0));
    await utimes(join(lockPath, "owner-stale"), new Date(0), new Date(0));
    const recorder = createInvocationTelemetryRecorder({
      cwd,
      lockTimeoutMs: 1_000,
      staleLockMs: 10,
    });

    await recorder.record(entry("schema"));

    expect(await readFile(join(runtime, "invocations.jsonl"), "utf8")).toContain('"tool":"schema"');
  });

  it("reclaims stale ownerless and claim-only locks left by interrupted acquisition", async () => {
    for (const marker of [undefined, "release-crashed"]) {
      const cwd = tempRoot();
      const runtime = join(cwd, ".dysflow", "runtime");
      const lockPath = join(runtime, "invocations.jsonl.lock");
      await mkdir(lockPath, { recursive: true });
      if (marker !== undefined) {
        await writeFile(join(lockPath, marker), "", "utf8");
        await utimes(join(lockPath, marker), new Date(0), new Date(0));
      }
      await utimes(lockPath, new Date(0), new Date(0));
      const recorder = createInvocationTelemetryRecorder({
        cwd,
        lockTimeoutMs: 100,
        staleLockMs: 10,
      });

      await recorder.record(entry("schema"));
      expect(await readFile(join(runtime, "invocations.jsonl"), "utf8")).toContain(
        '"tool":"schema"',
      );
    }
  });

  it("never deletes a successor lock generation after a delayed owner release", async () => {
    const cwd = tempRoot();
    const runtime = join(cwd, ".dysflow", "runtime");
    const lockPath = join(runtime, "invocations.jsonl.lock");
    const recorder = createInvocationTelemetryRecorder({ cwd });
    let signalStarted!: () => void;
    let releaseRename!: () => void;
    const renameStarted = new Promise<void>((resolveStarted) => {
      signalStarted = resolveStarted;
    });
    releaseRenameBarrier.targetLockPath = lockPath;
    releaseRenameBarrier.signalStarted = signalStarted;
    releaseRenameBarrier.waitUntilReleased = new Promise<void>((resolveRelease) => {
      releaseRename = resolveRelease;
    });
    const pending = recorder.record(entry("schema"));

    await renameStarted;
    const releaseMarker = (await readdir(lockPath)).find((name) => name.startsWith("release-"));
    expect(releaseMarker).toBeDefined();
    await rm(join(lockPath, releaseMarker ?? ""), { force: true });
    await rmdir(lockPath);
    await mkdir(lockPath);
    await writeFile(join(lockPath, "owner-successor"), "", "utf8");
    releaseRename();
    await pending;

    expect(await readFile(join(lockPath, "owner-successor"), "utf8")).toBe("");
  });

  it("never reclaims a fresh owner token from a stale-looking lock directory", async () => {
    const cwd = tempRoot();
    const runtime = join(cwd, ".dysflow", "runtime");
    const lockPath = join(runtime, "invocations.jsonl.lock");
    await mkdir(lockPath, { recursive: true });
    await writeFile(join(lockPath, "owner-live"), "", "utf8");
    await utimes(lockPath, new Date(0), new Date(0));
    const recorder = createInvocationTelemetryRecorder({
      cwd,
      lockTimeoutMs: 20,
      staleLockMs: 60_000,
    });

    await expect(recorder.record(entry("schema"))).rejects.toThrow(
      "Timed out acquiring invocation telemetry lock",
    );
    expect(await readFile(join(lockPath, "owner-live"), "utf8")).toBe("");
  });

  it("fails closed after the lock acquisition deadline", async () => {
    const cwd = tempRoot();
    const runtime = join(cwd, ".dysflow", "runtime");
    await mkdir(join(runtime, "invocations.jsonl.lock"), { recursive: true });
    const recorder = createInvocationTelemetryRecorder({
      cwd,
      lockTimeoutMs: 20,
      staleLockMs: 60_000,
    });

    await expect(recorder.record(entry("schema"))).rejects.toThrow(
      "Timed out acquiring invocation telemetry lock",
    );
  });

  it("reaps a stale pending lock owned by a dead process without touching the stable lock", async () => {
    const cwd = tempRoot();
    const lockPath = join(cwd, ".dysflow", "runtime", "invocations.jsonl.lock");
    const pendingPath = await createStalePendingLock(lockPath, 2001, { marker: "owner" });

    await recordAgainstLiveStableLock(cwd, () => false);

    await expect(readdir(pendingPath)).rejects.toThrow();
    expect(await readFile(join(lockPath, "owner-stable"), "utf8")).toBe("");
  });

  it("retains live, fresh, and malformed pending directories", async () => {
    const cwd = tempRoot();
    const lockPath = join(cwd, ".dysflow", "runtime", "invocations.jsonl.lock");
    const [live, fresh, malformed, emittedSibling, mixedMarker] = await Promise.all([
      createStalePendingLock(lockPath, 2002, { marker: "owner" }),
      createStalePendingLock(lockPath, 2003, { marker: "owner", fresh: true }),
      createStalePendingLock(lockPath, 2004, { marker: "unexpected" }),
      createStalePendingLock(lockPath, 2005),
      createStalePendingLock(lockPath, 2006, { marker: "owner" }),
    ]);
    const mixedSibling = emittedSibling.replace("invocations.jsonl", "Invocations.jsonl");
    await rename(emittedSibling, mixedSibling);
    const owner = (await readdir(mixedMarker))[0] ?? "";
    await rename(join(mixedMarker, owner), join(mixedMarker, owner.replace("owner", "Owner")));

    await recordAgainstLiveStableLock(cwd, (pid) => pid === 2002);

    expect(await readdir(live)).toHaveLength(1);
    expect(await readdir(fresh)).toHaveLength(1);
    expect(await readdir(malformed)).toEqual(["unexpected"]);
    expect(await readdir(mixedSibling)).toEqual([]);
    expect(await readdir(mixedMarker)).toHaveLength(1);
  });

  it("advances past 32 retained prefix candidates on the next call", async () => {
    const cwd = tempRoot();
    const lockPath = join(cwd, ".dysflow", "runtime", "invocations.jsonl.lock");
    const pendingPaths = await Promise.all(
      Array.from({ length: 33 }, (_, index) =>
        createStalePendingLock(lockPath, 2100 + index, { marker: "owner" }),
      ),
    );

    const recorder = await recordAgainstLiveStableLock(cwd, (pid) => pid !== 2132);

    expect(await readdir(pendingPaths[0] ?? "")).toHaveLength(1);
    expect(await readdir(pendingPaths[32] ?? "")).toHaveLength(1);
    await expect(recorder.record(PENDING_LOCK_ENTRY)).rejects.toThrow(
      "Timed out acquiring invocation telemetry lock",
    );
    await expect(readdir(pendingPaths[32] ?? "")).rejects.toThrow();
  });
});
