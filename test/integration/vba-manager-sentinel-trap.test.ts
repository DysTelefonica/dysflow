/**
 * Tests for the top-level trap installed at the top of `dysflow-vba-manager.ps1`.
 * The trap guarantees that any terminating error that escapes the per-action
 * try/catch (validation failure, dot-source error during script load, uncaught
 * .NET exception, etc.) still emits a `DYSFLOW_RESULT <json>` line before
 * the script exits. See issue #484.
 *
 * These tests spawn real `pwsh` so they require PowerShell 7 to be installed
 * and the script to be on disk. They skip on non-Windows where `pwsh` is not
 * available, and skip in CI when the runner is on Linux. The test-runtime
 * install of dysflow is NOT required — the script under `scripts/` is the
 * one being tested.
 */

import { spawn } from "node:child_process";
import { platform } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT_PATH = join(REPO_ROOT, "scripts", "dysflow-vba-manager.ps1");

const HAS_PWSH = platform() === "win32";

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runPwsh(
  args: readonly string[],
  env: Record<string, string | undefined>,
): Promise<SpawnResult> {
  return await new Promise((resolvePromise) => {
    const child = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-File", SCRIPT_PATH, ...args], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (code) => {
      resolvePromise({ stdout, stderr, exitCode: code ?? -1 });
    });
  });
}

function parseDysflowResult(stdout: string): Record<string, unknown> | null {
  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("DYSFLOW_RESULT ")) {
      try {
        return JSON.parse(trimmed.slice("DYSFLOW_RESULT ".length));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const skipReason = HAS_PWSH ? undefined : "pwsh is not available on this platform";

describe.skipIf(skipReason !== undefined)("dysflow-vba-manager.ps1 top-level trap (#484)", () => {
  it("rejects an unknown Action with non-zero exit (parameter binding is pre-script, the trap does not apply there)", async () => {
    // The Action parameter has a strict ValidateSet. PowerShell parameter
    // binding errors fire BEFORE the script body runs, so the top-level
    // trap cannot catch them. We assert only that the script exits non-zero;
    // emitting a DYSFLOW_RESULT for pre-script binding errors is out of scope
    // for the trap (it would require manual validation inside the script body).
    const result = await runPwsh(["-Action", "ThisIsNotAValidAction", "-Json"], {
      ACCESS_VBA_PASSWORD: "irrelevant",
    });
    expect(result.exitCode).not.toBe(0);
  });

  it("emits a DYSFLOW_RESULT sentinel on an Export failure inside the script body", async () => {
    // The Export action requires AccessPath. Passing a non-existent AccessPath
    // makes the runner fail inside the script body. The per-action try/catch
    // or the top-level trap (whichever fires first) MUST emit a sentinel so
    // the dysflow MCP runner can surface the error to the agent.
    const result = await runPwsh(
      [
        "-Action",
        "Export",
        "-AccessPath",
        "C:/__nonexistent__/does-not-exist.accdb",
        "-DestinationRoot",
        "C:/__nonexistent__/dest",
        "-Json",
      ],
      { ACCESS_VBA_PASSWORD: "irrelevant" },
    );
    expect(result.exitCode).not.toBe(0);
    const sentinel = parseDysflowResult(result.stdout);
    expect(
      sentinel,
      `expected a DYSFLOW_RESULT sentinel on Export failure. stdout was: ${result.stdout.slice(0, 500)}`,
    ).not.toBeNull();
    expect(sentinel?.ok).toBe(false);
  });

  it("emits a DYSFLOW_RESULT sentinel on a List-Objects failure (trap exercises the dot-source path)", async () => {
    // The List-Objects action does not require AccessPath but it does require
    // the dot-sourced lib to load cleanly. A path that does not exist on
    // disk for the runtime triggers a different failure mode. We pass a
    // valid -Action and a deliberately bogus -AccessPath; the runner should
    // either fail in the per-action try/catch (preferred) or in the top-level
    // trap. Either way, a sentinel MUST be emitted.
    const result = await runPwsh(
      ["-Action", "List-Objects", "-AccessPath", "C:/__definitely__/__missing__/x.accdb", "-Json"],
      { ACCESS_VBA_PASSWORD: "irrelevant", DYSFLOW_MOCK_COM: "1" },
    );
    expect(result.exitCode).not.toBe(0);
    const sentinel = parseDysflowResult(result.stdout);
    expect(
      sentinel,
      `expected a DYSFLOW_RESULT sentinel on List-Objects failure. stdout was: ${result.stdout.slice(0, 500)}`,
    ).not.toBeNull();
    expect(sentinel?.ok).toBe(false);
  });
});
