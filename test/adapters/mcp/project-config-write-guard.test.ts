import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";
import type { McpToolResult } from "../../../src/adapters/mcp/result-translation.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

type WriteGateMode =
  | "missing-destination"
  | "outside-access"
  | "running-operation"
  | "capabilities-disabled"
  | "project-id-mismatch";

const writeGateCases = [
  ["missing-destination", "DESTINATION_ROOT_NOT_FOUND", "mkdir"],
  ["outside-access", "OUTSIDE_PROJECT_ROOT", "dysflow doctor --cwd"],
  ["running-operation", "WRITE_LOCKED_BY_RUNNING_OP", "access_force_cleanup_orphaned"],
  ["capabilities-disabled", "CAPABILITIES_DISALLOW_WRITE", "dysflow doctor --cwd"],
  ["project-id-mismatch", "PROJECT_ID_MISMATCH", "dysflow doctor --cwd"],
] as const satisfies readonly [WriteGateMode, string, string][];

async function runWriteGateCase(
  mode: WriteGateMode,
): Promise<{ root: string; result: McpToolResult }> {
  const root = mkdtempSync(join(tmpdir(), "dysflow-write-gate-taxonomy-"));
  writeFileSync(join(root, ".git"), "gitdir: isolated-fixture");
  mkdirSync(join(root, ".dysflow"));
  if (mode !== "missing-destination") mkdirSync(join(root, "src"));
  writeFileSync(join(root, "app.accdb"), "");
  writeFileSync(
    join(root, ".dysflow", "project.json"),
    JSON.stringify({
      id: "app",
      accessPath: "app.accdb",
      destinationRoot: "src",
      capabilities: { allowWrites: mode !== "capabilities-disabled" },
    }),
  );
  if (mode === "running-operation") {
    mkdirSync(join(root, ".dysflow", "runtime"));
    // #967 — set updatedAt to NOW so the record is fresh relative to the
    // real wall clock; the stale-marker auto-cleanup would otherwise reap it
    // (default threshold = 30 min) and the gate would no longer block the
    // write. The "running-operation" scenario is exercising the gate's
    // active-blocker path, not the stale-cleanup path.
    const freshUpdatedAt = new Date().toISOString();
    writeFileSync(
      join(root, ".dysflow", "runtime", "operations.json"),
      JSON.stringify({
        records: [
          {
            operationId: "op-running",
            action: "export",
            accessPath: join(root, "app.accdb"),
            projectRootAbs: root,
            destinationRootAbs: join(root, "src"),
            metadata: {},
            status: "running",
            accessPid: 123,
            processStartTime: "2026-07-18T10:00:00.000Z",
            updatedAt: freshUpdatedAt,
          },
        ],
      }),
    );
  }
  const execute = vi.fn(async () => successResult({}));
  const tools = createDysflowMcpTools({
    services: {
      vbaService: { execute },
      queryService: { execute },
      diagnosticsService: { run: execute },
      vbaSyncToolService: { execute },
    } as unknown as DysflowMcpServices,
    writes: true,
    allowWrites: mode !== "capabilities-disabled",
    cwd: root,
    projectConfigResolver: (input) => diagnoseProjectConfig(root, input as Record<string, string>),
  });
  const tool = tools.find((candidate) => candidate.name === "export_modules");
  if (tool === undefined) throw new Error("export_modules not registered");
  const result = await tool.handler({
    moduleNames: ["Example"],
    projectId: mode === "project-id-mismatch" ? "other" : "app",
    ...(mode === "outside-access" ? { accessPath: join(root, "..", "outside", "app.accdb") } : {}),
    apply: true,
    confirmOverwriteSource: true,
  });
  return { root, result };
}

