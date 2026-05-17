import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	FileAccessOperationRegistry,
	InMemoryAccessOperationRegistry,
} from "../../../src/core/operations/access-operation-registry.js";
import { AccessOperationCleanupService } from "../../../src/core/operations/access-operation-cleanup.js";

const base = {
	operationId: "op-1",
	action: "run" as const,
	accessPath: "C:/data/app.accdb",
	projectRootAbs: "C:/repo/app",
	destinationRootAbs: "C:/repo/app/out",
	metadata: { procedureName: "Refresh" },
};

describe("Access operation registry and cleanup safety", () => {
	it("keeps AccessOperationAction as a strict union instead of widening to string", () => {
		const source = readFileSync(
			"src/core/operations/access-operation-registry.ts",
			"utf8",
		);

		expect(source).toContain("export type AccessOperationAction =");
		expect(source).not.toContain("| string");
	});

	it("evicts the oldest records when the configured max size is exceeded", async () => {
		const registry = new InMemoryAccessOperationRegistry({ maxRecords: 2 });
		await registry.create({
			...base,
			operationId: "old",
			status: "completed",
			accessPid: 1,
			processStartTime: "2026-05-15T10:00:00.000Z",
			updatedAt: "2026-05-15T10:00:00.000Z",
		});
		await registry.create({
			...base,
			operationId: "middle",
			status: "completed",
			accessPid: 2,
			processStartTime: "2026-05-15T11:00:00.000Z",
			updatedAt: "2026-05-15T11:00:00.000Z",
		});
		await registry.create({
			...base,
			operationId: "new",
			status: "completed",
			accessPid: 3,
			processStartTime: "2026-05-15T12:00:00.000Z",
			updatedAt: "2026-05-15T12:00:00.000Z",
		});

		await expect(registry.get("old")).resolves.toBeUndefined();
		await expect(registry.listRecent({ limit: 10 })).resolves.toMatchObject([
			{ operationId: "new" },
			{ operationId: "middle" },
		]);
	});

	it("serializes concurrent file creates without losing operation records", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-ops-concurrent-"));
		const registryPath = join(root, ".dysflow", "runtime", "operations.json");
		try {
			const registry = new FileAccessOperationRegistry({
				filePath: registryPath,
			});
			await Promise.all(
				Array.from({ length: 20 }, (_, index) =>
					registry.create({
						...base,
						operationId: `op-${index}`,
						status: "starting",
						accessPid: null,
						processStartTime: null,
						updatedAt: `2026-05-15T10:00:${String(index).padStart(2, "0")}.000Z`,
					}),
				),
			);

			await expect(registry.listRecent({ limit: 25 })).resolves.toHaveLength(
				20,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("persists non-completed operation records to a repo-local runtime file", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-ops-"));
		const registryPath = join(root, ".dysflow", "runtime", "operations.json");
		try {
			const registry = new FileAccessOperationRegistry({
				filePath: registryPath,
			});
			await registry.create({
				...base,
				operationId: "op-timeout",
				status: "starting",
				accessPid: null,
				processStartTime: null,
				updatedAt: "2026-05-15T10:00:00.000Z",
			});
			await registry.update("op-timeout", {
				status: "timed_out",
				accessPid: 4321,
				processStartTime: "2026-05-15T10:05:00.000Z",
				updatedAt: "2026-05-15T10:05:00.000Z",
			});

			await expect(
				new FileAccessOperationRegistry({ filePath: registryPath }).get(
					"op-timeout",
				),
			).resolves.toMatchObject({
				operationId: "op-timeout",
				status: "timed_out",
				accessPid: 4321,
				processStartTime: "2026-05-15T10:05:00.000Z",
			});
			await expect(readFile(registryPath, "utf8")).resolves.toContain(
				"op-timeout",
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("purges completed and cleaned records from the persistent runtime file", async () => {
		const root = await mkdtemp(join(tmpdir(), "dysflow-ops-"));
		const registryPath = join(root, ".dysflow", "runtime", "operations.json");
		try {
			const registry = new FileAccessOperationRegistry({
				filePath: registryPath,
			});
			await registry.create({
				...base,
				operationId: "op-complete",
				status: "starting",
				accessPid: null,
				processStartTime: null,
				updatedAt: "2026-05-15T10:00:00.000Z",
			});
			await registry.update("op-complete", {
				status: "completed",
				updatedAt: "2026-05-15T10:01:00.000Z",
			});

			await expect(registry.get("op-complete")).resolves.toBeUndefined();
			expect(existsSync(registryPath)).toBe(true);
			await expect(readFile(registryPath, "utf8")).resolves.not.toContain(
				"op-complete",
			);

			await registry.create({
				...base,
				operationId: "op-cleaned",
				status: "timed_out",
				accessPid: 1234,
				processStartTime: "2026-05-15T10:00:00.000Z",
				updatedAt: "2026-05-15T10:00:00.000Z",
			});
			await registry.update("op-cleaned", {
				status: "cleaned",
				updatedAt: "2026-05-15T10:02:00.000Z",
			});
			await expect(registry.get("op-cleaned")).resolves.toBeUndefined();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("lists the latest operation including completed records", async () => {
		const registry = new InMemoryAccessOperationRegistry();
		await registry.create({
			...base,
			operationId: "old",
			status: "completed",
			accessPid: 1,
			processStartTime: "2026-05-15T10:00:00.000Z",
			updatedAt: "2026-05-15T10:00:00.000Z",
		});
		await registry.create({
			...base,
			operationId: "new",
			status: "timed_out",
			accessPid: 2,
			processStartTime: "2026-05-15T11:00:00.000Z",
			updatedAt: "2026-05-15T11:00:00.000Z",
		});

		await expect(registry.listRecent({ limit: 1 })).resolves.toMatchObject([
			{ operationId: "new", status: "timed_out" },
		]);
	});

	it("kills only the registered PID when every ownership check passes", async () => {
		const registry = new InMemoryAccessOperationRegistry();
		await registry.create({
			...base,
			status: "timed_out",
			accessPid: 1234,
			processStartTime: "2026-05-15T10:00:00.000Z",
			commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
			updatedAt: "2026-05-15T10:00:00.000Z",
		});
		const killed: number[] = [];
		const service = new AccessOperationCleanupService({
			registry,
			processInspector: {
				getProcess: async () => ({
					pid: 1234,
					name: "MSACCESS.EXE",
					startTime: "2026-05-15T10:00:00.000Z",
					commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
				}),
			},
			processKiller: {
				kill: async (pid) => {
					killed.push(pid);
				},
			},
		});

		const result = await service.cleanup({
			operationId: "op-1",
			accessPath: "C:/data/app.accdb",
		});

		expect(result.ok).toBe(true);
		expect(killed).toEqual([1234]);
		await expect(registry.get("op-1")).resolves.toMatchObject({
			status: "cleaned",
		});
	});

	it("accepts cleanup when accessPath differs only by case", async () => {
		const registry = new InMemoryAccessOperationRegistry();
		await registry.create({
			...base,
			status: "timed_out",
			accessPid: 1234,
			processStartTime: "2026-05-15T10:00:00.000Z",
			commandLine: 'MSACCESS.EXE "C:/DATA/APP.ACCDB"',
			updatedAt: "2026-05-15T10:00:00.000Z",
		});
		const killed: number[] = [];
		const service = new AccessOperationCleanupService({
			registry,
			processInspector: {
				getProcess: async () => ({
					pid: 1234,
					name: "MSACCESS.EXE",
					startTime: "2026-05-15T10:00:00.000Z",
					commandLine: 'MSACCESS.EXE "C:/DATA/APP.ACCDB"',
				}),
			},
			processKiller: {
				kill: async (pid) => {
					killed.push(pid);
				},
			},
		});

		const result = await service.cleanup({
			operationId: "op-1",
			accessPath: "c:/DATA/APP.accdb",
		});

		expect(result.ok).toBe(true);
		expect(killed).toEqual([1234]);
	});

	it("refuses cleanup when accessPath does not match", async () => {
		const registry = new InMemoryAccessOperationRegistry();
		await registry.create({
			...base,
			status: "timed_out",
			accessPid: 1234,
			processStartTime: "2026-05-15T10:00:00.000Z",
			updatedAt: "2026-05-15T10:00:00.000Z",
		});
		const service = new AccessOperationCleanupService({
			registry,
			processInspector: { getProcess: async () => undefined },
			processKiller: { kill: async () => undefined },
		});

		const result = await service.cleanup({
			operationId: "op-1",
			accessPath: "C:/other.accdb",
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "CLEANUP_ACCESS_PATH_MISMATCH" },
		});
	});

	it("refuses cleanup when PID start time differs", async () => {
		const registry = new InMemoryAccessOperationRegistry();
		await registry.create({
			...base,
			status: "timed_out",
			accessPid: 1234,
			processStartTime: "2026-05-15T10:00:00.000Z",
			updatedAt: "2026-05-15T10:00:00.000Z",
		});
		const service = new AccessOperationCleanupService({
			registry,
			processInspector: {
				getProcess: async () => ({
					pid: 1234,
					name: "MSACCESS.EXE",
					startTime: "2026-05-15T10:05:00.000Z",
				}),
			},
			processKiller: { kill: async () => undefined },
		});

		const result = await service.cleanup({
			operationId: "op-1",
			accessPath: "C:/data/app.accdb",
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "CLEANUP_PROCESS_START_TIME_MISMATCH" },
		});
	});

	it("refuses pid_unknown operations", async () => {
		const registry = new InMemoryAccessOperationRegistry();
		await registry.create({
			...base,
			status: "pid_unknown",
			accessPid: null,
			processStartTime: null,
			updatedAt: "2026-05-15T10:00:00.000Z",
		});
		const service = new AccessOperationCleanupService({
			registry,
			processInspector: { getProcess: async () => undefined },
			processKiller: { kill: async () => undefined },
		});

		const result = await service.cleanup({
			operationId: "op-1",
			accessPath: "C:/data/app.accdb",
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "CLEANUP_PID_UNKNOWN" },
		});
	});
});
