import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { loadDysflowConfigAsync } from "../../../src/adapters/config/dysflow-config-node.js";
import { formatCoreSurfaceGuidance } from "../../../src/adapters/mcp/bootstrap-tool.js";
import { resolveToolSurface, startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import {
  createDysflowMcpTools,
  type DysflowMcpServices,
  type DysflowMcpTool,
} from "../../../src/adapters/mcp/tools.js";
import { handleMcpCommand } from "../../../src/cli/commands/mcp.js";
import { successResult } from "../../../src/core/contracts/index.js";

class FakeVbaService {
  async execute() {
    return successResult({ returnValue: "ok" });
  }
}

class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}

class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

const services: DysflowMcpServices = {
  vbaService: new FakeVbaService(),
  queryService: new FakeQueryService(),
  diagnosticsService: new FakeDiagnosticsService(),
};

const allTools = createDysflowMcpTools({ services });
const HIDDEN_FORM_TOOL = "apply_form_design_plan";
const CORE_TOOL_COUNT = 67;

function createProject(toolSurface: unknown): { root: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "dysflow-tool-surface-"));
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, ".dysflow"));
  writeFileSync(join(root, "frontend.accdb"), "");
  writeFileSync(
    join(root, ".dysflow", "project.json"),
    `${JSON.stringify({
      id: "tool-surface-test",
      frontendFile: "frontend.accdb",
      mcp: { toolSurface },
    })}\n`,
  );
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

async function listToolsOnce(
  toolSurface?: "core" | "full",
): Promise<{ tools: Array<Record<string, unknown>>; close: () => Promise<void> }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(
    allTools,
    serverTransport,
    toolSurface === undefined ? {} : { toolSurface },
  );
  const client = new Client({ name: "tool-surface-test", version: "0.0.1" }, { capabilities: {} });
  await client.connect(clientTransport);
  return {
    tools: (await client.listTools()).tools as Array<Record<string, unknown>>,
    close: async () => {
      await client.close();
      await serverDone.catch(() => undefined);
    },
  };
}

async function callToolPayload(
  tools: DysflowMcpTool[],
  name: string,
  input: unknown,
): Promise<Record<string, unknown>> {
  const tool = tools.find((candidate) => candidate.name === name);
  expect(tool).toBeDefined();
  const result = await tool?.handler(input);
  expect(result?.isError).toBe(false);
  return JSON.parse(result?.content[0]?.text ?? "{}") as Record<string, unknown>;
}

