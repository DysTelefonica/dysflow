import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  E2E_EXEMPTIONS,
  NIGHTLY_ACCESS_TESTS,
  PR_SMOKE_TESTS,
  UNIT_E2E_TESTS,
} from "../e2e-suite-authority.js";

function discoveredTests(directory: string): string[] {
  return readdirSync(directory, { recursive: true })
    .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".test.ts"))
    .map((entry) => join(directory, entry).replaceAll("\\", "/"));
}

function workflowTestPaths(workflow: string): string[] {
  return [...workflow.matchAll(/(test\/(?:e2e|integration)\/\S+\.test\.ts)\b/g)].map(
    (match) => match[1] ?? "",
  );
}

const discovered = [...discoveredTests("test/e2e"), ...discoveredTests("test/integration")];
const classified = [
  ...UNIT_E2E_TESTS,
  ...PR_SMOKE_TESTS,
  ...NIGHTLY_ACCESS_TESTS,
  ...Object.keys(E2E_EXEMPTIONS),
];

describe("#1547 E2E suite execution authority", () => {
  it("classifies every E2E/integration Vitest file exactly once", () => {
    const duplicates = classified.filter((path, index) => classified.indexOf(path) !== index);
    expect(duplicates, `Multiple execution authorities: ${duplicates.join(", ")}`).toEqual([]);
    expect(classified.sort()).toEqual(discovered.sort());
  });

  it("keeps exemptions narrow, justified, and live", () => {
    for (const [path, reason] of Object.entries(E2E_EXEMPTIONS)) {
      expect(discovered).toContain(path);
      expect(reason.trim().length, `${path} has no exemption reason`).toBeGreaterThan(0);
    }
  });

  it("wires unit-owned tests into the default suite", () => {
    const config = readFileSync("vitest.config.ts", "utf8");
    expect(config).toContain("...UNIT_E2E_TESTS");
  });

  it("runs exactly the PR-smoke classification in hosted Windows CI", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect([...new Set(workflowTestPaths(workflow))].sort()).toEqual([...PR_SMOKE_TESTS].sort());
  });

  it("wires nightly Access tests without weakening the release battery", () => {
    const nightlyConfig = readFileSync("vitest.nightly-access.config.ts", "utf8");
    const nightlyWorkflow = readFileSync(".github/workflows/nightly-access-e2e.yml", "utf8");
    const releaseWorkflow = readFileSync(".github/workflows/release.yml", "utf8");

    expect(nightlyConfig).toContain("...NIGHTLY_ACCESS_TESTS");
    expect(nightlyWorkflow).toContain("vitest.nightly-access.config.ts");
    expect(nightlyWorkflow).toContain("DYSFLOW_RUN_ACCESS_RELINK_APPLY: '1'");
    expect(nightlyWorkflow).toMatch(/DYSFLOW_ACCESS_TEST_ROOT:\s*\$\{\{ runner\.temp \}\}/);
    expect(releaseWorkflow).toContain("pnpm test:e2e:mcp:release");
  });
});
