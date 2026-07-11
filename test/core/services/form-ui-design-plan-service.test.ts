import { describe, expect, it } from "vitest";
import type {
  FormUiBehaviorMap,
  FormUiDesignOperation,
  FormUiDesignPlan,
} from "../../../src/core/models/form-ui-builder";
import { collectControls, parseFormTxt } from "../../../src/core/services/form-ir-service";
import {
  applyFormUiDesignOperations,
  applyFormUiDesignPlan,
  generateFormUiDesignPlan,
  verifyPlanAlignment,
} from "../../../src/core/services/form-ui-design-plan-service";

const map: FormUiBehaviorMap = {
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
      codegraphEvidence: [
        { handler: "cmdSave_Click", callPath: ["cmdSave_Click", "SaveCustomer"] },
      ],
    },
  ],
};
const sourceControl = map.controls[0] as FormUiBehaviorMap["controls"][number];

const op = (kind: FormUiDesignPlan["operations"][number]["kind"], target: string, params = {}) => ({
  kind,
  target,
  params,
  intent: kind,
});

// Independent ground truth for the drift-detection test below (#829).
// Mirrors how the real apply path parses the serialized post-apply FormIR.
// If this ever needs to match a more recent contract shape, update here —
// never inline the implementation's helpers into the test.
function buildSourceFromContract(contract: FormUiBehaviorMap): string {
  const lines: string[] = ["Version =21", "Checksum =123456789", "Begin Form"];
  for (const control of contract.controls) {
    lines.push(`    Begin ${control.type}`);
    lines.push(`        Name ="${control.name}"`);
    for (const [key, value] of Object.entries(control.properties ?? {})) {
      if (key === "Name") continue;
      lines.push(`        ${key} =${value}`);
    }
    lines.push("    End");
  }
  lines.push("End", "");
  return lines.join("\n");
}

