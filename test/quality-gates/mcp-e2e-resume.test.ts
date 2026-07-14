// @ts-nocheck -- plain ESM helper is exercised as a behavioral port.
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPhaseSnapshots,
  createResultRows,
  createResumeController,
  hashRunIdentity,
  parseResumeArgs,
  readCheckpoint,
  validateCheckpoint,
} from "../../E2E_testing/_helpers/mcp-e2e-resume.mjs";

let root: string;
const controller = (overrides = {}) =>
  createResumeController({
    root,
    identity: "runtime",
    mutatingAreas: new Set(),
    snapshotSandbox: vi.fn(),
    restoreSandbox: vi.fn(),
    ...overrides,
  });
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "dysflow-mcp-e2e-"));
});
describe("MCP E2E resumable cursor", () => {
  it("aborts immediately on a failed semantic row", () => {
    const { rows, addFailFastResult, appendUnchecked } = createResultRows();
    expect(Object.hasOwn(rows, "push")).toBe(false);
    expect(() => addFailFastResult({ pass: false, tool: "shape" })).toThrow(/STOP-ON-FAIL/);
    expect(() => appendUnchecked({ pass: false, tool: "zombie" })).not.toThrow();
  });
  it("refuses resume for release gates", () => {
    expect(() =>
      parseResumeArgs(["--resume", "C:\\tmp\\dysflow-mcp-e2e-1"], {
        DYSFLOW_E2E_RELEASE_GATE: "1",
      }),
    ).toThrow(/fresh full run/);
    expect(() => parseResumeArgs(["--resume", root, "--release"], {})).toThrow(/fresh full run/);
  });
  it("binds identity to runtime, plan, helper, and fixture bytes", async () => {
    const files = ["runtime", "plan", "helper", "fixture"].map((name) => join(root, name));
    await Promise.all(files.map((file) => writeFile(file, "v1")));
    const first = await hashRunIdentity(files);
    await writeFile(files[0], "v2");
    expect(await hashRunIdentity(files)).not.toBe(first);
  });
  it("atomically persists and reuses a passed read-only result", async () => {
    const run = controller();
    const step = await run.before("query", "list_tables");
    await run.pass(step.id, "query", { text: "ok" });
    expect((await readCheckpoint(root)).completed[step.id].result).toEqual({ text: "ok" });
  });
  it("restores and replays only the failed mutating phase", async () => {
    const restore = vi.fn();
    const completed = {
      "query/list_tables#1": { area: "query", result: { text: "cached" } },
      "write/create_table#1": { area: "write", result: { text: "old" } },
    };
    const run = controller({
      resumedCheckpoint: {
        version: 1,
        identity: "runtime",
        sandboxRoot: root,
        inProgress: { id: "write/create_table#1", area: "write", mutating: true },
        completed,
      },
      mutatingAreas: new Set(["write"]),
      restoreSandbox: restore,
    });
    expect((await run.before("query", "list_tables")).cached).toEqual({ text: "cached" });
    expect((await run.before("write", "create_table")).cached).toBeUndefined();
    expect(restore).toHaveBeenCalledOnce();
  });
  it("persists mutating in-progress state before execution", async () => {
    const run = controller({ mutatingAreas: new Set(["write"]) });
    await run.before("write", "create_table");
    expect((await readCheckpoint(root)).inProgress).toMatchObject({
      area: "write",
      mutating: true,
    });
  });
  it("snapshots query writes even after completed query reads", async () => {
    const snapshot = vi.fn();
    const run = controller({
      mutatingAreas: new Set(["query/import_queries"]),
      snapshotSandbox: snapshot,
    });
    const read = await run.before("query", "list_tables");
    await run.pass(read.id, "query", { text: "read" });
    await run.before("query", "import_queries");
    expect(snapshot).toHaveBeenCalledOnce();
  });
  it("persists a spawned PID until verified exit", async () => {
    const run = controller();
    await run.registerOwnedPid(4242);
    expect((await readCheckpoint(root)).ownedPids).toEqual([4242]);
    await run.clearOwnedPid(4242);
    expect((await readCheckpoint(root)).ownedPids).toEqual([]);
  });
  it("publishes a complete phase snapshot atomically and refuses restore escapes", async () => {
    const sandbox = join(root, "sandbox");
    const source = join(sandbox, "fixture.txt");
    await mkdir(sandbox);
    await writeFile(source, "fixture");
    const snapshots = createPhaseSnapshots(sandbox, [source]);
    await snapshots.snapshot("write");
    expect(await readFile(join(snapshots.root, "write", "fixture.txt"), "utf8")).toBe("fixture");
    const outside = join(root, "outside.txt");
    await writeFile(outside, "outside");
    await expect(createPhaseSnapshots(sandbox, [outside]).restore("write")).rejects.toThrow(
      /Unsafe/,
    );
  });
  it("invalidates the producer result after a semantic failure", async () => {
    const run = controller();
    const step = await run.before("query", "list_tables");
    await run.pass(step.id, "query", { text: "stale" });
    await run.fail("assert/query/shape", "query", new Set(), { invalidateLast: true });
    expect(run.state.completed[step.id]).toBeUndefined();
  });
  it.each([
    ["old", false, /identity mismatch/],
    ["runtime", true, /pid=4242 survives/],
  ])("rejects invalid checkpoint identity or survivors", async (identity, alive, error) => {
    await expect(
      validateCheckpoint(
        { version: 1, identity, sandboxRoot: root, ownedPids: [4242] },
        { identity: "runtime", sandboxRoot: root, isOwnedPidAlive: () => alive },
      ),
    ).rejects.toThrow(error);
  });
  it("persists final failure evidence before callers throw", async () => {
    const run = controller();
    await run.fail("zombies/lingering-access-check", "zombies", new Set([4242]));
    expect(await readCheckpoint(root)).toMatchObject({
      failedStepId: "zombies/lingering-access-check",
      ownedPids: [4242],
    });
  });
});
