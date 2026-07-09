import type {
  FormUiBehaviorMap,
  FormUiDesignOperation,
  FormUiDesignPlan,
  FormUiPlanApplicationResult,
  FormUiVerificationFinding,
  ReferencePatternInput,
} from "../models/form-ui-builder.js";

export type GenerateFormUiDesignPlanInput = {
  operations: Array<Omit<FormUiDesignOperation, "preserves">>;
  referencePattern?: ReferencePatternInput;
};

export function generateFormUiDesignPlan(
  sourceContract: FormUiBehaviorMap,
  input: GenerateFormUiDesignPlanInput,
): FormUiDesignPlan {
  const warnings: string[] = [];
  const operations: FormUiDesignOperation[] = [];

  for (const operation of input.operations) {
    const control = sourceContract.controls.find(
      (candidate) => candidate.name === operation.target,
    );
    if (control === undefined) {
      warnings.push(`Operation target "${operation.target}" is not present in the behavior map.`);
      continue;
    }
    operations.push({
      ...operation,
      preserves: [
        ...control.events,
        ...control.bindings,
        ...control.codegraphEvidence.map((evidence) => evidence.handler),
      ],
    });
  }

  return {
    formName: sourceContract.formName,
    sourceContract,
    operations,
    referencePattern: input.referencePattern,
    warnings,
  };
}

export function applyFormUiDesignPlan(
  plan: FormUiDesignPlan,
  options: { apply?: boolean } = {},
): FormUiPlanApplicationResult {
  return {
    mode: options.apply === true ? "apply" : "dry-run",
    formName: plan.formName,
    operationsApplied: plan.operations,
    preservedControls: plan.sourceContract.controls.map((control) => control.name),
    warnings: plan.warnings,
  };
}

export function verifyPlanAlignment(
  plan: FormUiDesignPlan,
  currentContract: FormUiBehaviorMap,
): FormUiVerificationFinding[] {
  const findings: FormUiVerificationFinding[] = [];
  for (const operation of plan.operations) {
    if (!currentContract.controls.some((control) => control.name === operation.target)) {
      findings.push({
        code: "FORM_UI_PLAN_TARGET_MISSING",
        severity: "error",
        controlName: operation.target,
        message: `Planned target "${operation.target}" is no longer present in the current behavior map.`,
      });
    }
  }
  return findings;
}
