/**
 * Issue #964 — write-tools with `apply:true` must propagate the same
 * `diagnostics[]` array as `resolve_project` would return for the same
 * project config failure.
 *
 * Cross-tool schema parity (same fields, same values) is the contract:
 * `error.diagnostics[*]` on the write-tool apply response must deep-equal
 * `data.projectConfig.diagnostics[*]` from `resolve_project` when both
 * route through the SAME `diagnoseProjectConfig(cwd, request)`.
 *
 * RED scope: pin the parity for the three apply-path tools
 * (`export_modules`, `import_modules`, `sync_binary`) plus a shape-level
 * guard that any future write-tool envelope still carries
 * `{ code, severity, message, remediation? }` per entry — matching what
 * `resolve_project.data.projectConfig.diagnostics[*]` exposes.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  diagnoseProjectConfig,
  type ProjectConfigDiagnostic,
} from "../../../src/adapters/config/project-config-diagnostic";
import { createResolveProjectTool } from "../../../src/adapters/mcp/resolve-project-tool";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}
class FakeVbaService {
  public requests: unknown[] = [];
  async execute(...args: unknown[]) {
    this.requests.push(args.length > 1 ? args[1] : args[0]);
    return successResult({ returnValue: "ok" });
  }
}
class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

function makeServices() {
  return {
    vbaService: new FakeVbaService(),
    vbaSyncToolService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  };
}

let workdir: string;
let resolveProject: ReturnType<typeof createResolveProjectTool>;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "dysflow-964-"));
  resolveProject = createResolveProjectTool({ cwd: workdir });
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

/**
 * Mirror the live `diagnoseProjectConfig` resolver so the write-tool
 * gate and `resolve_project` consume the SAME diagnostic array.
 */
function liveResolver(cwd: string) {
  return async (input: unknown): Promise<ProjectConfigDiagnostic> =>
    diagnoseProjectConfig(
      cwd,
      typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {},
    );
}

async function resolveProjectDiagnostics(): Promise<ProjectConfigDiagnostic["diagnostics"]> {
  const result = await resolveProject.handler({});
  if (result.isError) {
    throw new Error(
      `resolve_project returned isError:true — body: ${result.content[0]?.text ?? "(empty)"}`,
    );
  }
  const parsed = JSON.parse(result.content[0]?.text ?? "{}") as {
    projectConfig?: { diagnostics?: ProjectConfigDiagnostic["diagnostics"] };
  };
  return parsed.projectConfig?.diagnostics ?? [];
}

function toolHandlerFor(
  toolName: string,
  projectConfigResolver: (
    input: unknown,
  ) => ProjectConfigDiagnostic | Promise<ProjectConfigDiagnostic>,
) {
  const services = makeServices();
  const tools = createDysflowMcpTools({
    services,
    writes: true,
    projectConfigResolver,
  });
  const tool = tools.find((candidate) => candidate.name === toolName);
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  return tool.handler;
}

function writeProjectConfig(contents: object): void {
  mkdirSync(join(workdir, ".dysflow"), { recursive: true });
  writeFileSync(join(workdir, ".dysflow", "project.json"), JSON.stringify(contents), "utf-8");
}

/** Mark `workdir` as a Git worktree root so `diagnoseProjectConfig` accepts it. */
function makeWorkdirAWorktree() {
  mkdirSync(join(workdir, ".git"), { recursive: true });
}

