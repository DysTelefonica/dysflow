// Cheap pin tests for the mcp-e2e suite's structural contracts. Every
// failure mode below was discovered the hard way — by running the 30-min
// `node E2E_testing/mcp-e2e.mjs` battery and watching it abort or
// silently leak MSACCESS.EXE processes. Each pin here costs <100ms and
// catches the same regression class before the heavy suite has to.
//
// Tested contracts:
//   1. `verify_code` calls pass an explicit timeout >= 180s — the
//      131-component fixture needs >30s for the Access COM round trip.
//      Regression mode: removing `timeoutMs: 180000` re-introduces the
//      30s timeout default and the battery stops at verify_code.
//   2. `compile_vba` is called with `expected: "error"` because the
//      fixture binary has documented Unicode mojibake in 117 components.
//      Regression mode: flipping to `expected: "success"` (or removing
//      the option) re-introduces the abort at compile_vba.
//   3. `tools/list` is invoked via `record()` BEFORE
//      `advertised-tool-count` reads `list.response.result.tools`. Without
//      `const list = await record(...)` first, the advertised count is
//      silently 0 (the WU-D regression that surfaced in v1.11.0).
//   4. The e2e record context (`recordCtx`) is built from sandbox paths
//      (`tempRoot`, `accessPath`, `backendPath`) and NOT from the
//      project's source fixture paths. Regression mode: pointing the
//      sandbox at the source binary would corrupt the canonical fixture.
//   5. The final `lingering-access-check` row is appended to `rows` so
//      the report documents the orphan-count invariant. Regression
//      mode: removing the final check lets zombies escape undetected.
//   6. The harness captures `childPid` from every `runMcpHarness` call
//      and registers it in `suiteOwnPids` — the predicate that the
//      zombie-check and final lingering check depend on.

// @ts-nocheck — pure source-file lint against a `.mjs`; no runtime contract.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPECTED_ADVERTISED_TOOL_COUNT } from "../../E2E_testing/_helpers/advertised-tool-count.mjs";

const MCP_E2E_PATH = resolve(process.cwd(), "E2E_testing/mcp-e2e.mjs");
const RECORD_PATH = resolve(process.cwd(), "E2E_testing/_helpers/mcp-e2e-record.mjs");

function readSource(p: string): string {
  return readFileSync(p, "utf8");
}

describe("mcp-e2e.mjs — verify_code timeout contracts (#fix-verify-code-timeout)", () => {
  const src = readSource(MCP_E2E_PATH);

  it("every verify_code call passes an explicit timeoutMs >= 180000", () => {
    // Greedy match: capture each verify_code record(...) invocation
    // including its closing paren. Matches against the literal 180000
    // budget so any future shrink is caught immediately.
    const calls = src.match(/record\(\s*"vba-sync"\s*,\s*"verify_code"[\s\S]*?\)/g) ?? [];
    expect(calls.length, "no verify_code record() calls found in mcp-e2e.mjs").toBeGreaterThan(0);
    for (const call of calls) {
      expect(call, `verify_code call missing timeoutMs >= 180000: ${call.slice(0, 200)}…`).toMatch(
        /timeoutMs\s*:\s*(?:18[0-9]{4}|2[0-9]{5,})/,
      );
    }
  });
});

// feat-759-no-compile (v1.19.0) — the compile_vba mojibake pin was
// retired. The runtime no longer compiles; the fixture binary's
// documented mojibake in 117 components is no longer surfaced as a
// structured runtime failure (the compile_vba tool is gone).
describe("mcp-e2e.mjs — compile_vba mojibake pin (REMOVED in v1.19.0)", () => {
  it("compile_vba is no longer called in mcp-e2e.mjs", () => {
    const src = readSource(MCP_E2E_PATH);
    const call = src.match(/record\(\s*"vba-sync"\s*,\s*"compile_vba"[\s\S]*?\)/);
    expect(
      call,
      "compile_vba should NOT be invoked in mcp-e2e.mjs after feat-759-no-compile",
    ).toBeNull();
  });
});

