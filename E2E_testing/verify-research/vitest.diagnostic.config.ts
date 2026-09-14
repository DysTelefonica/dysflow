import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    include: ["E2E_testing/verify-research/import-class-diagnostic.test.ts"],
    environment: "node",
    pool: "forks",
    maxWorkers: 1,
  },
});
