/**
 * Issue #1733 — `sync_binary` with `apply: true` must propagate the apply
 * intent to every chunk dispatch (import_modules / export_modules).
 *
 * Bug history:
 *   `stripSyncBinaryOwnParams` in `vba-sync-adapter.ts` listed `apply` as a
 *   sync-binary-owned key, so the `forward` payload the orchestrator passed
 *   to each chunk dropped `apply:true`. With `direction: "binary-to-src"`,
 *   the nested `export_modules` therefore ran plan-only and reported
 *   `mode: "plan"`, `exportedPaths: []`, while the top-level sync_binary
 *   result still surfaced `ok: true`.
 *
 *   The symmetric defect (src-to-binary import chunks losing apply) was
 *   also latent.
 *
 * Coverage here:
 *   AC1 — direction:'binary-to-src' + apply:true forwards apply:true
 *         into every export_modules chunk params.
 *   AC2 — direction:'src-to-binary' + apply:true forwards apply:true
 *         into every import_modules chunk params.
 *   AC3 — multi-module plan that crosses a chunk boundary preserves
 *         apply:true on every chunk (no chunk loses the flag).
 *   AC4 — defence: when a nested export reports remain plan-only despite
 *         willExecute, the orchestrator returns an error envelope with a
 *         typed code rather than aggregating the plan result into ok:true.
 */
