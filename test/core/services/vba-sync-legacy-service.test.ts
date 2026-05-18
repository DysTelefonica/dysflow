import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { failureResult } from "../../../src/core/contracts/index";
import {
	buildImportPlanResult,
	VbaSyncLegacyService,
	resolveDefaultVbaManagerScriptPath,
	spawnVbaManager,
	type VbaManagerExecutor,
} from "../../../src/core/services/vba-sync-legacy-service";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
	spawn: spawnMock,
}));

describe("VbaSyncLegacyService", () => {
	it("characterizes import plan result shaping for explicit overrides", () => {
		const result = buildImportPlanResult({
			toolName: "import_all",
			params: {
				projectId: "develop",
				contextId: "ctx-develop",
				importMode: "Code",
			},
			target: {
				configSource: "explicit-request",
				projectId: "develop",
				projectRoot: "C:/repo",
				accessDbPath: "C:/repo/front.accdb",
				accessPath: "C:/repo/front.accdb",
				backendPath: "C:/repo/backend.accdb",
				destinationRoot: "C:/repo/src",
			},
			modulesPlanned: ["Entorno", "Variables Globales"],
			warnings: ["preview warning"],
			errors: [],
		});

		expect(result).toEqual({
			operation: "import_all",
			dryRun: true,
			willModifyAccess: false,
			requestedProjectId: "develop",
			requestedContextId: "ctx-develop",
			resolvedProjectId: "develop",
			configSource: "explicit-overrides",
			projectRoot: "C:/repo",
			accessPath: "C:/repo/front.accdb",
			backendPath: "C:/repo/backend.accdb",
			destinationRoot: "C:/repo/src",
			importMode: "Code",
			modulesPlanned: ["Entorno", "Variables Globales"],
			modulesCount: 2,
			warnings: ["preview warning"],
			errors: [],
		});
	});

	it("characterizes import module dry-run result shaping with diagnostics", () => {
		const result = buildImportPlanResult({
			toolName: "import_modules",
			params: {},
			target: {
				configSource: "runtime-default",
				projectRoot: "C:/repo",
				accessDbPath: "",
				destinationRoot: "C:/repo/src",
			},
			modulesPlanned: [],
			warnings: [],
			errors: ["destinationRoot not found: C:/repo/src"],
		});

		expect(result).toEqual({
			operation: "import_modules",
			dryRun: true,
			willModifyAccess: false,
			requestedProjectId: undefined,
			requestedContextId: undefined,
			resolvedProjectId: undefined,
			configSource: "runtime-default",
			projectRoot: "C:/repo",
			accessPath: undefined,
			backendPath: undefined,
			destinationRoot: "C:/repo/src",
			importMode: undefined,
			modulesPlanned: [],
			modulesCount: 0,
			warnings: [],
			errors: ["destinationRoot not found: C:/repo/src"],
		});
	});

	it("maps export_modules to a product-owned PowerShell runner invocation", async () => {
		const calls: unknown[] = [];
		const executor: VbaManagerExecutor = async (request) => {
			calls.push(request);
			return {
				exitCode: 0,
				stdout: '{"ok":true}',
				stderr: "",
				durationMs: 12,
				timedOut: false,
			};
		};
		const service = new VbaSyncLegacyService({
			executor,
			scriptPath:
				"C:/Users/alice/AppData/Local/dysflow/app/scripts/dysflow-vba-manager.ps1",
			accessPath: "C:/db/front.accdb",
			env: { DYSFLOW_ACCESS_PASSWORD: "secret" },
		});

		await expect(
			service.execute("export_modules", {
				moduleNames: ["Module1"],
				destinationRoot: "C:/repo/src",
			}),
		).resolves.toMatchObject({
			ok: true,
			data: { ok: true },
			durationMs: 12,
		});

		expect(calls).toEqual([
			{
				scriptPath:
					"C:/Users/alice/AppData/Local/dysflow/app/scripts/dysflow-vba-manager.ps1",
				action: "Export",
				accessPath: "C:/db/front.accdb",
				destinationRoot: "C:/repo/src",
				moduleNames: ["Module1"],
				password: "secret",
				json: false,
				extra: {},
				timeoutMs: 30_000,
				signal: expect.any(AbortSignal),
			},
		]);
	});

	it("dry-run import_all resolves explicit registered project instead of cwd and does not open Access", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-worktrees-"));
		const staging = join(root, "staging");
		const develop = join(root, "develop");
		const registryPath = join(root, "projects.json");
		await mkdir(join(staging, ".dysflow"), { recursive: true });
		await mkdir(join(develop, ".dysflow"), { recursive: true });
		await mkdir(join(develop, "src", "modules"), { recursive: true });
		await writeFile(join(staging, "front.accdb"), "", "utf8");
		await writeFile(join(develop, "front.accdb"), "", "utf8");
		await writeFile(
			join(develop, "src", "modules", "Entorno.bas"),
			'Attribute VB_Name = "Entorno"',
			"utf8",
		);
		await writeFile(
			join(staging, ".dysflow", "project.json"),
			JSON.stringify({
				id: "staging",
				accessPath: "front.accdb",
				destinationRoot: "src",
			}),
			"utf8",
		);
		await writeFile(
			join(develop, ".dysflow", "project.json"),
			JSON.stringify({
				id: "develop",
				accessPath: "front.accdb",
				destinationRoot: "src",
			}),
			"utf8",
		);
		await writeFile(
			registryPath,
			JSON.stringify({
				projects: {
					develop: { configPath: join(develop, ".dysflow", "project.json") },
				},
			}),
			"utf8",
		);
		const calls: unknown[] = [];
		const service = new VbaSyncLegacyService({
			cwd: staging,
			env: { DYSFLOW_PROJECT_REGISTRY_PATH: registryPath },
			executor: async (request) => {
				calls.push(request);
				return {
					exitCode: 0,
					stdout: "{}",
					stderr: "",
					durationMs: 1,
					timedOut: false,
				};
			},
		});

		const result = await service.execute("import_all", {
			projectId: "develop",
			dryRun: true,
			importMode: "Code",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected dry-run success");
		expect(result.data).toMatchObject({
			operation: "import_all",
			dryRun: true,
			willModifyAccess: false,
			requestedProjectId: "develop",
			resolvedProjectId: "develop",
			configSource: "global-registry",
			accessPath: join(develop, "front.accdb"),
			destinationRoot: join(develop, "src"),
			modulesPlanned: ["Entorno"],
			modulesCount: 1,
		});
		expect(calls).toEqual([]);
	});

	it("dry-run import_all fails unknown explicit project without cwd fallback", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-worktrees-missing-"));
		const staging = join(root, "staging");
		await mkdir(join(staging, ".dysflow"), { recursive: true });
		await writeFile(join(staging, "front.accdb"), "", "utf8");
		await writeFile(
			join(staging, ".dysflow", "project.json"),
			JSON.stringify({
				id: "staging",
				accessPath: "front.accdb",
				destinationRoot: "src",
			}),
			"utf8",
		);
		const service = new VbaSyncLegacyService({
			cwd: staging,
			env: {
				DYSFLOW_PROJECT_REGISTRY_PATH: join(root, "missing-projects.json"),
			},
		});

		const result = await service.execute("import_all", {
			projectId: "missing-project",
			dryRun: true,
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected failure");
		expect(result.error.code).toBe("CONFIG_PROJECT_NOT_REGISTERED");
		expect(result.error.message).toContain("Refusing to fall back to cwd");
	});

	it("dry-run explicit overrides win over requested project id", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-overrides-"));
		const staging = join(root, "staging");
		const develop = join(root, "develop");
		await mkdir(join(develop, "src", "modules"), { recursive: true });
		await writeFile(join(develop, "front.accdb"), "", "utf8");
		await writeFile(
			join(develop, "src", "modules", "Variables Globales.bas"),
			"",
			"utf8",
		);
		const service = new VbaSyncLegacyService({ cwd: staging, env: {} });

		const result = await service.execute("import_all", {
			projectId: "staging",
			dryRun: true,
			accessPath: join(develop, "front.accdb"),
			destinationRoot: join(develop, "src"),
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected dry-run success");
		expect(result.data).toMatchObject({
			configSource: "explicit-overrides",
			accessPath: join(develop, "front.accdb"),
			destinationRoot: join(develop, "src"),
			modulesPlanned: ["Variables Globales"],
		});
	});

	it("reports runtime fallback source when no repo config is loaded", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-fallback-source-"));
		await writeFile(join(root, "front.accdb"), "", "utf8");
		const service = new VbaSyncLegacyService({
			cwd: root,
			accessPath: join(root, "front.accdb"),
			destinationRoot: root,
		});

		const result = await service.execute("import_modules", {
			dryRun: true,
			moduleNames: ["Entorno"],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected dry-run success");
		expect(result.data).toMatchObject({
			configSource: "runtime-default",
			modulesPlanned: ["Entorno"],
		});
	});

	it("dry-run import_modules only plans requested modules", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-import-modules-"));
		await mkdir(root, { recursive: true });
		await writeFile(join(root, "front.accdb"), "", "utf8");
		const service = new VbaSyncLegacyService({
			cwd: root,
			accessPath: join(root, "front.accdb"),
			destinationRoot: root,
		});

		const result = await service.execute("import_modules", {
			dryRun: true,
			moduleNames: ["Entorno", "Variables Globales"],
			importMode: "Code",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected dry-run success");
		expect(result.data).toMatchObject({
			operation: "import_modules",
			modulesPlanned: ["Entorno", "Variables Globales"],
			modulesCount: 2,
			willModifyAccess: false,
		});
	});

	it("dry-run without explicit project loads cwd project config identity", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-cwd-project-"));
		await mkdir(join(root, ".dysflow"), { recursive: true });
		await mkdir(join(root, "src", "modules"), { recursive: true });
		await writeFile(join(root, "front.accdb"), "", "utf8");
		await writeFile(join(root, "src", "modules", "Entorno.bas"), "", "utf8");
		await writeFile(
			join(root, ".dysflow", "project.json"),
			JSON.stringify({
				id: "cwd-project",
				accessPath: "front.accdb",
				destinationRoot: "src",
			}),
			"utf8",
		);
		const service = new VbaSyncLegacyService({ cwd: root, env: {} });

		const result = await service.execute("import_all", { dryRun: true });

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected dry-run success");
		expect(result.data).toMatchObject({
			resolvedProjectId: "cwd-project",
			accessPath: join(root, "front.accdb"),
			destinationRoot: join(root, "src"),
			modulesPlanned: ["Entorno"],
		});
	});

	it("strictContext fails when an expected path has no resolved actual value", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-strict-missing-"));
		const service = new VbaSyncLegacyService({ cwd: root, env: {} });

		const result = await service.execute("import_all", {
			dryRun: true,
			strictContext: true,
			expectedAccessPath: join(root, "front.accdb"),
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected strict failure");
		expect(result.error.code).toBe("STRICT_CONTEXT_MISMATCH");
	});

	it("destinationRoot override wins even when projectId is registered", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-dest-registered-"));
		const project = join(root, "project");
		const overrideRoot = join(root, "override-src");
		const registryPath = join(root, "projects.json");
		await mkdir(join(project, ".dysflow"), { recursive: true });
		await mkdir(join(project, "src", "modules"), { recursive: true });
		await mkdir(join(overrideRoot, "modules"), { recursive: true });
		await writeFile(join(project, "front.accdb"), "", "utf8");
		await writeFile(join(project, "src", "modules", "Wrong.bas"), "", "utf8");
		await writeFile(join(overrideRoot, "modules", "Right.bas"), "", "utf8");
		await writeFile(
			join(project, ".dysflow", "project.json"),
			JSON.stringify({
				id: "registered",
				accessPath: "front.accdb",
				destinationRoot: "src",
			}),
			"utf8",
		);
		await writeFile(
			registryPath,
			JSON.stringify({
				projects: {
					registered: { configPath: join(project, ".dysflow", "project.json") },
				},
			}),
			"utf8",
		);
		const service = new VbaSyncLegacyService({
			cwd: root,
			env: { DYSFLOW_PROJECT_REGISTRY_PATH: registryPath },
		});

		const result = await service.execute("import_all", {
			projectId: "registered",
			dryRun: true,
			destinationRoot: overrideRoot,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected dry-run success");
		expect(result.data).toMatchObject({
			destinationRoot: overrideRoot,
			modulesPlanned: ["Right"],
		});
	});

	it("destinationRoot-only override wins over configured cwd project", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-dest-override-"));
		const overrideRoot = join(root, "override-src");
		await mkdir(join(root, ".dysflow"), { recursive: true });
		await mkdir(join(root, "src", "modules"), { recursive: true });
		await mkdir(join(overrideRoot, "modules"), { recursive: true });
		await writeFile(join(root, "front.accdb"), "", "utf8");
		await writeFile(join(root, "src", "modules", "Wrong.bas"), "", "utf8");
		await writeFile(join(overrideRoot, "modules", "Right.bas"), "", "utf8");
		await writeFile(
			join(root, ".dysflow", "project.json"),
			JSON.stringify({
				id: "cwd-project",
				accessPath: "front.accdb",
				destinationRoot: "src",
			}),
			"utf8",
		);
		const service = new VbaSyncLegacyService({ cwd: root, env: {} });

		const result = await service.execute("import_all", {
			dryRun: true,
			destinationRoot: overrideRoot,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected dry-run success");
		expect(result.data).toMatchObject({
			destinationRoot: overrideRoot,
			modulesPlanned: ["Right"],
		});
	});

	it("real import returns target diagnostics", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-real-diag-"));
		await mkdir(join(root, ".dysflow"), { recursive: true });
		await writeFile(join(root, "front.accdb"), "", "utf8");
		await writeFile(
			join(root, ".dysflow", "project.json"),
			JSON.stringify({
				id: "real-project",
				accessPath: "front.accdb",
				destinationRoot: "src",
			}),
			"utf8",
		);
		const service = new VbaSyncLegacyService({
			cwd: root,
			env: {},
			executor: async () => ({
				exitCode: 0,
				stdout: '{"ok":true}',
				stderr: "",
				durationMs: 1,
				timedOut: false,
			}),
		});

		const result = await service.execute("import_modules", {
			moduleNames: ["Entorno"],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected import success");
		expect(result.data).toMatchObject({
			operation: "import_modules",
			dryRun: false,
			willModifyAccess: true,
			resolvedProjectId: "real-project",
			accessPath: join(root, "front.accdb"),
			destinationRoot: join(root, "src"),
			result: { ok: true },
		});
	});

	it("timeout: executor receives a cancellation signal and resolves VBA_MANAGER_TIMEOUT", async () => {
		vi.useFakeTimers();
		try {
			let capturedSignal: AbortSignal | undefined;
			const executor: VbaManagerExecutor = (request) => {
				capturedSignal = request.signal;
				return new Promise(() => {});
			};
			const service = new VbaSyncLegacyService({
				executor,
				processTimeoutMs: 50,
				scriptPath: "scripts/dysflow-vba-manager.ps1",
				accessPath: "C:/db/front.accdb",
				env: {},
			});

			const resultPromise = service.execute("export_all", {});
			await vi.advanceTimersByTimeAsync(50);

			expect(capturedSignal?.aborted).toBe(true);
			await expect(resultPromise).resolves.toMatchObject({
				ok: false,
				error: { code: "VBA_MANAGER_TIMEOUT", retryable: true },
				durationMs: 50,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("timeout: timedOut=true with exitCode=1 maps to VBA_MANAGER_TIMEOUT not VBA_MANAGER_FAILED", async () => {
		const service = new VbaSyncLegacyService({
			executor: async () => ({
				exitCode: 1,
				stdout: "",
				stderr: "failed",
				durationMs: 51,
				timedOut: true,
			}),
			scriptPath: "scripts/dysflow-vba-manager.ps1",
			accessPath: "C:/db/front.accdb",
			env: {},
		});

		const result = await service.execute("export_all", {});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("VBA_MANAGER_TIMEOUT");
			expect(result.error.retryable).toBe(true);
			expect(result.error.message).not.toContain("VBA_MANAGER_FAILED");
		}
	});

	it("-NonInteractive present in spawned args at correct position", async () => {
		let capturedArgs: readonly string[] = [];
		spawnMock.mockImplementationOnce(
			(_command: string, args: readonly string[]) => {
				capturedArgs = args;
				const child = new EventEmitter() as EventEmitter & {
					stdout: EventEmitter;
					stderr: EventEmitter;
					kill: ReturnType<typeof vi.fn>;
				};
				child.stdout = new EventEmitter();
				child.stderr = new EventEmitter();
				child.kill = vi.fn();
				queueMicrotask(() => child.emit("close", 0));
				return child;
			},
		);

		await spawnVbaManager({
			scriptPath: "scripts/dysflow-vba-manager.ps1",
			action: "Export",
			accessPath: "C:/db/front.accdb",
			destinationRoot: "C:/repo/src",
			moduleNames: [],
			json: false,
			extra: {},
			timeoutMs: 1_000,
		});

		expect(capturedArgs.slice(0, 4)).toEqual([
			"-NoProfile",
			"-NonInteractive",
			"-ExecutionPolicy",
			"Bypass",
		]);
	});

	it("maps legacy list/exists tools with JSON output enabled", async () => {
		const calls: unknown[] = [];
		const service = new VbaSyncLegacyService({
			executor: async (request) => {
				calls.push(request);
				return {
					exitCode: 0,
					stdout: '{"exists":true}',
					stderr: "",
					durationMs: 1,
					timedOut: false,
				};
			},
			scriptPath: "scripts/dysflow-vba-manager.ps1",
			accessPath: "C:/db/front.accdb",
			env: {},
		});

		await service.execute("exists", { moduleName: "Form_Main" });
		await service.execute("list_objects", {});

		expect(calls).toEqual([
			expect.objectContaining({
				action: "Exists",
				moduleNames: ["Form_Main"],
				json: true,
			}),
			expect.objectContaining({
				action: "List-Objects",
				moduleNames: [],
				json: true,
			}),
		]);
	});

	it("maps compile_vba to the repo-owned compile action with JSON output", async () => {
		const calls: unknown[] = [];
		const service = new VbaSyncLegacyService({
			executor: async (request) => {
				calls.push(request);
				return {
					exitCode: 0,
					stdout: '{"ok":true}',
					stderr: "",
					durationMs: 2,
					timedOut: false,
				};
			},
			scriptPath: "scripts/dysflow-vba-manager.ps1",
			accessPath: "C:/db/front.accdb",
			env: {},
		});

		await expect(
			service.execute("compile_vba", {
				accessPath: "C:/custom/front.accdb",
				destinationRoot: "C:/repo",
			}),
		).resolves.toMatchObject({
			ok: true,
			data: { ok: true },
		});

		expect(calls).toEqual([
			expect.objectContaining({
				action: "Compile",
				accessPath: "C:/custom/front.accdb",
				destinationRoot: "C:/repo",
				moduleNames: [],
				json: true,
				extra: {},
			}),
		]);
	});

	it("maps direct test_vba calls to a Run-Tests procedures JSON payload", async () => {
		const calls: unknown[] = [];
		const service = new VbaSyncLegacyService({
			executor: async (request) => {
				calls.push(request);
				return {
					exitCode: 0,
					stdout: '[{"ok":true,"procedure":"Test_RunAll"}]',
					stderr: "",
					durationMs: 5,
					timedOut: false,
				};
			},
			scriptPath: "scripts/dysflow-vba-manager.ps1",
			accessPath: "C:/db/front.accdb",
			env: {},
		});

		await expect(
			service.execute("test_vba", {
				procedureName: "Test_RunAll",
				argsJson: '["fixture", 1]',
				destinationRoot: "C:/repo",
			}),
		).resolves.toMatchObject({
			ok: true,
			data: [{ ok: true, procedure: "Test_RunAll" }],
		});

		expect(calls).toEqual([
			expect.objectContaining({
				action: "Run-Tests",
				destinationRoot: "C:/repo",
				json: true,
				extra: {
					proceduresJson: JSON.stringify([
						{ procedure: "Test_RunAll", args: ["fixture", 1] },
					]),
				},
			}),
		]);
	});

	it("loads test_vba manifests from testsPath and filters by name, procedure, or tags", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-vba-tests-"));
		await writeFile(
			join(root, "tests.vba.json"),
			JSON.stringify({
				tests: [
					{
						name: "smoke import",
						procedure: "Test_Import",
						args: ["a"],
						tags: ["smoke"],
					},
					{
						name: "slow export",
						procedure: "Test_Export",
						args: ["b"],
						tags: ["slow"],
					},
				],
			}),
			"utf8",
		);
		const calls: unknown[] = [];
		const service = new VbaSyncLegacyService({
			executor: async (request) => {
				calls.push(request);
				return {
					exitCode: 0,
					stdout: '[{"ok":true,"procedure":"Test_Import"}]',
					stderr: "",
					durationMs: 7,
					timedOut: false,
				};
			},
			scriptPath: "scripts/dysflow-vba-manager.ps1",
			accessPath: "C:/db/front.accdb",
			env: {},
			cwd: root,
		});

		await expect(
			service.execute("test_vba", {
				testsPath: "tests.vba.json",
				filter: "smoke",
			}),
		).resolves.toMatchObject({
			ok: true,
			data: [{ ok: true, procedure: "Test_Import" }],
		});

		expect(calls).toEqual([
			expect.objectContaining({
				action: "Run-Tests",
				destinationRoot: root,
				json: true,
				extra: {
					proceduresJson: JSON.stringify([
						{ procedure: "Test_Import", args: ["a"] },
					]),
				},
			}),
		]);
	});

	it("runs compile before test_vba plan execution when compile is requested", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-vba-compile-tests-"));
		await writeFile(
			join(root, "tests.vba.json"),
			JSON.stringify([{ procedure: "Test_RunAll", args: [] }]),
			"utf8",
		);
		const calls: unknown[] = [];
		const service = new VbaSyncLegacyService({
			executor: async (request) => {
				calls.push(request);
				return {
					exitCode: 0,
					stdout:
						request.action === "Compile" ? '{"ok":true}' : '[{"ok":true}]',
					stderr: "",
					durationMs: 4,
					timedOut: false,
				};
			},
			scriptPath: "scripts/dysflow-vba-manager.ps1",
			accessPath: "C:/db/front.accdb",
			env: {},
			cwd: root,
		});

		await expect(
			service.execute("test_vba", { compile: true }),
		).resolves.toMatchObject({ ok: true });

		expect(calls).toEqual([
			expect.objectContaining({ action: "Compile", json: true }),
			expect.objectContaining({
				action: "Run-Tests",
				extra: {
					proceduresJson: JSON.stringify([
						{ procedure: "Test_RunAll", args: [] },
					]),
				},
			}),
		]);
	});

	it("returns a safe failure when a direct runner mapping is not available yet", async () => {
		const service = new VbaSyncLegacyService({
			executor: async () => ({
				exitCode: 0,
				stdout: "{}",
				stderr: "",
				durationMs: 1,
				timedOut: false,
			}),
			scriptPath: "scripts/dysflow-vba-manager.ps1",
			accessPath: "C:/db/front.accdb",
			env: {},
		});

		expect(await service.execute("verify_binary", { diff: true })).toEqual(
			failureResult({
				code: "LEGACY_TOOL_NOT_IMPLEMENTED",
				message:
					"verify_binary requires a higher-level source/binary comparison implementation before it can run through this service.",
				retryable: false,
			}),
		);
	});

	it("redacts passwords from runner failures", async () => {
		const service = new VbaSyncLegacyService({
			executor: async () => ({
				exitCode: 1,
				stdout: "",
				stderr: "bad password secret",
				durationMs: 3,
				timedOut: false,
			}),
			scriptPath: "scripts/dysflow-vba-manager.ps1",
			accessPath: "C:/db/front.accdb",
			env: { DYSFLOW_ACCESS_PASSWORD: "secret" },
		});

		const result = await service.execute("export_all", {});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toContain("[REDACTED]");
			expect(result.error.message).not.toContain("secret");
		}
	});

	it("resolves installed script path from DYSFLOW_HOME", () => {
		expect(
			resolveDefaultVbaManagerScriptPath({
				DYSFLOW_HOME: "C:/Users/alice/AppData/Local/dysflow",
			}),
		).toBe(
			"C:/Users/alice/AppData/Local/dysflow/app/scripts/dysflow-vba-manager.ps1",
		);
	});

	it("returns VBA_INVALID_TEST_PLAN when the test plan file is missing", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-vba-missing-"));
		const service = new VbaSyncLegacyService({
			executor: async () => ({
				exitCode: 0,
				stdout: "[]",
				stderr: "",
				durationMs: 1,
				timedOut: false,
			}),
			scriptPath: "scripts/dysflow-vba-manager.ps1",
			accessPath: "C:/db/front.accdb",
			env: {},
			cwd: root,
		});

		const result = await service.execute("test_vba", {
			testsPath: "nonexistent.json",
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "VBA_INVALID_TEST_PLAN" },
		});
	});

	it("returns VBA_INVALID_TEST_PLAN when the test plan file contains malformed JSON", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-vba-malformed-"));
		await writeFile(join(root, "tests.vba.json"), "{ not valid json }", "utf8");
		const service = new VbaSyncLegacyService({
			executor: async () => ({
				exitCode: 0,
				stdout: "[]",
				stderr: "",
				durationMs: 1,
				timedOut: false,
			}),
			scriptPath: "scripts/dysflow-vba-manager.ps1",
			accessPath: "C:/db/front.accdb",
			env: {},
			cwd: root,
		});

		const result = await service.execute("test_vba", {
			testsPath: "tests.vba.json",
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "VBA_INVALID_TEST_PLAN" },
		});
	});

	it("returns VBA_INVALID_TEST_PLAN when the test plan has an invalid structure (not an array)", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-vba-badstruct-"));
		await writeFile(
			join(root, "tests.vba.json"),
			JSON.stringify("not-an-array"),
			"utf8",
		);
		const service = new VbaSyncLegacyService({
			executor: async () => ({
				exitCode: 0,
				stdout: "[]",
				stderr: "",
				durationMs: 1,
				timedOut: false,
			}),
			scriptPath: "scripts/dysflow-vba-manager.ps1",
			accessPath: "C:/db/front.accdb",
			env: {},
			cwd: root,
		});

		const result = await service.execute("test_vba", {
			testsPath: "tests.vba.json",
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "VBA_INVALID_TEST_PLAN" },
		});
	});

	it("succeeds with a valid inline procedureName (regression guard)", async () => {
		const service = new VbaSyncLegacyService({
			executor: async () => ({
				exitCode: 0,
				stdout: '[{"ok":true,"procedure":"Test_Run"}]',
				stderr: "",
				durationMs: 2,
				timedOut: false,
			}),
			scriptPath: "scripts/dysflow-vba-manager.ps1",
			accessPath: "C:/db/front.accdb",
			env: {},
		});

		const result = await service.execute("test_vba", {
			procedureName: "Test_Run",
		});

		expect(result).toMatchObject({ ok: true });
	});
});
