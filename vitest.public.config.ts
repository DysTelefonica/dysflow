/**
 * Public test suite config — Issue #979.
 *
 * This is a separate Vitest config from the internal `vitest.config.ts` /
 * `vitest.integration.config.ts`. The internal suites cover implementation
 * detail and stay under `test/`; the public suite under `tests/` documents
 * the observable MCP contract that consumers (AI agents, third-party
 * integrations) depend on for upgrade verification.
 *
 * Why separate:
 *   - `vitest.config.ts` excludes `test/e2e/**` and runs the lockfile-private
 *     internal unit/integration surface. The public suite is intentionally
 *     separated so it can be invoked as `pnpm test:public` from CI on every
 *     PR and every commit to `main`.
 *   - The public suite never spawns Access COM, PowerShell, or external
 *     processes — it stays fast enough to gate every PR.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    forbidOnly: true,
    include: [
      "tests/regression/**/*.spec.ts",
      "tests/contract/**/*.spec.ts",
      "tests/idempotency/**/*.spec.ts",
    ],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    environment: "node",
    // Windows process-spawn stability requires capped parallelism — see
    // vitest.config.ts for the same constraint on the internal suite.
    pool: "forks",
    maxWorkers: 1,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
