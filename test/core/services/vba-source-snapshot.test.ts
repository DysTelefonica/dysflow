import { describe, expect, it } from "vitest";

import {
  type BinarySnapshotId,
  buildArtifactIdentityKey,
  type CapturedManifest,
  computeSnapshotId,
  type EvidenceCompleteness,
  mergeBinarySnapshotIds,
  type PostCaptureManifest,
  type PreCaptureManifest,
  type SnapshotArtifact,
  snapshotManifestIsConsistent,
} from "../../../src/core/services/vba-source-snapshot";

function fakeArtifact(overrides: Partial<SnapshotArtifact> = {}): SnapshotArtifact {
  return {
    identityKey: "standard\0probe\0code",
    moduleName: "probe",
    family: "standard",
    representation: "code",
    relativePath: "modules/Probe.bas",
    codec: "utf-8",
    codecSource: "source-default",
    sha256: "a".repeat(64),
    byteLength: 1024,
    ...overrides,
  };
}

function fakePreCapture(artifacts: readonly SnapshotArtifact[]): PreCaptureManifest {
  return {
    kind: "pre-capture",
    scope: { requestedModules: ["Probe"], representations: ["code"] },
    generatedAt: "2026-09-14T08:30:00.000Z",
    artifacts,
  };
}

function fakeCaptured(
  artifacts: readonly SnapshotArtifact[],
  capturedRoot: string,
): CapturedManifest {
  return { ...fakePreCapture(artifacts), kind: "captured", capturedRoot };
}

function fakePostCapture(artifacts: readonly SnapshotArtifact[]): PostCaptureManifest {
  return { ...fakePreCapture(artifacts), kind: "post-capture" };
}

describe("buildArtifactIdentityKey", () => {
  it("produces family + NUL + casefold(moduleName) + NUL + representation", () => {
    expect(buildArtifactIdentityKey("standard", "Probe", "code")).toBe("standard\0probe\0code");
    expect(buildArtifactIdentityKey("form", "Form_Orders", "layout")).toBe(
      "form\0form_orders\0layout",
    );
    expect(buildArtifactIdentityKey("report", "Report_Sales", "code")).toBe(
      "report\0report_sales\0code",
    );
  });

  it("normalizes casing of the moduleName input", () => {
    const lower = buildArtifactIdentityKey("form", "form_orders", "code");
    const upper = buildArtifactIdentityKey("form", "FORM_ORDERS", "code");
    const mixed = buildArtifactIdentityKey("form", "Form_Orders", "code");
    expect(lower).toBe(upper);
    expect(upper).toBe(mixed);
  });
});

describe("computeSnapshotId", () => {
  it("returns a sha256-prefixed 64-hex id for an empty artifact list", () => {
    const id = computeSnapshotId([]);
    expect(id).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("is deterministic across many invocations with the same input", () => {
    const artifacts = [fakeArtifact(), fakeArtifact({ moduleName: "B" })];
    const first = computeSnapshotId(artifacts);
    for (let i = 0; i < 1000; i += 1) {
      expect(computeSnapshotId(artifacts)).toBe(first);
    }
  });

  it("orders artifacts by identityKey before hashing (input order does not matter)", () => {
    const a = fakeArtifact({ identityKey: "standard\0a\0code" });
    const b = fakeArtifact({ identityKey: "standard\0b\0code" });
    const c = fakeArtifact({ identityKey: "standard\0c\0code" });
    const ascending = computeSnapshotId([a, b, c]);
    const descending = computeSnapshotId([c, b, a]);
    const reversed = computeSnapshotId([c, a, b]);
    expect(ascending).toBe(descending);
    expect(ascending).toBe(reversed);
  });

  it("changes the id when sha256 changes", () => {
    const before = fakeArtifact({ sha256: "a".repeat(64) });
    const after = fakeArtifact({ sha256: "b".repeat(64) });
    expect(computeSnapshotId([before])).not.toBe(computeSnapshotId([after]));
  });
});

describe("snapshotManifestIsConsistent", () => {
  const artifact = fakeArtifact();

  it("returns ok:true when pre/captured/post describe the same artifacts with the same hashes", () => {
    const pre = fakePreCapture([artifact]);
    const captured = fakeCaptured([artifact], "C:/temp/Source");
    const post = fakePostCapture([artifact]);
    expect(snapshotManifestIsConsistent(pre, captured, post)).toEqual({ ok: true });
  });

  it("reports SOURCE_SNAPSHOT_RACE when an artifact is added in post-capture", () => {
    const pre = fakePreCapture([artifact]);
    const captured = fakeCaptured([artifact], "C:/temp/Source");
    const post = fakePostCapture([
      artifact,
      fakeArtifact({ identityKey: "standard\0extra\0code", moduleName: "extra" }),
    ]);
    const result = snapshotManifestIsConsistent(pre, captured, post);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.code === "SOURCE_SNAPSHOT_RACE")).toBe(true);
    expect(result.reasons.find((r) => r.moduleName === "extra")).toBeDefined();
  });

  it("reports SOURCE_SNAPSHOT_RACE when the captured hash diverges from pre", () => {
    const pre = fakePreCapture([artifact]);
    const captured = fakeCaptured([fakeArtifact({ sha256: "9".repeat(64) })], "C:/temp/Source");
    const post = fakePostCapture([artifact]);
    const result = snapshotManifestIsConsistent(pre, captured, post);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.reasons.find((r) => r.message.includes("Captured sha256 diverges")),
    ).toBeDefined();
  });

  it("reports SOURCE_SNAPSHOT_RACE when the post hash diverges from pre", () => {
    const pre = fakePreCapture([artifact]);
    const captured = fakeCaptured([artifact], "C:/temp/Source");
    const post = fakePostCapture([fakeArtifact({ sha256: "9".repeat(64) })]);
    const result = snapshotManifestIsConsistent(pre, captured, post);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.reasons.find((r) => r.message.includes("Post-capture sha256 diverges")),
    ).toBeDefined();
  });
});

