/**
 * #1993 D2 — the detached runner is started so it outlives the MCP server.
 *
 * On Windows it is created through WMI `Win32_Process.Create`, outside any
 * Job Object of the MCP host, by a PowerShell bootstrap that receives the
 * command line and the environment on its stdin (never argv, never disk).
 * Elsewhere, or when WMI is unavailable, it is spawned: detached, windowless,
 * logging to runner.log through file descriptors (never pipes), unreferenced,
 * with secrets only in the environment.
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
  it("starts `node <cli> test-run --run-dir <dir>` detached, logging to runner.log", async () => {
    const fake = fakeSpawn(4242);
    const env = { DYSFLOW_ACCESS_PASSWORD: "from-env" };

    const launch = await spawnDetachedTestRunner(runDir, env, {
      entryPoint: "C:/runtime/app/dist/cli/index.js",
      spawnProcess: fake.spawnProcess,
      platform: "linux",
    });

    expect(launch).toEqual({ pid: 4242, method: "spawn" });
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
      env: { ...env, DYSFLOW_TEST_RUN_LAUNCH: "spawn" },
      detached: true,
      windowsHide: true,
    });
    const stdio = call?.options.stdio as unknown[];
    expect(stdio[0]).toBe("ignore");
    expect(typeof stdio[1]).toBe("number");
    expect(stdio[2]).toBe(stdio[1]);
    expect(fake.unrefCalls()).toBe(1);
  });

  it("reports a runner that got no PID as a failed start", async () => {
    const fake = fakeSpawn(undefined);

    await expect(
      spawnDetachedTestRunner(
        runDir,
        {},
        { entryPoint: "x.js", spawnProcess: fake.spawnProcess, platform: "linux" },
      ),
    ).rejects.toThrow(/did not start/);
  });

  it("resolves the project root of a run directory and the built CLI entry", () => {
    expect(projectRootForRunDir(runDir)).toBe(projectRoot);
    expect(resolveCliEntryPoint()).toMatch(/dist[\\/]cli[\\/]index\.js$/);
  });
});

type PowerShellCall = { args: readonly string[]; stdin: string };

function fakePowerShell(answer: string | Error) {
  const calls: PowerShellCall[] = [];
  const runPowerShell = async (args: readonly string[], stdin: string) => {
    calls.push({ args, stdin });
    if (answer instanceof Error) throw answer;
    return { exitCode: 0, stdout: answer, stderr: "" };
  };
  return { runPowerShell, calls };
}

/** The bootstrap's stdin: base64 lines of the command line, the directory and each variable. */
function decodeBootstrapInput(stdin: string) {
  const [commandLine, cwd, ...variables] = stdin
    .split(/\n/)
    .filter((line) => line.length > 0)
    .map((line) => Buffer.from(line, "base64").toString("utf8"));
  return { commandLine, cwd, variables };
}

function decodeEncodedCommand(args: readonly string[]): string {
  const index = args.indexOf("-EncodedCommand");
  return Buffer.from(args[index + 1] ?? "", "base64").toString("utf16le");
}

const ENTRY = "C:/runtime/app/dist/cli/index.js";
const COMSPEC = "C:/Windows/System32/cmd.exe";

