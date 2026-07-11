import { describe, expect, it } from "vitest";
import type {
  FormUiBehaviorMap,
  FormUiVerificationFinding,
} from "../../../src/core/models/form-ui-builder";
import { verifyFormUi } from "../../../src/core/services/form-ui-verification-service";

/**
 * Issue #831 — `verify_form_ui` extended with geometry / tab-order /
 * property-value checks. Backward-compat contract:
 *   - The existing 3 survival codes (FORM_UI_CONTROL_MISSING,
 *     FORM_UI_EVENT_DRIFT, FORM_UI_BINDING_DRIFT) keep `severity:"error"`
 *     and still surface in `findings` + `checkedControls`.
 *   - New `looksRightFindings` carry `severity:"warning"` (informational,
 *     non-blocking per the issue) and are additive.
 *   - `ok` stays `true` while no `severity:"error"` finding is present —
 *     a looks-right warning never blocks the route.
 *   - Geometry/tab-order/property-validity checks ONLY run when the
 *     caller supplies the optional inputs they need. Missing optional
 *     input ⇒ that check is skipped silently (no warning).
 */

const source: FormUiBehaviorMap = {
  formName: "Customer",
  formEvents: [],
  unmappedEvidence: [],
  warnings: [],
  controls: [
    {
      name: "cmdSave",
      type: "CommandButton",
      role: "action",
      events: ["OnClick"],
      bindings: [],
      codegraphEvidence: [],
    },
  ],
};

function cloneControl(
  control: FormUiBehaviorMap["controls"][number],
  overrides: Partial<FormUiBehaviorMap["controls"][number]> = {},
): FormUiBehaviorMap["controls"][number] {
  return { ...control, ...overrides };
}

function withControls(controls: FormUiBehaviorMap["controls"]): FormUiBehaviorMap {
  return { ...source, controls };
}

/**
 * Build a source contract that mirrors the applied contract's control
 * set (same names + events + bindings, no `properties`). This keeps the
 * survival check neutral — every source control has a matching applied
 * control with the same events and bindings — so ONLY the looks-right
 * checks fire. Use this in looks-right test fixtures where the source
 * shape differs from the global `source` (e.g. tests that build their
 * own `cmdA`/`cmdB`/`txtX` controls).
 */
function sourceFor(controls: FormUiBehaviorMap["controls"]): FormUiBehaviorMap {
  return {
    formName: "Customer",
    formEvents: [],
    unmappedEvidence: [],
    warnings: [],
    controls: controls.map((control) => ({
      name: control.name,
      type: control.type,
      role: control.role,
      events: [...control.events],
      bindings: [...control.bindings],
      codegraphEvidence: [],
    })),
  };
}

describe("verifyFormUi — backward compat (issue #831 baseline)", () => {
  it("returns ok:true with empty findings on a no-change contract", () => {
    const report = verifyFormUi(source, source);

    expect(report.ok).toBe(true);
    expect(report.formName).toBe("Customer");
    expect(report.findings).toEqual([]);
    expect(report.checkedControls).toEqual(["cmdSave"]);
  });

  it("survivedFindings mirrors the existing FORM_UI_EVENT_DRIFT error", () => {
    const cmdSave = source.controls[0];
    if (!cmdSave) throw new Error("test fixture missing cmdSave");
    const report = verifyFormUi(source, withControls([cloneControl(cmdSave, { events: [] })]));

    expect(report.ok).toBe(false);
    expect(report.survivedFindings).toEqual([
      expect.objectContaining({
        code: "FORM_UI_EVENT_DRIFT",
        severity: "error",
        controlName: "cmdSave",
      }),
    ]);
    // The combined `findings` array is PRESERVED (additive only) so existing
    // callers parsing the envelope continue to see the same surface.
    expect(report.findings).toEqual(report.survivedFindings);
    expect(report.looksRightFindings).toEqual([]);
  });

  it("survivedFindings stays empty when no survival check fires", () => {
    const report = verifyFormUi(source, source);

    expect(report.survivedFindings).toEqual([]);
    expect(report.looksRightFindings).toEqual([]);
    expect(report.findings).toEqual([]);
  });
});

