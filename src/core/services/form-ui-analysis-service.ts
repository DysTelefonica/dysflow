import type { FormIR } from "../models/form-ir.js";
import type {
  FormUiAnalysisReport,
  FormUiControlAnalysis,
  FormUiControlRole,
} from "../models/form-ui-builder.js";
import { collectControls, collectFormEvents } from "./form-ir-service.js";

const EVENT_PROCEDURE = "[Event Procedure]";

export function analyzeFormUi(ir: FormIR): FormUiAnalysisReport {
  const controls = collectControls(ir.root)
    .filter((control) => control.type !== "Form" && control.type !== "Report")
    .map<FormUiControlAnalysis>((control) => {
      const events = Object.entries(control.properties)
        .filter(([, value]) => value.includes(EVENT_PROCEDURE))
        .map(([key]) => key);
      const controlSource = unquote(control.properties.ControlSource);
      const rowSource = unquote(control.properties.RowSource);
      return {
        name: control.name,
        type: control.type,
        role: roleFor(control.type),
        caption: unquote(control.properties.Caption),
        controlSource,
        rowSource,
        events,
        bindings: [controlSource, rowSource].filter((value): value is string => Boolean(value)),
      };
    });

  return {
    formName: ir.name,
    kind: ir.kind,
    source: "FormIR",
    controls,
    formEvents: collectFormEvents(ir.root),
    warnings: controls.length === 0 ? ["No named controls were found in the FormIR."] : [],
  };
}

function roleFor(type: string): FormUiControlRole {
  if (type === "CommandButton" || type === "ToggleButton") return "action";
  if (type === "TextBox" || type === "ComboBox" || type === "ListBox" || type === "CheckBox") {
    return "input";
  }
  if (type === "Label" || type === "Image") return "display";
  if (type === "Section" || type === "TabControl" || type === "SubForm") return "container";
  return "unknown";
}

function unquote(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
}
