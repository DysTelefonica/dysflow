import { defineConfig } from "vitest/config";

delete process.env.DYSFLOW_HOME;

export default defineConfig({
  test: {
    forbidOnly: true,
    include: [
      "test/e2e/**/*.test.ts",
      "test/integration/**/*.test.ts",
    ],
    exclude: [
      // Pure contract test (reads scripts as text, spawns nothing) — it runs in
      // the fast unit suite, not here.
      "test/integration/dysflow-result-writer-contract.test.ts",
      // Pure-filesystem sweep helper test — runs in the fast unit suite (#562).
      "test/integration/global-setup-temp-sweep.test.ts",
    ],
    environment: "node",
    // Real Access/COM operations are slow and MUST NOT run concurrently: parallel
    // process spawning under the fork pool exhausts Windows handles and throws
    // spawn UNKNOWN (errno -4094). Files must execute sequentially (issue #562):
    // `maxWorkers: 1` caps the fork pool to a single worker and
    // `fileParallelism: false` prevents Vitest from scheduling multiple files
    // concurrently, which would contend on the Access ROT. (Vitest 4 removed
    // `poolOptions.forks.singleFork`; these two top-level options replace it.)
    globalSetup: "./vitest.integration.global-setup.ts",
    testTimeout: 300_000,
    hookTimeout: 60_000,
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
  },
});
