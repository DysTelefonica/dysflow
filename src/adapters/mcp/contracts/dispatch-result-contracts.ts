import { z } from "zod";

import type { AliasToolName } from "../alias-tools.js";
import {
  type DispatchResultFamily,
  type GeneratedDispatchToolName,
  MCP_TOOL_ROUTES,
} from "../dispatch-routes.js";
import { type AnyExecutableResultContract, defineResultContract } from "./result-contract.js";

const passthroughObject = z.object({}).loose();
const stringArray = z.array(z.string());
const planApplyMode = z.enum(["plan", "apply"]);

const queryReadPayload = z
  .object({
    rows: z.array(z.unknown()).optional(),
    columns: z.array(z.unknown()).optional(),
    affectedRows: z.number().int().nonnegative().optional(),
    resolvedAccessPath: z.string().optional(),
    count: z.number().int().nonnegative().optional(),
    values: z.array(z.unknown()).optional(),
    tables: z.array(z.unknown()).optional(),
    files: z.array(z.unknown()).optional(),
  })
  .loose();

/**
 * The VBA read family has heterogeneous handlers, but its schema still names
 * the observable fields consumers can receive instead of exposing an empty
 * passthrough object. Route-specific contracts remain reserved for genuinely
 * discriminated payloads.
 */
const vbaReadPayload = z
  .object({
    outputMode: z.string().optional(),
    summary: z.unknown().optional(),
    itemCount: z.number().int().nonnegative().optional(),
    forms: z.array(z.unknown()).optional(),
    reports: z.array(z.unknown()).optional(),
    modules: z.array(z.unknown()).optional(),
    classes: z.array(z.unknown()).optional(),
    documentModules: z.array(z.unknown()).optional(),
    components: z.array(z.unknown()).optional(),
    moduleName: z.string().optional(),
    moduleExists: z.boolean().optional(),
    classExists: z.boolean().optional(),
    controls: z.array(z.unknown()).optional(),
    relationships: z.array(z.unknown()).optional(),
    links: z.array(z.unknown()).optional(),
    linkedTables: z.array(z.unknown()).optional(),
    issues: z.array(z.unknown()).optional(),
    diagnostics: z.array(z.unknown()).optional(),
    warnings: z.array(z.unknown()).optional(),
    errors: z.array(z.unknown()).optional(),
    valid: z.boolean().optional(),
  })
  .loose();

const ANALYZE_FORM_LAYOUT_CONTRACT = defineResultContract({
  description: "Form layout analysis findings with aggregate control and section counts.",
  schema: z
    .object({
      formName: z.string(),
      controls: z.union([z.number().int().nonnegative(), z.array(z.unknown())]),
      sections: z.number().int().nonnegative(),
      findings: z.array(z.unknown()),
    })
    .loose(),
});

const VERIFY_FORM_BINDINGS_CONTRACT = defineResultContract({
  description: "Form binding validation findings with control count and structured findings.",
  schema: z
    .object({
      formName: z.string(),
      controls: z.union([z.number().int().nonnegative(), z.array(z.unknown())]),
      findings: z.array(z.unknown()),
    })
    .loose(),
});

const RUN_VBA_CONTRACT = defineResultContract({
  description: "VBA procedure execution or dry-run plan.",
  modes: ["plan", "apply"],
  schema: z.union([
    z
      .object({
        dryRun: z.literal(true),
        willExecute: z.literal(false),
        willModifyAccess: z.literal(false),
        procedureName: z.string(),
        moduleName: z.string(),
      })
      .loose(),
    z.object({ returnValue: z.unknown().optional() }).loose(),
  ]),
});

const QUERY_SQL_CONTRACT = defineResultContract({
  description: "Access SQL rows.",
  schema: queryReadPayload,
});

