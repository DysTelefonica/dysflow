// Wiring anchor only: behavioral ownership and PID-reuse proofs live in
// access-leak-start-snapshot-1978.test.ts. A global process delta is not
// ownership; the harness combines its child checks with positively attributed
// survivors from the suite-local operation registry.

// @ts-nocheck — pure source-file lint against a `.mjs`.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MCP_E2E_PATH = resolve(process.cwd(), "E2E_testing/mcp-e2e.mjs");

function readSource(): string {
  return readFileSync(MCP_E2E_PATH, "utf8");
}

describe("mcp-e2e.mjs — global MSACCESS.EXE leak guard (#fix-msaccess-global-zombie-leak)", () => {
  const src = readSource();

  it("takes the start snapshot before the first scenario, not after the battery (#1978)", () => {
    // The start snapshot is the #1974 preflight's own process-table read. Before #1978 the
    // "start" count was sampled after `runBattery` returned, so leakDelta compared two
    // after-run counts and never fired. Pin the order: preflight, then battery, then the
    // leak computation against the preflight snapshot.
    const preflightAt = src.indexOf("const accessPreflight = runAccessPreflight(");
    const batteryAt = src.indexOf("await runBattery();");
    const startAt = src.indexOf("const globalMsAccessAtStart = accessPreflight.snapshot;");
    expect(preflightAt, "preflight read not found").toBeGreaterThan(-1);
    expect(batteryAt, "runBattery call not found").toBeGreaterThan(-1);
    expect(startAt, "start snapshot must come from the preflight").toBeGreaterThan(-1);
    expect(preflightAt).toBeLessThan(batteryAt);
    expect(src).toMatch(
      /computeAccessLeak\(\{\s*start:\s*globalMsAccessAtStart,\s*end:\s*snapshotAccessProcesses\(\)/,
    );
    expect(src).not.toMatch(/DYSFLOW_E2E_PRE_MSACCESS_COUNT/);
    expect(src).toMatch(
      /ownership:\s*await readSuiteAccessOwnership\(\{ projectRoot: tempRoot, accessPath \}\)/,
    );
  });

  it("tracks positively attributed Access survivors across the battery", () => {
    expect(src).toMatch(/globalMsAccessLeak\s*=\s*globalMsAccessLeakCheck\.leakDelta/);
  });

  it("lingering-access-check row passes ONLY when BOTH suite-owned AND attributed survivor count are zero", () => {
    // Pin the combined `pass:` predicate. Reverting to the old form
    // `pass: !hasLingeringAccess` would re-introduce the leak class.
    const rowMatch = src.match(
      /appendUnchecked\(\{\s*area:\s*"zombies"\s*,\s*tool:\s*"lingering-access-check"[\s\S]*?\}\s*\)/,
    );
    expect(rowMatch, "lingering-access-check result emission not found").not.toBeNull();
    expect(
      rowMatch?.[0] ?? "",
      "lingering-access-check row's `pass` must combine the suite-owned check AND the attributed survivor count (= 0).",
    ).toMatch(/pass\s*:\s*!hasLingeringAccess\s*&&\s*globalMsAccessLeak\s*===\s*0/);
  });

  it("reports the global MSACCESS.EXE delta in the lingering-access-check summary when it is non-zero", () => {
    // Cheap pin: when the attributed survivor count grew, the row's `summary` (and
    // any error message printed to stderr) must name `globalMsAccessLeak`
    // so the operator sees the leak from the report without having to
    // correlate against pre/post counts.
    const rowMatch = src.match(
      /appendUnchecked\(\{\s*area:\s*"zombies"\s*,\s*tool:\s*"lingering-access-check"[\s\S]*?\}\s*\)/,
    );
    expect(rowMatch?.[0] ?? "").toMatch(/globalMsAccessLeak/);
  });
});
