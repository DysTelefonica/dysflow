/**
 * Issue #1043 — `sync_binary dryRun` returns stale source-vs-binary diff
 * after `import_modules apply`.
 *
 * Symptom (per the issue body):
 *   1. After a successful `import_modules apply`, the next
 *      `sync_binary dryRun` continues to report the just-applied modules
 *      in `preSync.missingInBinary`. `list_vba_modules` confirms the
 *      modules ARE present in the binario.
 *   2. `preSync.missingInBinary` / `missingInSource` contain DUPLICATE
 *      entries (same moduleName appearing twice — once per fileType:
 *      .cls + .form.txt).
 *
 * Two RED tests are designed to fail before the fix:
 *   - Test A — consumer integration. After `import_modules apply`, the
 *     next `sync_binary dryRun` MUST report fresh `missingInBinary`
 *     (no stale module, no duplicates).
 *   - Test B — cache invalidation hook. The verify_code memo the
 *     `VbaSyncAdapter.runSyncBinaryVerify` holds must be cleared by
 *     every successful disk-state-changing tool
 *     (import_modules / export_modules / delete_module /
 *     apply_form_design_plan), so the post-mutation `sync_binary`
 *     re-runs verify_code and reflects the current state.
 *   - Test C — dedup. The `SyncVerifySummary` projection dedupes
 *     `missingInBinary` / `missingInSource` by `moduleName` (a single
 *     module can occupy multiple fileTypes — .cls + .form.txt — and
 *     must not appear twice).
 *
 * Implementation seam:
 *   `VbaSyncAdapter.runSyncBinaryVerify` reads the cache and updates it
 *   on a miss. `VbaSyncAdapter.execute` invalidates the cache after any
 *   successful mutation tool. `projectVerifyToSyncSummary` dedupes the
 *   projection output. No Access COM required — pure Node + mocked
 *   `compareSourceAgainstBinary` (matches the existing seam pattern
 *   used in `vba-modules-adapter.test.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock `compareSourceAgainstBinary` so the verify_code branch is
// observable in tests without Access COM. The test controls what
// `verify_code` returns via the mockReturnValueOnce / mockReturnValue
// queue per test.
vi.mock("../../../src/core/services/vba-source-comparison", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/core/services/vba-source-comparison")
  >("../../../src/core/services/vba-source-comparison");
  return {
    ...actual,
    compareSourceAgainstBinary: vi.fn(),
  };
});

import { VbaSyncAdapter } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { compareSourceAgainstBinary } from "../../../src/core/services/vba-source-comparison";

const mockedCompare = vi.mocked(compareSourceAgainstBinary);

// ─── helpers ────────────────────────────────────────────────────────────────

import type { VbaVerifyResult } from "../../../src/adapters/vba-sync/vba-sync-adapter";

const ACCESS_PATH = "C:/db/front.accdb";
const DESTINATION_ROOT = "C:/repo/src";

/** A VbaVerifyResult-shape returned by `compareSourceAgainstBinary`. */
function verifyPayload(opts: {
  missingInBinary?: readonly { moduleName: string; fileType?: string }[];
  missingInSource?: readonly { moduleName: string; fileType?: string }[];
  actionable?: { total: number; sourceNewer: number; binaryNewer: number; bothChanged: number };
  hasFunctionalDifferences?: boolean;
  recommendedAction?: string;
  recommendation?: string;
}) {
  const actionable = opts.actionable ?? {
    total: 0,
    sourceNewer: 0,
    binaryNewer: 0,
    bothChanged: 0,
  };
  const missingInBinary = (opts.missingInBinary ?? []).map((e) => ({
    moduleName: e.moduleName,
    fileType: e.fileType ?? "cls",
  }));
  const missingInSource = (opts.missingInSource ?? []).map((e) => ({
    moduleName: e.moduleName,
    fileType: e.fileType ?? "cls",
  }));
  return {
    operation: "verify_code" as const,
    ok: !(opts.hasFunctionalDifferences ?? false),
    dryRun: true as const,
    willModifyAccess: false as const,
    sourceRoot: "src",
    matched: [],
    different: [],
    missingInSource,
    missingInBinary,
    actionableDifferent: [],
    nonActionableDifferent: [],
    hasFunctionalDifferences: opts.hasFunctionalDifferences ?? false,
    actionableOk: !(opts.hasFunctionalDifferences ?? false),
    recommendation: opts.recommendation ?? "no_action",
    recommendedAction: opts.recommendedAction ?? "no_action",
    summaryStructured: {
      matched: 0,
      different: 0,
      missingInSource: missingInSource.length,
      missingInBinary: missingInBinary.length,
      actionable,
      nonActionable: {
        caseOnly: 0,
        whitespaceOnly: 0,
        attributeOnly: 0,
        formSerializationOnly: 0,
        encodingOnly: 0,
        total: 0,
      },
    },
    vbeCacheNote: "verify_code compares on-disk source against the on-disk binary only.",
  };
}

