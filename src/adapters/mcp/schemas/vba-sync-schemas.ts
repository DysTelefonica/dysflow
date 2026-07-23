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

const CODEGRAPH_EVIDENCE_SCHEMA: JsonSchemaProperty = {
  type: "object",
  description:
    "One CodeGraph-VBA behavior trace. handler and callPath are required; tables and effects are optional evidence metadata.",
  required: ["handler", "callPath"],
  additionalProperties: false,
  properties: {
    handler: {
      type: "string",
      minLength: 1,
      description: "VBA event handler or procedure name represented by this trace.",
    },
    callPath: {
      type: "array",
      items: { type: "string", description: "One procedure name in call order." },
      description: "Ordered procedure path starting at handler.",
    },
    tables: {
      type: "array",
      items: { type: "string", description: "One referenced table name." },
      description: "Optional tables reached by the trace.",
    },
    effects: {
      type: "array",
      items: { type: "string", description: "One observable effect." },
      description: "Optional side effects reached by the trace.",
    },
  },
};

const FORM_UI_BEHAVIOR_MAP_SCHEMA: JsonSchemaProperty = {
  type: "object",
  description:
    "FormUiBehaviorMap produced by map_form_behavior. Required fields describe controls, form events, unmapped CodeGraph evidence, and warnings. Optional mapper metadata such as a nullable codegraphIndexPath is accepted for runtime parity.",
  required: ["formName", "controls", "formEvents", "unmappedEvidence", "warnings"],
  additionalProperties: true,
  properties: {
    formName: {
      type: "string",
      minLength: 1,
      description: "Form name represented by this behavior contract.",
    },
    controls: {
      type: "array",
      description: "Semantic controls in the form behavior contract.",
      items: {
        type: "object",
        description:
          "One semantic control. name, type, role, events, bindings, and codegraphEvidence are required.",
        required: ["name", "type", "role", "events", "bindings", "codegraphEvidence"],
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            minLength: 1,
            description: "Access control name.",
          },
          type: {
            type: "string",
            minLength: 1,
            description: "Access control type such as CommandButton or TextBox.",
          },
          role: {
            type: "string",
            enum: ["action", "container", "display", "input", "unknown"],
            description: "Semantic role discriminator assigned by analyze_form_ui.",
          },
          events: {
            type: "array",
            items: { type: "string", description: "One Access event name." },
            description: "Access event properties bound on the control.",
          },
          bindings: {
            type: "array",
            items: { type: "string", description: "One data binding." },
            description: "ControlSource and RowSource bindings preserved by a design plan.",
          },
          codegraphEvidence: {
            type: "array",
            items: CODEGRAPH_EVIDENCE_SCHEMA,
            description: "CodeGraph-VBA traces mapped to this control.",
          },
          properties: {
            type: "object",
            additionalProperties: {
              type: "string",
              description: "Serialized Access property value.",
            },
            description:
              "Optional serialized Access properties, including Left, Top, Width, Height, TabIndex, and GUID.",
          },
        },
      },
    },
    formEvents: {
      type: "array",
      items: { type: "string", description: "One form-level Access event name." },
      description: "Access event properties bound at form level.",
    },
    unmappedEvidence: {
      type: "array",
      items: CODEGRAPH_EVIDENCE_SCHEMA,
      description: "CodeGraph-VBA traces that could not be mapped to one control.",
    },
    warnings: {
      type: "array",
      items: { type: "string", description: "One behavior-map warning." },
      description: "Non-fatal warnings produced while building the behavior map.",
    },
  },
};

const REFERENCE_PATTERN_SCHEMA: JsonSchemaProperty = {
  type: "object",
  description:
    "Reference UI pattern. sourceForm, intent, and mappedControls are required; mappedControls maps reference control names to target control names.",
  required: ["sourceForm", "intent", "mappedControls"],
  additionalProperties: false,
  properties: {
    sourceForm: {
      type: "string",
      minLength: 1,
      description: "Form whose UI pattern is being copied.",
    },
    intent: {
      type: "string",
      minLength: 1,
      description: "Traceable design rationale applied to every generated note operation.",
    },
    mappedControls: {
      type: "object",
      additionalProperties: {
        type: "string",
        description: "Target control name receiving the reference control's intent.",
      },
      description: "Map of reference control names to target behavior-map control names.",
    },
  },
};

