/**
 * #1993 T3c — hardening of the detached `test_vba` start after the T2 and
 * T3b reviews: the recorded write posture, stale synchronous records, a
 * single terminal write on a failed spawn, password handling and the lock
 * key of the driven binary.
 *
 * Driven through the real MCP `test_vba` tool, the real `VbaSyncAdapter` and
 * the real run store over a temporary project. Only Access (the PowerShell
 * executor), the detached spawn and process liveness are faked.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectConfigDiagnostic } from "../../../src/adapters/config/project-config-diagnostic";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { nodeTestRunFileSystem } from "../../../src/adapters/test-runs/node-test-run-file-system";
import type { VbaManagerExecutor } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { successResult } from "../../../src/core/contracts/index";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry";
import type { TestRunFileSystemPort } from "../../../src/core/test-runs/test-run-ports";
import { resolveTestRunsRoot, TestRunStore } from "../../../src/core/test-runs/test-run-store";
import {
  callTool,
  DetachedRunHarness,
  exited,
  PROCEDURES_JSON,
  runnerStdout,
} from "../../_helpers/detached-test-runs-1993";

const APPLY = { proceduresJson: PROCEDURES_JSON, apply: true };
const DETACH = { ...APPLY, detach: true };

let harness: DetachedRunHarness;

beforeEach(() => {
  harness = new DetachedRunHarness();
});

afterEach(() => {
  harness.dispose();
});

const neverEnding: VbaManagerExecutor = () => new Promise(() => undefined);

function testRunsDir(): string {
  return join(harness.root, ".dysflow", "runtime", "test-runs");
}

describe("write posture recorded for the runner (R1-writes-forced-on-runner)", () => {
  for (const sessionWritesEnabled of [false, true]) {
    it(`records the server's session write switch in request.json (${sessionWritesEnabled})`, async () => {
      const tools = harness.tools(harness.adapter(neverEnding, { sessionWritesEnabled }));

      const started = await callTool(tools, "test_vba", DETACH);

      expect(started.isError).toBe(false);
      const runDir = harness.spawns[0]?.runDir ?? "";
      const request = JSON.parse(readFileSync(join(runDir, "request.json"), "utf8")) as {
        writesEnabled?: unknown;
      };
      expect(request.writesEnabled).toBe(sessionWritesEnabled);
    });
  }

  // test_vba is not gated by the session switch (its route mutates no binary);
  // a read-only project is refused by the project-config gate, which the
  // runner's own tool set (createStdioToolRuntime) applies as well.
  it("refuses a detached start in a read-only project exactly like a synchronous apply", async () => {
    const readOnly: ProjectConfigDiagnostic = {
      status: "capabilities-disallow-write",
      cwd: harness.root,
      configPath: join(harness.root, ".dysflow", "project.json"),
      projectRoot: harness.root,
      projectId: "demo",
      accessPath: harness.accessPath,
      backendPath: null,
      destinationRoot: join(harness.root, "src"),
      writeReady: false,
      diagnostics: [
        {
          code: "CAPABILITIES_DISALLOW_WRITE",
          severity: "error",
          message: "Project 'demo' has capabilities.allowWrites = false.",
        },
      ],
      remediation: null,
    };
    const calls: number[] = [];
    const executor: VbaManagerExecutor = async () => {
      calls.push(1);
      return exited(runnerStdout([true, true]));
    };
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute: async () => successResult({ returnValue: "unused" }) },
        queryService: { execute: async () => successResult({ rows: [] }) },
        diagnosticsService: { run: async () => successResult({ checks: [] }) },
        vbaSyncToolService: harness.adapter(executor),
      },
      writes: true,
      projectConfigResolver: async () => readOnly,
      writeExecutionPolicy: "developer",
      cwd: harness.root,
      testRunStore: () => harness.store(),
    });

    const synchronous = await callTool(tools, "test_vba", APPLY);
    const detached = await callTool(tools, "test_vba", DETACH);

    expect(synchronous.isError).toBe(true);
    expect(detached.isError).toBe(true);
    expect(detached.structuredContent?.error?.code).toBe(
      synchronous.structuredContent?.error?.code,
    );
    expect(detached.structuredContent?.error?.code).toBe("CAPABILITIES_DISALLOW_WRITE");
    expect(calls).toEqual([]);
    expect(harness.spawns).toEqual([]);
    expect(existsSync(testRunsDir())).toBe(false);
  });
});

describe("a synchronous record without an Access PID (R3-null-pid-sync-record-pins-detached)", () => {
  async function registryWith(status: "starting" | "running", ageMs: number) {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({
      operationId: "dysflow-sync-no-pid",
      action: "vba",
      accessPath: harness.accessPath,
      accessPid: null,
      processStartTime: null,
      status,
      metadata: { toolName: "test_vba" },
      updatedAt: new Date(Date.now() - ageMs).toISOString(),
    });
    return registry;
  }

  for (const status of ["starting", "running"] as const) {
    it(`ignores a '${status}' record that has not moved for longer than the start window`, async () => {
      const registry = await registryWith(status, 10 * 60_000);
      const tools = harness.tools(harness.adapter(neverEnding, { operationRegistry: registry }));

      const detached = await callTool(tools, "test_vba", DETACH);

      expect(detached.isError).toBe(false);
      expect(harness.spawns).toHaveLength(1);
    });

    it(`still refuses while a fresh '${status}' record has no PID yet`, async () => {
      const registry = await registryWith(status, 1_000);
      const tools = harness.tools(harness.adapter(neverEnding, { operationRegistry: registry }));

      const detached = await callTool(tools, "test_vba", DETACH);

      expect(detached.isError).toBe(true);
      expect(detached.structuredContent?.error).toMatchObject({
        code: "TEST_RUN_ALREADY_ACTIVE",
        details: { runKind: "synchronous", activeOperationId: "dysflow-sync-no-pid" },
      });
      expect(harness.spawns).toEqual([]);
    });
  }
});

describe("a failed spawn ends the run once (R3-double-abandon-on-sync-spawn-failure)", () => {
  it("writes a single crashed state when the spawn errors and throws together", async () => {
    const crashWrites: string[] = [];
    const recording: TestRunFileSystemPort = {
      ...nodeTestRunFileSystem,
      async writeAtomic(path, text) {
        if (path.endsWith("state.json") && text.includes('"crashed"')) crashWrites.push(text);
        await nodeTestRunFileSystem.writeAtomic(path, text);
      },
    };
    const store = new TestRunStore({
      runsRoot: resolveTestRunsRoot(harness.root),
      fileSystem: recording,
      processProbe: harness.processes,
    });
    harness.spawnRunner = (_runDir, _env, onError) => {
      onError(new Error("async boom"));
      throw new Error("sync boom");
    };
    const tools = harness.tools(harness.adapter(neverEnding, { store: () => store }));

    const result = await callTool(tools, "test_vba", DETACH);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error?.code).toBe("TEST_RUN_SPAWN_FAILED");
    const operationId = String(result.structuredContent?.error?.details?.operationId);
    expect(crashWrites).toHaveLength(1);
    const view = await harness.store().readTestRun(operationId);
    expect(view).toMatchObject({ status: "crashed", error: { code: "TEST_RUN_SPAWN_FAILED" } });
    expect(view?.error?.message).toContain("sync boom");
    await expect(harness.store().getActiveDetachedRun(harness.accessPath)).resolves.toBeUndefined();
  });
});

describe("passwords never travel in the test_vba input (R3-explicit-password-dropped)", () => {
  for (const key of ["password", "accessPassword"]) {
    it(`rejects '${key}' at the MCP boundary, synchronous or detached, before any run`, async () => {
      const calls: number[] = [];
      const executor: VbaManagerExecutor = async () => {
        calls.push(1);
        return exited(runnerStdout([true, true]));
      };
      const tools = harness.tools(harness.adapter(executor));

      const synchronous = await callTool(tools, "test_vba", { ...APPLY, [key]: "s3cret" });
      const detached = await callTool(tools, "test_vba", { ...DETACH, [key]: "s3cret" });

      for (const result of [synchronous, detached]) {
        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.structuredContent?.error)).toContain(key);
      }
      expect(detached.structuredContent?.error?.code).toBe(
        synchronous.structuredContent?.error?.code,
      );
      expect(calls).toEqual([]);
      expect(harness.spawns).toEqual([]);
      expect(existsSync(testRunsDir())).toBe(false);
    });
  }
});

describe("lock key of the driven binary (R3-lock-key-vs-driven-binary)", () => {
  function variants(): string[] {
    const path = harness.accessPath;
    return [path.toUpperCase(), path.replace(/\\/g, "/"), path.replace(/\//g, "\\")].filter(
      (variant) => variant !== path,
    );
  }

  it("refuses a synchronous run on another spelling of the database a detached run holds", async () => {
    const calls: number[] = [];
    const executor: VbaManagerExecutor = async () => {
      calls.push(1);
      return exited(runnerStdout([true, true]));
    };
    const tools = harness.tools(harness.adapter(executor));
    const detached = await callTool(tools, "test_vba", DETACH);
    expect(detached.isError).toBe(false);

    for (const accessPath of variants()) {
      const synchronous = await callTool(tools, "test_vba", { ...APPLY, accessPath });
      expect(synchronous.structuredContent?.error).toMatchObject({
        code: "TEST_RUN_ALREADY_ACTIVE",
        details: { activeOperationId: detached.structuredContent?.operationId },
      });
      const second = await callTool(tools, "test_vba", { ...DETACH, accessPath });
      expect(second.structuredContent?.error).toMatchObject({
        code: "TEST_RUN_ALREADY_ACTIVE",
        details: { activeOperationId: detached.structuredContent?.operationId },
      });
    }
    expect(calls).toEqual([]);
    expect(harness.spawns).toHaveLength(1);
  });
});