const FIX_ENCODING_CONTRACT = defineResultContract({
  description: "Encoding normalization plan with inspected files and detected BOM drift.",
  modes: ["plan", "apply"],
  schema: z
    .object({
      operation: z.literal("fix_encoding").optional(),
      dryRun: z.boolean().optional(),
      filesInspected: z.array(z.string()).optional(),
      detectedDrift: z
        .array(z.object({ file: z.string(), issue: z.literal("utf8-bom") }))
        .optional(),
    })
    .loose(),
});

const DELETE_MODULE_CONTRACT = defineResultContract({
  description: "Delete-module plan or applied deletion result.",
  modes: ["plan", "apply"],
  schema: z
    .object({
      operation: z.literal("delete_module").optional(),
      dryRun: z.boolean().optional(),
      modulesPlanned: z.array(z.string()).optional(),
      modulesCount: z.number().int().nonnegative().optional(),
      deleted: z.array(z.string()).optional(),
    })
    .loose(),
});

const GENERATE_ERD_CONTRACT = defineResultContract({
  description: "Generated ERD Markdown file.",
  outputModes: ["file"],
  schema: z.object({ ok: z.boolean().optional(), markdownFile: z.string() }).loose(),
});

const VBA_INLINE_EXECUTION_CONTRACT = defineResultContract({
  description: "Inline VBA plan or execution result returned by the temporary run_vba procedure.",
  modes: ["plan", "apply"],
  schema: z.union([
    z.object({ returnValue: z.json() }).loose(),
    z
      .object({
        operation: z.literal("vba_inline_execution"),
        dryRun: z.literal(true),
        willExecute: z.literal(false),
        willModifyAccess: z.literal(false),
        willModifyFilesystem: z.literal(false),
        codeLength: z.number().int().nonnegative(),
      })
      .loose(),
  ]),
});

const IMPORT_QUERIES_CONTRACT = defineResultContract({
  description: "Query-definition import plan/apply result.",
  modes: ["plan", "apply"],
  schema: z
    .object({
      dryRun: z.boolean(),
      imported: z.number().int().nonnegative(),
      queries: z.array(z.object({ name: z.string(), sql: z.string() }).loose()),
    })
    .loose(),
});

const COMPACT_REPAIR_CONTRACT = defineResultContract({
  description: "Compact/repair plan or applied database replacement.",
  modes: ["plan", "apply"],
  schema: z
    .object({
      dryRun: z.boolean(),
      target: z.enum(["frontend", "backend"]).optional(),
      sourcePath: z.string(),
      targetPath: z.string(),
      backupFirst: z.boolean().optional(),
      wouldReplaceSource: z.boolean().optional(),
      backupPath: z.string().nullable().optional(),
      compacted: z.boolean().optional(),
    })
    .loose(),
});

const RELINK_TABLES_CONTRACT = defineResultContract({
  description: "Existing linked-table refresh result.",
  modes: ["plan", "apply"],
  schema: z
    .object({
      backendPath: z.string(),
      linkedTables: z.array(z.object({ name: z.string(), backendPath: z.string() }).loose()),
    })
    .loose(),
});

const RELINK_DIRECTORY_CONTRACT = defineResultContract({
  description: "Directory-wide linked-table relink plan/apply report.",
  modes: ["plan", "apply"],
  schema: z
    .object({
      relinkDirectory: z
        .object({
          mode: z.enum(["dry-run", "apply"]),
          root: z.string(),
          filesScanned: z.number().int().nonnegative(),
          linkedTablesFound: z.number().int().nonnegative(),
          plannedRelinks: z.number().int().nonnegative(),
          appliedRelinks: z.number().int().nonnegative(),
          fileResults: z.array(z.unknown()),
        })
        .loose(),
    })
    .loose(),
});

const APPLY_FORM_DESIGN_PLAN_CONTRACT = defineResultContract({
  description: "Form design-plan preview or applied filesystem/import-gate result.",
  modes: ["plan", "apply"],
  schema: z
    .object({
      mode: z.enum(["dry-run", "apply"]),
      formName: z.string(),
      operationsApplied: z.array(z.unknown()),
      filesystemApplied: z.boolean(),
      importGate: z.enum(["not-run", "passed", "failed"]),
    })
    .loose(),
});

