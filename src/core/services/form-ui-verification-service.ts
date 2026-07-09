import type {
  FormUiBehaviorMap,
  FormUiVerificationFinding,
  FormUiVerificationReport,
} from "../models/form-ui-builder.js";

export function verifyFormUi(
  sourceContract: FormUiBehaviorMap,
  appliedContract: FormUiBehaviorMap,
): FormUiVerificationReport {
  const findings: FormUiVerificationFinding[] = [];

  for (const sourceControl of sourceContract.controls) {
    const appliedControl = appliedContract.controls.find(
      (control) => control.name === sourceControl.name,
    );
    if (appliedControl === undefined) {
      findings.push({
        code: "FORM_UI_CONTROL_MISSING",
        severity: "error",
        controlName: sourceControl.name,
        message: `Mapped control "${sourceControl.name}" is missing from the applied UI.`,
      });
      continue;
    }
    for (const eventName of sourceControl.events) {
      if (!appliedControl.events.includes(eventName)) {
        findings.push({
          code: "FORM_UI_EVENT_DRIFT",
          severity: "error",
          controlName: sourceControl.name,
          message: `Mapped event "${eventName}" was removed from "${sourceControl.name}".`,
        });
      }
    }
    for (const binding of sourceControl.bindings) {
      if (!appliedControl.bindings.includes(binding)) {
        findings.push({
          code: "FORM_UI_BINDING_DRIFT",
          severity: "error",
          controlName: sourceControl.name,
          message: `Mapped binding "${binding}" was removed from "${sourceControl.name}".`,
        });
      }
    }
  }

  return {
    ok: findings.every((finding) => finding.severity !== "error"),
    formName: sourceContract.formName,
    findings,
    checkedControls: sourceContract.controls.map((control) => control.name),
  };
}
