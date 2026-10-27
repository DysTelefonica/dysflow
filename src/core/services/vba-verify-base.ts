/**
 * Last-synced base snapshot for `verify_code` direction (#1890).
 *
 * Two texts cannot give a direction for a changed value: `Width =2000` in the
 * source and `Width =1500` in the binary is one unique line on each side, so the
 * line diff reports `bothChanged`. A third state breaks that tie: the state both
 * sides last provably agreed on. A side that still matches it did not change;
 * the other side did. Only `bothChanged` is ever resolved, and the result is
 * marked `resolvedBy: "base"` so no consumer applies it without confirmation.
 *
 * A base is recorded only when a `verify_code` run reads both sides and sees
 * identical canonical hashes. Every import, delete or export of a module
 * invalidates its base: the write changed one side, and the runner cannot say
 * exactly which files it wrote or kept.
 *
 * Entries and invalidations carry timestamps, and an entry observed at or
 * before an invalidation of its module is ignored at read time. A writer that
 * observed agreement before an import, but wrote after it, can therefore never
 * restore a stale hash, whatever order the writes land in.
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

/** Detail attached to every base-resolved entry and to its sync_binary skip. */
export const BASE_RESOLVED_DETAIL =
  "direction inferred from the last-synced base; confirm before applying (acceptBothChanged:true)";

/** One artifact both sides were observed agreeing on, for one source root of one binary. */
export type VerifyBaseEntry = {
  /** Normalized source root the artifact was read from (see `verifyBasePathKey`). */
  sourceRoot: string;
  moduleName: string;
  fileType: string;
  /** Lowercase hex SHA-256 of `canonicalizeVbaText(text, fileType)`. */
  hash: string;
  canon: string;
  /** ISO time the observing `verify_code` run started. */
  observedAt: string;
};

/** A write touched `moduleName` (or every module, when null) at `invalidatedAt`. */
export type VerifyBaseInvalidation = {
  moduleName: string | null;
  invalidatedAt: string;
};

/** Identifies the binary whose base is read or written. */
export type VerifyBaseTarget = {
  accessPath: string;
  projectRoot?: string;
};

/**
 * Persistence port. `available` is false when the project has no local state
 * folder; the store then neither reads nor writes. Every write must be atomic
 * and touch only its own key, so concurrent writers never drop each other's
 * entries. Implementations may throw on I/O errors; callers in this module turn
 * every throw into a warning diagnostic.
 */
