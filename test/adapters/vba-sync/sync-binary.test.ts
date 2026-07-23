/**
 * Issue #809 - `sync_binary` core compose tests.
 *
 * Exercises the five-step compose logic at the adapter layer:
 *   verify (pre) -> plan -> execute (apply:true only, chunked) -> verify (post) -> recommend
 *
 * The dispatch + route + schema + tool-count tests live in
 * `test/adapters/mcp/sync-binary-tool.test.ts`. This file pins the
 * BEHAVIOR of `runSyncBinary` directly with a mocked VbaModulesAdapter so
 * the contract is stable against any future refactor of the dispatch layer.
 *
 * Acceptance criteria covered here:
 *   AC1: dryRun:true populates plan.toImport without touching binary
 *        (no import_modules / export_modules sub-calls).
 *   AC2: apply:true runs import_modules with toImport chunked by batchSize.
 *   AC3: direction:'binary-to-src' runs export_modules with toExport chunked.
 *   AC4: postSync.missingInBinary=[] && postSync.actionable.total=0
 *        after a successful sync.
 *   AC5: scope.actionableOnly:true (default) excludes nonActionable.
 *   AC6: scope.includeBothChanged:true includes them with
 *        skipped.reason:'bothChanged_acknowledged'.
 *   AC7: ok:false + recommendation:'manual_merge' when sync leaves
 *        residual diffs.
 */
import { describe, expect, it } from "vitest";
import {
  buildSyncBinaryPlan,
  deriveSyncBinaryRecommendation,
  runSyncBinary,
  type SyncBinaryAdapterLike,
  type SyncBinaryFailureResult,
  type SyncBinaryResult,
  type SyncBinarySuccessResult,
  type SyncBinaryVerifyOutcome,
  type SyncVerifySummary,
} from "../../../src/adapters/vba-sync/sync-binary";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeVerifyResult(overrides: Partial<SyncVerifySummary> = {}): SyncVerifySummary {
  return {
    ok: true,
    missingInBinary: [],
    missingInSource: [],
    actionable: { total: 0, sourceNewer: 0, binaryNewer: 0, bothChanged: 0 },
    nonActionable: { total: 0 },
    hasFunctionalDifferences: false,
    recommendedAction: "no_action",
    recommendation: "no_action",
    ...overrides,
  };
}

/**
 * Helper: narrow `result` to the success branch. After `if ("error" in result)`,
 * TypeScript narrows `result` to `SyncBinarySuccessResult`. Callers use this
 * to access `result.plan` / `result.recommendation` etc.
 */
function expectSuccess(result: SyncBinaryResult): asserts result is SyncBinarySuccessResult {
  if ("error" in result) {
    throw new Error(`expected sync_binary success, got failure: ${JSON.stringify(result.error)}`);
  }
}

/**
 * Helper: narrow `result` to the failure branch. Same shape as
 * `expectSuccess` (an assertion function so TypeScript narrows in place).
 */
function expectFailure(result: SyncBinaryResult): asserts result is SyncBinaryFailureResult & {
  error: { code: string; message: string; retryable: boolean };
} {
  if (!("error" in result)) {
    throw new Error("expected sync_binary failure, got success");
  }
}

function makeFakeAdapter(
  opts: {
    preVerify?: SyncBinaryVerifyOutcome;
    postVerify?: SyncBinaryVerifyOutcome;
    failOnImport?: boolean;
    failOnExport?: boolean;
  } = {},
): {
  adapter: SyncBinaryAdapterLike;
  verifyCalls: number;
  importCalls: Array<{ moduleNames: readonly string[] }>;
  exportCalls: Array<{ moduleNames: readonly string[] }>;
} {
  let verifyCalls = 0;
  const importCalls: Array<{ moduleNames: readonly string[] }> = [];
  const exportCalls: Array<{ moduleNames: readonly string[] }> = [];

  const adapter: SyncBinaryAdapterLike = {
    async runVerify() {
      verifyCalls += 1;
      // First call -> pre, second call -> post. Subsequent calls reuse post.
      const summary =
        verifyCalls === 1
          ? (opts.preVerify ?? { ok: true, summary: makeVerifyResult() })
          : (opts.postVerify ?? { ok: true, summary: makeVerifyResult() });
      return summary;
    },
    async runImportModules(params) {
      if (opts.failOnImport) {
        return {
          ok: false,
          error: { code: "VBA_MANAGER_FAILED", message: "import failed", retryable: false },
          diagnostics: [],
          durationMs: 0,
        };
      }
      importCalls.push({ moduleNames: [...params.moduleNames] });
      return {
        ok: true,
        data: {
          ok: true,
          results: params.moduleNames.map((name) => ({ module: name, status: "ok" })),
        },
        diagnostics: [],
        durationMs: 0,
      };
    },
    async runExportModules(params) {
      if (opts.failOnExport) {
        return {
          ok: false,
          error: { code: "VBA_MANAGER_FAILED", message: "export failed", retryable: false },
          diagnostics: [],
          durationMs: 0,
        };
      }
      exportCalls.push({ moduleNames: [...params.moduleNames] });
      return {
        ok: true,
        data: {
          ok: true,
          results: params.moduleNames.map((name) => ({ module: name, status: "ok" })),
        },
        diagnostics: [],
        durationMs: 0,
      };
    },
  };
  return {
    adapter,
    get verifyCalls() {
      return verifyCalls;
    },
    importCalls,
    exportCalls,
  };
}

