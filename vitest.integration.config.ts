import { defineConfig } from "vitest/config";

delete process.env.DYSFLOW_HOME;

export default defineConfig({
  test: {
    include: [
      "test/e2e/**/*.test.ts",
      "test/scripts-access-runner.test.ts",
      "test/scripts-vba-manager.test.ts",
    ],
    environment: "node",
  },
});