const REQUESTED_FORM_UI_OPERATION_SCHEMA: JsonSchemaProperty = {
  type: "object",
  description:
    "Requested design operation discriminated by kind. kind, target, intent, and params are required; generate_form_design_plan derives preserves from behaviorMap.",
  required: ["kind", "target", "intent", "params"],
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      enum: [
        "add-control",
        "delete-control",
        "move-control",
        "note",
        "rename-control",
        "set-property",
      ],
      description:
        "Operation discriminator. Allowed values: add-control, delete-control, move-control, note, rename-control, set-property.",
    },
    target: {
      type: "string",
      minLength: 1,
      description:
        "Existing target control, new add-control name, or advisory anchor for note. Unknown non-add/non-note targets become warnings.",
    },
    intent: {
      type: "string",
      minLength: 1,
      description: "Human-readable rationale retained on the generated operation.",
    },
    params: {
      type: "object",
      additionalProperties: true,
      description:
        "Parameters selected by kind: add-control {type,targetSectionName?,properties?}; move-control {left?,top?}; rename-control {newName}; set-property {property,value}; delete-control {}; note may carry advisory metadata such as sourceForm. The validator has no oneOf/anyOf/allOf support, so kind is the enum discriminator and the runtime enforces per-kind requirements.",
      properties: {
        type: { type: "string", description: "Control type for add-control." },
        targetSectionName: {
          type: "string",
          description: "Optional target section for add-control.",
        },
        properties: {
          type: "object",
          additionalProperties: true,
          description: "Optional initial Access property map for add-control.",
        },
        left: { type: "number", description: "Optional Left coordinate for move-control." },
        top: { type: "number", description: "Optional Top coordinate for move-control." },
        newName: { type: "string", description: "Required destination name for rename-control." },
        property: {
          type: "string",
          description: "Required Access property name for set-property.",
        },
        sourceForm: {
          type: "string",
          description: "Optional reference source carried by note operations.",
        },
      },
    },
  },
};