describe("verifyFormUi — geometry (issue #831 phase 2)", () => {
  function controlWithBox(
    name: string,
    box: { left: number; top: number; width: number; height: number },
    extras: Partial<FormUiBehaviorMap["controls"][number]> = {},
  ): FormUiBehaviorMap["controls"][number] {
    return {
      name,
      type: "CommandButton",
      role: "action",
      events: [],
      bindings: [],
      codegraphEvidence: [],
      properties: {
        Left: String(box.left),
        Top: String(box.top),
        Width: String(box.width),
        Height: String(box.height),
      },
      ...extras,
    };
  }

  it("flags two controls whose AABBs strictly overlap", () => {
    const cmdA = controlWithBox("cmdA", { left: 100, top: 100, width: 500, height: 400 });
    const cmdB = controlWithBox("cmdB", { left: 300, top: 200, width: 500, height: 400 });

    const report = verifyFormUi(sourceFor([cmdA, cmdB]), withControls([cmdA, cmdB]));

    const overlapping = report.looksRightFindings.filter(
      (finding: FormUiVerificationFinding) => finding.code === "FORM_UI_OVERLAPPING_BOUNDS",
    );
    expect(overlapping).toHaveLength(1);
    expect(overlapping[0]?.severity).toBe("warning");
    // The finding references BOTH participants — symmetric pairwise report.
    expect(overlapping[0]?.controlName).toContain("cmdA");
    expect(overlapping[0]?.controlName).toContain("cmdB");
    // ok stays true — looks-right findings are informational, not blocking.
    expect(report.ok).toBe(true);
  });

  it("edge-touching boxes are NOT flagged as overlapping", () => {
    // Strict AABB test: edge-touching is allowed (no visual overlap).
    const cmdA = controlWithBox("cmdA", { left: 0, top: 0, width: 1000, height: 1000 });
    const cmdB = controlWithBox("cmdB", { left: 1000, top: 0, width: 1000, height: 1000 });

    const report = verifyFormUi(source, withControls([cmdA, cmdB]));

    expect(
      report.looksRightFindings.some(
        (finding: FormUiVerificationFinding) => finding.code === "FORM_UI_OVERLAPPING_BOUNDS",
      ),
    ).toBe(false);
  });

  it("flags negative Left or Top as FORM_UI_NEGATIVE_POSITION", () => {
    const cmdA = controlWithBox("cmdA", { left: -50, top: 100, width: 500, height: 400 });
    const cmdB = controlWithBox("cmdB", { left: 100, top: -10, width: 500, height: 400 });

    const report = verifyFormUi(sourceFor([cmdA, cmdB]), withControls([cmdA, cmdB]));

    const negatives = report.looksRightFindings.filter(
      (finding: FormUiVerificationFinding) => finding.code === "FORM_UI_NEGATIVE_POSITION",
    );
    expect(negatives).toHaveLength(2);
    expect(negatives.map((n) => n.controlName).sort()).toEqual(["cmdA", "cmdB"]);
    expect(report.ok).toBe(true);
  });

  it("flags controls whose right/bottom exceed the form canvas when formCanvas is supplied", () => {
    const cmdA = controlWithBox("cmdA", { left: 0, top: 0, width: 500, height: 400 });
    const cmdB = controlWithBox("cmdB", { left: 5000, top: 0, width: 500, height: 400 });

    const report = verifyFormUi(sourceFor([cmdA, cmdB]), withControls([cmdA, cmdB]), {
      formCanvas: { width: 4000, height: 4000 },
    });

    const offCanvas = report.looksRightFindings.filter(
      (finding: FormUiVerificationFinding) => finding.code === "FORM_UI_OFF_CANVAS",
    );
    expect(offCanvas).toHaveLength(1);
    expect(offCanvas[0]?.controlName).toBe("cmdB");
    expect(report.ok).toBe(true);
  });

  it("does NOT flag off-canvas when formCanvas is absent (optional input)", () => {
    const cmdA = controlWithBox("cmdA", { left: 99999, top: 0, width: 500, height: 400 });

    const report = verifyFormUi(source, withControls([cmdA]));

    expect(
      report.looksRightFindings.some(
        (finding: FormUiVerificationFinding) => finding.code === "FORM_UI_OFF_CANVAS",
      ),
    ).toBe(false);
  });

  it("flags controls outside their owning section bounds when section bounds supplied", () => {
    const detailControl = controlWithBox("txtDetail", {
      left: 100,
      top: 100,
      width: 200,
      height: 200,
    });
    const headerControl = controlWithBox("txtHeader", {
      left: 15000,
      top: 100,
      width: 200,
      height: 200,
    });

    const report = verifyFormUi(
      sourceFor([detailControl, headerControl]),
      withControls([detailControl, headerControl]),
      {
        sectionBounds: {
          Detail: { left: 0, top: 0, width: 20000, height: 10000 },
          FormHeader: { left: 0, top: 0, width: 5000, height: 1000 },
        },
        controlSection: {
          txtDetail: "Detail",
          txtHeader: "FormHeader",
        },
      },
    );

    const offSection = report.looksRightFindings.filter(
      (finding: FormUiVerificationFinding) => finding.code === "FORM_UI_OFF_SECTION",
    );
    expect(offSection).toHaveLength(1);
    expect(offSection[0]?.controlName).toBe("txtHeader");
    expect(report.ok).toBe(true);
  });

  it("does NOT flag off-section when section bounds are absent (optional input)", () => {
    const control = controlWithBox("txtX", { left: 99999, top: 0, width: 100, height: 100 });

    const report = verifyFormUi(source, withControls([control]));

    expect(
      report.looksRightFindings.some(
        (finding: FormUiVerificationFinding) => finding.code === "FORM_UI_OFF_SECTION",
      ),
    ).toBe(false);
  });
});

