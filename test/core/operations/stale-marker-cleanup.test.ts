import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeStaleMarkerFileSystem } from "../../../src/adapters/operations/node-stale-marker-file-system.js";
import { cleanupStaleMarkers } from "../../../src/core/operations/stale-marker-cleanup.js";
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
