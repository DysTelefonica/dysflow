import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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
      "test/shared/**/*.test.ts",
      "test/scripts-vba-manager.test.ts",
    ],
    exclude: [
      "test/e2e/**",
      "test/scripts-access-runner.test.ts",
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
      thresholds: {
        statements: 82,
        branches: 80,
        functions: 85,
        lines: 84
      }
    }
  }
});