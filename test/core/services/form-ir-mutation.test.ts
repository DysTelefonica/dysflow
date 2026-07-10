import { describe, expect, it } from "vitest";
import {
  addControl,
  deleteControl,
  moveControl,
  parseFormTxt,
  renameControl,
  serializeFormTxt,
  setProperty,
} from "../../../src/core/services/form-ir-service";

const FORM_WITH_METADATA = `Version =21
Checksum =123456789
Begin Form
    Format =255
    PrtDevMode = Begin
        0x01020304
    End
    OnOpen ="[Event Procedure]"
    Begin
        Begin TextBox
            Name ="txtName"
            Left =100
            Top =200
            OnClick ="[Event Procedure]"
            Format ="@"
        End
        Begin Label
            Name ="lblName"
            Caption ="Name"
            FormatConditions = Begin
                Condition =1
            End
        End
    End
End
CodeBehindForm
Option Compare Database
`;

function metadataLines(source: string): string[] {
  return source
    .split("\n")
    .filter(
      (line) =>
        line.includes("Checksum =") ||
        line.includes("PrtDevMode") ||
        line.includes("0x01020304") ||
        line.includes("Format ="),
    );
}

function nestedControlForm(withEventBinding: boolean): string {
  const eventBinding = withEventBinding ? '                OnClick ="[Event Procedure]"\n' : "";
  return `Version =21
Begin Form
    Begin
        Begin OptionGroup
            Name ="grpChoice"
            Begin OptionButton
                Name ="optFirst"
${eventBinding}            End
        End
    End
End
CodeBehindForm
Option Compare Database
`;
}

function expectRefusalWithoutMutation(
  source: string,
  mutate: (ir: ReturnType<typeof parseFormTxt>) => unknown,
  code: string,
): void {
  const ir = parseFormTxt(source, { name: "CustomerForm" });
  const before = serializeFormTxt(ir);
  const codeBehind = ir.codeBehind;

  expect(() => mutate(ir)).toThrowError(expect.objectContaining({ code }));
  expect(serializeFormTxt(ir)).toBe(before);
  expect(ir.codeBehind).toBe(codeBehind);
}

