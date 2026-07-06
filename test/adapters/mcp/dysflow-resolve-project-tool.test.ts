import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createResolveProjectTool,
  tryResolveProject,
} from "../../../src/adapters/mcp/dysflow-resolve-project-tool";

/**
 * Round-3 Item 1 — `dysflow_resolve_project` exposes a pure helper
 * `tryResolveProject(input, cwd)` so consumers can ask "what would the MCP
 * think if I passed THIS projectId?" without round-tripping through the
 * running MCP. The helper never throws — it ALWAYS returns a typed
 * `ResolvedProjectResult` discriminated union so the consumer can
 * programmatically branch on `outcome`.
 *
 * The tests below exercise the helper with real tmpdirs so they catch the
 * ENOENT, EACCES-light mis-read, and JSON-parse branches without depending
 * on the live `process.cwd()`.
 */

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "dysflow-resolve-project-"));
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

function writeProjectConfig(contents: object | string): void {
  const folder = join(workdir, ".dysflow");
  mkdirSync(folder, { recursive: true });
  const text = typeof contents === "string" ? contents : JSON.stringify(contents);
  writeFileSync(join(folder, "project.json"), text, "utf-8");
}

describe("tryResolveProject() — pure helper (round-3 Item 1)", () => {
  it("returns 'project.json not found' when the file is absent", async () => {
    const result = await tryResolveProject({ projectId: "whatever" }, workdir);
    expect(result).toEqual({
      projectId: null,
      outcome: "unresolved",
      reason: "project.json not found",
      accessPath: null,
      projectRoot: null,
      sourceRoot: null,
    });
  });

  it("returns 'explicit id match' with paths when projectId matches the file", async () => {
    writeProjectConfig({
      id: "my-app",
      accessPath: "C:/data/app.accdb",
      projectRoot: "C:/repos/my-app",
      sourceRoot: "C:/repos/my-app/src",
    });

    const result = await tryResolveProject({ projectId: "my-app" }, workdir);
    expect(result).toEqual({
      projectId: "my-app",
      outcome: "resolved",
      reason: "explicit id match",
      accessPath: "C:/data/app.accdb",
      projectRoot: "C:/repos/my-app",
      sourceRoot: "C:/repos/my-app/src",
    });
  });

  it("returns 'id mismatch' when projectId differs from the file", async () => {
    writeProjectConfig({
      id: "configured-id",
      accessPath: "C:/data/app.accdb",
      projectRoot: "C:/repos/my-app",
      sourceRoot: "C:/repos/my-app/src",
    });

    const result = await tryResolveProject({ projectId: "different-id" }, workdir);
    expect(result).toEqual({
      projectId: null,
      outcome: "unresolved",
      reason: "id mismatch",
      accessPath: null,
      projectRoot: null,
      sourceRoot: null,
    });
  });

  it("returns 'single project config found' when no projectId is supplied but the file declares one", async () => {
    writeProjectConfig({
      id: "lonely-project",
      accessPath: "C:/data/app.accdb",
      projectRoot: "C:/repos/my-app",
      sourceRoot: "C:/repos/my-app/src",
    });

    const result = await tryResolveProject({}, workdir);
    expect(result).toEqual({
      projectId: "lonely-project",
      outcome: "resolved",
      reason: "single project config found",
      accessPath: "C:/data/app.accdb",
      projectRoot: "C:/repos/my-app",
      sourceRoot: "C:/repos/my-app/src",
    });
  });

  it("returns 'unknown' when the file is malformed JSON", async () => {
    writeProjectConfig("{ not valid json");

    const result = await tryResolveProject({ projectId: "anything" }, workdir);
    expect(result).toEqual({
      projectId: null,
      outcome: "unresolved",
      reason: "unknown",
      accessPath: null,
      projectRoot: null,
      sourceRoot: null,
    });
  });

  it("returns 'unknown' when the file is missing the required `id` field", async () => {
    writeProjectConfig({
      accessPath: "C:/data/app.accdb",
      projectRoot: "C:/repos/my-app",
      sourceRoot: "C:/repos/my-app/src",
    });

    const result = await tryResolveProject({ projectId: "anything" }, workdir);
    expect(result).toEqual({
      projectId: null,
      outcome: "unresolved",
      reason: "unknown",
      accessPath: null,
      projectRoot: null,
      sourceRoot: null,
    });
  });
});

describe("createResolveProjectTool() — tool factory", () => {
  it("returns a tool whose handler resolves the project from the supplied cwd", async () => {
    writeProjectConfig({
      id: "captured-cwd",
      accessPath: "C:/data/app.accdb",
      projectRoot: "C:/repos/captured-cwd",
      sourceRoot: "C:/repos/captured-cwd/src",
    });

    const tool = createResolveProjectTool({ cwd: workdir });
    expect(tool.name).toBe("dysflow_resolve_project");
    expect(tool.inputSchema.properties).toHaveProperty("projectId");

    const result = await tool.handler({ projectId: "captured-cwd" });
    expect(result.isError).toBe(false);
    expect(result.ok).toBe(true);

    const payload = JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
    expect(payload).toEqual({
      projectId: "captured-cwd",
      outcome: "resolved",
      reason: "explicit id match",
      accessPath: "C:/data/app.accdb",
      projectRoot: "C:/repos/captured-cwd",
      sourceRoot: "C:/repos/captured-cwd/src",
    });
  });

  it("handler refuses non-object input without throwing", async () => {
    const tool = createResolveProjectTool({ cwd: workdir });
    // Per the input schema both modes are technically rejected at the
    // validator boundary; the handler still has to be defensive for any
    // in-process caller that bypasses the schema gate.
    const result = await tool.handler("not-an-object");
    expect(result.isError).toBe(false);

    const payload = JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
    // No project.json was written here, so the resolver must report
    // `unresolved` + `project.json not found` regardless of the malformed
    // caller input.
    expect(payload.outcome).toBe("unresolved");
    expect(payload.reason).toBe("project.json not found");
  });
});
