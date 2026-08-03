import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";
import { WorktreeContextCache } from "../../../src/adapters/config/worktree-context-cache.js";
import { resolveMcpAccessContextForInput } from "../../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

let startup: string;
let sibling: string;

function fixture(prefix: string, id: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(root, ".git"), "gitdir: fixture", "utf8");
  mkdirSync(join(root, ".dysflow"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "Frontend.accdb"), "", "utf8");
  writeFileSync(join(root, "Backend.accdb"), "", "utf8");
  writeFileSync(
    join(root, ".dysflow", "project.json"),
    JSON.stringify({
      id,
      frontendFile: "Frontend.accdb",
      backendPath: "Backend.accdb",
      destinationRoot: "src",
      capabilities: { allowWrites: true },
    }),
    "utf8",
  );
  return root;
}

type Payload = Record<string, unknown> & {
  projectConfig?: Record<string, unknown>;
  context?: Record<string, unknown>;
  cache?: Record<string, unknown>;
  telemetry?: Record<string, unknown>;
  worktreeCache?: Record<string, unknown>;
};

function payload(result: { content: readonly { text: string }[] }): Payload {
  return JSON.parse(result.content[0]?.text ?? "{}") as Payload;
}

function requiredTool(registered: ReturnType<typeof tools>, name: string) {
  const tool = registered.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`Missing tool: ${name}`);
  return tool;
}

function tools() {
  return createDysflowMcpTools({
    services: {
      vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
      queryService: { execute: async () => successResult({ rows: [] }) },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
    },
    writes: true,
    allowWrites: true,
    cwd: startup,
    projectConfigResolver: (input, cwd = startup) =>
      diagnoseProjectConfig(cwd, input as Record<string, unknown>),
  });
}

beforeEach(() => {
  startup = fixture("dysflow-cache-startup-", "startup");
  sibling = fixture("dysflow-cache-sibling-", "sibling");
});

afterEach(() => {
  rmSync(startup, { recursive: true, force: true });
  rmSync(sibling, { recursive: true, force: true });
});

