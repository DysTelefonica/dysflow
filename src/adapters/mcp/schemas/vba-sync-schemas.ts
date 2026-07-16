// Schemas for the VBA sync tools (VBA_SYNC_TOOL_NAMES).

import {
  ACCESS_OVERRIDE,
  CTX_PROPS,
  type JsonObjectSchema,
  type JsonSchemaProperty,
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
      // Issue #757 (C1) — `apply:true` joins the export_modules family
      // too. The historical `diff:true` alias is honored as a
      // deprecated no-write mapping by VbaModulesAdapter; the schema
      // accepts both flags.
      apply: SCHEMA_PROPS.apply,
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
      // Issue #757 (C1) — `apply:true` is the new commit signal. The
      // historical `diff:true` is preserved as a deprecated no-write
      // alias (see vba-modules-adapter.ts). The schema accepts both
      // flags; the adapter picks the right one.
      apply: SCHEMA_PROPS.apply,
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
          "Issue #807 (Feature 3) - per-chunk timeout behavior. retry (default) re-runs the chunk ONCE before giving up. skip records the chunk's modules as chunkTimedOut in the final result. fail propagates the chunk's timeout as the call-level error.",
      },
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  // Issue #809 - `sync_binary` workflow tool. Composes three existing
  // primitives (verify_code + import_modules + export_modules) into a
  // single round-trip: verify -> plan -> execute (chunked) -> re-verify
  // -> recommend. Default semantics: `dryRun: true` populates the plan
  // and skips execute; `apply: true` performs the import / export
  // dispatch and re-runs verify_code; no flags follows the safe-by-default
  // plan behavior (see POLICY_EXEMPT_TOOLS in write-execution-dispatch.ts).
  // The schema is ADDITIVE - every parameter except direction / scope /
  // dryRun / apply / batchSize / onChunkError / parallelChunks /
  // returnFullDiff / directoryPath / recursive / includeTests / includeForms
  // is forwarded from the SCHEMA_PROPS / CTX_PROPS / STRICT_CTX surface
  // already shared with the three primitives.
  sync_binary: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      // Project resolution + strict-context parity with verify_code /
      // import_modules / export_modules. The `accessPath` override wins
      // over the project resolver exactly like the three primitives do.
      projectId: SCHEMA_PROPS.projectId,
      contextId: SCHEMA_PROPS.contextId,
      accessPath: SCHEMA_PROPS.accessPath,
      backendPath: SCHEMA_PROPS.backendPath,
      strictContext: SCHEMA_PROPS.strictContext,
      expectedAccessPath: SCHEMA_PROPS.expectedAccessPath,
      expectedProjectRoot: SCHEMA_PROPS.expectedProjectRoot,
      expectedDestinationRoot: SCHEMA_PROPS.expectedDestinationRoot,
      // Scope (mirrors verify_code + the form mutation family). An empty
      // moduleNames list + no directoryPath resolves to a whole-project
      // verify; moduleNames / directoryPath narrow the scope to a subset
      // (Issue #807 directory-walk semantics for the resolve-side
      // moduleNames fan-out - the inner verify_code call passes the
      // resolved names verbatim).
      moduleNames: SCHEMA_PROPS.moduleNames,
      directoryPath: {
        type: "string",
        description:
          "Issue #809 - when provided AND moduleNames is empty/omitted, sync_binary narrows the pre-verify + post-verify scope to a single directory. Mirrors import_modules.sourceDir (#807). Mutually exclusive with explicit moduleNames.",
      },
      recursive: {
        type: "boolean",
        description:
          "Issue #809 - when true (default), sync_binary walks subdirectories of directoryPath. Mirrors import_modules.recursive (#807).",
      },
      includeTests: {
        type: "boolean",
        description:
          "Issue #809 - include Test_*.bas files when resolving the scope from directoryPath. Default true.",
      },
      includeForms: {
        type: "boolean",
        description:
          "Issue #809 - include Form_*.cls / Form_*.form.txt / Report_*.cls / Report_*.report.txt when resolving the scope from directoryPath. Default true.",
      },
      strict: SCHEMA_PROPS.strict,
      // Direction - the sync_binary-specific knob. src-to-binary maps to
      // import_modules (binary behind). binary-to-src maps to export_modules
      // (binary ahead). both (default) is the union.
      direction: {
        type: "string",
        enum: ["src-to-binary", "binary-to-src", "both"],
        description:
          "Issue #809 - sync direction. src-to-binary maps to import_modules on the listed names. binary-to-src maps to export_modules on the listed names. both (default) is the union and emits a single recommendation.",
      },
      // Scope - the sync_binary-specific knob. actionableOnly:true
      // (default) excludes nonActionable diffs from the plan (the same
      // way verify_code already classifies them - they are non-functional
      // noise). includeBothChanged:true (default false) opts in to
      // including them in `skipped[]` with reason:'bothChanged_acknowledged'
      // so a caller that wants the visibility can surface them without
      // dispatching an unsafe auto-merge.
      scope: {
        type: "object",
        additionalProperties: false,
        properties: {
          actionableOnly: {
            type: "boolean",
            description:
              "Issue #809 - when true (default), nonActionable diffs are excluded from the plan and recommendation. When false, the caller opts in to seeing the full verify_code surface.",
          },
          includeBothChanged: {
            type: "boolean",
            description:
              "Issue #809 - when true, bothChanged modules are surfaced in plan.skipped with reason:'bothChanged_acknowledged'. Default false (the recommendation already escalates to manual_merge in that case).",
          },
        },
      },
      // Plan / execute gating - apply:true is the commit signal, dryRun:true
      // is the preview escape hatch. Absent both -> safe-by-default plan
      // (POLICY_EXEMPT_TOOLS keeps developer mode from injecting dryRun:false
      // on plan-intended calls).
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      // Chunking - modules per inner dispatch chunk during apply:true.
      // The default is conservative (10) so a single Access COM failure
      // cannot abort a large sync; raise it for projects with verified
      // long lists of safe modules.
      batchSize: {
        type: "number",
        minimum: 1,
        maximum: 200,
        description:
          "Issue #809 - modules per chunk during execute. Default 10. toImport and toExport are both sliced into chunks of at most batchSize modules; each chunk is one import_modules / export_modules sub-call. A single chunk failure never crosses the runner boundary twice with overlapping modules.",
      },
      onChunkError: {
        type: "string",
        enum: ["continue", "abort"],
        description:
          "Issue #809 - chunk failure behavior. continue (default) records chunk-level errors and proceeds with the next chunk. abort stops after the first failed chunk and surfaces the partial result.",
      },
      // Reserved for the parallel-chunk fan-out follow-up. The current
      // implementation processes chunks sequentially because the inner
      // import_modules / export_modules calls share a single Access COM
      // session per project; the field is accepted today so a future
      // PR can flip the driver without a schema bump.
      parallelChunks: {
        type: "number",
        minimum: 1,
        maximum: 8,
        description:
          "Issue #809 - reserved for future parallel chunk fan-out. Default 1 (sequential). Range 1..8; values >1 are accepted but currently run sequentially - the inner primitives share a single Access COM session per project.",
      },
      // Return shape opt-in - when true, the response includes the full
      // verify_code diffs on preSync / postSync (same shape as verify_code
      // without sync_binary). Default false to keep the workflow payload
      // compact; callers that need diffs ask for verify_code directly.
      returnFullDiff: {
        type: "boolean",
        description:
          "Issue #809 - when true, preSync and postSync include the full verify_code `diffs` array. Default false (only the actionable / missing counts are surfaced, matching the sync_binary workflow payload contract).",
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
  // Issue #817 — `diff_form_preview` composes two `render_form_preview`
  // outputs into a before/after visual diff. Reads two .form.txt files,
  // parses both, and emits a structured `{added, removed, moved, resized}`
  // change report with diff overlays on the SVG / ASCII frames. Pure
  // read-class — never opens Access, never writes to disk. `output`
  // selects which frame(s) to surface; the structured envelope
  // (changes + warnings + form names) is always returned.
  diff_form_preview: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      beforePath: {
        type: "string",
        description:
          "Path to the LEFT .form.txt file (the baseline). Required unless projectId+beforeName resolves it via the project resolver.",
      },
      before: {
        type: "string",
        description: "Alias for beforePath.",
      },
      afterPath: {
        type: "string",
        description:
          "Path to the RIGHT .form.txt file (the modified). Required unless projectId+afterName resolves it via the project resolver.",
      },
      after: {
        type: "string",
        description: "Alias for afterPath.",
      },
      beforeName: {
        type: "string",
        description:
          "Optional form name used together with projectId to resolve beforePath via the project resolver.",
      },
      beforeForm: {
        type: "string",
        description: "Alias for beforeName.",
      },
      afterName: {
        type: "string",
        description:
          "Optional form name used together with projectId to resolve afterPath via the project resolver.",
      },
      afterForm: {
        type: "string",
        description: "Alias for afterName.",
      },
      output: {
        type: "string",
        enum: ["svg", "ascii", "both"],
        description:
          "Payload to return in `data`. `svg` is the primary browser-friendly format (with data-diff='added|removed|moved|resized|same' on each rect); `ascii` is the terminal/agent fallback (with a diff-marker legend); `both` surfaces both. The structured envelope (changes, warnings) is always returned alongside.",
      },
      viewportScale: {
        type: "number",
        minimum: 0.0001,
        maximum: 10,
        description:
          "Optional twips -> pixels multiplier. Defaults to 0.05. Passed through to both renderings.",
      },
      ascii: {
        type: "object",
        properties: {
          cellWidth: { type: "number", minimum: 3, maximum: 400 },
          cellHeight: { type: "number", minimum: 3, maximum: 200 },
        },
        description:
          "Optional ASCII grid dimensions. Defaults to 80x24. Passed through to both renderings.",
      },
      epsilon: {
        type: "number",
        minimum: 0,
        maximum: 100,
        description:
          "Tolerance (twips) for the moved/resized classification. Defaults to 0. Any non-zero integer delta on the relevant axis is treated as a real change.",
      },
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  // Issue #818 — `verify_form_bindings` validates a form's ControlSource
  // + RowSource bindings against a caller-supplied schema aggregate. Pure
  // read-class — the adapter never opens Access, never writes to disk,
  // and never fetches the schema itself; the caller fans out one
  // `get_schema({ tableName })` MCP call per table they care about and
  // passes the aggregate in via `schema`. Every finding carries severity
  // `"warning"` (informational; never gating).
  verify_form_bindings: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      // The schema aggregate. Two shapes are accepted (the adapter
      // normalizes both):
      //   1. The full aggregate: `{ Customers: [{name, type, nullable}, ...], Orders: [...] }`.
      //   2. A single dysflow `get_schema` payload: `{ schema: [...], tableName: "..." }`
      //      — the adapter wraps it as `{ [tableName]: schema }`.
      schema: {
        type: "object",
        description:
          'Schema aggregate to validate bindings against. Either a `Record<tableName, ColumnSchema[]>` (multiple tables, fan out one `get_schema` per table upstream) or a single-table `get_schema` payload `{schema:[{name,type,nullable}], tableName:"..."}`. The adapter accepts both shapes; the latter requires `tableName` so the columns land under the correct key.',
      } as JsonSchemaProperty,
      formName: {
        type: "string",
        description: "Optional form/report name (e.g. 'Form_Customer').",
      },
      name: {
        type: "string",
        description: "Alias for formName.",
      },
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  // Issue #872 F5 — `form_get_geometry` is a pure read-only helper. Returns
  // the Left/Top/Width/Height box (twips) of one named control plus the
  // LayoutCached* values for symmetry with the source artifact. Resolves
  // sourcePath/path OR projectId+formName (same as the other Phase 2
  // Perception siblings). The dispatch write-gate NEVER fires (read-only
  // route; mutates flags are both false).
  form_get_geometry: {
    type: "object",
    required: ["controlName"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      formName: {
        type: "string",
        description: "Optional form/report name (e.g. 'Form_Customer'). Used with projectId.",
      },
      name: {
        type: "string",
        description: "Alias for formName.",
      },
      controlName: {
        ...SCHEMA_PROPS.controlName,
        description:
          "Name of the control whose geometry to read. Returns FORM_CONTROL_NOT_FOUND if the control does not exist in the parsed FormIR.",
      },
    },
  },
  // Issue #872 F5 — `form_list_controls` is a pure read-only helper. Returns
  // the flat inventory of named controls in the parsed FormIR (optionally
  // scoped to one section) with each control's name, type, geometry box,
  // and hasEventBinding bit. The latter reflects whether the control
  // carries any OnXxx = [Event Procedure] entry verbatim (mirrors
  // collectFormEvents + per-control walk). Resolves sourcePath/path OR
  // projectId+formName. The dispatch write-gate NEVER fires.
  //
  // Issue #872 R4-001 — `limit` caps the response so a 10k-control form
  // does not return an unmetered JSON payload. Hard ceiling is 5000; the
  // adapter defaults to 1000 when the caller omits `limit`. When the
  // matched inventory exceeds the limit the response envelope adds
  // `truncated: true` + `totalCount: <full-match-count>`.
  form_list_controls: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      formName: {
        type: "string",
        description: "Optional form/report name (e.g. 'Form_Customer'). Used with projectId.",
      },
      name: {
        type: "string",
        description: "Alias for formName.",
      },
      section: {
        type: "string",
        description:
          "Optional section name to scope the listing (e.g. 'Detail', 'FormHeader'). When omitted, every named control in the form is returned.",
      },
      limit: {
        type: "number",
        minimum: 1,
        maximum: 5000,
        default: 1000,
        description:
          "Maximum controls to return. Hard ceiling is 5000; default is 1000. When the matched inventory exceeds the limit, the response sets `truncated: true` and includes `totalCount` with the full match count so the caller can paginate.",
      } as JsonSchemaProperty,
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
      commitScope: {
        type: "string",
        enum: ["source", "source-and-binary"],
        description:
          "Persistence boundary. Defaults to 'source-and-binary' (write source, then run the guarded Access import). Use 'source' to persist only the .form.txt mutation and explicitly skip the binary import gate; reconcile the Access binary separately.",
      },
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
  // Issue #872 F1 — atomic batch property updates against a single
  // control. Collapses N `form_set_property` calls into one IR mutation:
  // the schema accepts a `properties` map (Record<key, scalar>) instead
  // of a single (property, value) pair, so the most common case — full
  // geometry (Left+Top+Width+Height) — moves from 4 round trips to 1.
  // LayoutCached* keys are silently dropped by the service layer
  // (stripLayoutCachedKeys); they are NOT surface-rejected at the
  // schema level because callers routinely pass them after
  // form_list_controls / form_get_geometry, and the service layer is
  // the canonical noise-floor (#872 F3).
  form_set_properties: {
    type: "object",
    required: ["sourcePath", "controlName", "properties"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      controlName: SCHEMA_PROPS.controlName,
      properties: {
        // Record<string, string|number|boolean>. The schema declares
        // `object` so the dysflow validator accepts any JSON map;
        // the service primitive rejects non-scalar values per-key.
        // LayoutCached* keys are NOT forbidden at the schema level —
        // they're stripped by `stripLayoutCachedKeys` at the service.
        type: "object",
        additionalProperties: {
          // Each property value MUST be a scalar (string / number /
          // boolean). Blob-like values would be rejected at the
          // FORM_PROPERTY_NOT_SCALAR envelope downstream; surfacing
          // the schema constraint here gives the caller a clean
          // `MCP_INPUT_INVALID` upfront instead. The base
          // JsonSchemaPrimitiveType is a single primitive, so the
          // cast widens the schema to a union — same pattern as
          // `form_set_property.value`.
          type: "string",
        } as unknown as { type: "string" | "number" | "boolean"; description: string },
        description:
          "Map of property name → scalar value. Typical use: `{ Left: 100, Top: 200, Width: 4536, Height: 500, Caption: '\"Tile 1\"' }`. All per-key guards from form_set_property carry over: 'Name' is refused (use form_rename_control), protected/metadata keys (Checksum, Format, PrtDevMode*) throw FORM_PROPERTY_PROTECTED, blob-kind entries refuse scalar replacement. LayoutCached* keys are silently dropped (Issue #872 F3 — they're Access IDE serialisation noise).",
      },
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  // Issue #872 F2 — duplicate an existing control under a new name
  // with optional property/geometry overrides. The source control's
  // type, entries, children, event bindings ([Event Procedure]),
  // tab order, GUID, and metadata are deep-cloned verbatim — the
  // caller overrides scalars on top via the `overrides` map.
  // Event bindings carry over so a duplicated control is pre-wired
  // with the source's behaviour; that's the whole point of cloning
  // ("make this new control like that existing one") and matches the
  // Access IDE's paste-control behaviour.
  form_duplicate_control: {
    type: "object",
    required: ["sourcePath", "sourceControlName", "newName"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      sourceControlName: {
        type: "string",
        minLength: 1,
        description:
          "Name of the control to clone. Must exist in the parsed FormIR (FORM_DUPLICATE_SOURCE_MISSING otherwise).",
      },
      newName: {
        type: "string",
        minLength: 1,
        description:
          "Name for the cloned control. Must NOT collide with any existing control (FORM_DUPLICATE_CONTROL otherwise).",
      },
      targetSectionName: {
        type: "string",
        description:
          "Optional Access section name (e.g. 'Detalle', 'FormHeader') to push the clone into. Defaults to the form root's default control container when omitted.",
      },
      overrides: {
        type: "object",
        additionalProperties: {
          type: "string",
        } as unknown as { type: "string" | "number" | "boolean"; description: string },
        description:
          "Optional map of property name → scalar value applied AFTER the deep-clone. Same per-key guards as form_set_properties: 'Name' is ignored (identity is always `newName`), protected/metadata keys throw FORM_PROPERTY_PROTECTED, blob-kind entries refuse scalar replacement, LayoutCached* keys are silently dropped (#872 F3).",
      },
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  // Issue #816 — Phase 3 (Ergonomic actions). Two batch geometry verbs
  // sharing the applyGuardedFormWrite seam. Both accept `controlNames`
  // as either a string[] or a comma-separated string (the adapter
  // normalizes to string[]).
  form_align_controls: {
    type: "object",
    required: ["sourcePath", "controlNames", "edge"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      controlNames: {
        // Issue #816 — the schema declares `array` as the canonical form.
        // The adapter also accepts a comma-separated string and normalizes
        // it to a string[] in `runAlignDistribute` — callers passing
        // either form succeed.
        type: "array",
        items: { type: "string", minLength: 1 },
        description:
          "List of control names to align. Order is ignored; the median of the selection is used. The adapter also accepts a comma-separated string and normalizes it to an array.",
      },
      edge: {
        type: "string",
        enum: ["left", "right", "top", "bottom", "center-horizontal", "center-vertical"],
        description:
          "Which edge / center to align on. 'left'/'right'/'center-horizontal' move Left; 'top'/'bottom'/'center-vertical' move Top.",
      },
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  form_distribute_controls: {
    type: "object",
    required: ["sourcePath", "controlNames", "axis"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      controlNames: {
        type: "array",
        items: { type: "string", minLength: 1 },
        description:
          "List of control names to distribute. Order is ignored; controls are sorted by their axis position internally. The adapter also accepts a comma-separated string and normalizes it to an array.",
      },
      axis: {
        type: "string",
        enum: ["horizontal", "vertical"],
        description:
          "Which axis to distribute along. 'horizontal' moves Left; 'vertical' moves Top.",
      },
      spacing: {
        type: "number",
        minimum: 0,
        description:
          "Optional exact gap (twips) between consecutive control edges. When omitted, distributes across the bounding box of the selection.",
      },
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
