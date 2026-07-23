/**
 * Issue #1057 (Round-15 F10) — per-call `cwd` override for the
 * project-scoped read tools (`resolve_project`, `diagnose`, `state`,
 * `logs`). The factories capture `cwd` once at construction (stdio.ts
 * hard-codes `process.cwd()`), which forced an MCP restart to operate on
 * a sibling worktree. Contract:
 *
 *   - `cwd` is OPTIONAL: absent → factory cwd (backwards compatible).
 *   - present → must be an existing directory containing a readable
 *     `.dysflow/project.json`, else `MCP_INPUT_INVALID` with a
 *     "not a dysflow project" hint.
 *   - the handler resolves every path against the override.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DIAGNOSE_INPUT_SCHEMA } from "../../../src/adapters/mcp/diagnose-tool";
import { LOGS_TOOL_SCHEMA } from "../../../src/adapters/mcp/logs-tool";
import { createResolveProjectTool } from "../../../src/adapters/mcp/resolve-project-tool";
import { createStateTool, STATE_TOOL_SCHEMA } from "../../../src/adapters/mcp/state-tool";

let projectA: string;
let projectB: string;

function writeProject(id: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `dysflow-cwd-1057-${id}-`));
  mkdirSync(path.join(dir, ".dysflow"), { recursive: true });
  mkdirSync(path.join(dir, "src"), { recursive: true });
  writeFileSync(path.join(dir, "App.accdb"), "stub");
  writeFileSync(
    path.join(dir, ".dysflow", "project.json"),
    JSON.stringify({ id, accessPath: "App.accdb", destinationRoot: "src" }),
  );
  return dir;
}

function payloadOf(result: { content: readonly { text: string }[] }): Record<string, unknown> {
  const text = result.content[0]?.text ?? "{}";
  return JSON.parse(text.replace(/^[A-Z_]+: /, "")) as Record<string, unknown>;
}

beforeAll(() => {
  projectA = writeProject("project-a");
  projectB = writeProject("project-b");
});

afterAll(() => {
  rmSync(projectA, { recursive: true, force: true });
  rmSync(projectB, { recursive: true, force: true });
});

describe("resolve_project cwd override (#1057 F10)", () => {
  it("targets the override cwd, not the factory cwd", async () => {
    const tool = createResolveProjectTool({ cwd: projectA });
    const result = await tool.handler({ projectId: "project-b", cwd: projectB });
    expect(result.isError).toBe(false);
    const payload = payloadOf(result);
    expect(payload.projectId).toBe("project-b");
    expect(payload.outcome).toBe("resolved");
  });

  it("keeps using the factory cwd when no override is passed (backwards compat)", async () => {
    const tool = createResolveProjectTool({ cwd: projectA });
    const result = await tool.handler({ projectId: "project-a" });
    expect(result.isError).toBe(false);
    const payload = payloadOf(result);
    expect(payload.projectId).toBe("project-a");
    expect(payload.outcome).toBe("resolved");
  });

  it("rejects a cwd that is not a dysflow project", async () => {
    const notAProject = mkdtempSync(path.join(tmpdir(), "dysflow-cwd-1057-empty-"));
    try {
      const tool = createResolveProjectTool({ cwd: projectA });
      const result = await tool.handler({ cwd: notAProject });
      expect(result.isError).toBe(true);
      const text = result.content[0]?.text ?? "";
      expect(text).toMatch(/MCP_INPUT_INVALID/);
      expect(text).toMatch(/not a dysflow project|missing .*project\.json/i);
    } finally {
      rmSync(notAProject, { recursive: true, force: true });
    }
  });

  it("rejects a cwd that does not exist", async () => {
    const tool = createResolveProjectTool({ cwd: projectA });
    const result = await tool.handler({ cwd: path.join(tmpdir(), "does-not-exist-1057") });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text ?? "").toMatch(/MCP_INPUT_INVALID/);
  });

  it("declares cwd as an optional string in the input schema", async () => {
    const tool = createResolveProjectTool({ cwd: projectA });
    const schema = tool.inputSchema as {
      properties: Record<string, { type?: string }>;
      required?: readonly string[];
    };
    expect(schema.properties.cwd?.type).toBe("string");
    expect(schema.required ?? []).not.toContain("cwd");
  });
});

describe("diagnose / state / logs cwd override (#1057 F10)", () => {
  it("all three sibling schemas declare the optional cwd override", () => {
    for (const schema of [DIAGNOSE_INPUT_SCHEMA, STATE_TOOL_SCHEMA, LOGS_TOOL_SCHEMA]) {
      const typed = schema as unknown as {
        properties: Record<string, { type?: string }>;
        required?: readonly string[];
      };
      expect(typed.properties.cwd?.type).toBe("string");
      expect(typed.required ?? []).not.toContain("cwd");
    }
  });

  it("state reads markers from the override cwd", async () => {
    mkdirSync(path.join(projectB, ".dysflow", "runtime", "markers"), { recursive: true });
    writeFileSync(
      path.join(projectB, ".dysflow", "runtime", "markers", "op-b.json"),
      JSON.stringify({
        operationId: "op-b",
        status: "completed",
        updatedAt: new Date().toISOString(),
      }),
    );
    const registry = {
      create: async () => ({}) as never,
      update: async () => undefined,
      get: async () => undefined,
      listRecent: async () => [],
      getHealth: () => ({ status: "ok" }) as const,
    };
    const tool = createStateTool({ cwd: projectA, registry });
    const result = await tool.handler({ cwd: projectB });
    expect(result.isError).toBe(false);
    const payload = payloadOf(result) as { markers?: { name?: string; operationId?: string }[] };
    expect(JSON.stringify(payload)).toContain("op-b");
  });

  it("state rejects a non-project cwd override", async () => {
    const registry = {
      create: async () => ({}) as never,
      update: async () => undefined,
      get: async () => undefined,
      listRecent: async () => [],
      getHealth: () => ({ status: "ok" }) as const,
    };
    const tool = createStateTool({ cwd: projectA, registry });
    const notAProject = mkdtempSync(path.join(tmpdir(), "dysflow-cwd-1057-state-"));
    try {
      const result = await tool.handler({ cwd: notAProject });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text ?? "").toMatch(/not a dysflow project/i);
    } finally {
      rmSync(notAProject, { recursive: true, force: true });
    }
  });
});
