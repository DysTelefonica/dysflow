/**
 * Issue #1993 T5 — `test_vba` progress and cancellation through the
 * per-project services the stdio server really serves.
 *
 * The real-Access smoke found that the run's marker advanced after every test
 * while the MCP client received no progress notification and a detached run's
 * state never moved: the per-project `createDynamicServices` wrapper dropped
 * the execution options (`onProgress`, `signal`) the dispatcher passes for
 * `test_vba`. These tests serve the tools from `createDynamicServices` against
 * a temp project and fake only the PowerShell spawn.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDynamicServices, startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import {
  type VbaManagerExecutionRequest,
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter.js";
import { successResult } from "../../../src/core/contracts/index.js";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry.js";

const PLAN = ["Test_One", "Test_Two"] as const;
const PROCEDURES_JSON = JSON.stringify(PLAN.map((procedure) => ({ procedure })));
const RUN = [
  { procedure: "Test_One", ok: true, durationMs: 30 },
  { procedure: "Test_Two", ok: false, durationMs: 40, error: "assertion failed" },
] as const;

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dysflow-1993-dynamic-options-"));
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, ".dysflow"), { recursive: true });
  writeFileSync(join(root, "front.accdb"), "");
  writeFileSync(
    join(root, ".dysflow", "project.json"),
    `${JSON.stringify({ id: "dynamic-options", accessPath: "front.accdb", destinationRoot: "src", capabilities: { allowWrites: true } })}\n`,
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write the marker as Run-Tests does after `completed` tests (UTF-8 with a BOM). */
async function writeMarker(request: VbaManagerExecutionRequest, completed: number): Promise<void> {
  const operationFile = request.operationFile;
  if (operationFile === undefined) throw new Error("operationFile was not provided");
  await mkdir(dirname(operationFile), { recursive: true });
  const results = RUN.slice(0, completed);
  const passed = results.filter((test) => test.ok).length;
  const marker = {
    operationId: request.operationId,
    action: "Run-Tests",
    accessPid: 4321,
    processStartTime: "2026-11-06T07:00:00.000Z",
    status: "running",
    updatedAt: new Date().toISOString(),
    progress: {
      total: RUN.length,
      completed,
      passed,
      failed: completed - passed,
      currentTest: completed < RUN.length ? RUN[completed]?.procedure : null,
      results,
    },
  };
  await writeFile(operationFile, `\uFEFF${JSON.stringify(marker, null, 2)}`, "utf8");
}

function exited(stdout: string, extra: Record<string, unknown> = {}) {
  return { exitCode: 0, stdout, stderr: "", durationMs: 10, timedOut: false, ...extra };
}

/** The stdio tool set over `createDynamicServices`, with only the PowerShell spawn faked. */
function createTools(executor: VbaManagerExecutor) {
  const services = createDynamicServices(undefined, undefined, {
    cwd: root,
    env: {},
    serviceFactory: () => ({
      vbaService: { execute: async () => successResult({}) },
      queryService: { execute: async () => successResult({ rows: [] }) },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
      vbaSyncToolService: new VbaSyncAdapter({
        operationRegistry: new InMemoryAccessOperationRegistry(),
        preflightCleanup: {
          cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
        },
        runOwnedAccessProcesses: {
          processInspector: { getProcess: async () => undefined },
          processKiller: { kill: async () => undefined },
        },
        executor,
        markerPollIntervalMs: 5,
        timeoutMs: 60_000,
        cwd: root,
        accessPath: join(root, "front.accdb"),
        destinationRoot: join(root, "src"),
        env: {},
      }),
    }),
  });
  return createDysflowMcpTools({
    services,
    writes: true,
    writeExecutionPolicy: "developer",
    cwd: root,
  });
}

async function withClient<T>(
  executor: VbaManagerExecutor,
  use: (client: Client) => Promise<T>,
): Promise<T> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(createTools(executor), serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.1" }, { capabilities: {} });
  await client.connect(clientTransport);
  try {
    return await use(client);
  } finally {
    await client.close();
    await serverDone.catch(() => undefined);
  }
}

describe("test_vba through the per-project stdio services (#1993 T5)", () => {
  it("sends the client one progress notification per finished test", async () => {
    const executor: VbaManagerExecutor = async (request) => {
      for (let completed = 0; completed <= RUN.length; completed += 1) {
        await writeMarker(request, completed);
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
      return exited(
        `DYSFLOW_RESULT ${JSON.stringify({ tests: RUN.map((test) => ({ ...test, ok: true, returnValue: true })) })}`,
      );
    };
    const events: Array<{ progress: number; total?: number; message?: string }> = [];

    const isError = await withClient(executor, async (client) => {
      const result = await client.callTool(
        {
          name: "test_vba",
          arguments: { cwd: root, proceduresJson: PROCEDURES_JSON, apply: true },
        },
        undefined,
        {
          onprogress: (notification) => {
            events.push({
              progress: notification.progress,
              total: notification.total,
              message: notification.message,
            });
          },
        },
      );
      return result.isError === true;
    });

    expect(isError).toBe(false);
    expect(events).toEqual([
      { progress: 1, total: 2, message: "Test_One passed" },
      { progress: 2, total: 2, message: "Test_Two failed" },
    ]);
  });

  it("hands the client's cancellation to the PowerShell run", async () => {
    const controller = new AbortController();
    let ran = false;
    let signalSeen: AbortSignal | undefined;
    const executor: VbaManagerExecutor = async (request) => {
      ran = true;
      signalSeen = request.signal;
      await writeMarker(request, 1);
      controller.abort();
      const deadline = Date.now() + 2_000;
      while (request.signal?.aborted !== true && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      return exited("", { exitCode: null, aborted: request.signal?.aborted === true });
    };

    await withClient(executor, async (client) => {
      await client
        .callTool(
          {
            name: "test_vba",
            arguments: { cwd: root, proceduresJson: PROCEDURES_JSON, apply: true },
          },
          undefined,
          { signal: controller.signal },
        )
        .catch(() => undefined);
    });

    expect(ran).toBe(true);
    expect(signalSeen).toBeDefined();
    expect(signalSeen?.aborted).toBe(true);
  });
});
