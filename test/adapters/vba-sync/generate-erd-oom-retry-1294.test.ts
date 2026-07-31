import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  type VbaManagerExecutionResult,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter.js";

const oomExit: VbaManagerExecutionResult = {
  exitCode: 3_762_504_530,
  stdout: "",
  stderr: "Unhandled exception: OutOfMemoryException.",
  durationMs: 28_753,
  timedOut: false,
};

const success: VbaManagerExecutionResult = {
  exitCode: 0,
  stdout: 'DYSFLOW_RESULT {"ok":true,"markdownFile":"C:/fixture/ERD.md"}',
  stderr: "",
  durationMs: 12,
  timedOut: false,
};

async function makeAdapter(results: readonly VbaManagerExecutionResult[]) {
  const root = await mkdtemp(join(tmpdir(), "dysflow-generate-erd-oom-"));
  const accessPath = join(root, "frontend.accdb");
  const backendPath = join(root, "backend.accdb");
  await Promise.all([
    writeFile(accessPath, "fixture", "utf8"),
    writeFile(backendPath, "fixture", "utf8"),
  ]);
  const executor = vi.fn();
  for (const result of results) executor.mockResolvedValueOnce(result);
  const adapter = new VbaSyncAdapter({
    cwd: root,
    accessPath,
    destinationRoot: root,
    env: {},
    executor,
  });
  return { adapter, backendPath, executor };
}

describe("generate_erd transient PowerShell OOM retry (#1294)", () => {
  it("retries once after the verified PowerShell 5.1 DLR out-of-memory exit", async () => {
    const { adapter, backendPath, executor } = await makeAdapter([oomExit, success]);

    const result = await adapter.execute("generate_erd", {
      backendPath,
      erdPath: join(backendPath, "..", "ERD"),
    });

    expect(result.ok).toBe(true);
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it("does not retry an unrelated worker failure", async () => {
    const unrelated = { ...oomExit, exitCode: 73, stderr: "unrelated failure" };
    const { adapter, backendPath, executor } = await makeAdapter([unrelated]);

    const result = await adapter.execute("generate_erd", { backendPath });

    expect(result.ok).toBe(false);
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("keeps a repeated out-of-memory exit as a typed terminal failure", async () => {
    const { adapter, backendPath, executor } = await makeAdapter([oomExit, oomExit]);

    const result = await adapter.execute("generate_erd", { backendPath });

    expect(result).toMatchObject({ ok: false, error: { code: "VBA_MANAGER_UNEXPECTED_EXIT" } });
    expect(executor).toHaveBeenCalledTimes(2);
  });
});