function buildExpectedContractFromIr(
  ir: ReturnType<typeof parseFormTxt>,
  source: FormUiBehaviorMap,
  operations: readonly FormUiDesignOperation[],
): FormUiBehaviorMap {
  const irControls = collectControls(ir.root);
  // Track rename chains: current_name -> original_name (so a renamed control
  // inherits role/events/bindings/codegraphEvidence from its source counterpart).
  const renamedFrom = new Map<string, string>();
  for (const op of operations) {
    if (op.kind !== "rename-control") continue;
    const newName = typeof op.params.newName === "string" ? op.params.newName : "";
    if (!newName) continue;
    const oldName = renamedFrom.get(op.target) ?? op.target;
    renamedFrom.set(newName, oldName);
  }
  const sourceByName = new Map(source.controls.map((c) => [c.name, c]));
  return {
    formName: source.formName,
    formEvents: source.formEvents,
    unmappedEvidence: source.unmappedEvidence,
    warnings: source.warnings,
    controls: irControls.map((c) => {
      const lookupName = renamedFrom.get(c.name) ?? c.name;
      const orig = sourceByName.get(lookupName);
      // FormIR exposes the control's Name as a scalar entry alongside the
      // blockType-derived type; strip it from properties so it doesn't
      // shadow the contract's first-class `name` field.
      const { Name: _name, ...rest } = c.properties;
      const properties = Object.keys(rest).length === 0 ? undefined : rest;
      if (orig !== undefined) {
        return {
          name: c.name,
          type: c.type,
          role: orig.role,
          events: orig.events,
          bindings: orig.bindings,
          codegraphEvidence: orig.codegraphEvidence,
          properties,
        };
      }
      return {
        name: c.name,
        type: c.type,
        role: "unknown",
        events: [],
        bindings: [],
        codegraphEvidence: [],
        properties,
      };
    }),
  };
}
describe("form UI design plan service", () => {
  it("generates a plan whose operations reference mapped behavior", () => {
    const plan = generateFormUiDesignPlan(map, {
      operations: [
        {
          kind: "set-property",
          target: "cmdSave",
          intent: "Clarify save action",
          params: { property: "Caption", value: "Save customer" },
        },
      ],
    });

    expect(plan.operations).toEqual([
      expect.objectContaining({
        target: "cmdSave",
        preserves: ["OnClick", "cmdSave_Click"],
      }),
    ]);
    expect(plan.warnings).toEqual([]);
  });

  it("rejects operations that target controls outside the behavior map", () => {
    const plan = generateFormUiDesignPlan(map, {
      operations: [
        { kind: "move-control", target: "cmdDelete", intent: "Move delete", params: { left: 10 } },
      ],
    });

    expect(plan.operations).toEqual([]);
    expect(plan.warnings).toContain(
      'Operation target "cmdDelete" is not present in the behavior map.',
    );
  });

  it("retains an advisory note when its target is absent", () => {
    const plan = generateFormUiDesignPlan(map, {
      operations: [op("note", "missingControl")],
    });
    const result = applyFormUiDesignPlan(plan, { apply: true });

    expect(plan.operations).toHaveLength(1);
    expect(plan.warnings).toEqual([]);
    expect(result).toMatchObject({
      operationsApplied: plan.operations,
      advisories: ["note"],
      filesystemApplied: false,
      importGate: "not-run",
    });
    expect(result.appliedContract).toEqual(plan.sourceContract);
    expect(verifyPlanAlignment(plan, result.appliedContract)).toEqual([]);
  });

  it("applies plans as a dry-run by default and preserves mapped controls", () => {
    const plan: FormUiDesignPlan = generateFormUiDesignPlan(map, {
      operations: [
        {
          kind: "set-property",
          target: "cmdSave",
          intent: "Clarify save action",
          params: { property: "Caption", value: "Save customer" },
        },
      ],
    });

    const result = applyFormUiDesignPlan(plan, { apply: false });

    expect(result).toMatchObject({
      mode: "dry-run",
      formName: "Customer",
      preservedControls: ["cmdSave"],
    });
    expect(result.operationsApplied).toHaveLength(1);
  });

  it("generates, applies, derives, and verifies all six operation kinds", () => {
    const plan = generateFormUiDesignPlan(
      {
        ...map,
        controls: [...map.controls, { ...sourceControl, name: "lblDelete", type: "Label" }],
      },
      {
        operations: [
          op("add-control", "txtName", { type: "TextBox", properties: { Left: 100 } }),
          op("move-control", "cmdSave", { left: 30, top: 40 }),
          op("set-property", "cmdSave", { property: "Caption", value: "Commit" }),
          op("rename-control", "cmdSave", { newName: "cmdCommit" }),
          op("delete-control", "lblDelete"),
          op("note", "cmdSave"),
        ],
      },
    );
    const application = applyFormUiDesignPlan(plan, { apply: true });
    // biome-ignore format: Keep the independent literal contract within the review budget.
    const expected: FormUiBehaviorMap = { formName: "Customer", formEvents: [], unmappedEvidence: [], warnings: [], controls: [
      { name: "cmdCommit", type: "CommandButton", role: "action", events: ["OnClick"], bindings: [], codegraphEvidence: [{ handler: "cmdSave_Click", callPath: ["cmdSave_Click", "SaveCustomer"] }], properties: { Left: "30", Top: "40", Caption: "Commit" } },
      { name: "txtName", type: "TextBox", role: "unknown", events: [], bindings: [], codegraphEvidence: [], properties: { Left: "100" } },
    ] };
    expect([application.advisories, application.appliedContract]).toEqual([["note"], expected]);
    expect(verifyPlanAlignment(plan, expected)).toEqual([]);
  });

  it.each([
    ["rename", op("rename-control", "cmdSave", { newName: "cmdCommit" }), map],
  ])("finds a wrong %s result", (_label, operation, wrong) => {
    const plan = generateFormUiDesignPlan(wrong, { operations: [operation] });
    expect(verifyPlanAlignment(plan, wrong)).toHaveLength(1);
  });

  it("fails closed for an operation kind deserialized outside the supported union", () => {
    const unsupported = {
      kind: "group-controls",
      target: "cmdSave",
      intent: "Legacy operation",
      params: {},
      preserves: [],
    } as unknown as FormUiDesignPlan["operations"][number];

    expect(() =>
      applyFormUiDesignPlan({
        ...generateFormUiDesignPlan(map, { operations: [] }),
        operations: [unsupported],
      }),
    ).toThrowError(expect.objectContaining({ code: "FORM_UI_UNSUPPORTED_OPERATION" }));
  });

  it("reports drift when an approved plan no longer aligns with the source contract", () => {
    const plan = generateFormUiDesignPlan(map, {
      operations: [
        {
          kind: "set-property",
          target: "cmdSave",
          intent: "Clarify save action",
          params: { property: "Caption", value: "Save customer" },
        },
      ],
    });
    const findings = verifyPlanAlignment(plan, { ...map, controls: [] });

    expect(findings).toEqual([
      expect.objectContaining({ code: "FORM_UI_PLAN_TARGET_MISSING", controlName: "cmdSave" }),
    ]);
  });
});

