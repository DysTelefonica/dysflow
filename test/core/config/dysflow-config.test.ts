import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	loadDysflowConfig,
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
				accessDbPath: "C:/data/app.accdb",
				timeoutMs: 45_000,
				processTimeoutMs: 45_000,
				accessPassword: "super-secret",
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
});
