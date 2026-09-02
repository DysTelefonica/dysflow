import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

    const result = await tool.handler({ frontendFile: "Frontend.accdb", projectId: "fixture" });

    expect(result.isError).toBe(false);
    expect(payload(result)).toMatchObject({
      ok: true,
      mode: "plan",
      dryRun: true,
      willWrite: true,
      resolvedConfig: {
        id: "fixture",
        frontendFile: "Frontend.accdb",
        destinationRoot: "src",
        capabilities: { allowWrites: true },
      },
    });
    expect(existsSync(join(workdir, ".dysflow", "project.json"))).toBe(false);
  });

  it("applies atomically and can replace the project id", async () => {
    const tool = createSetupProjectTool({ cwd: workdir, writesEnabled: true });

    const first = await tool.handler({
      frontendFile: "Frontend.accdb",
      projectId: "initial",
      apply: true,
    });
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
    const processDenied = await disabled.handler({
      frontendFile: "Frontend.accdb",
      projectId: "fixture",
      apply: true,
    });
    expect(processDenied.error?.code).toBe("MCP_WRITES_DISABLED");

    const enabled = createSetupProjectTool({ cwd: workdir, writesEnabled: true });
    const projectDenied = await enabled.handler({
      frontendFile: "Frontend.accdb",
      projectId: "fixture",
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

    const result = await tool?.handler({
      frontendFile: "Frontend.accdb",
      projectId: "fixture",
      apply: true,
    });

    expect(result?.isError).toBe(false);
    expect(existsSync(join(workdir, ".dysflow", "project.json"))).toBe(true);
  });

  it("rejects a cwd that is not a git worktree", async () => {
    rmSync(join(workdir, ".git"), { force: true });
    const tool = createSetupProjectTool({ cwd: workdir, writesEnabled: true });

    const result = await tool.handler({
      frontendFile: "Frontend.accdb",
      projectId: "fixture",
      apply: true,
    });

    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe("OUTSIDE_PROJECT_ROOT");
    expect(existsSync(join(workdir, ".dysflow", "project.json"))).toBe(false);
  });

  it("accepts capabilities.procedures.allow in plan and apply modes", async () => {
    const tool = createSetupProjectTool({ cwd: workdir, writesEnabled: true });
    const capabilities = {
      procedures: { allow: ["Test_A", "Test_B"] },
    };

    const preview = await tool.handler({
      frontendFile: "Frontend.accdb",
      projectId: "fixture",
      capabilities,
      apply: false,
    });

    expect(preview.isError).toBe(false);
    expect(payload(preview)).toMatchObject({
      resolvedConfig: { capabilities: { allowWrites: true, ...capabilities } },
    });

    const applied = await tool.handler({
      frontendFile: "Frontend.accdb",
      projectId: "fixture",
      capabilities,
      apply: true,
    });

    expect(applied.isError).toBe(false);
    expect(
      JSON.parse(readFileSync(join(workdir, ".dysflow", "project.json"), "utf8")),
    ).toMatchObject({ capabilities: { allowWrites: true, ...capabilities } });
  });

  it("preserves all 22 configured procedure allowlist entries in plan and apply", async () => {
    const tool = createSetupProjectTool({ cwd: workdir, writesEnabled: true });
    const allow = Array.from({ length: 22 }, (_, index) => `Test_Procedure_${index + 1}`);
    const capabilities = { procedures: { allow } };

    const preview = await tool.handler({
      frontendFile: "Frontend.accdb",
      projectId: "fixture",
      capabilities,
      apply: false,
    });
    expect(preview.isError).toBe(false);
    expect(payload(preview)).toMatchObject({
      resolvedConfig: { capabilities: { procedures: { allow } } },
    });

    const applied = await tool.handler({
      frontendFile: "Frontend.accdb",
      projectId: "fixture",
      capabilities,
      apply: true,
    });
    expect(applied.isError).toBe(false);
    const persisted = JSON.parse(readFileSync(join(workdir, ".dysflow", "project.json"), "utf8"));
    expect(persisted.capabilities.procedures.allow).toEqual(allow);
  });

  it("preserves an existing procedures allowlist when setup omits it", async () => {
    mkdirSync(join(workdir, ".dysflow"));
    writeFileSync(
      join(workdir, ".dysflow", "project.json"),
      JSON.stringify({
        id: "fixture",
        frontendFile: "Frontend.accdb",
        destinationRoot: "src",
        capabilities: {
          allowWrites: true,
          procedures: { allow: ["Test_Existing"] },
        },
      }),
      "utf8",
    );
    const tool = createSetupProjectTool({ cwd: workdir, writesEnabled: true });

    const result = await tool.handler({
      frontendFile: "Frontend.accdb",
      projectId: "fixture",
      apply: true,
    });

    expect(result.isError).toBe(false);
    expect(
      JSON.parse(readFileSync(join(workdir, ".dysflow", "project.json"), "utf8")),
    ).toMatchObject({
      capabilities: {
        allowWrites: true,
        procedures: { allow: ["Test_Existing"] },
      },
    });
  });

  it("imports a sibling worktree config and retargets its project root", async () => {
    const source = mkdtempSync(join(tmpdir(), "dysflow-setup-project-source-"));
    try {
      writeFileSync(join(source, ".git"), "gitdir: fixture", "utf8");
      mkdirSync(join(source, ".dysflow"));
      mkdirSync(join(source, "src"));
      writeFileSync(join(source, "Frontend.accdb"), "", "utf8");
      writeFileSync(
        join(source, ".dysflow", "project.json"),
        JSON.stringify({
          id: "fixture",
          frontendFile: "Frontend.accdb",
          projectRoot: source,
          destinationRoot: "src",
          capabilities: {
            allowWrites: true,
            writeExecutionPolicy: "developer",
            procedures: { allow: ["Test_A", "Test_B"] },
          },
        }),
        "utf8",
      );
      const tool = createSetupProjectTool({ cwd: workdir, writesEnabled: true });
      const input = {
        cwd: workdir,
        projectId: "fixture",
        fromCwd: source,
        overrideProjectRoot: workdir,
      };

      const preview = await tool.handler({ ...input, apply: false });

      expect(preview.isError).toBe(false);
      expect(payload(preview)).toMatchObject({
        mode: "plan",
        resolvedConfig: {
          projectRoot: workdir,
          capabilities: { procedures: { allow: ["Test_A", "Test_B"] } },
        },
      });
      expect(existsSync(join(workdir, ".dysflow", "project.json"))).toBe(false);

      const result = await tool.handler({ ...input, apply: true });

      expect(result.isError).toBe(false);
      expect(
        JSON.parse(readFileSync(join(workdir, ".dysflow", "project.json"), "utf8")),
      ).toMatchObject({
        id: "fixture",
        frontendFile: "Frontend.accdb",
        projectRoot: workdir,
        capabilities: {
          writeExecutionPolicy: "developer",
          procedures: { allow: ["Test_A", "Test_B"] },
        },
      });
    } finally {
      rmSync(source, { recursive: true, force: true });
    }
  });

  it("returns typed errors for missing and invalid cross-worktree source configs", async () => {
    const tool = createSetupProjectTool({ cwd: workdir, writesEnabled: true });
    const missing = await tool.handler({
      cwd: workdir,
      projectId: "fixture",
      fromCwd: join(workdir, "missing"),
      overrideProjectRoot: workdir,
      apply: false,
    });
    expect(missing.error?.code).toBe("FROMCWD_NOT_FOUND");

    const source = mkdtempSync(join(tmpdir(), "dysflow-setup-project-invalid-source-"));
    try {
      writeFileSync(join(source, ".git"), "gitdir: fixture", "utf8");
      mkdirSync(join(source, ".dysflow"));
      writeFileSync(join(source, ".dysflow", "project.json"), "{ invalid", "utf8");

      const invalid = await tool.handler({
        cwd: workdir,
        projectId: "fixture",
        fromCwd: source,
        overrideProjectRoot: workdir,
        apply: false,
      });
      expect(invalid.error?.code).toBe("FROMCWD_CONFIG_INVALID");
    } finally {
      rmSync(source, { recursive: true, force: true });
    }
  });
});