const GENERATE_FORM_UI_PLAN_SCHEMA: JsonSchemaProperty = {
  type: "object",
  description:
    "Requested plan input. operations is required and each item uses kind as its enum discriminator; referencePattern is optional.",
  required: ["operations"],
  additionalProperties: false,
  properties: {
    operations: {
      type: "array",
      items: REQUESTED_FORM_UI_OPERATION_SCHEMA,
      description: "Ordered requested operations to validate against behaviorMap.",
    },
    referencePattern: REFERENCE_PATTERN_SCHEMA,
  },
};

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
      // Issue #1031 — apply:true parity with the registry; precedent: #1014 / PR #1030.
      apply: SCHEMA_PROPS.apply,
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  // Issue #966 — Pre-flight checks docs block (Round-12).
  // The `description` field is the canonical carrier for the per-tool
  // pre-flight checklist that an AI agent reads before passing
  // `apply:true`. The runtime enforces these gates automatically and
  // surfaces a typed error envelope when one fails; this block exists
  // so the same content lives next to the schema rather than only in
  // prose the agent might skip.
  //
  // Pre-flight checks (executed automatically at apply:true):
  // - destinationRoot must exist as a directory (NOT a file, NOT a
  //   non-existent path). Common footgun: `git rm -r src/` removes
  //   the directory itself, not just its contents. After running
  //   `git rm -r <destinationRoot>` you MUST `mkdir <destinationRoot>`
  //   before calling this tool with apply:true.
  // - accessPath must exist and be readable. When overridden it must
  //   resolve inside projectRoot (or pass `allowExternalAccessPath:true`
  //   for read-only tools — see #968).
  // - No stale markers with status="running" in
  //   .dysflow/runtime/markers/.
  // - capabilities.allowWrites must be true in .dysflow/project.json
  //   AND writesProcess.enabled must be true at the runtime level.
  // - projectId (when supplied) must match .dysflow/project.json id.
  //
  // On any failure the response carries a typed errorCode
  // (DESTINATION_ROOT_NOT_FOUND, ACCESS_PATH_NOT_FOUND,
  // OUTSIDE_PROJECT_ROOT, WRITE_LOCKED_BY_RUNNING_OP,
  // CAPABILITIES_DISALLOW_WRITE, MCP_WRITES_DISABLED,
  // PROJECT_ID_MISMATCH) and a diagnostics[].remediation field with
  // the concrete next command.
  export_modules: {
    type: "object",
    additionalProperties: false,
    description:
      "Issue #966 Pre-flight checks: before apply:true the runtime confirms (1) destinationRoot exists as a directory — `git rm -r src/` removes the directory itself, recreate it with `mkdir src/` before calling apply:true; (2) accessPath exists and resolves inside projectRoot or carries allowExternalAccessPath:true (#968); (3) no stale running markers in .dysflow/runtime/markers/; (4) capabilities.allowWrites=true and writesProcess.enabled=true; (5) projectId matches .dysflow/project.json. Failures surface as typed errorCodes with diagnostics[].remediation carrying the next command — see references/error-codes.md#DESTINATION_ROOT_NOT_FOUND for the destinationRoot case.",
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
      // Issue #1057 (F8) — `diff` and `dryRun` are declared so the
      // adapter's no-write routing (#1055) is reachable through MCP:
      // `dryRun:true` ≡ `apply:false` (plan) on every write tool.
      diff: SCHEMA_PROPS.diff,
      dryRun: SCHEMA_PROPS.dryRun,
      mutateBinary: {
        type: "boolean",
        description:
          "Issue #1065 - defaults to false. Export runs against a disposable copy so Access cannot mutate the original .accdb. Set true only to preserve the legacy direct-binary behavior. The response always reports binaryMutated.",
      },
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
      // Issue #968 — opt-in acknowledgment that the accessPath override
      // lives outside the active worktree. Honored because `export_modules`
      // never mutates the binary; reads from a release `.accdb` are allowed
      // when the caller has explicitly opted in. Ignored for binary writers
      // (`import_modules`, etc.).
      allowExternalAccessPath: SCHEMA_PROPS.allowExternalAccessPath,
      // Issue #975 — opt-in transactional mode. See SCHEMA_PROPS.transactional.
      transactional: SCHEMA_PROPS.transactional,
      // Issue #977 — preflight validation that fires the same gates
      // as apply:true without committing any write. Mutually
      // exclusive with `dryRun` (legacy alias via `diff` on
      // export_modules #757).
      dryRunWithPreflight: SCHEMA_PROPS.dryRunWithPreflight,
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
      // Issue #1057 (F8) — `dryRun` declared so the adapter's no-write
      // routing (#1055) is reachable through MCP: `dryRun:true` ≡
      // `apply:false` (plan) on every write tool.
      dryRun: SCHEMA_PROPS.dryRun,
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
  // Issue #966 — Pre-flight checks docs block (Round-12).
  // See `export_modules` above for the full canonical block. The same
  // five gates apply: destinationRoot existence, accessPath ownership,
  // no stale running markers, capabilities.allowWrites, projectId match.
  // The destinationRoot footgun — `git rm -r <destinationRoot>` removes
  // the directory itself, not just its files — applies equally here.
  import_modules: {
    type: "object",
    additionalProperties: false,
    description:
      "Issue #966 Pre-flight checks: before apply:true the runtime confirms (1) destinationRoot exists as a directory — `git rm -r src/` removes the directory itself, recreate it with `mkdir src/` before calling apply:true; (2) accessPath exists and resolves inside projectRoot (binary writers do NOT honor allowExternalAccessPath); (3) no stale running markers; (4) capabilities.allowWrites=true and writesProcess.enabled=true; (5) projectId matches .dysflow/project.json. Failures surface typed errorCodes with diagnostics[].remediation carrying the next command.",
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      moduleNames: SCHEMA_PROPS.moduleNames,
      importMode: SCHEMA_PROPS.importMode,
      dryRun: SCHEMA_PROPS.dryRun,
      // Issue #1014 — write-tool convention parity. The description
      // template promises "apply:true or dryRun:false" as the commit
      // signal; the schema must declare the `apply` flag so a caller
      // using the canonical `apply:true` form is not rejected with
      // `MCP_INPUT_INVALID: apply is not allowed.` Apply takes
      // precedence over `dryRun` (resolver contract); the legacy
      // `dryRun:false` form continues to work unchanged.
      apply: SCHEMA_PROPS.apply,
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
      // Issue #975 — opt-in transactional mode. See SCHEMA_PROPS.transactional.
      transactional: SCHEMA_PROPS.transactional,
      // Issue #977 — preflight validation (see SCHEMA_PROPS.dryRunWithPreflight).
      dryRunWithPreflight: SCHEMA_PROPS.dryRunWithPreflight,
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
      // Issue #1031 — apply:true parity with the registry; precedent: #1014 / PR #1030.
      apply: SCHEMA_PROPS.apply,
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
      // Issue #968 — opt-in for external accessPath on read-only tools.
      allowExternalAccessPath: SCHEMA_PROPS.allowExternalAccessPath,
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
      // Issue #968 — opt-in for external accessPath on read-only tools.
      allowExternalAccessPath: SCHEMA_PROPS.allowExternalAccessPath,
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
      // Issue #968 — opt-in for external accessPath on read-only tools.
      allowExternalAccessPath: SCHEMA_PROPS.allowExternalAccessPath,
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
  // Issue #966 — Pre-flight checks docs block (Round-12).
  // `sync_binary` composes `verify_code` + `import_modules` +
  // `export_modules`. Pre-flight checks listed for `export_modules`
  // and `import_modules` apply equally to every inner step; the
  // compose gate is the same five checks and the destinationRoot
  // footgun — `git rm -r <destinationRoot>` removes the directory
  // itself — breaks all three inner primitives in one shot.
  sync_binary: {
    type: "object",
    additionalProperties: false,
    description:
      "Issue #966 Pre-flight checks: before apply:true the runtime confirms (1) destinationRoot exists as a directory — `git rm -r src/` removes the directory itself, recreate it with `mkdir src/` before calling apply:true; (2) accessPath exists and resolves inside projectRoot; (3) no stale running markers; (4) capabilities.allowWrites=true and writesProcess.enabled=true; (5) projectId matches .dysflow/project.json. sync_binary composes verify_code + import_modules + export_modules, so a single failed gate aborts the whole composition. Failures surface typed errorCodes with diagnostics[].remediation carrying the next command.",
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
      acceptBothChanged: {
        type: "boolean",
        description:
          "Issue #1065 - explicit escape valve for a bothChanged conflict. With a one-way direction and apply:true, routes each conflict through that direction. Default false; direction:'both' never auto-resolves conflicts.",
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
      // Issue #975 — opt-in transactional mode. When true, every inner
      // import_modules / export_modules call wrapped by sync_binary runs
      // against a staging copy of the binary; the atomic commit happens
      // only after ALL inner calls succeed. See SCHEMA_PROPS.transactional.
      transactional: SCHEMA_PROPS.transactional,
      // Issue #977 — preflight validation. When true, sync_binary
      // runs the same pre-flight gates (filesystem, runtime,
      // capabilities, project config) as apply:true WITHOUT
      // dispatching inner import_modules / export_modules. Mutually
      // exclusive with `dryRun` and `apply`.
      dryRunWithPreflight: SCHEMA_PROPS.dryRunWithPreflight,
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
      // Issue #1014 — write-tool convention parity. The description
      // template promises "apply:true or dryRun:false" as the commit
      // signal; the schema must declare the `apply` flag so a caller
      // using the canonical `apply:true` form is not rejected with
      // `MCP_INPUT_INVALID: apply is not allowed.` Apply takes
      // precedence over `dryRun` (resolver contract); the legacy
      // `dryRun:false` form continues to work unchanged.
      apply: SCHEMA_PROPS.apply,
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
      // Issue #1031 — apply:true parity with the registry; precedent: #1014 / PR #1030.
      apply: SCHEMA_PROPS.apply,
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
  // Issue #1033 — publish the nested input contract consumed by
  // generateFormUiDesignPlan. The validator cannot express per-kind params with
  // oneOf/anyOf/allOf, so operations[].kind is the enum discriminator and the
  // params description documents each allowed shape (same strategy as #1022).
  generate_form_design_plan: {
    type: "object",
    required: ["behaviorMap", "plan"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      behaviorMap: FORM_UI_BEHAVIOR_MAP_SCHEMA,
      plan: GENERATE_FORM_UI_PLAN_SCHEMA,
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  // Issue #1022 — publish the runtime `plan` shape so `schema({toolName:
  // "apply_form_design_plan"})` and the consumer-facing docs stop advertising
  // an opaque `{type:"object"}`. The runtime service (`applyFormUiDesignPlan`
  // + `dispatchOperation`) accepts exactly six operation kinds, listed below
  // as the `kind` enum on each `operations[]` item. The per-kind `params`
  // shape is documented on `params.description` because this validator does
  // NOT support `oneOf`/`anyOf`/`allOf` (see `src/shared/validation/validator
  // .ts`); runtime enforcement lives in
  // `src/core/services/form-ui-design-plan-service.ts:dispatchOperation` and
  // `src/core/services/form-ui-plan-execution.ts`. Treat `plan` here as the
  // single contract: schema, runtime, example markdown all agree.
  apply_form_design_plan: {
    type: "object",
    required: ["sourcePath", "plan"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      sourcePath: SCHEMA_PROPS.sourcePath,
      path: SCHEMA_PROPS.path,
      // Issue #813 phase 6 — `targetPath` removed. It was an unvalidated
      // alternate write destination that would bypass every containment
      // + formName check `sourcePath` already gets. sourcePath (or `path`)
      // is the single source-path surface; resolved by the #718 resolver.
      plan: {
        type: "object",
        required: ["formName", "sourceContract", "operations"],
        additionalProperties: true, // accept `referencePattern`, generator-emitted metadata, future fields
        properties: {
          formName: {
            type: "string",
            minLength: 1,
            description:
              "Target form name. Must match the resolved moduleName from sourcePath after case-insensitive trim (validatePlanIdentity). Non-empty is enforced BEFORE the cross-check so two empty/undefined names can never vacuously satisfy the comparison.",
          },
          sourceContract: {
            type: "object",
            description:
              "FormUiBehaviorMap describing the form's controls, events, bindings, and codegraphEvidence. Produced by analyze_form_ui + map_form_behavior; required for the apply path so the pre-flight guards (`validatePlanOperationsAgainstContract`, `validatePlanPreservesContract`) can check every non-add/note operation against a real target.",
          },
          operations: {
            type: "array",
            description:
              "Discriminated list of form-UI mutations to apply in order. Each item carries a `kind` enum (the discriminator) and the universal scalar fields. Per-kind shape is documented on `params.description` — the runtime enforces per-kind requirements.",
            items: {
              type: "object",
              required: ["kind", "target", "intent", "params"],
              additionalProperties: true,
              properties: {
                kind: {
                  type: "string",
                  enum: [
                    "add-control",
                    "delete-control",
                    "move-control",
                    "note",
                    "rename-control",
                    "set-property",
                  ],
                  description:
                    "Discriminator for the dispatcher. Values map 1:1 to the FormIR mutation primitives (addControl / moveControl / renameControl / setProperty / deleteControl) plus `note` (advisory-only). Any other value throws FORM_UI_UNSUPPORTED_OPERATION.",
                },
                target: {
                  type: "string",
                  minLength: 1,
                  description:
                    "Existing control name (move-control / rename-control / set-property / delete-control), new control name (add-control), or advisory anchor for note. The runtime pre-flight rejects operations whose target is not in sourceContract.controls (except add-control + note).",
                },
                intent: {
                  type: "string",
                  minLength: 1,
                  description:
                    "Human-readable rationale. Required on every operation. For `note` operations the intent is the only field the runtime reads; it surfaces verbatim in the dry-run `advisories[]` array.",
                },
                params: {
                  type: "object",
                  description:
                    "Per-kind parameter map. Documented per `kind`:\n" +
                    "  - add-control    -> { type:string, targetSectionName?:string, properties?:Record<string,scalar> }\n" +
                    "  - move-control   -> { left?:number, top?:number } — at least one required by addControl/moveControl.\n" +
                    "  - rename-control -> { newName:string } — rename of a control with [Event Procedure] bindings is refused.\n" +
                    "  - set-property   -> { property:string, value:string|number|boolean } — property 'Name' refused; LayoutCached* silently dropped.\n" +
                    "  - delete-control -> {} — target must not have preserved events/bindings; ref'd by validatePlanPreservesContract.\n" +
                    "  - note           -> {} — ignored; intent goes to advisories.",
                },
                preserves: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "Optional list of event/binding/handler names this operation was generated to preserve. The generator (`generateFormUiDesignPlan`) auto-fills it from sourceContract. Pass-through on apply; consumers rarely set it directly.",
                },
              },
            },
          },
          referencePattern: {
            type: "object",
            description:
              "Optional. Identifies the sourceForm + mappedControls the plan was generated from. Consumed by downstream verify_form_ui / compare flows; not required by apply.",
          },
          warnings: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional. Pre-flight warnings surfaced by generate_form_design_plan. Pass-through on apply; the runtime does not mutate this field.",
          },
        },
      },
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  // Issue #1033 — copyFormUiPattern consumes the same FormUiBehaviorMap as
  // generate_form_design_plan plus a closed ReferencePatternInput contract.
  copy_form_ui_pattern: {
    type: "object",
    required: ["behaviorMap", "referencePattern"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      behaviorMap: FORM_UI_BEHAVIOR_MAP_SCHEMA,
      referencePattern: REFERENCE_PATTERN_SCHEMA,
      outputMode: SCHEMA_PROPS.outputMode,
    },
  },
  // Issue #1033 — verifyUi accepts two FormUiBehaviorMap values. There is no
  // checks[] input in the runtime handler; publishing one here would create a
  // second, non-executable contract, so both real inputs reuse the map schema.
  verify_form_ui: {
    type: "object",
    required: ["sourceContract", "appliedContract"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      sourceContract: {
        ...FORM_UI_BEHAVIOR_MAP_SCHEMA,
        description:
          "Source FormUiBehaviorMap whose controls, events, and bindings must survive the applied UI.",
      },
      appliedContract: {
        ...FORM_UI_BEHAVIOR_MAP_SCHEMA,
        description:
          "Applied FormUiBehaviorMap compared with sourceContract for survival and looks-right findings.",
      },
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
    // `propertyName` is canonical, while `property` remains an indefinitely
    // supported compatibility alias. The dispatch boundary enforces that at
    // least one is present because this validator does not support anyOf.
    required: ["sourcePath", "controlName"],
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
          "Compatibility alias for propertyName. Layout/property key to set on the control (e.g. 'Caption', 'Left', 'Top', 'Width').",
      },
      propertyName: {
        type: "string",
        minLength: 1,
        description:
          "Canonical layout/property key to set on the control (e.g. 'Caption', 'Left', 'Top', 'Width'). Refused for protected/metadata keys (Checksum, PrtDevMode*, Format) and for 'Name' (use form_rename_control).",
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
  // Issue #872 F2 / #1032 — duplicate an existing control under a new
  // name with optional property/geometry overrides. Type, entries,
  // children, event bindings ([Event Procedure]), tab order, and metadata
  // are deep-cloned; an existing GUID is deterministically regenerated so
  // source and clone never share identity. Caller overrides scalars on top.
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
          "Name for the cloned control. Must NOT collide with any existing control (FORM_DUPLICATE_CONTROL otherwise). When the source carries a GUID blob, the clone receives a fresh GUID deterministically derived from the form and source/new control identities; the source GUID is never copied verbatim (#1032).",
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
      // Issue #1031 — apply:true parity with the registry; precedent: #1014 / PR #1030.
      apply: SCHEMA_PROPS.apply,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
};
