// Cheap regression pin for the MSACCESS.EXE zombie-leak class of bugs
// that surface after a heavy `node E2E_testing/mcp-e2e.mjs` run.
//
// The failure mode (`pid 29612` on 2026-06-29): MSACCESS.EXE outlives its
// dysflow CLI parent (the parent gets killed by `claude` / `node`
// timeouts / SIGTERM), the PID is NOT registered in `suiteOwnPids`
// because the harness registration path raced the COM teardown, and
// the `lingering-access-check` reports `clean` because it only polls
// `suiteOwnPids`. The PS runner that spawned the orphan never gets
// caught.
//
// The fix has two cheap layers:
//
//   1. (preferred) Sample the global MSACCESS.EXE count BEFORE the
//      battery starts and AFTER it ends. If the count grew, the
//      battery leaked a process that escaped the watch list — fail
//      the lingering-access-check row.
//
//   2. Cheap tests in this file assert the production code carries
//      the global-count sampling AND that the pass condition combines
//      the suite-owned check with the global count.
//
// Without these tests, a future refactor that reverts the fix (or
// accidentally drops one of the two checks) would re-introduce the
// silent-zombie leak. The unit-level pin runs in <100ms. The 30-minute
// heavy e2e would catch the leak on a real run, but at the cost of
// failing at the very end of the release workflow — exactly the class
// of regression this Session already paid once.

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

  it("samples MSACCESS.EXE count at battery start AND battery end (not just suite-owned)", () => {
    // The fix uses `(Get-Process -Name MSACCESS -ErrorAction SilentlyContinue).Count`
    // for both samples. The cheap test asserts both samples exist.
    const matches =
      src.match(/\(Get-Process\s+-Name\s+MSACCESS\s+-ErrorAction\s+SilentlyContinue\)\.Count/g) ??
      [];
    // Need at least 2 (the start sample + the end sample). Each sample
    // is exactly one count call. The cheap pin accepts 2 or more.
    expect(
      matches.length,
      `expected at least 2 (Get-Process -Name MSACCESS -ErrorAction SilentlyContinue).Count samples in mcp-e2e.mjs; found ${matches.length}. The global-count-before-and-after pin requires both the start sample and the post-battery sample. Without both, MSACCESS.EXE leaks outside suiteOwnPids are not caught.`,
    ).toBeGreaterThanOrEqual(2);
  });

  it("tracks a global MSACCESS.EXE delta across the battery", () => {
    // The fix records the start count in a `globalMsAccessCountAtStart`
    // variable and compares it against the post-battery count. The
    // delta must be computed and exposed.
    expect(src).toMatch(/globalMsAccessCountAtStart/);
    expect(src).toMatch(/globalMsAccessLeak/);
  });

  it("lingering-access-check row passes ONLY when BOTH suite-owned AND global delta are zero", () => {
    // Pin the combined `pass:` predicate. Reverting to the old form
    // `pass: !hasLingeringAccess` would re-introduce the leak class.
    const rowMatch = src.match(
      /appendUnchecked\(\{\s*area:\s*"zombies"\s*,\s*tool:\s*"lingering-access-check"[\s\S]*?\}\s*\)/,
    );
    expect(rowMatch, "lingering-access-check result emission not found").not.toBeNull();
    expect(
      rowMatch?.[0] ?? "",
      "lingering-access-check row's `pass` must combine the suite-owned check AND the global delta (= 0).",
    ).toMatch(/pass\s*:\s*!hasLingeringAccess\s*&&\s*globalMsAccessLeak\s*===\s*0/);
  });

  it("reports the global MSACCESS.EXE delta in the lingering-access-check summary when it is non-zero", () => {
    // Cheap pin: when the global count grew, the row's `summary` (and
    // any error message printed to stderr) must name `globalMsAccessLeak`
    // so the operator sees the leak from the report without having to
    // correlate against pre/post counts.
    const rowMatch = src.match(
      /appendUnchecked\(\{\s*area:\s*"zombies"\s*,\s*tool:\s*"lingering-access-check"[\s\S]*?\}\s*\)/,
    );
    expect(rowMatch?.[0] ?? "").toMatch(/globalMsAccessLeak/);
  });
});