describe("mergeBinarySnapshotIds", () => {
  const left: BinarySnapshotId = {
    binaryPreSha256: "a".repeat(64),
    binaryCopyPreSha256: "b".repeat(64),
  };
  const right: BinarySnapshotId = {
    binaryPreSha256: "a".repeat(64),
    binaryCopyPreSha256: "b".repeat(64),
    binaryCopyPostSha256: "c".repeat(64),
    binaryPostSha256: "d".repeat(64),
  };

  it("returns the merged snapshot when pre fields agree", () => {
    const merged = mergeBinarySnapshotIds(left, right);
    expect(merged.binaryPreSha256).toBe(left.binaryPreSha256);
    expect(merged.binaryCopyPreSha256).toBe(left.binaryCopyPreSha256);
    expect(merged.binaryCopyPostSha256).toBe("c".repeat(64));
    expect(merged.binaryPostSha256).toBe("d".repeat(64));
  });

  it("throws when binaryPreSha256 disagrees", () => {
    expect(() =>
      mergeBinarySnapshotIds(left, {
        ...right,
        binaryPreSha256: "9".repeat(64),
      }),
    ).toThrow(/binaryPreSha256 mismatch/);
  });

  it("throws when binaryCopyPreSha256 disagrees", () => {
    expect(() =>
      mergeBinarySnapshotIds(left, {
        ...right,
        binaryCopyPreSha256: "9".repeat(64),
      }),
    ).toThrow(/binaryCopyPreSha256 mismatch/);
  });

  it("keeps binaryPostSha256 undefined when both sides are undefined", () => {
    const merged = mergeBinarySnapshotIds(left, {
      binaryPreSha256: left.binaryPreSha256,
      binaryCopyPreSha256: left.binaryCopyPreSha256,
    });
    expect(merged.binaryPostSha256).toBeUndefined();
    expect(merged.binaryCopyPostSha256).toBeUndefined();
  });
});

describe("EvidenceCompleteness (type surface)", () => {
  it("round-trips through JSON serialization without losing discriminator fields", () => {
    const ev: EvidenceCompleteness = {
      status: "incomplete",
      requestedArtifacts: 14,
      comparedArtifacts: 13,
      incompleteArtifacts: 1,
      reasons: [
        {
          code: "PAIRED_ARTIFACT_MISSING",
          moduleName: "Form_Orders",
          fileType: "cls",
          message: "Layout was captured but sibling code evidence is missing.",
        },
      ],
      sourceSnapshotId: "sha256:".concat("1".repeat(64)),
      binarySnapshotId: "sha256:".concat("2".repeat(64)),
    };
    const json = JSON.parse(JSON.stringify(ev));
    expect(json).toEqual(ev);
  });
});
