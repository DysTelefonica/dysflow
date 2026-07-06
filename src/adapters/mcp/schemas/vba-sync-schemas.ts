// Schemas for the VBA sync tools (VBA_SYNC_TOOL_NAMES).

import {
  ACCESS_OVERRIDE,
  CTX_PROPS,
  type JsonObjectSchema,
  SCHEMA_PROPS,
  STRICT_CTX,
} from "../../../shared/validation/index.js";
import type { VbaSyncToolName } from "../mcp-tool-registry.js";

export const VBA_SYNC_TOOL_SCHEMAS: Record<VbaSyncToolName, JsonObjectSchema> = {
  list_access_operations: { type: "object", additionalProperties: false, properties: {} },
  cleanup_access_operation: {
    type: "object",
    required: ["operationId", "accessPath"],
    additionalProperties: false,
    properties: {
      operationId: SCHEMA_PROPS.operationId,
      force: SCHEMA_PROPS.force,
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  run_vba: {
    type: "object",
    required: ["procedureName"],
    additionalProperties: false,
    properties: {
      procedureName: SCHEMA_PROPS.procedureName,
      argsJson: SCHEMA_PROPS.argsJson,
      // PR1a (#621 F1) — explicit escape hatch for default-deny gate at the
      // MCP adapter (legacy alias of `dysflow_vba_execute`). When the project
      // config does not declare `allowedProcedures`, the adapter refuses
      // execution unless the caller passes `dryRun: true`.
      dryRun: SCHEMA_PROPS.dryRun,
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  export_modules: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      moduleNames: SCHEMA_PROPS.moduleNames,
      filter: SCHEMA_PROPS.filter,
      destinationRoot: SCHEMA_PROPS.destinationRoot,
      exportPath: SCHEMA_PROPS.exportPath,
      // issue #752 — opt-in verbose flag. Adds a top-level `verbose: [...]`
      // array to the response with per-module {source, destination, truncated,
      // mismatchReason} entries.
      verbose: SCHEMA_PROPS.verboseContract,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  export_all: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      filter: SCHEMA_PROPS.filter,
      diff: SCHEMA_PROPS.diff,
      prune: SCHEMA_PROPS.prune,
      exportPath: SCHEMA_PROPS.exportPath,
      // issue #752 — opt-in verbose flag.
      verbose: SCHEMA_PROPS.verboseContract,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  import_modules: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      moduleNames: SCHEMA_PROPS.moduleNames,
      importMode: SCHEMA_PROPS.importMode,
      dryRun: SCHEMA_PROPS.dryRun,
      compile: SCHEMA_PROPS.compile,
      // #732 — when true (default), a project-wide compile failure after a
      // successful per-module import triggers a rollback of every imported
      // module in this call. Set to false to preserve the legacy
      // partial-write behavior (advanced use case).
      rollbackOnCompileFail: {
        type: "boolean",
        description:
          "When true (default), a project-wide compile failure after a successful per-module import triggers a rollback of every imported module in this call. Set to false to preserve the legacy partial-write behavior (advanced use case).",
      },
      // issue #752 — opt-in verbose flag. Adds per-module {source,
      // destination, truncated, mismatchReason} to each result entry so an AI
      // caller can detect silent truncation instead of trusting `status:ok`.
      verbose: SCHEMA_PROPS.verboseContract,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  import_all: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      importMode: SCHEMA_PROPS.importMode,
      dryRun: SCHEMA_PROPS.dryRun,
      compile: SCHEMA_PROPS.compile,
      // issue #752 — opt-in verbose flag.
      verbose: SCHEMA_PROPS.verboseContract,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  list_objects: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      filter: SCHEMA_PROPS.filter,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  exists: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      name: SCHEMA_PROPS.name,
      moduleName: SCHEMA_PROPS.moduleName,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  test_vba: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      proceduresJson: SCHEMA_PROPS.proceduresJson,
      filter: SCHEMA_PROPS.filter,
      testsPath: SCHEMA_PROPS.testsPath,
      // Round-3 Item 5 (P2) — `dryRun: true` short-circuits to a plan-shaped
      // result in `VbaExecutionAdapter.executeTestVba` (no PowerShell spawn,
      // no Access, no compile). Without this, `additionalProperties: false`
      // rejected `dryRun:true` silently with "dryRun is not allowed" and
      // consumers had to commit real test execution before they could review
      // the plan. Same shape as the `run_vba` schema.
      dryRun: SCHEMA_PROPS.dryRun,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  compile_vba: {
    type: "object",
    additionalProperties: false,
    properties: { ...CTX_PROPS, ...ACCESS_OVERRIDE, timeoutMs: SCHEMA_PROPS.timeoutMs },
  },
  verify_code: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      strict: SCHEMA_PROPS.strict,
      moduleNames: SCHEMA_PROPS.moduleNames,
      diff: SCHEMA_PROPS.diff,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  delete_module: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      moduleName: SCHEMA_PROPS.moduleName,
      moduleNames: SCHEMA_PROPS.moduleNames,
      force: SCHEMA_PROPS.force,
      // Round-3 Item 5 (P2) — `dryRun: true` short-circuits to a plan-shaped
      // result in `VbaModulesAdapter.execute` via `planDelete` (mirrors the
      // `import_modules`/`import_all` dry-run intercept at
      // `vba-modules-adapter.ts:215`). Without this, `additionalProperties:
      // false` rejected `dryRun:true` silently with "dryRun is not allowed"
      // and consumers had to commit real deletions before they could review
      // the plan. Unlike `import_*`/`import_all` this is an EXPLICIT-only
      // flag — `delete_module` without `dryRun` keeps the legacy execute
      // path so production deletes don't accidentally dry-run.
      dryRun: SCHEMA_PROPS.dryRun,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  generate_erd: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      erdPath: SCHEMA_PROPS.erdPath,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  fix_encoding: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      location: SCHEMA_PROPS.location,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  validate_form_spec: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      specPath: SCHEMA_PROPS.specPath,
      spec: SCHEMA_PROPS.spec,
    },
  },
  generate_form: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      specPath: SCHEMA_PROPS.specPath,
      spec: SCHEMA_PROPS.spec,
      kind: SCHEMA_PROPS.kind,
      name: SCHEMA_PROPS.name,
      replace: SCHEMA_PROPS.replace,
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
    },
  },
  catalog_add_control: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      catalogPath: SCHEMA_PROPS.catalogPath,
      controlName: SCHEMA_PROPS.controlName,
      controlType: SCHEMA_PROPS.controlType,
      type: SCHEMA_PROPS.type,
      spec: SCHEMA_PROPS.spec,
      specPath: SCHEMA_PROPS.specPath,
      // DELTA-007 — dryRun/apply parity with generate_form. Both default-dry-run
      // semantics and apply wins; see vba-form-service.ts:catalogAddControl
      // and dispatch-factory.ts isFilesystemWrite branch.
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
    },
  },
  harvest_form_catalog: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      catalogPath: SCHEMA_PROPS.catalogPath,
      filter: SCHEMA_PROPS.filter,
    },
  },
  inspect_form: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
    },
  },
  compare_form: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      targetPath: {
        type: "string",
        description:
          "Path to the right-side .form.txt (compared against sourcePath). Required unless 'target' alias is provided.",
      },
      target: {
        type: "string",
        description: "Alias for targetPath.",
      },
    },
  },
  lint_form_code: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      destinationRoot: SCHEMA_PROPS.destinationRoot,
      sourceRoot: {
        type: "string",
        description:
          "Optional override for the source root (path that contains forms/ and reports/). Mirrors destinationRoot semantics for read-only tools.",
      },
      formName: {
        type: "string",
        description:
          "Single form/report name to lint (e.g. 'Form_FormExpedientesGestion' or 'Form_MyForm'). Mutually exclusive with moduleNames.",
      },
      moduleNames: {
        type: "array",
        items: { type: "string" },
        description:
          "List of form/report names to lint. Each must start with 'Form_' or 'Report_'. Mutually exclusive with formName.",
      },
      rules: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "form-control-binding",
            "access-listbox-no-list-assignment",
            "bare-function-call-with-parens",
            "named-and-positional-args-mixing",
            "unicode-sensitive-executable-tokens",
            "control-property-support",
          ],
        },
        description:
          "Subset of lint rule IDs to run; defaults to all six. Use this to scope CI on the slow rules only.",
      },
      strict: {
        type: "boolean",
        description: "When true, lint warnings are elevated to errors (CI hardening).",
      },
    },
  },
  dysflow_form_add_control: {
    type: "object",
    required: ["sourcePath", "controlName", "controlType"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      controlName: SCHEMA_PROPS.controlName,
      controlType: SCHEMA_PROPS.controlType,
      type: SCHEMA_PROPS.type,
      targetSectionName: SCHEMA_PROPS.targetSectionName,
      properties: SCHEMA_PROPS.properties,
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  dysflow_form_move_control: {
    type: "object",
    required: ["sourcePath", "controlName"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      controlName: SCHEMA_PROPS.controlName,
      left: SCHEMA_PROPS.left,
      top: SCHEMA_PROPS.top,
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  dysflow_form_rename_control: {
    type: "object",
    required: ["sourcePath", "controlName", "newName"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      controlName: SCHEMA_PROPS.controlName,
      newName: SCHEMA_PROPS.newName,
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  dysflow_form_serialize: {
    type: "object",
    required: ["sourcePath"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      formName: {
        type: "string",
        description:
          "Optional form name (e.g. 'Form_Customer'). Derived from the sourcePath filename when omitted; reported back in the response.",
      },
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  dysflow_form_deserialize: {
    type: "object",
    required: ["sourcePath", "ir"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      formName: {
        type: "string",
        description: "Optional form name; derived from the sourcePath filename when omitted.",
      },
      ir: {
        type: "object",
        description:
          "FormIR (parsed by parseFormTxt). Pass an existing FormIR; the tool re-serializes it with serializeFormTxt and writes the result. The IR contract is the slice-1 FormIR model (name/kind/preamble/root/codeBehind).",
      },
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  // slice 5 (issue #618) — `dysflow_create_form_from_template`
  dysflow_create_form_from_template: {
    type: "object",
    required: ["sourceForm", "targetForm", "tokenMap"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      // Form name only (e.g. 'Form_FormRiesgosGestionRiesgo'). The adapter
      // resolves it to a path via bench-cache first, then projectRoot; the
      // `.form.txt` extension is appended automatically.
      sourceForm: SCHEMA_PROPS.sourceForm,
      targetForm: SCHEMA_PROPS.targetForm,
      tokenMap: SCHEMA_PROPS.tokenMap,
      missingTokenPolicy: SCHEMA_PROPS.missingTokenPolicy,
      strictMissingTokens: SCHEMA_PROPS.strictMissingTokens,
      overwrite: SCHEMA_PROPS.overwrite,
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  vba_orphan_audit: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
    },
  },
  vba_inline_execution: {
    type: "object",
    required: ["code"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      code: SCHEMA_PROPS.code,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
};