// ─── 1. Plan-only path (AC1) ────────────────────────────────────────────────

describe("runSyncBinary — plan-only path (AC1)", () => {
  it("dryRun:true (default) populates plan.toImport without dispatching any import/export", async () => {
    const fake = makeFakeAdapter({
      preVerify: {
        ok: true,
        summary: makeVerifyResult({
          missingInBinary: [{ moduleName: "ModA" }, { moduleName: "ModB" }],
          missingInSource: [{ moduleName: "ModC" }],
          actionable: { total: 0, sourceNewer: 0, binaryNewer: 0, bothChanged: 0 },
          hasFunctionalDifferences: true,
          recommendedAction: "import_to_binary",
          recommendation: "Source is ahead",
        }),
      },
    });

    const result = await runSyncBinary({
      adapter: fake.adapter,
      input: { direction: "both", dryRun: true },
    });

    expect(result.ok).toBe(true);
    expectSuccess(result);
    expect(result.dryRun).toBe(true);
    expect(result.plan.toImport).toEqual(["ModA", "ModB"]);
    expect(result.plan.toExport).toEqual(["ModC"]);
    expect(result.execution).toBeNull();
    expect(result.postSync).toBeNull();
    expect(fake.importCalls).toEqual([]);
    expect(fake.exportCalls).toEqual([]);
    // Exactly one verify call (the pre-verify); no post-verify in dryRun.
    expect(fake.verifyCalls).toBe(1);
  });
});

// ─── 2. Apply path: chunked import (AC2) ────────────────────────────────────

describe("runSyncBinary — apply path chunked import (AC2)", () => {
  it("apply:true dispatches import_modules in chunks of batchSize", async () => {
    const fake = makeFakeAdapter({
      preVerify: {
        ok: true,
        summary: makeVerifyResult({
          missingInBinary: [
            { moduleName: "M1" },
            { moduleName: "M2" },
            { moduleName: "M3" },
            { moduleName: "M4" },
            { moduleName: "M5" },
            { moduleName: "M6" },
            { moduleName: "M7" },
          ],
          hasFunctionalDifferences: true,
          recommendedAction: "import_to_binary",
          recommendation: "Source is ahead",
        }),
      },
      postVerify: {
        ok: true,
        summary: makeVerifyResult(),
      },
    });

    const result = await runSyncBinary({
      adapter: fake.adapter,
      input: { direction: "src-to-binary", apply: true, batchSize: 3 },
    });

    expect(result.ok).toBe(true);
    expectSuccess(result);
    expect(result.dryRun).toBe(false);
    expect(result.execution).not.toBeNull();
    // 7 modules / batchSize 3 -> 3 chunks (3 + 3 + 1).
    expect(fake.importCalls).toHaveLength(3);
    expect(fake.importCalls[0]?.moduleNames).toEqual(["M1", "M2", "M3"]);
    expect(fake.importCalls[1]?.moduleNames).toEqual(["M4", "M5", "M6"]);
    expect(fake.importCalls[2]?.moduleNames).toEqual(["M7"]);
    expect(fake.exportCalls).toEqual([]);
    // Pre + post verify -> 2 calls.
    expect(fake.verifyCalls).toBe(2);
  });

  it("apply:true with empty toImport does NOT dispatch any import (no-op)", async () => {
    const fake = makeFakeAdapter({
      preVerify: { ok: true, summary: makeVerifyResult() },
      postVerify: { ok: true, summary: makeVerifyResult() },
    });
    const result = await runSyncBinary({
      adapter: fake.adapter,
      input: { direction: "src-to-binary", apply: true },
    });
    expect(result.ok).toBe(true);
    expectSuccess(result);
    expect(fake.importCalls).toEqual([]);
    // Pre + post still run so the consumer sees the post-verify state.
    expect(fake.verifyCalls).toBe(2);
  });
});

