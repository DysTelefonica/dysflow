/**
 * Schema regression pin for #1022 — `apply_form_design_plan.plan` exposes a
 * runtime-verifiable discriminated shape instead of an opaque `{type:"object"}`.
 *
 * Three surfaces must stay aligned:
 *   1. The MCP schema (`VBA_SYNC_TOOL_SCHEMAS.apply_form_design_plan`) must
 *      advertise the nested `plan` shape — top-level `formName` (required,
 *      non-empty), `sourceContract` (required, object — the FormUiBehaviorMap
 *      source contract), `operations` (required, array) with each item carrying
 *      the `kind` enum that the runtime dispatcher accepts. Without this,
 *      consumers cannot construct a documented multi-operation plan from
 *      runtime-owned documentation.
 *   2. `validateInput` against that schema must accept a complete, realistic
 *      multi-kind plan payload without `MCP_INPUT_INVALID`.
 *   3. A bad discriminator (e.g. `kind:"bogus"`) must surface a typed error
 *      BEFORE the runtime dispatcher sees the plan.
 *   4. The runtime service (`applyFormUiDesignPlan`) accepts the same plan
 *      and returns the dry-run envelope — proves the schema is not just a
 *      doc veneer but matches the dispatcher.
 *
 * The dysflow validator does NOT support `oneOf`/`anyOf`/`allOf` (see
 * `src/shared/validation/validator.ts`); the discriminated union is published
 * via the `kind` enum on `operations.items.properties` plus a per-property
 * description that documents the per-kind `params` shape.
 */
import { describe, expect, it } from "vitest";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../../src/adapters/mcp/schemas/vba-sync-schemas";
import type {
  FormUiBehaviorMap,
  FormUiDesignPlan,
} from "../../../../src/core/models/form-ui-builder";
import { applyFormUiDesignPlan } from "../../../../src/core/services/form-ui-design-plan-service";
import { validateInput } from "../../../../src/shared/validation/index";

// Realistic source contract mirroring the format `analyze_form_ui` +
// `buildFormUiBehaviorMap` produce (the dry-run envelope accepts whatever the
// upstream mapper emits). The single `txtCustomerName` control intentionally
// carries no events/bindings so the preserves guard does not fire.
const TEST_MAP: FormUiBehaviorMap = {
  formName: "Form_Customer",
  codegraphIndexPath: null,
  formEvents: [],
  unmappedEvidence: [],
  warnings: [],
  controls: [
    {
      name: "txtCustomerName",
      type: "TextBox",
      role: "input",
      events: [],
      bindings: [],
      codegraphEvidence: [],
    },
  ],
};

// The 6 operation kinds the dispatcher accepts, in canonical order. Issue
// #1022: schema must enumerate these so a consumer reading `schema({toolName:
// "apply_form_design_plan"})` can build a multi-operation plan without
// inspecting dysflow source. Order matters for test stability; the enum is
// declared as a sorted array so additions are caught by diff review.
const ALL_OPERATION_KINDS = [
  "add-control",
  "delete-control",
  "move-control",
  "note",
  "rename-control",
  "set-property",
] as const;

