import type { OperationResult } from "../../core/contracts/index.js";
import type { LintRuleId } from "../../core/services/form-lint-types.js";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
import { VbaFormsLintAdapter } from "./vba-forms-lint-adapter.js";
import type { VbaFormsOrchestrator } from "./vba-forms-types.js";

export async function lintFormCode(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
  orchestrator?: VbaFormsOrchestrator,
): Promise<OperationResult<unknown>> {
  const lintAdapter = new VbaFormsLintAdapter(fileSystem);
  return lintAdapter.lintFormCode(
    {
      destinationRoot: stringValue(params.destinationRoot),
      sourceRoot: stringValue(params.sourceRoot),
      formName: stringValue(params.formName),
      moduleNames: Array.isArray(params.moduleNames)
        ? params.moduleNames.filter((module): module is string => typeof module === "string")
        : undefined,
      rules: Array.isArray(params.rules)
        ? params.rules.filter((rule): rule is LintRuleId => typeof rule === "string")
        : undefined,
      strict: params.strict === true,
      projectId: stringValue(params.projectId),
      projectRoot: stringValue(params.projectRoot),
    },
    orchestrator,
  );
}
