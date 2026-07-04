import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nodeRegistryFileSystem } from "../../../src/adapters/operations/node-registry-file-system.js";
import {
  type AccessOperationRecord,
  FileAccessOperationRegistry,
  InMemoryAccessOperationRegistry,
} from "../../../src/core/operations/access-operation-registry.js";

const baseRecord: AccessOperationRecord = {
  operationId: "op-1",
  action: "run",
  accessPath: "C:/data/app.accdb",
  projectRootAbs: "C:/repo/app",
  destinationRootAbs: "C:/repo/app/out",
  accessPid: 1234,
  processStartTime: "2026-05-15T10:00:00.000Z",
  status: "completed",
  metadata: {},
  updatedAt: "2026-05-15T10:00:01.000Z",
};

describe("AccessOperationRegistry health + quarantine — DELTA-001 (#575)", () => {
  let tempRoot: string;
  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "dysflow-registry-quarantine-"));
  });
  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  describe("InMemoryAccessOperationRegistry.getHealth", () => {
    it("returns ok status (in-memory registry cannot be corrupt)", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      const health = registry.getHealth();
      expect(health.status).toBe("ok");
      // The ok variant of `AccessOperationRegistryHealth` is the bare object;
      // degraded-only fields (`quarantinePath`, `reason`) are simply not present.
      expect((health as { quarantinePath?: string }).quarantinePath).toBeUndefined();
      expect((health as { reason?: string }).reason).toBeUndefined();
    });

    it("stays ok after creating records", async () => {
      const registry = new InMemoryAccessOperationRegistry();
      await registry.create(baseRecord);
      expect(registry.getHealth().status).toBe("ok");
    });
  });

  describe("FileAccessOperationRegistry.getHealth — clean state", () => {
    it("returns ok when the registry file does not exist (first-run state)", async () => {
      const registryPath = join(tempRoot, ".dysflow", "runtime", "operations.json");
      const registry = new FileAccessOperationRegistry({
        filePath: registryPath,
        fileSystem: nodeRegistryFileSystem,
      });
      expect(registry.getHealth().status).toBe("ok");
    });

    it("returns ok after a successful write", async () => {
      const registryPath = join(tempRoot, ".dysflow", "runtime", "operations.json");
      const registry = new FileAccessOperationRegistry({
        filePath: registryPath,
        fileSystem: nodeRegistryFileSystem,
      });
      await registry.create(baseRecord);
      expect(registry.getHealth().status).toBe("ok");
    });
  });

  describe("FileAccessOperationRegistry — corrupt JSON quarantine (#575)", () => {
    it("renames the corrupt file to .quarantine-<ISO>.json sidecar with the original contents preserved", async () => {
      const registryPath = join(tempRoot, ".dysflow", "runtime", "operations.json");
      await mkdir(dirname(registryPath), { recursive: true });
      const garbage = "{ not valid json {{{";
      await writeFile(registryPath, garbage, "utf8");

      // Silence the swallowed-io log during this scenario.
      vi.spyOn(console, "debug").mockImplementation(() => {});

      const registry = new FileAccessOperationRegistry({
        filePath: registryPath,
        fileSystem: nodeRegistryFileSystem,
      });
      const records = await registry.listRecent();

      expect(records).toEqual([]);

      // Original file no longer at registryPath
      expect(existsSync(registryPath)).toBe(false);

      // A sidecar matching .quarantine-<ISO>.json exists in the same dir
      const siblings = await readdir(dirname(registryPath));
      const quarantine = siblings.find((name) => /\.quarantine-.*\.json$/.test(name));
      expect(quarantine).toBeDefined();
      if (quarantine === undefined) {
        throw new Error("expected at least one quarantine sidecar to exist");
      }
      const quarantinePath = join(dirname(registryPath), quarantine);
      expect(readFileSync(quarantinePath, "utf8")).toBe(garbage);
    });

    it("getHealth returns degraded with quarantinePath, quarantinedAt, and reason after corrupt read", async () => {
      const registryPath = join(tempRoot, ".dysflow", "runtime", "operations.json");
      await mkdir(dirname(registryPath), { recursive: true });
      await writeFile(registryPath, "{ not valid json }", "utf8");

      vi.spyOn(console, "debug").mockImplementation(() => {});

      const registry = new FileAccessOperationRegistry({
        filePath: registryPath,
        fileSystem: nodeRegistryFileSystem,
      });
      // Trigger the read
      await registry.listRecent();

      const health = registry.getHealth();
      expect(health.status).toBe("degraded");
      if (health.status !== "degraded") {
        throw new Error("expected degraded health");
      }
      expect(health.reason).toBe("corrupt-json");
      expect(health.quarantinePath).toBeDefined();
      expect(health.quarantinedAt).toBeDefined();
      // quarantinedAt is ISO 8601
      expect(() => new Date(health.quarantinedAt).toISOString()).not.toThrow();
      // quarantinePath is an absolute path that exists
      expect(existsSync(health.quarantinePath)).toBe(true);
    });

    it("does not quarantine when the registry file is missing (ENOENT is not corruption)", async () => {
      const registryPath = join(tempRoot, ".dysflow", "runtime", "operations.json");
      // Note: NO mkdir/write — file does not exist.

      vi.spyOn(console, "debug").mockImplementation(() => {});

      const registry = new FileAccessOperationRegistry({
        filePath: registryPath,
        fileSystem: nodeRegistryFileSystem,
      });
      const records = await registry.listRecent();

      expect(records).toEqual([]);
      expect(registry.getHealth().status).toBe("ok");
    });
  });
});
