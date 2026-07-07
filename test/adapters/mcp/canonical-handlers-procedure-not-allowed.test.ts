/**
 * #659 — `ensureProcedureAllowed` splits `MCP_INPUT_INVALID` for the
 * procedure-not-in-allowlist branch into `MCP_PROCEDURE_NOT_ALLOWED`.
 *
 * Two branches in the gate must keep distinct error envelopes:
 *   1. Allowlist not configured (undefined / empty) AND no `dryRun:true`
 *      → `MCP_ALLOWLIST_NOT_CONFIGURED` (#757 F6 — split out of the generic
 *      `MCP_INPUT_INVALID` so a missing allowlist reads as a config fix).
 *   2. Procedure not in the populated allowlist
 *      → `MCP_PROCEDURE_NOT_ALLOWED` with the active allowlist surfaced.
 *
 * This file extends the existing #621 PR1a tests with the new contract.
 */

import { describe, expect, it } from "vitest";
import { ensureProcedureAllowed } from "../../../src/adapters/mcp/canonical-handlers";

describe("ensureProcedureAllowed — procedure-not-in-allowlist branch (#659)", () => {
  it("emits MCP_PROCEDURE_NOT_ALLOWED with the rejected procedure name in the body", () => {
    const error = ensureProcedureAllowed("Test_X", ["Test_A"], undefined);
    expect(error).toBeDefined();
    expect(error?.isError).toBe(true);
    expect(error?.ok).toBe(false);
    expect(error?.content[0]?.text).toContain("MCP_PROCEDURE_NOT_ALLOWED");
    expect(error?.content[0]?.text).toContain("Test_X");
  });

  it("surfaces the active allowedProcedures list in the body", () => {
    const error = ensureProcedureAllowed("DeleteAll", ["Refresh", "Sync"], undefined);
    expect(error).toBeDefined();
    expect(error?.content[0]?.text).toContain("Refresh");
    expect(error?.content[0]?.text).toContain("Sync");
  });

  it("includes a remediation hint mentioning get_capabilities in the body", () => {
    const error = ensureProcedureAllowed("DeleteAll", ["Refresh"], undefined);
    expect(error).toBeDefined();
    expect(error?.content[0]?.text).toContain("get_capabilities");
  });

  it("exposes a structured error envelope with code, message, allowedProcedures, remediation", () => {
    const error = ensureProcedureAllowed("DeleteAll", ["Refresh", "Sync"], undefined);
    expect(error).toBeDefined();
    expect(error?.error?.code).toBe("MCP_PROCEDURE_NOT_ALLOWED");
    expect(error?.error?.message).toContain("DeleteAll");
    expect(error?.error?.allowedProcedures).toEqual(["Refresh", "Sync"]);
    expect(error?.error?.remediation).toContain("get_capabilities");
  });

  it("structured error.allowedProcedures reflects the list active at the time of the call", () => {
    const allowed = ["Test_A", "Test_B", "Test_C"] as const;
    const error = ensureProcedureAllowed("Test_X", allowed, undefined);
    expect(error?.error?.allowedProcedures).toEqual(["Test_A", "Test_B", "Test_C"]);
  });

  it("fires the new envelope even when dryRun=true (allowlist membership check is independent of dryRun)", () => {
    const error = ensureProcedureAllowed("Test_X", ["Test_A"], true);
    expect(error).toBeDefined();
    expect(error?.content[0]?.text).toContain("MCP_PROCEDURE_NOT_ALLOWED");
  });
});

describe("ensureProcedureAllowed — allowlist-not-configured branch emits MCP_ALLOWLIST_NOT_CONFIGURED (#757 F6)", () => {
  it("undefined allowlist AND no dryRun → MCP_ALLOWLIST_NOT_CONFIGURED", () => {
    const error = ensureProcedureAllowed("Anything", undefined, undefined);
    expect(error).toBeDefined();
    expect(error?.content[0]?.text).toContain("MCP_ALLOWLIST_NOT_CONFIGURED");
    expect(error?.error?.code).toBe("MCP_ALLOWLIST_NOT_CONFIGURED");
    // Crucially, the procedure-not-in-list code MUST NOT appear here — that
    // branch owns `MCP_PROCEDURE_NOT_ALLOWED`.
    expect(error?.content[0]?.text).not.toContain("MCP_PROCEDURE_NOT_ALLOWED");
    // Nor the generic input-shape code — the split is the whole point of F6.
    expect(error?.content[0]?.text).not.toContain("MCP_INPUT_INVALID");
  });

  it("empty allowlist AND no dryRun → MCP_ALLOWLIST_NOT_CONFIGURED", () => {
    const error = ensureProcedureAllowed("Anything", [], undefined);
    expect(error).toBeDefined();
    expect(error?.content[0]?.text).toContain("MCP_ALLOWLIST_NOT_CONFIGURED");
    expect(error?.content[0]?.text).not.toContain("MCP_PROCEDURE_NOT_ALLOWED");
  });

  it("empty allowlist AND dryRun=false → MCP_ALLOWLIST_NOT_CONFIGURED", () => {
    const error = ensureProcedureAllowed("Anything", [], false);
    expect(error).toBeDefined();
    expect(error?.content[0]?.text).toContain("MCP_ALLOWLIST_NOT_CONFIGURED");
    expect(error?.content[0]?.text).not.toContain("MCP_PROCEDURE_NOT_ALLOWED");
  });

  it("carries a remediation hint mentioning dryRun and the config file", () => {
    const error = ensureProcedureAllowed("Anything", undefined, undefined);
    expect(error?.error?.remediation).toContain("dryRun");
    expect(error?.error?.remediation).toContain(".dysflow/project.json");
  });
});
