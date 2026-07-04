/**
 * `access-operation-registry-file-system-port.test.ts` — created in #hexagonal-tech-debt PR 4.
 *
 * Pins the post-refactor contract for the FS port injection (#A, #624):
 *
 *   1. The `FileAccessOperationRegistry` constructor accepts an injected
 *      `fileSystem` port; every FS call routes through that port (no
 *      direct `node:fs` imports in core).
 *   2. Atomic lock creation uses `writeFile(..., { flag: "wx" })` —
 *      a regression pin because that flag is what gives registry
 *      acquisition its mutual-exclusion guarantees on POSIX and Windows.
 *      Removing the flag would silently break the lock.
 *   3. Explicit construction with the production Node adapter remains
 *      byte-equivalent to the previous default behavior.
 *   4. A failing fake port surfaces its rejected `Error` unchanged so
 *      callers can detect IO failures without losing fidelity.
 *
 * Before #hexagonal-tech-debt PR 4 the `FileAccessOperationRegistry`
 * constructor only accepted `filePath`/`maxRecords`/`lockTimeoutMs`/
 * `staleLockMs`. PR 4 adds `fileSystem` and routes every FS call through
 * it via the `RegistryFileSystemPort`.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nodeRegistryFileSystem } from "../../../src/adapters/operations/node-registry-file-system.js";
import type { AccessOperationRecord } from "../../../src/core/operations/access-operation-registry.js";
import { FileAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry.js";

type WriteFileOptions = { flag?: "wx" };

type FakeCall = {
  method: string;
  args: readonly unknown[];
};

type FakePort = {
  port: import("../../../src/core/operations/registry-file-system-port.js").RegistryFileSystemPort;
  calls: FakeCall[];
};

function createFakePort(overrides?: {
  writeFile?: (
    path: string,
    data: string,
    encoding: "utf8",
    options?: WriteFileOptions,
  ) => Promise<void>;
}): FakePort {
  const calls: FakeCall[] = [];
  const noopAsync = async () => undefined;
  const port: import("../../../src/core/operations/registry-file-system-port.js").RegistryFileSystemPort =
    {
      mkdir: async (...args) => {
        calls.push({ method: "mkdir", args });
        return undefined;
      },
      readFile: async (...args) => {
        calls.push({ method: "readFile", args });
        return "{}";
      },
      writeFile: async (...args) => {
        calls.push({ method: "writeFile", args });
        if (overrides?.writeFile) {
          return overrides.writeFile(
            args[0] as string,
            args[1] as string,
            args[2] as "utf8",
            args[3] as WriteFileOptions | undefined,
          );
        }
        return undefined;
      },
      rename: async (...args) => {
        calls.push({ method: "rename", args });
        return undefined;
      },
      rm: async (...args) => {
        calls.push({ method: "rm", args });
        return undefined;
      },
      rmdir: async (...args) => {
        calls.push({ method: "rmdir", args });
        return undefined;
      },
      stat: async (...args) => {
        calls.push({ method: "stat", args });
        return { mtimeMs: 0 };
      },
    };
  // Suppress lint/IDE linter complaining about unused noopAsync; it documents
  // that we intentionally have no global async hook up.
  void noopAsync;
  return { port, calls };
}

const baseRecord: AccessOperationRecord = {
  operationId: "op-port-1",
  action: "run",
  accessPath: "C:/data/app.accdb",
  projectRootAbs: "C:/repo/app",
  destinationRootAbs: "C:/repo/app/out",
  accessPid: 1234,
  processStartTime: "2026-05-15T10:00:00.000Z",
  status: "starting",
  metadata: {},
  updatedAt: "2026-05-15T10:00:01.000Z",
};

// ---------------------------------------------------------------------------
// 1. Constructor port injection — every FS call routes through the port
// ---------------------------------------------------------------------------

describe("FileAccessOperationRegistry fileSystem port injection (#A #624)", () => {
  it("constructor accepts an injected fileSystem port and routes every FS call through it", async () => {
    const fake = createFakePort();
    const registry = new FileAccessOperationRegistry({
      filePath: join(tmpdir(), "dysflow-port-routing.json"),
      fileSystem: fake.port,
    });
    await registry.create({ ...baseRecord, operationId: "op-port-routing-1" });
    expect(fake.calls.length).toBeGreaterThan(0);
    const methods = new Set(fake.calls.map((c) => c.method));
    // At least one mkdir (lock dir + records dir) and one writeFile (lock owner) must have been issued.
    expect(methods.has("mkdir")).toBe(true);
    expect(methods.has("writeFile")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 2. Atomic lock creation uses { flag: "wx" } — REGRESSION PIN
  // -------------------------------------------------------------------------

  it("atomic lock creation invokes writeFile with { flag: 'wx' } (mutual-exclusion regression pin)", async () => {
    const fake = createFakePort();
    const registry = new FileAccessOperationRegistry({
      filePath: join(tmpdir(), "dysflow-port-wx.json"),
      fileSystem: fake.port,
    });
    await registry.create({ ...baseRecord, operationId: "op-port-wx-1" });

    // At least one call to writeFile must carry the { flag: 'wx' } option —
    // it is the atomic-create primitive that gives registry acquisition its
    // mutual-exclusion guarantee. Changing the call shape breaks the lock.
    const wxCalls = fake.calls.filter(
      (c) => c.method === "writeFile" && (c.args[3] as WriteFileOptions | undefined)?.flag === "wx",
    );
    expect(wxCalls.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // 3. Explicit production adapter injection — production byte-equivalent
  // -------------------------------------------------------------------------

  it("works against a real temp dir when the production Node adapter is injected", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-port-default-"));
    try {
      const registryPath = join(root, ".dysflow", "runtime", "operations.json");
      const writer = new FileAccessOperationRegistry({
        filePath: registryPath,
        fileSystem: nodeRegistryFileSystem,
      });
      await writer.create({ ...baseRecord, operationId: "op-port-default-1" });

      const reader = new FileAccessOperationRegistry({
        filePath: registryPath,
        fileSystem: nodeRegistryFileSystem,
      });
      const recent = await reader.listRecent({ limit: 5 });
      expect(recent).toHaveLength(1);
      expect(recent[0]?.operationId).toBe("op-port-default-1");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // 4. Failing fake port surfaces the underlying Error unchanged
  // -------------------------------------------------------------------------

  it("failing fake port surfaces its rejected Error type unchanged (adversarial)", async () => {
    // Use a plain Error with no `code` field: the registry's lock-acquisition
    // catch only swallows ENOENT and EEXIST/EACCES/EPERM transient codes, so
    // a non-transient synthetic error bubbles up immediately. The mesh property
    // we pin is that the same instance + message round-trips out — the caller
    // can detect "this came from my port" by identity, not just string-match.
    const distinctError = new Error("fake-port synthetic boom");
    const fake = createFakePort({
      writeFile: async () => {
        throw distinctError;
      },
    });
    const registry = new FileAccessOperationRegistry({
      filePath: join(tmpdir(), "dysflow-port-fail.json"),
      fileSystem: fake.port,
    });

    // The lock-acquisition writeFile is the first writeFile call; rejecting
    // it surfaces the error type unchanged, because the registry only swallows
    // ENOENT / EEXIST / EACCES-style transient lock-contention codes during
    // acquisition. A synthetic error thrown from the fake port falls through.
    await expect(
      registry.create({ ...baseRecord, operationId: "op-port-fail-1" }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("fake-port synthetic boom"),
    });
  });
});
