/**
 * Records the last-synced base snapshot after a successful import/export (#1890).
 * Kept apart from `vba-verify-base.ts` so the comparison service can depend on
 * the base logic without an import cycle through the source collector.
 */

import type { Diagnostic } from "../contracts/index.js";
import { type ComparisonFileSystemPort, collectVbaSourceFiles } from "./vba-source-comparison.js";
import {
  applyVerifyBaseWrite,
  hashCanonicalVbaText,
  VERIFY_BASE_CANON,
  type VerifyBaseEntry,
  type VerifyBaseRecord,
  type VerifyBaseStorePort,
  type VerifyBaseTarget,
  type VerifyBaseWriteKind,
  verifyBasePathKey,
} from "./vba-verify-base.js";

/**
 * Records the base for the modules a write just synced. Best-effort: any failure
 * becomes a warning diagnostic and never fails the write that triggered it.
 */
export async function recordVerifyBase(input: {
  store: VerifyBaseStorePort;
  fileSystem: ComparisonFileSystemPort;
  target: VerifyBaseTarget;
  kind: VerifyBaseWriteKind;
  sourceRoot: string;
  moduleNames: readonly string[];
  now?: () => Date;
}): Promise<Diagnostic[]> {
  const { store, fileSystem, target, kind, moduleNames } = input;
  if (moduleNames.length === 0) return [];
  try {
    if (!(await store.available(target))) return [];
    const sourceRoot = verifyBasePathKey(input.sourceRoot);
    const filter = new Set(moduleNames.map((name) => name.toLowerCase()));
    const files = await collectVbaSourceFiles(input.sourceRoot, filter, fileSystem);
    const recordedAt = (input.now?.() ?? new Date()).toISOString();
    const entries: VerifyBaseEntry[] = [];
    for (const file of files) {
      const text = await fileSystem.readFile(file.path, "utf8");
      entries.push({
        sourceRoot,
        moduleName: file.moduleName,
        fileType: file.fileType,
        hash: hashCanonicalVbaText(text, file.fileType),
        canon: VERIFY_BASE_CANON,
        recordedAt,
      });
    }
    const accessPath = verifyBasePathKey(target.accessPath);
    const stored = await store.load(target);
    const current: VerifyBaseRecord =
      stored !== undefined && stored.accessPath === accessPath
        ? stored
        : { accessPath, entries: [] };
    await store.save(
      target,
      applyVerifyBaseWrite(current, { kind, sourceRoot, moduleNames, entries }),
    );
    return [];
  } catch (error) {
    return [
      {
        level: "warning",
        source: "verify-base",
        message: `The last-synced base snapshot was not updated; verify_code falls back to the two-text direction for ${moduleNames.join(", ")}: ${errorMessage(error)}`,
      },
    ];
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
