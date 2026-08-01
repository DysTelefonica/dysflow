import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSetupProjectTool } from "../../../src/adapters/mcp/setup-project-tool.js";
import { createDysflowMcpTools, MODERN_TOOL_NAMES } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "dysflow-setup-project-"));
  writeFileSync(join(workdir, ".git"), "gitdir: fixture", "utf8");
  mkdirSync(join(workdir, "src"));
  writeFileSync(join(workdir, "Frontend.accdb"), "", "utf8");
});

afterEach(() => rmSync(workdir, { recursive: true, force: true }));

function payload(result: { content: readonly { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
}

describe("setup_project MCP tool (#1312)", () => {
  it("advertises the tool and plans by default without writing", async () => {
    expect(MODERN_TOOL_NAMES).toContain("setup_project");
    const tool = createSetupProjectTool({ cwd: workdir, writesEnabled: true });

    const result = await tool.handler({ frontendFile: "Frontend.accdb" });

    expect(result.isError).toBe(false);
    expect(payload(result)).toMatchObject({
      ok: true,
      mode: "plan",
      dryRun: true,
      willWrite: true,
      resolvedConfig: {
        id: basename(workdir),
        frontendFile: "Frontend.accdb",
        destinationRoot: "src",
        capabilities: { allowWrites: true },
      },
    });
    expect(existsSync(join(workdir, ".dysflow", "project.json"))).toBe(false);
  });

  it("applies atomically and can replace the project id", async () => {
    const tool = createSetupProjectTool({ cwd: workdir, writesEnabled: true });

    const first = await tool.handler({ frontendFile: "Frontend.accdb", apply: true });
    expect(first.isError).toBe(false);
    expect(payload(first)).toMatchObject({ ok: true, mode: "apply" });

    const second = await tool.handler({
      frontendFile: "Frontend.accdb",
      projectId: "changed",
      apply: true,
    });
    expect(second.isError).toBe(false);
    const config = JSON.parse(
      readFileSync(join(workdir, ".dysflow", "project.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(config.id).toBe("changed");
  });

  it("requires both the process write gate and candidate allowWrites on apply", async () => {
    const disabled = createSetupProjectTool({ cwd: workdir, writesEnabled: false });
    const processDenied = await disabled.handler({ frontendFile: "Frontend.accdb", apply: true });
    expect(processDenied.error?.code).toBe("MCP_WRITES_DISABLED");

    const enabled = createSetupProjectTool({ cwd: workdir, writesEnabled: true });
    const projectDenied = await enabled.handler({
      frontendFile: "Frontend.accdb",
      capabilities: { allowWrites: false },
      apply: true,
    });
    expect(projectDenied.error?.code).toBe("CAPABILITIES_DISALLOW_WRITE");
    expect(existsSync(join(workdir, ".dysflow", "project.json"))).toBe(false);
  });

  it("bypasses only the missing existing-config gate so bootstrap is possible", async () => {
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
        queryService: { execute: async () => successResult({ rows: [] }) },
        diagnosticsService: { run: async () => successResult({ checks: [] }) },
      },
      writes: true,
      allowWrites: false,
      cwd: workdir,
      projectConfigResolver: async () => ({
        status: "missing",
        writeReady: false,
        cwd: workdir,
        configPath: join(workdir, ".dysflow", "project.json"),
        projectRoot: workdir,
        accessPath: null,
        backendPath: null,
        destinationRoot: null,
        projectId: null,
        diagnostics: [],
        remediation: "Run setup",
      }),
    });
    const tool = tools.find((candidate) => candidate.name === "setup_project");

    const result = await tool?.handler({ frontendFile: "Frontend.accdb", apply: true });

    expect(result?.isError).toBe(false);
    expect(existsSync(join(workdir, ".dysflow", "project.json"))).toBe(true);
  });

  it("rejects a cwd that is not a git worktree", async () => {
    rmSync(join(workdir, ".git"), { force: true });
    const tool = createSetupProjectTool({ cwd: workdir, writesEnabled: true });

    const result = await tool.handler({ frontendFile: "Frontend.accdb", apply: true });

    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe("OUTSIDE_PROJECT_ROOT");
    expect(existsSync(join(workdir, ".dysflow", "project.json"))).toBe(false);
  });
});
