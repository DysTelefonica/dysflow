import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter.js";
import {
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter.js";
import { successResult } from "../../../src/core/contracts/index.js";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "dysflow-1256-"));
  roots.push(root);
  await mkdir(join(root, ".dysflow"), { recursive: true });
  await mkdir(join(root, "src", "modules"), { recursive: true });
  await writeFile(join(root, "front.accdb"), "", "utf8");
  await writeFile(
    join(root, ".dysflow", "project.json"),
    JSON.stringify({ id: "issue-1256", accessPath: "front.accdb", destinationRoot: "src" }),
    "utf8",
  );
  return root;
}

const runner: VbaManagerExecutor = vi.fn(async () => ({
  exitCode: 0,
  stdout: 'DYSFLOW_RESULT {"ok":true}',
  stderr: "",
  durationMs: 1,
  timedOut: false,
}));

describe("VBA schema/runtime drift regressions (#1256)", () => {
  it("fix_encoding plan reports every inspected source file and BOM drift", async () => {
    const root = await fixture();
    await writeFile(join(root, "src", "modules", "Clean.bas"), "Option Explicit\r\n", "utf8");
    await writeFile(
      join(root, "src", "modules", "Drift.bas"),
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Option Explicit\r\n")]),
    );
    const adapter = new VbaSyncAdapter({
      preflightCleanup: noopPreflightCleanup(),
      cwd: root,
      env: {},
      executor: runner,
    });

    const result = await adapter.execute("fix_encoding", { location: "Src", apply: false });

    expect(result).toMatchObject({
      ok: true,
      data: {
        operation: "fix_encoding",
        filesInspected: ["modules/Clean.bas", "modules/Drift.bas"],
        detectedDrift: [{ file: "modules/Drift.bas", issue: "utf8-bom" }],
      },
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("delete_module plan rejects an explicit missing backendPath", async () => {
    const root = await fixture();
    const adapter = new VbaSyncAdapter({
      preflightCleanup: noopPreflightCleanup(),
      cwd: root,
      env: {},
      executor: runner,
    });
    const missing = join(root, "missing-backend.accdb");

    const result = await adapter.execute("delete_module", {
      backendPath: missing,
      moduleName: "X",
      apply: false,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "FILE_NOT_FOUND", remediation: expect.anything() },
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("generate_erd auto-appends .md when erdPath has no extension", async () => {
    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult({ markdownFile: "C:/repo/ERD.md" }));
    const orchestrator: VbaFormsOrchestrator = {
      executor: vi.fn(),
      env: {},
      cwd: "C:/repo",
      resolveExecutionTarget: vi.fn(),
      validateStrictContext: vi.fn(),
      executeMappedTool,
    };

    const result = await new VbaFormsAdapter(orchestrator).execute("generate_erd", {
      backendPath: "C:/db/backend.accdb",
      erdPath: "C:/repo/ERD",
    });

    expect(result).toMatchObject({ ok: true, data: { markdownFile: "C:/repo/ERD.md" } });
    expect(executeMappedTool).toHaveBeenCalledWith(
      "generate_erd",
      { backendPath: "C:/db/backend.accdb", erdPath: "C:/repo/ERD.md" },
      expect.any(Object),
    );
  });
});
