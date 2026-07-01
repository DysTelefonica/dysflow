/**
 * PR1a (#621, F1) — `ensureProcedureAllowed` is the default-deny gate for
 * `dysflow_vba_execute` and `run_vba` at the MCP adapter boundary. It refuses to
 * call `services.vbaService.execute(...)` unless EITHER the project config
 * declares a non-empty `allowedProcedures` AND `procedureName` is in that list,
 * OR the caller passes `dryRun: true`.
 *
 * The tests below exercise the gate as a pure function (the seam used by
 * `handleMcpVbaExecute`) so they can run without a full MCP server context.
 * The integration path (handler → gate → vbaService) is covered separately
 * in `tools.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { ensureProcedureAllowed } from "../../../src/adapters/mcp/canonical-handlers";

describe("ensureProcedureAllowed — default-deny gate (PR1a, #621 F1)", () => {
  it("refuses when allowedProcedures is undefined and dryRun is not true", () => {
    const error = ensureProcedureAllowed("DeleteAll", undefined, undefined);
    expect(error).toBeDefined();
    expect(error?.isError).toBe(true);
    expect(error?.content[0]?.text).toContain("MCP_INPUT_INVALID");
    expect(error?.content[0]?.text).toContain("DeleteAll");
    expect(error?.content[0]?.text).toContain("allowedProcedures");
    expect(error?.content[0]?.text).toContain("dryRun");
  });

  it("refuses when allowedProcedures is empty AND dryRun is not true", () => {
    const error = ensureProcedureAllowed("DeleteAll", [], undefined);
    expect(error).toBeDefined();
    expect(error?.isError).toBe(true);
    expect(error?.content[0]?.text).toContain("DeleteAll");
    expect(error?.content[0]?.text).toContain("allowedProcedures");
  });

  it("refuses when allowedProcedures is empty AND dryRun is false", () => {
    const error = ensureProcedureAllowed("DeleteAll", [], false);
    expect(error).toBeDefined();
    expect(error?.isError).toBe(true);
  });

  it("accepts when allowedProcedures is undefined AND dryRun is true (escape hatch)", () => {
    const error = ensureProcedureAllowed("Anything", undefined, true);
    expect(error).toBeUndefined();
  });

  it("accepts when allowedProcedures is empty AND dryRun is true (escape hatch)", () => {
    const error = ensureProcedureAllowed("Anything", [], true);
    expect(error).toBeUndefined();
  });

  it("accepts when procedureName is in the configured allowedProcedures list", () => {
    const error = ensureProcedureAllowed("Refresh", ["Refresh", "Sync"], undefined);
    expect(error).toBeUndefined();
  });

  it("accepts when procedureName is in the configured allowedProcedures list AND dryRun is true", () => {
    const error = ensureProcedureAllowed("Refresh", ["Refresh", "Sync"], true);
    expect(error).toBeUndefined();
  });

  it("still refuses a procedureName that is NOT in the configured allowedProcedures list (even with dryRun true)", () => {
    const error = ensureProcedureAllowed("DeleteAll", ["Refresh", "Sync"], true);
    expect(error).toBeDefined();
    expect(error?.isError).toBe(true);
    expect(error?.content[0]?.text).toContain("DeleteAll");
    expect(error?.content[0]?.text).toContain("allowedProcedures");
  });

  it("refuses when allowedProcedures is non-empty but does NOT contain the procedure AND dryRun is unset", () => {
    const error = ensureProcedureAllowed("DeleteAll", ["Refresh", "Sync"], undefined);
    expect(error).toBeDefined();
    expect(error?.isError).toBe(true);
    expect(error?.content[0]?.text).toContain("DeleteAll");
  });
});
