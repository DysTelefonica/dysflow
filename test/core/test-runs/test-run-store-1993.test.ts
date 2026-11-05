/**
 * #1993 — the detached test-run store: per-accessPath lock (D3), crash
 * derivation (D5), retention (D6) and the secret-free request (D1/D2).
 *
 * Driven through the store's public surface over a real temporary directory;
 * only the process probe is faked, because process liveness is the I/O the
 * store cannot own.
 */
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeTestRunFileSystem } from "../../../src/adapters/test-runs/node-test-run-file-system";
import type {
  ProcessProbeResult,
  RunnerProcessProbe,
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

function store(options: { selfPid?: number; retention?: number } = {}): TestRunStore {
  return new TestRunStore({
    runsRoot,
    fileSystem: nodeTestRunFileSystem,
    processProbe: probe,
    selfPid: options.selfPid ?? 100,
    clock: () => new Date(now),
    createOperationId: () => {
      nextId += 1;
      return `run-${String(nextId).padStart(3, "0")}`;
    },
    ...(options.retention === undefined ? {} : { retention: options.retention }),
  });
}

async function prepare(target: TestRunStore, accessPath = ACCESS_PATH, input = {}) {
  const prepared = await target.prepareRun({
    input: { proceduresJson: "[]", apply: true, ...input },
    accessPath,
    plannedTests: ["Test_One", "Test_Two"],
  });
  now += 1_000;
  return prepared;
}

beforeEach(async () => {
  runsRoot = await mkdtemp(join(tmpdir(), "dysflow-test-runs-"));
  probe = new FakeProbe();
  probe.processes.set(100, STARTED);
  now = Date.parse("2026-11-05T09:00:00.000Z");
  nextId = 0;
});

afterEach(async () => {
  await rm(runsRoot, { recursive: true, force: true });
});

describe("per-accessPath lock (#1993 D3)", () => {
  it("acquires the lock for a new run and reports it as the active run", async () => {
    const target = store();
    const prepared = await prepare(target);

    expect(prepared).toMatchObject({ ok: true, operationId: "run-001" });
    await expect(target.getActiveDetachedRun(ACCESS_PATH)).resolves.toMatchObject({
      operationId: "run-001",
      pid: 100,
      startTime: STARTED,
    });
  });

  it("refuses a second run on the same accessPath while the first is live", async () => {
    const target = store();
    await prepare(target);

    // Same database, spelled with another case and separator.
    const second = await prepare(target, "c:/projects/app/FRONTEND.accdb");

    expect(second).toMatchObject({
      ok: false,
      error: {
        code: "TEST_RUN_ALREADY_ACTIVE",
        retryable: true,
        details: { activeOperationId: "run-001" },
      },
    });
    expect(await readdir(runsRoot)).not.toContain("run-002");
    await expect(target.getActiveDetachedRun(ACCESS_PATH)).resolves.toMatchObject({
      operationId: "run-001",
    });
  });

  it("lets a run on another accessPath start alongside", async () => {
    const target = store();
    await prepare(target);

    await expect(prepare(target, "C:\\Projects\\Other.accdb")).resolves.toMatchObject({
      ok: true,
    });
  });

  it("takes over a lock whose holder process died", async () => {
    await prepare(store({ selfPid: 200 }));
    // pid 200 was never alive in the probe: the holder is gone.

    const second = await prepare(store());

    expect(second).toMatchObject({ ok: true, operationId: "run-002" });
    await expect(store().getActiveDetachedRun(ACCESS_PATH)).resolves.toMatchObject({
      operationId: "run-002",
    });
  });

  it("takes over a lock whose PID was recycled by another process", async () => {
    probe.processes.set(300, STARTED);
    await prepare(store({ selfPid: 300 }));
    probe.processes.set(300, "2026-11-05T10:30:00.000Z");

    const second = await prepare(store());

    expect(second).toMatchObject({ ok: true, operationId: "run-002" });
  });

  it("lets the run that holds the lock re-take it under the runner's identity", async () => {
    const target = store();
    await prepare(target);
    probe.processes.set(400, "2026-11-05T09:00:05.000Z");

    const adopted = await target.acquireLock(ACCESS_PATH, {
      operationId: "run-001",
      pid: 400,
      startTime: "2026-11-05T09:00:05.000Z",
    });

    expect(adopted.ok).toBe(true);
    await expect(target.getActiveDetachedRun(ACCESS_PATH)).resolves.toMatchObject({
      operationId: "run-001",
      pid: 400,
    });
  });

  it("frees the accessPath once the run is released", async () => {
    const target = store();
    await prepare(target);

    await target.releaseLock(ACCESS_PATH, "run-001");

    await expect(target.getActiveDetachedRun(ACCESS_PATH)).resolves.toBeUndefined();
    await expect(prepare(target)).resolves.toMatchObject({ ok: true });
  });

  it("does not report a run that already finished as active", async () => {
    const target = store();
    await prepare(target);
    await target.updateState("run-001", (state) => ({ ...state, status: "passed" }));

    await expect(target.getActiveDetachedRun(ACCESS_PATH)).resolves.toBeUndefined();
  });
});

describe("crash derivation (#1993 D5)", () => {
  it("reads a running run whose runner died as crashed, with progress and the log tail", async () => {
    const target = store();
    await prepare(target);
    await target.updateState("run-001", (state) => ({
      ...state,
      runner: { pid: 500, startTime: STARTED },
      progress: { completed: 1, planned: 2, currentTest: "Test_Two", passed: 1, failed: 0 },
    }));
    const lines = Array.from({ length: 50 }, (_, index) => `log line ${index + 1}`);
    await writeFile(join(runsRoot, "run-001", "runner.log"), `${lines.join("\n")}\n`);

    const view = await target.readTestRun("run-001");

    expect(view).toMatchObject({
      status: "crashed",
      progress: { completed: 1, planned: 2, currentTest: "Test_Two", passed: 1, failed: 0 },
    });
    expect(view?.crash?.reason).toContain("500");
    expect(view?.crash?.logTail).toEqual(lines.slice(-40));
  });

  it("reads a runner whose PID was recycled as crashed", async () => {
    const target = store();
    await prepare(target);
    probe.processes.set(500, "2026-11-05T11:00:00.000Z");
    await target.updateState("run-001", (state) => ({
      ...state,
      runner: { pid: 500, startTime: STARTED },
    }));

    await expect(target.readTestRun("run-001")).resolves.toMatchObject({ status: "crashed" });
  });

  it("keeps a run whose runner is alive as running, with no crash", async () => {
    const target = store();
    await prepare(target);
    probe.processes.set(500, STARTED);
    await target.updateState("run-001", (state) => ({
      ...state,
      runner: { pid: 500, startTime: STARTED },
    }));

    const view = await target.readTestRun("run-001");

    expect(view?.status).toBe("running");
    expect(view?.crash).toBeUndefined();
  });

  it("reads a run whose runner never started as crashed once the grace period ends", async () => {
    const target = store();
    await prepare(target);

    await expect(target.readTestRun("run-001")).resolves.toMatchObject({ status: "running" });
    now += 61_000;
    await expect(target.readTestRun("run-001")).resolves.toMatchObject({ status: "crashed" });
  });

  it("refuses an operation id that is not a plain directory name", async () => {
    await expect(store().readTestRun("..\\..\\etc")).resolves.toBeUndefined();
  });
});

describe("retention (#1993 D6)", () => {
  it("keeps the newest 20 runs and never prunes one that is still running", async () => {
    const target = store();
    // The oldest run stays live on its own database.
    await prepare(target, "C:\\Projects\\Live.accdb");
    for (let index = 0; index < 24; index += 1) {
      const prepared = await prepare(target);
      if (!prepared.ok) throw new Error(prepared.error.message);
      await target.abandonRun(prepared.operationId, { code: "TEST", message: "done" });
    }

    const remaining = (await readdir(runsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(remaining).toEqual([
      "run-001",
      ...Array.from({ length: 20 }, (_, index) => `run-${String(index + 6).padStart(3, "0")}`),
    ]);
  });
});

describe("request.json (#1993 D1)", () => {
  it("never stores a password", async () => {
    const target = store();
    await prepare(target, ACCESS_PATH, {
      accessPassword: "s3cret-access",
      password: "s3cret-alias",
      nested: { backendPassword: "s3cret-backend" },
      passwordEnv: "MY_PASSWORD_VARIABLE",
    });

    const text = await readFile(join(runsRoot, "run-001", "request.json"), "utf8");

    expect(text).not.toContain("s3cret");
    expect(JSON.parse(text)).toMatchObject({
      operationId: "run-001",
      accessPath: ACCESS_PATH,
      plannedTests: ["Test_One", "Test_Two"],
      input: { proceduresJson: "[]", apply: true, passwordEnv: "MY_PASSWORD_VARIABLE" },
    });
  });
});