// ─── 3. Apply path: chunked export (AC3) ────────────────────────────────────

describe("runSyncBinary — apply path chunked export (AC3)", () => {
  it("direction:'binary-to-src' dispatches export_modules with toExport chunked", async () => {
    const fake = makeFakeAdapter({
      preVerify: {
        ok: true,
        summary: makeVerifyResult({
          missingInSource: [
            { moduleName: "E1" },
            { moduleName: "E2" },
            { moduleName: "E3" },
            { moduleName: "E4" },
            { moduleName: "E5" },
          ],
          hasFunctionalDifferences: true,
          recommendedAction: "export_to_src",
          recommendation: "Binary is ahead",
        }),
      },
      postVerify: { ok: true, summary: makeVerifyResult() },
    });

    const result = await runSyncBinary({
      adapter: fake.adapter,
      input: { direction: "binary-to-src", apply: true, batchSize: 2 },
    });

    expect(result.ok).toBe(true);
    expectSuccess(result);
    expect(fake.exportCalls).toHaveLength(3);
    expect(fake.exportCalls[0]?.moduleNames).toEqual(["E1", "E2"]);
    expect(fake.exportCalls[1]?.moduleNames).toEqual(["E3", "E4"]);
    expect(fake.exportCalls[2]?.moduleNames).toEqual(["E5"]);
    expect(fake.importCalls).toEqual([]);
  });

  it("executes a one-way binary-to-src conflict when acceptBothChanged:true", async () => {
    const fake = makeFakeAdapter({
      preVerify: {
        ok: true,
        summary: makeVerifyResult({
          actionable: { total: 1, sourceNewer: 0, binaryNewer: 0, bothChanged: 1 },
          bothChangedEntries: [{ moduleName: "Form_X" }],
          hasFunctionalDifferences: true,
          recommendedAction: "manual_merge",
        }),
      },
      postVerify: { ok: true, summary: makeVerifyResult() },
    });

    const result = await runSyncBinary({
      adapter: fake.adapter,
      input: {
        direction: "binary-to-src",
        apply: true,
        acceptBothChanged: true,
      },
    });

    expectSuccess(result);
    expect(result.execution).not.toBeNull();
    expect(result.plan.toExport).toEqual(["Form_X"]);
    expect(result.plan.totalActionable).toBe(1);
    expect(fake.exportCalls).toEqual([{ moduleNames: ["Form_X"] }]);
  });

  it("preserves manual_merge refusal without acceptBothChanged", async () => {
    const conflict = makeVerifyResult({
      actionable: { total: 1, sourceNewer: 0, binaryNewer: 0, bothChanged: 1 },
      bothChangedEntries: [{ moduleName: "Form_X" }],
      hasFunctionalDifferences: true,
      recommendedAction: "manual_merge",
    });
    const fake = makeFakeAdapter({
      preVerify: { ok: true, summary: conflict },
      postVerify: { ok: true, summary: conflict },
    });

    const result = await runSyncBinary({
      adapter: fake.adapter,
      input: { direction: "binary-to-src", apply: true },
    });

    expectSuccess(result);
    expect(result.execution).toBeNull();
    expect(result.plan.totalActionable).toBe(0);
    expect(result.recommendation).toBe("manual_merge");
    expect(fake.exportCalls).toEqual([]);
  });
});

// ─── 4. OK after a clean sync (AC4) ─────────────────────────────────────────

describe("runSyncBinary — ok after successful sync (AC4)", () => {
  it("ok:true when postSync.missingInBinary=[] && postSync.actionable.total=0", async () => {
    const fake = makeFakeAdapter({
      preVerify: {
        ok: true,
        summary: makeVerifyResult({
          missingInBinary: [{ moduleName: "ModA" }],
          hasFunctionalDifferences: true,
          recommendedAction: "import_to_binary",
          recommendation: "Source is ahead",
        }),
      },
      postVerify: {
        ok: true,
        // After sync everything matches; missingIn* + actionable are empty.
        summary: makeVerifyResult(),
      },
    });
    const result = await runSyncBinary({
      adapter: fake.adapter,
      input: { direction: "src-to-binary", apply: true },
    });
    expect(result.ok).toBe(true);
    expectSuccess(result);
    expect(result.postSync?.missingInBinary).toEqual([]);
    expect(result.postSync?.actionable.total).toBe(0);
    expect(result.recommendation).toBe("no_action");
  });
});