describe("escaping the MCP host's Job Object on Windows (#1993 R3-job-object-survival)", () => {
  it("creates the runner through WMI with the environment on the bootstrap's stdin only", async () => {
    const fake = fakeSpawn(4242);
    const powershell = fakePowerShell("DYSFLOW_WMI_CREATE 0 5150");
    const env = { DYSFLOW_ACCESS_PASSWORD: "from-env", PATH: "C:/bin" };

    const launch = await spawnDetachedTestRunner(runDir, env, {
      entryPoint: ENTRY,
      spawnProcess: fake.spawnProcess,
      platform: "win32",
      runPowerShell: powershell.runPowerShell,
      comSpec: COMSPEC,
    });

    expect(launch).toEqual({ pid: 5150, method: "wmi" });
    expect(fake.calls).toEqual([]);
    expect(powershell.calls).toHaveLength(1);
    const [call] = powershell.calls;
    expect(call?.args).toContain("-EncodedCommand");
    expect(call?.args.join(" ")).not.toContain("from-env");
    const script = decodeEncodedCommand(call?.args ?? []);
    expect(script).toContain("Win32_Process");
    expect(script).toContain("EnvironmentVariables");
    expect(script).not.toContain("from-env");
    const input = decodeBootstrapInput(call?.stdin ?? "");
    expect(input.commandLine).toBe(
      `"${COMSPEC}" /d /v:off /s /c ""${process.execPath}" "${ENTRY}" test-run --run-dir "${runDir}" >> "${join(runDir, "runner.log")}" 2>&1"`,
    );
    expect(input.cwd).toBe(projectRoot);
    expect(input.variables).toEqual(
      expect.arrayContaining([
        "DYSFLOW_ACCESS_PASSWORD=from-env",
        "PATH=C:/bin",
        "DYSFLOW_TEST_RUN_LAUNCH=wmi",
      ]),
    );
  });

  it("falls back to the detached spawn when WMI refuses to create the runner", async () => {
    const fake = fakeSpawn(4242);
    const powershell = fakePowerShell("DYSFLOW_WMI_CREATE 2 0");

    const launch = await spawnDetachedTestRunner(
      runDir,
      { A: "1" },
      {
        entryPoint: ENTRY,
        spawnProcess: fake.spawnProcess,
        platform: "win32",
        runPowerShell: powershell.runPowerShell,
        comSpec: COMSPEC,
      },
    );

    expect(launch).toMatchObject({ pid: 4242, method: "spawn" });
    expect(launch.fallbackReason).toContain("2");
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.options.env).toEqual({ A: "1", DYSFLOW_TEST_RUN_LAUNCH: "spawn" });
  });

  it("falls back to the detached spawn when the bootstrap cannot run", async () => {
    const fake = fakeSpawn(4242);
    const powershell = fakePowerShell(new Error("spawn powershell.exe ENOENT"));

    const launch = await spawnDetachedTestRunner(
      runDir,
      {},
      {
        entryPoint: ENTRY,
        spawnProcess: fake.spawnProcess,
        platform: "win32",
        runPowerShell: powershell.runPowerShell,
        comSpec: COMSPEC,
      },
    );

    expect(launch).toMatchObject({ pid: 4242, method: "spawn" });
    expect(launch.fallbackReason).toContain("ENOENT");
  });

  it("never routes a path cmd.exe would expand through WMI", async () => {
    const fake = fakeSpawn(4242);
    const powershell = fakePowerShell("DYSFLOW_WMI_CREATE 0 5150");

    const launch = await spawnDetachedTestRunner(
      runDir,
      {},
      {
        entryPoint: "C:/100%PATH%/dist/cli/index.js",
        spawnProcess: fake.spawnProcess,
        platform: "win32",
        runPowerShell: powershell.runPowerShell,
        comSpec: COMSPEC,
      },
    );

    expect(launch).toMatchObject({ pid: 4242, method: "spawn" });
    expect(launch.fallbackReason).toContain("%");
    expect(powershell.calls).toEqual([]);
  });

  it("spawns directly outside Windows", async () => {
    const fake = fakeSpawn(4242);
    const powershell = fakePowerShell("DYSFLOW_WMI_CREATE 0 5150");

    const launch = await spawnDetachedTestRunner(
      runDir,
      {},
      {
        entryPoint: ENTRY,
        spawnProcess: fake.spawnProcess,
        platform: "linux",
        runPowerShell: powershell.runPowerShell,
      },
    );

    expect(launch).toEqual({ pid: 4242, method: "spawn" });
    expect(powershell.calls).toEqual([]);
  });
});
