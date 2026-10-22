import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";
import { AccessOperationCleanupService } from "../../../src/core/operations/access-operation-cleanup.js";
import {
  type AccessOperationRecord,
  InMemoryAccessOperationRegistry,
} from "../../../src/core/operations/access-operation-registry.js";

const record: AccessOperationRecord = {
  operationId: "registered-operation",
  action: "test",
  accessPath: "C:/fixture/frontend.accdb",
  accessPid: 999,
  processStartTime: "2026-01-01T00:00:00.000Z",
  status: "timed_out",
  metadata: { reason: "retain inspection evidence" },
  updatedAt: "2026-01-01T00:00:00.000Z",
};

async function fixture(overrides: Partial<AccessOperationRecord> = {}) {
  const registry = new InMemoryAccessOperationRegistry();
  await registry.create({ ...record, ...overrides });
  const update = vi.spyOn(registry, "update");
  const kill = vi.fn(async () => undefined);
  const getProcess = vi.fn(async () => undefined);
  const listProcesses = vi.fn(async () => []);
  const cleanupService = new AccessOperationCleanupService({
    registry,
    processInspector: { getProcess },
    processKiller: { kill },
    processScanner: { listProcesses },
  });
  const tools = createDysflowMcpTools({
    services: {
      vbaService: { execute: async () => successResult({}) },
      queryService: { execute: async () => successResult({}) },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
      operationRegistry: registry,
      cleanupService,
    },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(tools, serverTransport, {
    resultValidationPolicy: "enforce",
  });
  const client = new Client({ name: "cleanup-inspection-test", version: "0.0.0" });
  await client.connect(clientTransport);
  return {
    registry,
    update,
    kill,
    getProcess,
    listProcesses,
    call: (args: Record<string, unknown>) =>
      client.callTool({
        name: "cleanup_access_operation",
        arguments: { operationId: record.operationId, accessPath: record.accessPath, ...args },
      }),
    close: async () => {
      await client.close();
      await serverDone.catch(() => undefined);
    },
  };
}

describe("explicit force:false cleanup inspection — #1830", () => {
  it.each([
    { status: "starting", accessPid: null, processStartTime: null },
    { status: "timed_out" },
    { status: "running" },
    { status: "pid_unknown", accessPid: null, processStartTime: null },
  ] satisfies Partial<AccessOperationRecord>[])(
    "retains registered/stale evidence %j without effects",
    async (overrides) => {
      const env = await fixture(overrides);
      const before = await env.registry.listRecent();
      try {
        const result = await env.call({ force: false });
        expect(result).toMatchObject({
          schemaVersion: "dysflow.result/v1",
          isError: false,
          ok: true,
          structuredContent: {
            cleanup: {
              operationId: record.operationId,
              accessPid: overrides.accessPid === undefined ? record.accessPid : overrides.accessPid,
              status: overrides.status,
            },
            registryHealth: { status: "ok" },
          },
        });
        expect(await env.registry.listRecent()).toEqual(before);
        expect(env.update).not.toHaveBeenCalled();
        expect(env.kill).not.toHaveBeenCalled();
        expect(env.getProcess).not.toHaveBeenCalled();
        expect(env.listProcesses).not.toHaveBeenCalled();
      } finally {
        await env.close();
      }
    },
  );

  it.each([
    [{ operationId: "missing", force: false }, "CLEANUP_OPERATION_NOT_FOUND"],
    [{ accessPath: "C:/another/frontend.accdb", force: false }, "CLEANUP_ACCESS_PATH_MISMATCH"],
  ])("retains typed refusal and unchanged state for %j", async (args, code) => {
    const env = await fixture();
    const before = await env.registry.listRecent();
    try {
      expect(await env.call(args)).toMatchObject({ isError: true, error: { code } });
      expect(await env.registry.listRecent()).toEqual(before);
      expect(env.update).not.toHaveBeenCalled();
      expect(env.kill).not.toHaveBeenCalled();
    } finally {
      await env.close();
    }
  });

  it("preserves omitted-force dead-PID cleanup", async () => {
    const env = await fixture();
    try {
      expect(await env.call({})).toMatchObject({
        isError: false,
        structuredContent: {
          cleanup: { operationId: record.operationId, accessPid: 999, status: "cleaned" },
          registryHealth: { status: "ok" },
        },
      });
      expect(await env.registry.get(record.operationId)).toBeUndefined();
      expect(env.kill).not.toHaveBeenCalled();
    } finally {
      await env.close();
    }
  });
});
