import type { FormIR } from "./form-ir.js";

export type FormUiControlRole = "action" | "input" | "display" | "container" | "unknown";

export type FormUiControlAnalysis = {
  name: string;
  type: string;
  role: FormUiControlRole;
  caption?: string;
  controlSource?: string;
  rowSource?: string;
  events: string[];
  bindings: string[];
  properties: Readonly<Record<string, string>>;
};

export type FormUiAnalysisReport = {
  formName: string;
  kind: FormIR["kind"];
  source: "FormIR";
  controls: FormUiControlAnalysis[];
  formEvents: string[];
  warnings: string[];
};

export type CodeGraphBehaviorEvidence = {
  handler: string;
  callPath: string[];
  tables?: string[];
  effects?: string[];
};

export type FormUiBehaviorMap = {
  formName: string;
  codegraphIndexPath?: string | null;
  controls: Array<{
    name: string;
    type: string;
    role: FormUiControlRole;
    events: string[];
    bindings: string[];
    codegraphEvidence: CodeGraphBehaviorEvidence[];
    properties?: Readonly<Record<string, string>>;
  }>;
  formEvents: string[];
  unmappedEvidence: CodeGraphBehaviorEvidence[];
  warnings: string[];
};

export type FormUiDesignOperation = {
  kind:
    | "add-control"
    | "move-control"
    | "rename-control"
    | "set-property"
    | "delete-control"
    | "note";
  target: string;
  intent: string;
  params: Record<string, unknown>;
  preserves: string[];
};

export type ReferencePatternInput = {
  sourceForm: string;
  intent: string;
  mappedControls: Record<string, string>;
};

export type FormUiDesignPlan = {
  formName: string;
  sourceContract: FormUiBehaviorMap;
  operations: FormUiDesignOperation[];
  referencePattern?: ReferencePatternInput;
  warnings: string[];
};

export type FormUiPlanApplicationResult = {
  mode: "dry-run" | "apply";
  formName: string;
  operationsApplied: FormUiDesignOperation[];
  preservedControls: string[];
  warnings: string[];
  advisories: string[];
  filesystemApplied: boolean;
  importGate: "not-run" | "passed";
  appliedContract: FormUiBehaviorMap;
  importResult?: unknown;
};

export type FormUiVerificationFinding = {
  code: string;
  severity: "error" | "warning";
  message: string;
  controlName?: string;
};

/**
 * Optional inputs to `verifyFormUi` (issue #831). Each input enables ONE
 * category of looks-right checks:
 *   - `formCanvas` ⇒ off-canvas geometry check.
 *   - `sectionBounds` + `controlSection` ⇒ off-section geometry check.
 *   - `codeBehind` ⇒ event-handler cross-ref check.
 *
 * Absent inputs ⇒ the corresponding check is skipped silently (no
 * warning). All inputs are optional to keep the contract simple for
 * callers that only need basic survival verification.
 */
export type VerifyFormUiOptions = {
  /** Form canvas bounds in twips. Controls outside this rect produce a
   * `FORM_UI_OFF_CANVAS` warning. */
  formCanvas?: { width: number; height: number };
  /** Section bounds by section name (e.g. `Detail`, `FormHeader`). */
  sectionBounds?: Readonly<
    Record<string, { left?: number; top?: number; width: number; height: number }>
  >;
  /** Map of control name → owning section name. */
  controlSection?: Readonly<Record<string, string>>;
  /** Raw `.cls` code-behind text. When present, event-handler
   * cross-ref checks run (informational `FORM_UI_EVENT_HANDLER_MISSING`
   * warnings for `[Event Procedure]`-bound events whose handler is not
   * found in the code-behind). */
  codeBehind?: string;
};

export type FormUiVerificationReport = {
  ok: boolean;
  formName: string;
  /**
   * Combined `survivedFindings + looksRightFindings`. PRESERVED for
   * backward compat with callers that pre-date issue #831; new callers
   * SHOULD prefer the two split arrays for clearer reporting.
   */
  findings: FormUiVerificationFinding[];
  checkedControls: string[];
  /**
   * Survival findings (control missing, event/binding drift). Severity
   * is always `"error"`; any entry here forces `ok:false`. Add to #831.
   */
  survivedFindings: FormUiVerificationFinding[];
  /**
   * Looks-right findings (geometry / tab-order / property-validity /
   * event-handler cross-ref). Severity is always `"warning"`; entries
   * here are informational and never force `ok:false`. Add to #831.
   */
  looksRightFindings: FormUiVerificationFinding[];
};
