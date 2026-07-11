import type {
  FormUiBehaviorMap,
  FormUiDesignPlan,
  ReferencePatternInput,
} from "../models/form-ui-builder.js";
import { generateFormUiDesignPlan } from "./form-ui-design-plan-service.js";

export function copyFormUiPattern(
  targetMap: FormUiBehaviorMap,
  referencePattern: ReferencePatternInput,
): FormUiDesignPlan {
  return generateFormUiDesignPlan(targetMap, {
    referencePattern,
    operations: Object.values(referencePattern.mappedControls).map((target) => ({
      kind: "note",
      target,
      intent: referencePattern.intent,
      params: { sourceForm: referencePattern.sourceForm },
    })),
  });
}
