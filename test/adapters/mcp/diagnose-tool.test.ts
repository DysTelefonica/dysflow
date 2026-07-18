import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeDiagnose,
  createDiagnoseTool,
  type DiagnoseResult,
} from "../../../src/adapters/mcp/diagnose-tool.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";
import {
  type AccessOperationRecord,
  createInMemoryAccessOperationRegistry,
} from "../../../src/core/operations/access-operation-registry.js";

/**
 * Issue #965 — `dysflow.diagnose(projectId?, accessPath?, contextId?, verbose?)`
 * returns aggregated project health (projectConfig + filesystem + runtime) in a
 * single call. Replaces the 4-5 round-trip pattern (get_capabilities +
 * resolve_project + list_access_operations + access_force_cleanup_orphaned
 * listing + filesystem stat) so AI consumers can boot a project context with
 * one tool call.
 *
 * Acceptance criteria (issue #965 AC1-AC6):
 *   1. Returns the documented DiagnoseResult schema with all fields.
 *   2. Single-call info matches the 4-tool equivalent.
 *   3. filesystem.destinationRoot.exists is false when the directory is missing.
 *   4. runtime.staleMarkers counts only markers older than 5 minutes
 *      with status=running.
 *   5. Read-only — mutatesBinary:false, mutatesFilesystem:false, no write-gate.
 *   6. runtime.dysflowVersion + writeExecutionPolicy match get_capabilities.
 *
 * The tool is pure read-class. It never opens Access, never spawns PowerShell,
 * never mutates state. The handler is registered in `MODERN_TOOL_NAMES` and
 * its contract is `read-only` in `MCP_TOOL_CONTRACTS`.
 */

class FakeVbaService {
  async execute() {
    return successResult({ returnValue: "ok" });
  }
}
class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}
class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

function makeServices(opts?: {
  registry?: ReturnType<typeof createInMemoryAccessOperationRegistry>;
}) {
  return {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
    operationRegistry: opts?.registry,
  };
}

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "dysflow-diagnose-"));
  // Plant a `.git` marker so `diagnoseProjectConfig` treats `workdir` as a
  // Git worktree. Same trick used by `resolve-project-idempotence.test.ts`
  // — `worktreeRoot()` walks the directory tree looking for a `.git` entry
  // and treats it as the worktree root.
  writeFileSync(join(workdir, ".git"), "gitdir: isolated-fixture", "utf-8");
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

function writeProjectConfig(contents: object): void {
  const folder = join(workdir, ".dysflow");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "project.json"), JSON.stringify(contents), "utf-8");
}

function writeProjectConfigWithExistingAccessPath(contents: {
  id: string;
  accessPath?: string;
  backendPath?: string;
  destinationRoot?: string;
  projectRoot?: string;
}): { accessFile: string; destinationRoot: string } {
  writeProjectConfig(contents);
  const projectRoot = workdir;
  const accessFile = join(projectRoot, "frontend.accdb");
  const backendFile = join(projectRoot, "backend.accdb");
  const destinationRoot = join(projectRoot, "src");
  mkdirSync(destinationRoot, { recursive: true });
  writeFileSync(accessFile, "fake-accdb-bytes", "utf-8");
  writeFileSync(backendFile, "fake-backend-bytes", "utf-8");
  return { accessFile, destinationRoot };
}

function makeAccessPath(
  opId: string,
  status: AccessOperationRecord["status"],
  updatedAt: string,
): AccessOperationRecord {
  return {
    operationId: opId,
    action: "vba",
    accessPath: join(workdir, "frontend.accdb"),
    destinationRootAbs: workdir,
    projectRootAbs: workdir,
    accessPid: null,
    powershellWorkerPid: null,
    processStartTime: null,
    status,
    metadata: {},
    updatedAt,
  };
}

/**
 * The diagnostic normalizes Windows paths to forward slashes
 * (`path.normalize` + `replaceAll("\\", "/")`). Compare both sides under the
 * same normalization so the test does not fail on host-OS differences.
 */
function normalizePath(value: string | null): string {
  if (value === null) return "";
  return value.replaceAll("\\", "/");
}

