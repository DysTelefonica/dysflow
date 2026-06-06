import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry.js";

const base = {
  operationId: "op-1",
  action: "run" as const,
  accessPath: "C:/data/app.accdb",
  projectRootAbs: "C:/repo/app",
  destinationRootAbs: "C:/repo/app/out",
  metadata: { procedureName: "Refresh" },
};

describe("FileAccessOperationRegistry sharing", () => {
  it("shares operations between two registry instances sharing the same file path", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-ops-sharing-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    try {
      const registryA = new FileAccessOperationRegistry({ filePath: registryPath });
      const registryB = new FileAccessOperationRegistry({ filePath: registryPath });

      // Create operation via registryA
      await registryA.create({
        ...base,
        operationId: "op-sharing-1",
        status: "starting",
        accessPid: null,
        processStartTime: null,
        updatedAt: "2026-06-03T12:00:00.000Z",
      });

      // Assert that registryB sees it
      const recent = await registryB.listRecent({ limit: 10 });
      expect(recent).toHaveLength(1);
      expect(recent[0]?.operationId).toBe("op-sharing-1");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
