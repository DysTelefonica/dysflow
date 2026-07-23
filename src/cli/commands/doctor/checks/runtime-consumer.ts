import { COMMIT_FLAG_REGISTRY } from "../../../../core/runtime/commit-flag-registry.js";
import type { DoctorCategoryCheck } from "./types.js";

/**
 * Tools whose commit flag is deliberately NOT `apply` — documented
 * exceptions, not polarity defects. `test_vba` commits with
 * `dryRun:false` because its schema never accepted `apply` (#1046).
 */
const DOCUMENTED_COMMIT_FLAG_EXCEPTIONS = new Set(["test_vba"]);

/**
 * Single-module tools whose param is `moduleName` while the introspection
 * family uses `module` — the Round-15 F1 inconsistency. Kept as a doctor
 * warning until a naming migration lands; the validator's "Did you mean"
 * hint (#1057 F4) covers the runtime UX meanwhile.
 */
const MODULE_PARAM_INCONSISTENCIES = [
  {
    tool: "delete_module",
    param: "moduleName",
    family: "list_procedures/get_procedure use 'module'",
  },
];

/**
 * Issue #1057 (F9) — Category C: validate the runtime consumer contract
 * from the in-process registries. Pure: no I/O beyond module imports.
 */
export function runRuntimeConsumerChecks(): DoctorCategoryCheck[] {
  const checks: DoctorCategoryCheck[] = [];

  const inverted = Object.entries(COMMIT_FLAG_REGISTRY)
    .filter(([name, metadata]) => {
      if (DOCUMENTED_COMMIT_FLAG_EXCEPTIONS.has(name)) return false;
      return metadata.commitFlag !== "apply";
    })
    .map(([name, metadata]) => `${name} (commitFlag: ${metadata.commitFlag})`);
  checks.push(
    inverted.length === 0
      ? {
          ok: true,
          name: "apply polarity",
          message:
            "every write tool commits with apply:true; dryRun/diff are plan aliases (no #1055-style inversion)",
          severity: "warning",
        }
      : {
          ok: false,
          name: "apply polarity",
          message: `apply polarity inversion candidates: ${inverted.join(", ")} — verify against get_capabilities.tools[].canonicalCommitFlag`,
          severity: "warning",
        },
  );

  checks.push({
    ok: MODULE_PARAM_INCONSISTENCIES.length === 0,
    name: "module param naming",
    message:
      MODULE_PARAM_INCONSISTENCIES.length === 0
        ? "single-module tools share the 'module' param"
        : `known naming inconsistency: ${MODULE_PARAM_INCONSISTENCIES.map(
            (entry) => `${entry.tool} uses '${entry.param}' (${entry.family})`,
          ).join("; ")} — rejected params now hint the correct name (#1057 F4)`,
    severity: "warning",
  });

  return checks;
}
