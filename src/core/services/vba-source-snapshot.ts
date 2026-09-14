/**
 * Frozen-snapshot type surface for the verify-code v2 redesign.
 *
 * WU-1 introduces this file with pure types and pure helpers (no I/O, no Access,
 * no filesystem imports). WU-5 wires the call paths that materialize these types
 * against a real binary copy; WU-6 attaches `EvidenceCompleteness` to the live
 * `VbaVerifyResult` and threads `BinarySnapshotId` through the chunked driver.
 *
 * No runtime behavior change in this commit. Every helper is deterministic and
 * pure so the test suite can pin its outputs without a live Access session.
 */

export type SnapshotCodec = "utf-8" | "windows-1252" | "utf-16le" | "utf-16be";

export type SnapshotArtifactFamily = "standard" | "class" | "form" | "report";

export type SnapshotRepresentation = "code" | "layout";

export type SnapshotScope = {
  readonly requestedModules: readonly string[];
  readonly representations: readonly SnapshotRepresentation[];
};

export type SnapshotArtifact = {
  /** `${family}\0${casefold(VB_Name)}\0${representation}` — see DESIGN §"Identity precedence". */
  identityKey: string;
  /** `moduleName` after `casefold` (lowercased). */
  moduleName: string;
  family: SnapshotArtifactFamily;
  representation: SnapshotRepresentation;
  /** POSIX-style relative path under the source or export root. */
  relativePath: string;
  codec: SnapshotCodec;
  /** Origin of the codec declaration: file-prefix BOM, manifest, or fallback default. */
  codecSource: "bom" | "manifest" | "source-default";
  /** Lowercase 64-char hex SHA-256 of the raw emitted bytes. */
  sha256: string;
  /** Raw byte length of the artifact (NOT decoded character count). */
  byteLength: number;
};

/**
 * Common shape shared by every snapshot-manifest flavor. Each concrete
 * manifest extends this with its own `kind` discriminator so callers can
 * narrow via the discriminator (a single literal per subtype). The three
 * flavors do NOT inherit from one another because that would force TS to
 * widen `kind` to a union and lose the literal discrimination callers need.
 */
type SnapshotManifestBase = {
  readonly scope: SnapshotScope;
  /** ISO 8601 UTC, second precision. */
  readonly generatedAt: string;
  readonly artifacts: readonly SnapshotArtifact[];
};

export type PreCaptureManifest = SnapshotManifestBase & {
  readonly kind: "pre-capture";
};

export type CapturedManifest = SnapshotManifestBase & {
  readonly kind: "captured";
  /** Absolute path of the immutable temp root that holds the copied source artifacts. */
  readonly capturedRoot: string;
};

export type PostCaptureManifest = SnapshotManifestBase & {
  readonly kind: "post-capture";
};

export type SnapshotCompletenessReasonCode =
  | "SOURCE_SNAPSHOT_RACE"
  | "BINARY_SNAPSHOT_RACE"
  | "DUPLICATE_IDENTITY_KEY"
  | "PAIRED_ARTIFACT_MISSING"
  | "UNREADABLE_ARTIFACT"
  | "UNSUPPORTED_SYNTAX"
  | "EXPORT_RESULT_FAILED"
  | "EXPORT_WARNING_PARSE_FAILED"
  | "CHUNK_TIMEOUT"
  | "CHUNK_FAILURE";

export type SnapshotCompletenessReason = {
  readonly code: SnapshotCompletenessReasonCode;
  readonly moduleName?: string;
  readonly fileType?: string;
  readonly message: string;
};

export type EvidenceCompleteness = {
  readonly status: "complete" | "incomplete";
  readonly requestedArtifacts: number;
  readonly comparedArtifacts: number;
  readonly incompleteArtifacts: number;
  readonly reasons: readonly SnapshotCompletenessReason[];
  readonly sourceSnapshotId: string;
  readonly binarySnapshotId: string;
};

