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
      // Issue #785 (v2.1.1) — opt-in acknowledgment for the export-source
      // guard. When `developer` mode is active and the destination overlaps
      // the project's active source root, the dispatcher refuses with
      // `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` unless the caller
      // passes this flag. Ignored in `safe-by-default` mode.
      confirmOverwriteSource: SCHEMA_PROPS.confirmOverwriteSource,
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
      // Issue #785 (v2.1.1) — see export_modules for semantics; same
      // opt-in acknowledgment field for full-mirror exports.
      confirmOverwriteSource: SCHEMA_PROPS.confirmOverwriteSource,
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
      // issue #752 — opt-in verbose flag. Adds per-module {source,
      // destination, truncated, mismatchReason} to each result entry so an AI
      // caller can detect silent truncation instead of trusting `status:ok`.
      verbose: SCHEMA_PROPS.verboseContract,
      // Issue #807 (Feature 2) — bulk import by directory walk. When
      // `sourceDir` is provided AND `moduleNames` is empty or omitted, the
      // adapter walks the directory, applies `filePattern` / `includeTests`
      // / `includeForms`, chunks the resolved names by `chunkSize`, and
      // dispatches each chunk to the existing import_modules path. The
      // chunked path NEVER crosses the runner boundary twice with overlapping
      // modules; the cross-referenced plan is built once TS-side. Backward
      // compatibility: when `moduleNames` is provided, the new params are
      // ignored (defaults preserve the current behavior).
      sourceDir: {
        type: "string",
        description:
          "Issue #807 (Feature 2) — source directory root to bulk-import. Default: project's destinationRoot from .dysflow/project.json. When set AND moduleNames is empty/omitted, the adapter walks this directory. Mutually exclusive with explicit moduleNames — passing a non-empty moduleNames array forces the legacy single-call path.",
      },
      recursive: {
        type: "boolean",
        description:
          "Issue #807 (Feature 2) — walk subdirectories of sourceDir. Default true. When false, only the top-level of sourceDir is scanned.",
      },
      filePattern: {
        type: "string",
        description:
          "Issue #807 (Feature 2) — glob-style filename pattern (e.g. 'Test_*' to limit to test modules). Single `*` wildcard at either end. Default '*' (every managed extension).",
      },
      includeTests: {
        type: "boolean",
        description:
          "Issue #807 (Feature 2) — include Test_*.bas files in the bulk walk. Default true. Set false when you want to ship a release without re-importing the test suite.",
      },
      includeForms: {
        type: "boolean",
        description:
          "Issue #807 (Feature 2) — include Form_*.cls / Form_*.form.txt / Report_*.cls / Report_*.report.txt files. Default true. Set false for code-only bulk imports.",
      },
      chunkSize: {
        type: "number",
        description:
          "Issue #807 (Feature 2) — modules per chunk when sourceDir is set. Default 10. The bulk path NEVER forwards more than this many modules per sub-call to the runner, so a single chunk failure (e.g. a corrupt .bas) cannot abort the entire batch.",
      },
      onChunkError: {
        type: "string",
        enum: ["continue", "abort"],
        description:
          "Issue #807 (Feature 2) — behavior when a chunk fails. continue (default) records chunk-level errors in chunkFailures[] and proceeds with the next chunk. abort stops after the first failed chunk and surfaces the partial result.",
      },
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
  // Issue #807 (Feature 1) — `list_vba_modules` enumerates the VBA project's
  // components (standard modules, classes, forms, reports, document modules)
  // and cross-references each row against the project's on-disk source tree.
  // The runner walks VBProject.VBComponents ONCE and releases every component
  // COM reference in `finally { FinalReleaseComObject }`. The TS service does
  // the source-side walk (filesystem only) and assembles the
  // {modules[], summary} payload. Read-only; the tool never mutates the
  // binary or the source tree.
  list_vba_modules: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      typeFilter: {
        type: "string",
        enum: ["standard", "class", "form", "report", "document"],
        description:
          "Filter by VBComponent.Type. standard=1 (modules), class=2 (classes), form=3 (forms), report=3 (reports — same VBComponent type, distinguished by CurrentProject.AllReports), document=100 (ThisDocument-style document modules).",
      },
      namePattern: {
        type: "string",
        description:
          "Glob-style name filter (e.g. 'Test_*' matches any name starting with Test_; '*Issue*' matches any name containing Issue). The single '*' wildcard is supported on either end; non-*` patterns match as substrings. Empty string matches nothing.",
      },
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
  // feat-759-no-compile (v1.19.0) — the `compile_vba` tool schema was
  // removed. The compile_vba tool itself is gone from VBA_SYNC_TOOL_NAMES,
  // MCP_TOOL_ROUTES, TOOL_PARITY_REGISTRY, and EXECUTION_MAPPINGS.
  // See openspec/specs/vba-manager-actions/spec.md "No compile_vba Action".
  // Round 5 / PR5 (v2.4.0) — verify_code OUTPUT is now augmented with three
  // additive fields (semantic mode only): `summaryStructured` (nested
  // actionable/nonActionable counts), `bulkImportable` / `bulkExportable`
  // (drop-in for import_modules / export_modules), and per-entry
  // `classification` / `reason` on `nonActionableDifferent[*]`. The input
  // schema below is unchanged (these are outputs, not inputs).
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
      // Issue #807 (Feature 3) — internal chunking and parallelism for
      // whole-project verify_code over a non-trivial list. Defaults preserve
      // the v2.3.x single-round-trip behavior: omit both chunkSize and
      // parallelChunks for the legacy path. The chunked path NEVER aborts
      // the call on a single chunk failure (issue #805 round-3 invariant)
      // and reports per-chunk timeouts as `chunkTimedOut` modules in the
      // final result.
      chunkSize: {
        type: "number",
        description:
          "Issue #807 (Feature 3) — modules per internal chunk. Default 25. When moduleNames.length <= chunkSize (or chunkSize is omitted), the call falls back to the legacy single round-trip; otherwise the list is sliced into chunks, each chunk is a fresh verify sub-call, and the merged result includes every chunk's matched / different / missing entries plus chunkFailures[].",
      },
      parallelChunks: {
        type: "number",
        description:
          "Issue #807 (Feature 3) — concurrent chunks. Default 2 (bounded). Range 1..8 — higher values risk Access COM contention on a single .accdb. The chunked path uses this to drive Promise.all-of-chunks; the legacy path ignores it.",
      },
      onChunkTimeout: {
        type: "string",
        enum: ["retry", "skip", "fail"],
        description:
          "Issue #807 (Feature 3) — per-chunk timeout behavior. retry (default) re-runs the chunk ONCE before giving up. skip records the chunk's modules as chunkTimedOut in the final result. fail propagates the chunk's timeout as the call-level error.",
      },
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
      formName: {
        type: "string",
        description: "Optional form/report name (e.g. 'Form_Customer').",
      },
      name: {
        type: "string",
        description: "Alias for formName.",
      },
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
      formName: {
        type: "string",
        description: "Optional left form/report name.",
      },
      name: {
        type: "string",
        description: "Alias for formName.",
      },
      targetName: {
        type: "string",
        description: "Optional right form/report name.",
      },
      targetForm: {
        type: "string",
        description: "Alias for targetName.",
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
  form_add_control: {
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
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  form_move_control: {
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
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  form_rename_control: {
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
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  form_serialize: {
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
      outputMode: SCHEMA_PROPS.outputMode,
      includeSerialized: SCHEMA_PROPS.includeSerialized,
    },
  },
  form_deserialize: {
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
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  // slice 5 (issue #618) — `create_form_from_template`
  create_form_from_template: {
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
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  analyze_form_ui: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  map_form_behavior: {
    type: "object",
    // Issue #830 — `codegraphEvidence` is now OPTIONAL. Backward compat: when
    // absent AND `autoFetchCodeGraph` is unset/false, the behavior map falls
    // back to `.form.txt`-declared events alone (the pre-#830 contract). The
    // `codegraphEvidence` + `autoFetchCodeGraph` combo is the new happy path:
    // caller evidence is merged with whatever the internal invoker returns.
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      codegraphEvidence: {
        type: "array",
        items: {
          type: "object",
          required: ["handler", "callPath"],
          additionalProperties: false,
          properties: {
            handler: { type: "string" },
            callPath: { type: "array", items: { type: "string" } },
            tables: { type: "array", items: { type: "string" } },
            effects: { type: "array", items: { type: "string" } },
          },
        },
      },
      // Issue #830 — opt-in flag. When true, the adapter layer invokes the
      // codegraph-vba MCP server internally (one-way: dysflow → codegraph-vba)
      // and merges the result with `codegraphEvidence` if also supplied.
      // Defaults to false to preserve backward compat. On any invoker
      // failure (no `.codegraph/`, CLI missing, parse error) the adapter
      // falls back to whatever the caller supplied (or the `.form.txt`-only
      // behavior) — never throws.
      autoFetchCodeGraph: { type: "boolean" },
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  generate_form_design_plan: {
    type: "object",
    required: ["behaviorMap", "plan"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      behaviorMap: { type: "object" },
      plan: { type: "object" },
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  apply_form_design_plan: {
    type: "object",
    required: ["plan"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      sourcePath: SCHEMA_PROPS.sourcePath,
      // Issue #813 phase 6 — `targetPath` removed. It was an unvalidated
      // alternate write destination that would bypass every containment
      // + formName check `sourcePath` already gets. sourcePath (or `path`)
      // is the single source-path surface; resolved by the #718 resolver.
      plan: { type: "object" },
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  copy_form_ui_pattern: {
    type: "object",
    required: ["behaviorMap", "referencePattern"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      behaviorMap: { type: "object" },
      referencePattern: { type: "object" },
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  verify_form_ui: {
    type: "object",
    required: ["sourceContract", "appliedContract"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      sourceContract: { type: "object" },
      appliedContract: { type: "object" },
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  // Issue #814 — `render_form_preview` produces a deterministic, byte-stable
  // layout artifact (SVG primary, ASCII fallback for terminals) from a
  // .form.txt's FormIR tree. Pure read-only — no Access, no COM, no
  // filesystem mutation. `output` selects which payload to surface in the
  // response; the structured envelope always carries the viewport and any
  // non-fatal warnings so #817 (`diff_form_preview`) can compose a pair
  // of frames without re-rendering. Defaults to `"svg"`.
  render_form_preview: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      output: {
        type: "string",
        enum: ["svg", "ascii", "both"],
        description:
          "Payload to return in `data`. `svg` is the primary browser-friendly format; `ascii` is the terminal/agent fallback; `both` surfaces both. The structured envelope (viewport, warnings) is always returned alongside.",
      },
      viewportScale: {
        type: "number",
        minimum: 0.0001,
        maximum: 10,
        description:
          'Optional twips -> pixels multiplier. Defaults to 0.05 (~21" form => ~1500px wide viewport). Pass 1.0 for twip-equivalent pixel rendering.',
      },
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  // Issue #815 — `analyze_form_layout` is the geometry-lint sibling of
  // `render_form_preview`. Pure read-class — it parses a single .form.txt
  // through FormIR, builds a behavior map, and runs the pure
  // `lintFormLayout` service against it. Never opens Access; never writes
  // to disk. Severity for every finding is `warning` (informational;
  // non-blocking) — the tool reports layout smells, it does not gate.
  analyze_form_layout: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      alignmentThresholdTwips: {
        type: "number",
        minimum: 0,
        maximum: 1000,
        description:
          "Maximum |topA − topB| (twips) for two controls to count as sharing a visual row. Defaults to 50. Smaller values tighten the alignment net.",
      },
      sectionBounds: {
        type: "object",
        additionalProperties: {
          type: "object",
          properties: {
            left: { type: "number" },
            top: { type: "number" },
            width: { type: "number" },
            height: { type: "number" },
          },
          required: ["width", "height"],
        },
        description:
          "Optional section bounds by section name (e.g. { Detail: { width: 20000, height: 10000 }, FormHeader: { width: 5000, height: 1000 } }). When supplied together with `controlSection`, the off-section check runs.",
      },
      controlSection: {
        type: "object",
        additionalProperties: { type: "string" },
        description:
          "Optional control-name → section-name map (e.g. { txtHeader: 'FormHeader', txtDetail: 'Detail' }). Required alongside `sectionBounds` for the off-section check.",
      },
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  // Issue #813 phase 6 — atomic exposure of the two net-new standalone
  // tools. Both share the same sourcePath/path + dryRun/apply + outputMode
  // surface as form_add_control / form_move_control / form_rename_control.
  form_set_property: {
    type: "object",
    required: ["sourcePath", "controlName", "property"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      controlName: SCHEMA_PROPS.controlName,
      property: {
        type: "string",
        minLength: 1,
        description:
          "Layout/property key to set on the control (e.g. 'Caption', 'Left', 'Top', 'Width'). Refused for protected/metadata keys (Checksum, PrtDevMode*, Format) and for 'Name' (use form_rename_control).",
      },
      value: {
        // Issue #813 phase 6 — `value` accepts string|number|boolean. The
        // base JsonSchemaPrimitiveType is a single primitive, so the cast
        // to JsonSchemaProperty widens the schema to a union. The dysflow
        // validator honors the schema as a constraint surface; non-scalar
        // values (object/array/null) are passed through to the primitive
        // which rejects them with the appropriate typed error.
        type: "string",
        description:
          "New scalar value for the property. Accepts string/number/boolean (JSON-shape). Blob-kind entries (PrtMip, PrtDevNamesW, FormatConditions, etc.) are refused at the service level, not at the schema.",
      } as unknown as { type: "string" | "number" | "boolean"; description: string },
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  form_delete_control: {
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
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
      outputMode: SCHEMA_PROPS.outputMode,
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