const CONTRACTS = {
  "query-read": defineResultContract({
    description: "Read-only SQL/query payload.",
    schema: queryReadPayload,
  }),
  "query-write": defineResultContract({
    description: "SQL/query maintenance result discriminated by plan or apply.",
    modes: ["plan", "apply"],
    schema: z.union([
      z.discriminatedUnion("mode", [
        z.object({ mode: z.literal("plan"), affectedCount: z.number().optional() }).loose(),
        z.object({ mode: z.literal("apply"), affectedCount: z.number().optional() }).loose(),
      ]),
      z.object({ dryRun: z.boolean() }).loose(),
    ]),
  }),
  "vba-read": defineResultContract({
    description: "Read-only VBA dispatch payload.",
    outputModes: ["summary", "file", "full"],
    schema: vbaReadPayload,
  }),
  "vba-write": defineResultContract({
    description: "VBA mutation result discriminated by plan or apply.",
    modes: ["plan", "apply"],
    schema: z.union([
      z.discriminatedUnion("mode", [
        z.object({ mode: z.literal("plan"), applied: stringArray.optional() }).loose(),
        z.object({ mode: z.literal("apply"), applied: stringArray.optional() }).loose(),
      ]),
      z.object({ ok: z.boolean() }).loose(),
      z.object({ dryRun: z.boolean() }).loose(),
    ]),
  }),
  "vba-export": defineResultContract({
    description: "VBA export result with executable plan/apply variants.",
    modes: ["plan", "apply"],
    outputModes: ["summary", "file", "full"],
    schema: z.union([
      z.discriminatedUnion("mode", [
        z.object({ mode: z.literal("plan"), exportedPaths: stringArray }).loose(),
        z.object({ mode: z.literal("apply"), exportedPaths: stringArray }).loose(),
      ]),
      z
        .object({
          ok: z.boolean(),
          exported: stringArray.optional(),
          binaryMutated: z.boolean().optional(),
        })
        .loose(),
    ]),
  }),
  "vba-test": defineResultContract({
    description: "VBA test execution result.",
    modes: ["plan", "apply"],
    schema: z.union([
      z
        .object({
          dryRun: z.literal(true),
          willExecute: z.literal(false),
          willModifyAccess: z.literal(false),
          plan: z
            .object({
              procedureName: z.array(z.string()),
              proceduresCount: z.number().int().nonnegative(),
              warnings: z.array(z.unknown()),
              errors: z.array(z.unknown()),
            })
            .loose(),
        })
        .loose(),
      z
        .object({
          mode: planApplyMode,
          passed: z.number().optional(),
          failed: z.number().optional(),
          tests: z.array(z.unknown()).optional(),
        })
        .loose(),
    ]),
  }),
  "verify-code": defineResultContract({
    description: "Source-to-binary drift report.",
    outputModes: ["summary", "full"],
    schema: z
      .object({
        operation: z.literal("verify_code"),
        ok: z.boolean(),
        dryRun: z.literal(true),
        willModifyAccess: z.literal(false),
        sourceRoot: z.string(),
        matched: z.array(z.unknown()),
        different: z.array(z.unknown()),
        missingInSource: z.array(z.unknown()),
        missingInBinary: z.array(z.unknown()),
        summary: passthroughObject.optional(),
        hasFunctionalDifferences: z.boolean().optional(),
        actionableOk: z.boolean().optional(),
        recommendedAction: z.string().optional(),
        bulkImportable: stringArray.optional(),
        bulkExportable: stringArray.optional(),
        vbeCacheNote: z.string(),
      })
      .loose(),
  }),
  "sync-binary": defineResultContract({
    description: "Binary synchronization workflow result.",
    modes: ["plan", "apply"],
    outputModes: ["summary", "full"],
    schema: z.union([
      z
        .object({
          ok: z.boolean(),
          dryRun: z.boolean(),
          preSync: passthroughObject,
          plan: z
            .object({
              toImport: stringArray,
              toExport: stringArray,
              skipped: z.array(z.unknown()),
              totalActionable: z.number().int().nonnegative(),
            })
            .loose(),
          execution: z.unknown().nullable(),
          postSync: z.unknown().nullable(),
          recommendation: z.string(),
        })
        .loose(),
      z.discriminatedUnion("mode", [
        z
          .object({
            mode: z.literal("plan"),
            direction: z.enum(["src-to-binary", "binary-to-src", "both"]),
            conflicts: stringArray.optional(),
          })
          .loose(),
        z
          .object({
            mode: z.literal("apply"),
            direction: z.enum(["src-to-binary", "binary-to-src"]),
            applied: stringArray.optional(),
            conflicts: stringArray.optional(),
          })
          .loose(),
      ]),
    ]),
  }),
} as const satisfies Record<DispatchResultFamily, AnyExecutableResultContract>;

