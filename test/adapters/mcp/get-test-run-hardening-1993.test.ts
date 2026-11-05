/**
 * #1993 T3c — `get_test_run` tells a run that is gone from a run it could
 * not read for a moment (R3-transient-read-becomes-not-found).
 *
 * A run is started through the real `test_vba` tool with `detach:true` and
 * read through the real `get_test_run` tool. The reader's run store sits on
 * the real Node file system adapter, wrapped so that `state.json` cannot be
 * read for a while, as when the runner replaces it or an antivirus holds it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeTestRunFileSystem } from "../../../src/adapters/test-runs/node-test-run-file-system";
import type { VbaManagerExecutor } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import type { TestRunFileSystemPort } from "../../../src/core/test-runs/test-run-ports";
import { resolveTestRunsRoot, TestRunStore } from "../../../src/core/test-runs/test-run-store";
import {
  callTool,
  DetachedRunHarness,
  PROCEDURES_JSON,
  RUNNER_PID,
  STARTED,
} from "../../_helpers/detached-test-runs-1993";

const DETACH = { proceduresJson: PROCEDURES_JSON, apply: true, detach: true };

let harness: DetachedRunHarness;

beforeEach(() => {
  harness = new DetachedRunHarness();
});

afterEach(() => {
  harness.dispose();
});

const neverEnding: VbaManagerExecutor = () => new Promise(() => undefined);

async function startDetached(): Promise<string> {
  const tools = harness.tools(harness.adapter(neverEnding));
  const started = await callTool(tools, "test_vba", DETACH);
  const operationId = started.structuredContent?.operationId;
  if (typeof operationId !== "string") throw new Error(JSON.stringify(started));
  await harness.store().updateState(operationId, (state) => ({
    ...state,
    runner: { pid: RUNNER_PID, startTime: STARTED },
  }));
  return operationId;
}

/** A reader store whose `state.json` reads fail while `failing()` holds. */
function flakyReaderStore(
  failing: (read: number) => "busy" | "missing" | "ok",
): () => TestRunStore {
  let reads = 0;
  const fileSystem: TestRunFileSystemPort = {
    ...nodeTestRunFileSystem,
    async readText(path) {
      if (path.endsWith("state.json")) {
        reads += 1;
        const mode = failing(reads);
        if (mode === "busy") {
          throw Object.assign(new Error(`EBUSY: resource busy or locked, open '${path}'`), {
            code: "EBUSY",
          });
        }
        if (mode === "missing") return null;
      }
      return nodeTestRunFileSystem.readText(path);
    },
  };
  return () =>
    new TestRunStore({
      runsRoot: resolveTestRunsRoot(harness.root),
      fileSystem,
      processProbe: harness.processes,
    });
}

describe("get_test_run over a state it cannot read (#1993 T3c)", () => {
  it("answers a retryable TEST_RUN_READ_FAILED, not TEST_RUN_NOT_FOUND, while the run's directory exists", async () => {
    const operationId = await startDetached();
    const reader = harness.tools(
      harness.adapter(neverEnding),
      { now: () => 0, sleep: async () => undefined },
      undefined,
      flakyReaderStore(() => "busy"),
    );

    const view = await callTool(reader, "get_test_run", { operationId });

    expect(view.isError).toBe(true);
    expect(view.structuredContent?.error).toMatchObject({
      code: "TEST_RUN_READ_FAILED",
      details: { operationId, retryable: true },
    });
    const error = view.structuredContent?.error as { remediation?: unknown } | undefined;
    expect(String(error?.remediation)).toContain("get_test_run again");
  });

  it("reads through a moment when state.json is missing and returns the run", async () => {
    const operationId = await startDetached();
    const reader = harness.tools(
      harness.adapter(neverEnding),
      { now: () => 0, sleep: async () => undefined },
      undefined,
      flakyReaderStore((read) => (read === 1 ? "missing" : "ok")),
    );

    const view = await callTool(reader, "get_test_run", { operationId });

    expect(view.isError).toBe(false);
    expect(view.structuredContent).toMatchObject({ operationId, status: "running" });
  });

  it("keeps waiting through an unreadable moment and returns the finished run", async () => {
    const operationId = await startDetached();
    const store = harness.store();
    let clock = 0;
    let sleeps = 0;
    const reader = harness.tools(
      harness.adapter(neverEnding),
      {
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
          sleeps += 1;
          if (sleeps === 2) {
            await store.writeResult(operationId, { structuredContent: { passed: 2, failed: 0 } });
            await store.updateState(operationId, (state) => ({
              ...state,
              status: "passed",
              finishedAt: new Date().toISOString(),
            }));
          }
        },
      },
      undefined,
      // The second read (the first poll) fails as the runner replaces the file.
      flakyReaderStore((read) => (read === 2 ? "busy" : "ok")),
    );

    const view = await callTool(reader, "get_test_run", { operationId, wait: 30 });

    expect(view.isError).toBe(false);
    expect(view.structuredContent).toMatchObject({
      status: "passed",
      result: { passed: 2, failed: 0 },
    });
  });
});
