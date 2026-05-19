import { describe, expect, it } from "vitest";
import {
	AccessPowerShellRunner,
	resolveDefaultRunnerScriptPath,
	sanitizePowerShellOutput,
	type PowerShellExecutor,
} from "../../../src/core/runner/access-runner.js";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";

const config: DysflowConfig = {
	configSource: "explicit-request",
	accessDbPath: "C:/data/finance.accdb",
	accessPassword: "super-secret",
	backendPassword: "backend-secret",
	timeoutMs: 1_500,
	processTimeoutMs: 1_500,
};

describe("AccessPowerShellRunner", () => {
	it("passes PowerShell command input as separated safe arguments", async () => {
		const calls: Array<{
			command: string;
			args: readonly string[];
			timeoutMs: number;
			env?: Record<string, string | undefined>;
		}> = [];
		const executor: PowerShellExecutor = async (command, args, options) => {
			calls.push({ command, args, timeoutMs: options.timeoutMs, env: options.env });
			return {
				exitCode: 0,
				stdout: '{"returnValue":42}',
				stderr: "",
				durationMs: 12,
				timedOut: false,
			};
		};

		const runner = new AccessPowerShellRunner({
			executor,
			scriptPath: "C:/tools/run access.ps1",
		});

		const result = await runner.run(
			{
				kind: "vba",
				request: {
					moduleName: "Main Module",
					procedureName: "Run-It",
					arguments: ["a;b", "$(nope)"],
				},
			},
			config,
		);

		expect(result).toMatchObject({
			ok: true,
			data: { returnValue: 42 },
			durationMs: 12,
			operation: { accessPath: "C:/data/finance.accdb", status: "pid_unknown" },
		});
		expect(calls).toEqual([
			{
				command: "powershell.exe",
				timeoutMs: 1_500,
				args: [
					"-NoProfile",
					"-NonInteractive",
					"-ExecutionPolicy",
					"Bypass",
					"-File",
					"C:/tools/run access.ps1",
					"-AccessDbPath",
					"C:/data/finance.accdb",
					"-Operation",
					"vba",
					"-PayloadJson",
					'{"moduleName":"Main Module","procedureName":"Run-It","arguments":["a;b","$(nope)"]}',
					"-OperationId",
					expect.stringMatching(/^dysflow-/),
				],
				env: {
					DYSFLOW_ACCESS_PASSWORD: "super-secret",
					ACCESS_VBA_PASSWORD: "super-secret",
				},
			},
		]);
	});

	it("redacts backend passwords from diagnostics and runner failures", async () => {
		const executor: PowerShellExecutor = async () => ({
			exitCode: 7,
			stdout: "",
			stderr: "DAO failed with connection string ;PWD=backend-secret",
			durationMs: 33,
			timedOut: false,
		});
		const runner = new AccessPowerShellRunner({
			executor,
			scriptPath: "C:/tools/run.ps1",
		});

		const result = await runner.run(
			{ kind: "diagnostics", request: { includeEnvironment: true } },
			config,
		);

		expect(JSON.stringify(result)).not.toContain("backend-secret");
		expect(result).toMatchObject({
			ok: false,
			error: {
				message:
					"PowerShell runner failed with exit code 7: DAO failed with connection string ;PWD=[REDACTED]",
			},
			diagnostics: [
				expect.objectContaining({
					message: "DAO failed with connection string ;PWD=[REDACTED]",
				}),
				expect.any(Object),
			],
		});
	});

	it("resolves the production runner script from DYSFLOW_HOME", () => {
		expect(
			resolveDefaultRunnerScriptPath({
				DYSFLOW_HOME: "C:/Users/adm1/AppData/Local/dysflow",
			}),
		).toBe(
			"C:/Users/adm1/AppData/Local/dysflow/app/scripts/dysflow-access-runner.ps1",
		);
	});

	it("records operation roots from resolved config instead of process cwd", async () => {
		const records: unknown[] = [];
		const runner = new AccessPowerShellRunner({
			executor: async () => ({
				exitCode: 0,
				stdout: "{}",
				stderr: "",
				durationMs: 1,
				timedOut: false,
			}),
			operationRegistry: {
				create: async (record) => {
					records.push(record);
					return record;
				},
				update: async () => undefined,
				get: async () => undefined,
				listRecent: async () => [],
			},
			operationIdFactory: () => "op-roots",
			scriptPath: "C:/tools/run.ps1",
		});

		await runner.run(
			{ kind: "diagnostics", request: { includeEnvironment: true } },
			{
				...config,
				projectRoot: "C:/repo/project",
				destinationRoot: "C:/repo/project/src",
			},
		);

		expect(records).toEqual([
			expect.objectContaining({
				projectRootAbs: "C:/repo/project",
				destinationRootAbs: "C:/repo/project/src",
			}),
		]);
	});

	it("surfaces access process capture failures as diagnostics", async () => {
		const executor: PowerShellExecutor = async (_command, _args, options) => {
			const captureTask = options.onAccessProcessCaptured({
				pid: 4567,
				processStartTime: "2026-05-15T10:00:00.000Z",
			});
			await Promise.allSettled([captureTask]);
			return {
				exitCode: 0,
				stdout: '{"returnValue":42}',
				stderr: "",
				durationMs: 12,
				timedOut: false,
			};
		};
		let updateCalls = 0;
		const runner = new AccessPowerShellRunner({
			executor,
			operationRegistry: {
				create: async (record) => record,
				update: async (_operationId, patch) => {
					updateCalls += 1;
					if (updateCalls === 1) throw new Error("registry write failed");
					return {
						operationId: "op",
						action: "vba",
						accessPath: config.accessDbPath,
						projectRootAbs: "",
						destinationRootAbs: "",
						metadata: {},
						accessPid: null,
						processStartTime: null,
						status: "completed",
						updatedAt: "now",
						...patch,
					};
				},
				get: async () => undefined,
				listRecent: async () => [],
			},
			operationIdFactory: () => "op",
			scriptPath: "C:/tools/run.ps1",
		});

		const result = await runner.run(
			{ kind: "vba", request: { moduleName: "M", procedureName: "P" } },
			config,
		);

		expect(result).toMatchObject({ ok: true });
		expect(result.diagnostics).toEqual(
			expect.arrayContaining([
				{
					level: "error",
					source: "access.pid",
					message:
						"Failed to record Access PID ownership: registry write failed",
				},
			]),
		);
	});

	it("returns typed failure when operation registry create throws (issue #233)", async () => {
		const runner = new AccessPowerShellRunner({
			executor: async () => ({
				exitCode: 0,
				stdout: "{}",
				stderr: "",
				durationMs: 1,
				timedOut: false,
			}),
			operationRegistry: {
				create: async () => {
					throw new Error("registry lock timeout");
				},
				update: async () => undefined,
				get: async () => undefined,
				listRecent: async () => [],
			},
			scriptPath: "C:/tools/run.ps1",
		});

		const result = await runner.run(
			{ kind: "diagnostics", request: { includeEnvironment: true } },
			config,
		);

		expect(result).toMatchObject({
			ok: false,
			error: {
				code: "OPERATION_REGISTRY_UNAVAILABLE",
				message: "Failed to create Access operation marker: registry lock timeout",
				retryable: true,
			},
		});
	});

	it("maps timed-out execution to a retryable timeout error with sanitized diagnostics", async () => {
		const executor: PowerShellExecutor = async () => ({
			exitCode: null,
			stdout: "starting with super-secret",
			stderr: "connection password=super-secret stalled",
			durationMs: 1_501,
			timedOut: true,
		});
		const runner = new AccessPowerShellRunner({
			executor,
			scriptPath: "C:/tools/run.ps1",
		});

		const result = await runner.run(
			{ kind: "diagnostics", request: { includeEnvironment: true } },
			config,
		);

		expect(result).toMatchObject({
			ok: false,
			error: {
				code: "RUNNER_TIMEOUT",
				message: "Access operation timed out after 1500ms.",
				retryable: true,
			},
			diagnostics: [
				{
					level: "warning",
					source: "powershell.stdout",
					message: "starting with [REDACTED]",
				},
				{
					level: "error",
					source: "powershell.stderr",
					message: "connection password=[REDACTED] stalled",
				},
				{
					level: "warning",
					source: "access.pid",
					message:
						"Access PID could not be determined; automatic cleanup is not safe.",
				},
			],
			durationMs: 1_501,
			operation: { accessPath: "C:/data/finance.accdb", status: "pid_unknown" },
		});
	});

	it("maps non-zero PowerShell exit output to a sanitized runner failure", async () => {
		const executor: PowerShellExecutor = async () => ({
			exitCode: 7,
			stdout: "",
			stderr: "failed opening C:/data/finance.accdb with super-secret",
			durationMs: 33,
			timedOut: false,
		});
		const runner = new AccessPowerShellRunner({
			executor,
			scriptPath: "C:/tools/run.ps1",
		});

		const result = await runner.run(
			{
				kind: "query",
				request: { sql: "SELECT * FROM Customers", mode: "read" },
			},
			config,
		);

		expect(result).toMatchObject({
			ok: false,
			error: {
				code: "RUNNER_FAILED",
				message:
					"PowerShell runner failed with exit code 7: failed opening C:/data/finance.accdb with [REDACTED]",
				retryable: false,
			},
			diagnostics: [
				{
					level: "error",
					source: "powershell.stderr",
					message: "failed opening C:/data/finance.accdb with [REDACTED]",
				},
				{
					level: "warning",
					source: "access.pid",
					message:
						"Access PID could not be determined; automatic cleanup is not safe.",
				},
			],
			durationMs: 33,
			operation: { accessPath: "C:/data/finance.accdb", status: "pid_unknown" },
		});
	});

	it("maps malformed successful PowerShell JSON to a typed runner failure", async () => {
		const executor: PowerShellExecutor = async () => ({
			exitCode: 0,
			stdout: "WARNING: noisy output\n{not json",
			stderr: "",
			durationMs: 44,
			timedOut: false,
		});
		const runner = new AccessPowerShellRunner({
			executor,
			scriptPath: "C:/tools/run.ps1",
		});

		const result = await runner.run(
			{ kind: "diagnostics", request: { includeEnvironment: true } },
			config,
		);

		expect(result).toMatchObject({
			ok: false,
			error: {
				code: "RUNNER_INVALID_JSON",
				message: "PowerShell runner produced invalid JSON output.",
			},
			durationMs: 44,
		});
	});
});

describe("sanitizePowerShellOutput", () => {
	it("redacts configured secrets and password assignments", () => {
		expect(
			sanitizePowerShellOutput("token abc password=hunter2; pwd: hunter2", [
				"abc",
				"hunter2",
			]),
		).toBe("token [REDACTED] password=[REDACTED]; pwd: [REDACTED]");
	});
});
