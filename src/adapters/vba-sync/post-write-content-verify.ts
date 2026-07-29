/**
 * Round-14 regression fix — issue #1228 bug 1.
 *
 * `import_modules` with `importMode:"Code"` (or any mode) MUST verify
 * post-write that the binary's stored module content actually reflects
 * the source on disk. Without this check, the runner can report
 * `status:ok` + `mismatchReason:null` + `SHA source == destination` while
 * the binary is stale (round-5 #1040 documented the same shape for
 * `Auto` mode; the fix never covered `Code` mode).
 *
 * This helper is the single chokepoint the runner consults after every
 * write. It compares the stored module's hash to the source's hash. If
 * they differ, it returns `mismatchReason: "content_hash"` so the
 * envelope surfaces an honest verdict. If they match, the helper
 * confirms the write landed and returns `mismatchReason: null`.
 *
 * The helper is pure: it never reaches the file system, the runner, or
 * the Access COM port. The adapter reads both texts (source from disk,
 * stored module from the binary) and passes them in. This keeps the
 * reconciliation testable at the port and refactor-safe.
 *
 * The shape is additive: existing call sites that only need a yes/no
 * answer can read `reconciled`; new call sites that need to surface
 * the reason can branch on `mismatchReason`. The expected/observed
 * hash fields are stable for the contract so a consumer can introspect
 * what the runner saw.
 */

export type PostWriteMismatchReason =
  | "content_hash"
  | "missing_stored_module"
  | "missing_source_text";

export type PostWriteReconcileInput = {
  moduleName: string;
  sourceText: string;
  sourceSha256: string;
  storedModuleText: string | null;
  storedModuleSha256: string | null;
};

export type PostWriteReconcileResult = {
  reconciled: boolean;
  mismatchReason: PostWriteMismatchReason | null;
  expectedSha256: string;
  observedSha256: string | null;
};

export function reconcilePostWriteModuleContent(
  input: PostWriteReconcileInput,
): PostWriteReconcileResult {
  if (input.sourceText.length === 0) {
    return {
      reconciled: false,
      mismatchReason: "missing_source_text",
      expectedSha256: input.sourceSha256,
      observedSha256: input.storedModuleSha256,
    };
  }
  if (
    input.storedModuleText === null ||
    input.storedModuleSha256 === null ||
    input.storedModuleText.length === 0
  ) {
    return {
      reconciled: false,
      mismatchReason: "missing_stored_module",
      expectedSha256: input.sourceSha256,
      observedSha256: null,
    };
  }
  if (input.sourceSha256 !== input.storedModuleSha256) {
    return {
      reconciled: false,
      mismatchReason: "content_hash",
      expectedSha256: input.sourceSha256,
      observedSha256: input.storedModuleSha256,
    };
  }
  return {
    reconciled: true,
    mismatchReason: null,
    expectedSha256: input.sourceSha256,
    observedSha256: input.storedModuleSha256,
  };
}
