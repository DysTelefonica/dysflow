/**
 * #1174 — RED test for the shared procedure-name parser.
 *
 * This RED commit pins the contract `parseProcedureName` MUST satisfy so
 * the dry-run plan and the apply-path preflight (issue #1174 acceptance
 * criteria #1 + #2) agree on `moduleName` and `procName` for the same
 * `procedureName`. The GREEN commit that follows ships the parser.
 *
 * Why a separate parser module (rather than inlining into the existing
 * `vba-service.ts` or `alias-tools.ts`):
 *   - The MCP adapter (`buildRunVbaRequest`) and the VBA service
 *     (`AccessVbaService.execute`) both need the parsed values BEFORE the
 *     dry-run short-circuit fires. A shared pure function is the only way
 *     to guarantee both branches produce identical values for the same
 *     input — drift between two inlined copies is exactly the bug #1174
 *     reports.
 *   - The contract for "what counts as parseable" must be unit-testable
 *     without I/O. The parser intentionally has no `node:*` imports.
 *
 * Test surface (RED — these must fail before the parser exists):
 *   - Happy path `"<module>.<procedure>"` splits into both parts.
 *   - First dot wins for nested qualified names (Module.Nested.Type.Proc).
 *   - Unqualified procedure names (legacy shape, no dot) round-trip as
 *     `{ moduleName: "", procName: "JustAProc" }`.
 *   - Whitespace is trimmed on both sides.
 *   - Empty / whitespace-only / non-string inputs return typed
 *     `PROCEDURE_NAME_EMPTY` envelopes.
 *   - Malformed inputs (`.Foo`, `Module.`, `.`, path-like) return typed
 *     `PROCEDURE_NAME_INVALID` envelopes.
 */

import { describe, expect, it } from "vitest";
import { parseProcedureName } from "../../../src/core/services/vba-procedure-name-parser.js";

describe("#1174 — parseProcedureName (run_vba procedureName parser)", () => {
  it("happy path: '<module>.<procedure>' splits into moduleName + procName", () => {
    const result = parseProcedureName("MigracionTbCambiosParaPublicacionEdicionLong.EjecutarMigracion");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.moduleName).toBe("MigracionTbCambiosParaPublicacionEdicionLong");
    expect(result.procName).toBe("EjecutarMigracion");
    expect(result.original).toBe("MigracionTbCambiosParaPublicacionEdicionLong.EjecutarMigracion");
  });

  it("trims surrounding whitespace from the input", () => {
    const result = parseProcedureName("  Module.PublicSub  ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.moduleName).toBe("Module");
    expect(result.procName).toBe("PublicSub");
  });

  it("preserves case verbatim — VBA is case-insensitive but the parser is not", () => {
    const result = parseProcedureName("MyModule.foo");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.moduleName).toBe("MyModule");
    expect(result.procName).toBe("foo");
  });

  it("first dot wins for nested qualified names (Module.Nested.Type.Proc)", () => {
    // Matches the VBA canonical form: `AccessApplication.Run` resolves the
    // first segment as the module name and the rest as the qualified
    // procedure name within that module.
    const result = parseProcedureName("Module.Nested.Type.Proc");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.moduleName).toBe("Module");
    expect(result.procName).toBe("Nested.Type.Proc");
  });

  it("unqualified procedure name (legacy shape, no dot) yields empty moduleName", () => {
    const result = parseProcedureName("JustAProc");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.moduleName).toBe("");
    expect(result.procName).toBe("JustAProc");
  });

  it("empty string returns a typed PROCEDURE_NAME_EMPTY envelope", () => {
    const result = parseProcedureName("");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected empty input to fail parsing");
    expect(result.code).toBe("PROCEDURE_NAME_EMPTY");
    expect(result.original).toBe("");
  });

  it("whitespace-only input returns a typed PROCEDURE_NAME_EMPTY envelope", () => {
    const result = parseProcedureName("   \t  ");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected whitespace input to fail parsing");
    expect(result.code).toBe("PROCEDURE_NAME_EMPTY");
  });

  it("non-string input returns a typed PROCEDURE_NAME_EMPTY envelope", () => {
    const result = parseProcedureName(undefined);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected undefined input to fail parsing");
    expect(result.code).toBe("PROCEDURE_NAME_EMPTY");
  });

  it("leading-dot input ('.Foo') returns a typed PROCEDURE_NAME_INVALID envelope", () => {
    const result = parseProcedureName(".Foo");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected '.Foo' to fail parsing");
    expect(result.code).toBe("PROCEDURE_NAME_INVALID");
    expect(result.original).toBe(".Foo");
    expect(result.message).toContain("malformed");
  });

  it("trailing-dot input ('Module.') returns a typed PROCEDURE_NAME_INVALID envelope", () => {
    const result = parseProcedureName("Module.");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected 'Module.' to fail parsing");
    expect(result.code).toBe("PROCEDURE_NAME_INVALID");
    expect(result.message).toContain("malformed");
  });

  it("lone-dot input ('.') returns a typed PROCEDURE_NAME_INVALID envelope", () => {
    const result = parseProcedureName(".");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected '.' to fail parsing");
    expect(result.code).toBe("PROCEDURE_NAME_INVALID");
  });

  it("path-like module name ('../etc/Foo') returns a typed PROCEDURE_NAME_INVALID envelope", () => {
    const result = parseProcedureName("../etc/Foo");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected '../etc/Foo' to fail parsing");
    expect(result.code).toBe("PROCEDURE_NAME_INVALID");
    expect(result.message).toContain("../etc/Foo");
  });

  it("backslash in module name ('Module\\\\Sub.Foo') returns a typed PROCEDURE_NAME_INVALID envelope", () => {
    const result = parseProcedureName("Module\\Sub.Foo");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected backslash to fail parsing");
    expect(result.code).toBe("PROCEDURE_NAME_INVALID");
  });
});
