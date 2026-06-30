import { describe, expect, it } from "vitest";
import {
  addControl,
  moveControl,
  parseFormTxt,
  renameControl,
  serializeFormTxt,
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
});