describe("central project config write guard", () => {
  it("does not interpret a form mutation sourcePath as an Access target alias", async () => {
    const root = mkdtempSync(join(tmpdir(), "dysflow-form-source-"));
    writeFileSync(join(root, ".git"), "gitdir: fixture");
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "forms"));
    writeFileSync(join(root, "app.accdb"), "");
    const sourcePath = join(root, "forms", "Form_Customer.form.txt");
    writeFileSync(sourcePath, "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: "app.accdb", destinationRoot: "src" }),
    );
    const execute = vi.fn(async () => successResult({}));
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute },
        queryService: { execute },
        diagnosticsService: { run: execute },
        vbaSyncToolService: { execute },
      } as unknown as DysflowMcpServices,
      writes: true,
      cwd: root,
      projectConfigResolver: (input) =>
        diagnoseProjectConfig(root, input as Record<string, string>),
    });
    const result = await tools
      .find((tool) => tool.name === "form_add_control")
      ?.handler({
        sourcePath,
        controlName: "cmdSave",
        controlType: "CommandButton",
        apply: true,
      });
    expect(result?.error?.code).not.toBe("PROJECT_CONFIG_NOT_WRITE_READY");
    expect(execute).toHaveBeenCalled();
  });
  it("fails closed before services for a mutating request", async () => {
    const root = mkdtempSync(join(tmpdir(), "dysflow-write-guard-"));
    writeFileSync(join(root, ".git"), "gitdir: isolated-fixture");
    const diagnostic = diagnoseProjectConfig(root);
    const execute = vi.fn(async () => successResult({}));
    const services = {
      vbaService: { execute },
      queryService: { execute },
      diagnosticsService: { run: execute },
    } as unknown as DysflowMcpServices;
    const tools = createDysflowMcpTools({
      services,
      writes: true,
      cwd: root,
      projectConfigResolver: (input) =>
        diagnoseProjectConfig(root, input as Record<string, string>),
    });
    const tool = tools.find((t) => t.name === "import_modules");
    const result = await tool?.handler({
      moduleNames: ["Example"],
      accessPath: join(root, "explicit.accdb"),
      dryRun: false,
    });
    expect(result?.error).toMatchObject({
      code: "PROJECT_CONFIG_NOT_WRITE_READY",
      details: { status: diagnostic.status, operation: "import_modules" },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ["import_modules", { moduleNames: ["Example"], dryRun: true }, true],
    ["query_execute", { mode: "read", sql: "SELECT 1" }, true],
    ["cleanup_access_operation", { operationId: "op-1", accessPath: "x.accdb" }, false],
    ["access_force_cleanup_orphaned", {}, false],
  ])("allows degraded plan/read access through %s", async (toolName, input, callsService) => {
    const root = mkdtempSync(join(tmpdir(), "dysflow-degraded-read-"));
    writeFileSync(join(root, ".git"), "gitdir: fixture");
    const execute = vi.fn(async () => successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute },
        queryService: { execute },
        diagnosticsService: { run: execute },
        vbaSyncToolService: { execute },
      } as unknown as DysflowMcpServices,
      writes: true,
      cwd: root,
      projectConfigResolver: (request) =>
        diagnoseProjectConfig(root, request as Record<string, string>),
    });
    const result = await tools.find((tool) => tool.name === toolName)?.handler(input);
    expect(result?.error?.code).not.toBe("PROJECT_CONFIG_NOT_WRITE_READY");
    expect(execute.mock.calls.length > 0).toBe(callsService);
  });

  it.each([
    ["query_execute", { mode: "write", sql: "DELETE FROM T", apply: true }],
    ["cleanup_access_operation", { operationId: "op-1", accessPath: "x.accdb", force: true }],
    ["access_force_cleanup_orphaned", { confirmPid: 123 }],
  ])("fails closed for the mutating branch of %s", async (toolName, input) => {
    const root = mkdtempSync(join(tmpdir(), "dysflow-mutating-branch-"));
    writeFileSync(join(root, ".git"), "gitdir: fixture");
    const execute = vi.fn(async () => successResult({}));
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute },
        queryService: { execute },
        diagnosticsService: { run: execute },
      } as unknown as DysflowMcpServices,
      writes: true,
      cwd: root,
      projectConfigResolver: (request) =>
        diagnoseProjectConfig(root, request as Record<string, string>),
    });
    const result = await tools.find((tool) => tool.name === toolName)?.handler(input);
    expect(result?.error?.code).toBe("PROJECT_CONFIG_NOT_WRITE_READY");
    expect(execute).not.toHaveBeenCalled();
  });

  it("wrapper exposes 5 distinct error codes through the gate", async () => {
    for (const [mode, expectedCode] of writeGateCases) {
      const { root, result } = await runWriteGateCase(mode);
      try {
        expect(result.error?.code).toBe(expectedCode);
        expect(result.error?.diagnostics?.[0]?.code).toBe(expectedCode);
        expect(result.error?.message).toContain("PROJECT_CONFIG_NOT_WRITE_READY");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it("wrapper includes diagnostic.diagnostics[0].remediation as structured Remediation (issue #970)", async () => {
    for (const [mode, expectedCode, nextCommand] of writeGateCases) {
      const { root, result } = await runWriteGateCase(mode);
      try {
        expect(result.error?.code).toBe(expectedCode);
        expect(result.error?.remediation).toContain(nextCommand);
        // Issue #970 — diagnostics[].remediation is now a structured Remediation.
        // The legacy string is wrapped into { description: <original>, ... }.
        const diagRem = result.error?.diagnostics?.[0]?.remediation as
          | { description?: string; command?: string; platform?: string }
          | undefined;
        expect(typeof diagRem).toBe("object");
        expect(diagRem).not.toBeNull();
        expect(typeof diagRem?.description).toBe("string");
        expect(diagRem?.description).toContain(nextCommand);
        expect(diagRem?.command).toBeDefined();
        expect(diagRem?.platform).toBeDefined();
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });
});
