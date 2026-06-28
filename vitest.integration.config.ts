import { defineConfig } from "vitest/config";

delete process.env.DYSFLOW_HOME;

export default defineConfig({
  test: {
    include: [
      "test/e2e/**/*.test.ts",
      "test/integration/**/*.test.ts",
      "test/scripts-access-runner.test.ts",
      "test/scripts-vba-manager.test.ts",
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
    // spawn UNKNOWN (errno -4094). One fork, files executed sequentially
    // (issue #562): `singleFork` keeps a single fork process alive and
    // `fileParallelism: false` prevents Vitest from scheduling multiple files
    // inside that one fork, which would still contend on the Access ROT.
    globalSetup: "./vitest.integration.global-setup.ts",
    testTimeout: 300_000,
    hookTimeout: 60_000,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    fileParallelism: false,
    maxWorkers: 1,
  },
});