// ─── 5. Scope filtering (AC5 + AC6) ─────────────────────────────────────────

describe("runSyncBinary — scope filtering (AC5, AC6)", () => {
  it("scope.actionableOnly:true (default) excludes nonActionable from plan", async () => {
    const fake = makeFakeAdapter({
      preVerify: {
        ok: true,
        summary: makeVerifyResult({
          missingInBinary: [{ moduleName: "ModA" }],
          actionable: { total: 1, sourceNewer: 1, binaryNewer: 0, bothChanged: 0 },
          hasFunctionalDifferences: true,
          recommendedAction: "import_to_binary",
        }),
      },
      postVerify: { ok: true, summary: makeVerifyResult() },
    });

    const result = await runSyncBinary({
      adapter: fake.adapter,
      input: { direction: "src-to-binary", apply: true },
    });

    expect(result.ok).toBe(true);
    expectSuccess(result);
    // Only actionable sourceNewer + missingInBinary -> ModA makes it into toImport.
    expect(result.plan.toImport).toEqual(["ModA"]);
    // nonActionable is captured in plan but NOT in toImport.
    expect(result.plan.skipped).toEqual([]);
  });

  it("scope.includeBothChanged:true includes bothChanged with skipped.reason:'bothChanged_acknowledged'", async () => {
    const fake = makeFakeAdapter({
      preVerify: {
        ok: true,
        summary: makeVerifyResult({
          actionable: { total: 1, sourceNewer: 0, binaryNewer: 0, bothChanged: 1 },
          bothChangedEntries: [{ moduleName: "ConflictMod" }],
          hasFunctionalDifferences: true,
          recommendedAction: "manual_merge",
        }),
      },
      // sync_binary does NOT auto-merge bothChanged entries (they are
      // surfaced in plan.skipped with reason:'bothChanged_acknowledged').
      // The realistic post-verify still shows the unresolved bothChanged.
      postVerify: {
        ok: true,
        summary: makeVerifyResult({
          actionable: { total: 1, sourceNewer: 0, binaryNewer: 0, bothChanged: 1 },
          bothChangedEntries: [{ moduleName: "ConflictMod" }],
          hasFunctionalDifferences: true,
          recommendedAction: "manual_merge",
        }),
      },
    });

    const result = await runSyncBinary({
      adapter: fake.adapter,
      input: {
        direction: "both",
        apply: true,
        scope: { actionableOnly: true, includeBothChanged: true },
      },
    });

    expect(result.ok).toBe(false);
    // success branch: ok=false here means post-sync still has actionable
    // diffs (spec semantics); the workflow itself did not error.
    expectSuccess(result);
    expect(result.plan.skipped).toEqual([
      { moduleName: "ConflictMod", reason: "bothChanged_acknowledged" },
    ]);
    expect(result.plan.toImport).toEqual([]);
    expect(result.plan.toExport).toEqual([]);
    // Recommendation surfaces manual_merge because the post-sync state
    // still has the bothChanged entry that needs human review.
    expect(result.recommendation).toBe("manual_merge");
  });

  it("scope.actionableOnly:true with no other params -> nonActionable excluded", async () => {
    const fake = makeFakeAdapter({
      preVerify: {
        ok: true,
        summary: makeVerifyResult({
          nonActionable: { total: 5 },
          hasFunctionalDifferences: false,
        }),
      },
    });

    const result = await runSyncBinary({
      adapter: fake.adapter,
      input: { direction: "both", dryRun: true },
    });
    expect(result.ok).toBe(true);
    expectSuccess(result);
    expect(result.plan.totalActionable).toBe(0);
    expect(result.plan.toImport).toEqual([]);
    expect(result.plan.toExport).toEqual([]);
  });
});

// ─── 6. Residual diff -> manual_merge (AC7) ──────────────────────────────────