describe("mcp-e2e.mjs — advertised-tool-count sequence", () => {
  const src = readSource(MCP_E2E_PATH);

  it("invokes tools/list via record() before reading advertised.length", () => {
    // The WU-D regression (`da254b4`) deleted `const list = await record("protocol",
    // "tools/list");` and the try/catch silently swallowed the ReferenceError, so
    // advertised.length was always 0 and the e2e advertised-tool-count preflight
    // always failed (without stopping the battery, because preflight rows are
    // manual `rows.push` calls, not tool invocations). Pin the order via
    // regexes that match the actual code, not loose `indexOf` over the whole
    // file (which would catch comments too).
    const toolsListCallRegex = /record\(\s*"protocol"\s*,\s*"tools\/list"\s*\)/;
    const advertisedResultRegex =
      /addFailFastResult\(\{\s*area:\s*"protocol"\s*,\s*tool:\s*"advertised-tool-count"/;

    const toolsListMatch = src.match(toolsListCallRegex);
    const advertisedMatch = src.match(advertisedResultRegex);
    expect(toolsListMatch, 'no `record("protocol", "tools/list")` call found').not.toBeNull();
    expect(advertisedMatch, "no advertised-tool-count result emission found").not.toBeNull();
    // The actual record() invocation index must precede the result emission index.
    const toolsListIdx = toolsListMatch?.index ?? 0;
    const advertisedIdx = advertisedMatch?.index ?? 0;
    expect(
      toolsListIdx,
      `tools/list record() (idx ${toolsListIdx}) must precede advertised-tool-count rows.push (idx ${advertisedIdx})`,
    ).toBeLessThan(advertisedIdx);
  });

  it("expected count is sourced from the shared advertised-tool-count helper (matches the unit-test pin in advertised-tool-count.test.ts)", () => {
    // The unit test (test/adapters/mcp/advertised-tool-count.test.ts) and this
    // e2e both derive their expected count from E2E_testing/_helpers/advertised-tool-count.mjs.
    // We pin three structural contracts so drift cannot recur silently:
    //   1. mcp-e2e.mjs imports the helper module (it must use the same source of truth).
    //   2. mcp-e2e.mjs compares advertised.length against the helper constant.
    //   3. The unit pin also imports the helper instead of carrying a second numeric literal.
    //
    // If someone adds a new tool but forgets to bump the helper constant, the
    // unit test catches it at vitest speed and the e2e live gate catches it at
    // MCP server speed — both surfaces fail in the same commit.
    expect(readSource(MCP_E2E_PATH)).toMatch(
      /import\s+\{[^}]*EXPECTED_ADVERTISED_TOOL_COUNT[^}]*\}\s+from\s+["']\.\/_helpers\/advertised-tool-count\.mjs["']/,
    );
    expect(readSource(MCP_E2E_PATH)).toMatch(
      /pass:\s*advertised\.length\s*===\s*EXPECTED_ADVERTISED_TOOL_COUNT/,
    );
    expect(Number.isSafeInteger(EXPECTED_ADVERTISED_TOOL_COUNT)).toBe(true);
    const unitPinSource = readSource(
      resolve(process.cwd(), "test/adapters/mcp/advertised-tool-count.test.ts"),
    );
    expect(unitPinSource).toMatch(
      /import\s+\{[^}]*EXPECTED_ADVERTISED_TOOL_COUNT[^}]*\}\s+from\s+["']\.\.\/\.\.\/\.\.\/E2E_testing\/_helpers\/advertised-tool-count\.mjs["']/,
    );
    expect(unitPinSource).not.toMatch(/\.toBe\(\s*\d+\s*\)/);
  });
});

