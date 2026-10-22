import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import type { InvocationTelemetryEntry } from "../../../src/adapters/mcp/invocation-telemetry.js";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools.js";
import { nodeLockFileSystem } from "../../../src/adapters/runner/node-lock-file-system.js";
import type {
  PowerShellExecutionResult,
  PowerShellExecutor,
} from "../../../src/core/contracts/index.js";
import { successResult } from "../../../src/core/contracts/index.js";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry.js";
import { AccessPowerShellRunner, RESULT_MARKER } from "../../../src/core/runner/access-runner.js";
import { AccessQueryService } from "../../../src/core/services/query-service.js";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const completed: PowerShellExecutionResult = {
  exitCode: 0,
  stdout: `${RESULT_MARKER}${JSON.stringify({ rows: [{ value: 1 }] })}`,
  stderr: "",
  durationMs: 1,
  timedOut: false,
};

async function harness(
  executor: PowerShellExecutor,
  beforeDispatch?: () => Promise<void>,
  writes = false,
) {
  const root = mkdtempSync(join(tmpdir(), "dysflow-1834-cancellation-"));
  const runner = new AccessPowerShellRunner({
    executor,
    operationRegistry: new InMemoryAccessOperationRegistry(),
    lockFileSystem: nodeLockFileSystem,
    fileExists: () => true,
    preflightCleanup: {
      cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
    },
  });
  const queryService = new AccessQueryService({
    runner,
    config: {
      accessDbPath: join(root, "app.accdb"),
      timeoutMs: 5000,
      allowWrites: writes,
      configSource: "explicit-request",
    },
  });
  const tools = createDysflowMcpTools({
    services: {
      queryService,
      vbaService: { execute: async () => successResult({}) },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
    } as DysflowMcpServices,
    writes,
    cwd: root,
  });
  const entries: InvocationTelemetryEntry[] = [];
  const recorded = deferred<InvocationTelemetryEntry>();
  const recorder = {
    record: async (entry: InvocationTelemetryEntry) => {
      entries.push(entry);
      recorded.resolve(entry);
    },
  };
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await startWithSdkServer(tools, serverTransport, {
    invocationRecorder: recorder,
    ...(beforeDispatch === undefined
      ? {}
      : {
          invocationContextResolver: async () => {
            await beforeDispatch();
            return { recorder, writeExecutionPolicy: "safe-by-default" as const };
          },
        }),
  });
  const client = new Client({ name: "cancellation-test", version: "1" });
  await client.connect(clientTransport);
  return {
    client,
    queryService,
    entries,
    recorded: recorded.promise,
    close: () => client.close(),
    root,
  };
}