describe("runSyncBinary — residual diff -> manual_merge (AC7)", () => {
  it("ok:false + recommendation:'manual_merge' when post-sync leaves actionable diffs", async () => {
    const fake = makeFakeAdapter({
      preVerify: {
        ok: true,
        summary: makeVerifyResult({
          missingInBinary: [{ moduleName: "ModA" }],
          actionable: { total: 1, sourceNewer: 1, binaryNewer: 0, bothChanged: 0 },
          hasFunctionalDifferences: true,
          recommendedAction: "import_to_binary",
        }),
      },
      postVerify: {
        ok: true,
        summary: makeVerifyResult({
          // Residual: import succeeded but a new bothChanged appeared.
          actionable: { total: 1, sourceNewer: 0, binaryNewer: 0, bothChanged: 1 },
          bothChangedEntries: [{ moduleName: "NewConflict" }],
          hasFunctionalDifferences: true,
          recommendedAction: "manual_merge",
        }),
      },
    });
    const result = await runSyncBinary({
      adapter: fake.adapter,
      input: { direction: "src-to-binary", apply: true },
    });
    expect(result.ok).toBe(false);
    // success branch: ok=false means post-sync leaves residual actionable
    // diffs (manual_merge); the workflow itself completed without error.
    expectSuccess(result);
    expect(result.recommendation).toBe("manual_merge");
    expect(result.postSync?.missingInBinary).toEqual([]);
    // actionable.total is NOT 0 because bothChanged was added.
    expect(result.postSync?.actionable.total).toBe(1);
  });
});

// ─── 7. Direction filtering ────────────────────────────────────────────────

describe("runSyncBinary — direction filter", () => {
  it("direction:'src-to-binary' ignores missingInSource (no export)", async () => {
    const fake = makeFakeAdapter({
      preVerify: {
        ok: true,
        summary: makeVerifyResult({
          missingInBinary: [{ moduleName: "ModA" }],
          missingInSource: [{ moduleName: "ModB" }],
          hasFunctionalDifferences: true,
          recommendedAction: "manual_merge",
        }),
      },
      postVerify: { ok: true, summary: makeVerifyResult() },
    });
    const result = await runSyncBinary({
      adapter: fake.adapter,
      input: { direction: "src-to-binary", apply: true },
    });
    expect(result.ok).toBe(true);
    expectSuccess(result);
    expect(result.plan.toImport).toEqual(["ModA"]);
    expect(result.plan.toExport).toEqual([]);
    expect(fake.importCalls).toHaveLength(1);
    expect(fake.exportCalls).toEqual([]);
  });

  it("direction:'binary-to-src' ignores missingInBinary (no import)", async () => {
    const fake = makeFakeAdapter({
      preVerify: {
        ok: true,
        summary: makeVerifyResult({
          missingInBinary: [{ moduleName: "ModA" }],
          missingInSource: [{ moduleName: "ModB" }],
          hasFunctionalDifferences: true,
          recommendedAction: "manual_merge",
        }),
      },
      postVerify: { ok: true, summary: makeVerifyResult() },
    });
    const result = await runSyncBinary({
      adapter: fake.adapter,
      input: { direction: "binary-to-src", apply: true },
    });
    expect(result.ok).toBe(true);
    expectSuccess(result);
    expect(result.plan.toImport).toEqual([]);
    expect(result.plan.toExport).toEqual(["ModB"]);
    expect(fake.exportCalls).toHaveLength(1);
    expect(fake.importCalls).toEqual([]);
  });
});

// ─── 8. Pre-verify failure is propagated ────────────────────────────────────

