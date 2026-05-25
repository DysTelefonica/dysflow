import { describe, expect, it } from "vitest";
import {
  type AccessOperationRecord,
  type AccessOperationStatus,
  InMemoryAccessOperationRegistry,
} from "../../../src/core/operations/access-operation-registry.js";

function makeRecord(overrides: Partial<AccessOperationRecord> = {}): AccessOperationRecord {
  return {
    operationId: "op-1",
    action: "vba",
    accessPath: "C:/data/app.accdb",
    accessPid: 1234,
    processStartTime: "2026-01-01T00:00:00.000Z",
    status: "running",
    metadata: {},
    updatedAt: "2026-01-01T00:01:00.000Z",
    ...overrides,
  };
}

describe("InMemoryAccessOperationRegistry — purge parity with FileRegistry", () => {
  describe("create()", () => {
    it.each([
      ["completed", "completed" as AccessOperationStatus],
      ["cleaned", "cleaned" as AccessOperationStatus],
    ])("does NOT insert a record with status %s", async (_label, status) => {
      const registry = new InMemoryAccessOperationRegistry();
      const record = makeRecord({ status });
      await registry.create(record);
      await expect(registry.get("op-1")).resolves.toBeUndefined();
    });

    it.each([
      ["running", "running" as AccessOperationStatus],
      ["starting", "starting" as AccessOperationStatus],
      ["failed", "failed" as AccessOperationStatus],
      ["timed_out", "timed_out" as AccessOperationStatus],
      ["cleanup_pending", "cleanup_pending" as AccessOperationStatus],
    ])("inserts and returns a record with active status %s", async (_label, status) => {
      const registry = new InMemoryAccessOperationRegistry();
      const record = makeRecord({ status });
      const result = await registry.create(record);
      expect(result.status).toBe(status);
      await expect(registry.get("op-1")).resolves.toMatchObject({ status });
    });

    it("still returns the record even when it is not inserted (purged status)", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      const record = makeRecord({ status: "completed" });
      const result = await registry.create(record);
      expect(result.status).toBe("completed");
    });
  });

  describe("update()", () => {
    it.each([
      ["completed", "completed" as AccessOperationStatus],
      ["cleaned", "cleaned" as AccessOperationStatus],
    ])("removes an existing record when patched to status %s", async (_label, status) => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create(makeRecord({ status: "running" }));
      await registry.update("op-1", { status });
      await expect(registry.get("op-1")).resolves.toBeUndefined();
    });

    it.each([
      ["completed", "completed" as AccessOperationStatus],
      ["cleaned", "cleaned" as AccessOperationStatus],
    ])("still returns the patched record when removing on status %s", async (_label, status) => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create(makeRecord({ status: "running" }));
      const result = await registry.update("op-1", { status });
      expect(result?.status).toBe(status);
    });

    it("keeps record for non-purged status update", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create(makeRecord({ status: "running" }));
      await registry.update("op-1", { status: "timed_out" });
      await expect(registry.get("op-1")).resolves.toMatchObject({ status: "timed_out" });
    });

    it("returns undefined when operationId does not exist", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      await expect(registry.update("no-such-id", { status: "cleaned" })).resolves.toBeUndefined();
    });
  });
});
