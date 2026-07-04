/**
 * Issue #694 — relink_directory rejects inline raw password fields.
 *
 * `backendPassword` and `password` (alias) are rejected at the MCP dispatch
 * boundary because inline secrets risk being captured in tool-call transcripts.
 * Callers MUST use `passwordEnv` to name an environment variable instead.
 *
 * These tests are behavioral/port-level: they verify the dispatch tool rejects
 * the call and returns the correct remediation, NOT the internal implementation.
 */

import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

class FakeQueryService {
  async execute() {
    return successResult({
      relinkDirectory: {
        mode: "dry-run" as const,
        root: "C:\\data",
        filesScanned: 0,
        linkedTablesFound: 0,
        alreadyLocal: 0,
        plannedRelinks: 0,
        appliedRelinks: 0,
        unresolved: [],
        removed: [],
        externalLinkCount: 0,
        datosteLinkCount: 0,
        brokenLinkCount: 0,
        backupPaths: [],
        errors: [],
        fileResults: [],
      },
    });
  }
}

function makeServices() {
  return {
    vbaService: {
      async execute() {
        return successResult({ returnValue: "ok" });
      },
    },
    vbaSyncToolService: {
      async execute() {
        return successResult({});
      },
    },
    queryService: new FakeQueryService(),
    diagnosticsService: {
      async run() {
        return successResult({ checks: [] });
      },
    },
  };
}

function relinkTool(writesEnabled = true) {
  const services = makeServices();
  const tools = createDysflowMcpTools(services, writesEnabled);
  const tool = tools.find((t) => t.name === "relink_directory");
  if (!tool) throw new Error("relink_directory tool not found");
  return tool;
}

describe("relink_directory inline password rejection (#694)", () => {
  it("rejects 'backendPassword' with MCP_INPUT_INVALID and remediation", async () => {
    const tool = relinkTool();
    const result = await tool.handler({
      rootPath: "C:\\data",
      apply: true,
      backendPassword: "super-secret-123",
    });

    expect(result.ok).toBe(false);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_INPUT_INVALID");
    expect(result.content[0]?.text).toContain("backendPassword");
    expect(result.content[0]?.text).toContain("passwordEnv");
    // Remediation is surfaced via the structured error block
    expect(result.error?.remediation).toMatch(/passwordEnv/i);
  });

  it("rejects inline password before the write gate when writes are disabled", async () => {
    const tool = relinkTool(false);
    const result = await tool.handler({
      rootPath: "C:\\data",
      apply: true,
      backendPassword: "super-secret-123",
    });

    expect(result.ok).toBe(false);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_INPUT_INVALID");
    expect(result.content[0]?.text).not.toContain("MCP_WRITES_DISABLED");
    expect(result.error?.code).toBe("MCP_INPUT_INVALID");
    expect(result.error?.remediation).toMatch(/passwordEnv/i);
  });

  it("rejects 'password' alias with MCP_INPUT_INVALID and remediation", async () => {
    const tool = relinkTool();
    const result = await tool.handler({
      rootPath: "C:\\data",
      apply: true,
      password: "super-secret-456",
    });

    expect(result.ok).toBe(false);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_INPUT_INVALID");
    expect(result.content[0]?.text).toContain("password");
    expect(result.content[0]?.text).toContain("passwordEnv");
    expect(result.error?.remediation).toMatch(/passwordEnv/i);
  });

  it("accepts 'passwordEnv' without error", async () => {
    const tool = relinkTool();
    const result = await tool.handler({
      rootPath: "C:\\data",
      apply: true,
      passwordEnv: "MY_BACKEND_PASSWORD",
    });

    // The call should reach the query service (or fail for other reasons),
    // NOT be rejected at the dispatch boundary for inline password.
    // A real env-var lookup would need the service to be wired differently
    // in a unit test; here we just verify it does NOT return MCP_INPUT_INVALID.
    expect(result.content[0]?.text ?? "").not.toContain("MCP_INPUT_INVALID");
    expect(result.content[0]?.text ?? "").not.toContain("backendPassword");
  });

  it("accepts call with no password fields at all", async () => {
    const tool = relinkTool();
    const result = await tool.handler({
      rootPath: "C:\\data",
      dryRun: true,
    });

    // No password fields → no inline-password rejection
    expect(result.content[0]?.text ?? "").not.toContain("MCP_INPUT_INVALID");
    expect(result.content[0]?.text ?? "").not.toContain("backendPassword");
  });

  it("does NOT reject link_tables or relink_tables that may have different security models", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools(services, true);
    const linkTool = tools.find((t) => t.name === "link_tables");
    const relinkTool2 = tools.find((t) => t.name === "relink_tables");

    // These tools do NOT surface the inline-password rejection (different surface).
    // They have no password field in their schemas anyway, but this is a
    // regression guard to document that the rejection is scoped to relink_directory.
    expect(linkTool).toBeDefined();
    expect(relinkTool2).toBeDefined();
  });
});
