/**
 * `ensureProcedureAllowed` is the procedure gate for `run_vba` at the MCP
 * adapter boundary. It is DEFAULT-ALLOW: it refuses nothing unless the
 * targeted project declares `capabilities.procedures.strictMode: true`.
 *
 * Under strict mode it restores the PR1a (#621, F1) default-deny contract
 * verbatim — refuse unless the project config declares a non-empty
 * `allowedProcedures` AND `procedureName` is in that list, or the caller
 * passes `dryRun: true`.
 *
 * The tests below exercise the gate as a pure function (the seam used by
 * `handleMcpVbaExecute`) so they can run without a full MCP server context.
 * The integration path (handler → gate → vbaService) is covered separately
 * in `tools.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { ensureProcedureAllowed } from "../../../src/adapters/mcp/canonical-handlers";

describe("ensureProcedureAllowed — default-allow gate", () => {
  it("allows when no allowlist is configured and strictMode is absent", () => {
    expect(ensureProcedureAllowed("DeleteAll", undefined, undefined, undefined)).toBeUndefined();
  });

  it("allows when the allowlist is empty and strictMode is absent", () => {
    expect(ensureProcedureAllowed("DeleteAll", [], undefined, undefined)).toBeUndefined();
  });

  it("allows a procedure outside a populated allowlist when strictMode is absent", () => {
    // The list is documentation, not a gate, until the project opts in. This is
    // the friction the default-allow contract removes: a consumer no longer has
    // to register every production procedure and every new test.
    expect(
      ensureProcedureAllowed("DeleteAll", ["Refresh", "Sync"], undefined, undefined),
    ).toBeUndefined();
  });

  it("allows a procedure outside a populated allowlist when strictMode is explicitly false", () => {
    expect(ensureProcedureAllowed("DeleteAll", ["Refresh", "Sync"], false, false)).toBeUndefined();
  });

  it("allows regardless of dryRun when strictMode is absent", () => {
    expect(ensureProcedureAllowed("DeleteAll", undefined, false, undefined)).toBeUndefined();
    expect(ensureProcedureAllowed("DeleteAll", undefined, true, undefined)).toBeUndefined();
  });
});

describe("ensureProcedureAllowed — strictMode: true restores default-deny", () => {
  it("refuses when allowedProcedures is undefined and dryRun is not true", () => {
    const error = ensureProcedureAllowed("DeleteAll", undefined, undefined, true);
    expect(error).toBeDefined();
    expect(error?.isError).toBe(true);
    // #757 (F6) — the no-allowlist branch carries its own distinct code.
    expect(error?.content[0]?.text).toContain("MCP_ALLOWLIST_NOT_CONFIGURED");
    expect(error?.content[0]?.text).toContain("DeleteAll");
    expect(error?.content[0]?.text).toContain("allowedProcedures");
    expect(error?.content[0]?.text).toContain("dryRun");
  });

  it("refuses when allowedProcedures is empty AND dryRun is not true", () => {
    const error = ensureProcedureAllowed("DeleteAll", [], undefined, true);
    expect(error).toBeDefined();
    expect(error?.isError).toBe(true);
    expect(error?.content[0]?.text).toContain("DeleteAll");
    expect(error?.content[0]?.text).toContain("allowedProcedures");
  });

  it("refuses when allowedProcedures is empty AND dryRun is false", () => {
    const error = ensureProcedureAllowed("DeleteAll", [], false, true);
    expect(error).toBeDefined();
    expect(error?.isError).toBe(true);
  });

  it("accepts when allowedProcedures is undefined AND dryRun is true (escape hatch)", () => {
    expect(ensureProcedureAllowed("Anything", undefined, true, true)).toBeUndefined();
  });

  it("accepts when allowedProcedures is empty AND dryRun is true (escape hatch)", () => {
    expect(ensureProcedureAllowed("Anything", [], true, true)).toBeUndefined();
  });

  it("accepts when procedureName is in the configured allowedProcedures list", () => {
    expect(ensureProcedureAllowed("Refresh", ["Refresh", "Sync"], undefined, true)).toBeUndefined();
  });

  it("accepts when procedureName is in the configured allowedProcedures list AND dryRun is true", () => {
    expect(ensureProcedureAllowed("Refresh", ["Refresh", "Sync"], true, true)).toBeUndefined();
  });

  it("still refuses a procedureName that is NOT in the configured allowedProcedures list (even with dryRun true)", () => {
    const error = ensureProcedureAllowed("DeleteAll", ["Refresh", "Sync"], true, true);
    expect(error).toBeDefined();
    expect(error?.isError).toBe(true);
    expect(error?.content[0]?.text).toContain("DeleteAll");
    expect(error?.content[0]?.text).toContain("allowedProcedures");
  });

  it("refuses when allowedProcedures is non-empty but does NOT contain the procedure AND dryRun is unset", () => {
    const error = ensureProcedureAllowed("DeleteAll", ["Refresh", "Sync"], undefined, true);
    expect(error).toBeDefined();
    expect(error?.isError).toBe(true);
    expect(error?.content[0]?.text).toContain("DeleteAll");
  });
});