describe("apply diagnostics propagation (Round-12 #964)", () => {
  it("export_modules apply:true with OUTSIDE_PROJECT_ROOT returns same diagnostics[] as resolve_project", async () => {
    const projectConfigResolver = liveResolver(workdir);
    const resolveDiagnostics = await resolveProjectDiagnostics();
    expect(resolveDiagnostics.length).toBeGreaterThan(0);
    expect(resolveDiagnostics[0]?.code).toBe("OUTSIDE_PROJECT_ROOT");

    const handler = toolHandlerFor("export_modules", projectConfigResolver);
    const applyResult = await handler({
      moduleNames: ["ModuleA"],
      apply: true,
    });

    expect(applyResult.isError).toBe(true);
    expect(applyResult.error?.code).toBe("OUTSIDE_PROJECT_ROOT");
    expect(applyResult.error?.diagnostics).toEqual(resolveDiagnostics);
  });

  it("import_modules apply:true with DESTINATION_ROOT_NOT_FOUND propagates diagnostics[] from resolve_project", async () => {
    makeWorkdirAWorktree();
    const accessDir = join(workdir, "access");
    mkdirSync(accessDir, { recursive: true });
    writeFileSync(join(accessDir, "app.accdb"), "");
    const accessPath = join(accessDir, "app.accdb").replaceAll("\\", "/");
    writeProjectConfig({
      id: "app",
      accessPath,
      destinationRoot: join(workdir, "missing-src").replaceAll("\\", "/"),
    });

    const projectConfigResolver = liveResolver(workdir);
    const resolveDiagnostics = await resolveProjectDiagnostics();
    expect(resolveDiagnostics.length).toBeGreaterThan(0);
    expect(resolveDiagnostics[0]?.code).toBe("DESTINATION_ROOT_NOT_FOUND");

    const handler = toolHandlerFor("import_modules", projectConfigResolver);
    const applyResult = await handler({
      moduleNames: ["ModuleA"],
      apply: true,
    });

    expect(applyResult.isError).toBe(true);
    expect(applyResult.error?.code).toBe("DESTINATION_ROOT_NOT_FOUND");
    expect(applyResult.error?.diagnostics).toEqual(resolveDiagnostics);
  });

  it("sync_binary apply:true with WRITE_LOCKED_BY_RUNNING_OP propagates diagnostics[] from resolve_project", async () => {
    makeWorkdirAWorktree();
    const accessDir = join(workdir, "access");
    mkdirSync(accessDir, { recursive: true });
    writeFileSync(join(accessDir, "app.accdb"), "");
    const accessPath = join(accessDir, "app.accdb").replaceAll("\\", "/");
    const srcDir = join(workdir, "src");
    mkdirSync(srcDir, { recursive: true });
    const destinationRoot = srcDir.replaceAll("\\", "/");
    writeProjectConfig({
      id: "app",
      accessPath,
      destinationRoot,
    });

    mkdirSync(join(workdir, ".dysflow", "runtime", "markers"), { recursive: true });
    writeFileSync(
      join(workdir, ".dysflow", "runtime", "markers", "op-123.json"),
      JSON.stringify({
        marker: {
          status: "running",
          projectRootAbs: workdir,
          accessPath,
          operationId: "op-123",
        },
      }),
    );

    const projectConfigResolver = liveResolver(workdir);
    const resolveDiagnostics = await resolveProjectDiagnostics();
    expect(resolveDiagnostics.length).toBeGreaterThan(0);
    expect(resolveDiagnostics[0]?.code).toBe("WRITE_LOCKED_BY_RUNNING_OP");

    const handler = toolHandlerFor("sync_binary", projectConfigResolver);
    const applyResult = await handler({
      direction: "src-to-binary",
      apply: true,
    });

    expect(applyResult.isError).toBe(true);
    expect(applyResult.error?.code).toBe("WRITE_LOCKED_BY_RUNNING_OP");
    expect(applyResult.error?.diagnostics).toEqual(resolveDiagnostics);
  });

  it("diagnostics[] schema is identical between resolve_project and write-tools — every entry has { code, severity, message, remediation? }", async () => {
    makeWorkdirAWorktree();
    const accessDir = join(workdir, "access");
    mkdirSync(accessDir, { recursive: true });
    writeFileSync(join(accessDir, "app.accdb"), "");
    const accessPath = join(accessDir, "app.accdb").replaceAll("\\", "/");
    writeProjectConfig({
      id: "app",
      accessPath,
      destinationRoot: join(workdir, "missing-src").replaceAll("\\", "/"),
    });

    const projectConfigResolver = liveResolver(workdir);
    const resolveDiagnostics = await resolveProjectDiagnostics();
    expect(resolveDiagnostics.length).toBeGreaterThan(0);

    const handler = toolHandlerFor("export_modules", projectConfigResolver);
    const applyResult = await handler({
      moduleNames: ["ModuleA"],
      apply: true,
    });
    const toolDiagnostics = applyResult.error?.diagnostics ?? [];

    const requiredKeys = ["code", "severity", "message"];
    for (const entry of [...resolveDiagnostics, ...toolDiagnostics]) {
      for (const key of requiredKeys) {
        expect(Object.keys(entry)).toContain(key);
      }
    }

    expect(toolDiagnostics).toEqual(resolveDiagnostics);
    expect(existsSync(workdir)).toBe(true);
  });
});
