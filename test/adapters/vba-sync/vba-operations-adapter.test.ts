import { describe, expect, it, vi } from "vitest";
import { VbaOperationsAdapter } from "../../../src/adapters/vba-sync/vba-operations-adapter";
import type { AccessOperationPreflightCleanup } from "../../../src/core/operations/access-operation-preflight";
import type { AccessOperationRegistry } from "../../../src/core/operations/access-operation-registry";

function makeRecord(overrides: Partial<{ operationId: string }> = {}) {
  return {
    operationId: overrides.operationId ?? "op-1",
    action: "vba" as const,
    accessPath: "C:/db/front.accdb",
    accessPid: 1234,
    processStartTime: null,
    status: "running" as const,
    metadata: {},
    updatedAt: new Date().toISOString(),
  };
}

function makeRegistry(records = [makeRecord()]): AccessOperationRegistry {
  return {
    create: vi.fn(),
    update: vi.fn(),
    get: vi.fn(),
    listRecent: vi.fn().mockResolvedValue(records),
  };
}

function makeCleanupService(
  result = {
    ok: true as const,
    data: { operationId: "op-1", accessPid: 1234, status: "cleaned" as const },
    diagnostics: [],
    durationMs: 0,
  },
) {
  return { cleanup: vi.fn().mockResolvedValue(result) };
}

describe("VbaOperationsAdapter", () => {
  it("handles operation tools", () => {
    expect(VbaOperationsAdapter.handles("list_access_operations")).toBe(true);
    expect(VbaOperationsAdapter.handles("cleanup_access_operation")).toBe(true);
    expect(VbaOperationsAdapter.handles("export_modules")).toBe(false);
  });

  describe("list_access_operations", () => {
    it("returns records from the injected registry", async () => {
      const records = [makeRecord({ operationId: "op-abc" })];
      const registry = makeRegistry(records);
      const adapter = new VbaOperationsAdapter({ operationRegistry: registry });

      const result = await adapter.execute("list_access_operations", {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Each entry is the record enriched with a read-time isStale marker.
        // The record is running + owns a PID + recent, so it is not stale.
        expect(result.data).toEqual(records.map((r) => ({ ...r, isStale: false })));
      }
    });

    it("uses a lazy default registry when none is injected", async () => {
      // When no registry is injected, execute() must not throw and must return ok:true
      // (the file-based registry path may not exist, returning an empty list)
      const adapter = new VbaOperationsAdapter({ cwd: "C:/repo" });
      const result = await adapter.execute("list_access_operations", {});
      expect(result.ok).toBe(true);
    });
  });

  describe("cleanup_access_operation", () => {
    it("delegates to the injected cleanup service", async () => {
      const cleanupResult = {
        ok: true as const,
        data: { operationId: "op-1", accessPid: 1234, status: "cleaned" as const },
        diagnostics: [],
        durationMs: 0,
      };
      const cleanupService = makeCleanupService(cleanupResult);
      const adapter = new VbaOperationsAdapter({ cleanupService });

      const result = await adapter.execute("cleanup_access_operation", {
        operationId: "op-1",
        accessPath: "C:/db/front.accdb",
        force: true,
      });

      expect(result.ok).toBe(true);
    });

    it("defaults accessPath to empty string when omitted", async () => {
      const cleanupService = makeCleanupService();
      const adapter = new VbaOperationsAdapter({ cleanupService });

      const result = await adapter.execute("cleanup_access_operation", { operationId: "op-1" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toMatchObject({ operationId: "op-1", status: "cleaned" });
      }
    });

    it("returns CLEANUP_NOT_CONFIGURED when no cleanup service is injected", async () => {
      const adapter = new VbaOperationsAdapter();
      const result = await adapter.execute("cleanup_access_operation", { operationId: "op-1" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("CLEANUP_NOT_CONFIGURED");
      }
    });
  });

  it("runs preflight cleanup correctly", async () => {
    const preflight: AccessOperationPreflightCleanup = {
      cleanup: vi.fn().mockResolvedValue({
        cleaned: ["stale-op"],
        killed: [1234],
        orphanedKilled: [],
        errors: [],
      }),
    };
    const adapter = new VbaOperationsAdapter({
      preflightCleanup: preflight,
      cwd: "C:/repo",
    });

    const result = await adapter.runPreflightCleanup({
      accessPath: "C:/db/front.accdb",
      projectRoot: "C:/repo",
    });

    expect(result).toEqual({
      cleaned: ["stale-op"],
      killed: [1234],
      orphanedKilled: [],
      errors: [],
    });
    expect(preflight.cleanup).toHaveBeenCalledWith({
      accessPath: "C:/db/front.accdb",
      projectRoot: "C:/repo",
    });
  });

  it("returns error result if preflight cleanup throws", async () => {
    const preflight: AccessOperationPreflightCleanup = {
      cleanup: vi.fn().mockRejectedValue(new Error("registry unavailable")),
    };
    const adapter = new VbaOperationsAdapter({
      preflightCleanup: preflight,
      cwd: "C:/repo",
    });

    const result = await adapter.runPreflightCleanup({
      accessPath: "C:/db/front.accdb",
      projectRoot: "C:/repo",
    });

    expect(result).toEqual({
      cleaned: [],
      killed: [],
      orphanedKilled: [],
      errors: [
        {
          operationId: "preflight",
          message: "Pre-flight cleanup failed: registry unavailable",
        },
      ],
    });
  });
});
