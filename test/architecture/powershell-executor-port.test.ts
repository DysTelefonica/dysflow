import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type {
  PowerShellExecutionResult,
  PowerShellExecutor,
  PowerShellExecutorOptions,
} from "../../src/core/contracts/index.js";

function collectTypeScriptFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const fullPath = join(root, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return collectTypeScriptFiles(fullPath);
    return fullPath.endsWith(".ts") ? [fullPath] : [];
  });
}

describe("PowerShellExecutor port boundary", () => {
  it("exports the formal PowerShell executor contract from core contracts", async () => {
    const result: PowerShellExecutionResult = {
      exitCode: 0,
      stdout: "DYSFLOW_RESULT {}",
      stderr: "",
      durationMs: 1,
      timedOut: false,
      accessProcess: {
        pid: 1234,
        processStartTime: "2026-06-11T00:00:00.000Z",
        commandLine: "MSACCESS.EXE C:/demo.accdb",
      },
    };
    const options: PowerShellExecutorOptions = {
      timeoutMs: 1_000,
      operationId: "op-test",
      accessPath: "C:/demo.accdb",
      onAccessProcessCaptured: async () => undefined,
    };
    const executor: PowerShellExecutor = async (_command, _args, receivedOptions) => ({
      ...result,
      durationMs: receivedOptions.timeoutMs,
    });

    expect(options).toMatchObject({ timeoutMs: 1_000, operationId: "op-test" });
    await expect(executor("powershell.exe", ["-NoProfile"], options)).resolves.toMatchObject({
      durationMs: 1_000,
      accessProcess: { pid: 1234 },
    });
  });

  it("keeps concrete PowerShell process ownership outside the core runner", () => {
    const runnerSource = readFileSync(
      join(process.cwd(), "src/core/runner/access-runner.ts"),
      "utf8",
    );

    expect(runnerSource).not.toContain("./powershell-executor.js");
    expect(runnerSource).not.toContain("spawnPowerShellProcess");
    expect(runnerSource).not.toContain("POWERSHELL_EXE");
  });

  it("requires every AccessPowerShellRunner construction site to inject an executor", () => {
    const files = [
      ...collectTypeScriptFiles(join(process.cwd(), "src")),
      ...collectTypeScriptFiles(join(process.cwd(), "test")),
    ];
    const missingExecutor = files.flatMap((file) => {
      if (file.endsWith("powershell-executor-port.test.ts")) return [];
      const source = readFileSync(file, "utf8");
      const lines = source.split("\n");
      return lines.flatMap((line, index) => {
        if (!line.includes("new AccessPowerShellRunner({")) return [];
        const constructorWindow = lines.slice(index, index + 8).join("\n");
        return /\bexecutor\b\s*[:,]/.test(constructorWindow) ? [] : [`${file}:${index + 1}`];
      });
    });

    expect(missingExecutor).toEqual([]);
  });
});
