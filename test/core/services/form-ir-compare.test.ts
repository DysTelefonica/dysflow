import { describe, expect, it } from "vitest";
import {
  compareForms,
  FORM_NOISE_KEYS,
  type FormDrift,
  type FormDriftKind,
} from "../../../src/core/services/form-ir-compare-service";
import { parseFormTxt } from "../../../src/core/services/form-ir-service";

// ---------------------------------------------------------------------------
// Test fixture builders — minimal SaveAsText fragments
// ---------------------------------------------------------------------------

function parseForm(text: string, name: string) {
  return parseFormTxt(text, { name });
}

function makeFormText(
  controls: Array<{ name: string; type: string; props?: Record<string, string> }>,
): string {
  const lines: string[] = [
    "Version =21",
    "VersionRequired =20",
    "Begin Form",
    '    Caption ="Form"',
  ];
  for (const c of controls) {
    lines.push(`    Begin ${c.type}`);
    lines.push(`        Name ="${c.name}"`);
    if (c.props) {
      for (const [k, v] of Object.entries(c.props)) {
        lines.push(`        ${k} =${v}`);
      }
    }
    lines.push("    End");
  }
  lines.push("End");
  return lines.join("\n");
}

function driftsByKind(drifts: readonly FormDrift[]): Partial<Record<FormDriftKind, FormDrift[]>> {
  const out: Partial<Record<FormDriftKind, FormDrift[]>> = {};
  for (const d of drifts) {
    if (!out[d.kind]) out[d.kind] = [];
    out[d.kind]?.push(d);
  }
  return out;
}