describe("MCP request cancellation (#1834)", () => {
  it("does not start I/O when cancelled during request resolution", async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    let calls = 0;
    const h = await harness(
      async () => {
        calls++;
        return completed;
      },
      async () => {
        entered.resolve();
        await release.promise;
      },
    );
    const controller = new AbortController();
    try {
      const pending = h.client
        .callTool(
          { name: "query_execute", arguments: { mode: "read", sql: "SELECT 1" } },
          undefined,
          { signal: controller.signal },
        )
        .catch((error) => error);
      await entered.promise;
      controller.abort();
      await pending;
      release.resolve();
      await h.recorded;
      expect(calls).toBe(0);
      expect(h.entries[0]?.outcome).toBe("error");
    } finally {
      release.resolve();
      await h.close();
    }
  });

  it.each(["query_execute", "query_sql"])(
    "propagates cancellation through %s to the executor",
    async (name) => {
      const started = deferred<AbortSignal | undefined>();
      const finished = deferred<void>();
      const h = await harness(async (_command, _args, options) => {
        const signal = (options as { signal?: AbortSignal }).signal;
        started.resolve(signal);
        if (signal === undefined) return completed;
        return new Promise((resolve) =>
          signal.addEventListener(
            "abort",
            () => {
              resolve({ ...completed, exitCode: null, stdout: "", aborted: true });
              finished.resolve();
            },
            { once: true },
          ),
        );
      });
      const controller = new AbortController();
      try {
        const pending = h.client
          .callTool(
            {
              name,
              arguments: { sql: "SELECT 1", ...(name === "query_execute" ? { mode: "read" } : {}) },
            },
            undefined,
            { signal: controller.signal },
          )
          .catch((error) => error);
        const signal = await started.promise;
        expect(signal).toBeInstanceOf(AbortSignal);
        controller.abort();
        await pending;
        await finished.promise;
        expect(signal?.aborted).toBe(true);
        await h.recorded;
        expect(h.entries[0]?.errorCode).toBe("RUNNER_ABORTED");
      } finally {
        controller.abort();
        await h.close();
      }
    },
  );

  it("preserves normal results, progress and audit", async () => {
    const h = await harness(async (_command, _args, options) => {
      options.onProgress?.(40, 100, "Executing");
      return completed;
    });
    try {
      const progress: number[] = [];
      const result = await h.client.callTool(
        { name: "query_execute", arguments: { mode: "read", sql: "SELECT 1" } },
        undefined,
        {
          onprogress: (notification) => {
            progress.push(notification.progress);
          },
        },
      );
      expect(result.isError).toBeFalsy();
      expect(result.content).toEqual([
        { type: "text", text: expect.stringContaining('"value":1') },
      ]);
      expect(progress).toEqual([40]);
      expect(h.entries).toHaveLength(1);
      expect(h.entries[0]).toMatchObject({
        tool: "query_execute",
        outcome: "ok",
        errorCode: null,
        writeIntent: "dryRun",
      });
    } finally {
      await h.close();
    }
  });

  it("retains a distinct timeout error", async () => {
    const h = await harness(async () => ({
      ...completed,
      exitCode: null,
      stdout: "",
      timedOut: true,
    }));
    try {
      const result = await h.client.callTool({
        name: "query_execute",
        arguments: { mode: "read", sql: "SELECT 1" },
      });
      expect(result.isError).toBe(true);
      expect(h.entries[0]?.errorCode).toBe("RUNNER_TIMEOUT");
    } finally {
      await h.close();
    }
  });

  it("returns cancellation without starting an already-cancelled service read", async () => {
    let calls = 0;
    const h = await harness(async () => {
      calls++;
      return completed;
    });
    const controller = new AbortController();
    controller.abort();
    try {
      const result = await h.queryService.execute(
        { mode: "read", sql: "SELECT 1" },
        undefined,
        controller.signal,
      );
      expect(result).toMatchObject({ ok: false, error: { code: "RUNNER_ABORTED" } });
      expect(calls).toBe(0);
    } finally {
      await h.close();
    }
  });

  it("does not start a queued read after cancellation", async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    let calls = 0;
    const h = await harness(async () => {
      calls++;
      entered.resolve();
      await release.promise;
      return completed;
    });
    const controller = new AbortController();
    try {
      const first = h.queryService.execute({ mode: "read", sql: "SELECT 1" });
      await entered.promise;
      const queued = h.queryService.execute(
        { mode: "read", sql: "SELECT 2" },
        undefined,
        controller.signal,
      );
      controller.abort();
      release.resolve();
      await expect(first).resolves.toMatchObject({ ok: true });
      await expect(queued).resolves.toMatchObject({ ok: false, error: { code: "RUNNER_ABORTED" } });
      expect(calls).toBe(1);
    } finally {
      release.resolve();
      await h.close();
    }
  });

  it("allows an active write to complete and records its actual outcome", async () => {
    const started = deferred<AbortSignal | undefined>();
    const release = deferred<void>();
    const h = await harness(
      async (_command, _args, options) => {
        started.resolve(options.signal);
        await release.promise;
        return { ...completed, stdout: `${RESULT_MARKER}${JSON.stringify({ rowsAffected: 1 })}` };
      },
      undefined,
      true,
    );
    const controller = new AbortController();
    try {
      const pending = h.client
        .callTool(
          {
            name: "query_execute",
            arguments: { mode: "write", sql: "UPDATE Example SET Value = 1", apply: true },
          },
          undefined,
          { signal: controller.signal },
        )
        .catch((error) => error);
      expect(await started.promise).toBeUndefined();
      controller.abort();
      await pending;
      release.resolve();
      await h.recorded;
      expect(h.entries[0]).toMatchObject({ outcome: "ok", errorCode: null, writeIntent: "apply" });
    } finally {
      release.resolve();
      await h.close();
    }
  });
});