describe("mcp-e2e.mjs — sandbox isolation", () => {
  const src = readSource(MCP_E2E_PATH);

  it("never writes the tool output to the project's real src/ directory", () => {
    // Regression mode: accidentally wiring `destinationRoot: "src"` would
    // make `export_all --prune` write/delete files in the canonical fixture
    // source tree. The suite must route ALL output through the sandbox's
    // destinationRoot (built by buildMcpE2eSandboxPlan).
    const exportAllCalls = src.match(/["']export_all["'][\s\S]{0,400}/g) ?? [];
    expect(exportAllCalls.length).toBeGreaterThan(0);
    for (const call of exportAllCalls) {
      // Allow `exportPath:` (sandbox-only) and the per-call destinationRoot
      // override. Forbid any literal `destinationRoot: "src"` or
      // `destinationRoot: "./src"` or absolute `E2E_testing/src` paths.
      expect(
        call,
        `export_all call appears to bypass the sandbox destinationRoot: ${call.slice(0, 200)}`,
      ).not.toMatch(/destinationRoot\s*:\s*["']\.?\/?src["']/);
      expect(
        call,
        `export_all call appears to point at the fixture source: ${call.slice(0, 200)}`,
      ).not.toMatch(/E2E_testing[\\/]src/);
    }
  });
});

describe("mcp-e2e.mjs — orphan-detection invariants", () => {
  const src = readSource(MCP_E2E_PATH);

  it("appends a final lingering-access-check row to document the orphan count", () => {
    // The final row is what proves "0 MSACCESS.EXE lingered after the
    // battery". Removing it lets the orphan-count invariant regress
    // silently. Must contain `lingering-access-check`.
    expect(src).toContain("lingering-access-check");
    // The final audit must be emitted through the unchecked reporting port:
    // it records the failure before the controller persists and throws it.
    const finalOperation = src.match(/tool:\s*"inspect_form:miss-remediation-no-path-scrub"/);
    const audit = src.match(
      /appendUnchecked\(\{\s*area:\s*"zombies"\s*,\s*tool:\s*"lingering-access-check"/,
    );
    expect(finalOperation, "final battery operation not found").not.toBeNull();
    expect(audit, "final lingering-access-check audit not found").not.toBeNull();
    expect(audit?.index).toBeGreaterThan(finalOperation?.index ?? Number.MAX_SAFE_INTEGER);
  });
});

describe("mcp-e2e-record.mjs — STOP-ON-FAIL invariant", () => {
  const src = readSource(RECORD_PATH);

  it("throws on FAIL row (tool.pass=false || zombie.pass=false) so the battery aborts", () => {
    // The STOP-ON-FAIL gate is what keeps a single failed tool from
    // orphaning N MSACCESS.EXE processes. Disabling it lets zombies
    // escape. The contract: a FAIL row throws and sets process.exitCode.
    expect(src).toContain("STOP-ON-FAIL");
    expect(src).toMatch(/throw new Error\(`mcp-e2e: STOP-ON-FAIL/);
    expect(src).toContain("processObj.exitCode = 1");
  });

  it("registers every harness childPid in suiteOwnPids (the zombie-check predicate depends on this)", () => {
    // Without the registration, every "zombie-check" row would say "clean"
    // because the predicate `result.childPid ? ctx.isOwnPidAlive(pid) :
    // false` would always be false. The preflight post-tool zombie check
    // would be a no-op. Pin that the registration exists and is not gated
    // behind a conditional.
    expect(src).toMatch(/ctx\.suiteOwnPids\.add\(result\.childPid\)/);
  });
});

describe("mcp-e2e.mjs — ACCESS_VBA_PASSWORD pre-flight", () => {
  const src = readSource(MCP_E2E_PATH);

  it("refuses to run without ACCESS_VBA_PASSWORD (or DYSFLOW_ACCESS_PASSWORD / DYSFLOW_BACKEND_PASSWORD)", () => {
    // Regression mode: silently running the battery without a password
    // would let every Access call fail with the same error string and
    // produce 117 FAIL rows (one per tool), masking the real failure.
    // The pre-flight should bail with exit(1) and an actionable message.
    const passwordResolution = src.match(
      /(?:ACCESS_VBA_PASSWORD|DYSFLOW_ACCESS_PASSWORD|DYSFLOW_BACKEND_PASSWORD)/,
    );
    expect(passwordResolution, "no password env var resolution found").not.toBeNull();
    expect(src).toMatch(/Missing Access password|process\.exit\(1\)/);
  });
});
