import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CONFIG_PATH = "vitest.integration.config.ts";

function readIntegrationConfig(): string {
  return readFileSync(CONFIG_PATH, "utf8");
}

describe("integration suite configuration (#562)", () => {
  it("serializes Access COM tests with singleFork + fileParallelism false", () => {
    const config = readIntegrationConfig();

    // Vitest with `maxWorkers: 1` alone is not enough: Vitest may still
    // schedule multiple files within a worker. `singleFork: true` +
    // `fileParallelism: false` is the contract that guarantees one live
    // Access instance at a time. See #562.
    expect(config).toContain('pool: "forks"');
    expect(config).toContain("singleFork: true");
    expect(config).toMatch(/fileParallelism:\s*false/);
  });

  it("references a globalSetup that sweeps stale dysflow-* temp sandboxes", () => {
    const config = readIntegrationConfig();

    const globalSetupMatch = config.match(/globalSetup:\s*["']([^"']+)["']/);
    expect(
      globalSetupMatch,
      "vitest.integration.config.ts must declare a globalSetup",
    ).not.toBeNull();
    const setupPath = globalSetupMatch?.[1] ?? "";
    expect(setupPath.length).toBeGreaterThan(0);

    // Resolve the path relative to the config file (cwd in vitest is repo root).
    expect(existsSync(setupPath), `globalSetup script ${setupPath} must exist`).toBe(true);

    const setupSource = readFileSync(setupPath, "utf8");
    // The setup must call or re-export a sweep helper that targets dysflow-* dirs.
    expect(setupSource).toMatch(/sweepStaleDysflowTempDirs|dysflow-\*/);
  });
});
