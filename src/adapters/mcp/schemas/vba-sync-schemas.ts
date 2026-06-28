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
