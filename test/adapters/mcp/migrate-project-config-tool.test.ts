import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMigrateProjectConfigTool,
  type MigrateProjectConfigInput,
  tryMigrateProjectConfig,
} from "../../../src/adapters/mcp/migrate-project-config-tool";
import { MODERN_TOOL_NAMES } from "../../../src/adapters/mcp/tools";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

/**
 * Issue #1177 — `migrate_project_config` MCP tool.
 *
 * Acceptance criteria pinned here:
 *
 *  - Read-only path returns `{ current, proposed, diff, remediation[] }`
 *    without writing.
 *  - Apply path (`apply: true`) rewrites the file in place atomically.
 *  - Already-migrated config returns a no-op diff (idempotent).
 *  - Apply refuses when writes are disabled (`MCP_WRITES_DISABLED`).
 *  - Legacy absolute `accessPath` migrates to basename `frontendFile`.
 *  - Top-level `allowWrites` migrates to `capabilities.allowWrites`.
 *  - Tool is registered in `MODERN_TOOL_NAMES` and advertised via the
 *    `createDysflowMcpTools` factory.
 */

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "dysflow-migrate-pc-"));
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

function writeProjectConfig(contents: object | string): string {
  const folder = join(workdir, ".dysflow");
  mkdirSync(folder, { recursive: true });
  const text = typeof contents === "string" ? contents : JSON.stringify(contents, null, 2);
  const target = join(folder, "project.json");
  writeFileSync(target, text, "utf-8");
  return target;
}