describe("tool-surface (#1492)", () => {
  it("advertises the bounded core surface by default", async () => {
    const listed = await listToolsOnce();
    try {
      expect(listed.tools).toHaveLength(CORE_TOOL_COUNT);
      expect(listed.tools.some((tool) => tool.name === "import_modules")).toBe(true);
      expect(listed.tools.some((tool) => tool.name === HIDDEN_FORM_TOOL)).toBe(false);
    } finally {
      await listed.close();
    }
  });

  it("advertises every tool under the full surface", async () => {
    const listed = await listToolsOnce("full");
    try {
      expect(listed.tools).toHaveLength(allTools.length);
      expect(listed.tools.some((tool) => tool.name === HIDDEN_FORM_TOOL)).toBe(true);
    } finally {
      await listed.close();
    }
  });

  it("dispatches a non-advertised form tool by name under core", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverDone = startWithSdkServer(allTools, serverTransport);
    const client = new Client(
      { name: "tool-surface-test", version: "0.0.1" },
      { capabilities: {} },
    );
    try {
      await client.connect(clientTransport);
      const listed = (await client.listTools()).tools as Array<Record<string, unknown>>;
      expect(listed.some((tool) => tool.name === HIDDEN_FORM_TOOL)).toBe(false);

      const result = await client.callTool({ name: HIDDEN_FORM_TOOL, arguments: {} });
      expect(JSON.stringify(result.content ?? result)).not.toMatch(
        /TOOL_NOT_FOUND|not found|unknown tool/i,
      );
    } finally {
      await client.close();
      await serverDone.catch(() => undefined);
    }
  });

  it("keeps schema index complete and marks advertised state for both surfaces", async () => {
    const coreCatalog = await callToolPayload(allTools, "schema", { view: "index" });
    const fullCatalog = await callToolPayload(
      createDysflowMcpTools({ services, toolSurface: "full" }),
      "schema",
      { view: "index" },
    );
    const coreEntries = coreCatalog.tools as Array<{ name: string; advertised: boolean }>;
    const fullEntries = fullCatalog.tools as Array<{ name: string; advertised: boolean }>;

    expect(coreEntries).toHaveLength(allTools.length);
    expect(coreEntries.filter((entry) => entry.advertised)).toHaveLength(CORE_TOOL_COUNT);
    expect(coreEntries.find((entry) => entry.name === HIDDEN_FORM_TOOL)?.advertised).toBe(false);
    expect(fullEntries).toHaveLength(allTools.length);
    expect(fullEntries.every((entry) => entry.advertised)).toBe(true);
  });

  it("reports the active surface, count, and widening path from bootstrap", async () => {
    const corePayload = await callToolPayload(allTools, "bootstrap", {});
    const fullPayload = await callToolPayload(
      createDysflowMcpTools({ services, toolSurface: "full" }),
      "bootstrap",
      {},
    );

    expect(corePayload).toMatchObject({
      toolSurface: "core",
      toolsVisible: CORE_TOOL_COUNT,
      toolInventory: {
        callable: allTools.length,
        advertised: CORE_TOOL_COUNT,
        surface: "core",
      },
    });
    expect(corePayload.toolSurfaceGuidance).toContain(`${CORE_TOOL_COUNT} tools`);
    expect(corePayload.toolSurfaceGuidance).toContain("--tool-surface full");
    expect(corePayload.toolSurfaceGuidance).toContain('mcp.toolSurface: "full"');
    expect(fullPayload).toMatchObject({
      toolSurface: "full",
      toolsVisible: allTools.length,
      toolInventory: {
        callable: allTools.length,
        advertised: allTools.length,
        surface: "full",
      },
    });
    expect(fullPayload).not.toHaveProperty("toolSurfaceGuidance");
  });

  it("disambiguates callable and advertised counts in capabilities", async () => {
    const corePayload = await callToolPayload(allTools, "get_capabilities", {});
    const fullPayload = await callToolPayload(
      createDysflowMcpTools({ services, toolSurface: "full" }),
      "get_capabilities",
      {},
    );

    expect(corePayload).toMatchObject({
      toolsVisible: allTools.length,
      toolInventory: { callable: allTools.length, advertised: CORE_TOOL_COUNT, surface: "core" },
    });
    expect(fullPayload).toMatchObject({
      toolsVisible: allTools.length,
      toolInventory: { callable: allTools.length, advertised: allTools.length, surface: "full" },
    });
  });

  it("derives core-surface guidance from the runtime count instead of a pinned literal", () => {
    expect(formatCoreSurfaceGuidance(41)).toContain('surface is "core" (41 tools)');
    expect(formatCoreSurfaceGuidance(41)).not.toContain("39 tools");
  });

  it("loads full from project config and lets a CLI override win", async () => {
    const project = createProject("full");
    try {
      const loaded = await loadDysflowConfigAsync({ cwd: project.root, env: {} });
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      expect(loaded.data.mcp).toEqual({ toolSurface: "full" });
      expect(resolveToolSurface(loaded.data, undefined)).toBe("full");
      expect(resolveToolSurface(loaded.data, "core")).toBe("core");
    } finally {
      project.cleanup();
    }
  });

  it("passes a valid process override through the CLI", async () => {
    const calls: unknown[] = [];
    const result = await handleMcpCommand(["--tool-surface", "full"], {
      env: {},
      startMcpAdapter: async (_config, options) => {
        calls.push(options);
      },
    });

    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(calls).toEqual([{ writesEnabled: true, toolSurfaceOverride: "full" }]);
  });

  it("rejects invalid project and CLI surface values", async () => {
    const project = createProject("forms");
    try {
      const loaded = await loadDysflowConfigAsync({ cwd: project.root, env: {} });
      expect(loaded.ok).toBe(false);
      if (!loaded.ok) expect(loaded.error.code).toBe("CONFIG_UNKNOWN_TOOL_SURFACE");

      const result = await handleMcpCommand(["--tool-surface", "forms"], {
        env: {},
        startMcpAdapter: async () => {
          throw new Error("invalid CLI value must not start the adapter");
        },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('requires a value of "core" or "full"');
    } finally {
      project.cleanup();
    }
  });
});
