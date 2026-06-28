import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    forbidOnly: true,
    include: [
      "test/cli/**/*.test.ts",
      "test/core/**/*.test.ts",
      "test/adapters/**/*.test.ts",
      "test/architecture/**/*.test.ts",
      "test/quality-gates/**/*.test.ts",
      "test/docs/**/*.test.ts",
      // Real-Access integration tests live in vitest.integration.config.ts so the
      // default unit run never spawns MSACCESS/PowerShell in parallel — concurrent
      // process spawning under the fork pool races and throws spawn UNKNOWN
      // (errno -4094) on Windows. Only the pure file-reading contract test, which
      // spawns nothing, stays in the fast unit run.
      "test/integration/dysflow-result-writer-contract.test.ts",
      // Pure-filesystem sweep helper test (#562). No Access, no PowerShell,
      // no COM — runs in the fast unit suite, not the integration pool.
      "test/integration/global-setup-temp-sweep.test.ts",
      "test/shared/**/*.test.ts",
    ],
    exclude: [
      "test/e2e/**",
    ],
    environment: "node",
    // Headroom for tests that coordinate real async barriers (lock serialization,
    // filesystem locks). The default 5s is too tight when the worker pool is
    // saturated under a full parallel run, causing load-induced timeout flakes (GH #375).
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["dist/**", "test/**", "**/*.test.ts", "vitest.config.ts"],
      // Branches threshold tuned to 78 to absorb the ~0.5pp CI flake on the
      // Linux runner where parallel v8 coverage collection under the fork pool
      // measurably differs from a single-worker local run (same source, same
      // tests, ~79.7% on Linux vs ~80.3% locally). Without the buffer the gate
      // flakes on every push even when no source changed. Raise again only
      // after pinning the runner's v8 worker count to match local.
      thresholds: {
        statements: 82,
        branches: 78,
        functions: 85,
        lines: 84
      }
    }
  }
});
