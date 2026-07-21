import { describe, expect, it } from "vitest";

const FORM_WITH_MISSING_BOUND_COLUMN = `Version =21
Begin Form
    Begin ComboBox
        Name ="cmbStatus"
        StatusBarText ="status"
    End
    Begin TextBox
        Name ="txtValue"
    End
End
`;

const FORM_WITH_EXISTING_BOUND_COLUMN = FORM_WITH_MISSING_BOUND_COLUMN.replace(
  '        StatusBarText ="status"',
  '        BoundColumn =1\n        StatusBarText ="status"',
);

async function postprocessFormTxt(
  source: string,
  lookup: (controlName: string, propertyName: string) => string | undefined,
): Promise<string> {
  const module = await import("../../../src/core/services/control-property-allow-list");
  return module.postprocessFormTxt(source, lookup);
}

describe("postprocessFormTxt — ComboBox/ListBox functional control properties", () => {
  it("injects a missing allow-list property from the binary lookup", async () => {
    const result = await postprocessFormTxt(FORM_WITH_MISSING_BOUND_COLUMN, (control, property) =>
      control === "cmbStatus" && property === "BoundColumn" ? "1" : undefined,
    );

    expect(result).toContain('Name ="cmbStatus"\n        BoundColumn =1');
  });

  it("preserves an existing allow-list property and does not replace its value", async () => {
    const result = await postprocessFormTxt(FORM_WITH_EXISTING_BOUND_COLUMN, () => "3");

    expect(result).toContain("BoundColumn =1");
    expect(result).not.toContain("BoundColumn =3");
  });

  it("does not inject a non-allow-list default property", async () => {
    const result = await postprocessFormTxt(FORM_WITH_MISSING_BOUND_COLUMN, (control, property) =>
      control === "txtValue" && property === "BackColor" ? "16777215" : undefined,
    );

    expect(result).not.toContain("BackColor =16777215");
  });

  it("does not call the lookup for forms without ComboBox or ListBox controls", async () => {
    const lookup = () => {
      throw new Error("lookup should not run for unrelated control types");
    };

    const result = await postprocessFormTxt(
      FORM_WITH_MISSING_BOUND_COLUMN.replace("Begin ComboBox", "Begin TextBox"),
      lookup,
    );

    expect(result).toContain('Name ="cmbStatus"');
  });
});
