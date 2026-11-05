/**
 * #1993 T3c — hardening of the detached test-run store after the T2 review.
 *
 * Driven through the store's public surface over a real temporary directory.
 * Only the process probe is faked, plus, where a test needs it, the file
 * system port around the real Node adapter: process liveness and the absence
 * of hard links are I/O the store cannot own.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeTestRunFileSystem } from "../../../src/adapters/test-runs/node-test-run-file-system";
import type {
  ProcessProbeResult,
  RunnerProcessProbe,
  TestRunFileSystemPort,
} from "../../../src/core/test-runs/test-run-ports";
import { TestRunStore } from "../../../src/core/test-runs/test-run-store";

const ACCESS_PATH = "C:\\Projects\\App\\Frontend.accdb";
const STARTED = "2026-11-05T08:00:00.000Z";

class FakeProbe implements RunnerProcessProbe {
  readonly processes = new Map<number, string | null>();

  async inspect(pid: number): Promise<ProcessProbeResult> {
    return this.processes.has(pid)
      ? { alive: true, startTime: this.processes.get(pid) ?? null }
      : { alive: false };
  }
}

let runsRoot: string;
let probe: FakeProbe;
let now: number;
let nextId: number;

function store(
  options: { selfPid?: number; fileSystem?: TestRunFileSystemPort; idPrefix?: string } = {},
): TestRunStore {
  return new TestRunStore({
    runsRoot,
    fileSystem: options.fileSystem ?? nodeTestRunFileSystem,
    processProbe: probe,
    selfPid: options.selfPid ?? 100,
    clock: () => new Date(now),
    createOperationId: () => {
      nextId += 1;
      return `${options.idPrefix ?? "run"}-${String(nextId).padStart(3, "0")}`;
    },
  });
}

async function prepare(target: TestRunStore, accessPath = ACCESS_PATH) {
  return target.prepareRun({
    input: { proceduresJson: "[]", apply: true },
    accessPath,
    plannedTests: ["Test_One", "Test_Two"],
  });
}

const PASSED_RESULT = {
  isError: false,
  structuredContent: {
    mode: "apply",
    passed: 2,
    failed: 0,
    tests: [
      { procedure: "Test_One", ok: true },
      { procedure: "Test_Two", ok: true },
    ],
  },
};

beforeEach(async () => {
  runsRoot = await mkdtemp(join(tmpdir(), "dysflow-test-runs-hardening-"));
  probe = new FakeProbe();
  probe.processes.set(100, STARTED);
  now = Date.parse("2026-11-05T09:00:00.000Z");
  nextId = 0;
});

afterEach(async () => {
  await rm(runsRoot, { recursive: true, force: true });
});

describe("a holder whose start time is unknown (R4-null-start-time-pins-lock)", () => {
  async function runnerWithUnknownStartTime(target: TestRunStore) {
    const prepared = await prepare(target);
    if (!prepared.ok) throw new Error(prepared.error.message);
    probe.processes.set(500, null);
    await target.updateState(prepared.operationId, (state) => ({
      ...state,
      runner: { pid: 500, startTime: null },
    }));
    const adopted = await target.acquireLock(ACCESS_PATH, {
      operationId: prepared.operationId,
      pid: 500,
      startTime: null,
    });
    expect(adopted.ok).toBe(true);
    return prepared.operationId;
  }

  it("stays live while its run keeps a fresh heartbeat", async () => {
    const target = store();
    const operationId = await runnerWithUnknownStartTime(target);

    now += 50_000;
    await target.updateState(operationId, (state) => state);
    now += 50_000;

    await expect(target.getActiveDetachedRun(ACCESS_PATH)).resolves.toMatchObject({
      operationId,
    });
    await expect(target.readTestRun(operationId)).resolves.toMatchObject({ status: "running" });
  });

  it("goes stale once the heartbeat stops, even while the PID still exists", async () => {
    const target = store();
    const operationId = await runnerWithUnknownStartTime(target);

    // PID 500 still exists (it may be recycled), but the run stopped beating.
    now += 61_000;

    await expect(target.getActiveDetachedRun(ACCESS_PATH)).resolves.toBeUndefined();
    const view = await target.readTestRun(operationId);
    expect(view?.status).toBe("crashed");
    expect(view?.crash?.reason).toContain("heartbeat");
    await expect(prepare(target)).resolves.toMatchObject({ ok: true });
  });
});

describe("single-winner lock acquisition (R3-stale-takeover-race, R4-exclusive-create-fallback-race)", () => {
  it("lets exactly one of several concurrent acquirers take over a stale lock", async () => {
    for (let round = 0; round < 15; round += 1) {
      const accessPath = `C:\\Projects\\App\\Round${round}.accdb`;
      // The holder (pid 900) is dead: its lock is stale.
      const stale = await prepare(store({ selfPid: 900, idPrefix: `stale${round}` }), accessPath);
      expect(stale.ok).toBe(true);

      const attempts = await Promise.all(
        ["a", "b", "c", "d"].map((prefix) =>
          prepare(store({ idPrefix: `${prefix}${round}` }), accessPath),
        ),
      );

      const winners = attempts.filter((attempt) => attempt.ok);
      expect(winners).toHaveLength(1);
      const winner = winners[0];
      if (winner === undefined || !winner.ok) throw new Error("no winner");
      await expect(store().getActiveDetachedRun(accessPath)).resolves.toMatchObject({
        operationId: winner.operationId,
      });
      for (const loser of attempts.filter((attempt) => !attempt.ok)) {
        expect(loser).toMatchObject({
          ok: false,
          error: {
            code: "TEST_RUN_ALREADY_ACTIVE",
            details: { activeOperationId: winner.operationId },
          },
        });
      }
    }
  });

  it("never takes over a lock that an acquirer without hard links is still writing", async () => {
    // The exclusive-create fallback creates the lock empty, then fills it.
    let fill: () => void = () => undefined;
    const filled = new Promise<void>((resolve) => {
      fill = resolve;
    });
    let created: () => void = () => undefined;
    const createdEmpty = new Promise<void>((resolve) => {
      created = resolve;
    });
    const withoutHardLinks: TestRunFileSystemPort = {
      ...nodeTestRunFileSystem,
      async createExclusive(path, text) {
        try {
          await writeFile(path, "", { encoding: "utf8", flag: "wx" });
        } catch (err) {
          if ((err as { code?: string }).code === "EEXIST") return false;
          throw err;
        }
        created();
        await filled;
        await writeFile(path, text, "utf8");
        return true;
      },
    };

    const first = prepare(store({ fileSystem: withoutHardLinks, idPrefix: "first" }));
    await createdEmpty;
    const second = prepare(store({ idPrefix: "second" }));
    await new Promise((resolve) => setTimeout(resolve, 40));
    fill();

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toMatchObject({ ok: true });
    expect(secondResult).toMatchObject({
      ok: false,
      error: { code: "TEST_RUN_ALREADY_ACTIVE", details: { activeOperationId: "first-001" } },
    });
    await expect(store().getActiveDetachedRun(ACCESS_PATH)).resolves.toMatchObject({
      operationId: "first-001",
    });
  });
});

describe("retention never blocks a run (R4-prune-failure-blocks-accesspath)", () => {
  it("starts the run and keeps its lock when pruning old runs fails", async () => {
    const pruneFails: TestRunFileSystemPort = {
      ...nodeTestRunFileSystem,
      listDirectories: async () => {
        throw Object.assign(new Error("EPERM: operation not permitted, scandir"), {
          code: "EPERM",
        });
      },
    };

    const prepared = await prepare(store({ fileSystem: pruneFails }));

    expect(prepared).toMatchObject({ ok: true, operationId: "run-001", prunedOperationIds: [] });
    await expect(store().getActiveDetachedRun(ACCESS_PATH)).resolves.toMatchObject({
      operationId: "run-001",
    });
  });
});

describe("abandoning a run ends it once (R3-double-abandon-on-sync-spawn-failure)", () => {
  it("leaves a run that already ended untouched", async () => {
    const target = store();
    const prepared = await prepare(target);
    if (!prepared.ok) throw new Error(prepared.error.message);
    await target.abandonRun(prepared.operationId, { code: "FIRST", message: "first end" });
    const before = await readFile(join(runsRoot, prepared.operationId, "state.json"), "utf8");
    now += 5_000;

    await target.abandonRun(prepared.operationId, { code: "SECOND", message: "second end" });

    expect(await readFile(join(runsRoot, prepared.operationId, "state.json"), "utf8")).toBe(before);
    await expect(target.readTestRun(prepared.operationId)).resolves.toMatchObject({
      status: "crashed",
      error: { code: "FIRST", message: "first end" },
    });
  });
});

describe("a stored result outlives a lost terminal write (R4-terminal-write-failure-hides-result)", () => {
  it("reads the stored result when the runner died before marking the run terminal", async () => {
    const target = store();
    const prepared = await prepare(target);
    if (!prepared.ok) throw new Error(prepared.error.message);
    await target.updateState(prepared.operationId, (state) => ({
      ...state,
      runner: { pid: 500, startTime: STARTED },
    }));
    await target.writeResult(prepared.operationId, PASSED_RESULT);
    // Runner 500 is not alive: it died between result.json and the terminal state.

    const view = await target.readTestRun(prepared.operationId);

    expect(view).toMatchObject({
      status: "passed",
      result: PASSED_RESULT,
      progress: { completed: 2, planned: 2, passed: 2, failed: 0, currentTest: null },
    });
    expect(view?.crash).toBeUndefined();
    await expect(target.getActiveDetachedRun(ACCESS_PATH)).resolves.toBeUndefined();
  });

  it("keeps a run whose runner is alive running even when result.json already exists", async () => {
    const target = store();
    const prepared = await prepare(target);
    if (!prepared.ok) throw new Error(prepared.error.message);
    probe.processes.set(500, STARTED);
    await target.updateState(prepared.operationId, (state) => ({
      ...state,
      runner: { pid: 500, startTime: STARTED },
    }));
    await target.writeResult(prepared.operationId, PASSED_RESULT);

    await expect(target.readTestRun(prepared.operationId)).resolves.toMatchObject({
      status: "running",
    });
  });
});
