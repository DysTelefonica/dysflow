// Vitest quality gate for the MCP harness watchdog primitives (#583).
// The per-call harness lives in E2E_testing/_helpers/mcp-harness.mjs
// (extracted from the legacy inlined callMcp inside mcp-e2e.mjs so the
// integration test in test/e2e/ can drive it with a fake child). This gate
// pins that the helper exposes the watchdog contract and that mcp-e2e.mjs
// wires it in.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const E2E_SCRIPT = "E2E_testing/mcp-e2e.mjs";
const HARNESS = "E2E_testing/_helpers/mcp-harness.mjs";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

describe("MCP harness watchdog primitives (#583)", () => {
  it("mcp-e2e.mjs defines a closeWatchdogMs constant (default 5000)", () => {
    const text = readText(E2E_SCRIPT);
    expect(text).toMatch(
      /closeWatchdogMs\s*=\s*Number\(process\.env\.DYSFLOW_E2E_CLOSE_WATCHDOG_MS\s*\?\?\s*5000\)/,
    );
  });

  it("the harness helper defines runMcpHarness and arms a close watchdog after response capture", () => {
    const text = readText(HARNESS);
    expect(text).toMatch(/export\s+function\s+runMcpHarness/);
    // The watchdog is the setTimeout that calls finish({...resultPending, closeWatchdogFired: true})
    expect(text).toMatch(
      /closeWatchdog\s*=\s*setTimeout\([\s\S]{0,200}?closeWatchdogFired:\s*true/,
    );
  });

  it("the harness finish is settle-guarded", () => {
    const text = readText(HARNESS);
    expect(text).toMatch(/const\s+finish\s*=\s*\([\s\S]*?if\s*\(\s*settled\s*\)\s*return/);
  });

  it("the harness finish calls child.kill() (best-effort)", () => {
    const text = readText(HARNESS);
    expect(text).toMatch(/finish[\s\S]{0,500}?child\.kill\(\)/);
  });

  it("the close handler clears the close watchdog so a natural close is a no-op", () => {
    const text = readText(HARNESS);
    // child.on("close", ...) must clearTimeout on the watchdog variable
    const closeBlock = text.match(/child\.on\(\s*["']close["'][\s\S]{0,800}?clearTimeout/);
    expect(
      closeBlock,
      "child.on('close', ...) must clearTimeout to prevent the watchdog from firing after a natural close",
    ).not.toBeNull();
  });

  it("mcp-e2e.mjs imports and uses the runMcpHarness helper (no inlined callMcp closure)", () => {
    const text = readText(E2E_SCRIPT);
    expect(text).toMatch(
      /import\s*\{[^}]*runMcpHarness[^}]*\}\s*from\s*["']\.\/_helpers\/mcp-harness\.mjs["']/,
    );
    // callMcp should be a thin wrapper that delegates to the helper
    expect(text).toMatch(/async\s+function\s+callMcp[\s\S]{0,500}?runMcpHarness\(/);
  });
});
