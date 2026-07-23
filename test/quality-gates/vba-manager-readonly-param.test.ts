/**
 * Issue #1063 — the #1055 fix routed export plan calls (`apply:false` /
 * `dryRun:true`) through the runner with `readOnly: true`, serialized as
 * the bare `-ReadOnly` switch (booleans map to PS [switch] params). The
 * TS whitelist (`VBA_MANAGER_EXTRA_KEYS`) gained `"readOnly"` but
 * `scripts/dysflow-vba-manager.ps1` never declared the parameter, so every
 * plan-mode export crashed with VBA_MANAGER_UNEXPECTED_EXIT ("No se
 * encuentra ningún parámetro que coincida con el nombre del parámetro
 * 'ReadOnly'"). Unit tests missed it because the contract was pinned at
 * the mocked executor seam; the heavy E2E battery caught it.
 *
 * These cheap source-text pins keep the two surfaces from drifting again.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = path.resolve(__dirname, "../../scripts/dysflow-vba-manager.ps1");
const scriptText = readFileSync(scriptPath, "utf8");

describe("dysflow-vba-manager.ps1 — -ReadOnly param parity (#1063)", () => {
  it("declares [switch]$ReadOnly in the top-level Param block", () => {
    // The top-level Param block ends at the first closing paren before the
    // first function definition; searching the pre-function prefix is enough
    // to prove the TOP-LEVEL declaration (inner functions declare their own).
    const firstFunctionIndex = scriptText.indexOf("\nfunction ");
    const topLevel = scriptText.slice(0, firstFunctionIndex);
    expect(topLevel).toMatch(/\[switch\]\$ReadOnly/);
  });

  it("threads -ReadOnly into the Export action dispatch", () => {
    expect(scriptText).toMatch(/Invoke-ExportAction[^\n]*-ReadOnly:\$ReadOnly/);
  });

  it("Invoke-ExportAction declares the ReadOnly switch", () => {
    const fnIndex = scriptText.indexOf("function Invoke-ExportAction");
    expect(fnIndex).toBeGreaterThan(-1);
    const fnHead = scriptText.slice(fnIndex, fnIndex + 800);
    expect(fnHead).toMatch(/\[switch\]\$ReadOnly/);
  });
});
