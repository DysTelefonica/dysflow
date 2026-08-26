import { defineConfig } from "vitest/config";
import { UNIT_E2E_TESTS } from "./test/e2e-suite-authority.js";

export default defineConfig({
  test: {
    forbidOnly: true,
    include: [
      "test/cli/**/*.test.ts",
      "test/core/**/*.test.ts",
      "test/adapters/**/*.test.ts",
      "test/architecture/**/*.test.ts",
      "test/quality-gates/**/*.test.ts",
      "test/ci/**/*.test.ts",
      "test/docs/**/*.test.ts",
      // In-process/fake-port E2E contracts belong here so the cheapest suite
      // detects protocol regressions before hosted or real-Access execution.
      ...UNIT_E2E_TESTS,
      "test/shared/**/*.test.ts",
    ],
    environment: "node",
    // Bounded fork pool: Windows spawn stability requires capped parallelism.
    // Vitest 4 removed poolOptions/maxForks; maxWorkers is the top-level cap.
    // Keep the unit suite serialized in CI-like runs: the previous unbounded
    // worker pool intermittently exhausted Windows process-spawn resources.
    pool: "forks",
    maxWorkers: 1,
    // Headroom for tests that coordinate real async barriers (lock serialization,
    // filesystem locks). The default 5s is too tight when the worker pool is
    // saturated under a full parallel run, causing load-induced timeout flakes (GH #375).
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: "v8",
      // Coverage result processing has its own concurrency limit; maxWorkers
      // only serializes test execution. Pin both so one commit produces the
      // same coverage measurement regardless of host CPU availability.
      processingConcurrency: 1,
      reportsDirectory: "coverage",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["dist/**", "test/**", "**/*.test.ts", "vitest.config.ts"],
      // The historical branch floor is restored after repeated coverage runs
      // converged near 80.5%, leaving roughly 0.5 percentage points of margin.
      thresholds: {
        statements: 82,
        branches: 80,
        functions: 85,
        lines: 84
      }
    }
  }
});
