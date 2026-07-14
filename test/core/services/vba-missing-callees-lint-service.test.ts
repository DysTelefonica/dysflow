import { describe, expect, it } from "vitest";
import { lintVbaMissingCallees } from "../../../src/core/services/vba-missing-callees-lint-service";

const source = (text: string, path = "src/modules/Example.bas") => ({ path, text });

describe("VBA missing-callees lint", () => {
  it("recognizes a public Sub declaration", () => {
    const result = lintVbaMissingCallees([source("Public Sub SaveItem()\nEnd Sub")]);
    expect(result.totals.declarations).toBe(1);
  });

  it("recognizes a public Function declaration with a return type", () => {
    const result = lintVbaMissingCallees([
      source("Public Function FindItem(ByVal id As Long) As Boolean\nEnd Function"),
    ]);
    expect(result.totals.declarations).toBe(1);
  });

  it("recognizes a private Property declaration", () => {
    const result = lintVbaMissingCallees([
      source("Private Property Get CurrentItem() As Object\nEnd Property"),
    ]);
    expect(result.totals.declarations).toBe(1);
  });

  it("does not report a call to a declared procedure", () => {
    const result = lintVbaMissingCallees([
      source("Public Sub SaveItem()\nEnd Sub\nPublic Sub Run()\n  SaveItem\nEnd Sub"),
    ]);
    expect(result.missing).toEqual([]);
  });

  it("reports an undeclared call with its actionable location", () => {
    const result = lintVbaMissingCallees([
      source("Public Sub Run()\n  MissingHelper (42)\nEnd Sub"),
    ]);
    expect(result.missing).toEqual([
      {
        file: "src/modules/Example.bas",
        line: 2,
        column: 3,
        name: "MissingHelper",
        module: "Example",
        kind: "call",
      },
    ]);
  });

  it.each([
    ["Call MissingHelper", 8],
    ["MissingHelper 42", 3],
  ])("reports statement-style call %s", (statement, column) => {
    const result = lintVbaMissingCallees([source(`Public Sub Run()\n  ${statement}\nEnd Sub`)]);
    expect(result.missing).toEqual([
      expect.objectContaining({ name: "MissingHelper", line: 2, column, kind: "call" }),
    ]);
  });

  it("excludes VBA, DAO, Access control, and implicit runtime members", () => {
    const result = lintVbaMissingCallees([
      source(
        [
          "Public Sub Run()",
          '  Debug.Print ("hello")',
          '  MsgBox ("hello")',
          '  db.OpenRecordset "Items"',
          "  Me.lblFoo.Visible = True",
          "End Sub",
        ].join("\n"),
      ),
    ]);
    expect(result.missing).toEqual([]);
  });

  it("allows consumers to add exclusions without forking", () => {
    const result = lintVbaMissingCallees(
      [source("Public Sub Run()\n  ConsumerHelper (42)\nEnd Sub")],
      { additionalExclusions: ["ConsumerHelper"] },
    );
    expect(result.missing).toEqual([]);
  });

  it("honors the inline ignore directive", () => {
    const result = lintVbaMissingCallees([
      source("Public Sub Run()\n  MissingHelper (42) ' dysflow:lint-ignore-line\nEnd Sub"),
    ]);
    expect(result.missing).toEqual([]);
  });
});