describe("verifyFormUi — tab order (issue #831 phase 2)", () => {
  function tabControl(
    name: string,
    box: { left: number; top: number; width: number; height: number },
    tabIndex: number,
  ): FormUiBehaviorMap["controls"][number] {
    return {
      name,
      type: "TextBox",
      role: "input",
      events: [],
      bindings: [],
      codegraphEvidence: [],
      properties: {
        Left: String(box.left),
        Top: String(box.top),
        Width: String(box.width),
        Height: String(box.height),
        TabIndex: String(tabIndex),
      },
    };
  }

  it("flags tab order that does NOT match visual top-to-bottom order", () => {
    // Visual top-to-bottom: A (top 100), B (top 500), C (top 900).
    // TabIndex says: C → B → A. Mismatch.
    const a = tabControl("txtA", { left: 100, top: 100, width: 1000, height: 200 }, 3);
    const b = tabControl("txtB", { left: 100, top: 500, width: 1000, height: 200 }, 2);
    const c = tabControl("txtC", { left: 100, top: 900, width: 1000, height: 200 }, 1);

    const report = verifyFormUi(sourceFor([a, b, c]), withControls([a, b, c]));

    const tabFindings = report.looksRightFindings.filter(
      (finding: FormUiVerificationFinding) => finding.code === "FORM_UI_TAB_ORDER_MISMATCH",
    );
    expect(tabFindings).toHaveLength(1);
    expect(tabFindings[0]?.severity).toBe("warning");
    expect(report.ok).toBe(true);
  });

  it("does NOT flag tab order when TabIndex matches visual top-to-bottom order", () => {
    // Visual top-to-bottom: A, B, C; TabIndex says: 1, 2, 3. Match.
    const a = tabControl("txtA", { left: 100, top: 100, width: 1000, height: 200 }, 1);
    const b = tabControl("txtB", { left: 100, top: 500, width: 1000, height: 200 }, 2);
    const c = tabControl("txtC", { left: 100, top: 900, width: 1000, height: 200 }, 3);

    const report = verifyFormUi(source, withControls([a, b, c]));

    expect(
      report.looksRightFindings.some(
        (finding: FormUiVerificationFinding) => finding.code === "FORM_UI_TAB_ORDER_MISMATCH",
      ),
    ).toBe(false);
  });

  it("does NOT flag tab order when no control has TabIndex set (Access uses visual order by default)", () => {
    const a = {
      name: "txtA",
      type: "TextBox",
      role: "input" as const,
      events: [],
      bindings: [],
      codegraphEvidence: [],
      properties: {
        Left: "100",
        Top: "100",
        Width: "1000",
        Height: "200",
      },
    };
    const b = {
      name: "txtB",
      type: "TextBox",
      role: "input" as const,
      events: [],
      bindings: [],
      codegraphEvidence: [],
      properties: {
        Left: "100",
        Top: "500",
        Width: "1000",
        Height: "200",
      },
    };

    const report = verifyFormUi(source, withControls([a, b]));

    expect(
      report.looksRightFindings.some(
        (finding: FormUiVerificationFinding) => finding.code === "FORM_UI_TAB_ORDER_MISMATCH",
      ),
    ).toBe(false);
  });
});