export interface VerifyBaseStorePort {
  available(target: VerifyBaseTarget): Promise<boolean>;
  list(target: VerifyBaseTarget): Promise<{
    entries: VerifyBaseEntry[];
    invalidations: VerifyBaseInvalidation[];
  }>;
  /** Stores one entry, replacing only the entry with the same source root, module and file type. */
  put(target: VerifyBaseTarget, entry: VerifyBaseEntry): Promise<void>;
  /** Records an invalidation; an older invalidation of the same scope is replaced. */
  invalidate(target: VerifyBaseTarget, invalidation: VerifyBaseInvalidation): Promise<void>;
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

/**
 * Scope a write invalidates. A form is written under its file name (`frmX`) or
 * its Access document name (`Form_frmX`), and its entries may carry either, so
 * both fold to the prefix-free name. Folding a standard module that really is
 * named `Form_X` onto `X` only over-invalidates, which is always safe.
 */
function invalidationScopeKey(moduleName: string): string {
  return moduleName.toLowerCase().replace(/^(form_|report_)/, "");
}

export function hashCanonicalVbaText(text: string, fileType: string): string {
  return createHash("sha256").update(canonicalizeVbaText(text, fileType), "utf8").digest("hex");
}

/**
 * Keeps the entries still valid for `sourceRoot`: current canonical form, and
 * observed strictly after the latest invalidation of their module (or of every
 * module). For a key seen twice, the latest observation wins.
 */
function validEntries(
  listed: { entries: readonly VerifyBaseEntry[]; invalidations: readonly VerifyBaseInvalidation[] },
  sourceRoot: string,
): Map<string, VerifyBaseEntry> {
  let all = Number.NEGATIVE_INFINITY;
  const byModule = new Map<string, number>();
  for (const invalidation of listed.invalidations) {
    const time = Date.parse(invalidation.invalidatedAt);
    if (Number.isNaN(time)) continue;
    if (invalidation.moduleName === null) {
      all = Math.max(all, time);
    } else {
      const key = invalidationScopeKey(invalidation.moduleName);
      byModule.set(key, Math.max(byModule.get(key) ?? Number.NEGATIVE_INFINITY, time));
    }
  }
  const valid = new Map<string, VerifyBaseEntry>();
  for (const entry of listed.entries) {
    if (entry.sourceRoot !== sourceRoot || entry.canon !== VERIFY_BASE_CANON) continue;
    const observed = Date.parse(entry.observedAt);
    const cutoff = Math.max(all, byModule.get(invalidationScopeKey(entry.moduleName)) ?? all);
    if (Number.isNaN(observed) || observed <= cutoff) continue;
    const key = verifyBaseModuleKey(entry.moduleName, entry.fileType);
    const current = valid.get(key);
    if (current === undefined || Date.parse(current.observedAt) < observed) valid.set(key, entry);
  }
  return valid;
}

/**
 * Loads the base hashes recorded for `sourceRoot` on the target binary. Returns
 * no lookup when there is no usable base; a read failure is reported as a
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
    const valid = validEntries(await store.list(target), verifyBasePathKey(sourceRoot));
    if (valid.size === 0) return { diagnostics: [] };
    const lookup = new Map<string, string>();
    for (const [key, entry] of valid) lookup.set(key, entry.hash);
    return { lookup, diagnostics: [] };
  } catch (error) {
    return {
      diagnostics: [
        warning(
          `verify_code could not read the last-synced base snapshot; direction falls back to the two-text comparison: ${errorMessage(error)}`,
        ),
      ],
    };
  }
}

/** One artifact whose two sides `verify_code` observed with identical canonical hashes. */
export type VerifyBaseAgreement = { moduleName: string; fileType: string; hash: string };

/**
 * Records the artifacts a `verify_code` run observed agreeing. `observedAt` is
 * the time that run started; an invalidation after it voids the entry at read
 * time. Entries already valid with the same hash are not rewritten.
 * Best-effort: a failure becomes a warning diagnostic.
 */
export async function recordVerifyBaseAgreement(
  store: VerifyBaseStorePort | undefined,
  target: VerifyBaseTarget,
  sourceRoot: string,
  agreed: readonly VerifyBaseAgreement[],
  observedAt: Date,
): Promise<Diagnostic[]> {
  if (store === undefined || agreed.length === 0) return [];
  try {
    if (!(await store.available(target))) return [];
    const root = verifyBasePathKey(sourceRoot);
    const valid = validEntries(await store.list(target), root);
    for (const item of agreed) {
      if (valid.get(verifyBaseModuleKey(item.moduleName, item.fileType))?.hash === item.hash) {
        continue;
      }
      await store.put(target, {
        sourceRoot: root,
        moduleName: item.moduleName,
        fileType: item.fileType,
        hash: item.hash,
        canon: VERIFY_BASE_CANON,
        observedAt: observedAt.toISOString(),
      });
    }
    return [];
  } catch (error) {
    return [
      warning(`verify_code could not update the last-synced base snapshot: ${errorMessage(error)}`),
    ];
  }
}

/**
 * Invalidates the base of the modules a write touched (`"all"` when the write
 * cannot name them). Deleting a base is always safe: verify_code falls back to
 * the two-text verdict. Best-effort: a failure becomes a warning diagnostic and
 * never fails the write.
 */
export async function invalidateVerifyBase(
  store: VerifyBaseStorePort | undefined,
  target: VerifyBaseTarget,
  moduleNames: readonly string[] | "all",
  at: Date,
): Promise<Diagnostic[]> {
  if (store === undefined) return [];
  try {
    if (!(await store.available(target))) return [];
    const invalidatedAt = at.toISOString();
    const scopes = moduleNames === "all" || moduleNames.length === 0 ? [null] : moduleNames;
    for (const moduleName of new Set(scopes)) {
      await store.invalidate(target, { moduleName, invalidatedAt });
    }
    return [];
  } catch (error) {
    return [
      warning(
        `The last-synced base snapshot could not be invalidated; verify_code may infer a direction from a stale base, which is never applied without confirmation: ${errorMessage(error)}`,
      ),
    ];
  }
}

/** A classification whose direction may have been inferred from the base. */
export type BaseAwareClassification = SemanticClassification & { resolvedBy?: "base" };

/**
 * Breaks a `bothChanged` tie with the base. Nothing else is ever changed.
 *
 * When exactly one side's canonical hash equals the base, that side did not
 * change, so the other side did. The result is marked `resolvedBy: "base"`: a
 * base can be wrong (a restored backup, a write made outside dysflow), so the
 * inferred direction is reported but must be confirmed before it is applied.
 * A two-text `sourceNewer` / `binaryNewer` is never overridden.
 */
export function resolveDirectionAgainstBase(
  classification: SemanticClassification,
  hashes: { base: string | undefined; source: string; binary: string },
): BaseAwareClassification {
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
      reason: `${classification.reason}; the binary still matches the last-synced base, so the source changed (${BASE_RESOLVED_DETAIL})`,
      resolvedBy: "base",
    };
  }
  return {
    ...classification,
    classification: "binaryNewer",
    recommendation: "export_to_src",
    reason: `${classification.reason}; the source still matches the last-synced base, so the binary changed (${BASE_RESOLVED_DETAIL})`,
    resolvedBy: "base",
  };
}

function warning(message: string): Diagnostic {
  return { level: "warning", source: "verify-base", message };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
