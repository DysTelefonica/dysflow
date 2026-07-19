import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CONFIG_PATH = "vitest.integration.config.ts";

function readIntegrationConfig(): string {
  return readFileSync(CONFIG_PATH, "utf8");
}

describe("integration suite configuration (#562)", () => {
  it("serializes Access COM tests with fileParallelism false + maxWorkers 1", () => {
    const config = readIntegrationConfig();

    // Vitest 4 removed `poolOptions.forks.singleFork`; the serialization
    // contract that guarantees one live Access instance at a time is now
    // `fileParallelism: false` (no concurrent file scheduling) plus
    // `maxWorkers: 1` (a single fork worker). See #562 and the quality
    // round that dropped the dead poolOptions block.
    expect(config).toContain('pool: "forks"');
    expect(config).toMatch(/fileParallelism:\s*false/);
    expect(config).toMatch(/maxWorkers:\s*1/);
    // The comment may still MENTION poolOptions (explaining its removal);
    // only an actual config block would resurrect the dead Vitest 3 shape.
    expect(config).not.toMatch(/poolOptions:\s*\{/);
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
