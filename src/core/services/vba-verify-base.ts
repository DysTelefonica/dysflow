/**
 * Last-synced base snapshot for `verify_code` direction (#1890).
 *
 * Two texts cannot give a direction for a changed value: `Width =2000` in the
 * source and `Width =1500` in the binary is one unique line on each side, so the
 * line diff reports `bothChanged`. A third state breaks that tie: the state both
 * sides last provably agreed on. A side that still matches it did not change;
 * the other side did. Only `bothChanged` is ever resolved.
 *
 * A base is recorded only from evidence that both sides held the same content:
 * a successful export (it writes the source from the binary) or a `verify_code`
 * run that saw identical canonical hashes. Imports record nothing: the source
 * says what was sent, not what the binary kept.
 *
 * The base is local, unversioned runtime state. It stores a SHA-256 of each
 * artifact's single-side canonical text (`canonicalizeVbaText`), never the
 * source. Losing it falls back to the two-text verdict.
 *
 * Pure domain logic: persistence goes through {@link VerifyBaseStorePort}.
 */

import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { Diagnostic } from "../contracts/index.js";
import { canonicalizeVbaText, type SemanticClassification } from "./vba-semantic-classifier.js";

/**
 * Version of the canonical form a base hash was computed with, independent of
 * the classifier's `SEMANTIC_CLASSIFIER_RULES`. An entry with a different value
 * is ignored, so two different normal forms are never compared. BUMP THIS when
 * `canonicalizeVbaText` changes.
 */
export const VERIFY_BASE_CANON = "verify-base-canon/v2";

/** One artifact both sides agreed on, for one source root of one binary. */
export type VerifyBaseEntry = {
  /** Normalized source root the artifact was read from (see `verifyBasePathKey`). */
  sourceRoot: string;
  moduleName: string;
  fileType: string;
  /** Lowercase hex SHA-256 of `canonicalizeVbaText(text, fileType)`. */
  hash: string;
  canon: string;
  recordedAt: string;
};

/** Everything recorded for one target binary. */
export type VerifyBaseRecord = {
  /** Normalized identity of the binary the record belongs to. */
  accessPath: string;
  entries: VerifyBaseEntry[];
};

/** Identifies the binary whose base is read or written. */
export type VerifyBaseTarget = {
  accessPath: string;
  projectRoot?: string;
};

/**
 * Persistence port. `available` is false when the project has no local state
 * folder; the store then neither reads nor writes. Implementations may throw on
 * I/O errors; callers in this module treat every throw as "no base".
 */
export interface VerifyBaseStorePort {
  available(target: VerifyBaseTarget): Promise<boolean>;
  load(target: VerifyBaseTarget): Promise<VerifyBaseRecord | undefined>;
  save(target: VerifyBaseTarget, record: VerifyBaseRecord): Promise<void>;
}

/** Base hashes for one source root, keyed by {@link verifyBaseModuleKey}. */
export type VerifyBaseLookup = ReadonlyMap<string, string>;

