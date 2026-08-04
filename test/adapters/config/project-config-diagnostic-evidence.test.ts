import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";

/**
 * Issue #1394 — the project-config diagnostic exists to explain WHY a project
 * config could not be resolved. Four recovery paths used to discard their
 * failure evidence through a bare `catch {}`, so a consuming agent could not
 * tell "absent" from "broken".
 *
 * These tests pin the observable contract at the port: the returned
 * `ProjectConfigDiagnostic.diagnostics[]` must carry a `warning` entry that
 * names the offending path and the underlying error message, and the recovery
 * behavior (status / writeReady) must stay exactly as it was — none of the
 * four sites may become fatal.
 */

const posix = (value: string): string => value.replaceAll("\\", "/");

type Fixture = { root: string; app: string };

function makeFixture(prefix: string): Fixture {
  const root = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(root, ".git"), "gitdir: fixture");
  mkdirSync(join(root, ".dysflow"));
  mkdirSync(join(root, "src"));
  const app = join(root, "app.accdb");
  writeFileSync(app, "");
  return { root, app };
}

function writeValidProjectJson(fixture: Fixture): void {
  writeFileSync(
    join(fixture.root, ".dysflow", "project.json"),
    JSON.stringify({ id: "app", accessPath: "app.accdb", destinationRoot: "src" }),
  );
}

describe("project config diagnostic surfaces recovery-path failure evidence (#1394)", () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = makeFixture("dysflow-1394-");
  });

  afterEach(() => {
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it("names the cwd project config when it cannot be read or parsed", () => {
    const configPath = join(fixture.root, ".dysflow", "project.json");
    writeFileSync(configPath, "{ this is not json");

    const result = diagnoseProjectConfig(fixture.root);

    // Recovery behavior is unchanged: still a non-throwing verdict.
    expect(result.status).toBe("ambiguous");
    expect(result.writeReady).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "PROJECT_CONFIG_CANDIDATE_UNREADABLE",
        severity: "warning",
        path: posix(configPath),
        message: expect.stringContaining("JSON"),
      }),
    );
  });

  it("names operations.json when the running-operations registry cannot be parsed", () => {
    writeValidProjectJson(fixture);
    const runtimeDir = join(fixture.root, ".dysflow", "runtime");
    mkdirSync(runtimeDir, { recursive: true });
    const registryPath = join(runtimeDir, "operations.json");
    writeFileSync(registryPath, "{ corrupted", "utf8");

    const result = diagnoseProjectConfig(fixture.root, { projectId: "app" });

    // Recovery behavior is unchanged: a corrupt registry never blocks the gate.
    expect(result.status).toBe("valid");
    expect(result.writeReady).toBe(true);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "OPERATIONS_REGISTRY_UNREADABLE",
        severity: "warning",
        path: posix(registryPath),
        message: expect.stringContaining("JSON"),
      }),
    );
  });

  it("names the offending runtime marker when a single marker cannot be parsed", () => {
    writeValidProjectJson(fixture);
    const markersDir = join(fixture.root, ".dysflow", "runtime", "markers");
    mkdirSync(markersDir, { recursive: true });
    const markerPath = join(markersDir, "op-corrupt.json");
    writeFileSync(markerPath, "{ corrupted", "utf8");

    const result = diagnoseProjectConfig(fixture.root, { projectId: "app" });

    // Recovery behavior is unchanged: a corrupt marker is skipped, not fatal.
    expect(result.status).toBe("valid");
    expect(result.writeReady).toBe(true);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RUNTIME_MARKER_UNREADABLE",
        severity: "warning",
        path: posix(markerPath),
        message: expect.stringContaining("JSON"),
      }),
    );
  });

  it("names the markers directory when it cannot be listed", () => {
    writeValidProjectJson(fixture);
    const runtimeDir = join(fixture.root, ".dysflow", "runtime");
    mkdirSync(runtimeDir, { recursive: true });
    // A regular file where a directory is expected: `existsSync` passes and
    // `readdirSync` throws ENOTDIR on every supported platform.
    const markersPath = join(runtimeDir, "markers");
    writeFileSync(markersPath, "not a directory", "utf8");

    const result = diagnoseProjectConfig(fixture.root, { projectId: "app" });

    // Recovery behavior is unchanged: an unreadable markers dir never blocks.
    expect(result.status).toBe("valid");
    expect(result.writeReady).toBe(true);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RUNTIME_MARKERS_UNREADABLE",
        severity: "warning",
        path: posix(markersPath),
        message: expect.any(String),
      }),
    );
  });
});