describe("FormIR mutation primitives", () => {
  it("adds a control without changing existing metadata, bindings, or source IR", () => {
    const ir = parseFormTxt(FORM_WITH_METADATA, { name: "CustomerForm" });
    const before = serializeFormTxt(ir);

    const result = addControl(ir, {
      control: {
        name: "cmdSave",
        type: "CommandButton",
        properties: { Caption: '"Save"', Left: "300", Top: "400" },
      },
    });

    const mutated = serializeFormTxt(result.ir);
    expect(mutated).toContain('Begin CommandButton\n            Name ="cmdSave"');
    expect(mutated).toContain('Caption ="Save"');
    expect(mutated).toContain('OnOpen ="[Event Procedure]"');
    expect(mutated).toContain('OnClick ="[Event Procedure]"');
    expect(metadataLines(mutated)).toEqual(metadataLines(before));
    expect(serializeFormTxt(ir)).toBe(before);
    expect(result.changedControlName).toBe("cmdSave");
    expect(result.preservedKeys).toEqual(
      expect.arrayContaining(["Checksum", "Format", "PrtDevMode"]),
    );
  });

  it("rejects add-control when a control with the same name already exists", () => {
    const ir = parseFormTxt(FORM_WITH_METADATA, { name: "CustomerForm" });

    expect(() =>
      addControl(ir, {
        control: { name: "txtName", type: "TextBox", properties: { Left: "1" } },
      }),
    ).toThrowError(expect.objectContaining({ code: "FORM_DUPLICATE_CONTROL" }));
  });

  it("moves a control by changing Left and Top only", () => {
    const ir = parseFormTxt(FORM_WITH_METADATA, { name: "CustomerForm" });

    const result = moveControl(ir, { controlName: "txtName", left: 900, top: 1200 });
    const mutated = serializeFormTxt(result.ir);

    expect(mutated).toContain(
      'Name ="txtName"\n            Left =900\n            Top =1200\n            OnClick ="[Event Procedure]"',
    );
    expect(mutated).toContain('Begin Label\n            Name ="lblName"');
    expect(metadataLines(mutated)).toEqual(metadataLines(serializeFormTxt(ir)));
  });

  it("rejects move-control for a missing control", () => {
    const ir = parseFormTxt(FORM_WITH_METADATA, { name: "CustomerForm" });

    expect(() => moveControl(ir, { controlName: "missing", left: 1 })).toThrowError(
      expect.objectContaining({ code: "FORM_CONTROL_NOT_FOUND" }),
    );
  });

  it("adds controls inside the target section child container", () => {
    const ir = parseFormTxt(
      `Version =21
Begin Form
    Begin Section
        Name ="Detalle"
        Begin
        End
    End
End
`,
      { name: "CustomerForm" },
    );

    const result = addControl(ir, {
      targetSectionName: "Detalle",
      control: {
        name: "cmdInsideDetail",
        type: "CommandButton",
        properties: { Left: "1", Top: "2", Width: "3", Height: "4" },
      },
    });

    const serialized = serializeFormTxt(result.ir);
    expect(serialized).toContain(
      `Begin Section
        Name ="Detalle"
        Begin
            Begin CommandButton
                Name ="cmdInsideDetail"
                Left =1`,
    );
  });

  it("rejects mutation when preserved metadata changes during the operation", () => {
    const ir = parseFormTxt(FORM_WITH_METADATA, { name: "CustomerForm" });

    expect(() =>
      addControl(ir, {
        control: {
          name: "cmdSave",
          type: "CommandButton",
          properties: { Left: "1", Format: '"@"' },
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "FORM_METADATA_LOSS" }));
  });

  it("rejects rename-control when the control has event procedure bindings", () => {
    const ir = parseFormTxt(FORM_WITH_METADATA, { name: "CustomerForm" });

    expect(() =>
      renameControl(ir, { controlName: "txtName", newName: "txtCustomerName" }),
    ).toThrowError(expect.objectContaining({ code: "FORM_CONTROL_HAS_EVENT_BINDING" }));
    expect(serializeFormTxt(ir)).toContain('Name ="txtName"');
  });

  it("renames a control without event bindings while preserving type and metadata", () => {
    const ir = parseFormTxt(FORM_WITH_METADATA, { name: "CustomerForm" });

    const result = renameControl(ir, { controlName: "lblName", newName: "lblCustomerName" });
    const mutated = serializeFormTxt(result.ir);

    expect(mutated).toContain('Begin Label\n            Name ="lblCustomerName"');
    expect(mutated).toContain('Format ="@"');
    expect(mutated).not.toContain('Name ="lblName"');
    expect(metadataLines(mutated)).toEqual(metadataLines(serializeFormTxt(ir)));
  });

  it("rejects rename-control when the target name already exists", () => {
    const ir = parseFormTxt(FORM_WITH_METADATA, { name: "CustomerForm" });

    expect(() => renameControl(ir, { controlName: "txtName", newName: "lblName" })).toThrowError(
      expect.objectContaining({ code: "FORM_DUPLICATE_CONTROL" }),
    );
  });

  it("sets an existing scalar property without changing source IR or code-behind", () => {
    const ir = parseFormTxt(FORM_WITH_METADATA, { name: "CustomerForm" });
    const before = serializeFormTxt(ir);

    const result = setProperty(ir, {
      controlName: "lblName",
      property: "Caption",
      value: '"Customer name"',
    });

    expect(result.source).toContain('Name ="lblName"\n            Caption ="Customer name"');
    expect(result.ir.codeBehind).toBe(ir.codeBehind);
    expect(serializeFormTxt(ir)).toBe(before);
    expect(result.changedControlName).toBe("lblName");
  });

  it("sets a new scalar property using the established mutation value normalization", () => {
    const ir = parseFormTxt(FORM_WITH_METADATA, { name: "CustomerForm" });

    const result = setProperty(ir, {
      controlName: "lblName",
      property: "Visible",
      value: true,
    });

    expect(result.source).toContain("Visible = NotDefault");
    expect(result.source).toContain('Caption ="Name"');
  });

  it("refuses protected properties without mutating the IR", () => {
    expectRefusalWithoutMutation(
      FORM_WITH_METADATA,
      (ir) => setProperty(ir, { controlName: "txtName", property: "Format", value: '"!"' }),
      "FORM_PROPERTY_PROTECTED",
    );
  });

  it("refuses Name changes through set-property without mutating the IR", () => {
    expectRefusalWithoutMutation(
      FORM_WITH_METADATA,
      (ir) => setProperty(ir, { controlName: "lblName", property: "Name", value: '"lblOther"' }),
      "FORM_PROPERTY_PROTECTED",
    );
  });

  it("refuses replacing a blob property with a scalar without mutating the IR", () => {
    expectRefusalWithoutMutation(
      FORM_WITH_METADATA,
      (ir) =>
        setProperty(ir, {
          controlName: "lblName",
          property: "FormatConditions",
          value: "replacement",
        }),
      "FORM_PROPERTY_NOT_SCALAR",
    );
  });

  it("deletes a leaf control without changing source IR or code-behind", () => {
    const ir = parseFormTxt(FORM_WITH_METADATA, { name: "CustomerForm" });
    const before = serializeFormTxt(ir);

    const result = deleteControl(ir, { controlName: "lblName" });

    expect(result.source).not.toContain('Name ="lblName"');
    expect(result.source).toContain('Name ="txtName"');
    expect(result.ir.codeBehind).toBe(ir.codeBehind);
    expect(serializeFormTxt(ir)).toBe(before);
    expect(result.changedControlName).toBe("lblName");
  });

  it("refuses deleting a missing control without mutating the IR", () => {
    expectRefusalWithoutMutation(
      FORM_WITH_METADATA,
      (ir) => deleteControl(ir, { controlName: "missing" }),
      "FORM_CONTROL_NOT_FOUND",
    );
  });

  it("refuses deletion when the target control has an event binding", () => {
    expectRefusalWithoutMutation(
      FORM_WITH_METADATA,
      (ir) => deleteControl(ir, { controlName: "txtName" }),
      "FORM_CONTROL_HAS_EVENT_BINDING",
    );
  });

  it("recursively refuses deletion when a descendant has an event binding", () => {
    expectRefusalWithoutMutation(
      nestedControlForm(true),
      (ir) => deleteControl(ir, { controlName: "grpChoice" }),
      "FORM_CONTROL_HAS_EVENT_BINDING",
    );
  });

  it("refuses deleting a control with named children", () => {
    expectRefusalWithoutMutation(
      nestedControlForm(false),
      (ir) => deleteControl(ir, { controlName: "grpChoice" }),
      "FORM_CONTROL_HAS_CHILDREN",
    );
  });
});
