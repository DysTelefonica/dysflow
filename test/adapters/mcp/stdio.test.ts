import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import {
	createUnavailableServices,
	JsonLineMcpStdioRuntime,
	MCP_PROTOCOL_VERSION,
	resolveProjectOperationRegistryPath,
} from "../../../src/adapters/mcp/stdio.js";
import {
	successResult,
	type OperationResult,
} from "../../../src/core/contracts/index.js";
import type { AccessDiagnosticsResult } from "../../../src/core/services/diagnostics-service.js";
import type { AccessQueryResult } from "../../../src/core/services/query-service.js";
import type { AccessVbaResult } from "../../../src/core/services/vba-service.js";

const packageVersion = (
	JSON.parse(readFileSync("package.json", "utf8")) as { version: string }
).version;
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
	async execute(): Promise<OperationResult<AccessQueryResult>> {
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

	it("resolves registered import dry-run even when MCP startup cwd has no project config", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-mcp-startup-"));
		const startup = join(root, "startup");
		const project = join(root, "project");
		const registryPath = join(root, "projects.json");
		mkdirSync(join(project, ".dysflow"), { recursive: true });
		mkdirSync(join(project, "src", "modules"), { recursive: true });
		writeFileSync(join(project, "front.accdb"), "", "utf8");
		writeFileSync(join(project, "src", "modules", "Entorno.bas"), "", "utf8");
		writeFileSync(join(project, ".dysflow", "project.json"), JSON.stringify({ id: "registered-project", accessPath: "front.accdb", destinationRoot: "src" }), "utf8");
		writeFileSync(registryPath, JSON.stringify({ projects: { "registered-project": { configPath: join(project, ".dysflow", "project.json") } } }), "utf8");

		const services = createUnavailableServices(
			{ code: "CONFIG_MISSING_ACCESS_PATH", message: "startup cwd has no project", retryable: false },
			{ cwd: startup, env: { DYSFLOW_PROJECT_REGISTRY_PATH: registryPath } },
		);
		const result = await services.legacyToolService?.execute("import_all", {
			contextId: "registered-project",
			dryRun: true,
			importMode: "Code",
		});

		expect(result?.ok).toBe(true);
		if (result === undefined || !result.ok) throw new Error("expected dry-run plan");
		expect(result.data).toMatchObject({
			operation: "import_all",
			dryRun: true,
			willModifyAccess: false,
			requestedContextId: "registered-project",
			resolvedProjectId: "registered-project",
			accessPath: join(project, "front.accdb"),
			destinationRoot: join(project, "src"),
			modulesPlanned: ["Entorno"],
		});
	});

	it("resolves registered read query by projectId even when MCP startup cwd has no project config", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-mcp-read-startup-"));
		const startup = join(root, "startup");
		const project = join(root, "project");
		const registryPath = join(root, "projects.json");
		mkdirSync(join(project, ".dysflow"), { recursive: true });
		writeFileSync(join(project, "front.accdb"), "", "utf8");
		writeFileSync(
			join(project, ".dysflow", "project.json"),
			JSON.stringify({ id: "lanzadera", accessPath: "front.accdb" }),
			"utf8",
		);
		writeFileSync(
			registryPath,
			JSON.stringify({ projects: { lanzadera: { configPath: join(project, ".dysflow", "project.json") } } }),
			"utf8",
		);

		const services = createUnavailableServices(
			{ code: "CONFIG_MISSING_ACCESS_PATH", message: "startup cwd has no project", retryable: false },
			{ cwd: startup, env: { DYSFLOW_PROJECT_REGISTRY_PATH: registryPath } },
		);
		const result = await services.queryService.execute({
			projectId: "lanzadera",
			sql: "SELECT 1",
			mode: "read",
		} as unknown as Parameters<typeof services.queryService.execute>[0]);

		if (!result.ok) {
			expect(result.error.code).not.toBe("CONFIG_MISSING_ACCESS_PATH");
		} else {
			expect(result.ok).toBe(true);
		}
	});

	it("keeps non-dry-run legacy tools unavailable after startup config failure", async () => {
		const services = createUnavailableServices(
			{ code: "CONFIG_MISSING_ACCESS_PATH", message: "startup cwd has no project", retryable: false },
			{ cwd: "C:/missing", env: {} },
		);

		const result = await services.legacyToolService?.execute("import_all", { dryRun: false, projectId: "registered-project" });

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
});
