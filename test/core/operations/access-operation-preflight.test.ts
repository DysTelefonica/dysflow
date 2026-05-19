import { describe, expect, it } from "vitest";
import {
	InMemoryAccessOperationRegistry,
	type AccessOperationRecord,
} from "../../../src/core/operations/access-operation-registry.js";
import { AccessOperationPreflightCleanupService } from "../../../src/core/operations/access-operation-preflight.js";
import type { OsProcessInfo } from "../../../src/core/operations/access-operation-cleanup.js";

const baseRecord: AccessOperationRecord = {
	operationId: "op-stale",
	action: "run",
	accessPath: "C:/data/app.accdb",
	projectRootAbs: "C:/repo/app",
	destinationRootAbs: "C:/repo/app/src",
	accessPid: 1234,
	processStartTime: "2026-05-15T10:00:00.000Z",
	commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
	status: "timed_out",
	metadata: {},
	updatedAt: "2026-05-15T10:01:00.000Z",
};

describe("AccessOperationPreflightCleanupService", () => {
	it("marks matching stale operations with a dead pid as cleaned without killing", async () => {
		const registry = new InMemoryAccessOperationRegistry();
		await registry.create(baseRecord);
		const killed: number[] = [];
		const service = new AccessOperationPreflightCleanupService({
			registry,
			processInspector: { getProcess: async () => undefined },
			processKiller: { kill: async (pid) => { killed.push(pid); } },
			clock: () => "2026-05-15T10:02:00.000Z",
		});

		const result = await service.cleanup({
			accessPath: "C:/DATA/app.accdb",
			projectRoot: "C:/repo/app",
		});

		expect(result).toEqual({ cleaned: ["op-stale"], killed: [], orphanedKilled: [], errors: [] });
		expect(killed).toEqual([]);
		await expect(registry.get("op-stale")).resolves.toMatchObject({
			status: "cleaned",
			updatedAt: "2026-05-15T10:02:00.000Z",
		});
	});

	it("marks matching stale operations without a pid as cleaned without inspecting or killing", async () => {
		const registry = new InMemoryAccessOperationRegistry();
		await registry.create({ ...baseRecord, accessPid: null, processStartTime: null });
		const service = new AccessOperationPreflightCleanupService({
			registry,
			processInspector: { getProcess: async () => { throw new Error("should not inspect"); } },
			processKiller: { kill: async () => { throw new Error("should not kill"); } },
			clock: () => "2026-05-15T10:02:00.000Z",
		});

		await expect(service.cleanup({ accessPath: "C:/data/app.accdb", projectRoot: "C:/repo/app" })).resolves.toEqual({
			cleaned: ["op-stale"],
			killed: [],
			orphanedKilled: [],
			errors: [],
		});
		await expect(registry.get("op-stale")).resolves.toMatchObject({ status: "cleaned" });
	});

	it("kills the registered live pid before marking the operation cleaned", async () => {
		const registry = new InMemoryAccessOperationRegistry();
		await registry.create(baseRecord);
		const killed: number[] = [];
		const liveProcess: OsProcessInfo = {
			pid: 1234,
			name: "MSACCESS.EXE",
			startTime: "2026-05-15T10:00:00.000Z",
			commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
		};
		const service = new AccessOperationPreflightCleanupService({
			registry,
			processInspector: { getProcess: async () => liveProcess },
			processKiller: { kill: async (pid) => { killed.push(pid); } },
			clock: () => "2026-05-15T10:02:00.000Z",
		});

		const result = await service.cleanup({
			accessPath: "C:/data/app.accdb",
			projectRoot: "C:/repo/app",
		});

		expect(result).toEqual({ cleaned: ["op-stale"], killed: [1234], orphanedKilled: [], errors: [] });
		expect(killed).toEqual([1234]);
		await expect(registry.get("op-stale")).resolves.toMatchObject({ status: "cleaned" });
	});

	it("ignores records with a different accessPath", async () => {
		const registry = new InMemoryAccessOperationRegistry();
		await registry.create(baseRecord);
		const service = new AccessOperationPreflightCleanupService({
			registry,
			processInspector: { getProcess: async () => { throw new Error("should not inspect"); } },
			processKiller: { kill: async () => { throw new Error("should not kill"); } },
		});

		await expect(service.cleanup({ accessPath: "C:/other.accdb", projectRoot: "C:/repo/app" })).resolves.toEqual({
			cleaned: [],
			killed: [],
			orphanedKilled: [],
			errors: [],
		});
		await expect(registry.get("op-stale")).resolves.toMatchObject({ status: "timed_out" });
	});

	it("ignores statuses that are not eligible for preflight cleanup", async () => {
		const registry = new InMemoryAccessOperationRegistry();
		await registry.create({ ...baseRecord, status: "running" });
		const service = new AccessOperationPreflightCleanupService({
			registry,
			processInspector: { getProcess: async () => { throw new Error("should not inspect"); } },
			processKiller: { kill: async () => { throw new Error("should not kill"); } },
		});

		await expect(service.cleanup({ accessPath: "C:/data/app.accdb", projectRoot: "C:/repo/app" })).resolves.toEqual({
			cleaned: [],
			killed: [],
			orphanedKilled: [],
			errors: [],
		});
		await expect(registry.get("op-stale")).resolves.toMatchObject({ status: "running" });
	});

	it("ignores records outside the current projectRoot scope", async () => {
		const registry = new InMemoryAccessOperationRegistry();
		await registry.create(baseRecord);
		const service = new AccessOperationPreflightCleanupService({
			registry,
			processInspector: { getProcess: async () => { throw new Error("should not inspect"); } },
			processKiller: { kill: async () => { throw new Error("should not kill"); } },
		});

		await expect(service.cleanup({ accessPath: "C:/data/app.accdb", projectRoot: "C:/repo/other" })).resolves.toEqual({
			cleaned: [],
			killed: [],
			orphanedKilled: [],
			errors: [],
		});
		await expect(registry.get("op-stale")).resolves.toMatchObject({ status: "timed_out" });
	});

	it("records inspector failures without throwing or aborting cleanup", async () => {
		const registry = new InMemoryAccessOperationRegistry();
		await registry.create(baseRecord);
		const service = new AccessOperationPreflightCleanupService({
			registry,
			processInspector: { getProcess: async () => { throw new Error("cim unavailable"); } },
			processKiller: { kill: async () => { throw new Error("should not kill"); } },
		});

		const result = await service.cleanup({ accessPath: "C:/data/app.accdb", projectRoot: "C:/repo/app" });

		expect(result.cleaned).toEqual([]);
		expect(result.killed).toEqual([]);
		expect(result.orphanedKilled).toEqual([]);
		expect(result.errors).toEqual([
			{
				operationId: "op-stale",
				message: "Failed to inspect process 1234: cim unavailable",
			},
		]);
		await expect(registry.get("op-stale")).resolves.toMatchObject({ status: "timed_out" });
	});

	describe("orphan MSACCESS process scanning", () => {
		it("kills an orphan MSACCESS with commandLine containing the same accessPath", async () => {
			const registry = new InMemoryAccessOperationRegistry();
			await registry.create(baseRecord);
			const killed: number[] = [];
			const service = new AccessOperationPreflightCleanupService({
				registry,
				processInspector: { getProcess: async () => undefined },
				processKiller: { kill: async (pid) => { killed.push(pid); } },
				processScanner: {
					listProcesses: async () => [
						{
							pid: 9999,
							name: "MSACCESS.EXE",
							startTime: "2026-05-15T12:00:00.000Z",
							commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
						},
					],
				},
				clock: () => "2026-05-15T10:02:00.000Z",
			});

			const result = await service.cleanup({
				accessPath: "C:/data/app.accdb",
				projectRoot: "C:/repo/app",
			});

			expect(result.orphanedKilled).toEqual([9999]);
			expect(killed).toEqual([9999]);
		});

		it("does NOT kill an orphan MSACCESS for a different accessPath", async () => {
			const registry = new InMemoryAccessOperationRegistry();
			await registry.create({ ...baseRecord, operationId: "op-other", accessPath: "C:/other/app.accdb" });
			const killed: number[] = [];
			const service = new AccessOperationPreflightCleanupService({
				registry,
				processInspector: { getProcess: async () => undefined },
				processKiller: { kill: async (pid) => { killed.push(pid); } },
				processScanner: {
					listProcesses: async () => [
						{
							pid: 9999,
							name: "MSACCESS.EXE",
							startTime: "2026-05-15T12:00:00.000Z",
							commandLine: 'MSACCESS.EXE "C:/other/app.accdb"',
						},
					],
				},
				clock: () => "2026-05-15T10:02:00.000Z",
			});

			const result = await service.cleanup({
				accessPath: "C:/data/app.accdb",
				projectRoot: "C:/repo/app",
			});

			expect(result.orphanedKilled).toEqual([]);
			expect(killed).toEqual([]);
		});

		it("does NOT kill an MSACCESS process with missing commandLine", async () => {
			const registry = new InMemoryAccessOperationRegistry();
			const killed: number[] = [];
			const service = new AccessOperationPreflightCleanupService({
				registry,
				processInspector: { getProcess: async () => undefined },
				processKiller: { kill: async (pid) => { killed.push(pid); } },
				processScanner: {
					listProcesses: async () => [
						{
							pid: 9999,
							name: "MSACCESS.EXE",
							startTime: "2026-05-15T12:00:00.000Z",
							commandLine: undefined,
						},
					],
				},
				clock: () => "2026-05-15T10:02:00.000Z",
			});

			const result = await service.cleanup({
				accessPath: "C:/data/app.accdb",
				projectRoot: "C:/repo/app",
			});

			expect(result.orphanedKilled).toEqual([]);
			expect(killed).toEqual([]);
		});

		it("does NOT kill a non-MSACCESS process even if commandLine matches", async () => {
			const registry = new InMemoryAccessOperationRegistry();
			const killed: number[] = [];
			const service = new AccessOperationPreflightCleanupService({
				registry,
				processInspector: { getProcess: async () => undefined },
				processKiller: { kill: async (pid) => { killed.push(pid); } },
				processScanner: {
					listProcesses: async () => [
						{
							pid: 9999,
							name: "EXCEL.EXE",
							startTime: "2026-05-15T12:00:00.000Z",
							commandLine: 'EXCEL.EXE "C:/data/app.accdb"',
						},
					],
				},
				clock: () => "2026-05-15T10:02:00.000Z",
			});

			const result = await service.cleanup({
				accessPath: "C:/data/app.accdb",
				projectRoot: "C:/repo/app",
			});

			expect(result.orphanedKilled).toEqual([]);
			expect(killed).toEqual([]);
		});

		it("does NOT double-kill a process already handled by a registry record", async () => {
			const registry = new InMemoryAccessOperationRegistry();
			await registry.create({ ...baseRecord, accessPid: 9999, status: "timed_out" });
			const killed: number[] = [];
			const liveProcess: OsProcessInfo = {
				pid: 9999,
				name: "MSACCESS.EXE",
				startTime: "2026-05-15T10:00:00.000Z",
				commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
			};
			const service = new AccessOperationPreflightCleanupService({
				registry,
				processInspector: { getProcess: async () => liveProcess },
				processKiller: { kill: async (pid) => { killed.push(pid); } },
				processScanner: {
					listProcesses: async () => [
						{
							pid: 9999,
							name: "MSACCESS.EXE",
							startTime: "2026-05-15T10:00:00.000Z",
							commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
						},
					],
				},
				clock: () => "2026-05-15T10:02:00.000Z",
			});

			const result = await service.cleanup({
				accessPath: "C:/data/app.accdb",
				projectRoot: "C:/repo/app",
			});

			expect(result.killed).toEqual([9999]);
			expect(result.orphanedKilled).toEqual([]);
			expect(killed).toEqual([9999]);
		});

		it("treats enumeration failure as a warning and does not throw", async () => {
			const registry = new InMemoryAccessOperationRegistry();
			await registry.create({ ...baseRecord, operationId: "op-scanner-err", accessPid: null, processStartTime: null });
			const killed: number[] = [];
			const service = new AccessOperationPreflightCleanupService({
				registry,
				processInspector: { getProcess: async () => undefined },
				processKiller: { kill: async (pid) => { killed.push(pid); } },
				processScanner: {
					listProcesses: async () => {
						throw new Error("WMI query failed");
					},
				},
				clock: () => "2026-05-15T10:02:00.000Z",
			});

			const result = await service.cleanup({
				accessPath: "C:/data/app.accdb",
				projectRoot: "C:/repo/app",
			});

			expect(result.cleaned).toEqual(["op-scanner-err"]);
			expect(result.orphanedKilled).toEqual([]);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					operationId: "orphan_scanner",
					message: expect.stringContaining("WMI query failed"),
				}),
			);
			expect(killed).toEqual([]);
		});

		it("kills MSACCESS for same path in different casing (case-insensitive match)", async () => {
			const registry = new InMemoryAccessOperationRegistry();
			const killed: number[] = [];
			const service = new AccessOperationPreflightCleanupService({
				registry,
				processInspector: { getProcess: async () => undefined },
				processKiller: { kill: async (pid) => { killed.push(pid); } },
				processScanner: {
					listProcesses: async () => [
						{
							pid: 9999,
							name: "MSACCESS.EXE",
							startTime: "2026-05-15T12:00:00.000Z",
							commandLine: 'MSACCESS.EXE "C:/DATA/APP.ACCDB"',
						},
					],
				},
				clock: () => "2026-05-15T10:02:00.000Z",
			});

			const result = await service.cleanup({
				accessPath: "C:/data/app.accdb",
				projectRoot: "C:/repo/app",
			});

			expect(result.orphanedKilled).toEqual([9999]);
			expect(killed).toEqual([9999]);
		});

		it("does not kill MSACCESS for path that is a substring match (e.g. .accdb.bak)", async () => {
			const registry = new InMemoryAccessOperationRegistry();
			const killed: number[] = [];
			const service = new AccessOperationPreflightCleanupService({
				registry,
				processInspector: { getProcess: async () => undefined },
				processKiller: { kill: async (pid) => { killed.push(pid); } },
				processScanner: {
					listProcesses: async () => [
						{
							pid: 9999,
							name: "MSACCESS.EXE",
							startTime: "2026-05-15T12:00:00.000Z",
							commandLine: 'MSACCESS.EXE "C:/data/app.accdb.bak"',
						},
					],
				},
				clock: () => "2026-05-15T10:02:00.000Z",
			});

			const result = await service.cleanup({
				accessPath: "C:/data/app.accdb",
				projectRoot: "C:/repo/app",
			});

			expect(result.orphanedKilled).toEqual([]);
			expect(killed).toEqual([]);
		});

		it("does not kill MSACCESS when commandLine has path as unquoted token", async () => {
			const registry = new InMemoryAccessOperationRegistry();
			const killed: number[] = [];
			const service = new AccessOperationPreflightCleanupService({
				registry,
				processInspector: { getProcess: async () => undefined },
				processKiller: { kill: async (pid) => { killed.push(pid); } },
				processScanner: {
					listProcesses: async () => [
						{
							pid: 9999,
							name: "MSACCESS.EXE",
							startTime: "2026-05-15T12:00:00.000Z",
							commandLine: "MSACCESS.EXE C:/data/app.accdb",
						},
					],
				},
				clock: () => "2026-05-15T10:02:00.000Z",
			});

			const result = await service.cleanup({
				accessPath: "C:/data/app.accdb",
				projectRoot: "C:/repo/app",
			});

			expect(result.orphanedKilled).toEqual([9999]);
			expect(killed).toEqual([9999]);
		});
	});
});
