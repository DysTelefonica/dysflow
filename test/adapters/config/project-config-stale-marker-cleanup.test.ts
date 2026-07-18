import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";

/**
 * Integration tests for #967 stale marker auto-cleanup, exercised through
 * `diagnoseProjectConfig` (the pre-write gate). The cleanup logic lives in
 * `src/core/operations/stale-marker-cleanup.ts`; this file pins the
 * observable behavior on the public surface that consumers actually hit:
 *
 *   - `diagnoseProjectConfig` reaps stale `status: "running"` markers to
 *     `status: "abandoned"` BEFORE the `findRunningOperations` check.
 *   - `findRunningOperations` ignores `status: "abandoned"` markers even
 *     when they would otherwise be considered "in scope" by accessPath /
 *     projectRoot matching.
 *   - The threshold is read from `capabilities.staleMarkerThresholdMinutes`
 *     in `.dysflow/project.json`. Default 30 minutes when missing.
 *   - Write-gate returns `status: "valid"` when only `status: "abandoned"`
 *     markers are present.
 *
 * Every timestamp in these tests is anchored to `Date.now()` (the same
 * clock the diagnostic reads via `Date.now()`), so the threshold
 * comparison is deterministic regardless of host wall-clock drift.
 */

type Fixture = {
  root: string;
  app: string;
};

function makeFixture(prefix: string): Fixture {
  const root = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(root, ".git"), "gitdir: fixture");
  mkdirSync(join(root, ".dysflow"));
  mkdirSync(join(root, "src"));
  const app = join(root, "app.accdb");
  writeFileSync(app, "");
  return { root, app };
}

function writeProjectJson(
  fixture: Fixture,
  body: Record<string, unknown> & { capabilities?: Record<string, unknown> },
): void {
  writeFileSync(
    join(fixture.root, ".dysflow", "project.json"),
    JSON.stringify({
      id: "app",
      accessPath: "app.accdb",
      destinationRoot: "src",
      ...body,
    }),
  );
}

function writeMarkerFile(fixture: Fixture, name: string, body: Record<string, unknown>): void {
  const markersDir = join(fixture.root, ".dysflow", "runtime", "markers");
  mkdirSync(markersDir, { recursive: true });
  writeFileSync(join(markersDir, name), JSON.stringify(body), "utf8");
}

function writeOperationsJson(fixture: Fixture, records: unknown[]): void {
  const runtimeDir = join(fixture.root, ".dysflow", "runtime");
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(join(runtimeDir, "operations.json"), JSON.stringify({ records }), "utf8");
}

describe("stale marker auto-cleanup integration (#967)", () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = makeFixture("dysflow-stale-cleanup-int-");
  });

  afterEach(() => {
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it("reaps stale markers to abandoned BEFORE the write-gate decision", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    writeProjectJson(fixture, {});
    writeMarkerFile(fixture, "op-stale.json", {
      operationId: "op-stale",
      accessPath: fixture.app,
      projectRootAbs: fixture.root,
      status: "running",
      updatedAt: oneHourAgo,
    });

    const markerPath = join(fixture.root, ".dysflow", "runtime", "markers", "op-stale.json");

    const beforeRaw = JSON.parse(readFileSync(markerPath, "utf8")) as Record<string, unknown>;
    expect(beforeRaw.status).toBe("running");

    const result = diagnoseProjectConfig(fixture.root, { projectId: "app" }, undefined);

    expect(result.status).toBe("valid");
    expect(result.writeReady).toBe(true);

    const afterRaw = JSON.parse(readFileSync(markerPath, "utf8")) as Record<string, unknown>;
    expect(afterRaw.status).toBe("abandoned");
    expect(typeof afterRaw.abandonedAt).toBe("string");
  });

  it("does NOT reap fresh markers (updatedAt within threshold)", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    writeProjectJson(fixture, {});
    writeMarkerFile(fixture, "op-fresh.json", {
      operationId: "op-fresh",
      accessPath: fixture.app,
      projectRootAbs: fixture.root,
      status: "running",
      updatedAt: fiveMinAgo,
    });

    const result = diagnoseProjectConfig(fixture.root, { projectId: "app" }, undefined);

    expect(result.status).toBe("write-locked-by-running-op");
    expect(result.diagnostics[0]?.code).toBe("WRITE_LOCKED_BY_RUNNING_OP");
  });

  it("reaps stale operations.json registry records to abandoned as well", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    writeProjectJson(fixture, {});
    writeOperationsJson(fixture, [
      {
        operationId: "op-registry-stale",
        action: "vba",
        accessPath: fixture.app,
        projectRootAbs: fixture.root,
        destinationRootAbs: join(fixture.root, "src"),
        metadata: {},
        status: "running",
        accessPid: 9999,
        processStartTime: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
        updatedAt: oneHourAgo,
      },
    ]);

    const result = diagnoseProjectConfig(fixture.root, { projectId: "app" }, undefined);

    expect(result.status).toBe("valid");
    expect(result.writeReady).toBe(true);
  });

  it("abandoned markers do NOT block the write-gate (gate allows write past them)", () => {
    writeProjectJson(fixture, {});
    writeMarkerFile(fixture, "op-already-abandoned.json", {
      operationId: "op-already-abandoned",
      accessPath: fixture.app,
      projectRootAbs: fixture.root,
      status: "abandoned",
      updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      abandonedAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
    });

    const result = diagnoseProjectConfig(fixture.root, { projectId: "app" }, undefined);

    expect(result.status).toBe("valid");
    expect(result.writeReady).toBe(true);
  });

  it("respects staleMarkerThresholdMinutes from project.json capabilities", () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    writeProjectJson(fixture, {
      capabilities: { staleMarkerThresholdMinutes: 60 },
    });
    writeMarkerFile(fixture, "op-just-below.json", {
      operationId: "op-just-below",
      accessPath: fixture.app,
      projectRootAbs: fixture.root,
      status: "running",
      updatedAt: thirtyMinAgo,
    });

    const result = diagnoseProjectConfig(fixture.root, { projectId: "app" }, undefined);

    expect(result.status).toBe("write-locked-by-running-op");
  });

  it("defaults to 30 minutes when capabilities.staleMarkerThresholdMinutes is absent", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    writeProjectJson(fixture, {});
    writeMarkerFile(fixture, "op-default-stale.json", {
      operationId: "op-default-stale",
      accessPath: fixture.app,
      projectRootAbs: fixture.root,
      status: "running",
      updatedAt: oneHourAgo,
    });

    const result = diagnoseProjectConfig(fixture.root, { projectId: "app" }, undefined);

    expect(result.status).toBe("valid");
  });
});
