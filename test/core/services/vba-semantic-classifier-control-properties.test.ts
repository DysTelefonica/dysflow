import { describe, expect, it } from "vitest";
import { compareVbaSourceTrees, type ComparisonFileSystemPort } from "../../../src/core/services/vba-source-comparison";

const SOURCE_WITH_BOUND_COLUMN = `Version =21
Begin Form
    Begin ComboBox
        Name ="cmbStatus"
        BoundColumn =1
    End
End
`;

const BINARY_WITHOUT_BOUND_COLUMN = `Version =21
Begin Form
    Begin ComboBox
        Name ="cmbStatus"
    End
End
`;

const BINARY_WITH_DIFFERENT_BOUND_COLUMN = BINARY_WITHOUT_BOUND_COLUMN.replace(
  '        Name ="cmbStatus"',
  '        Name ="cmbStatus"\n        BoundColumn =3',
);

const SOURCE_WITH_CHECKSUM = SOURCE_WITH_BOUND_COLUMN.replace("Version =21", "Checksum =1\nVersion =21");
const BINARY_WITH_CHECKSUM = SOURCE_WITH_BOUND_COLUMN.replace("Version =21", "Checksum =2\nVersion =21");

function fakeFileSystem(sourceText: string, binaryText: string): ComparisonFileSystemPort {
  return {
    mkdtemp: async (prefix) => prefix,
    readdir: async (path) => {
      if (path === "source") return [{ name: "Form_Test.form.txt", isDirectory: () => false, isFile: () => true }];
      if (path === "binary") return [{ name: "Form_Test.form.txt", isDirectory: () => false, isFile: () => true }];
      return [];
    },
    readFile: async (path) => (path.includes("binary") ? binaryText : sourceText),
    rm: async () => undefined,
    tmpdir: () => "tmp",
  };
}

describe("verify_code control-property mismatches", () => {
  it("identifies a source-only BoundColumn as an actionable control-property mismatch", async () => {
    const result = await compareVbaSourceTrees(
      "source",
      "binary",
      ["Form_Test"],
      false,
      fakeFileSystem(SOURCE_WITH_BOUND_COLUMN, BINARY_WITHOUT_BOUND_COLUMN),
    );

    const mismatch = result.actionableDifferent?.[0];
    expect(mismatch).toMatchObject({
      moduleName: "Form_Test",
      category: "control-property-mismatch",
      controlName: "cmbStatus",
      propertyName: "BoundColumn",
      sourceValue: "1",
      binaryValue: undefined,
    });
  });

  it("identifies a changed BoundColumn value and keeps the value delta", async () => {
    const result = await compareVbaSourceTrees(
      "source",
      "binary",
      ["Form_Test"],
      false,
      fakeFileSystem(SOURCE_WITH_BOUND_COLUMN, BINARY_WITH_DIFFERENT_BOUND_COLUMN),
    );

    expect(result.actionableDifferent?.[0]).toMatchObject({
      category: "control-property-mismatch",
      controlName: "cmbStatus",
      propertyName: "BoundColumn",
      sourceValue: "1",
      binaryValue: "3",
    });
  });

  it("does not classify Checksum serialization noise as an actionable control-property mismatch", async () => {
    const result = await compareVbaSourceTrees(
      "source",
      "binary",
      ["Form_Test"],
      false,
      fakeFileSystem(SOURCE_WITH_CHECKSUM, BINARY_WITH_CHECKSUM),
    );

    expect(result.actionableDifferent).toEqual([]);
    expect(result.nonActionableDifferent?.[0]?.category).toBeUndefined();
  });
});
