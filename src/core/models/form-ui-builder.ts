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

export type FormUiVerificationReport = {
  ok: boolean;
  formName: string;
  findings: FormUiVerificationFinding[];
  checkedControls: string[];
};