import { describe, expect, it } from "vitest";
import {
  runSyncBinary,
  type SyncBinaryAdapterLike,
  type SyncBinaryFailureResult,
  type SyncBinaryInput,
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
 * Capture-everything fake adapter. Unlike the helper in `sync-binary.test.ts`
 * we capture the full chunk params (apply, dryRun, moduleNames, anything
 * else forwarded) so the assertion is exact: did apply:true reach the
 * nested call?
 */
function makeCapturingAdapter(
  preVerify: SyncVerifySummary,
  postVerify: SyncVerifySummary,
  options: {
    /**
     * Override the export_modules response shape. Default: success envelope
     * that mirrors what the runtime emits on a real applied export.
     * Set to a plan-only shape to simulate the buggy adapter the issue
     * reports (nested export stays plan-only).
     */
    exportResponse?: { ok: boolean; data?: unknown } | { ok: false; error: unknown };
  } = {},
): {
  adapter: SyncBinaryAdapterLike;
  importChunks: Array<Record<string, unknown>>;
  exportChunks: Array<Record<string, unknown>>;
} {
  const importChunks: Array<Record<string, unknown>> = [];
  const exportChunks: Array<Record<string, unknown>> = [];
  let verifyCalls = 0;

  const adapter: SyncBinaryAdapterLike = {
    async runVerify() {
      // First call -> pre, second -> post.
      verifyCalls += 1;
      const summary = verifyCalls === 1 ? preVerify : postVerify;
      return { ok: true, summary };
    },
    async runImportModules(params) {
      importChunks.push({ ...params });
      return {
        ok: true,
        data: {
          ok: true,
          results: (params.moduleNames as readonly string[]).map((name) => ({
            module: name,
            status: "ok",
          })),
        },
        diagnostics: [],
        durationMs: 0,
      };
    },
    async runExportModules(params) {
      exportChunks.push({ ...params });
      if (options.exportResponse && "ok" in options.exportResponse && options.exportResponse.ok === false) {
        return {
          ok: false,
          error: (options.exportResponse as { ok: false; error: unknown }).error as never,
          diagnostics: [],
          durationMs: 0,
        };
      }
      if (options.exportResponse && "data" in options.exportResponse) {
        return {
          ok: true,
          data: options.exportResponse.data,
          diagnostics: [],
          durationMs: 0,
        };
      }
      return {
        ok: true,
        data: {
          ok: true,
          mode: "execute",
          dryRun: false,
          willExecute: true,
          exportedPaths: (params.moduleNames as readonly string[]).map((name) => `${name}.bas`),
        },
        diagnostics: [],
        durationMs: 0,
      };
    },
  };

  return { adapter, importChunks, exportChunks };
}

// ─── AC1: binary-to-src forwards apply:true ─────────────────────────────────

describe("sync_binary apply propagation (#1733, AC1) — binary-to-src", () => {
  it("forwards apply:true into every export_modules chunk params", async () => {
    const { adapter, exportChunks } = makeCapturingAdapter(
      makeVerifyResult({
        missingInSource: [{ moduleName: "E1" }, { moduleName: "E2" }, { moduleName: "E3" }],
        hasFunctionalDifferences: true,
        recommendedAction: "export_to_source",
      }),
      makeVerifyResult(),
    );

    const input: SyncBinaryInput = { direction: "binary-to-src", apply: true, batchSize: 2 };
    await runSyncBinary({ adapter, input });

    // 3 modules / batchSize 2 -> 2 chunks. Each chunk MUST carry apply:true.
    expect(exportChunks).toHaveLength(2);
    for (const chunk of exportChunks) {
      expect(chunk.apply).toBe(true);
    }
  });
});

// ─── AC2: src-to-binary forwards apply:true ─────────────────────────────────

describe("sync_binary apply propagation (#1733, AC2) — src-to-binary", () => {
  it("forwards apply:true into every import_modules chunk params", async () => {
    const { adapter, importChunks } = makeCapturingAdapter(
      makeVerifyResult({
        missingInBinary: [
          { moduleName: "M1" },
          { moduleName: "M2" },
          { moduleName: "M3" },
          { moduleName: "M4" },
        ],
        hasFunctionalDifferences: true,
        recommendedAction: "import_to_binary",
      }),
      makeVerifyResult(),
    );

    const input: SyncBinaryInput = { direction: "src-to-binary", apply: true, batchSize: 3 };
    await runSyncBinary({ adapter, input });

    // 4 modules / batchSize 3 -> 2 chunks. Each chunk MUST carry apply:true.
    expect(importChunks).toHaveLength(2);
    for (const chunk of importChunks) {
      expect(chunk.apply).toBe(true);
    }
  });
});

// ─── AC3: chunk boundary preserves apply intent ─────────────────────────────

describe("sync_binary apply propagation (#1733, AC3) — chunk boundary", () => {
  it("applies:true to every chunk across multiple batches", async () => {
    // 25 modules with batchSize 10 -> 3 chunks: 10 + 10 + 5.
    const missingInSource = Array.from({ length: 25 }, (_, i) => ({
      moduleName: `Module_${String(i + 1).padStart(2, "0")}`,
    }));
    const { adapter, exportChunks } = makeCapturingAdapter(
      makeVerifyResult({
        missingInSource,
        hasFunctionalDifferences: true,
        recommendedAction: "export_to_source",
      }),
      makeVerifyResult(),
    );

    const input: SyncBinaryInput = { direction: "binary-to-src", apply: true, batchSize: 10 };
    await runSyncBinary({ adapter, input });

    expect(exportChunks).toHaveLength(3);
    expect(exportChunks[0]?.moduleNames).toHaveLength(10);
    expect(exportChunks[1]?.moduleNames).toHaveLength(10);
    expect(exportChunks[2]?.moduleNames).toHaveLength(5);
    for (const chunk of exportChunks) {
      expect(chunk.apply).toBe(true);
    }
  });
});

// ─── AC4: nested plan-only export cannot produce ok:true ────────────────────

describe("sync_binary apply propagation (#1733, AC4) — defence against nested plan-only export", () => {
  it("returns a typed failure when the nested export remains plan-only under willExecute", async () => {
    const { adapter } = makeCapturingAdapter(
      makeVerifyResult({
        missingInSource: [{ moduleName: "E1" }],
        hasFunctionalDifferences: true,
        recommendedAction: "export_to_source",
      }),
      makeVerifyResult(),
      {
        exportResponse: {
          ok: true,
          // The nested adapter returned a plan-only envelope despite the
          // outer call requesting apply:true — that's the defect.
          data: {
            ok: true,
            mode: "plan",
            dryRun: true,
            willExecute: false,
            willModifyAccess: false,
            willModifyFilesystem: false,
            exportedPaths: [],
          },
        },
      },
    );

    const result = await runSyncBinary({
      adapter,
      input: { direction: "binary-to-src", apply: true },
    });

    expect("error" in result).toBe(true);
    const failure = result as SyncBinaryFailureResult;
    expect(failure.ok).toBe(false);
    expect(failure.error.code).toBe("SYNC_BINARY_CHUNK_REMAINED_PLAN");
    // The error message must name which chunk remained plan-only so a
    // maintainer can read the failure and route to the offending path.
    expect(failure.error.message).toMatch(/export/);
    expect(failure.dryRun).toBe(false);
  });
});