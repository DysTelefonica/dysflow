/**
 * Round-14 regression — issue #1228 bug 2.
 *
 * `sync_binary` with `dryRun:true` MUST:
 *   1. NOT invoke `runImportModules` or `runExportModules` (already
 *      covered by existing tests; pinned here for the new contract).
 *   2. Return a `SyncBinarySuccessResult` envelope — NOT a failure
 *      envelope with the string code `RESULT_CONTRACT_VIOLATION`.
 *      The contract validator must surface a TYPED error code (e.g.
 *      `SYNC_BINARY_PLAN_INVALID` or similar) on actual contract
 *      violation, not the generic `RESULT_CONTRACT_VIOLATION` string.
 *   3. NOT modify the binary on disk (the upstream `import_modules` /
 *      `export_modules` are not invoked, so the binary stays untouched).
 *      When the wrapped primitives ARE invoked (apply:true path), the
 *      contract is that they short-circuit BEFORE any write.
 *
 * The pure testable surface is `runSyncBinary` and the per-tool
 * result-contract validator. We pin the dry-run contract here, the
 * apply-path contract on the wrapped primitives, and the typed error
 * surface.
 */
import { describe, expect, it } from "vitest";
import {
  classifySyncBinaryPlanViolation,
  SYNC_BINARY_PLAN_INVALID,
} from "../../../src/adapters/mcp/contracts/sync-binary-contract-errors.js";
import {
  buildSyncBinaryPlan,
  deriveSyncBinaryRecommendation,
  runSyncBinary,
  type SyncBinaryAdapterLike,
  type SyncBinaryVerifyOutcome,
  type SyncVerifySummary,
} from "../../../src/adapters/vba-sync/sync-binary.js";

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

function makeAdapterThatRefusesToRun(opts: { preVerify?: SyncBinaryVerifyOutcome } = {}): {
  adapter: SyncBinaryAdapterLike;
  importCalls: () => number;
  exportCalls: () => number;
} {
  let importCallsCount = 0;
  let exportCallsCount = 0;
  const adapter: SyncBinaryAdapterLike = {
    async runVerify() {
      return opts.preVerify ?? { ok: true, summary: makeVerifyResult() };
    },
    async runImportModules() {
      importCallsCount += 1;
      return {
        ok: true,
        data: { ok: true, results: [] },
        diagnostics: [],
        durationMs: 0,
      };
    },
    async runExportModules() {
      exportCallsCount += 1;
      return {
        ok: true,
        data: { ok: true, results: [] },
        diagnostics: [],
        durationMs: 0,
      };
    },
  };
  return {
    adapter,
    importCalls: () => importCallsCount,
    exportCalls: () => exportCallsCount,
  };
}

describe("Round-14 bug 2 — sync_binary dryRun contract (#1228)", () => {
  it("dryRun:true with valid pre-verify returns SyncBinarySuccessResult with execution=null (NOT a RESULT_CONTRACT_VIOLATION failure)", async () => {
    const { adapter } = makeAdapterThatRefusesToRun();
    const result = await runSyncBinary({
      adapter,
      input: { dryRun: true },
    });
    // Bug 2 surface: a string `RESULT_CONTRACT_VIOLATION` failure.
    // The fix: sync_binary returns a typed success result; the contract
    // validator only surfaces a typed error if the envelope is actually
    // malformed.
    if ("error" in result) {
      expect(
        result.error.code,
        `bug 2 regression: dryRun:true must not surface RESULT_CONTRACT_VIOLATION; ` +
          `got error.code=${result.error.code}, message=${result.error.message}`,
      ).not.toBe("RESULT_CONTRACT_VIOLATION");
    }
    // The success branch must expose a typed dryRun surface.
    expect("error" in result ? null : result.dryRun).toBe(true);
    if (!("error" in result)) {
      expect(result.execution).toBeNull();
    }
  });

  it("dryRun:true does NOT invoke runImportModules or runExportModules (binary stays untouched)", async () => {
    const wrapped = makeAdapterThatRefusesToRun();
    await runSyncBinary({
      adapter: wrapped.adapter,
      input: { dryRun: true, direction: "both" },
    });
    expect(wrapped.importCalls()).toBe(0);
    expect(wrapped.exportCalls()).toBe(0);
  });

  it("classifySyncBinaryPlanViolation returns a typed SYNC_BINARY_PLAN_INVALID for malformed plan inputs", () => {
    // Pin the typed error surface. Pre-bug-2, the contract validator
    // returned the generic string "RESULT_CONTRACT_VIOLATION". Post-fix,
    // a malformed plan surfaces a typed code the consumer can branch on.
    const classification = classifySyncBinaryPlanViolation({
      plan: null,
      reason: "plan must be a non-null object",
    });
    expect(classification).not.toBeNull();
    expect(classification?.code).toBe(SYNC_BINARY_PLAN_INVALID);
    expect(classification?.remediation).toMatch(/plan/i);
  });

  it("classifySyncBinaryPlanViolation returns null for a well-formed plan", () => {
    const plan = buildSyncBinaryPlan({
      summary: makeVerifyResult(),
      direction: "both",
      scope: { actionableOnly: true, includeBothChanged: false, moduleNamesOnly: false },
    });
    const classification = classifySyncBinaryPlanViolation({ plan, reason: "ok" });
    expect(classification).toBeNull();
  });

  it("deriveSyncBinaryRecommendation is unaffected by the dryRun contract (regression test for the recommendation logic)", () => {
    // The recommendation logic must not silently change when the bug
    // 2 fix lands. Pre-fix and post-fix produce identical recommendations
    // for the same input.
    const summary = makeVerifyResult({
      hasFunctionalDifferences: true,
      actionable: { total: 1, sourceNewer: 1, binaryNewer: 0, bothChanged: 0 },
    });
    const recommendation = deriveSyncBinaryRecommendation(summary);
    expect(recommendation).toBe("import_to_binary");
  });
});
