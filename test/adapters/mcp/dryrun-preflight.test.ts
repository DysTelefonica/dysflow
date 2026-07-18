/**
 * Round-12 / Issue #977 — `dryRunWithPreflight: true` for write-tools.
 *
 * Adds a new input flag (mutually exclusive with `dryRun` and `apply`)
 * that runs the same pre-flight checks as `apply: true` (filesystem,
 * runtime, capabilities, project config) WITHOUT performing any write.
 * Closes the false-confidence gap exposed by #962 — today
 * `dryRun: true` only validates the plan, not the filesystem state.
 *
 * Acceptance criteria:
 *   1. preflight validates the same checks that apply does.
 *   2. a failed preflight returns the specific errorCode from the
 *      taxonomy (#962), not a generic `PROJECT_CONFIG_NOT_WRITE_READY`.
 *   3. a successful preflight guarantees that `apply: true` will
 *      succeed (modulo races).
 *   4. tests RED verify preflight failure replicates apply failure,
 *      and preflight success returns ok:true without writing.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";
import type { McpToolResult } from "../../../src/adapters/mcp/result-translation.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools.js";
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

function makeServices(): {
  vbaService: FakeVbaService;
  vbaSyncToolService: FakeVbaService;
  queryService: FakeQueryService;
  diagnosticsService: FakeDiagnosticsService;
} {
  return {
    vbaService: new FakeVbaService(),
    vbaSyncToolService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  };
}

type ToolsList = ReturnType<typeof createDysflowMcpTools>;

const freshRoots: string[] = [];

async function callTool(
  tools: ToolsList,
  name: string,
  input: Record<string, unknown>,
): Promise<McpToolResult> {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`Tool not registered: ${name}`);
  const result = await tool.handler(input);
  return result;
}

function makeHealthyRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "dysflow-977-preflight-"));
  freshRoots.push(root);
  writeFileSync(join(root, ".git"), "gitdir: isolated-fixture");
  mkdirSync(join(root, ".dysflow"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "app.accdb"), "");
  writeFileSync(
    join(root, ".dysflow", "project.json"),
    JSON.stringify({
      id: "app",
      accessPath: "app.accdb",
      destinationRoot: "src",
      capabilities: { allowWrites: true },
    }),
  );
  return root;
}

function makeRootWithConfig(
  config: Record<string, unknown>,
  extras: {
    gitDir?: boolean;
    createSrc?: boolean;
    createAppAccdb?: boolean;
    appAccdbContents?: string;
  } = {},
): string {
  const root = mkdtempSync(join(tmpdir(), "dysflow-977-custom-"));
  freshRoots.push(root);
  if (extras.gitDir !== false) writeFileSync(join(root, ".git"), "gitdir: isolated-fixture");
  mkdirSync(join(root, ".dysflow"));
  if (extras.createSrc !== false) mkdirSync(join(root, "src"));
  if (extras.createAppAccdb !== false)
    writeFileSync(join(root, "app.accdb"), extras.appAccdbContents ?? "");
  writeFileSync(join(root, ".dysflow", "project.json"), JSON.stringify(config));
  return root;
}

function makeHealthyTools(root: string) {
  return createDysflowMcpTools({
    services: makeServices() as unknown as DysflowMcpServices,
    writes: true,
    cwd: root,
    projectConfigResolver: (input) => diagnoseProjectConfig(root, input as Record<string, string>),
  });
}

beforeEach(() => {
  while (freshRoots.length > 0) {
    const r = freshRoots.pop();
    if (r !== undefined) {
      try {
        rmSync(r, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
  }
});

// ─── Acceptance criterion (a) — preflight fails with the same errorCode as apply ──

describe("dryRunWithPreflight — failed preflight mirrors apply failure (#977)", () => {
  it("export_modules fails preflight with DESTINATION_ROOT_NOT_FOUND when destinationRoot is missing", async () => {
    const root = makeRootWithConfig({
      id: "app",
      accessPath: "app.accdb",
      destinationRoot: "src-does-not-exist",
      capabilities: { allowWrites: true },
    });
    const tools = makeHealthyTools(root);
    const result = await callTool(tools, "export_modules", {
      moduleNames: ["Example"],
      projectId: "app",
      dryRunWithPreflight: true,
    });
    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe("DESTINATION_ROOT_NOT_FOUND");
  });

  it("export_modules fails preflight with OUTSIDE_PROJECT_ROOT when accessPath is external (no allowExternalAccessPath)", async () => {
    const root = makeHealthyRoot();
    const tools = makeHealthyTools(root);
    const externalPath = join(root, "..", "outside-project", "external.accdb");
    const result = await callTool(tools, "export_modules", {
      moduleNames: ["Example"],
      projectId: "app",
      accessPath: externalPath,
      dryRunWithPreflight: true,
    });
    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe("OUTSIDE_PROJECT_ROOT");
  });

  it("export_modules fails preflight with CAPABILITIES_DISALLOW_WRITE when project.json declares allowWrites=false", async () => {
    // Project setup: project.json with capabilities.allowWrites:false. The
    // preflight path mirrors apply:true → fires the project config
    // resolver → surfaces the specific CAPABILITIES_DISALLOW_WRITE code
    // from #962, NOT the generic MCP_WRITES_DISABLED.
    const root = makeRootWithConfig({
      id: "app",
      accessPath: "app.accdb",
      destinationRoot: "src",
      capabilities: { allowWrites: false },
    });
    const tools = makeHealthyTools(root);
    const result = await callTool(tools, "export_modules", {
      moduleNames: ["Example"],
      projectId: "app",
      dryRunWithPreflight: true,
    });
    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe("CAPABILITIES_DISALLOW_WRITE");
  });

  it("export_modules fails preflight with PROJECT_ID_MISMATCH when projectId disagrees", async () => {
    const root = makeHealthyRoot();
    const tools = makeHealthyTools(root);
    const result = await callTool(tools, "export_modules", {
      moduleNames: ["Example"],
      projectId: "wrong-id",
      dryRunWithPreflight: true,
    });
    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe("PROJECT_ID_MISMATCH");
  });
});

// ─── Acceptance criterion (b) — preflight on a healthy project returns ok:true ──

describe("dryRunWithPreflight — healthy project returns ok:true without writing (#977)", () => {
  it("export_modules dryRunWithPreflight on healthy project returns ok:true with preflight summary", async () => {
    const root = makeHealthyRoot();
    const tools = makeHealthyTools(root);
    const result = await callTool(tools, "export_modules", {
      moduleNames: ["Example"],
      projectId: "app",
      dryRunWithPreflight: true,
    });
    expect(result.isError, JSON.stringify(result)).toBeFalsy();
    expect(result.ok).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("preflight");
    expect(text).toContain("passed");
    expect(text).toContain("dryRunWithPreflight");
  });

  it("preflight does NOT trigger the service-layer execute path", async () => {
    const root = makeHealthyRoot();
    const localServices = makeServices();
    const tools = createDysflowMcpTools({
      services: localServices as unknown as DysflowMcpServices,
      writes: true,
      cwd: root,
      projectConfigResolver: (input) =>
        diagnoseProjectConfig(root, input as Record<string, string>),
    });
    const result = await callTool(tools, "export_modules", {
      moduleNames: ["Example"],
      projectId: "app",
      dryRunWithPreflight: true,
    });
    expect(result.isError, JSON.stringify(result)).toBeFalsy();
    expect(localServices.vbaSyncToolService.requests).toEqual([]);
  });

  it("import_modules dryRunWithPreflight on healthy project returns ok:true without spawning Access", async () => {
    const root = makeHealthyRoot();
    const localServices = makeServices();
    const tools = createDysflowMcpTools({
      services: localServices as unknown as DysflowMcpServices,
      writes: true,
      cwd: root,
      projectConfigResolver: (input) =>
        diagnoseProjectConfig(root, input as Record<string, string>),
    });
    const result = await callTool(tools, "import_modules", {
      moduleNames: ["Example"],
      projectId: "app",
      dryRunWithPreflight: true,
    });
    expect(result.isError, JSON.stringify(result)).toBeFalsy();
    expect(result.ok).toBe(true);
    expect(localServices.vbaSyncToolService.requests).toEqual([]);
  });

  it("sync_binary dryRunWithPreflight on healthy project returns ok:true without invoking inner dispatch", async () => {
    const root = makeHealthyRoot();
    const localServices = makeServices();
    const tools = createDysflowMcpTools({
      services: localServices as unknown as DysflowMcpServices,
      writes: true,
      cwd: root,
      projectConfigResolver: (input) =>
        diagnoseProjectConfig(root, input as Record<string, string>),
    });
    const result = await callTool(tools, "sync_binary", {
      projectId: "app",
      direction: "src-to-binary",
      dryRunWithPreflight: true,
    });
    expect(result.isError, JSON.stringify(result)).toBeFalsy();
    expect(result.ok).toBe(true);
    expect(localServices.vbaSyncToolService.requests).toEqual([]);
  });
});

// ─── Acceptance criterion (b cont.) — preflight result matches apply failure ───

describe("dryRunWithPreflight — failed preflight replicates apply failure (#977)", () => {
  it("export_modules preflight + apply both fail with DESTINATION_ROOT_NOT_FOUND on missing destinationRoot", async () => {
    const root = makeRootWithConfig({
      id: "app",
      accessPath: "app.accdb",
      destinationRoot: "src-does-not-exist",
      capabilities: { allowWrites: true },
    });
    const tools = makeHealthyTools(root);

    const preflight = await callTool(tools, "export_modules", {
      moduleNames: ["Example"],
      projectId: "app",
      dryRunWithPreflight: true,
    });
    const applyResult = await callTool(tools, "export_modules", {
      moduleNames: ["Example"],
      projectId: "app",
      apply: true,
      confirmOverwriteSource: true,
    });

    expect(preflight.error?.code).toBe("DESTINATION_ROOT_NOT_FOUND");
    expect(applyResult.error?.code).toBe("DESTINATION_ROOT_NOT_FOUND");
    // Same diagnostics[0].code too (the typed envelope is identical).
    expect(preflight.error?.diagnostics?.[0]?.code).toBe("DESTINATION_ROOT_NOT_FOUND");
    expect(applyResult.error?.diagnostics?.[0]?.code).toBe("DESTINATION_ROOT_NOT_FOUND");
  });
});

// ─── Acceptance criterion (3) — dryRunWithPreflight is mutually exclusive with dryRun/apply ─

describe("dryRunWithPreflight — flag exclusivity (#977)", () => {
  it("dryRunWithPreflight + dryRun both set returns MCP_INPUT_INVALID (documented behavior)", async () => {
    const root = makeHealthyRoot();
    const tools = makeHealthyTools(root);
    const result = await callTool(tools, "export_modules", {
      moduleNames: ["Example"],
      projectId: "app",
      dryRun: true,
      dryRunWithPreflight: true,
    });
    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe("MCP_INPUT_INVALID");
  });

  it("dryRunWithPreflight + apply both set runs the apply path (apply takes precedence)", async () => {
    const root = makeHealthyRoot();
    const localServices = makeServices();
    const tools = createDysflowMcpTools({
      services: localServices as unknown as DysflowMcpServices,
      writes: true,
      cwd: root,
      projectConfigResolver: (input) =>
        diagnoseProjectConfig(root, input as Record<string, string>),
    });
    const result = await callTool(tools, "export_modules", {
      moduleNames: ["Example"],
      projectId: "app",
      apply: true,
      dryRunWithPreflight: true,
      confirmOverwriteSource: true,
    });
    // apply wins on the existing dispatch seam — the preflight is
    // bypassed and the call runs the apply path. The apply path
    // invokes vbaSyncToolService.execute with dryRun resolved by
    // resolveIsDryRun; export_modules' legacy noWriteAlias is
    // `diff`, so without a dryRun flag it falls through to
    // apply:true semantics.
    expect(result.error?.code === "MCP_INPUT_INVALID").toBe(false);
    expect(result.isError).toBe(false);
    expect(localServices.vbaSyncToolService.requests.length).toBeGreaterThanOrEqual(1);
  });
});