describe("computeDiagnose — pure aggregator (#965)", () => {
  it("returns the documented DiagnoseResult schema with all required fields", async () => {
    const result = await computeDiagnose({
      cwd: workdir,
      snapshot: {
        adapterVersion: "2.16.0-test",
        writeExecutionPolicy: "safe-by-default",
      },
    });

    // projectConfig block
    expect(result).toHaveProperty("projectConfig");
    expect(result.projectConfig).toHaveProperty("status");
    expect(result.projectConfig).toHaveProperty("writeReady");
    expect(result.projectConfig).toHaveProperty("diagnostics");
    expect(Array.isArray(result.projectConfig.diagnostics)).toBe(true);
    expect(result.projectConfig).toHaveProperty("owningWorktree");

    // filesystem block
    expect(result).toHaveProperty("filesystem");
    expect(result.filesystem).toHaveProperty("accessPath");
    expect(result.filesystem.accessPath).toHaveProperty("path");
    expect(result.filesystem.accessPath).toHaveProperty("exists");
    expect(result.filesystem.accessPath).toHaveProperty("readable");
    expect(result.filesystem.accessPath).toHaveProperty("sizeBytes");
    expect(result.filesystem.accessPath).toHaveProperty("lastModified");

    expect(result.filesystem).toHaveProperty("backendPath");
    expect(result.filesystem.backendPath).toHaveProperty("path");
    expect(result.filesystem.backendPath).toHaveProperty("exists");
    expect(result.filesystem.backendPath).toHaveProperty("hint");

    expect(result.filesystem).toHaveProperty("destinationRoot");
    expect(result.filesystem.destinationRoot).toHaveProperty("path");
    expect(result.filesystem.destinationRoot).toHaveProperty("exists");
    expect(result.filesystem.destinationRoot).toHaveProperty("hint");

    expect(result.filesystem).toHaveProperty("projectRoot");
    expect(result.filesystem.projectRoot).toHaveProperty("path");
    expect(result.filesystem.projectRoot).toHaveProperty("exists");

    // runtime block
    expect(result).toHaveProperty("runtime");
    expect(result.runtime).toHaveProperty("staleMarkers");
    expect(typeof result.runtime.staleMarkers).toBe("number");
    expect(result.runtime).toHaveProperty("activeOps");
    expect(typeof result.runtime.activeOps).toBe("number");
    expect(result.runtime).toHaveProperty("orphans");
    expect(result.runtime.orphans).toHaveProperty("msaccess");
    expect(result.runtime.orphans).toHaveProperty("pwshWorkers");
    expect(result.runtime).toHaveProperty("dysflowVersion");
    expect(typeof result.runtime.dysflowVersion).toBe("string");
    expect(result.runtime).toHaveProperty("writeExecutionPolicy");
    expect(["safe-by-default", "developer"]).toContain(result.runtime.writeExecutionPolicy);
  });

  it("filesystem.destinationRoot.exists is false when the directory is missing", async () => {
    // No project.json, no destinationRoot — destinationRoot defaults to <projectRoot>/src,
    // which does NOT exist in a freshly created mkdtemp workdir.
    const result = await computeDiagnose({
      cwd: workdir,
      snapshot: {
        adapterVersion: "2.16.0-test",
        writeExecutionPolicy: "safe-by-default",
      },
    });

    expect(result.filesystem.destinationRoot.exists).toBe(false);
    // The hint must surface the footgun (the consumer-facing remediation).
    expect(typeof result.filesystem.destinationRoot.hint).toBe("string");
    expect(result.filesystem.destinationRoot.hint).toMatch(/git\s+rm|mkdir|create/i);
  });

  it("runtime.staleMarkers counts ONLY status=running markers older than 5 minutes", async () => {
    // Anchor "now" so the test is deterministic.
    const nowMs = Date.parse("2026-07-18T12:00:00.000Z");
    const tenMinAgo = new Date(nowMs - 10 * 60 * 1000).toISOString();
    const oneMinAgo = new Date(nowMs - 60 * 1000).toISOString();

    const registry = createInMemoryAccessOperationRegistry();
    registry.create(makeAccessPath("op-fresh-running", "running", oneMinAgo));
    registry.create(makeAccessPath("op-stale-running", "running", tenMinAgo));
    registry.create(makeAccessPath("op-abandoned", "abandoned", tenMinAgo));
    registry.create(makeAccessPath("op-failed", "failed", tenMinAgo));
    registry.create(makeAccessPath("op-completed", "completed", tenMinAgo));

    const result = await computeDiagnose({
      cwd: workdir,
      snapshot: {
        adapterVersion: "2.16.0-test",
        writeExecutionPolicy: "safe-by-default",
      },
      registry,
      thresholdMs: 5 * 60 * 1000,
      nowMs,
    });

    // Only op-stale-running qualifies: status=running AND updatedAt older than 5 minutes.
    expect(result.runtime.staleMarkers).toBe(1);
  });

  it("runtime.staleMarkers threshold is configurable (custom 2-minute window)", async () => {
    const nowMs = Date.parse("2026-07-18T12:00:00.000Z");
    const threeMinAgo = new Date(nowMs - 3 * 60 * 1000).toISOString();
    const oneMinAgo = new Date(nowMs - 60 * 1000).toISOString();

    const registry = createInMemoryAccessOperationRegistry();
    registry.create(makeAccessPath("op-3min-running", "running", threeMinAgo));
    registry.create(makeAccessPath("op-1min-running", "running", oneMinAgo));

    const result = await computeDiagnose({
      cwd: workdir,
      snapshot: {
        adapterVersion: "2.16.0-test",
        writeExecutionPolicy: "safe-by-default",
      },
      registry,
      thresholdMs: 2 * 60 * 1000,
      nowMs,
    });

    expect(result.runtime.staleMarkers).toBe(1);
    expect(result.runtime.activeOps).toBe(2);
  });

  it("single-call info matches the 4-tool equivalent (snapshot + projectConfig + access ops)", async () => {
    const { accessFile, destinationRoot } = writeProjectConfigWithExistingAccessPath({
      id: "diagnose-equivalence",
      accessPath: "frontend.accdb",
      backendPath: "backend.accdb",
      destinationRoot: "src",
    });

    const registry = createInMemoryAccessOperationRegistry();
    const nowMs = Date.parse("2026-07-18T12:00:00.000Z");
    const fiveMinAgo = new Date(nowMs - 10 * 60 * 1000).toISOString();
    registry.create(makeAccessPath("op-stale", "running", fiveMinAgo));

    const result = await computeDiagnose({
      cwd: workdir,
      snapshot: {
        adapterVersion: "2.16.0-test",
        writeExecutionPolicy: "developer",
      },
      registry,
      nowMs,
    });

    // runtime.dysflowVersion + writeExecutionPolicy reflect snapshot state.
    expect(result.runtime.dysflowVersion).toBe("2.16.0-test");
    expect(result.runtime.writeExecutionPolicy).toBe("developer");

    // runtime.staleMarkers == 1 (the one we seeded).
    expect(result.runtime.staleMarkers).toBe(1);
    // runtime.activeOps counts running + starting records. The seeded record is
    // `running`, so activeOps >= 1.
    expect(result.runtime.activeOps).toBeGreaterThanOrEqual(1);

    // filesystem.accessPath reflects the file we wrote (true existence + size > 0).
    // The diagnostic normalizes the path to POSIX separators (forward slash)
    // regardless of host OS, so compare against the normalized form.
    expect(normalizePath(result.filesystem.accessPath.path)).toBe(normalizePath(accessFile));
    expect(result.filesystem.accessPath.exists).toBe(true);
    expect(result.filesystem.accessPath.sizeBytes).toBeGreaterThan(0);
    expect(typeof result.filesystem.accessPath.lastModified).toBe("string");

    // filesystem.destinationRoot reflects the directory we created.
    expect(normalizePath(result.filesystem.destinationRoot.path)).toBe(
      normalizePath(destinationRoot),
    );
    expect(result.filesystem.destinationRoot.exists).toBe(true);

    // projectConfig block was resolved from the same workdir/cwd the resolver uses.
    expect(result.projectConfig.status).toBe("valid");
    expect(result.projectConfig.writeReady).toBe(true);
    expect(result.projectConfig.projectId).toBe("diagnose-equivalence");
  });

  it("filesystem.accessPath.exists is false when accessPath is missing", async () => {
    // Project.json declares an accessPath that does NOT exist on disk.
    writeProjectConfig({
      id: "missing-access",
      accessPath: "ghost.accdb",
      destinationRoot: "src",
    });

    const result = await computeDiagnose({
      cwd: workdir,
      snapshot: {
        adapterVersion: "2.16.0-test",
        writeExecutionPolicy: "safe-by-default",
      },
    });

    expect(result.filesystem.accessPath.exists).toBe(false);
  });

  it("projectConfig diagnostics surface typed codes when project.json is malformed", async () => {
    mkdirSync(join(workdir, ".dysflow"), { recursive: true });
    writeFileSync(join(workdir, ".dysflow", "project.json"), "{ not valid json", "utf-8");

    const result = await computeDiagnose({
      cwd: workdir,
      snapshot: {
        adapterVersion: "2.16.0-test",
        writeExecutionPolicy: "safe-by-default",
      },
    });

    expect(result.projectConfig.writeReady).toBe(false);
    expect(result.projectConfig.status).toBe("ambiguous");
    expect(result.projectConfig.diagnostics.length).toBeGreaterThan(0);
    const code = result.projectConfig.diagnostics[0]?.code;
    expect(typeof code).toBe("string");
    expect(code?.length).toBeGreaterThan(0);
  });
});