/** Path identity: absolute, forward slashes, case-folded on Windows. */
export function verifyBasePathKey(path: string): string {
  const absolute = resolve(path).replace(/\\/g, "/");
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

/** VBA names are case-insensitive; the file type separates `.cls` from `.form.txt`. */
export function verifyBaseModuleKey(moduleName: string, fileType: string): string {
  return `${moduleName.toLowerCase()}\0${fileType.toLowerCase()}`;
}

export function hashCanonicalVbaText(text: string, fileType: string): string {
  return createHash("sha256").update(canonicalizeVbaText(text, fileType), "utf8").digest("hex");
}

/**
 * Applies a successful export to a record. The source root now holds the
 * binary's content and the binary did not change, so only this source root's
 * entries for the exported modules are replaced; everything else is kept.
 */
export function applyVerifyBaseWrite(
  record: VerifyBaseRecord,
  write: {
    sourceRoot: string;
    moduleNames: readonly string[];
    entries: readonly VerifyBaseEntry[];
  },
): VerifyBaseRecord {
  const written = new Set(write.moduleNames.map((name) => name.toLowerCase()));
  const kept = record.entries.filter((entry) => {
    if (!written.has(entry.moduleName.toLowerCase())) return true;
    return entry.sourceRoot !== write.sourceRoot;
  });
  return { accessPath: record.accessPath, entries: [...kept, ...write.entries] };
}

/**
 * Loads the base hashes recorded for `sourceRoot` on the target binary. Returns
 * `undefined` when there is no usable base; a read failure is reported as a
 * diagnostic, never as a failure of the comparison.
 */
export async function loadVerifyBaseLookup(
  store: VerifyBaseStorePort | undefined,
  target: VerifyBaseTarget,
  sourceRoot: string,
): Promise<{ lookup?: VerifyBaseLookup; diagnostics: Diagnostic[] }> {
  if (store === undefined) return { diagnostics: [] };
  try {
    if (!(await store.available(target))) return { diagnostics: [] };
    const record = await store.load(target);
    if (record === undefined || record.accessPath !== verifyBasePathKey(target.accessPath)) {
      return { diagnostics: [] };
    }
    const root = verifyBasePathKey(sourceRoot);
    const lookup = new Map<string, string>();
    for (const entry of record.entries) {
      if (entry.sourceRoot !== root || entry.canon !== VERIFY_BASE_CANON) continue;
      lookup.set(verifyBaseModuleKey(entry.moduleName, entry.fileType), entry.hash);
    }
    return lookup.size > 0 ? { lookup, diagnostics: [] } : { diagnostics: [] };
  } catch (error) {
    return {
      diagnostics: [
        {
          level: "warning",
          source: "verify-base",
          message: `verify_code could not read the last-synced base snapshot; direction falls back to the two-text comparison: ${errorMessage(error)}`,
        },
      ],
    };
  }
}

/** One artifact whose two sides `verify_code` observed with identical canonical hashes. */
export type VerifyBaseAgreement = { moduleName: string; fileType: string; hash: string };

/**
 * Records the artifacts `verify_code` just observed agreeing. Both sides were
 * read in the same run, so this is the strongest evidence of a shared state.
 * Only this source root's entries for those artifacts change. Nothing is
 * written when every hash is already recorded. Best-effort: a failure becomes a
 * warning diagnostic.
 */
export async function recordVerifyBaseAgreement(
  store: VerifyBaseStorePort | undefined,
  target: VerifyBaseTarget,
  sourceRoot: string,
  agreed: readonly VerifyBaseAgreement[],
  now: () => Date = () => new Date(),
): Promise<Diagnostic[]> {
  if (store === undefined || agreed.length === 0) return [];
  try {
    if (!(await store.available(target))) return [];
    const root = verifyBasePathKey(sourceRoot);
    const accessPath = verifyBasePathKey(target.accessPath);
    const stored = await store.load(target);
    const current: VerifyBaseRecord =
      stored !== undefined && stored.accessPath === accessPath
        ? stored
        : { accessPath, entries: [] };
    const known = new Set(
      current.entries
        .filter((entry) => entry.sourceRoot === root && entry.canon === VERIFY_BASE_CANON)
        .map((entry) => `${verifyBaseModuleKey(entry.moduleName, entry.fileType)}\0${entry.hash}`),
    );
    const fresh = agreed.filter(
      (item) => !known.has(`${verifyBaseModuleKey(item.moduleName, item.fileType)}\0${item.hash}`),
    );
    if (fresh.length === 0) return [];
    const freshKeys = new Set(
      fresh.map((item) => verifyBaseModuleKey(item.moduleName, item.fileType)),
    );
    const recordedAt = now().toISOString();
    await store.save(target, {
      accessPath,
      entries: [
        ...current.entries.filter(
          (entry) =>
            entry.sourceRoot !== root ||
            !freshKeys.has(verifyBaseModuleKey(entry.moduleName, entry.fileType)),
        ),
        ...fresh.map((item) => ({
          sourceRoot: root,
          moduleName: item.moduleName,
          fileType: item.fileType,
          hash: item.hash,
          canon: VERIFY_BASE_CANON,
          recordedAt,
        })),
      ],
    });
    return [];
  } catch (error) {
    return [
      {
        level: "warning",
        source: "verify-base",
        message: `verify_code could not update the last-synced base snapshot: ${errorMessage(error)}`,
      },
    ];
  }
}

/**
 * Breaks a `bothChanged` tie with the base. Nothing else is ever changed.
 *
 * When exactly one side's canonical hash equals the base, that side did not
 * change, so the other side did. A two-text `sourceNewer` / `binaryNewer` is
 * never overridden: a base can be wrong (an import that reported ok without
 * persisting, a restored backup), and overriding a one-sided verdict could
 * point a sync at the side that holds unsynced work.
 */
export function resolveDirectionAgainstBase(
  classification: SemanticClassification,
  hashes: { base: string | undefined; source: string; binary: string },
): SemanticClassification {
  if (classification.classification !== "bothChanged" || hashes.base === undefined) {
    return classification;
  }
  const sourceMatches = hashes.source === hashes.base;
  const binaryMatches = hashes.binary === hashes.base;
  if (sourceMatches === binaryMatches) return classification;
  if (binaryMatches) {
    return {
      ...classification,
      classification: "sourceNewer",
      recommendation: "import_to_binary",
      reason: `${classification.reason}; the binary still matches the last-synced base, so the source changed`,
    };
  }
  return {
    ...classification,
    classification: "binaryNewer",
    recommendation: "export_to_src",
    reason: `${classification.reason}; the source still matches the last-synced base, so the binary changed`,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
