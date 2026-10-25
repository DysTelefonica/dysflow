/**
 * Issue #1866 item 7 — form serialization keys (Checksum, PrtDevMode, ...) are
 * not functional lines, even when the same .form.txt also has a real difference.
 *
 * A functional addition on one side must keep its direction: a Checksum that
 * differs between the two serializations must not count as a binary-only line.
 */

import { describe, expect, it } from "vitest";
import { classifyVbaPair } from "../../../src/core/services/vba-semantic-classifier";

function formTxt(checksum: number, extraLabel?: string): string {
  const lines = [
    "Version =21",
    `Checksum =${checksum}`,
    "Begin Form",
    "    Width =9070",
    "    Begin TextBox",
    '        Name ="txtNombre"',
    "    End",
  ];
  if (extraLabel !== undefined) {
    lines.push("    Begin Label", `        Name ="${extraLabel}"`, "    End");
  }
  lines.push("End", "");
  return lines.join("\n");
}

describe("form serialization keys do not count as functional lines (#1866 item 7)", () => {
  it("sourceNewer when only the source has a functional control and Checksum differs", () => {
    const result = classifyVbaPair({
      sourceText: formTxt(-1294068210, "lblNuevo"),
      binaryText: formTxt(1828192933),
      fileType: "form.txt",
      mode: "semantic",
    });
    expect(result.classification).toBe("sourceNewer");
    expect(result.binaryUniqueFunctionalLines).toBe(0);
  });

  it("binaryNewer when only the binary has a functional control and Checksum differs", () => {
    const result = classifyVbaPair({
      sourceText: formTxt(-1294068210),
      binaryText: formTxt(1828192933, "lblNuevo"),
      fileType: "form.txt",
      mode: "semantic",
    });
    expect(result.classification).toBe("binaryNewer");
    expect(result.srcUniqueFunctionalLines).toBe(0);
  });

  it("bothChanged when each side has a different functional control", () => {
    const result = classifyVbaPair({
      sourceText: formTxt(-1294068210, "lblSource"),
      binaryText: formTxt(1828192933, "lblBinary"),
      fileType: "form.txt",
      mode: "semantic",
    });
    expect(result.classification).toBe("bothChanged");
  });
});
