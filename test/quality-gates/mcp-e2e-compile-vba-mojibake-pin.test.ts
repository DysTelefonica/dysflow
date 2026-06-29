// Pinner that asserts the documented `compile_vba` mojibake expectation in
// `E2E_testing/mcp-e2e.mjs`. Today the fixture binary's VBA project has
// 117 components with 2477 lines of mojibake (`EnumSino.S�`, `m�todo`,
// `n�` — `Sí`, `método`, `nº` corrupted to U+FFFD). VBA refuses to parse
// those identifiers, so `compile_vba` returns `VBA_COMPILE_ERROR`. The
// e2e asserts `expected: "error"` on that step to document the real state
// of the fixture. When someone fixes the fixture binary (re-export from a
// clean source, or replace the binary entirely) the mojibake will go
// away, `compile_vba` will start returning success, and the assertion in
// `mcp-e2e.mjs` must be flipped back to `expected: "success"`. This test
// pins the `expected: "error"` line so the assertion cannot silently
// regress while the binary is still broken.

// @ts-nocheck — source-file lint only.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MCP_E2E_PATH = resolve(process.cwd(), "E2E_testing/mcp-e2e.mjs");

function readMcpE2eSource(): string {
  return readFileSync(MCP_E2E_PATH, "utf8");
}

describe("mcp-e2e.mjs compile_vba mojibake expectation (#fix-fixture-mo jibake)", () => {
  it("asserts compile_vba with expected:'error' while the fixture binary has mojibake in 117 components", () => {
    const src = readMcpE2eSource();
    // Match the specific call site we annotated. Loosely match so a minor
    // refactor (e.g. extra whitespace, line-wrapped args) does not break
    // the pin; the rule is that compile_vba must be expected:'error'.
    const compileVbaCall = src.match(/record\(\s*"vba-sync"\s*,\s*"compile_vba"[\s\S]*?\)/);
    expect(compileVbaCall, "compile_vba record() call not found in mcp-e2e.mjs").not.toBeNull();
    expect(compileVbaCall?.[0]).toContain('expected: "error"');
  });

  it("has a comment block explaining why the expectation is 'error' (so future readers know)", () => {
    const src = readMcpE2eSource();
    const compileVbaIdx = src.indexOf('"compile_vba"');
    expect(compileVbaIdx).toBeGreaterThan(0);
    // Look 1200 chars before the call site — the comment block lives there.
    const windowBefore = src.slice(Math.max(0, compileVbaIdx - 1200), compileVbaIdx);
    expect(windowBefore.toLowerCase()).toContain("mojibake");
    expect(windowBefore).toMatch(/\b117\b/);
  });
});