describe("cwd-aware worktree cache (#1321)", () => {
  it("advertises register_worktree and clear_worktree_cache", () => {
    const names = tools().map((tool) => tool.name);
    expect(names).toContain("register_worktree");
    expect(names).toContain("clear_worktree_cache");
  });

  it("declares cwd on every project-config-consuming operational tool", () => {
    const exempt = new Set(["schema", "describe_tool", "list_access_operations"]);
    const missing = tools()
      .filter((tool) => !exempt.has(tool.name))
      .filter((tool) => !("cwd" in (tool.inputSchema?.properties ?? {})))
      .map((tool) => tool.name);
    expect(missing).toEqual([]);
  });

  it("publishes the same cwd coverage through the full schema catalog", async () => {
    const registered = tools();
    const schema = requiredTool(registered, "schema");
    const catalog = payload(await schema.handler({ view: "full" })) as Payload & {
      tools?: Array<{ name: string; parameters: Record<string, unknown> }>;
    };
    const byName = new Map((catalog.tools ?? []).map((tool) => [tool.name, tool]));
    const exempt = new Set(["schema", "describe_tool", "list_access_operations"]);
    const missing = registered
      .filter((tool) => !exempt.has(tool.name))
      .filter((tool) => byName.get(tool.name)?.parameters.cwd === undefined)
      .map((tool) => tool.name);
    expect(missing).toEqual([]);
  });

  it("routes get_capabilities to the explicit cwd and preserves startup cwd when omitted", async () => {
    const getCapabilities = requiredTool(tools(), "get_capabilities");

    const explicit = payload(await getCapabilities.handler({ cwd: sibling }));
    expect(explicit.projectConfig?.projectId).toBe("sibling");

    const implicit = payload(await getCapabilities.handler({}));
    expect(implicit.projectConfig?.projectId).toBe("startup");
  });

  it("threads cwd through the standard write-ready resolver", async () => {
    const calls: Array<{ cwd?: string; input: Record<string, unknown> }> = [];
    const registered = createDysflowMcpTools({
      services: {
        vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
        queryService: { execute: async () => successResult({ rows: [] }) },
        diagnosticsService: { run: async () => successResult({ checks: [] }) },
      },
      writes: true,
      allowWrites: true,
      cwd: startup,
      projectConfigResolver: (input, cwd) => {
        calls.push({ cwd, input: input as Record<string, unknown> });
        return diagnoseProjectConfig(cwd ?? startup, input as Record<string, unknown>);
      },
    });
    const tool = requiredTool(registered, "import_modules");
    await tool.handler({ cwd: sibling, moduleNames: ["Module1"], apply: true });
    const canonicalSibling = realpathSync.native(sibling);
    expect(calls.some((call) => call.cwd === canonicalSibling)).toBe(true);
  });

  it("uses cwd when resolving the live service/access context", async () => {
    const result = await resolveMcpAccessContextForInput({ cwd: sibling }, undefined, {
      cwd: startup,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.projectRoot).toBe(sibling);
  });

  it("reuses a canonical worktree context when selectors name that same worktree", async () => {
    let scans = 0;
    const cache = new WorktreeContextCache({
      resolveDiagnostic: (cwd, input) => {
        scans += 1;
        return diagnoseProjectConfig(cwd, input as Record<string, unknown>);
      },
    });

    const selectors = [
      { projectId: "sibling" },
      { accessPath: join(sibling, "Frontend.accdb") },
      { accessDbPath: join(sibling, "Frontend.accdb") },
      { databasePath: join(sibling, "Frontend.accdb") },
      { backendPath: join(sibling, "Backend.accdb") },
      { destinationRoot: join(sibling, "src") },
      { projectRoot: sibling },
    ];

    for (const selector of selectors) {
      const result = await cache.resolveDiagnostic(sibling, selector, "cwd-param");
      expect(result.projectId).toBe("sibling");
    }

    expect(scans).toBe(1);
    expect(cache.telemetry()).toMatchObject({ hits: selectors.length - 1, misses: 1 });
    cache.close();
  });

  it("keeps a selector-specific fresh path when the selector names another project", async () => {
    let scans = 0;
    const baseline = diagnoseProjectConfig(sibling, {});
    const cache = new WorktreeContextCache({
      resolveDiagnostic: (_cwd, input) => {
        scans += 1;
        return input.projectId === undefined
          ? baseline
          : { ...baseline, status: "id-mismatch", writeReady: false };
      },
    });

    await cache.resolveDiagnostic(sibling, {}, "cwd-param");
    const mismatch = await cache.resolveDiagnostic(sibling, { projectId: "startup" }, "cwd-param");

    expect(mismatch.status).toBe("id-mismatch");
    expect(scans).toBe(2);
    cache.close();
  });

  it("uses the registered sibling context for a real operational tool", async () => {
    const registered = tools();
    const register = requiredTool(registered, "register_worktree");
    const importModules = requiredTool(registered, "import_modules");
    const getCapabilities = requiredTool(registered, "get_capabilities");

    await register.handler({ cwd: sibling });
    const result = await importModules.handler({
      cwd: sibling,
      moduleNames: ["Module1"],
      dryRunWithPreflight: true,
    });
    expect(result.isError).toBe(false);

    const capabilities = payload(await getCapabilities.handler({ cwd: sibling }));
    expect(capabilities.projectConfig?.projectId).toBe("sibling");
    expect(capabilities.worktreeCache?.hits).toEqual(expect.any(Number));
    expect(capabilities.worktreeCache?.misses).toBe(1);
  });

  it("registers a canonical context and exposes hit/miss telemetry", async () => {
    const register = requiredTool(tools(), "register_worktree");
    const first = payload(await register.handler({ cwd: sibling }));
    const second = payload(await register.handler({ cwd: sibling }));
    expect(first.context?.projectId).toBe("sibling");
    expect(first.cache?.status).toBe("miss");
    expect(second.cache?.status).toBe("hit");
    expect(second.telemetry?.hits).toEqual(expect.any(Number));
    expect(second.telemetry?.maxEntries).toBe(32);
    expect(second.telemetry?.ttlMs).toBe(300_000);
  });

  it("clears one cached context and forces a fresh scan", async () => {
    const registered = tools();
    const register = requiredTool(registered, "register_worktree");
    const clear = requiredTool(registered, "clear_worktree_cache");
    await register.handler({ cwd: sibling });
    const cleared = payload(await clear.handler({ cwd: sibling }));
    expect(cleared.cleared).toBe(1);
    const next = payload(await register.handler({ cwd: sibling }));
    expect(next.cache?.status).toBe("miss");
  });

  it("invalidates on project.json change and observes the replacement config", async () => {
    const registered = tools();
    const register = requiredTool(registered, "register_worktree");
    await register.handler({ cwd: sibling });
    writeFileSync(
      join(sibling, ".dysflow", "project.json"),
      JSON.stringify({
        id: "sibling-updated",
        frontendFile: "Frontend.accdb",
        destinationRoot: "src",
        capabilities: { allowWrites: true },
      }),
      "utf8",
    );
    await new Promise((resolve) => setTimeout(resolve, 75));
    const refreshed = payload(await register.handler({ cwd: sibling }));
    expect(refreshed.cache?.status).toBe("miss");
    expect(refreshed.context?.projectId).toBe("sibling-updated");
    expect(refreshed.telemetry?.invalidations).toEqual(expect.any(Number));
  });

  it("observes externally created project.json after a cached missing result without a watcher", async () => {
    rmSync(join(sibling, ".dysflow", "project.json"));
    const cache = new WorktreeContextCache({
      resolveDiagnostic: (cwd) => diagnoseProjectConfig(cwd),
    });

    const missing = await cache.getContext(sibling, "cwd-param");
    expect(missing.context.projectConfig.status).toBe("missing");
    expect(cache.telemetry()).toMatchObject({ watchers: 0, misses: 1 });

    writeFileSync(
      join(sibling, ".dysflow", "project.json"),
      JSON.stringify({
        id: "sibling-created-externally",
        frontendFile: "Frontend.accdb",
        destinationRoot: "src",
        capabilities: { allowWrites: true },
      }),
      "utf8",
    );

    const created = await cache.getContext(sibling, "cwd-param");
    const repeated = await cache.getContext(sibling, "cwd-param");
    expect(created.status).toBe("miss");
    expect(created.context.projectConfig.projectId).toBe("sibling-created-externally");
    expect(repeated.status).toBe("hit");
    expect(repeated.context.projectConfig.projectId).toBe("sibling-created-externally");
    cache.close();
  });

  it("keeps bounded TTL fallback when the project.json watcher is unavailable", async () => {
    let now = 0;
    const cache = new WorktreeContextCache({
      ttlMs: 10,
      resolveDiagnostic: (cwd) => diagnoseProjectConfig(cwd),
      watchConfig: () => {
        throw new Error("watch unavailable");
      },
      now: () => now,
    });

    const first = await cache.getContext(sibling, "cwd-param");
    const cached = await cache.getContext(sibling, "cwd-param");
    now = 11;
    const expired = await cache.getContext(sibling, "cwd-param");

    expect(first.status).toBe("miss");
    expect(cached.status).toBe("hit");
    expect(expired.status).toBe("miss");
    expect(cache.telemetry()).toMatchObject({ watchers: 0, ttlMs: 10, misses: 2, hits: 1 });
    cache.close();
  });

  it("uses the TTL fallback and keeps the cache bounded", async () => {
    const cache = new WorktreeContextCache({
      ttlMs: 1,
      maxEntries: 1,
      resolveDiagnostic: (cwd) => diagnoseProjectConfig(cwd),
    });
    const first = await cache.getContext(startup, "cwd-param");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const expired = await cache.getContext(startup, "cwd-param");
    await cache.getContext(sibling, "cwd-param");
    expect(first.status).toBe("miss");
    expect(expired.status).toBe("miss");
    expect(cache.telemetry()).toMatchObject({ entries: 1, maxEntries: 1, ttlMs: 1 });
    expect(cache.telemetry().evictions).toBeGreaterThanOrEqual(1);
    cache.close();
  });

  it("uses a setup_project result immediately without restarting the MCP", async () => {
    rmSync(join(sibling, ".dysflow"), { recursive: true, force: true });
    const registered = tools();
    const setup = requiredTool(registered, "setup_project");
    const getCapabilities = requiredTool(registered, "get_capabilities");
    const applied = payload(
      await setup.handler({
        cwd: sibling,
        projectId: "sibling",
        frontendFile: "Frontend.accdb",
        apply: true,
      }),
    );
    expect(applied.mode).toBe("apply");
    const capabilities = payload(await getCapabilities.handler({ cwd: sibling }));
    expect(capabilities.projectConfig).toMatchObject({ status: "valid", writeReady: true });
    expect(capabilities.worktreeCache).toMatchObject({
      entries: 1,
      maxEntries: 32,
      ttlMs: 300_000,
    });
  });

  it("keeps the startup worktree when cwd is omitted after sibling bootstrap", async () => {
    rmSync(join(sibling, ".dysflow"), { recursive: true, force: true });
    const registered = tools();
    const setup = requiredTool(registered, "setup_project");
    const getCapabilities = requiredTool(registered, "get_capabilities");

    const applied = payload(
      await setup.handler({
        cwd: sibling,
        projectId: "sibling",
        frontendFile: "Frontend.accdb",
        apply: true,
      }),
    );
    expect(applied.mode).toBe("apply");

    const implicit = payload(await getCapabilities.handler({}));
    expect(implicit.projectConfig).toMatchObject({ projectId: "startup", status: "valid" });
  });
});
