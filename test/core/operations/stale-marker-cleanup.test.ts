import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeStaleMarkerFileSystem } from "../../../src/adapters/operations/node-stale-marker-file-system.js";
import {
  cleanStaleMarkers,
  cleanupStaleMarkers,
} from "../../../src/core/operations/stale-marker-cleanup.js";
import type { StaleMarkerFileSystemPort } from "../../../src/core/operations/stale-marker-file-system-port.js";

/**
 * Stale marker auto-cleanup (#967).
 *
 *   - A marker with `status: "running"` AND `updatedAt` older than the
 *     configurable threshold is auto-marked `status: "abandoned"` on each
 *     new operation's startup.
 *   - Abandoned markers do NOT block write-gate decisions (write ops
 *     succeed even with abandoned markers present).
 *   - The threshold is configurable via
 *     `capabilities.staleMarkerThresholdMinutes` in `.dysflow/project.json`.
 *     Default 30 minutes.
 *
 * `cleanupStaleMarkers` is the pure unit that drives the transition. It
 * reads every `*.json` file under `markersRoot`, evaluates `status` and
 * `updatedAt`, and rewrites stale running markers with `status` flipped
 * to `"abandoned"`. The function is called from `diagnoseProjectConfig`
 * (the pre-write gate) so every new operation's first read also reaps stale
 * markers proactively.
 *
 * These tests inject the production Node adapter (`nodeStaleMarkerFileSystem`)
 * to exercise the real I/O surface — the port is a structural seam, not a
 * mock surface. Per `core-boundary.test.ts` the `src/core` module is the
 * contract surface; the port mismatch is caught at compile time.
 */

const NOW_MS = Date.parse("2026-07-18T12:00:00.000Z");

async function setupMarkerFile(root: string, name: string, body: Record<string, unknown>) {
  await writeFile(join(root, name), JSON.stringify(body), "utf8");
}

