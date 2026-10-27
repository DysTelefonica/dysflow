/**
 * Last-synced base snapshot for `verify_code` direction (#1890).
 *
 * Two texts cannot give a direction for a changed value: `Width =2000` in the
 * source and `Width =1500` in the binary is one unique line on each side, so the
 * line diff reports `bothChanged`. A third state resolves it: the state both
 * sides last agreed on, recorded at each successful import/export. A side that
 * still matches that base did not change; the other side did.
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
import {
  canonicalizeVbaText,
  SEMANTIC_CLASSIFIER_RULES,
  type SemanticClassification,
} from "./vba-semantic-classifier.js";

/**
 * Version of the canonical form a base hash was computed with. An entry with a
 * different value is ignored, so a change to the canonicalizer or to the
 * classifier rules can never compare hashes of two different normal forms.
 */
export const VERIFY_BASE_CANON = `canon-v1/${SEMANTIC_CLASSIFIER_RULES}`;

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

/**
 * - `import`: the binary now holds the source of `sourceRoot`, so every base of
 *   the module (for any source root) is replaced by the new one.
 * - `export`: the source root now holds the binary; the binary did not change,
 *   so only this source root's base for the module is replaced.
 */
export type VerifyBaseWriteKind = "import" | "export";

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
 * Applies a successful write to a record. Entries for modules outside
 * `moduleNames` are kept untouched.
 */
export function applyVerifyBaseWrite(
  record: VerifyBaseRecord,
  write: {
    kind: VerifyBaseWriteKind;
    sourceRoot: string;
    moduleNames: readonly string[];
    entries: readonly VerifyBaseEntry[];
  },
): VerifyBaseRecord {
  const written = new Set(write.moduleNames.map((name) => name.toLowerCase()));
  const kept = record.entries.filter((entry) => {
    if (!written.has(entry.moduleName.toLowerCase())) return true;
    return write.kind === "export" && entry.sourceRoot !== write.sourceRoot;
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

/**
 * Refines the direction of an actionable classification with the base.
 *
 * Only positive evidence is used: when exactly one side's canonical hash equals
 * the base, that side did not change, and the classifier already established a
 * functional difference, so the other side is the one that changed. Any other
 * combination (no base, both sides match, neither matches) keeps the two-text
 * verdict. Non-actionable classifications are never touched.
 */
export function resolveDirectionAgainstBase(
  classification: SemanticClassification,
  hashes: { base: string | undefined; source: string; binary: string },
): SemanticClassification {
  if (!classification.actionable || hashes.base === undefined) return classification;
  const sourceMatches = hashes.source === hashes.base;
  const binaryMatches = hashes.binary === hashes.base;
  if (sourceMatches === binaryMatches) return classification;
  if (binaryMatches) {
    if (classification.classification === "sourceNewer") return classification;
    return {
      ...classification,
      classification: "sourceNewer",
      recommendation: "import_to_binary",
      reason: `${classification.reason}; the binary still matches the last-synced base, so the source changed`,
    };
  }
  if (classification.classification === "binaryNewer") return classification;
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
