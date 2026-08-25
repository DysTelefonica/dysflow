import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic";
import { sharedBlockPolicyForTool } from "../../../src/adapters/mcp/mcp-tool-risks";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

const EXTERNAL_ACCESS_PATH = "C:/archives/legacy.accdb";
const MODULE_SOURCE = [
  'Attribute VB_Name = "LegacyRules"',
  "Option Explicit",
  "Public Sub UsedRule()",
  "End Sub",
  "Private Sub UnusedRule()",
  "End Sub",
  "Public Sub Caller()",
  "    Call UsedRule",
  "End Sub",
].join("\r\n");

type InspectionCall = { toolName: string; input: Record<string, unknown> };
const roots: string[] = [];

function makeHarness() {
  const calls: InspectionCall[] = [];
  const services: DysflowMcpServices = {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
    vbaSyncToolService: {
      execute: async (toolName, input) => {
        calls.push({ toolName, input: input as Record<string, unknown> });
        if (toolName === "vba_orphan_audit") return successResult({ orphans: ["LegacyRules"] });
        return successResult({
          modules: [
            {
              name: "LegacyRules",
              binaryExists: true,
              binarySource: MODULE_SOURCE,
            },
          ],
          summary: { total: 1 },
        });
      },
    },
  };
  const tools = createDysflowMcpTools({
    services,
    accessContextResolver: async () =>
      successResult({
        accessPath: EXTERNAL_ACCESS_PATH,
        projectRoot: "C:/worktree",
        destinationRoot: "C:/worktree/src",
      }),
  });
  return { calls, tools };
}

function tool(name: string, tools: ReturnType<typeof makeHarness>["tools"]) {
  const found = tools.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`${name} tool not found`);
  return found;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("external access propagation (#1542)", () => {
  it("advertises the explicit accessPath opt-in on all six read-only tools", () => {
    const { tools } = makeHarness();
    for (const name of [
      "get_procedure",
      "list_procedures",
      "lint_module",
      "detect_dead_code",
      "find_references",
      "vba_orphan_audit",
    ]) {
      expect(tool(name, tools)).toHaveProperty("inputSchema.properties.allowExternalAccessPath");
    }
  });

  it("lints the requested module bytes from an opted-in external binary", async () => {
    const harness = makeHarness();
    const result = await tool("lint_module", harness.tools).handler({
      module: "LegacyRules",
      source: "binary",
      accessPath: EXTERNAL_ACCESS_PATH,
      allowExternalAccessPath: true,
      rules: ["option-declaration"],
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0]?.text ?? "{}")).toMatchObject({
      module: "LegacyRules",
      isClean: false,
      flatDiagnostics: [expect.objectContaining({ rule: "option-declaration" })],
    });
    expect(harness.calls).toEqual([
      {
        toolName: "list_vba_modules",
        input: expect.objectContaining({
          accessPath: EXTERNAL_ACCESS_PATH,
          allowExternalAccessPath: true,
          includeSource: true,
          namePattern: "LegacyRules",
        }),
      },
    ]);
  });

  it("finds concrete binary references through the opted-in external path", async () => {
    const harness = makeHarness();
    const result = await tool("find_references", harness.tools).handler({
      symbol: "UsedRule",
      scope: "binary",
      accessPath: EXTERNAL_ACCESS_PATH,
      allowExternalAccessPath: true,
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0]?.text ?? "{}").references).toEqual([
      { module: "LegacyRules", kind: "Sub", line: 8, context: "Call UsedRule" },
    ]);
    expect(harness.calls[0]).toEqual({
      toolName: "list_vba_modules",
      input: expect.objectContaining({
        accessPath: EXTERNAL_ACCESS_PATH,
        allowExternalAccessPath: true,
        includeSource: true,
      }),
    });
  });

  it("detects dead code from external binary bytes only after explicit opt-in", async () => {
    const harness = makeHarness();
    const result = await tool("detect_dead_code", harness.tools).handler({
      scope: "binary",
      accessPath: EXTERNAL_ACCESS_PATH,
      allowExternalAccessPath: true,
    });

    expect(result.isError).toBe(false);
    const findings = JSON.parse(result.content[0]?.text ?? "{}").findings as Array<{
      symbol: string;
    }>;
    expect(findings.map((finding) => finding.symbol)).toContain("UnusedRule");
    expect(harness.calls[0]).toEqual({
      toolName: "list_vba_modules",
      input: expect.objectContaining({
        accessPath: EXTERNAL_ACCESS_PATH,
        allowExternalAccessPath: true,
        includeSource: true,
      }),
    });
  });

  it("keeps inline dead-code analysis process-free", async () => {
    const harness = makeHarness();
    const result = await tool("detect_dead_code", harness.tools).handler({
      scope: "binary",
      modules: { LegacyRules: MODULE_SOURCE },
    });

    expect(result.isError).toBe(false);
    expect(harness.calls).toEqual([]);
  });

  it("forwards the opt-in through vba_orphan_audit", async () => {
    const harness = makeHarness();
    const result = await tool("vba_orphan_audit", harness.tools).handler({
      accessPath: EXTERNAL_ACCESS_PATH,
      allowExternalAccessPath: true,
    });

    expect(result.isError).toBe(false);
    expect(harness.calls).toEqual([
      {
        toolName: "vba_orphan_audit",
        input: expect.objectContaining({
          accessPath: EXTERNAL_ACCESS_PATH,
          allowExternalAccessPath: true,
        }),
      },
    ]);
  });

  it("classifies every newly process-backed read tool with timeout control", () => {
    for (const name of ["lint_module", "detect_dead_code", "find_references", "vba_orphan_audit"]) {
      expect(sharedBlockPolicyForTool(name).timeoutMs).toBe("required");
    }
  });

  it.each([
    ["import_modules", { moduleNames: ["LegacyRules"] }],
    ["run_vba", { procedureName: "LegacyRules.Caller" }],
    ["test_vba", { testsPath: "tests/tests.vba.json" }],
    ["delete_module", { moduleName: "LegacyRules" }],
    ["cleanup_access_operation", { operationId: "op-1542", accessPath: EXTERNAL_ACCESS_PATH }],
    ["access_force_cleanup_orphaned", { pid: null }],
  ])("rejects allowExternalAccessPath explicitly on write tool %s", async (name, input) => {
    const harness = makeHarness();
    const result = await tool(name, harness.tools).handler({
      ...input,
      allowExternalAccessPath: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("allowExternalAccessPath is not allowed");
    expect(harness.calls).toEqual([]);
  });
});