async function readMarkerFile(root: string, name: string): Promise<Record<string, unknown>> {
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(join(root, name), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("stale marker auto-cleanup (#967)", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dysflow-stale-markers-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("marks stale running markers as abandoned (updatedAt older than threshold)", async () => {
    const oneHourAgo = new Date(NOW_MS - 60 * 60 * 1000).toISOString();
    await setupMarkerFile(root, "op-stale.json", {
      operationId: "op-stale",
      accessPath: "C:/proj/app.accdb",
      projectRootAbs: "C:/proj",
      status: "running",
      updatedAt: oneHourAgo,
    });

    const result = await cleanupStaleMarkers({
      fileSystem: nodeStaleMarkerFileSystem,
      markersRoot: root,
      thresholdMs: 30 * 60 * 1000,
      nowMs: NOW_MS,
    });

    expect(result.cleaned).toEqual(["op-stale.json"]);
    expect(result.errors).toEqual([]);
    const after = await readMarkerFile(root, "op-stale.json");
    expect(after.status).toBe("abandoned");
    expect(after.operationId).toBe("op-stale");
    expect(after.accessPath).toBe("C:/proj/app.accdb");
    expect(after.updatedAt).toBe(oneHourAgo);
    expect(typeof after.abandonedAt).toBe("string");
    expect(Date.parse(after.abandonedAt as string)).toBe(NOW_MS);
  });

  it("does NOT mark fresh running markers (updatedAt within threshold)", async () => {
    const fiveMinAgo = new Date(NOW_MS - 5 * 60 * 1000).toISOString();
    await setupMarkerFile(root, "op-fresh.json", {
      operationId: "op-fresh",
      status: "running",
      updatedAt: fiveMinAgo,
    });

    const result = await cleanupStaleMarkers({
      fileSystem: nodeStaleMarkerFileSystem,
      markersRoot: root,
      thresholdMs: 30 * 60 * 1000,
      nowMs: NOW_MS,
    });

    expect(result.cleaned).toEqual([]);
    expect(result.errors).toEqual([]);
    const after = await readMarkerFile(root, "op-fresh.json");
    expect(after.status).toBe("running");
    expect(after.updatedAt).toBe(fiveMinAgo);
  });

  it("does NOT rewrite non-running markers (running_untracked, completed, failed)", async () => {
    const oldWhen = new Date(NOW_MS - 24 * 60 * 60 * 1000).toISOString();
    await setupMarkerFile(root, "op-completed.json", {
      operationId: "op-completed",
      status: "completed",
      updatedAt: oldWhen,
    });
    await setupMarkerFile(root, "op-failed.json", {
      operationId: "op-failed",
      status: "failed",
      updatedAt: oldWhen,
    });
    await setupMarkerFile(root, "op-running-untracked.json", {
      operationId: "op-running-untracked",
      status: "running_untracked",
      updatedAt: oldWhen,
    });

    const result = await cleanupStaleMarkers({
      fileSystem: nodeStaleMarkerFileSystem,
      markersRoot: root,
      thresholdMs: 30 * 60 * 1000,
      nowMs: NOW_MS,
    });

    expect(result.cleaned).toEqual([]);
    expect((await readMarkerFile(root, "op-completed.json")).status).toBe("completed");
    expect((await readMarkerFile(root, "op-failed.json")).status).toBe("failed");
    expect((await readMarkerFile(root, "op-running-untracked.json")).status).toBe(
      "running_untracked",
    );
  });

  it("skip stale markers whose updatedAt is missing or not parseable", async () => {
    await setupMarkerFile(root, "op-no-timestamp.json", {
      operationId: "op-no-timestamp",
      status: "running",
    });
    await setupMarkerFile(root, "op-bad-timestamp.json", {
      operationId: "op-bad-timestamp",
      status: "running",
      updatedAt: "not-a-date",
    });

    const result = await cleanupStaleMarkers({
      fileSystem: nodeStaleMarkerFileSystem,
      markersRoot: root,
      thresholdMs: 30 * 60 * 1000,
      nowMs: NOW_MS,
    });

    expect(result.cleaned).toEqual([]);
    expect((await readMarkerFile(root, "op-no-timestamp.json")).status).toBe("running");
    expect((await readMarkerFile(root, "op-bad-timestamp.json")).status).toBe("running");
  });

  it("respects configurable threshold (45min old with 60min threshold is NOT stale)", async () => {
    const fortyFiveMinAgo = new Date(NOW_MS - 45 * 60 * 1000).toISOString();
    await setupMarkerFile(root, "op-just-below.json", {
      operationId: "op-just-below",
      status: "running",
      updatedAt: fortyFiveMinAgo,
    });

    const result = await cleanupStaleMarkers({
      fileSystem: nodeStaleMarkerFileSystem,
      markersRoot: root,
      thresholdMs: 60 * 60 * 1000,
      nowMs: NOW_MS,
    });

    expect(result.cleaned).toEqual([]);
    expect((await readMarkerFile(root, "op-just-below.json")).status).toBe("running");
  });

  it("returns empty cleaned list and no errors when markersRoot does not exist", async () => {
    const missing = join(root, "does-not-exist");
    const result = await cleanupStaleMarkers({
      fileSystem: nodeStaleMarkerFileSystem,
      markersRoot: missing,
      thresholdMs: 30 * 60 * 1000,
      nowMs: NOW_MS,
    });

    expect(result.cleaned).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("captures per-file errors without aborting the rest of the sweep", async () => {
    const oneHourAgo = new Date(NOW_MS - 60 * 60 * 1000).toISOString();
    await setupMarkerFile(root, "op-stale.json", {
      operationId: "op-stale",
      status: "running",
      updatedAt: oneHourAgo,
    });
    await writeFile(join(root, "op-corrupt.json"), "this is not JSON", "utf8");

    const result = await cleanupStaleMarkers({
      fileSystem: nodeStaleMarkerFileSystem,
      markersRoot: root,
      thresholdMs: 30 * 60 * 1000,
      nowMs: NOW_MS,
    });

    expect(result.cleaned).toEqual(["op-stale.json"]);
    expect(result.errors.some((e) => e.file === "op-corrupt.json")).toBe(true);
    expect((await readMarkerFile(root, "op-stale.json")).status).toBe("abandoned");
  });

  it("works with an injected fake port (no real I/O)", async () => {
    const oneHourAgo = new Date(NOW_MS - 60 * 60 * 1000).toISOString();
    const stored = new Map<string, string>([
      [
        "op-fake.json",
        JSON.stringify({ operationId: "op-fake", status: "running", updatedAt: oneHourAgo }),
      ],
    ]);
    const fakePort: StaleMarkerFileSystemPort = {
      readdir: async () => [...stored.keys()],
      readFile: async (path) => {
        const content = stored.get(path.split(/[\\/]/).pop() ?? "");
        if (content === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        return content;
      },
      writeFile: async (path, data) => {
        stored.set(path.split(/[\\/]/).pop() ?? "", data);
      },
    };

    const result = await cleanupStaleMarkers({
      fileSystem: fakePort,
      markersRoot: "/virtual/markers",
      thresholdMs: 30 * 60 * 1000,
      nowMs: NOW_MS,
    });

    expect(result.cleaned).toEqual(["op-fake.json"]);
    const written = JSON.parse(stored.get("op-fake.json") ?? "{}") as Record<string, unknown>;
    expect(written.status).toBe("abandoned");
  });
});

function markerPort(
  initial: Readonly<Record<string, string>>,
  failures: {
    readdir?: unknown;
    read?: Readonly<Record<string, unknown>>;
    write?: Readonly<Record<string, unknown>>;
  } = {},
) {
  const stored = new Map(Object.entries(initial));
  const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;
  const port: StaleMarkerFileSystemPort = {
    readdir: async () => {
      if (failures.readdir !== undefined) throw failures.readdir;
      return [...stored.keys(), "notes.txt"];
    },
    readFile: async (path) => {
      const name = fileName(path);
      if (failures.read && name in failures.read) throw failures.read[name];
      const value = stored.get(name);
      if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return value;
    },
    writeFile: async (path, data) => {
      const name = fileName(path);
      if (failures.write && name in failures.write) throw failures.write[name];
      stored.set(name, data);
    },
  };
  return { port, stored };
}

function marker(status: string, updatedAt: unknown, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ operationId: `op-${status}`, status, updatedAt, ...extra });
}

describe("explicit stale marker recovery failure paths (#1378)", () => {
  const old = new Date(NOW_MS - 60 * 60 * 1000).toISOString();
  const fresh = new Date(NOW_MS - 5 * 60 * 1000).toISOString();
  const options = (fileSystem: StaleMarkerFileSystemPort) => ({
    fileSystem,
    markersRoot: "/virtual/markers",
    olderThanMs: 30 * 60 * 1000,
    nowMs: NOW_MS,
  });

  it("treats a missing marker directory as an empty successful recovery", async () => {
    const { port } = markerPort(
      {},
      { readdir: Object.assign(new Error("missing"), { code: "ENOENT" }) },
    );

    await expect(cleanStaleMarkers(options(port))).resolves.toEqual({
      ok: true,
      scanned: 0,
      removed: 0,
      kept: 0,
      removedMarkerIds: [],
      keptMarkerIds: [],
      errors: [],
    });
  });

  it("reports an unreadable marker directory without claiming recovery", async () => {
    const { port } = markerPort({}, { readdir: new Error("access denied") });

    const result = await cleanStaleMarkers(options(port));

    expect(result.ok).toBe(false);
    expect(result.removed).toBe(0);
    expect(result.errors).toEqual([
      { markerId: "/virtual/markers", error: "Unable to read markers directory: access denied" },
    ]);
  });

  it("isolates missing, unreadable, malformed, and partial marker files", async () => {
    const missing = Object.assign(new Error("vanished"), { code: "ENOENT" });
    const { port, stored } = markerPort(
      {
        "missing.json": marker("running", old),
        "unreadable.json": marker("running", old),
        "malformed.json": "{partial",
        "array.json": "[]",
        "partial.json": JSON.stringify({ status: "running" }),
        "recoverable.json": marker("running", old),
      },
      { read: { "missing.json": missing, "unreadable.json": "filesystem offline" } },
    );

    const result = await cleanStaleMarkers({ ...options(port), dryRun: false });

    expect(result.scanned).toBe(6);
    expect(result.removedMarkerIds).toEqual(["recoverable.json"]);
    expect(result.keptMarkerIds).toEqual(["partial.json"]);
    expect(result.errors).toEqual([
      { markerId: "unreadable.json", error: "Read failed: filesystem offline" },
      { markerId: "malformed.json", error: expect.stringContaining("JSON.parse failed:") },
      { markerId: "array.json", error: "Marker payload is not a JSON object" },
    ]);
    expect(JSON.parse(stored.get("partial.json") ?? "{}")).toEqual({ status: "running" });
  });

  it("preserves fresh running and terminal state while selecting only eligible stale state", async () => {
    const { port, stored } = markerPort({
      "live.json": marker("running", fresh),
      "completed.json": marker("completed", old),
      "cleaned.json": marker("cleaned", old),
      "abandoned.json": marker("abandoned", old),
      "unknown.json": marker("paused", old),
      "failed.json": marker("failed", old),
      "bad-date.json": marker("running", "not-a-date"),
      "empty-date.json": marker("running", ""),
      "number-date.json": marker("running", 42),
      "stale.json": marker("running", old),
    });
    const before = new Map(stored);

    const result = await cleanStaleMarkers(options(port));

    expect(result.removedMarkerIds).toEqual(["stale.json"]);
    expect(result.keptMarkerIds).toEqual([
      "live.json",
      "completed.json",
      "cleaned.json",
      "abandoned.json",
      "unknown.json",
      "failed.json",
      "bad-date.json",
      "empty-date.json",
      "number-date.json",
    ]);
    expect(stored).toEqual(before);
  });

  it("can recover failed and wrapped markers while preserving their audit fields", async () => {
    const wrapped = JSON.stringify({
      envelope: "kept",
      marker: { operationId: "op-wrapped", status: "running", updatedAt: old, detail: 7 },
    });
    const { port, stored } = markerPort({
      "failed.json": marker("failed", old, { reason: "crash" }),
      "wrapped.json": wrapped,
    });

    const result = await cleanStaleMarkers({
      ...options(port),
      keepFailed: false,
      dryRun: false,
    });

    expect(result.removedMarkerIds).toEqual(["failed.json", "wrapped.json"]);
    const failed = JSON.parse(stored.get("failed.json") ?? "{}");
    const wrappedAfter = JSON.parse(stored.get("wrapped.json") ?? "{}");
    expect(failed).toMatchObject({ status: "abandoned", reason: "crash" });
    expect(wrappedAfter).toMatchObject({
      envelope: "kept",
      status: "abandoned",
      marker: { operationId: "op-wrapped", status: "abandoned", detail: 7 },
    });
  });

  it("reports a write failure and continues recovering independent markers", async () => {
    const { port, stored } = markerPort(
      {
        "blocked.json": marker("running", old),
        "recovered.json": marker("running", old),
      },
      { write: { "blocked.json": new Error("disk full") } },
    );

    const result = await cleanStaleMarkers({ ...options(port), dryRun: false });

    expect(result.removedMarkerIds).toEqual(["recovered.json"]);
    expect(result.errors).toEqual([{ markerId: "blocked.json", error: "Write failed: disk full" }]);
    expect(JSON.parse(stored.get("blocked.json") ?? "{}").status).toBe("running");
    expect(JSON.parse(stored.get("recovered.json") ?? "{}").status).toBe("abandoned");
  });

  it("is idempotent after both completed and partial recovery", async () => {
    const failures: { write: Record<string, unknown> } = {
      write: { "retry.json": new Error("temporary lock") },
    };
    const { port, stored } = markerPort(
      {
        "once.json": marker("running", old),
        "retry.json": marker("running", old),
      },
      failures,
    );

    const first = await cleanStaleMarkers({ ...options(port), dryRun: false });
    delete failures.write["retry.json"];
    const second = await cleanStaleMarkers({ ...options(port), dryRun: false });
    const afterSecond = new Map(stored);
    const third = await cleanStaleMarkers({ ...options(port), dryRun: false });

    expect(first.removedMarkerIds).toEqual(["once.json"]);
    expect(first.errors).toHaveLength(1);
    expect(second.removedMarkerIds).toEqual(["retry.json"]);
    expect(second.keptMarkerIds).toEqual(["once.json"]);
    expect(third.removedMarkerIds).toEqual([]);
    expect(third.keptMarkerIds).toEqual(["once.json", "retry.json"]);
    expect(stored).toEqual(afterSecond);
  });
});
