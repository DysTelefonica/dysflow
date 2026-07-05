import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import type { FormIR } from "../../core/models/form-ir.js";
import { compareForms, type FormDriftReport } from "../../core/services/form-ir-compare-service.js";
import {
  collectControls,
  collectFormEvents,
  parseFormTxt,
} from "../../core/services/form-ir-service.js";
import type { LintRuleId } from "../../core/services/form-lint-types.js";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
import { VbaFormsLintAdapter } from "./vba-forms-lint-adapter.js";
import { deriveFormName } from "./vba-forms-paths.js";

export async function inspectForm(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
): Promise<OperationResult<unknown>> {
  const sourcePath = stringValue(params.sourcePath) ?? stringValue(params.path);
  if (!sourcePath) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        "inspect_form requires sourcePath (path to the .form.txt file).",
      ),
    );
  }

  // Read from disk — adapter owns the I/O, core is pure
  let text: string;
  try {
    text = await fileSystem.readFile(sourcePath);
  } catch (err) {
    return failureResult(
      createDysflowError(
        "FORM_NOT_FOUND",
        `Cannot read form file at "${sourcePath}". ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  // Derive the form name from the filename
  const basename = sourcePath.replace(/\\/g, "/").split("/").pop() ?? "";
  const name = basename
    .replace(/^Form_/, "")
    .replace(/^Report_/, "")
    .replace(/\.form\.txt$/i, "")
    .replace(/\.report\.txt$/i, "");

  // Parse — pure, no I/O
  let ir: FormIR;
  try {
    ir = parseFormTxt(text, { name });
  } catch (err) {
    return failureResult(
      createDysflowError(
        "FORM_PARSE_ERROR",
        `Failed to parse "${sourcePath}": ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  // Extract controls and events from the IR
  const controls = collectControls(ir.root);
  const events = collectFormEvents(ir.root);

  return successResult({
    name: ir.name,
    kind: ir.kind,
    controls,
    events,
  });
}

export async function compareForm(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
): Promise<OperationResult<unknown>> {
  // Source/target path resolution. `path` is accepted as an alias for
  // `sourcePath`, and `target` is accepted as an alias for `targetPath`,
  // mirroring the slice-1 `inspect_form` parity.
  const sourcePath = stringValue(params.sourcePath) ?? stringValue(params.path);
  const targetPath = stringValue(params.targetPath) ?? stringValue(params.target);

  if (!sourcePath) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        "compare_form requires sourcePath (path to the left .form.txt file).",
      ),
    );
  }
  if (!targetPath) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        "compare_form requires targetPath (path to the right .form.txt file).",
      ),
    );
  }

  // Read both files via the injectable port (no Access, no COM).
  let leftText: string;
  let rightText: string;
  try {
    leftText = await fileSystem.readFile(sourcePath);
  } catch (err) {
    return failureResult(
      createDysflowError(
        "FORM_NOT_FOUND",
        `Cannot read source form file at "${sourcePath}". ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }
  try {
    rightText = await fileSystem.readFile(targetPath);
  } catch (err) {
    return failureResult(
      createDysflowError(
        "FORM_NOT_FOUND",
        `Cannot read target form file at "${targetPath}". ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  // Derive form names from filenames (mirror inspect_form derivation).
  const leftName = deriveFormName(sourcePath);
  const rightName = deriveFormName(targetPath);

  // Parse both via the slice-1 pure parser. A malformed input fails closed
  // with FORM_PARSE_ERROR so the caller never sees a partial report.
  let leftIR: FormIR;
  let rightIR: FormIR;
  try {
    leftIR = parseFormTxt(leftText, { name: leftName });
  } catch (err) {
    return failureResult(
      createDysflowError(
        "FORM_PARSE_ERROR",
        `Failed to parse source "${sourcePath}": ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }
  try {
    rightIR = parseFormTxt(rightText, { name: rightName });
  } catch (err) {
    return failureResult(
      createDysflowError(
        "FORM_PARSE_ERROR",
        `Failed to parse target "${targetPath}": ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  // Pure diff — no I/O, no Access.
  const report: FormDriftReport = compareForms({
    left: leftIR,
    right: rightIR,
    leftName,
    rightName,
  });
  return successResult(report);
}

export async function lintFormCode(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
): Promise<OperationResult<unknown>> {
  const lintAdapter = new VbaFormsLintAdapter(fileSystem);
  return lintAdapter.lintFormCode({
    destinationRoot: stringValue(params.destinationRoot),
    sourceRoot: stringValue(params.sourceRoot),
    formName: stringValue(params.formName),
    moduleNames: Array.isArray(params.moduleNames)
      ? params.moduleNames.filter((m): m is string => typeof m === "string")
      : undefined,
    rules: Array.isArray(params.rules)
      ? params.rules.filter((r): r is LintRuleId => typeof r === "string")
      : undefined,
    strict: params.strict === true,
  });
}