describe("verifyFormUi — property validity (issue #831 phase 2)", () => {
  it("flags Left/Top/Width/Height outside the allowed twips range", () => {
    const oversized = {
      name: "txtBig",
      type: "TextBox",
      role: "input" as const,
      events: [],
      bindings: [],
      codegraphEvidence: [],
      // 100,000 twips ≈ 70 inches — way past any real form.
      properties: {
        Left: "100",
        Top: "100",
        Width: "100000",
        Height: "200",
      },
    };

    const report = verifyFormUi(sourceFor([oversized]), withControls([oversized]));

    const range = report.looksRightFindings.filter(
      (finding: FormUiVerificationFinding) => finding.code === "FORM_UI_PROPERTY_OUT_OF_RANGE",
    );
    expect(range).toHaveLength(1);
    expect(range[0]?.controlName).toBe("txtBig");
    expect(range[0]?.message.toLowerCase()).toContain("width");
    expect(report.ok).toBe(true);
  });

  it("does NOT flag properties within the allowed twips range", () => {
    const sane = {
      name: "txtSane",
      type: "TextBox",
      role: "input" as const,
      events: [],
      bindings: [],
      codegraphEvidence: [],
      properties: {
        Left: "100",
        Top: "100",
        Width: "500",
        Height: "200",
      },
    };

    const report = verifyFormUi(source, withControls([sane]));

    expect(
      report.looksRightFindings.some(
        (finding: FormUiVerificationFinding) => finding.code === "FORM_UI_PROPERTY_OUT_OF_RANGE",
      ),
    ).toBe(false);
  });

  it("flags unknown enum values for known enum properties (BackStyle)", () => {
    const badEnum = {
      name: "txtEnum",
      type: "TextBox",
      role: "input" as const,
      events: [],
      bindings: [],
      codegraphEvidence: [],
      properties: {
        Left: "100",
        Top: "100",
        Width: "500",
        Height: "200",
        BackStyle: "9", // 0=Transparent, 1=Normal — 9 is out of range
      },
    };

    const report = verifyFormUi(sourceFor([badEnum]), withControls([badEnum]));

    const enumFinding = report.looksRightFindings.filter(
      (finding: FormUiVerificationFinding) => finding.code === "FORM_UI_INVALID_ENUM_VALUE",
    );
    expect(enumFinding).toHaveLength(1);
    expect(enumFinding[0]?.controlName).toBe("txtEnum");
    expect(enumFinding[0]?.message).toContain("BackStyle");
    expect(report.ok).toBe(true);
  });

  it("does NOT flag valid enum values", () => {
    const goodEnum = {
      name: "txtEnum",
      type: "TextBox",
      role: "input" as const,
      events: [],
      bindings: [],
      codegraphEvidence: [],
      properties: {
        Left: "100",
        Top: "100",
        Width: "500",
        Height: "200",
        BackStyle: "1", // Normal
      },
    };

    const report = verifyFormUi(source, withControls([goodEnum]));

    expect(
      report.looksRightFindings.some(
        (finding: FormUiVerificationFinding) => finding.code === "FORM_UI_INVALID_ENUM_VALUE",
      ),
    ).toBe(false);
  });

  it("does NOT flag unknown enum properties (defensive: only known enums are checked)", () => {
    const unknown = {
      name: "txtX",
      type: "TextBox",
      role: "input" as const,
      events: [],
      bindings: [],
      codegraphEvidence: [],
      properties: {
        Left: "100",
        Top: "100",
        Width: "500",
        Height: "200",
        SomeCustomProperty: "999",
      },
    };

    const report = verifyFormUi(source, withControls([unknown]));

    expect(
      report.looksRightFindings.some(
        (finding: FormUiVerificationFinding) => finding.code === "FORM_UI_INVALID_ENUM_VALUE",
      ),
    ).toBe(false);
  });

  it("flags event handlers referenced by [Event Procedure] bindings that are missing from the .cls", () => {
    const cmdSave = source.controls[0];
    if (!cmdSave) throw new Error("test fixture missing cmdSave");
    const control = cloneControl(cmdSave, {
      properties: { Caption: '"Save"' },
    });

    const report = verifyFormUi(source, withControls([control]), {
      // No codeBehind at all → handler for OnClick is missing.
      codeBehind: 'Attribute VB_Name = "Form_Customer"\r\nOption Compare Database\r\n',
    });

    const missing = report.looksRightFindings.filter(
      (finding: FormUiVerificationFinding) => finding.code === "FORM_UI_EVENT_HANDLER_MISSING",
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]?.controlName).toBe("cmdSave");
    expect(missing[0]?.message).toContain("OnClick");
    expect(report.ok).toBe(true);
  });

  it("does NOT flag event handlers that exist in the .cls code-behind", () => {
    const cmdSave = source.controls[0];
    if (!cmdSave) throw new Error("test fixture missing cmdSave");
    const control = cloneControl(cmdSave, {
      properties: { Caption: '"Save"' },
    });

    const report = verifyFormUi(source, withControls([control]), {
      codeBehind: [
        'Attribute VB_Name = "Form_Customer"',
        "Option Compare Database",
        "Private Sub cmdSave_Click()",
        "    DoCmd.RunCommand acCmdSave",
        "End Sub",
      ].join("\r\n"),
    });

    expect(
      report.looksRightFindings.some(
        (finding: FormUiVerificationFinding) => finding.code === "FORM_UI_EVENT_HANDLER_MISSING",
      ),
    ).toBe(false);
  });

  it("does NOT flag event handlers when codeBehind is absent (optional input)", () => {
    const cmdSave = source.controls[0];
    if (!cmdSave) throw new Error("test fixture missing cmdSave");
    const control = cloneControl(cmdSave, {
      properties: { Caption: '"Save"' },
    });

    const report = verifyFormUi(source, withControls([control]));

    expect(
      report.looksRightFindings.some(
        (finding: FormUiVerificationFinding) => finding.code === "FORM_UI_EVENT_HANDLER_MISSING",
      ),
    ).toBe(false);
  });
});

