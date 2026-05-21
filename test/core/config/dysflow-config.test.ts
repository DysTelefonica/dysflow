import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	loadDysflowConfig,
	loadDysflowConfigAsync,
	redactDysflowConfig,
} from "../../../src/core/config/dysflow-config";

function createTempWorkspace(): { root: string; cleanup(): void } {
	const root = mkdtempSync(join(tmpdir(), "dysflow-config-"));
	return {
		root,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}

function writeRepoProjectConfig(root: string, config: Record<string, unknown>): void {
	mkdirSync(join(root, ".dysflow"), { recursive: true });
	writeFileSync(
		join(root, ".dysflow", "project.json"),
		`${JSON.stringify(config, null, 2)}\n`,
		"utf8",
	);
}

describe("dysflow configuration", () => {
	// #61 — both .dysflow/project.json and dysflow.project.json in same dir
	it("returns CONFIG_AMBIGUOUS_PROJECT_FILE when both config filenames exist", () => {
		const { root, cleanup } = createTempWorkspace();
		try {
			// Write .dysflow/project.json
			mkdirSync(join(root, ".dysflow"), { recursive: true });
			writeFileSync(join(root, ".dysflow", "project.json"), '{"accessPath":"a.accdb"}', "utf8");
			// Write dysflow.project.json
			writeFileSync(join(root, "dysflow.project.json"), '{"accessPath":"b.accdb"}', "utf8");

			const result = loadDysflowConfig({ cwd: root, env: {} });

			expect(result.ok).toBe(false);
			if (result.ok) throw new Error("expected failure");
			expect(result.error.code).toBe("CONFIG_AMBIGUOUS_PROJECT_FILE");
			expect(result.error.retryable).toBe(false);
			expect(result.error.message).toContain(".dysflow");
			expect(result.error.message).toContain("dysflow.project.json");
		} finally {
			cleanup();
		}
	});

	it("still succeeds when only one config filename exists", () => {
		const { root, cleanup } = createTempWorkspace();
		try {
			writeRepoProjectConfig(root, { accessPath: "app.accdb" });
			const result = loadDysflowConfig({ cwd: root, env: {} });
			expect(result.ok).toBe(true);
		} finally {
			cleanup();
		}
	});

	it("resolves Access path, timeout, and redacts password from explicit input", () => {
		const result = loadDysflowConfig({
			accessDbPath: "C:/data/app.accdb",
			accessPassword: "super-secret",
			timeoutMs: 45_000,
			env: {},
		});

		expect(result).toEqual({
			ok: true,
			data: {
				configSource: "explicit-request",
				allowWrites: false,
				accessDbPath: "C:/data/app.accdb",
				backendPath: undefined,
				timeoutMs: 45_000,
				processTimeoutMs: 45_000,
				accessPassword: "super-secret",
				backendPassword: undefined,
				projectId: undefined,
				projectRoot: expect.any(String),
				destinationRoot: expect.any(String),
			},
			diagnostics: [],
			durationMs: 0,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected config success");
		expect(redactDysflowConfig(result.data)).toMatchObject({
			accessDbPath: "C:/data/app.accdb",
			allowWrites: false,
			timeoutMs: 45_000,
			processTimeoutMs: 45_000,
			accessPassword: "[REDACTED]",
			configSource: "explicit-request",
		});
	});

	it("does not resolve functional config from environment variables", () => {
		const workspace = createTempWorkspace();
		try {
			const result = loadDysflowConfig({
				cwd: workspace.root,
				env: {
					DYSFLOW_ACCESS_DB_PATH: "D:/fixtures/demo.accdb",
					DYSFLOW_PROJECT_ID: "demo",
					DYSFLOW_TIMEOUT_MS: "120000",
				},
			});

			expect(result).toEqual({
				ok: false,
				error: {
					code: "CONFIG_MISSING_ACCESS_PATH",
					message:
						"Access database path is required. Define .dysflow/project.json in the repository or pass accessDbPath explicitly.",
					retryable: false,
				},
				diagnostics: [],
				durationMs: 0,
			});
		} finally {
			workspace.cleanup();
		}
	});

	it("returns a typed configuration error when repo project config is missing", () => {
		const workspace = createTempWorkspace();
		try {
			const result = loadDysflowConfig({ cwd: workspace.root, env: {} });
			expect(result).toEqual({
				ok: false,
				error: {
					code: "CONFIG_MISSING_ACCESS_PATH",
					message:
						"Access database path is required. Define .dysflow/project.json in the repository or pass accessDbPath explicitly.",
					retryable: false,
				},
				diagnostics: [],
				durationMs: 0,
			});
		} finally {
			workspace.cleanup();
		}
	});

	it("falls back to the default timeout when explicit timeout is invalid", () => {
		for (const timeoutMs of [0, -1, Number.NaN]) {
			const result = loadDysflowConfig({
				accessDbPath: "C:/data/app.accdb",
				timeoutMs,
				env: {},
			});

			expect(result.ok).toBe(true);
			if (!result.ok) throw new Error("expected config success");
			expect(result.data.timeoutMs).toBe(30_000);
		}
	});

	it("loads repo .dysflow project config and resolves relative credentials", () => {
		const workspace = createTempWorkspace();
		try {
			writeRepoProjectConfig(workspace.root, {
				id: "proyecto-demo",
				accessPath: "front.accdb",
				backendPath: "backend.accdb",
				allowWrites: true,
				destinationRoot: "src",
				projectRoot: ".",
				timeoutMs: 12_000,
				accessPasswordEnv: "WORKTREE_ACCESS_PASSWORD",
				frontendPasswordEnv: "WORKTREE_ACCESS_PASSWORD",
				backendPasswordEnv: "WORKTREE_BACKEND_PASSWORD",
			});
			writeFileSync(join(workspace.root, "front.accdb"), "", "utf8");
			writeFileSync(join(workspace.root, "backend.accdb"), "", "utf8");

			const result = loadDysflowConfig({
				cwd: workspace.root,
				env: {
					WORKTREE_ACCESS_PASSWORD: "access-secret",
					WORKTREE_BACKEND_PASSWORD: "backend-secret",
				},
			});

			expect(result.ok).toBe(true);
			if (!result.ok) throw new Error("expected project config to load");

			expect(result.data).toMatchObject({
				configSource: "repo-config",
				accessDbPath: resolve(workspace.root, "front.accdb"),
				backendPath: resolve(workspace.root, "backend.accdb"),
				allowWrites: true,
				destinationRoot: resolve(workspace.root, "src"),
				projectRoot: resolve(workspace.root),
				projectId: "proyecto-demo",
				accessPassword: "access-secret",
				backendPassword: "backend-secret",
				timeoutMs: 12_000,
			});
		} finally {
			workspace.cleanup();
		}
	});

	it("resolves matching projectId from the repo-local config so project allowWrites can apply", () => {
		const workspace = createTempWorkspace();
		try {
			writeRepoProjectConfig(workspace.root, {
				id: "any-access-project",
				accessPath: "front.accdb",
				backendPath: "backend.accdb",
				allowWrites: true,
			});
			writeFileSync(join(workspace.root, "front.accdb"), "", "utf8");
			writeFileSync(join(workspace.root, "backend.accdb"), "", "utf8");

			const result = loadDysflowConfig({
				cwd: workspace.root,
				projectId: "any-access-project",
				env: {},
			});

			expect(result.ok).toBe(true);
			if (!result.ok) throw new Error("expected project config to load");
			expect(result.data.projectId).toBe("any-access-project");
			expect(result.data.allowWrites).toBe(true);
		} finally {
			workspace.cleanup();
		}
	});

	it("rejects projectId when it does not match the repo-local config id", () => {
		const workspace = createTempWorkspace();
		try {
			writeRepoProjectConfig(workspace.root, {
				id: "configured-project",
				accessPath: "front.accdb",
				allowWrites: true,
			});

			const result = loadDysflowConfig({
				cwd: workspace.root,
				projectId: "other-project",
				env: {},
			});

			expect(result.ok).toBe(false);
			if (result.ok) throw new Error("expected config mismatch");
			expect(result.error.code).toBe("CONFIG_PROJECT_ID_MISMATCH");
			expect(result.error.message).toContain("other-project");
			expect(result.error.message).toContain("configured-project");
		} finally {
			workspace.cleanup();
		}
	});

	it("async config resolves matching projectId from the repo-local config", async () => {
		const workspace = await mkdtemp(join(tmpdir(), "dysflow-config-async-project-id-"));
		try {
			await mkdir(join(workspace, ".dysflow"), { recursive: true });
			await writeFile(
				join(workspace, ".dysflow", "project.json"),
				JSON.stringify({ id: "async-project", accessPath: "front.accdb", allowWrites: true }),
				"utf8",
			);
			await writeFile(join(workspace, "front.accdb"), "", "utf8");

			const result = await loadDysflowConfigAsync({
				cwd: workspace,
				projectId: "async-project",
				env: {},
			});

			expect(result.ok).toBe(true);
			if (!result.ok) throw new Error("expected async project config to load");
			expect(result.data.projectId).toBe("async-project");
			expect(result.data.allowWrites).toBe(true);
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	it("uses explicit projectId as canonical trace identity ahead of contextId", () => {
		const result = loadDysflowConfig({
			accessDbPath: "C:/data/app.accdb",
			projectId: "engram-canonical-project",
			contextId: "run-context-only",
			env: {},
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected config success");
		expect(result.data.projectId).toBe("engram-canonical-project");
	});

	it("falls back to contextId only when no projectId exists", () => {
		const result = loadDysflowConfig({
			accessDbPath: "C:/data/app.accdb",
			contextId: "context-fallback-project",
			env: {},
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected config success");
		expect(result.data.projectId).toBe("context-fallback-project");
	});

	it("does not let env path variables override repo config", () => {
		const workspace = createTempWorkspace();
		try {
			writeRepoProjectConfig(workspace.root, {
				id: "repo-project",
				accessPath: "front.accdb",
			});
			writeFileSync(join(workspace.root, "front.accdb"), "", "utf8");

			const result = loadDysflowConfig({
				cwd: workspace.root,
				env: {
					DYSFLOW_ACCESS_DB_PATH: "D:/wrong/other.accdb",
					DYSFLOW_PROJECT_ID: "wrong-project",
					DYSFLOW_TIMEOUT_MS: "120000",
					DYSFLOW_ACCESS_PASSWORD: "allowed-secret",
				},
			});

			expect(result.ok).toBe(true);
			if (!result.ok) throw new Error("expected config success");
			expect(result.data).toMatchObject({
				configSource: "repo-config",
				accessDbPath: resolve(workspace.root, "front.accdb"),
				projectId: "repo-project",
				timeoutMs: 30_000,
				accessPassword: "allowed-secret",
			});
		} finally {
			workspace.cleanup();
		}
	});

	it("does not share generic passwordEnv with backend passwords", () => {
		const workspace = createTempWorkspace();
		try {
			writeRepoProjectConfig(workspace.root, {
				accessPath: "front.accdb",
				backendPath: "backend.accdb",
				passwordEnv: "SHARED_PASSWORD",
			});
			writeFileSync(join(workspace.root, "front.accdb"), "", "utf8");
			writeFileSync(join(workspace.root, "backend.accdb"), "", "utf8");

			const result = loadDysflowConfig({
				cwd: workspace.root,
				env: { SHARED_PASSWORD: "shared-secret" },
			});

			expect(result.ok).toBe(true);
			if (!result.ok) throw new Error("expected config success");
			expect(result.data.accessPassword).toBe("shared-secret");
			expect(result.data.backendPassword).toBeUndefined();
		} finally {
			workspace.cleanup();
		}
	});

	it("loads repo project config asynchronously for production request paths (#181)", async () => {
		const workspace = createTempWorkspace();
		try {
			writeRepoProjectConfig(workspace.root, {
				id: "async-project",
				accessPath: "front.accdb",
				destinationRoot: "src",
			});
			writeFileSync(join(workspace.root, "front.accdb"), "", "utf8");

			const result = await loadDysflowConfigAsync({
				cwd: workspace.root,
				env: {},
			});

			expect(result.ok).toBe(true);
			if (!result.ok) throw new Error("expected async config success");
			expect(result.data).toMatchObject({
				configSource: "repo-config",
				projectId: "async-project",
				accessDbPath: resolve(workspace.root, "front.accdb"),
			});
		} finally {
			workspace.cleanup();
		}
	});

	it("rejects relative project registry entries that escape the registry directory", () => {
		const workspace = createTempWorkspace();
		try {
			const registryDir = join(workspace.root, "registry");
			const outside = join(workspace.root, "outside");
			mkdirSync(registryDir, { recursive: true });
			mkdirSync(outside, { recursive: true });
			writeRepoProjectConfig(outside, { accessPath: "front.accdb" });
			writeFileSync(join(outside, "front.accdb"), "", "utf8");
			const registryPath = join(registryDir, "projects.json");
			writeFileSync(
				registryPath,
				JSON.stringify({ projects: { escaped: "../outside/.dysflow/project.json" } }, null, 2),
				"utf8",
			);

			const result = loadDysflowConfig({
				projectId: "escaped",
				env: {},
				cwd: workspace.root,
			});

			expect(result.ok).toBe(false);
			if (result.ok) throw new Error("expected config failure");
			expect(result.error.code).toBe("CONFIG_PROJECT_NOT_REGISTERED");
		} finally {
			workspace.cleanup();
		}
	});

	// #193 RED: loadProjectConfigFromPath must return OperationResult failure for malformed JSON (not throw)
	describe("readJsonFile call-site guards (#193)", () => {
		it("loadDysflowConfig returns CONFIG_PROJECT_FILE_INVALID for malformed repo project JSON (sync)", () => {
			const workspace = createTempWorkspace();
			try {
				mkdirSync(join(workspace.root, ".dysflow"), { recursive: true });
				writeFileSync(
					join(workspace.root, ".dysflow", "project.json"),
					"{ this is not valid json }",
					"utf8",
				);

				const result = loadDysflowConfig({ cwd: workspace.root, env: {} });

				expect(result.ok).toBe(false);
				if (result.ok) throw new Error("expected failure");
				expect(result.error.code).toBe("CONFIG_PROJECT_FILE_INVALID");
			} finally {
				workspace.cleanup();
			}
		});

		it("loadDysflowConfigAsync returns CONFIG_PROJECT_FILE_INVALID for malformed repo project JSON (async)", async () => {
			const root = await mkdtemp(join(tmpdir(), "dysflow-malformed-async-"));
			try {
				await mkdir(join(root, ".dysflow"), { recursive: true });
				await writeFile(
					join(root, ".dysflow", "project.json"),
					"{ this is not valid json }",
					"utf8",
				);

				const result = await loadDysflowConfigAsync({ cwd: root, env: {} });

				expect(result.ok).toBe(false);
				if (result.ok) throw new Error("expected failure");
				expect(result.error.code).toBe("CONFIG_PROJECT_FILE_INVALID");
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		});

	});
});
