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
    ],
    exclude: [
      "test/e2e/**",
      "test/scripts-access-runner.test.ts",
    ],
    environment: "node",
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["dist/**", "test/**", "**/*.test.ts", "vitest.config.ts"],
      thresholds: {
        statements: 86,
        branches: 75,
        functions: 88,
        lines: 86
      }
    }
  }
});