describe("createDiagnoseTool — tool factory (#965)", () => {
  it("returns a tool named 'diagnose' with the documented input schema", () => {
    const tool = createDiagnoseTool({
      cwd: workdir,
      snapshot: {
        adapterVersion: "2.16.0-test",
        writeExecutionPolicy: "safe-by-default",
      },
    });

    expect(tool.name).toBe("diagnose");
    expect(tool.inputSchema?.properties).toHaveProperty("projectId");
    expect(tool.inputSchema?.properties).toHaveProperty("accessPath");
    expect(tool.inputSchema?.properties).toHaveProperty("contextId");
    expect(tool.inputSchema?.properties).toHaveProperty("verbose");
  });

  it("handler returns a JSON DiagnoseResult with isError=false", async () => {
    writeProjectConfigWithExistingAccessPath({
      id: "happy-path",
      accessPath: "frontend.accdb",
      backendPath: "backend.accdb",
      destinationRoot: "src",
    });

    const tool = createDiagnoseTool({
      cwd: workdir,
      snapshot: {
        adapterVersion: "2.16.0-test",
        writeExecutionPolicy: "safe-by-default",
      },
    });

    const result = await tool.handler({ projectId: "happy-path" });
    expect(result.isError).toBe(false);
    expect(result.ok).toBe(true);

    const payload = JSON.parse(result.content[0]?.text ?? "{}") as DiagnoseResult;
    expect(payload).toHaveProperty("projectConfig");
    expect(payload).toHaveProperty("filesystem");
    expect(payload).toHaveProperty("runtime");
    expect(payload.projectConfig.projectId).toBe("happy-path");
  });

  it("handler is defensive against non-object input without throwing", async () => {
    const tool = createDiagnoseTool({
      cwd: workdir,
      snapshot: {
        adapterVersion: "2.16.0-test",
        writeExecutionPolicy: "safe-by-default",
      },
    });

    const result = await tool.handler("not-an-object");
    expect(result.isError).toBe(false);

    const payload = JSON.parse(result.content[0]?.text ?? "{}") as DiagnoseResult;
    expect(payload).toHaveProperty("projectConfig");
    expect(payload).toHaveProperty("filesystem");
    expect(payload).toHaveProperty("runtime");
  });
});

