import { describe, expect, it } from "vitest";
import { parseFormTxt } from "../../../src/core/services/form-ir-service.js";
import {
  alignControls,
  distributeControls,
} from "../../../src/core/services/form-ui-align-distribute.js";

// Issue #1868 item 2 — Access stores twips as integers. Align and distribute
// must write whole numbers and keep the LayoutCached* copies in step with the
// primary Left/Top value, or the form file becomes internally inconsistent.

const FORM = [
  "Version =21",
  "Begin Form",
  "    AutoResize = NotDefault",
  "    Begin Section",
  "        Begin TextBox",
  "            Name =\"Nombre\"",
  "            Left =1428",
  "            Top =1000",
  "            LayoutCachedLeft =1428",
  "            LayoutCachedTop =1000",
  "        End",
  "        Begin TextBox",
  "            Name =\"DESCRIPCION\"",
  "            Left =1425",
  "            Top =1500",
  "            LayoutCachedLeft =1425",
  "            LayoutCachedTop =1500",
  "        End",
  "    End",
  "End",
  "CodeBehindForm",
  "",
].join("\r\n");

describe("align / distribute write integer twips (#1868)", () => {
  it("rounds a non-integer median to a whole number", () => {
    const ir = parseFormTxt(FORM);
    // Median of 1428 and 1425 is 1426.5; Access rejects the fractional value.
    const result = alignControls(ir, ["Nombre", "DESCRIPCION"], "left");

    expect(result.source).not.toMatch(/Left =1426\.5/);
    expect(result.source).toMatch(/Left =1427\b/);
    expect(result.source).toMatch(/Left =1427\b[\s\S]*Left =1427\b/);
  });

  it("updates LayoutCachedLeft together with Left", () => {
    const ir = parseFormTxt(FORM);
    const result = alignControls(ir, ["Nombre", "DESCRIPCION"], "left");

    expect(result.source.match(/LayoutCachedLeft =1427\b/g)).toHaveLength(2);
    expect(result.source).not.toMatch(/LayoutCachedLeft =1428\b/);
    expect(result.source).not.toMatch(/LayoutCachedLeft =1425\b/);
  });

  it("distribute writes integer Left values and keeps LayoutCachedLeft in step", () => {
    const ir = parseFormTxt(FORM);
    // Gap of 10 twips across 3 controls leaves a non-integer middle start.
    const three = parseFormTxt(
      FORM.replace(
        "CodeBehindForm",
        [
          "        Begin TextBox",
          "            Name =\"Middle\"",
          "            Left =1500",
          "            Top =2000",
          "            LayoutCachedLeft =1500",
          "            LayoutCachedTop =2000",
          "        End",
          "CodeBehindForm",
        ].join("\r\n"),
      ),
    );
    const result = distributeControls(three, ["Nombre", "DESCRIPCION", "Middle"], "horizontal", 7);

    expect(result.source).not.toMatch(/Left =\d+\.\d+/);
    expect(result.source).not.toMatch(/LayoutCachedLeft =\d+\.\d+/);
    expect(ir.root).toBeDefined();
  });
});