/** Wrap a `verifyPayload(...)` as the `{ ok: true, data: ... }` envelope
 *  the mocked `compareSourceAgainstBinary` is expected to return. The
 *  cast at the seam keeps `verifyPayload`'s helper signature focused on
 *  the meaningful fields without dragging in the full VbaVerifyResult
 *  literal-type taxonomy (recommendedAction / etc.). */
function verifyEnvelope(opts: Parameters<typeof verifyPayload>[0] = {}): {
  ok: true;
  data: VbaVerifyResult;
  diagnostics: never[];
  durationMs: number;
} {
  return {
    ok: true,
    data: verifyPayload(opts) as VbaVerifyResult,
    diagnostics: [],
    durationMs: 0,
  };
}

function makeExecutor() {
  return vi.fn(async () => ({
    exitCode: 0,
    stdout: 'DYSFLOW_RESULT {"ok":true}',
    stderr: "",
    durationMs: 1,
    timedOut: false,
  }));
}

function newService(executor: ReturnType<typeof makeExecutor>) {
  return new VbaSyncAdapter({
    executor: executor as unknown as ConstructorParameters<typeof VbaSyncAdapter>[0] extends {
      executor?: infer E;
    }
      ? E
      : never,
    accessPath: ACCESS_PATH,
    destinationRoot: DESTINATION_ROOT,
    env: {},
  });
}

// ─── Test A — consumer integration ──────────────────────────────────────────

