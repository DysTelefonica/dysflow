import { describe, expect, it } from "vitest";
import { parseFormTxt } from "../../../src/core/services/form-ir-service.js";
import { setProperties } from "../../../src/core/services/form-ir-service.js";

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
  "            Caption =\"Nombre\"",
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
});
