import { describe, expect, it } from "vitest";
import { parseFormTxt, serializeFormTxt } from "../../../src/core/services/form-ir-service";

function cleanFormFixture(index: number): string {
  const controlType = index % 2 === 0 ? "ComboBox" : "TextBox";
  const controlName = `${controlType === "ComboBox" ? "cmb" : "txt"}${index}`;
  return `Version =21
VersionRequired =20
Begin Form
    Caption ="Clean form ${index}"
    Begin ${controlType}
        Name ="${controlName}"
        Left =${100 + index}
        Top =${200 + index}
        Width =${300 + index}
        Height =${400 + index}
        Visible = NotDefault
    End
End`;
}

describe("clean form round-trip stability", () => {
  it("keeps the serializer stable across a 100-form clean corpus", () => {
    const corpus = Array.from({ length: 120 }, (_, index) => cleanFormFixture(index));

    expect(corpus).toHaveLength(120);
    for (const source of corpus) {
      const roundTripped = serializeFormTxt(parseFormTxt(source));
      expect(roundTripped).toBe(source);
    }
  });
});
