import { describe, expect, it } from "vitest";
import {
  getVbaProcedure,
  listVbaProcedures,
} from "../../../src/core/services/vba-procedure-service";

/**
 * Regression tests for the pure VBA procedure parser.
 *
 * The parser is the authoritative source for both the MCP `dysflow_list_procedures`
 * and `dysflow_get_procedure` tools (issue #701) and for any future consumer that
 * wants to introspect VBA source text. It lives in `src/core/services/` so it is
 * free of filesystem and Access concerns — every test here is purely string-in,
 * string-out.
 */
describe("vba-procedure-service — listVbaProcedures", () => {
  it("returns procedures ordered by declaration line with canonical casing", () => {
    const source = [
      "Option Explicit",
      "",
      "Public Sub DoWork()",
      "    Dim x As Long",
      "End Sub",
      "",
      "Private Function GetValue() As Long",
      "    GetValue = 42",
      "End Function",
    ].join("\r\n");

    const procedures = listVbaProcedures(source);

    expect(procedures.map((p) => p.name)).toEqual(["DoWork", "GetValue"]);
    expect(procedures[0]).toMatchObject({
      name: "DoWork",
      kind: "Sub",
      visibility: "Public",
      line: 3,
    });
    expect(procedures[1]).toMatchObject({
      name: "GetValue",
      kind: "Function",
      visibility: "Private",
      line: 7,
    });
  });

  it("treats comments and Rem statements as non-declarations", () => {
    const source = [
      "'Public Sub CommentedOut()",
      "Rem Public Sub RemStatement()",
      "",
      "Public Sub RealProcedure()",
      "End Sub",
    ].join("\r\n");

    const procedures = listVbaProcedures(source);

    expect(procedures.map((p) => p.name)).toEqual(["RealProcedure"]);
  });

  it("does not detect a declaration that lives inside a string literal", () => {
    const source = [
      'Public Const SAMPLE As String = "Public Sub FakeOut()"',
      "",
      "Public Sub RealProcedure()",
      "End Sub",
    ].join("\r\n");

    const procedures = listVbaProcedures(source);

    expect(procedures.map((p) => p.name)).toEqual(["RealProcedure"]);
  });

  it("honours the kind filter (Sub/Function/Property)", () => {
    const source = [
      "Public Sub DoWork()",
      "End Sub",
      "",
      "Public Function GetValue() As Long",
      "    GetValue = 1",
      "End Function",
      "",
      "Public Property Get NameOnly() As String",
      '    NameOnly = "x"',
      "End Property",
    ].join("\r\n");

    expect(listVbaProcedures(source, "both").map((p) => p.name)).toEqual([
      "DoWork",
      "GetValue",
      "NameOnly",
    ]);
    expect(listVbaProcedures(source, "Sub").map((p) => p.name)).toEqual(["DoWork"]);
    expect(listVbaProcedures(source, "Function").map((p) => p.name)).toEqual(["GetValue"]);
    expect(listVbaProcedures(source, "Property").map((p) => p.name)).toEqual(["NameOnly"]);
  });
});

describe("vba-procedure-service — getVbaProcedure", () => {
  it("returns module/procedure/startLine/endLine/body for a single procedure", () => {
    const source = [
      "Option Explicit",
      "",
      "Public Function Add(a As Long, b As Long) As Long",
      "    Add = a + b",
      "End Function",
    ].join("\r\n");

    const detail = getVbaProcedure(source, "Add");

    expect(detail).toBeDefined();
    expect(detail?.name).toBe("Add");
    expect(detail?.kind).toBe("Function");
    expect(detail?.visibility).toBe("Public");
    expect(detail?.startLine).toBe(3);
    expect(detail?.endLine).toBe(5);
    expect(detail?.body).toContain("Add = a + b");
  });

  it("returns undefined when the procedure is not present", () => {
    const source = ["Public Sub DoWork()", "End Sub"].join("\r\n");

    expect(getVbaProcedure(source, "NonExistent")).toBeUndefined();
  });

  // Regression for issue #701 review blocker: VBA identifiers are case-insensitive
  // at the language level (VBA re-cases them on import). A consumer reaching the
  // service with `add`, `ADD`, or `Add` must get the same record, and the returned
  // name must carry the canonical casing from the source so downstream consumers
  // (binary diff, git blame, source-vs-binary verification) can compare it
  // verbatim without re-normalising.
  it("matches procedure names case-insensitively while preserving canonical casing in the response", () => {
    const source = [
      "Option Explicit",
      "",
      "Public Function Add(a As Long, b As Long) As Long",
      "    Add = a + b",
      "End Function",
    ].join("\r\n");

    const lower = getVbaProcedure(source, "add");
    const upper = getVbaProcedure(source, "ADD");
    const mixed = getVbaProcedure(source, "Add");
    const scrambled = getVbaProcedure(source, "aDD");

    // All four lookups return the same record (case-insensitive match).
    expect(lower).toBeDefined();
    expect(upper).toBeDefined();
    expect(mixed).toBeDefined();
    expect(scrambled).toBeDefined();
    expect(lower?.name).toBe("Add");
    expect(upper?.name).toBe("Add");
    expect(mixed?.name).toBe("Add");
    expect(scrambled?.name).toBe("Add");

    // And the structural fields are identical (only the lookup key differs).
    expect(lower?.startLine).toBe(3);
    expect(upper?.startLine).toBe(3);
    expect(lower?.endLine).toBe(5);
    expect(upper?.body).toBe(mixed?.body);
  });

  it("returns an empty body when the procedure is a single-line shell with no statements", () => {
    const source = ["Public Sub DoNothing()", "End Sub"].join("\r\n");

    const detail = getVbaProcedure(source, "DoNothing");

    expect(detail).toBeDefined();
    expect(detail?.startLine).toBe(1);
    expect(detail?.endLine).toBe(2);
    expect(detail?.body).toBe("");
  });

  it("handles Property Get/Let/Set variants under the same procedure name", () => {
    const source = [
      "Public Property Get Name() As String",
      "    Name = m_Name",
      "End Property",
      "",
      "Public Property Let Name(ByVal v As String)",
      "    m_Name = v",
      "End Property",
    ].join("\r\n");

    const getter = getVbaProcedure(source, "Name");

    // Both Property Get and Property Let collapse to the same identifier "Name".
    // The parser reports the first declaration; the body spans its single block.
    expect(getter?.name).toBe("Name");
    expect(getter?.kind).toBe("Property");
    expect(getter?.startLine).toBe(1);
    expect(getter?.body).toContain("Name = m_Name");
  });
});