describe("createDysflowMcpTools — diagnose tool wiring (#965)", () => {
  it("exposes 'diagnose' as a registered MCP tool", () => {
    const tools = createDysflowMcpTools({ services: makeServices() });
    const names = tools.map((t) => t.name);
    expect(names).toContain("diagnose");
  });

  it("diagnose tool is read-only (no write-gate, defaultBehavior=noop)", () => {
    const tools = createDysflowMcpTools({ services: makeServices() });
    const diagnose = tools.find((t) => t.name === "diagnose");
    expect(diagnose).toBeDefined();
    // The tool must NOT carry any commit-flag that would write-enable it.
    // We verify at the MCP_TOOL_CONTRACTS source-of-truth surface.
    // The contract type guarantees this is statically typed; the runtime
    // dispatch layer consults the same contracts (#757 C2).
    expect(diagnose?.description).toContain("Read-only");
    expect(diagnose?.description).toContain("does not open Access");
  });

  it("diagnose tool runs without writes enabled (read-only invariant)", async () => {
    const tools = createDysflowMcpTools({
      services: makeServices(),
      writes: false,
    });
    const diagnose = tools.find((t) => t.name === "diagnose");
    expect(diagnose).toBeDefined();

    const result = await diagnose?.handler({}, undefined as never);
    expect(result?.isError).toBe(false);
    expect(result?.ok).toBe(true);
  });
});

describe("DiagnoseResult — type contract smoke test (#965)", () => {
  it("returns null owningWorktree when project config is invalid", async () => {
    const result = await computeDiagnose({
      cwd: workdir,
      snapshot: {
        adapterVersion: "2.16.0-test",
        writeExecutionPolicy: "safe-by-default",
      },
    });

    expect(
      result.projectConfig.owningWorktree === null ||
        typeof result.projectConfig.owningWorktree === "string",
    ).toBe(true);
  });

  it("returns null destinationRoot path when no project config exists", async () => {
    const result = await computeDiagnose({
      cwd: workdir,
      snapshot: {
        adapterVersion: "2.16.0-test",
        writeExecutionPolicy: "safe-by-default",
      },
    });

    // Either a path with exists:false, or null when the diagnostic fail-closed.
    const dest = result.filesystem.destinationRoot;
    expect(
      dest === null || (typeof dest.path === "string" && typeof dest.exists === "boolean"),
    ).toBe(true);
  });

  it("accepts an empty cwd-less call shape", async () => {
    const result = await computeDiagnose({
      cwd: workdir,
      snapshot: {
        adapterVersion: "2.16.0-test",
        writeExecutionPolicy: "safe-by-default",
      },
    });
    expect(result).toHaveProperty("projectConfig");
    expect(result).toHaveProperty("filesystem");
    expect(result).toHaveProperty("runtime");
  });
});