export function deriveDispatchResultContract(
  family: DispatchResultFamily,
): AnyExecutableResultContract {
  return CONTRACTS[family];
}

export function resultContractForDispatchTool(
  name: GeneratedDispatchToolName,
): AnyExecutableResultContract {
  if (name === "vba_inline_execution") return VBA_INLINE_EXECUTION_CONTRACT;
  if (name === "fix_encoding") return FIX_ENCODING_CONTRACT;
  if (name === "delete_module") return DELETE_MODULE_CONTRACT;
  if (name === "generate_erd") return GENERATE_ERD_CONTRACT;
  if (name === "import_queries") return IMPORT_QUERIES_CONTRACT;
  if (name === "compact_repair") return COMPACT_REPAIR_CONTRACT;
  if (name === "relink_tables" || name === "localize_backend_links") return RELINK_TABLES_CONTRACT;
  if (name === "relink_directory") return RELINK_DIRECTORY_CONTRACT;
  if (name === "analyze_form_layout") return ANALYZE_FORM_LAYOUT_CONTRACT;
  if (name === "verify_form_bindings") return VERIFY_FORM_BINDINGS_CONTRACT;
  if (name === "apply_form_design_plan") return APPLY_FORM_DESIGN_PLAN_CONTRACT;
  return deriveDispatchResultContract(MCP_TOOL_ROUTES[name].resultFamily);
}

const ALIAS_CANONICAL_FAMILIES = {
  list_access_operations: "vba-read",
  cleanup_access_operation: "vba-write",
  run_vba: "vba-test",
  query_sql: "query-read",
  exec_sql: "query-write",
  run_script: "query-write",
  create_table: "query-write",
  drop_table: "query-write",
  seed_fixture: "query-write",
  teardown_fixture: "query-write",
} as const satisfies Record<AliasToolName, DispatchResultFamily>;

export function resultContractForToolAlias(name: AliasToolName): {
  canonicalFamily: DispatchResultFamily;
  contract: AnyExecutableResultContract;
  canonicalContract: AnyExecutableResultContract;
} {
  if (name === "run_vba") {
    return {
      canonicalFamily: "vba-test",
      contract: RUN_VBA_CONTRACT,
      canonicalContract: RUN_VBA_CONTRACT,
    };
  }
  if (name === "query_sql") {
    return {
      canonicalFamily: "query-read",
      contract: QUERY_SQL_CONTRACT,
      canonicalContract: QUERY_SQL_CONTRACT,
    };
  }
  const canonicalFamily = ALIAS_CANONICAL_FAMILIES[name];
  const canonicalContract = deriveDispatchResultContract(canonicalFamily);
  return { canonicalFamily, contract: canonicalContract, canonicalContract };
}