describe("external export destination plans (#1542)", () => {
  it("rejects external destinations unless export_modules is an explicit plan", async () => {
    const harness = makeHarness();
    const result = await tool("export_modules", harness.tools).handler({
      moduleNames: ["LegacyRules"],
      destinationRoot: "C:/exports/review",
      allowExternalDestinationRoot: true,
      apply: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("allowExternalDestinationRoot");
    expect(harness.calls).toEqual([]);
  });

  it("allows only an explicit export_modules plan to target an existing external directory", () => {
    const root = mkdtempSync(join(tmpdir(), "dysflow-1542-root-"));
    const external = mkdtempSync(join(tmpdir(), "dysflow-1542-export-"));
    roots.push(root, external);
    writeFileSync(join(root, ".git"), "gitdir: fixture");
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", frontendFile: "app.accdb", destinationRoot: "src" }),
    );

    const allowed = diagnoseProjectConfig(root, {
      operation: "export_modules",
      projectId: "app",
      destinationRoot: external,
      allowExternalDestinationRoot: true,
      apply: false,
      mutatesBinary: false,
    });
    const deniedApply = diagnoseProjectConfig(root, {
      operation: "export_modules",
      projectId: "app",
      destinationRoot: external,
      allowExternalDestinationRoot: true,
      apply: true,
      mutatesBinary: false,
    });

    expect(allowed).toMatchObject({ status: "valid", writeReady: true });
    expect(deniedApply).toMatchObject({ status: "outside-project-root", writeReady: false });
  });

  it("fails closed when an external preview destination is a symlink or reparse point", () => {
    const root = mkdtempSync(join(tmpdir(), "dysflow-1542-root-"));
    const external = mkdtempSync(join(tmpdir(), "dysflow-1542-export-"));
    const aliasRoot = mkdtempSync(join(tmpdir(), "dysflow-1542-alias-"));
    const alias = join(aliasRoot, "review");
    roots.push(root, aliasRoot, external);
    symlinkSync(external, alias, process.platform === "win32" ? "junction" : "dir");
    writeFileSync(join(root, ".git"), "gitdir: fixture");
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", frontendFile: "app.accdb", destinationRoot: "src" }),
    );

    expect(
      diagnoseProjectConfig(root, {
        operation: "export_modules",
        projectId: "app",
        destinationRoot: alias,
        allowExternalDestinationRoot: true,
        apply: false,
        mutatesBinary: false,
      }),
    ).toMatchObject({ status: "outside-project-root", writeReady: false });
  });
});
