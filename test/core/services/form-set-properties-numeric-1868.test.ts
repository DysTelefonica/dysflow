import { describe, expect, it } from "vitest";
import {
  duplicateControl,
  FormMutationError,
  parseFormTxt,
  setProperties,
  setProperty,
} from "../../../src/core/services/form-ir-service.js";

// Issue #1868 item 1 — form_set_properties wrote a numeric property as quoted
// text (`Width ="7400"`), which Access rejects. Each value is written by the
// type of its property: numeric and boolean/enum tokens raw, text quoted.

const FORM = [
  "Version =21",
  "Begin Form",
  "    AutoResize = NotDefault",
  "    Begin Section",
  "        Begin TextBox",
  '            Name ="Nombre"',
  "            Left =1428",
  "            Top =1000",
  "            Width =7477",
  "            Height =300",
  "            FontSize =10",
  '            Tag ="cliente"',
  '            Caption ="Nombre"',
  "        End",
  "    End",
  "End",
  "CodeBehindForm",
  "",
].join("\r\n");

describe("setProperties writes each value by its property type (#1868)", () => {
  it("writes a twip property as a raw number", () => {
    const result = setProperties(parseFormTxt(FORM), {
      controlName: "Nombre",
      properties: { Width: "7400" },
    });

    expect(result.source).toMatch(/Width =7400\b/);
    expect(result.source).not.toMatch(/Width ="7400"/);
  });

  it("keeps a text property quoted even when its value looks numeric", () => {
    const result = setProperties(parseFormTxt(FORM), {
      controlName: "Nombre",
      properties: { Caption: "7400" },
    });

    expect(result.source).toMatch(/Caption ="7400"/);
  });

  it("writes a numeric value supplied as a JavaScript number raw", () => {
    const result = setProperties(parseFormTxt(FORM), {
      controlName: "Nombre",
      properties: { Width: 7400 },
    });

    expect(result.source).toMatch(/Width =7400\b/);
  });

  it("writes a property outside the type table raw when the file already stores it raw", () => {
    const result = setProperties(parseFormTxt(FORM), {
      controlName: "Nombre",
      properties: { FontSize: "12" },
    });

    expect(result.source).toMatch(/FontSize =12\b/);
    expect(result.source).not.toMatch(/FontSize ="12"/);
  });

  it("keeps a property outside the type table quoted when the file already stores it quoted", () => {
    const result = setProperties(parseFormTxt(FORM), {
      controlName: "Nombre",
      properties: { Tag: "123" },
    });

    expect(result.source).toMatch(/Tag ="123"/);
  });

  it.each(["abc", "7400.5"])("rejects %s for a twip property instead of writing it", (value) => {
    expect(() =>
      setProperties(parseFormTxt(FORM), {
        controlName: "Nombre",
        properties: { Width: value },
      }),
    ).toThrow(expect.objectContaining({ code: "FORM_PROPERTY_VALUE_INVALID" }));
  });

  it("rejects a numeric-looking value when neither the type table nor the file tells its type", () => {
    let error: unknown;
    try {
      setProperties(parseFormTxt(FORM), {
        controlName: "Nombre",
        properties: { ControlTipText: "42" },
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(FormMutationError);
    expect((error as FormMutationError).code).toBe("FORM_PROPERTY_VALUE_INVALID");
    expect((error as FormMutationError).message).toMatch(/ControlTipText/);
  });

  it("writes a known numeric property raw even when the control does not carry it yet", () => {
    // The MCP schema declares the map values as strings, so a caller can only
    // send "8"; the serializer must know ListRows takes a number.
    const result = setProperties(parseFormTxt(FORM), {
      controlName: "Nombre",
      properties: { ListRows: "8", FontItalic: "NotDefault" },
    });

    expect(result.source).toMatch(/ListRows =8\b/);
    expect(result.source).toMatch(/FontItalic =NotDefault\b/);
  });

  it("quotes plain text for a property the file does not carry yet", () => {
    const result = setProperties(parseFormTxt(FORM), {
      controlName: "Nombre",
      properties: { ControlTipText: "Nombre del cliente" },
    });

    expect(result.source).toMatch(/ControlTipText ="Nombre del cliente"/);
  });

  it("accepts an explicitly quoted value when the type is unknown", () => {
    const result = setProperties(parseFormTxt(FORM), {
      controlName: "Nombre",
      properties: { ControlTipText: '"42"' },
    });

    expect(result.source).toMatch(/ControlTipText ="42"/);
  });
});

describe("setProperty writes a value by the type the file already stores (#1868)", () => {
  it("writes a raw property outside the type table raw", () => {
    const result = setProperty(parseFormTxt(FORM), {
      controlName: "Nombre",
      property: "FontSize",
      value: "12",
    });

    expect(result.source).toMatch(/FontSize =12\b/);
    expect(result.source).not.toMatch(/FontSize ="12"/);
  });
});

describe("duplicateControl overrides write each value by its property type (#1868)", () => {
  it("writes numeric overrides raw and text overrides quoted", () => {
    const result = duplicateControl(parseFormTxt(FORM), {
      sourceControlName: "Nombre",
      newName: "Nombre2",
      overrides: { Left: "2000", FontSize: "14", Caption: "7400" },
    });

    expect(result.source).toMatch(/Left =2000\b/);
    expect(result.source).not.toMatch(/Left ="2000"/);
    expect(result.source).toMatch(/FontSize =14\b/);
    expect(result.source).toMatch(/Caption ="7400"/);
  });

  it("rejects a non-numeric override for a twip property", () => {
    expect(() =>
      duplicateControl(parseFormTxt(FORM), {
        sourceControlName: "Nombre",
        newName: "Nombre2",
        overrides: { Top: "arriba" },
      }),
    ).toThrow(expect.objectContaining({ code: "FORM_PROPERTY_VALUE_INVALID" }));
  });
});