describe("verifyFormUi — combined envelope (issue #831)", () => {
  it("`findings` is the concatenation of survivedFindings + looksRightFindings (additive)", () => {
    // Force a survival failure (drop the event) AND a looks-right failure
    // (overlap with a second control).
    const cmdSave = source.controls[0];
    if (!cmdSave) throw new Error("test fixture missing cmdSave");
    const cmdWithEvent = cloneControl(cmdSave, {
      properties: {
        Left: "100",
        Top: "100",
        Width: "500",
        Height: "400",
      },
    });
    const cmdOverlapping = cloneControl(cmdSave, {
      name: "cmdOverlapping",
      properties: {
        Left: "300",
        Top: "200",
        Width: "500",
        Height: "400",
      },
    });

    const report = verifyFormUi(
      source,
      withControls([
        // Event dropped (survival error).
        { ...cmdWithEvent, events: [] },
        cmdOverlapping,
      ]),
    );

    expect(report.survivedFindings.map((f: FormUiVerificationFinding) => f.code)).toContain(
      "FORM_UI_EVENT_DRIFT",
    );
    expect(report.looksRightFindings.map((f: FormUiVerificationFinding) => f.code)).toContain(
      "FORM_UI_OVERLAPPING_BOUNDS",
    );
    // Combined `findings` is preserved.
    expect(report.findings).toEqual([...report.survivedFindings, ...report.looksRightFindings]);
    // ok is false because the survival error blocks.
    expect(report.ok).toBe(false);
  });

  it("ok is true even with looks-right warnings (informational, non-blocking)", () => {
    const cmdA = {
      name: "cmdA",
      type: "CommandButton",
      role: "action" as const,
      events: [],
      bindings: [],
      codegraphEvidence: [],
      properties: {
        Left: "100",
        Top: "100",
        Width: "500",
        Height: "400",
      },
    };
    const cmdB = {
      name: "cmdB",
      type: "CommandButton",
      role: "action" as const,
      events: [],
      bindings: [],
      codegraphEvidence: [],
      properties: {
        Left: "300",
        Top: "200",
        Width: "500",
        Height: "400",
      },
    };

    const report = verifyFormUi(sourceFor([cmdA, cmdB]), withControls([cmdA, cmdB]));

    expect(report.looksRightFindings.length).toBeGreaterThan(0);
    expect(report.ok).toBe(true);
  });
});
