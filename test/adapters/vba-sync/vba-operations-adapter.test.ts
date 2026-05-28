import { describe, expect, it, vi } from "vitest";
import { VbaOperationsAdapter } from "../../../src/adapters/vba-sync/vba-operations-adapter";
import type { AccessOperationPreflightCleanup } from "../../../src/core/operations/access-operation-preflight";

describe("VbaOperationsAdapter", () => {
  it("handles operation tools", () => {
    expect(VbaOperationsAdapter.handles("list_access_operations")).toBe(true);
    expect(VbaOperationsAdapter.handles("cleanup_access_operation")).toBe(true);
    expect(VbaOperationsAdapter.handles("export_modules")).toBe(false);
  });

  it("returns TOOL_NOT_IMPLEMENTED for execute", async () => {
    const adapter = new VbaOperationsAdapter();
    const result = await adapter.execute("list_access_operations", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TOOL_NOT_IMPLEMENTED");
      expect(result.error.message).toContain("not implemented");
    }
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
