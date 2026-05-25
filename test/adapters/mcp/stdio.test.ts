import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  createUnavailableServices,
  JsonLineMcpStdioRuntime,
  MCP_PROTOCOL_VERSION,
  resolveProjectOperationRegistryPath,
  startMcpStdioAdapter,
} from "../../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { type OperationResult, successResult } from "../../../src/core/contracts/index.js";
import type { AccessDiagnosticsResult } from "../../../src/core/services/diagnostics-service.js";
import type { AccessQueryResult } from "../../../src/core/services/query-service.js";
import type { AccessVbaResult } from "../../../src/core/services/vba-service.js";

const packageVersion = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string })
  .version;
const stdioSource = readFileSync("src/adapters/mcp/stdio.ts", "utf8");

class FakeVbaService {
  public requests: unknown[] = [];
  constructor(private readonly result: OperationResult<AccessVbaResult>) {}
  async execute(request: unknown): Promise<OperationResult<AccessVbaResult>> {
    this.requests.push(request);
    return this.result;
  }
}

class FakeQueryService {
  public requests: unknown[] = [];
  async execute(request?: unknown): Promise<OperationResult<AccessQueryResult>> {
    this.requests.push(request);
    return successResult({ rows: [] });
  }
}

class FakeDiagnosticsService {
  async run(): Promise<OperationResult<AccessDiagnosticsResult>> {
    return successResult({ checks: [] });
  }
}

function writeMessage(input: PassThrough, message: unknown): void {
  input.write(`${JSON.stringify(message)}\n`);
}

async function collectOutput(output: PassThrough): Promise<unknown[]> {
  await new Promise<void>((resolve) => output.once("finish", resolve));
  return (
    output
      .read()
      ?.toString("utf8")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line: string) => JSON.parse(line)) ?? []
  );
}

