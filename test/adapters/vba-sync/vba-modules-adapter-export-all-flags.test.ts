/**
 * Issue #757 (C1) — unify write-side commit flags to `apply:true` on
 * `export_all` (and the rest of the export_* family).
 *
 * Before #757: `export_all(diff:true)` was refused outright with
 * `DIFF_MODE_REQUIRES_VERIFY_CODE` (#802). The caller had no in-tool
 * way to express "commit this export" — running `export_all({})` simply
 * wrote because the default-write behavior predates the gate.
 *
 * After #757:
 *   - `apply:true` is the new commit signal (joined the apply family).
 *   - `apply:false` / omitted + the default-write behavior is preserved
 *     (legacy orchestrator briefs that omit `apply` keep writing).
 *   - `diff:true` is preserved as the historical no-write alias but is
 *     now DEPRECATED — when exercised the adapter keeps the call as a
 *     no-write run and surfaces `metadata.deprecated` on the response
 *     envelope so the consumer knows to migrate.
 *
 * The shape of the metadata is:
 *   { metadata: { deprecated: { flag: "diff", since: "v2.9.0", use: "apply" } } }
 *
 * Tests pin the contract from the OUTSIDE of `VbaModulesAdapter.execute`,
 * reusing the orchestrator-shape spy pattern from
 * `vba-modules-adapter-diff-flag.test.ts`.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VbaModulesOrchestrator } from "../../../src/adapters/vba-sync/vba-modules-adapter";
import { VbaModulesAdapter } from "../../../src/adapters/vba-sync/vba-modules-adapter";
import type { OperationResult } from "../../../src/core/contracts/index.js";
import type { AccessOperationPreflightCleanupResult } from "../../../src/core/operations/access-operation-preflight.js";

function buildAdapterWithSpy(): {
  adapter: VbaModulesAdapter;
  executeCalls: Array<{ toolName: string; params: Record<string, unknown> }>;
  resolveCalls: number;
} {
  const executeCalls: Array<{ toolName: string; params: Record<string, unknown> }> = [];
  let resolveCalls = 0;

  const orchestrator: VbaModulesOrchestrator = {
    scriptPath: "scripts/dysflow-vba-manager.ps1",
    cwd: "C:/repo",
    env: {},
    executor: async () => ({
      exitCode: 0,
      stdout: 'DYSFLOW_RESULT {"ok":true,"exported":[]}',
      stderr: "",
      durationMs: 1,
      timedOut: false,
    }),
    resolveExecutionTarget: async () => {
      resolveCalls += 1;
      return {
        ok: true,
        data: {
          configSource: "explicit-request",
          accessDbPath: "C:/db/front.accdb",
          accessPath: "C:/db/front.accdb",
          destinationRoot: "C:/repo/src",
          projectRoot: "C:/repo",
        },
        diagnostics: [],
        durationMs: 0,
      };
    },
    validateStrictContext: () => ({
      ok: true,
      data: undefined,
      diagnostics: [],
      durationMs: 0,
    }),
    runPreflightCleanup: async () =>
      ({
        cleaned: [],
        killed: [],
        orphanedKilled: [],
        errors: [],
      }) satisfies AccessOperationPreflightCleanupResult,
    executeMappedTool: async (toolName, params) => {
      executeCalls.push({ toolName, params: { ...params } });
      return {
        ok: true,
        data: { ok: true, exported: [], pruned: [] },
        diagnostics: [],
        durationMs: 0,
      };
    },
  };

  const adapter = new VbaModulesAdapter(orchestrator, {
    mkdtemp: async () => "C:/repo",
    readdir: async () => [],
    readFile: async () => "",
    readFileBytes: async () => new Uint8Array(),
    rm: async () => undefined,
    tmpdir: () => "/tmp",
  });

  return { adapter, executeCalls, resolveCalls };
}

describe("VbaModulesAdapter — export_all apply flag unification (#757 C1)", () => {
  it("export_all({}) with no flags keeps the legacy default-write behavior (write still happens)", async () => {
    const { adapter, executeCalls } = buildAdapterWithSpy();
    const result = await adapter.execute("export_all", {
      destinationRoot: "C:/repo/src",
      projectId: "test",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success, got failure");
    // Default-write is preserved: the runner IS invoked.
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0]?.toolName).toBe("export_all");
  });

  it("export_all({apply:true}) commits (writes) — same behavior as the legacy default-write", async () => {
    const { adapter, executeCalls } = buildAdapterWithSpy();
    const result = await adapter.execute("export_all", {
      apply: true,
      destinationRoot: "C:/repo/src",
      projectId: "test",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success, got failure");
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0]?.toolName).toBe("export_all");
    // The runner call must NOT carry a readOnly marker — apply:true
    // means "commit".
    expect(executeCalls[0]?.params.readOnly).toBeUndefined();
  });

  it("export_all({diff:true}) no longer errors with DIFF_MODE_REQUIRES_VERIFY_CODE (#757 unification)", async () => {
    const { adapter, executeCalls } = buildAdapterWithSpy();
    const result = await adapter.execute("export_all", {
      diff: true,
      destinationRoot: "C:/repo/src",
      projectId: "test",
    });

    // The new contract: diff:true is honored as the legacy alias — it
    // surfaces a deprecation warning and routes through a no-write
    // mapping. It does NOT raise the old typed refusal.
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
    // The no-write mapping must REACH the runner (with `readOnly:true`)
    // so the consumer can still audit what WOULD have been written.
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0]?.params.readOnly).toBe(true);
  });

  it("export_all({diff:true}) response carries metadata.deprecated = { flag: 'diff', since, use: 'apply' }", async () => {
    const { adapter } = buildAdapterWithSpy();
    const result = await adapter.execute("export_all", {
      diff: true,
      destinationRoot: "C:/repo/src",
      projectId: "test",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    // The deprecation note lives on the diagnostics surface so an AI
    // consumer can read it from the same envelope it already
    // serializes.
    const metadata = result.metadata as
      | { deprecated?: { flag?: string; since?: string; use?: string } }
      | undefined;
    expect(metadata?.deprecated).toBeDefined();
    expect(metadata?.deprecated?.flag).toBe("diff");
    expect(metadata?.deprecated?.use).toBe("apply");
    // The `since` field is a version string — shape-stable, value
    // pinned to the runtime version at merge time.
    expect(metadata?.deprecated?.since).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it("export_all({apply:true,diff:true}) commits (apply wins over the deprecated diff alias)", async () => {
    const { adapter, executeCalls } = buildAdapterWithSpy();
    const result = await adapter.execute("export_all", {
      apply: true,
      diff: true,
      destinationRoot: "C:/repo/src",
      projectId: "test",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(executeCalls).toHaveLength(1);
    // apply:true overrides diff:true — runner is called WITHOUT
    // readOnly, i.e. the call commits.
    expect(executeCalls[0]?.params.readOnly).toBeUndefined();
    // The deprecation note is still surfaced because the caller
    // exercised the legacy flag — apply winning doesn't suppress the
    // migration hint.
    const metadata = result.metadata as { deprecated?: { flag?: string } } | undefined;
    expect(metadata?.deprecated?.flag).toBe("diff");
  });

  it("export_all without diff:true does NOT emit metadata.deprecated", async () => {
    const { adapter } = buildAdapterWithSpy();
    const result = await adapter.execute("export_all", {
      apply: true,
      destinationRoot: "C:/repo/src",
      projectId: "test",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    // C1 invariant: no deprecation metadata without the legacy flag.
    const metadata = result.metadata as { deprecated?: unknown } | undefined;
    expect(metadata?.deprecated).toBeUndefined();
  });
});

describe("VbaModulesAdapter — binary isolation (#1065)", () => {
  it("exports from a disposable copy by default and reports binaryMutated:false", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dysflow-1065-test-"));
    const accessPath = join(directory, "front.accdb");
    await writeFile(accessPath, "original");
    const seenPaths: string[] = [];
    const orchestrator = buildAdapterWithSpy();
    const base = (orchestrator.adapter as unknown as { orchestrator: VbaModulesOrchestrator })
      .orchestrator;
    base.resolveExecutionTarget = async () => ({
      ok: true,
      data: {
        configSource: "explicit-request",
        accessDbPath: accessPath,
        accessPath,
        destinationRoot: directory,
        projectRoot: directory,
      },
      diagnostics: [],
      durationMs: 0,
    });
    base.executeMappedTool = async (_toolName, params) => {
      const executedPath = String(params.accessPath ?? accessPath);
      seenPaths.push(executedPath);
      await writeFile(executedPath, "mutated-by-access");
      return {
        ok: true,
        data: { ok: true, exported: [] },
        diagnostics: [],
        durationMs: 0,
      };
    };

    try {
      const result = await orchestrator.adapter.execute("export_modules", {
        moduleNames: ["Form_X"],
        apply: true,
      });
      expect(result.ok).toBe(true);
      expect(result.ok && result.data).toMatchObject({ binaryMutated: false });
      expect(seenPaths[0]).not.toBe(accessPath);
      expect(await readFile(accessPath, "utf8")).toBe("original");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("mutateBinary:true preserves the legacy direct-binary path", async () => {
    const { adapter, executeCalls } = buildAdapterWithSpy();
    const result = await adapter.execute("export_modules", {
      moduleNames: ["Form_X"],
      apply: true,
      mutateBinary: true,
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.data).toMatchObject({ binaryMutated: true });
    expect(executeCalls[0]?.params.accessPath).toBeUndefined();
  });
});

describe("VbaModulesAdapter — export_modules join the apply family (#757 C1)", () => {
  it("export_modules({apply:true}) commits; runner invoked without readOnly", async () => {
    const { adapter, executeCalls } = buildAdapterWithSpy();
    const result = await adapter.execute("export_modules", {
      apply: true,
      moduleNames: ["Module_Foo"],
      destinationRoot: "C:/repo/src",
      projectId: "test",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0]?.toolName).toBe("export_modules");
    expect(executeCalls[0]?.params.readOnly).toBeUndefined();
  });

  it("export_modules({diff:true}) routes as a no-write mapping (readOnly:true) and emits the deprecation note", async () => {
    const { adapter, executeCalls } = buildAdapterWithSpy();
    const result: OperationResult<unknown> = await adapter.execute("export_modules", {
      diff: true,
      moduleNames: ["Module_Foo"],
      destinationRoot: "C:/repo/src",
      projectId: "test",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0]?.params.readOnly).toBe(true);
    const metadata = result.metadata as
      | { deprecated?: { flag?: string; use?: string } }
      | undefined;
    expect(metadata?.deprecated?.flag).toBe("diff");
    expect(metadata?.deprecated?.use).toBe("apply");
  });
});