describe("runSyncBinary — failure propagation", () => {
  it("propagates pre-verify failure as the call-level error", async () => {
    const adapter: SyncBinaryAdapterLike = {
      async runVerify() {
        return {
          ok: false,
          error: { code: "VBA_MANAGER_TIMEOUT", message: "verify timed out", retryable: true },
        };
      },
      async runImportModules() {
        throw new Error("should not be called");
      },
      async runExportModules() {
        throw new Error("should not be called");
      },
    };
    const result = await runSyncBinary({
      adapter,
      input: { direction: "both", apply: true },
    });
    expect(result.ok).toBe(false);
    expectFailure(result);
    expect(result.error.code).toBe("VBA_MANAGER_TIMEOUT");
  });

  it("propagates post-verify failure as the call-level error (after a successful apply)", async () => {
    const fake = makeFakeAdapter({
      preVerify: {
        ok: true,
        summary: makeVerifyResult({
          missingInBinary: [{ moduleName: "ModA" }],
          hasFunctionalDifferences: true,
          recommendedAction: "import_to_binary",
        }),
      },
      postVerify: {
        ok: false,
        error: { code: "VBA_MANAGER_FAILED", message: "post-verify boom", retryable: false },
      },
    });
    const result = await runSyncBinary({
      adapter: fake.adapter,
      input: { direction: "src-to-binary", apply: true },
    });
    expect(result.ok).toBe(false);
    expectFailure(result);
    expect(result.error.code).toBe("VBA_MANAGER_FAILED");
  });

  it("propagates import chunk failure as the call-level error", async () => {
    const fake = makeFakeAdapter({
      preVerify: {
        ok: true,
        summary: makeVerifyResult({
          missingInBinary: [{ moduleName: "ModA" }],
          hasFunctionalDifferences: true,
          recommendedAction: "import_to_binary",
        }),
      },
      failOnImport: true,
    });
    const result = await runSyncBinary({
      adapter: fake.adapter,
      input: { direction: "src-to-binary", apply: true, onChunkError: "abort" },
    });
    expect(result.ok).toBe(false);
    expectFailure(result);
    expect(result.error.code).toBe("VBA_MANAGER_FAILED");
  });
});

// ─── 9. Pure helpers — buildSyncBinaryPlan + deriveSyncBinaryRecommendation ─

describe("buildSyncBinaryPlan — pure helper", () => {
  it("derives toImport + toExport + skipped from a verify summary, no I/O", () => {
    const plan = buildSyncBinaryPlan({
      summary: makeVerifyResult({
        missingInBinary: [{ moduleName: "A" }, { moduleName: "B" }],
        missingInSource: [{ moduleName: "C" }],
        actionable: { total: 0, sourceNewer: 0, binaryNewer: 0, bothChanged: 1 },
        bothChangedEntries: [{ moduleName: "D" }],
      }),
      direction: "both",
      scope: { actionableOnly: true, includeBothChanged: true },
    });
    expect(plan.toImport).toEqual(["A", "B"]);
    expect(plan.toExport).toEqual(["C"]);
    expect(plan.skipped).toEqual([{ moduleName: "D", reason: "bothChanged_acknowledged" }]);
    expect(plan.totalActionable).toBe(3);
  });

  it("respects direction:'src-to-binary' (drops missingInSource)", () => {
    const plan = buildSyncBinaryPlan({
      summary: makeVerifyResult({
        missingInBinary: [{ moduleName: "A" }],
        missingInSource: [{ moduleName: "B" }],
      }),
      direction: "src-to-binary",
      scope: { actionableOnly: true, includeBothChanged: false },
    });
    expect(plan.toImport).toEqual(["A"]);
    expect(plan.toExport).toEqual([]);
  });
});

describe("deriveSyncBinaryRecommendation — pure helper", () => {
  it("'no_action' when missing buckets are empty and actionable is empty", () => {
    const recommendation = deriveSyncBinaryRecommendation(makeVerifyResult());
    expect(recommendation).toBe("no_action");
  });

  it("'import_to_binary' when only missingInBinary > 0", () => {
    const recommendation = deriveSyncBinaryRecommendation(
      makeVerifyResult({
        missingInBinary: [{ moduleName: "X" }],
        hasFunctionalDifferences: true,
      }),
    );
    expect(recommendation).toBe("import_to_binary");
  });

  it("'export_to_source' when only missingInSource > 0", () => {
    const recommendation = deriveSyncBinaryRecommendation(
      makeVerifyResult({
        missingInSource: [{ moduleName: "X" }],
        hasFunctionalDifferences: true,
      }),
    );
    expect(recommendation).toBe("export_to_source");
  });

  it("'manual_merge' when both missingInBinary > 0 AND missingInSource > 0", () => {
    const recommendation = deriveSyncBinaryRecommendation(
      makeVerifyResult({
        missingInBinary: [{ moduleName: "A" }],
        missingInSource: [{ moduleName: "B" }],
        hasFunctionalDifferences: true,
      }),
    );
    expect(recommendation).toBe("manual_merge");
  });

  it("'manual_merge' when actionable.bothChanged > 0", () => {
    const recommendation = deriveSyncBinaryRecommendation(
      makeVerifyResult({
        actionable: { total: 1, sourceNewer: 0, binaryNewer: 0, bothChanged: 1 },
        bothChangedEntries: [{ moduleName: "Conflict" }],
        hasFunctionalDifferences: true,
      }),
    );
    expect(recommendation).toBe("manual_merge");
  });
});
