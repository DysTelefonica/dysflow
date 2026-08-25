import { defineConfig } from "vitest/config";
import { NIGHTLY_ACCESS_TESTS } from "./test/e2e-suite-authority.js";

delete process.env.DYSFLOW_HOME;

export default defineConfig({
  test: {
    forbidOnly: true,
    include: [...NIGHTLY_ACCESS_TESTS],
    environment: "node",
    globalSetup: "./vitest.integration.global-setup.ts",
    testTimeout: 300_000,
    hookTimeout: 60_000,
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
  },
});
