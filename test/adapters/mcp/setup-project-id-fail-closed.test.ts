import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "dysflow-setup-project-id-"));
  writeFileSync(join(workdir, ".git"), "gitdir: fixture", "utf8");
  writeFileSync(join(workdir, "Frontend.accdb"), "", "utf8");
});

afterEach(() => rmSync(workdir, { recursive: true, force: true }));

function setupProjectTool() {
  const tools = createDysflowMcpTools({
    services: {
      vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
      queryService: { execute: async () => successResult({ rows: [] }) },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
    },
    writes: true,
    cwd: workdir,
  });
  const tool = tools.find((candidate) => candidate.name === "setup_project");
  if (tool === undefined) throw new Error("setup_project tool is not registered");
  return tool;
}

function payload(result: { content: readonly { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
}

describe("setup_project fails closed when projectId is omitted (HR-11)", () => {
  it("reuses an existing WorktreeContext project id instead of inventing one", async () => {
    mkdirSync(join(workdir, ".dysflow"));
    writeFileSync(
      join(workdir, ".dysflow", "project.json"),
      JSON.stringify({
        id: "configured-project",
        frontendFile: "Frontend.accdb",
        destinationRoot: "src",
        capabilities: { allowWrites: true },
      }),
      "utf8",
    );

    const result = await setupProjectTool().handler({
      cwd: workdir,
      frontendFile: "Frontend.accdb",
      apply: false,
    });

    expect(result.isError).toBe(false);
    expect(payload(result)).toMatchObject({
      ok: true,
      resolvedConfig: { id: "configured-project" },
      warnings: [
        'projectId was omitted; reused existing WorktreeContext projectId "configured-project".',
      ],
    });
  });

  it("refuses a fresh worktree without an explicit projectId", async () => {
    const result = await setupProjectTool().handler({
      cwd: workdir,
      frontendFile: "Frontend.accdb",
      apply: false,
    });

    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe("MCP_INPUT_INVALID");
    expect(result.error?.message).toContain("projectId is required");
    expect(result.error?.remediation).toContain("explicit projectId");
    expect(result.error?.remediation).toContain("existing configured id");
  });
});