describe("compareForms (form-IR-domain drift classifier)", () => {
  // ------------------------------------------------------------------ helpers

  it("FORM_NOISE_KEYS is the canonical noise floor (LOCKED set)", () => {
    expect(FORM_NOISE_KEYS).toBeInstanceOf(Set);
    // The locks mirror vba-semantic-classifier.ts; this test fails fast if anyone
    // silently drops one of them.
    const expected = [
      "Checksum",
      "PrtDevMode",
      "PrtDevModeW",
      "PrtDevNames",
      "PrtDevNamesW",
      "PrtMip",
      "RecSrcDt",
      "LayoutCachedLeft",
      "LayoutCachedTop",
      "LayoutCachedWidth",
      "LayoutCachedHeight",
      "PublishOption",
      "NoSaveCTIWhenDisabled",
      "NameMap",
    ];
    for (const key of expected) {
      expect(FORM_NOISE_KEYS.has(key), `FORM_NOISE_KEYS must contain "${key}"`).toBe(true);
    }
  });

  // ------------------------------------------------------------------ 1. Identical sources yield empty drift

  it("identical sources → empty drifts, matched: true, driftDetected: false", () => {
    const text = makeFormText([
      { name: "lbl1", type: "Label", props: { Caption: '"Hello"' } },
      { name: "txt1", type: "TextBox" },
    ]);
    const left = parseForm(text, "FormA");
    const right = parseForm(text, "FormB");

    const report = compareForms({ left, right, leftName: "FormA", rightName: "FormB" });

    expect(report.matched).toBe(true);
    expect(report.driftDetected).toBe(false);
    expect(report.actionableOk).toBe(true);
    expect(report.drifts).toEqual([]);
    expect(report.sourceName).toBe("FormA");
    expect(report.targetName).toBe("FormB");
  });

  // ------------------------------------------------------------------ 2. One control added

  it("one control added in target → controlAdded, actionable: true", () => {
    const leftText = makeFormText([{ name: "lbl1", type: "Label", props: { Caption: '"Hello"' } }]);
    const rightText = makeFormText([
      { name: "lbl1", type: "Label", props: { Caption: '"Hello"' } },
      { name: "cmdNew", type: "CommandButton" },
    ]);
    const left = parseForm(leftText, "FormA");
    const right = parseForm(rightText, "FormB");

    const report = compareForms({ left, right, leftName: "FormA", rightName: "FormB" });

    expect(report.matched).toBe(false);
    expect(report.driftDetected).toBe(true);
    expect(report.actionableOk).toBe(false);

    const added = driftsByKind(report.drifts).controlAdded ?? [];
    const removed = driftsByKind(report.drifts).controlRemoved ?? [];
    expect(added).toHaveLength(1);
    expect(added[0]?.controlName).toBe("cmdNew");
    expect(added[0]?.actionable).toBe(true);
    expect(removed).toHaveLength(0);
  });

  // ------------------------------------------------------------------ 3. One control removed

  it("one control removed in target → controlRemoved, actionable: true", () => {
    const leftText = makeFormText([
      { name: "lbl1", type: "Label", props: { Caption: '"Hello"' } },
      { name: "cmdOld", type: "CommandButton" },
    ]);
    const rightText = makeFormText([
      { name: "lbl1", type: "Label", props: { Caption: '"Hello"' } },
    ]);
    const left = parseForm(leftText, "FormA");
    const right = parseForm(rightText, "FormB");

    const report = compareForms({ left, right, leftName: "FormA", rightName: "FormB" });

    expect(report.matched).toBe(false);
    expect(report.driftDetected).toBe(true);

    const removed = driftsByKind(report.drifts).controlRemoved ?? [];
    const added = driftsByKind(report.drifts).controlAdded ?? [];
    expect(removed).toHaveLength(1);
    expect(removed[0]?.controlName).toBe("cmdOld");
    expect(removed[0]?.actionable).toBe(true);
    expect(added).toHaveLength(0);
  });

  // ------------------------------------------------------------------ 4. Property change (Caption) is actionable

  it("Caption change on an existing control → propertyChanged, actionable: true", () => {
    const leftText = makeFormText([{ name: "lbl1", type: "Label", props: { Caption: '"Old"' } }]);
    const rightText = makeFormText([{ name: "lbl1", type: "Label", props: { Caption: '"New"' } }]);
    const left = parseForm(leftText, "FormA");
    const right = parseForm(rightText, "FormB");

    const report = compareForms({ left, right, leftName: "FormA", rightName: "FormB" });

    expect(report.driftDetected).toBe(true);
    expect(report.matched).toBe(false);

    const propertyChanges = driftsByKind(report.drifts).propertyChanged ?? [];
    expect(propertyChanges).toHaveLength(1);
    expect(propertyChanges[0]).toMatchObject({
      kind: "propertyChanged",
      controlName: "lbl1",
      key: "Caption",
      actionable: true,
    });
    expect(propertyChanges[0]?.oldValue).toBe('"Old"');
    expect(propertyChanges[0]?.newValue).toBe('"New"');
  });

  // ------------------------------------------------------------------ 5. Layout-bounds change → ONE layoutBoundsChanged, no separate propertyChanged

  it("Left+Top change → ONE layoutBoundsChanged, no separate propertyChanged for Left/Top", () => {
    const leftText = makeFormText([
      {
        name: "txt1",
        type: "TextBox",
        props: { Left: "100", Top: "100", Width: "200", Height: "40" },
      },
    ]);
    const rightText = makeFormText([
      {
        name: "txt1",
        type: "TextBox",
        props: { Left: "120", Top: "140", Width: "200", Height: "40" },
      },
    ]);
    const left = parseForm(leftText, "FormA");
    const right = parseForm(rightText, "FormB");

    const report = compareForms({ left, right, leftName: "FormA", rightName: "FormB" });

    expect(report.driftDetected).toBe(true);
    expect(report.matched).toBe(false);

    const layout = driftsByKind(report.drifts).layoutBoundsChanged ?? [];
    const properties = driftsByKind(report.drifts).propertyChanged ?? [];
    expect(layout).toHaveLength(1);
    expect(layout[0]?.controlName).toBe("txt1");
    expect(layout[0]?.actionable).toBe(true);
    // MUST NOT emit a separate propertyChanged for the four layout keys
    expect(properties).toHaveLength(0);
  });

  // ------------------------------------------------------------------ 6. Non-actionable noise (Checksum) keeps matched: true

  it("Checksum (FORM_NOISE_KEYS) change → propertyChanged, actionable: false, matched: true", () => {
    const leftText = makeFormText([
      { name: "lbl1", type: "Label", props: { Caption: '"Hello"', Checksum: "1234" } },
    ]);
    const rightText = makeFormText([
      { name: "lbl1", type: "Label", props: { Caption: '"Hello"', Checksum: "5678" } },
    ]);
    const left = parseForm(leftText, "FormA");
    const right = parseForm(rightText, "FormB");

    const report = compareForms({ left, right, leftName: "FormA", rightName: "FormB" });

    expect(report.driftDetected).toBe(true);
    expect(report.matched).toBe(true); // zero actionable drifts
    expect(report.actionableOk).toBe(true);

    const propertyChanges = driftsByKind(report.drifts).propertyChanged ?? [];
    expect(propertyChanges).toHaveLength(1);
    expect(propertyChanges[0]).toMatchObject({
      kind: "propertyChanged",
      controlName: "lbl1",
      key: "Checksum",
      actionable: false,
    });
    expect(propertyChanges[0]?.reason).toContain("FORM_NOISE_KEYS");
  });

  // ------------------------------------------------------------------ 7. Duplicate scalar keys compared by key, not position

  it("duplicate scalar keys (NoSaveCTIWhenDisabled =1 twice) are compared by key, not index", () => {
    // Build a form with NoSaveCTIWhenDisabled =1 on two consecutive lines.
    // (This mirrors the canonical frmBusy duplicate-key pattern.)
    const baseLines = [
      "Version =21",
      "VersionRequired =20",
      "Begin Form",
      '    Caption ="Form"',
      "    Begin Label",
      '        Name ="lbl1"',
      "        NoSaveCTIWhenDisabled =1",
      "        NoSaveCTIWhenDisabled =1",
      "    End",
      "End",
    ];
    const text = baseLines.join("\n");
    const left = parseForm(text, "FormA");

    // Now mutate one of the two NoSaveCTIWhenDisabled values — both should
    // count as "the NoSaveCTIWhenDisabled value differs from X to Y" because
    // the diff is per-key, not per-line-index.
    const mutatedLines = [...baseLines];
    // Find ALL occurrences and mutate the second one.
    const positions: number[] = [];
    for (let i = 0; i < mutatedLines.length; i++) {
      if (mutatedLines[i] === "        NoSaveCTIWhenDisabled =1") positions.push(i);
    }
    expect(positions.length, "fixture must contain two NoSaveCTIWhenDisabled lines").toBe(2);
    const secondIdx = positions[1];
    if (secondIdx !== undefined) {
      mutatedLines[secondIdx] = "        NoSaveCTIWhenDisabled =2";
    }
    const rightText = mutatedLines.join("\n");
    const right = parseForm(rightText, "FormB");

    const report = compareForms({ left, right, leftName: "FormA", rightName: "FormB" });

    // propertyChanged is emitted per-key (not per line)
    const propertyChanges = driftsByKind(report.drifts).propertyChanged ?? [];
    expect(propertyChanges).toHaveLength(1);
    expect(propertyChanges[0]).toMatchObject({
      kind: "propertyChanged",
      controlName: "lbl1",
      key: "NoSaveCTIWhenDisabled",
      actionable: false, // NoSaveCTIWhenDisabled is in FORM_NOISE_KEYS
    });
  });
});