// Issue #829 — appliedContract is derived from the mutated FormIR, not a
// parallel implementation. These tests pin the new derivation per operation
// kind and act as a drift detector against any future reintroduction of a
// parallel `deriveAppliedContract` (or any divergence between dry-run preview
// and what apply actually writes through the real FormIR primitives).
describe("appliedContract — derived from mutated FormIR (#829)", () => {
  it("add-control: new control appears in appliedContract with the given type and properties", () => {
    const plan = generateFormUiDesignPlan(map, {
      operations: [
        op("add-control", "txtName", {
          type: "TextBox",
          properties: { Left: 100, Caption: "Name" },
        }),
      ],
    });
    const result = applyFormUiDesignPlan(plan);
    const added = result.appliedContract.controls.find((c) => c.name === "txtName");
    expect(added).toMatchObject({
      name: "txtName",
      type: "TextBox",
      role: "unknown",
      properties: { Left: "100", Caption: "Name" },
    });
    // existing controls are preserved alongside the new one
    expect(result.appliedContract.controls.map((c) => c.name)).toEqual(["cmdSave", "txtName"]);
  });

  it("move-control: Left/Top are written on the targeted control", () => {
    const plan = generateFormUiDesignPlan(map, {
      operations: [op("move-control", "cmdSave", { left: 30, top: 40 })],
    });
    const result = applyFormUiDesignPlan(plan);
    const moved = result.appliedContract.controls.find((c) => c.name === "cmdSave");
    expect(moved?.properties).toMatchObject({ Left: "30", Top: "40" });
  });

  it("set-property: the targeted property is written on the targeted control", () => {
    const plan = generateFormUiDesignPlan(map, {
      operations: [op("set-property", "cmdSave", { property: "Caption", value: "Commit" })],
    });
    const result = applyFormUiDesignPlan(plan);
    const updated = result.appliedContract.controls.find((c) => c.name === "cmdSave");
    expect(updated?.properties).toMatchObject({ Caption: "Commit" });
  });

  it("rename-control: the control's name changes; role/events/codegraphEvidence are preserved from the source", () => {
    const plan = generateFormUiDesignPlan(map, {
      operations: [op("rename-control", "cmdSave", { newName: "cmdCommit" })],
    });
    const result = applyFormUiDesignPlan(plan);
    expect(result.appliedContract.controls.map((c) => c.name)).toEqual(["cmdCommit"]);
    const renamed = result.appliedContract.controls[0];
    expect(renamed?.role).toBe("action");
    expect(renamed?.events).toEqual(["OnClick"]);
    expect(renamed?.codegraphEvidence).toEqual([
      { handler: "cmdSave_Click", callPath: ["cmdSave_Click", "SaveCustomer"] },
    ]);
  });

  it("delete-control: the targeted control is removed from appliedContract", () => {
    const sourceWithExtra = {
      ...map,
      controls: [...map.controls, { ...sourceControl, name: "lblDelete", type: "Label" }],
    };
    const plan = generateFormUiDesignPlan(sourceWithExtra, {
      operations: [op("delete-control", "lblDelete")],
    });
    const result = applyFormUiDesignPlan(plan);
    expect(result.appliedContract.controls.map((c) => c.name)).toEqual(["cmdSave"]);
  });

  it("note: appliedContract is unchanged; advisory surfaces the note intent", () => {
    const plan = generateFormUiDesignPlan(map, {
      operations: [{ kind: "note", target: "missingControl", intent: "keep visible", params: {} }],
    });
    const result = applyFormUiDesignPlan(plan);
    expect(result.appliedContract.controls.map((c) => c.name)).toEqual(["cmdSave"]);
    expect(result.advisories).toEqual(["keep visible"]);
  });

  // Drift detector — the contract returned by dry-run MUST equal what apply
  // would write when the same source IR + operations are folded through the
  // real primitives and re-parsed. If anyone re-introduces a parallel
  // implementation (or the primitives change shape and the derivation
  // doesn't follow), this test fails.
  it("drift detector: appliedContract == post-apply FormIR controls for the full six-op plan (#829)", () => {
    const sourceWithExtra = {
      ...map,
      controls: [...map.controls, { ...sourceControl, name: "lblDelete", type: "Label" }],
    };
    const plan = generateFormUiDesignPlan(sourceWithExtra, {
      operations: [
        op("add-control", "txtName", { type: "TextBox", properties: { Left: 100 } }),
        op("move-control", "cmdSave", { left: 30, top: 40 }),
        op("set-property", "cmdSave", { property: "Caption", value: "Commit" }),
        op("rename-control", "cmdSave", { newName: "cmdCommit" }),
        op("delete-control", "lblDelete"),
        op("note", "cmdSave"),
      ],
    });
    const result = applyFormUiDesignPlan(plan);

    // Independent ground truth — run the same primitives ourselves.
    const initialSource = buildSourceFromContract(plan.sourceContract);
    const initialIr = parseFormTxt(initialSource, { name: plan.formName });
    const opsResult = applyFormUiDesignOperations(initialIr, plan.operations);
    const canonicalIr = parseFormTxt(opsResult.source, { name: plan.formName });
    const expectedContract = buildExpectedContractFromIr(
      canonicalIr,
      plan.sourceContract,
      plan.operations,
    );

    expect(result.appliedContract).toEqual(expectedContract);
  });
});
