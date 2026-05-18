import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
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