export type BinarySnapshotId = {
  readonly binaryPreSha256: string;
  readonly binaryCopyPreSha256: string;
  /**
   * Diagnostic only. Access may legitimately mutate bookkeeping (LSN, etc.) on
   * the disposable copy; we DO NOT treat post-export copy-byte inequality as
   * semantic drift. See DESIGN §"Frozen boundaries" item 7.
   */
  readonly binaryCopyPostSha256?: string;
  /** Hash of the original frontend AFTER the export round-trip closed. */
  readonly binaryPostSha256?: string;
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Build the canonical identity key for a `(family, moduleName, representation)`
 * triple. Per DESIGN §"Identity precedence" and §"Canonical module identity
 * key": `artifact-family + NUL + casefold(VB_Name) + NUL + representation`.
 *
 * `moduleName` is lowercased here so the helper is safe-to-call: callers do
 * not have to remember to case-fold before composing the key. Two inputs
 * differing only in casing collapse to the SAME identity key, which is the
 * point of the canonical key per the DESIGN.
 */
export function buildArtifactIdentityKey(
  family: SnapshotArtifactFamily,
  moduleName: string,
  representation: SnapshotRepresentation,
): string {
  return `${family}\0${moduleName.toLowerCase()}\0${representation}`;
}

/**
 * Compute a stable identifier for a snapshot manifest by hashing the
 * lexicographically-ordered identity keys + sha256 ledger. Returns
 * `"sha256:<64-hex>"`.
 *
 * Pure: same input → same output on every invocation. No filesystem, no
 * random sources, no clock dependency. Sort is byte-stable; the resulting
 * SHA-256 depends on the input order ONLY through the sort key, so callers
 * may pass artifacts in any order without affecting the resulting id.
 */
export function computeSnapshotId(artifacts: readonly SnapshotArtifact[]): string {
  const sorted = [...artifacts].sort((left, right) =>
    left.identityKey.localeCompare(right.identityKey),
  );
  const lines: string[] = [];
  for (const artifact of sorted) {
    lines.push(`${artifact.identityKey}\t${artifact.sha256}\t${artifact.byteLength}`);
  }
  return `sha256:${hashKeyLines(lines)}`;
}

/**
 * SHA-256 the concatenation of NUL-separated key lines. Implemented with
 * `node:crypto` because that is the only deterministic, dependency-free hash
 * available in the Node runtime; this function is still pure in the sense that
 * it has no I/O and no global state outside its arguments.
 */
function hashKeyLines(lines: readonly string[]): string {
  // Lazy-require so the test surface stays import-clean even if a future
  // bundler step decides to inline this file.
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  const hash = createHash("sha256");
  for (let index = 0; index < lines.length; index += 1) {
    if (index > 0) hash.update("\0");
    hash.update(lines[index] ?? "");
  }
  return hash.digest("hex");
}

/**
 * Validate that the pre-, captured-, and post-capture manifests describe the
 * SAME set of artifacts with the SAME hashes. Returns `{ok: true}` on full
 * agreement, otherwise `{ok: false, reasons}` enumerating each divergence with
 * the typed code the downstream consumer expects.
 *
 * Pure: walks the three manifests synchronously, no I/O.
 */
export function snapshotManifestIsConsistent(
  pre: PreCaptureManifest,
  captured: CapturedManifest,
  post: PostCaptureManifest,
): { ok: true } | { ok: false; reasons: readonly SnapshotCompletenessReason[] } {
  const reasons: SnapshotCompletenessReason[] = [];

  const preMap = indexByIdentityKey(pre.artifacts);
  const capturedMap = indexByIdentityKey(captured.artifacts);
  const postMap = indexByIdentityKey(post.artifacts);

  for (const [key, preArtifact] of preMap) {
    const capturedArtifact = capturedMap.get(key);
    const postArtifact = postMap.get(key);

    if (capturedArtifact === undefined) {
      reasons.push({
        code: "SOURCE_SNAPSHOT_RACE",
        moduleName: preArtifact.moduleName,
        fileType: preArtifact.representation,
        message: `Artifact present in pre-capture but missing in captured: ${preArtifact.relativePath}`,
      });
      continue;
    }
    if (postArtifact === undefined) {
      reasons.push({
        code: "SOURCE_SNAPSHOT_RACE",
        moduleName: preArtifact.moduleName,
        fileType: preArtifact.representation,
        message: `Artifact present in pre-capture but missing in post-capture: ${preArtifact.relativePath}`,
      });
      continue;
    }
    if (capturedArtifact.sha256 !== preArtifact.sha256) {
      reasons.push({
        code: "SOURCE_SNAPSHOT_RACE",
        moduleName: preArtifact.moduleName,
        fileType: preArtifact.representation,
        message: `Captured sha256 diverges from pre-capture for ${preArtifact.relativePath}`,
      });
    }
    if (postArtifact.sha256 !== preArtifact.sha256) {
      reasons.push({
        code: "SOURCE_SNAPSHOT_RACE",
        moduleName: preArtifact.moduleName,
        fileType: preArtifact.representation,
        message: `Post-capture sha256 diverges from pre-capture for ${preArtifact.relativePath}`,
      });
    }
  }

  for (const [key, capturedArtifact] of capturedMap) {
    if (!preMap.has(key)) {
      reasons.push({
        code: "SOURCE_SNAPSHOT_RACE",
        moduleName: capturedArtifact.moduleName,
        fileType: capturedArtifact.representation,
        message: `Artifact appeared in captured manifest without a pre-capture entry: ${capturedArtifact.relativePath}`,
      });
    }
    if (!postMap.has(key)) {
      reasons.push({
        code: "SOURCE_SNAPSHOT_RACE",
        moduleName: capturedArtifact.moduleName,
        fileType: capturedArtifact.representation,
        message: `Artifact present in captured but missing in post-capture: ${capturedArtifact.relativePath}`,
      });
    }
  }

  for (const [key, postArtifact] of postMap) {
    if (!preMap.has(key)) {
      reasons.push({
        code: "SOURCE_SNAPSHOT_RACE",
        moduleName: postArtifact.moduleName,
        fileType: postArtifact.representation,
        message: `Artifact appeared in post-capture without a pre-capture entry: ${postArtifact.relativePath}`,
      });
    }
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

/**
 * Merge two `BinarySnapshotId` snapshots that MUST agree on the pre-export
 * identities (`binaryPreSha256`, `binaryCopyPreSha256`). The post-export
 * fields are concatenated with first-write-wins so the call site can layer
 * pre- and post-export observations.
 *
 * Throws a `TypeError` when the two snapshots disagree on a pre-export field;
 * that disagreement IS the `BINARY_SNAPSHOT_RACE` signal downstream consumers
 * should surface as `incomplete`. We throw here so the WU-5 call site can
 * convert the throw into a typed completeness reason without leaking a
 * partially-merged identity downstream.
 */
export function mergeBinarySnapshotIds(
  left: BinarySnapshotId,
  right: BinarySnapshotId,
): BinarySnapshotId {
  if (left.binaryPreSha256 !== right.binaryPreSha256) {
    throw new TypeError(
      `binaryPreSha256 mismatch: ${left.binaryPreSha256} vs ${right.binaryPreSha256}`,
    );
  }
  if (left.binaryCopyPreSha256 !== right.binaryCopyPreSha256) {
    throw new TypeError(
      `binaryCopyPreSha256 mismatch: ${left.binaryCopyPreSha256} vs ${right.binaryCopyPreSha256}`,
    );
  }
  return {
    binaryPreSha256: left.binaryPreSha256,
    binaryCopyPreSha256: left.binaryCopyPreSha256,
    binaryCopyPostSha256: pickFirstDefined(left.binaryCopyPostSha256, right.binaryCopyPostSha256),
    binaryPostSha256: pickFirstDefined(left.binaryPostSha256, right.binaryPostSha256),
  };
}

function pickFirstDefined(left: string | undefined, right: string | undefined): string | undefined {
  if (left !== undefined) return left;
  return right;
}

function indexByIdentityKey(artifacts: readonly SnapshotArtifact[]): Map<string, SnapshotArtifact> {
  const out = new Map<string, SnapshotArtifact>();
  for (const artifact of artifacts) {
    if (out.has(artifact.identityKey)) {
      // Per DESIGN §"Identity precedence": duplicate identity keys are an
      // incomplete-evidence finding, never a silent overwrite. Throw here so
      // the WU-2 collector can convert the throw into a `DUPLICATE_IDENTITY_KEY`
      // completeness reason without dropping evidence.
      throw new TypeError(`Duplicate identity key in snapshot: ${artifact.identityKey}`);
    }
    out.set(artifact.identityKey, artifact);
  }
  return out;
}