function readProjectConfig(): Record<string, unknown> {
  const raw = readFileSync(join(workdir, ".dysflow", "project.json"), "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

const LEGACY_WITH_ABSOLUTE_ACCESS_PATH = {
  id: "legacy-app",
  accessPath: "C:/Users/alice/repos/legacy-app/frontend.accdb",
  projectRoot: "C:/Users/alice/repos/legacy-app",
  destinationRoot: "C:/Users/alice/repos/legacy-app/src",
  allowWrites: true,
};

const MIGRATED_FRONTEND_FILE = {
  id: "modern-app",
  frontendFile: "frontend.accdb",
  projectRoot: "C:/Users/alice/repos/modern-app",
  destinationRoot: "C:/Users/alice/repos/modern-app/src",
  capabilities: { allowWrites: true },
};

describe("tryMigrateProjectConfig() — pure helper", () => {
  it("returns a typed error when the project.json file is missing", async () => {
    const result = await tryMigrateProjectConfig({}, workdir);
    expect(result.outcome).toBe("error");
    if (result.outcome !== "error") return;
    expect(result.error.code).toBe("PROJECT_CONFIG_NOT_FOUND");
  });

  it("returns a typed error when the project.json is malformed JSON", async () => {
    writeProjectConfig("{ not valid json");
    const result = await tryMigrateProjectConfig({}, workdir);
    expect(result.outcome).toBe("error");
    if (result.outcome !== "error") return;
    expect(result.error.code).toBe("PROJECT_CONFIG_INVALID");
  });

  it("rewrites an absolute legacy accessPath as a basename frontendFile", async () => {
    writeProjectConfig(LEGACY_WITH_ABSOLUTE_ACCESS_PATH);
    const result = await tryMigrateProjectConfig({}, workdir);
    expect(result.outcome).toBe("ok");
    if (result.outcome !== "ok") return;
    expect(result.current.accessPath).toBe("C:/Users/alice/repos/legacy-app/frontend.accdb");
    expect(result.proposed.accessPath).toBeUndefined();
    expect(result.proposed.frontendFile).toBe("frontend.accdb");
    expect(result.diff).toContain('-  "accessPath"');
    expect(result.diff).toContain('+  "frontendFile"');
    expect(result.diff).toContain("frontend.accdb");
    expect(result.remediation.length).toBeGreaterThan(0);
  });

  it("moves top-level allowWrites into capabilities.allowWrites (T18 follow-up)", async () => {
    writeProjectConfig({
      id: "legacy-allow-writes",
      frontendFile: "frontend.accdb",
      projectRoot: "C:/data",
      destinationRoot: "C:/data/src",
      allowWrites: false,
    });
    const result = await tryMigrateProjectConfig({}, workdir);
    expect(result.outcome).toBe("ok");
    if (result.outcome !== "ok") return;
    expect(result.current.allowWrites).toBe(false);
    expect(result.proposed.allowWrites).toBeUndefined();
    expect(result.proposed.capabilities).toEqual({ allowWrites: false });
    expect(result.diff).toContain("capabilities");
  });

  it("is idempotent: an already-migrated config returns a no-op diff", async () => {
    writeProjectConfig(MIGRATED_FRONTEND_FILE);
    const result = await tryMigrateProjectConfig({}, workdir);
    expect(result.outcome).toBe("ok");
    if (result.outcome !== "ok") return;
    expect(result.diff).toBe("");
    expect(result.proposed).toEqual(result.current);
    expect(result.remediation).toEqual([]);
  });

  it("leaves a basename accessPath alone (no migration needed)", async () => {
    writeProjectConfig({
      id: "basename-app",
      accessPath: "frontend.accdb",
      projectRoot: "C:/data",
      destinationRoot: "C:/data/src",
    });
    const result = await tryMigrateProjectConfig({}, workdir);
    expect(result.outcome).toBe("ok");
    if (result.outcome !== "ok") return;
    expect(result.diff).toBe("");
    expect(result.remediation).toEqual([]);
  });

  it("does NOT write to disk on the read-only path", async () => {
    const configPath = writeProjectConfig(LEGACY_WITH_ABSOLUTE_ACCESS_PATH);
    const before = readFileSync(configPath, "utf-8");
    const result = await tryMigrateProjectConfig({}, workdir);
    expect(result.outcome).toBe("ok");
    const after = readFileSync(configPath, "utf-8");
    expect(after).toBe(before);
  });
});

describe("createMigrateProjectConfigTool() — tool factory", () => {
  it("MODERN_TOOL_NAMES advertises migrate_project_config", () => {
    expect(MODERN_TOOL_NAMES).toContain("migrate_project_config");
  });

  it("factory registers the tool with a typed input schema", () => {
    const tool = createMigrateProjectConfigTool({ cwd: workdir, writesEnabled: true });
    expect(tool.name).toBe("migrate_project_config");
    expect(tool.inputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {
        projectId: { type: "string" },
        cwd: { type: "string" },
        apply: { type: "boolean" },
      },
    });
  });

  it("read-only handler returns the proposed diff without writing", async () => {
    writeProjectConfig(LEGACY_WITH_ABSOLUTE_ACCESS_PATH);
    const configPath = join(workdir, ".dysflow", "project.json");
    const before = readFileSync(configPath, "utf-8");
    const tool = createMigrateProjectConfigTool({ cwd: workdir, writesEnabled: true });

    const result = await tool.handler({});
    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
    expect(payload.outcome).toBe("ok");
    expect(payload.applied).toBe(false);
    expect(payload.diff).toContain("frontendFile");
    expect(readFileSync(configPath, "utf-8")).toBe(before);
  });

  it("apply:true handler rewrites the file in place", async () => {
    writeProjectConfig(LEGACY_WITH_ABSOLUTE_ACCESS_PATH);
    const tool = createMigrateProjectConfigTool({ cwd: workdir, writesEnabled: true });

    const result = await tool.handler({ apply: true });
    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
    expect(payload.outcome).toBe("ok");
    expect(payload.applied).toBe(true);

    const migrated = readProjectConfig();
    expect(migrated.accessPath).toBeUndefined();
    expect(migrated.frontendFile).toBe("frontend.accdb");
  });

  it("apply:true is idempotent on a re-run (no-op second pass)", async () => {
    writeProjectConfig(LEGACY_WITH_ABSOLUTE_ACCESS_PATH);
    const tool = createMigrateProjectConfigTool({ cwd: workdir, writesEnabled: true });

    const first = await tool.handler({ apply: true });
    expect(first.isError).toBe(false);
    const firstPayload = JSON.parse(first.content[0]?.text ?? "{}") as Record<string, unknown>;
    expect(firstPayload.applied).toBe(true);

    const second = await tool.handler({ apply: true });
    expect(second.isError).toBe(false);
    const secondPayload = JSON.parse(second.content[0]?.text ?? "{}") as Record<string, unknown>;
    expect(secondPayload.applied).toBe(false);
    expect(secondPayload.diff).toBe("");
  });

  it("apply:true refuses with MCP_WRITES_DISABLED when writes are disabled", async () => {
    writeProjectConfig(LEGACY_WITH_ABSOLUTE_ACCESS_PATH);
    const tool = createMigrateProjectConfigTool({ cwd: workdir, writesEnabled: false });
    const configPath = join(workdir, ".dysflow", "project.json");
    const before = readFileSync(configPath, "utf-8");

    const result = await tool.handler({ apply: true });
    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe("MCP_WRITES_DISABLED");
    expect(readFileSync(configPath, "utf-8")).toBe(before);
  });

  it("createDysflowMcpTools factory exposes migrate_project_config with the contract summary", () => {
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
        queryService: { execute: async () => successResult({ rows: [] }) },
        diagnosticsService: { run: async () => successResult({ checks: [] }) },
      },
      writes: true,
      cwd: workdir,
    });
    const tool = tools.find((t) => t.name === "migrate_project_config");
    expect(tool).toBeDefined();
    expect(tool?.description).toMatch(/legacy config migration/i);
    expect(tool?.description).toContain("MCP_WRITES_DISABLED");
  });
});

describe("MigrateProjectConfigInput — input type narrowing", () => {
  it("accepts an empty input (read-only default)", () => {
    const value: MigrateProjectConfigInput = {};
    expect(value).toEqual({});
  });
});
