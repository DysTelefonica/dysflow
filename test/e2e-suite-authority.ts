/** Cheap, in-process tests that belong to the default suite on every change. */
export const UNIT_E2E_TESTS = [
  "test/e2e/get-capabilities-write-policy-propagation.e2e.test.ts",
  "test/e2e/mcp-catalog-dryrun.e2e.test.ts",
  "test/e2e/mcp-harness-watchdog.e2e.test.ts",
  "test/e2e/mcp-input-validation.e2e.test.ts",
  "test/e2e/mcp-orphan-cleanup.e2e.test.ts",
  "test/e2e/mcp-query-validation.e2e.test.ts",
  "test/e2e/runtime-guard-mcp-integration.e2e.test.ts",
  "test/integration/dysflow-result-writer-contract.test.ts",
  "test/integration/global-setup-temp-sweep.test.ts",
] as const;

/** Hosted-Windows smoke tests that are useful before merge. */
export const PR_SMOKE_TESTS = [
  "test/e2e/access-fixture.e2e.test.ts",
  "test/e2e/access-relink-directory-apply.test.ts",
  "test/e2e/access-relink-directory.test.ts",
  "test/integration/form-ir-mutation-preservation.test.ts",
  "test/integration/mcp-harness-process-tree.test.ts",
  "test/integration/vba-manager-sentinel-trap.test.ts",
] as const;

/** Real-Access tests serialized on the self-hosted nightly runner. */
export const NIGHTLY_ACCESS_TESTS = [
  "test/e2e/access-runner-readlock.e2e.test.ts",
  "test/e2e/form-codebehind-stale-import.e2e.test.ts",
  "test/e2e/form-import-self-healing-958.e2e.test.ts",
  "test/e2e/form-set-property-second-call-957.e2e.test.ts",
  "test/e2e/import-export-unicode.e2e.test.ts",
  "test/e2e/import-modules-broken-project.e2e.test.ts",
  "test/e2e/import-modules-long-list.e2e.test.ts",
  "test/e2e/import-modules-regression.e2e.test.ts",
  "test/e2e/run-vba-procedure-exists-after-import-1440.e2e.test.ts",
  "test/integration/access-relink-apply.test.ts",
  "test/integration/dysflow-access-runner-password.test.ts",
  "test/integration/form-ir-loadfromtext.test.ts",
  "test/integration/vba-manager-export-import.test.ts",
  "test/integration/vba-modules-import-grow-in-place.e2e.test.ts",
  "test/integration/vba-modules-import-verbose-truncation.e2e.test.ts",
  "test/integration/vba-source-comparison-real-fixture.test.ts",
] as const;

export const E2E_EXEMPTIONS: Readonly<Record<string, string>> = Object.freeze({
  "test/integration/form-template-clone-bench.test.ts":
    "manual benchmark with a gitignored real-form catalog; it is not a deterministic CI assertion",
});
