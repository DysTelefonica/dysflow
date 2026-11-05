/**
 * #1993 D2 — the detached runner is spawned so it outlives the MCP server:
 * detached, windowless, logging to runner.log through file descriptors (never
 * pipes), unreferenced, with secrets only in the environment.
 */
import type { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  projectRootForRunDir,
  resolveCliEntryPoint,
  spawnDetachedTestRunner,
} from "../../../src/adapters/test-runs/index";
import { resolveTestRunsRoot } from "../../../src/core/test-runs/test-run-store";

let projectRoot: string;
let runDir: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "dysflow-spawn-runner-"));
  runDir = join(resolveTestRunsRoot(projectRoot), "dysflow-run-1");
  await mkdir(runDir, { recursive: true });
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

function fakeSpawn(pid: number | undefined) {
  const calls: { command: string; args: readonly string[]; options: Record<string, unknown> }[] =
    [];
  let unrefCalls = 0;
  const spawnProcess = ((command: string, args: readonly string[], options: object) => {
    calls.push({ command, args, options: options as Record<string, unknown> });
    return {
      pid,
      on: () => undefined,
      unref: () => {
        unrefCalls += 1;
      },
    };
  }) as unknown as typeof spawn;
  return { spawnProcess, calls, unrefCalls: () => unrefCalls };
}

describe("spawnDetachedTestRunner (#1993 D2)", () => {
  it("starts `node <cli> test-run --run-dir <dir>` detached, logging to runner.log", () => {
    const fake = fakeSpawn(4242);
    const env = { DYSFLOW_ACCESS_PASSWORD: "from-env" };

    const pid = spawnDetachedTestRunner(runDir, env, {
      entryPoint: "C:/runtime/app/dist/cli/index.js",
      spawnProcess: fake.spawnProcess,
    });

    expect(pid).toBe(4242);
    expect(fake.calls).toHaveLength(1);
    const [call] = fake.calls;
    expect(call?.command).toBe(process.execPath);
    expect(call?.args).toEqual([
      "C:/runtime/app/dist/cli/index.js",
      "test-run",
      "--run-dir",
      runDir,
    ]);
    expect(call?.args.join(" ")).not.toContain("from-env");
    expect(call?.options).toMatchObject({
      cwd: projectRoot,
      env,
      detached: true,
      windowsHide: true,
    });
    const stdio = call?.options.stdio as unknown[];
    expect(stdio[0]).toBe("ignore");
    expect(typeof stdio[1]).toBe("number");
    expect(stdio[2]).toBe(stdio[1]);
    expect(fake.unrefCalls()).toBe(1);
  });

  it("reports a runner that got no PID as a failed start", () => {
    const fake = fakeSpawn(undefined);

    expect(() =>
      spawnDetachedTestRunner(runDir, {}, { entryPoint: "x.js", spawnProcess: fake.spawnProcess }),
    ).toThrow(/did not start/);
  });

  it("resolves the project root of a run directory and the built CLI entry", () => {
    expect(projectRootForRunDir(runDir)).toBe(projectRoot);
    expect(resolveCliEntryPoint()).toMatch(/dist[\\/]cli[\\/]index\.js$/);
  });
});