describe("JsonLineMcpStdioRuntime", () => {
  it("resolves persistent operation registry under repo-local .dysflow/runtime", () => {
    expect(
      resolveProjectOperationRegistryPath({
        projectRoot: "C:/repo/app",
      }).replace(/\\/g, "/"),
    ).toBe("C:/repo/app/.dysflow/runtime/operations.json");
  });

  it("preserves runtime-first startMcpStdioAdapter overload", () => {
    expect(stdioSource).toContain("function startMcpStdioAdapter(");
    expect(stdioSource).toContain("runtime?: McpStdioRuntime");
    expect(stdioSource).toContain("isMcpStdioRuntime(configOrRuntime)");
  });

  it("declares the targeted MCP protocol version as a named maintenance constant", () => {
    expect(MCP_PROTOCOL_VERSION).toBe("2024-11-05");
    expect(stdioSource).toContain("MCP_PROTOCOL_VERSION");
    expect(stdioSource).not.toContain('protocolVersion: "2024-11-05"');
  });

  it("does not hardcode the initialize server version", () => {
    expect(stdioSource).not.toContain('version: "0.1.0"');
  });

  it("answers initialize, tools/list, and tools/call over JSON-RPC lines", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });
    runtime.registerTool({
      name: "dysflow.echo",
      description: "Echo test tool",
      handler: async (args) => ({
        content: [{ type: "text", text: JSON.stringify(args) }],
        isError: false,
      }),
    });

    const started = runtime.start();
    writeMessage(input, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });
    writeMessage(input, {
      jsonrpc: "2.0",
      id: null,
      method: "initialize",
      params: {},
    });
    writeMessage(input, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    writeMessage(input, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    writeMessage(input, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "dysflow.echo", arguments: { ok: true } },
    });
    input.end();
    await started;
    output.end();

    await expect(collectOutput(output)).resolves.toEqual([
      expect.objectContaining({
        id: 1,
        result: expect.objectContaining({
          protocolVersion: MCP_PROTOCOL_VERSION,
          serverInfo: { name: "dysflow", version: packageVersion },
        }),
      }),
      expect.objectContaining({
        id: null,
        result: expect.objectContaining({
          protocolVersion: MCP_PROTOCOL_VERSION,
          serverInfo: { name: "dysflow", version: packageVersion },
        }),
      }),
      expect.objectContaining({
        id: 2,
        result: {
          tools: [
            expect.objectContaining({
              name: "dysflow.echo",
              description: "Echo test tool",
              inputSchema: {
                type: "object",
                additionalProperties: false,
                properties: {},
              },
            }),
          ],
        },
      }),
      expect.objectContaining({
        id: 3,
        result: {
          content: [{ type: "text", text: '{"ok":true}' }],
          isError: false,
        },
      }),
    ]);
  });

  it("returns thrown tool failures as MCP tool results instead of JSON-RPC internal errors", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });
    runtime.registerTool({
      name: "dysflow.boom",
      description: "Throwing test tool",
      handler: async () => {
        throw new Error("simulated tool failure");
      },
    });

    const started = runtime.start();
    writeMessage(input, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "dysflow.boom", arguments: {} },
    });
    input.end();
    await started;
    output.end();

    await expect(collectOutput(output)).resolves.toEqual([
      expect.objectContaining({
        id: 6,
        result: {
          content: [{ type: "text", text: "MCP_TOOL_ERROR: simulated tool failure" }],
          isError: true,
        },
      }),
    ]);
  });

  it("rejects oversized JSON-RPC lines before parsing and continues processing subsequent frames", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output, maxRequestBytes: 64 });

    const started = runtime.start();
    input.write(`${"a".repeat(200)}\n`);
    writeMessage(input, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });
    input.end();
    await started;
    output.end();

    await expect(collectOutput(output)).resolves.toEqual([
      expect.objectContaining({
        id: null,
        error: expect.objectContaining({
          code: -32700,
          message: "Request line exceeds 64 bytes.",
        }),
      }),
      expect.objectContaining({
        id: 1,
        result: expect.objectContaining({
          protocolVersion: MCP_PROTOCOL_VERSION,
          serverInfo: { name: "dysflow", version: packageVersion },
        }),
      }),
    ]);
  });

  it("rejects registered import dry-run after global registry deprecation", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-mcp-startup-"));
    const startup = join(root, "startup");
    const project = join(root, "project");
    const registryPath = join(root, "projects.json");
    mkdirSync(startup, { recursive: true });
    mkdirSync(join(project, ".dysflow"), { recursive: true });
    mkdirSync(join(project, "src", "modules"), { recursive: true });
    writeFileSync(join(project, "front.accdb"), "", "utf8");
    writeFileSync(join(project, "src", "modules", "Entorno.bas"), "", "utf8");
    writeFileSync(
      join(project, ".dysflow", "project.json"),
      JSON.stringify({
        id: "registered-project",
        accessPath: "front.accdb",
        destinationRoot: "src",
      }),
      "utf8",
    );
    writeFileSync(
      registryPath,
      JSON.stringify({
        projects: {
          "registered-project": { configPath: join(project, ".dysflow", "project.json") },
        },
      }),
      "utf8",
    );

    const services = createUnavailableServices(
      {
        code: "CONFIG_MISSING_ACCESS_PATH",
        message: "startup cwd has no project",
        retryable: false,
      },
      { cwd: startup, env: { DYSFLOW_PROJECT_REGISTRY_PATH: registryPath } },
    );
    const result = await services.legacyToolService?.execute("import_all", {
      contextId: "registered-project",
      dryRun: true,
      importMode: "Code",
    });

    expect(result?.ok).toBe(false);
    if (result === undefined || result.ok) throw new Error("expected registry deprecation failure");
    expect(result.error.code).toBe("CONFIG_PROJECT_NOT_REGISTERED");
    expect(result.error.message).toContain("deprecated");
  });

  it("rejects registered read query by projectId after global registry deprecation", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-mcp-read-startup-"));
    const startup = join(root, "startup");
    const project = join(root, "project");
    const registryPath = join(root, "projects.json");
    mkdirSync(startup, { recursive: true });
    mkdirSync(join(project, ".dysflow"), { recursive: true });
    writeFileSync(join(project, "front.accdb"), "", "utf8");
    writeFileSync(
      join(project, ".dysflow", "project.json"),
      JSON.stringify({ id: "lanzadera", accessPath: "front.accdb" }),
      "utf8",
    );
    writeFileSync(
      registryPath,
      JSON.stringify({
        projects: { lanzadera: { configPath: join(project, ".dysflow", "project.json") } },
      }),
      "utf8",
    );

    const query = new FakeQueryService();
    const services = createUnavailableServices(
      {
        code: "CONFIG_MISSING_ACCESS_PATH",
        message: "startup cwd has no project",
        retryable: false,
      },
      {
        cwd: startup,
        env: { DYSFLOW_PROJECT_REGISTRY_PATH: registryPath },
        serviceFactory: () => ({
          vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
          queryService: query,
          diagnosticsService: new FakeDiagnosticsService(),
        }),
      },
    );
    const result = await services.queryService.execute({
      projectId: "lanzadera",
      sql: "SELECT 1",
      mode: "read",
    } as unknown as Parameters<typeof services.queryService.execute>[0]);

    expect(result.ok).toBe(false);
    expect(query.requests).toEqual([]);
  }, 15_000);

  it("keeps non-dry-run legacy tools unavailable after startup config failure", async () => {
    const services = createUnavailableServices(
      {
        code: "CONFIG_MISSING_ACCESS_PATH",
        message: "startup cwd has no project",
        retryable: false,
      },
      { cwd: "C:/missing", env: {} },
    );

    const result = await services.legacyToolService?.execute("import_all", {
      dryRun: false,
      projectId: "registered-project",
    });

    expect(result?.ok).toBe(false);
    if (result === undefined || result.ok) throw new Error("expected startup failure");
    expect(result.error.code).toBe("CONFIG_MISSING_ACCESS_PATH");
  });

  it("returns malformed legacy argsJson as a tool result instead of a JSON-RPC internal error", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });
    const vba = new FakeVbaService(successResult({ returnValue: "ok" }));
    for (const tool of createDysflowMcpTools({
      vbaService: vba,
      queryService: new FakeQueryService(),
      diagnosticsService: new FakeDiagnosticsService(),
    })) {
      runtime.registerTool(tool);
    }

    const started = runtime.start();
    writeMessage(input, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "run_vba",
        arguments: { procedureName: "Broken", argsJson: "[1," },
      },
    });
    input.end();
    await started;
    output.end();

    await expect(collectOutput(output)).resolves.toEqual([
      expect.objectContaining({
        id: 7,
        result: {
          content: [
            {
              type: "text",
              text: "MCP_INPUT_INVALID: argsJson must be valid JSON.",
            },
          ],
          isError: true,
        },
      }),
    ]);
    expect(vba.requests).toEqual([]);
  });

  it("returns JSON-RPC errors for unsupported methods", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });

    const started = runtime.start();
    writeMessage(input, { jsonrpc: "2.0", id: 99, method: "unknown/method" });
    input.end();
    await started;
    output.end();

    await expect(collectOutput(output)).resolves.toEqual([
      expect.objectContaining({
        id: 99,
        error: expect.objectContaining({ code: -32601 }),
      }),
    ]);
  });

  // ─────────────────────────────────────────────────────────────
  // Chunking and buffer accumulation
  // ─────────────────────────────────────────────────────────────

  it("accumulates partial chunks and dispatches when a newline arrives in a later chunk", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });

    const started = runtime.start();
    const msg = JSON.stringify({ jsonrpc: "2.0", id: 10, method: "initialize", params: {} });
    const mid = Math.floor(msg.length / 2);
    input.write(msg.slice(0, mid));
    input.write(msg.slice(mid) + "\n");
    input.end();
    await started;
    output.end();

    await expect(collectOutput(output)).resolves.toEqual([
      expect.objectContaining({
        id: 10,
        result: expect.objectContaining({ protocolVersion: MCP_PROTOCOL_VERSION }),
      }),
    ]);
  });

  it("dispatches a line with no trailing newline when the stream closes (flush on close)", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });

    const started = runtime.start();
    input.write(JSON.stringify({ jsonrpc: "2.0", id: 12, method: "initialize", params: {} }));
    input.end();
    await started;
    output.end();

    await expect(collectOutput(output)).resolves.toEqual([
      expect.objectContaining({
        id: 12,
        result: expect.objectContaining({ protocolVersion: MCP_PROTOCOL_VERSION }),
      }),
    ]);
  });

  it("strips a trailing \\r from CRLF lines before dispatching", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });

    const started = runtime.start();
    input.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 13, method: "initialize", params: {} })}\r\n`,
    );
    input.end();
    await started;
    output.end();

    await expect(collectOutput(output)).resolves.toEqual([
      expect.objectContaining({
        id: 13,
        result: expect.objectContaining({ protocolVersion: MCP_PROTOCOL_VERSION }),
      }),
    ]);
  });

  // ─────────────────────────────────────────────────────────────
  // Oversized messages — no-newline path
  // ─────────────────────────────────────────────────────────────

  it("rejects an oversized line that arrives without a newline and closes the stream", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output, maxRequestBytes: 32 });

    const started = runtime.start();
    input.write("a".repeat(100)); // no \n — hits the nextNewline === -1 oversized path
    input.end();
    await started;
    output.end();

    await expect(collectOutput(output)).resolves.toEqual([
      expect.objectContaining({
        id: null,
        error: expect.objectContaining({ code: -32700 }),
      }),
    ]);
  });

  // ─────────────────────────────────────────────────────────────
  // Malformed JSON and blank lines
  // ─────────────────────────────────────────────────────────────

  it("emits a parse-error response for a malformed JSON line and continues processing", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });

    const started = runtime.start();
    input.write("not valid json\n");
    writeMessage(input, { jsonrpc: "2.0", id: 11, method: "initialize", params: {} });
    input.end();
    await started;
    output.end();

    const responses = (await collectOutput(output)) as Array<{
      id: unknown;
      error?: { code: number };
      result?: unknown;
    }>;
    expect(responses[0]).toMatchObject({ id: null, error: { code: -32700 } });
    expect(responses[1]).toMatchObject({
      id: 11,
      result: expect.objectContaining({ protocolVersion: MCP_PROTOCOL_VERSION }),
    });
  });

  it("drops a blank/whitespace-only line silently without emitting a response", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });

    const started = runtime.start();
    input.write("   \n");
    writeMessage(input, { jsonrpc: "2.0", id: 14, method: "initialize", params: {} });
    input.end();
    await started;
    output.end();

    await expect(collectOutput(output)).resolves.toEqual([
      expect.objectContaining({ id: 14 }),
    ]);
  });

  // ─────────────────────────────────────────────────────────────
  // Notifications (no id field → no response)
  // ─────────────────────────────────────────────────────────────

  it("silently ignores a JSON-RPC message with no id (notification)", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });

    const started = runtime.start();
    writeMessage(input, { jsonrpc: "2.0", method: "notifications/initialized" });
    writeMessage(input, { jsonrpc: "2.0", id: 15, method: "initialize", params: {} });
    input.end();
    await started;
    output.end();

    const responses = (await collectOutput(output)) as unknown[];
    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({ id: 15 });
  });

  // ─────────────────────────────────────────────────────────────
  // Progress notifications via sendProgress
  // ─────────────────────────────────────────────────────────────

  it("emits progress notifications and returns tool result when progressToken is present", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });

    runtime.registerTool({
      name: "dysflow.progress_tool",
      description: "Tool that sends progress",
      handler: async (_args, ctx) => {
        ctx.sendProgress?.(1, 3, "step one");
        ctx.sendProgress?.(2, 3, "step two");
        return { content: [{ type: "text", text: "done" }], isError: false };
      },
    });

    const started = runtime.start();
    writeMessage(input, {
      jsonrpc: "2.0",
      id: 20,
      method: "tools/call",
      params: {
        name: "dysflow.progress_tool",
        arguments: {},
        _meta: { progressToken: "tok-abc" },
      },
    });
    input.end();
    await started;
    output.end();

    const responses = (await collectOutput(output)) as Array<{
      method?: string;
      params?: {
        progressToken?: string;
        progress?: number;
        total?: number;
        message?: string;
      };
      id?: unknown;
      result?: unknown;
    }>;
    const notifications = responses.filter((r) => r.method === "notifications/progress");
    const result = responses.find((r) => r.id === 20);

    expect(notifications).toHaveLength(2);
    expect(notifications[0]?.params).toMatchObject({
      progressToken: "tok-abc",
      progress: 1,
      total: 3,
      message: "step one",
    });
    expect(notifications[1]?.params).toMatchObject({
      progressToken: "tok-abc",
      progress: 2,
      total: 3,
      message: "step two",
    });
    expect(result).toMatchObject({
      id: 20,
      result: { content: [{ type: "text", text: "done" }], isError: false },
    });
  });

  // ─────────────────────────────────────────────────────────────
  // tools/call edge cases
  // ─────────────────────────────────────────────────────────────

  it("returns method-not-found for tools/call when the named tool is not registered", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });

    const started = runtime.start();
    writeMessage(input, {
      jsonrpc: "2.0",
      id: 21,
      method: "tools/call",
      params: { name: "dysflow.nonexistent", arguments: {} },
    });
    input.end();
    await started;
    output.end();

    await expect(collectOutput(output)).resolves.toEqual([
      expect.objectContaining({
        id: 21,
        error: expect.objectContaining({ code: -32601 }),
      }),
    ]);
  });

  it("handles tools/call with null params gracefully (method-not-found for empty name)", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });

    runtime.registerTool({
      name: "dysflow.noop",
      description: "Noop tool",
      handler: async () => ({ content: [{ type: "text", text: "ok" }], isError: false }),
    });

    const started = runtime.start();
    writeMessage(input, { jsonrpc: "2.0", id: 22, method: "tools/call", params: null });
    input.end();
    await started;
    output.end();

    await expect(collectOutput(output)).resolves.toEqual([
      expect.objectContaining({
        id: 22,
        error: expect.objectContaining({ code: -32601 }),
      }),
    ]);
  });

  it("excludes hidden tools from tools/list", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });

    runtime.registerTool({
      name: "dysflow.visible",
      description: "Visible tool",
      handler: async () => ({ content: [], isError: false }),
    });
    runtime.registerTool({
      name: "dysflow.hidden",
      description: "Hidden tool",
      hidden: true,
      handler: async () => ({ content: [], isError: false }),
    });

    const started = runtime.start();
    writeMessage(input, { jsonrpc: "2.0", id: 23, method: "tools/list" });
    input.end();
    await started;
    output.end();

    const responses = (await collectOutput(output)) as Array<{
      id: unknown;
      result?: { tools: Array<{ name: string }> };
    }>;
    const listResponse = responses.find((r) => r.id === 23);
    expect(listResponse?.result?.tools.map((t) => t.name)).toEqual(["dysflow.visible"]);
  });

  // ─────────────────────────────────────────────────────────────
  // startMcpStdioAdapter — runtime-injection overloads
  // ─────────────────────────────────────────────────────────────

  it("startMcpStdioAdapter accepts a pre-built runtime and responds to initialize", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });

    const adapterDone = startMcpStdioAdapter(runtime);
    writeMessage(input, { jsonrpc: "2.0", id: 30, method: "initialize", params: {} });
    input.end();
    await adapterDone;
    output.end();

    await expect(collectOutput(output)).resolves.toEqual([
      expect.objectContaining({
        id: 30,
        result: expect.objectContaining({ protocolVersion: MCP_PROTOCOL_VERSION }),
      }),
    ]);
  });

  it("startMcpStdioAdapter accepts runtime in options position (second arg)", async () => {
    // Exercises isMcpStdioRuntime(optionsOrRuntime) branch:
    // startMcpStdioAdapter(config, runtime) — second arg is a McpStdioRuntime
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });

    const adapterDone = startMcpStdioAdapter(
      { accessDbPath: "fake.accdb" } as never,
      runtime,
    );
    writeMessage(input, { jsonrpc: "2.0", id: 31, method: "initialize", params: {} });
    input.end();
    await adapterDone;
    output.end();

    await expect(collectOutput(output)).resolves.toEqual([
      expect.objectContaining({
        id: 31,
        result: expect.objectContaining({ protocolVersion: MCP_PROTOCOL_VERSION }),
      }),
    ]);
  });

  // ─────────────────────────────────────────────────────────────
  // createUnavailableServices — additional branches
  // ─────────────────────────────────────────────────────────────

  it("createUnavailableServices returns unavailable for diagnostics when config cannot be resolved", async () => {
    const services = createUnavailableServices(
      { code: "CONFIG_MISSING_ACCESS_PATH", message: "no config", retryable: false },
      { cwd: "C:/totally-missing-path-xyz", env: {} },
    );

    const result = await services.diagnosticsService.run({} as never);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("CONFIG_MISSING_ACCESS_PATH");
  });

  it("createUnavailableServices vba service returns a failure result when config cannot be resolved", async () => {
    const services = createUnavailableServices(
      { code: "CONFIG_MISSING_ACCESS_PATH", message: "no config", retryable: false },
      { cwd: "C:/totally-missing-path-xyz", env: {} },
    );

    const result = await services.vbaService.execute({ accessPath: "fake.accdb" } as never);
    expect(result.ok).toBe(false);
  });
});