describe("feat-1022-apply-form-design-plan-schema — runtime-verifiable plan shape", () => {
  describe("MCP schema surface (`schema({toolName:'apply_form_design_plan'})`)", () => {
    const schema = VBA_SYNC_TOOL_SCHEMAS.apply_form_design_plan;

    it("publishes a nested plan schema (not opaque {type:'object'})", () => {
      expect(schema).toBeDefined();
      const planProperty = schema?.properties?.plan;
      expect(planProperty).toBeDefined();
      // The plan must describe its inner shape, not just advertise itself as
      // `object` with an empty description — that was the #1022 footgun.
      expect(planProperty?.type, "plan must be typed as object").toBe("object");
      expect(planProperty?.properties, "plan.properties must exist").toBeDefined();
      expect(planProperty?.properties?.formName, "plan.formName must be declared").toBeDefined();
      expect(
        planProperty?.properties?.sourceContract,
        "plan.sourceContract must be declared",
      ).toBeDefined();
      expect(
        planProperty?.properties?.operations,
        "plan.operations must be declared",
      ).toBeDefined();
    });

    it("plan.formName is required and non-empty", () => {
      const formName = schema?.properties?.plan?.properties?.formName;
      expect(formName).toBeDefined();
      expect(formName?.type).toBe("string");
      expect(formName?.minLength).toBeGreaterThanOrEqual(1);
      expect(schema?.properties?.plan?.required).toEqual(expect.arrayContaining(["formName"]));
    });

    it("plan.sourceContract is required (object — the FormUiBehaviorMap)", () => {
      const sourceContract = schema?.properties?.plan?.properties?.sourceContract;
      expect(sourceContract).toBeDefined();
      expect(sourceContract?.type).toBe("object");
      expect(schema?.properties?.plan?.required).toEqual(
        expect.arrayContaining(["sourceContract"]),
      );
    });

    it("plan.operations is required (array of discriminated items)", () => {
      const operations = schema?.properties?.plan?.properties?.operations;
      expect(operations).toBeDefined();
      expect(operations?.type).toBe("array");
      expect(schema?.properties?.plan?.required).toEqual(expect.arrayContaining(["operations"]));
      // Each item carries a `kind` enum (the discriminator) and the universal
      // scalar fields the dispatcher always reads (target, intent, params).
      // Per-kind shape is documented on the `params` description since this
      // validator does not support anyOf (see src/shared/validation/validator.ts).
      const item = operations?.items;
      expect(item?.type).toBe("object");
      expect(item?.properties?.kind?.enum).toEqual(
        expect.arrayContaining([...ALL_OPERATION_KINDS]),
      );
      expect(item?.properties?.target?.type).toBe("string");
      expect(item?.properties?.intent?.type).toBe("string");
      expect(item?.properties?.params?.type).toBe("object");
    });

    it("plan.operations.items.kind enum enumerates every dispatcher-supported kind (no extras, no omissions)", () => {
      // Read the live enum directly from the schema; sort both sides before
      // comparing so an accidental re-ordering is still caught and to keep
      // the assertion idempotent across edits.
      const enumFromSchema = [
        ...(schema?.properties?.plan?.properties?.operations?.items?.properties?.kind?.enum ?? []),
      ].sort();
      expect(enumFromSchema).toEqual([...ALL_OPERATION_KINDS].sort());
    });
  });

  describe("schema validation against realistic payloads", () => {
    const schema = VBA_SYNC_TOOL_SCHEMAS.apply_form_design_plan;

    function fullPlan(): FormUiDesignPlan {
      return {
        formName: "Form_Customer",
        sourceContract: TEST_MAP,
        operations: [
          // set-property on the existing control — proves per-kind params
          // can carry value+scalar property.
          {
            kind: "set-property",
            target: "txtCustomerName",
            intent: "widen the customer-name input",
            params: { property: "Width", value: 3200 },
            preserves: [],
          },
          // move-control — at least one of left/top is required by the
          // dispatcher; the schema describes params permissively, the runtime
          // enforces the per-kind constraint.
          {
            kind: "move-control",
            target: "txtCustomerName",
            intent: "shift right to clear the label",
            params: { left: 2400 },
            preserves: [],
          },
          // note — advisory; runtime folds intent into advisories.
          {
            kind: "note",
            target: "txtCustomerName",
            intent: "see #129 — re-test after rename",
            params: {},
            preserves: [],
          },
        ],
        warnings: [],
      };
    }

    it("accepts a complete multi-kind plan without MCP_INPUT_INVALID", () => {
      const result = validateInput(
        {
          sourcePath: "C:/repo/src/forms/Form_Customer.form.txt",
          plan: fullPlan(),
          dryRun: true,
        },
        schema,
      );
      expect(result).toBeUndefined();
    });

    it("accepts every individual operation kind in isolation", () => {
      // Smoke-check the discriminator enum is wide enough for every kind the
      // dispatcher accepts today. If a new kind is added to FormUiDesignOperation
      // and the schema is forgotten, this catches the drift.
      for (const kind of ALL_OPERATION_KINDS) {
        const plan = {
          formName: "Form_Customer",
          sourceContract: TEST_MAP,
          operations: [
            {
              kind,
              target: kind === "add-control" ? "txtNew" : "txtCustomerName",
              intent: `apply ${kind}`,
              params:
                kind === "set-property"
                  ? { property: "Width", value: 3000 }
                  : kind === "move-control"
                    ? { left: 1200 }
                    : kind === "rename-control"
                      ? { newName: "txtCustomerNameRenamed" }
                      : kind === "add-control"
                        ? { type: "TextBox" }
                        : {},
              preserves: [],
            },
          ],
          warnings: [],
        };
        const result = validateInput(
          { sourcePath: "C:/repo/src/forms/Form_Customer.form.txt", plan },
          schema,
        );
        expect(
          result,
          `validateInput rejected ${kind} with: ${result ?? "no error"}`,
        ).toBeUndefined();
      }
    });

    it("rejects an unknown operation kind with a typed MCP_INPUT_INVALID", () => {
      const plan = {
        formName: "Form_Customer",
        sourceContract: TEST_MAP,
        operations: [
          {
            kind: "transmogrify-control",
            target: "txtCustomerName",
            intent: "shape-shift",
            params: {},
            preserves: [],
          },
        ],
        warnings: [],
      };
      const result = validateInput(
        { sourcePath: "C:/repo/src/forms/Form_Customer.form.txt", plan },
        schema,
      );
      expect(result, "an unknown kind must fail validation").toBeDefined();
      expect(result, "the error must mention the discriminator field").toMatch(
        /kind|operations\[0\]/i,
      );
    });

    it("rejects a plan missing formName (required)", () => {
      const plan = {
        sourceContract: TEST_MAP,
        operations: [],
        warnings: [],
      };
      // The plain object above is not assignable to FormUiDesignPlan so we
      // cast through `unknown` — this is the input boundary the schema sees.
      const result = validateInput(
        {
          sourcePath: "C:/repo/src/forms/Form_Customer.form.txt",
          plan: plan as unknown as FormUiDesignPlan,
        },
        schema,
      );
      expect(result).toBeDefined();
      expect(result).toMatch(/formName/);
    });
  });

  describe("runtime dispatch parity — schema and applyFormUiDesignPlan agree on shape", () => {
    // Issue #1022 acceptance: the runtime must accept the same shape the
    // schema advertises. The pure `applyFormUiDesignPlan` is enough to prove
    // the dispatcher agrees on the plan shape without ever touching
    // filesystem or Access.
    it("applyFormUiDesignPlan accepts a multi-kind plan and returns the dry-run envelope", () => {
      const plan: FormUiDesignPlan = {
        formName: "Form_Customer",
        sourceContract: TEST_MAP,
        operations: [
          {
            kind: "set-property",
            target: "txtCustomerName",
            intent: "widen",
            params: { property: "Width", value: 3200 },
            preserves: [],
          },
          {
            kind: "move-control",
            target: "txtCustomerName",
            intent: "shift",
            params: { left: 2400 },
            preserves: [],
          },
          {
            kind: "note",
            target: "txtCustomerName",
            intent: "see #129",
            params: {},
            preserves: [],
          },
        ],
        warnings: [],
      };
      const result = applyFormUiDesignPlan(plan);
      expect(result.mode).toBe("dry-run");
      expect(result.formName).toBe("Form_Customer");
      expect(result.operationsApplied).toHaveLength(3);
      expect(result.advisories.some((line) => line.includes("see #129"))).toBe(true);
      // The dry-run applies same-shape envelopes — no filesystem or import
      // gate ever runs from the core path.
      expect(result.filesystemApplied).toBe(false);
      expect(result.importGate).toBe("not-run");
    });
  });
});
