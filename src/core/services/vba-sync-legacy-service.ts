/**
 * @deprecated VbaSyncLegacyService has been extracted to the adapters layer.
 * Use VbaSyncLegacyAdapter from src/adapters/vba-sync/vba-sync-legacy-adapter.ts instead.
 * Leftover pure types and helpers are temporarily exported here for backwards compatibility.
 */

export * from "./vba-form-service.js";
export * from "./vba-import-plan.js";
export {
  collectVbaSourceFiles,
  compareSourceAgainstBinary,
  compareVbaSourceTrees,
  planReconcileBinary,
  type VbaReconcilePlanResult,
  type VbaSourceComparisonEntry,
  type VbaSourceComparisonFile,
  type VbaSourceDiffEntry,
  type VbaVerifyResult,
} from "./vba-source-comparison.js";
