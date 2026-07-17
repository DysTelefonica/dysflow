import { isRecord } from "../../core/utils/index.js";

/**
 * issue #951 — decide whether an import's structured `DYSFLOW_RESULT` payload
 * reports at least one per-module failure, independent of the process exit
 * code.
 *
 * This is deliberately the inverse concern of `importOutputIsFullySuccessful`
 * (#861, `vba-sync-adapter.ts`): that helper needs positive proof of success
 * to OVERRIDE a non-zero exit; this one needs positive proof of failure to
 * VETO a zero exit. The asymmetry matters for the empty payload: an
 * `import_all` explicit-empty no-op plan legitimately emits `[]` with exit 0
 * and MUST remain a success, so an empty array (or any payload without
 * `ok`/`status` markers) reports NO failure here.
 *
 * Recognized failure shapes:
 *   - the failure envelope `{ok:false, error, modules}`,
 *   - a bare per-module record whose `status` is not `"ok"` (PowerShell
 *     unwraps a single-element array on ConvertTo-Json),
 *   - an array containing at least one record entry whose `status` is not
 *     `"ok"`.
 */
export function importOutputReportsModuleFailure(parsedOutput: unknown): boolean {
  const moduleReportsFailure = (entry: unknown): boolean =>
    isRecord(entry) && "status" in entry && entry.status !== "ok";

  if (Array.isArray(parsedOutput)) {
    return parsedOutput.some(moduleReportsFailure);
  }
  if (isRecord(parsedOutput)) {
    if (parsedOutput.ok === false) return true;
    return moduleReportsFailure(parsedOutput);
  }
  return false;
}
