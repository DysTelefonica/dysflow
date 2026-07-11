import type {
  CodeGraphBehaviorEvidence,
  FormUiAnalysisReport,
  FormUiBehaviorMap,
} from "../models/form-ui-builder.js";

export function buildFormUiBehaviorMap(
  analysis: FormUiAnalysisReport,
  codegraphEvidence: CodeGraphBehaviorEvidence[],
): FormUiBehaviorMap {
  const consumed = new Set<number>();
  const controls = analysis.controls.map((control) => {
    const evidence = codegraphEvidence.filter((item, index) => {
      const matched = item.handler.toLowerCase().startsWith(`${control.name.toLowerCase()}_`);
      if (matched) consumed.add(index);
      return matched;
    });
    return {
      name: control.name,
      type: control.type,
      role: control.role,
      events: control.events,
      bindings: control.bindings,
      codegraphEvidence: evidence,
      properties: control.properties,
    };
  });

  return {
    formName: analysis.formName,
    controls,
    formEvents: analysis.formEvents,
    unmappedEvidence: codegraphEvidence.filter((_, index) => !consumed.has(index)),
    warnings: codegraphEvidence.length === 0 ? ["No CodeGraph-VBA evidence was supplied."] : [],
  };
}