describe("sync_binary cache invalidation (issue #1043) — Test A", () => {
  beforeEach(() => {
    mockedCompare.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("after import_modules apply, the next sync_binary dryRun reflects fresh state (no stale missingInBinary)", async () => {
    // First verify: StaleModule is missing. Second verify (after import):
    // no missing modules.
    mockedCompare
      .mockResolvedValueOnce(
        verifyEnvelope({
          missingInBinary: [{ moduleName: "StaleModule", fileType: "cls" }],
          hasFunctionalDifferences: true,
          recommendedAction: "import_to_binary",
          recommendation: "import_to_binary",
          actionable: { total: 1, sourceNewer: 0, binaryNewer: 1, bothChanged: 0 },
        }),
      )
      .mockResolvedValueOnce(verifyEnvelope({}));

    const service = newService(makeExecutor());

    // 1. First sync_binary dryRun — StaleModule must appear in missingInBinary.
    const first = await service.execute("sync_binary", {
      dryRun: true,
      accessPath: ACCESS_PATH,
      destinationRoot: DESTINATION_ROOT,
    });
    if (!first.ok) throw new Error(`first sync_binary failed: ${first.error.code}`);
    expect(first.data).toMatchObject({
      preSync: { missingInBinary: [{ moduleName: "StaleModule" }] },
    });

    // 2. Apply import_modules for StaleModule (cache must invalidate here).
    const applyResult = await service.execute("import_modules", {
      moduleNames: ["StaleModule"],
      dryRun: false,
      accessPath: ACCESS_PATH,
      destinationRoot: DESTINATION_ROOT,
    });
    expect(applyResult.ok).toBe(true);

    // 3. Second sync_binary dryRun — StaleModule must NO LONGER be missing.
    const second = await service.execute("sync_binary", {
      dryRun: true,
      accessPath: ACCESS_PATH,
      destinationRoot: DESTINATION_ROOT,
    });
    if (!second.ok) throw new Error(`second sync_binary failed: ${second.error.code}`);
    const secondData = second.data as {
      preSync: { missingInBinary: readonly { moduleName: string }[] };
    };
    expect(secondData.preSync.missingInBinary).not.toContainEqual({ moduleName: "StaleModule" });
  });
});

// ─── Test B — cache invalidation hook ───────────────────────────────────────

describe("sync_binary cache invalidation (issue #1043) — Test B", () => {
  beforeEach(() => {
    mockedCompare.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("verify_code cache is invalidated by successful import_modules apply (post-mutation sync_binary re-verifies)", async () => {
    // Each call returns a fresh verify result so the cache miss vs hit
    // distinction is unambiguous. If the cache is NOT invalidated after
    // import_modules, the second sync_binary returns the FIRST verify
    // result — and StaleModule remains in missingInBinary.
    mockedCompare
      .mockResolvedValueOnce(
        verifyEnvelope({
          missingInBinary: [{ moduleName: "StaleModule", fileType: "cls" }],
          hasFunctionalDifferences: true,
        }),
      )
      .mockResolvedValueOnce(verifyEnvelope({}));

    const service = newService(makeExecutor());

    await service.execute("sync_binary", {
      dryRun: true,
      accessPath: ACCESS_PATH,
      destinationRoot: DESTINATION_ROOT,
    });

    await service.execute("import_modules", {
      moduleNames: ["StaleModule"],
      dryRun: false,
      accessPath: ACCESS_PATH,
      destinationRoot: DESTINATION_ROOT,
    });

    await service.execute("sync_binary", {
      dryRun: true,
      accessPath: ACCESS_PATH,
      destinationRoot: DESTINATION_ROOT,
    });

    // compareSourceAgainstBinary must have been called TWICE — once per
    // sync_binary dryRun. The import_modules call does NOT call it.
    expect(mockedCompare).toHaveBeenCalledTimes(2);
  });

  it("verify_code cache is invalidated by successful export_modules apply", async () => {
    mockedCompare
      .mockResolvedValueOnce(verifyEnvelope({}))
      .mockResolvedValueOnce(verifyEnvelope({}));

    const service = newService(makeExecutor());

    await service.execute("sync_binary", {
      dryRun: true,
      accessPath: ACCESS_PATH,
      destinationRoot: DESTINATION_ROOT,
    });
    await service.execute("export_modules", {
      moduleNames: ["SomeModule"],
      dryRun: false,
      accessPath: ACCESS_PATH,
      destinationRoot: DESTINATION_ROOT,
    });
    await service.execute("sync_binary", {
      dryRun: true,
      accessPath: ACCESS_PATH,
      destinationRoot: DESTINATION_ROOT,
    });

    expect(mockedCompare).toHaveBeenCalledTimes(2);
  });

  it("verify_code cache is invalidated by successful delete_module apply", async () => {
    mockedCompare
      .mockResolvedValueOnce(verifyEnvelope({}))
      .mockResolvedValueOnce(verifyEnvelope({}));

    const service = newService(makeExecutor());

    await service.execute("sync_binary", {
      dryRun: true,
      accessPath: ACCESS_PATH,
      destinationRoot: DESTINATION_ROOT,
    });
    await service.execute("delete_module", {
      moduleName: "TempModule",
      dryRun: false,
      accessPath: ACCESS_PATH,
      destinationRoot: DESTINATION_ROOT,
    });
    await service.execute("sync_binary", {
      dryRun: true,
      accessPath: ACCESS_PATH,
      destinationRoot: DESTINATION_ROOT,
    });

    expect(mockedCompare).toHaveBeenCalledTimes(2);
  });
});

// ─── Test C — dedup of missingInBinary / missingInSource by moduleName ──────

describe("sync_binary missingInBinary/missingInSource dedup (issue #1043) — Test C", () => {
  beforeEach(() => {
    mockedCompare.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("the SyncVerifySummary projection dedupes missingInBinary entries that share a moduleName (form layout + code)", async () => {
    // Same module name, two fileTypes — the duplicate the consumer
    // reports in the issue body.
    mockedCompare.mockResolvedValueOnce(
      verifyEnvelope({
        missingInBinary: [
          { moduleName: "Form_frmSplash", fileType: "cls" },
          { moduleName: "Form_frmSplash", fileType: "form.txt" },
          { moduleName: "Test_TbRiesgos_Priorizacion", fileType: "cls" },
        ],
        missingInSource: [
          { moduleName: "frmSplash", fileType: "cls" },
          { moduleName: "frmSplash", fileType: "form.txt" },
        ],
        hasFunctionalDifferences: true,
        recommendedAction: "manual_merge",
        recommendation: "manual_merge",
      }),
    );

    const service = newService(makeExecutor());

    const result = await service.execute("sync_binary", {
      dryRun: true,
      accessPath: ACCESS_PATH,
      destinationRoot: DESTINATION_ROOT,
    });
    if (!result.ok) throw new Error(`sync_binary failed: ${result.error.code}`);
    const data = result.data as {
      preSync: {
        missingInBinary: readonly { moduleName: string }[];
        missingInSource: readonly { moduleName: string }[];
      };
    };

    // Form_frmSplash must appear ONCE, not twice.
    const formSplash = data.preSync.missingInBinary.filter(
      (e) => e.moduleName === "Form_frmSplash",
    );
    expect(formSplash).toHaveLength(1);

    // frmSplash in missingInSource must also appear ONCE.
    const frmSplash = data.preSync.missingInSource.filter((e) => e.moduleName === "frmSplash");
    expect(frmSplash).toHaveLength(1);
  });
});

// ─── Cache reuse ────────────────────────────────────────────────────────────

describe("sync_binary verify_code cache reuse (issue #1043)", () => {
  beforeEach(() => {
    mockedCompare.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("verify_code is called ONCE per cache key when no mutation occurs between sync_binary calls", async () => {
    mockedCompare.mockResolvedValue(verifyEnvelope({}));

    const service = newService(makeExecutor());

    await service.execute("sync_binary", {
      dryRun: true,
      accessPath: ACCESS_PATH,
      destinationRoot: DESTINATION_ROOT,
    });
    await service.execute("sync_binary", {
      dryRun: true,
      accessPath: ACCESS_PATH,
      destinationRoot: DESTINATION_ROOT,
    });
    await service.execute("sync_binary", {
      dryRun: true,
      accessPath: ACCESS_PATH,
      destinationRoot: DESTINATION_ROOT,
    });

    // Without cache: 3 verify_code calls. With cache: 1.
    expect(mockedCompare).toHaveBeenCalledTimes(1);
  });
});
