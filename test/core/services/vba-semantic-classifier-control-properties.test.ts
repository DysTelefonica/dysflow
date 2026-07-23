import { describe, expect, it } from "vitest";
import {
  type ComparisonFileSystemPort,
  compareVbaSourceTrees,
} from "../../../src/core/services/vba-source-comparison";

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

const SOURCE_WITH_CHECKSUM = SOURCE_WITH_BOUND_COLUMN.replace(
  "Version =21",
  "Checksum =1\nVersion =21",
);
const BINARY_WITH_CHECKSUM = SOURCE_WITH_BOUND_COLUMN.replace(
  "Version =21",
  "Checksum =2\nVersion =21",
);

function fakeFileSystem(
  sourceText: string,
  binaryText: string,
  sourceRoot = "source",
  binaryRoot = "binary",
): ComparisonFileSystemPort {
  const normalize = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "");
  const normalizedSourceRoot = normalize(sourceRoot);
  const normalizedBinaryRoot = normalize(binaryRoot);
  return {
    mkdtemp: async (prefix) => prefix,
    readdir: async (path) => {
      if (normalize(path) === normalizedSourceRoot)
        return [{ name: "Form_Test.form.txt", isDirectory: () => false, isFile: () => true }];
      if (normalize(path) === normalizedBinaryRoot)
        return [{ name: "Form_Test.form.txt", isDirectory: () => false, isFile: () => true }];
      return [];
    },
    readFile: async (path) => {
      const pathSegments = normalize(path).split("/");
      const binaryRootName = normalizedBinaryRoot.split("/").at(-1);
      return pathSegments.at(-2) === binaryRootName ? binaryText : sourceText;
    },
    rm: async () => undefined,
    tmpdir: () => "tmp",
  };
}

describe("verify_code control-property mismatches", () => {
  it("does not confuse a source root whose parent directory contains binary", async () => {
    const sourceRoot = "C:/worktrees/fix-binary-safety/source";
    const binaryRoot = "C:/worktrees/fix-binary-safety/exported";
    const result = await compareVbaSourceTrees(
      sourceRoot,
      binaryRoot,
      ["Form_Test"],
      false,
      fakeFileSystem(SOURCE_WITH_BOUND_COLUMN, BINARY_WITHOUT_BOUND_COLUMN, sourceRoot, binaryRoot),
    );

    expect(result.actionableDifferent?.[0]).toMatchObject({
      category: "control-property-mismatch",
      sourceValue: "1",
      binaryValue: undefined,
    });
  });

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
