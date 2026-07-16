import * as formSource from "../../core/config/form-source-resolver.js";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import type { FormIR, FormNode } from "../../core/models/form-ir.js";
import { analyzeFormUi } from "../../core/services/form-ui-analysis-service.js";
import { buildFormUiBehaviorMap } from "../../core/services/form-ui-behavior-map-service.js";
import {
  type BindingFinding,
  type FormBindingSchema,
  validateBindings,
} from "../../core/services/form-ui-binding-validator.js";
import {
  type LayoutFinding,
  type LintFormLayoutOptions,
  lintFormLayout,
} from "../../core/services/form-ui-layout-lint.js";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
import {
  type FormTargetResolver,
  readFormContext,
  readFormSnapshot,
} from "./vba-forms-read-context.js";

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export async function analyzeFormLayoutTool(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
  orchestrator?: FormTargetResolver,
): Promise<OperationResult<unknown>> {
  const context = await readFormContext(fileSystem, params, orchestrator, "analyze_form_layout");
  if (!context.ok) return context;
  const { ir } = context.data;
  const analysis = analyzeFormUi(ir);
  const behaviorMap = buildFormUiBehaviorMap(analysis, []);
  const options = readLayoutOptions(params);
  const findings: LayoutFinding[] = lintFormLayout(behaviorMap, options);

  return successResult({
    formName: ir.name,
    controls: behaviorMap.controls.length,
    sections: countFormSections(ir),
    findings,
  });
}

function readLayoutOptions(params: Record<string, unknown>): LintFormLayoutOptions {
  const options: LintFormLayoutOptions = {};
  const alignmentThreshold = readNumber(params.alignmentThresholdTwips);
  if (alignmentThreshold !== undefined) options.alignmentThresholdTwips = alignmentThreshold;
  if (params.sectionBounds !== undefined && typeof params.sectionBounds === "object") {
    const parsed: Record<string, { left?: number; top?: number; width: number; height: number }> =
      {};
    for (const [key, raw] of Object.entries(params.sectionBounds as Record<string, unknown>)) {
      if (typeof raw !== "object" || raw === null) continue;
      const entry = raw as Record<string, unknown>;
      const width = readNumber(entry.width);
      const height = readNumber(entry.height);
      if (width === undefined || height === undefined) continue;
      const bounds: { left?: number; top?: number; width: number; height: number } = {
        width,
        height,
      };
      const left = readNumber(entry.left);
      const top = readNumber(entry.top);
      if (left !== undefined) bounds.left = left;
      if (top !== undefined) bounds.top = top;
      parsed[key] = bounds;
    }
    options.sectionBounds = parsed;
  }
  if (params.controlSection !== undefined && typeof params.controlSection === "object") {
    const parsed: Record<string, string> = {};
    for (const [key, raw] of Object.entries(params.controlSection as Record<string, unknown>)) {
      if (typeof raw === "string") parsed[key] = raw;
    }
    options.controlSection = parsed;
  }
  return options;
}

function countFormSections(ir: FormIR): number {
  const sections = new Set<string>();
  const visit = (node: FormNode): void => {
    if (["FormHeader", "Header", "Detail", "FormFooter", "Footer"].includes(node.blockType)) {
      sections.add(node.blockType);
    }
    for (const child of node.children) visit(child);
  };
  visit(ir.root);
  return sections.size;
}

export async function verifyFormBindingsTool(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
  orchestrator?: FormTargetResolver,
): Promise<OperationResult<unknown>> {
  const sourcePath = stringValue(params.sourcePath) ?? stringValue(params.path);
  const projectId = stringValue(params.projectId);
  const formName = stringValue(params.formName) ?? stringValue(params.name);
  if (!sourcePath && !(projectId && formName)) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        "verify_form_bindings requires sourcePath (path to the .form.txt file).",
      ),
    );
  }

  let projectSnapshot: { sourcePath: string; text: string } | undefined;
  if (projectId && formName) {
    if (!orchestrator) {
      return readFormContext(fileSystem, params, orchestrator, "verify_form_bindings");
    }
    const target = await orchestrator.resolveExecutionTarget({ projectId, formName });
    if (!target.ok) return target;
    const resolved = target.data as { destinationRoot: string; projectRoot?: string };
    const candidates = formSource.resolveFormSourceCandidates({
      sourceRoot: resolved.destinationRoot,
      projectRoot: resolved.projectRoot,
      formName,
    });
    for (const candidate of candidates) {
      try {
        projectSnapshot = {
          sourcePath: candidate.absolutePath,
          text: await fileSystem.readFile(candidate.absolutePath),
        };
        break;
      } catch {
        /* Try the next canonical source location. */
      }
    }
    if (!projectSnapshot) {
      const diagnostic = formSource.buildResolutionDiagnostic(
        { sourceRoot: resolved.destinationRoot, projectRoot: resolved.projectRoot, formName },
        candidates,
        projectId,
      );
      return failureResult(createDysflowError("FORM_NOT_FOUND", diagnostic.remediation));
    }
  }
  const schema = readSchema(params.schema);
  if (!schema.ok) {
    return failureResult(createDysflowError("FORM_BINDING_SCHEMA_INVALID", schema.error));
  }
  const context = projectSnapshot
    ? await readFormSnapshot(fileSystem, projectSnapshot.sourcePath, projectSnapshot.text)
    : await readFormContext(fileSystem, params, orchestrator, "verify_form_bindings");
  if (!context.ok) return context;
  const findings: BindingFinding[] = validateBindings(context.data.ir, schema.value);
  return successResult({
    formName: context.data.ir.name,
    controls: countControls(context.data.ir),
    findings,
  });
}

function readSchema(
  raw: unknown,
): { ok: true; value: FormBindingSchema } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return {
      ok: false,
      error:
        "verify_form_bindings requires a `schema` parameter (a Record<tableName, ColumnSchema[]> aggregate, or a `get_schema` payload {schema:[...]} with `tableName`).",
    };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      error:
        "`schema` must be an object: either a Record<tableName, ColumnSchema[]> or a single-table get_schema payload {schema:[...]}.",
    };
  }
  const obj = raw as Record<string, unknown>;
  if ("schema" in obj && Array.isArray(obj.schema)) {
    const tableName = stringValue(obj.tableName);
    if (tableName === undefined || tableName === "") {
      return {
        ok: false,
        error:
          "Single-table `get_schema` payload detected (`{schema:[...]}`) but `tableName` is missing. Pass `tableName` so the validator can wrap the columns under the correct key.",
      };
    }
    return { ok: true, value: { [tableName]: obj.schema as FormBindingSchema[string] } };
  }
  if (Object.values(obj).every((value) => Array.isArray(value) || value === undefined)) {
    const aggregate: FormBindingSchema = {};
    for (const [tableName, columns] of Object.entries(obj)) {
      aggregate[tableName] = Array.isArray(columns)
        ? (columns as FormBindingSchema[string])
        : undefined;
    }
    return { ok: true, value: aggregate };
  }
  return {
    ok: false,
    error:
      '`schema` must be either a Record<tableName, ColumnSchema[]> (aggregate) or a `get_schema` payload `{schema:[...], tableName:"..."}`.',
  };
}

function countControls(ir: FormIR): number {
  let count = 0;
  const visit = (node: FormNode): void => {
    if (node.entries.some((entry) => entry.kind === "scalar" && entry.key === "Name")) count++;
    for (const child of node.children) visit(child);
  };
  visit(ir.root);
  return count;
}
