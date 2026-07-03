/**
 * #659 — envelope unification: `procedureNotAllowed` helper.
 *
 * The procedure-not-in-allowlist branch in `ensureProcedureAllowed` must
 * surface a STRUCTURED envelope that lets consumers distinguish it from
 * generic `MCP_INPUT_INVALID` input errors. The envelope exposes:
 *   - `error.code` = `"MCP_PROCEDURE_NOT_ALLOWED"`
 *   - `error.message` naming the rejected procedure
 *   - `error.allowedProcedures` = the allowlist active at the time of the call
 *   - `error.remediation` mentioning `dysflow_get_capabilities`
 *
 * The legacy `content[0].text` body keeps the `"MCP_PROCEDURE_NOT_ALLOWED: …"`
 * prefix so regex-based consumers can still parse the failure.
 *
 * Cheap-first pyramid — pure function tests, no Access, no PowerShell.
 */

import { describe, expect, it } from "vitest";
import {
  invalidInput,
  MCP_PROCEDURE_NOT_ALLOWED,
  MCP_WRITES_DISABLED,
  procedureNotAllowed,
  writesDisabled,
} from "../../../src/adapters/mcp/dispatch-common";

describe("procedureNotAllowed — structured envelope (#659)", () => {
  it("exports a structured error.code = MCP_PROCEDURE_NOT_ALLOWED", () => {
    expect(MCP_PROCEDURE_NOT_ALLOWED).toBe("MCP_PROCEDURE_NOT_ALLOWED");
  });

  it("returns ok=false / isError=true with the rejected procedure name in the body", () => {
    const result = procedureNotAllowed("Test_X", ["Test_A"]);
    expect(result.isError).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.text).toContain("Test_X");
  });

  it("body starts with the MCP_PROCEDURE_NOT_ALLOWED prefix (regex-compatible)", () => {
    const result = procedureNotAllowed("Test_X", ["Test_A"]);
    expect(result.content[0]?.text.startsWith("MCP_PROCEDURE_NOT_ALLOWED:")).toBe(true);
  });

  it("body surfaces the currently allowed procedures (verbatim, JSON-encoded)", () => {
    const allowed = ["Test_A", "Test_B"] as const;
    const result = procedureNotAllowed("Test_X", allowed);
    // The body MUST carry the active allowlist so a consumer can introspect it
    // without a second round-trip to `dysflow_get_capabilities`.
    expect(result.content[0]?.text).toContain("Test_A");
    expect(result.content[0]?.text).toContain("Test_B");
  });

  it("body includes a remediation hint mentioning dysflow_get_capabilities", () => {
    const result = procedureNotAllowed("Test_X", ["Test_A"]);
    expect(result.content[0]?.text).toContain("dysflow_get_capabilities");
  });

  it("structured `error.code` matches the body prefix code", () => {
    const result = procedureNotAllowed("Test_X", ["Test_A"]);
    expect(result.error?.code).toBe("MCP_PROCEDURE_NOT_ALLOWED");
  });

  it("structured `error.message` names the rejected procedure", () => {
    const result = procedureNotAllowed("DeleteAll", ["Refresh", "Sync"]);
    expect(result.error?.message).toContain("DeleteAll");
  });

  it("structured `error.allowedProcedures` equals the array passed in", () => {
    const allowed = ["Test_A", "Test_B"] as const;
    const result = procedureNotAllowed("Test_X", allowed);
    expect(result.error?.allowedProcedures).toEqual(["Test_A", "Test_B"]);
  });

  it("structured `error.remediation` mentions dysflow_get_capabilities", () => {
    const result = procedureNotAllowed("Test_X", ["Test_A"]);
    expect(result.error?.remediation).toContain("dysflow_get_capabilities");
  });

  it("handles a single-element allowlist consistently", () => {
    const result = procedureNotAllowed("Test_X", ["Test_A"]);
    expect(result.content[0]?.text).toContain("Test_A");
    expect(result.error?.allowedProcedures).toEqual(["Test_A"]);
  });

  it("handles a multi-element allowlist — order preserved", () => {
    const result = procedureNotAllowed("Test_X", ["Refresh", "Sync", "Cleanup"]);
    expect(result.error?.allowedProcedures).toEqual(["Refresh", "Sync", "Cleanup"]);
  });

  it("body does NOT carry the legacy MCP_INPUT_INVALID prefix (clean separation of codes)", () => {
    const result = procedureNotAllowed("Test_X", ["Test_A"]);
    expect(result.content[0]?.text.startsWith("MCP_INPUT_INVALID:")).toBe(false);
  });

  it("body still carries the literal 'allowedProcedures' string for backward-compatible regex parsing", () => {
    const result = procedureNotAllowed("Test_X", ["Test_A"]);
    expect(result.content[0]?.text).toContain("allowedProcedures");
  });

  it("preserves a procedure name that contains apostrophes verbatim in the body", () => {
    const result = procedureNotAllowed("Test_'Quoted'_X", ["Test_A"]);
    expect(result.content[0]?.text).toContain("Test_'Quoted'_X");
  });

  it("structured error.allowedProcedures is a defensive copy (mutating result does not bleed back)", () => {
    const allowed = ["Test_A", "Test_B"];
    const result = procedureNotAllowed("Test_X", allowed);
    // Mutate the array returned in the structured error.
    const reported = result.error?.allowedProcedures as string[] | undefined;
    if (reported) {
      reported.push("MUTATED");
    }
    // Original input must NOT reflect the mutation.
    expect(allowed).toEqual(["Test_A", "Test_B"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #659 follow-up (gap 4) — `writesDisabled` carries the structured envelope
// (gate-error-codes/spec.md scenario 1: "Write gate blocked — MCP_WRITES_DISABLED").
// ─────────────────────────────────────────────────────────────────────────────

describe("writesDisabled — structured envelope (#659, gap 4)", () => {
  it("exports a structured error.code = MCP_WRITES_DISABLED", () => {
    expect(MCP_WRITES_DISABLED).toBe("MCP_WRITES_DISABLED");
  });

  it("returns ok=false / isError=true with the legacy MCP_WRITES_DISABLED body prefix", () => {
    const result = writesDisabled();
    expect(result.isError).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.content[0]?.text.startsWith("MCP_WRITES_DISABLED:")).toBe(true);
  });

  it("structured `error.code` matches the body prefix code", () => {
    const result = writesDisabled();
    expect(result.error?.code).toBe("MCP_WRITES_DISABLED");
  });

  it("structured `error.remediation` lists both escape paths (allowWrites OR --enable-writes)", () => {
    const result = writesDisabled();
    expect(result.error?.remediation).toContain('"allowWrites": true');
    expect(result.error?.remediation).toContain("dysflow mcp --enable-writes");
  });

  it("names the attempted tool in the message when toolName is provided", () => {
    const result = writesDisabled("delete_module");
    expect(result.error?.message).toContain("delete_module");
    expect(result.content[0]?.text).toContain("delete_module");
  });

  it("does NOT include allowedProcedures (the allowlist was not consulted — write gate)", () => {
    const result = writesDisabled("delete_module");
    expect(result.error?.allowedProcedures).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #659 follow-up (gap 5) — `invalidInput` keeps the legacy code but now
// exposes a structured envelope. Per gate-error-codes/spec.md scenario 5:
//   - `error.code = MCP_INPUT_INVALID`
//   - `error.remediation` is absent (schema errors are self-describing)
//   - `error.allowedProcedures` is absent (allowlist was not consulted)
// ─────────────────────────────────────────────────────────────────────────────

describe("invalidInput — structured envelope (#659, gap 5)", () => {
  it("structured `error.code` matches the legacy MCP_INPUT_INVALID body prefix", () => {
    const result = invalidInput("bad field 'mode'");
    expect(result.error?.code).toBe("MCP_INPUT_INVALID");
    expect(result.content[0]?.text.startsWith("MCP_INPUT_INVALID:")).toBe(true);
  });

  it("structured `error.message` mirrors the message passed in", () => {
    const result = invalidInput("bad field 'mode'");
    expect(result.error?.message).toBe("bad field 'mode'");
  });

  it("does NOT include remediation (schema rejections are self-describing)", () => {
    const result = invalidInput("bad field 'mode'");
    expect(result.error?.remediation).toBeUndefined();
  });

  it("does NOT include allowedProcedures (the allowlist was not consulted)", () => {
    const result = invalidInput("bad field 'mode'");
    expect(result.error?.allowedProcedures).toBeUndefined();
  });
});
