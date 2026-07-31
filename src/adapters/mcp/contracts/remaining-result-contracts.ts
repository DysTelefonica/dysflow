import { z } from "zod";

import { defineResultContract, type ExecutableResultContract } from "./result-contract.js";

const procedureEntrySchema = z
  .object({
    name: z.string(),
    kind: z.enum(["Sub", "Function", "Property"]),
    visibility: z.enum(["Public", "Private", "Friend", "Static", ""]),
    line: z.number().int().positive(),
  })
  .passthrough();

const referenceEntrySchema = z
  .object({
    module: z.string(),
    kind: z.enum(["Sub", "Function", "Property", "module"]),
    line: z.number().int().positive(),
    context: z.string(),
  })
  .passthrough();

const diagnosticSchema = z
  .object({
    rule: z.string(),
    line: z.number().int(),
    severity: z.enum(["error", "warning"]),
    code: z.string().optional(),
    message: z.string(),
  })
  .passthrough();

export const queryExecuteResultContract = defineResultContract({
  description: "Access SQL read rows or write outcome.",
  modes: ["plan", "apply"],
  schema: z
    .object({
      rows: z.array(z.record(z.string(), z.unknown())).optional(),
      affectedRows: z.number().int().nonnegative().optional(),
      resolvedAccessPath: z.string().optional(),
    })
    .passthrough(),
});

export const doctorResultContract = defineResultContract({
  description: "Core project and environment diagnostic checks.",
  schema: z.object({ checks: z.array(z.unknown()) }).passthrough(),
});

export const listProceduresResultContract = defineResultContract({
  description: "VBA procedure catalog for one module.",
  schema: z.object({ module: z.string(), procedures: z.array(procedureEntrySchema) }).passthrough(),
});

export const getProcedureResultContract = defineResultContract({
  description: "One VBA procedure's source range and verbatim body.",
  schema: z
    .object({
      module: z.string(),
      procedure: z.string(),
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
      body: z.string(),
    })
    .passthrough(),
});

export const findReferencesResultContract = defineResultContract({
  description: "Paginated VBA symbol references, including source/binary differences in all scope.",
  schema: z.discriminatedUnion("scope", [
    z
      .object({
        symbol: z.string(),
        scope: z.literal("all"),
        references: z.array(referenceEntrySchema),
        totalCount: z.number().int().nonnegative(),
        truncated: z.boolean(),
        nextOffset: z.number().int().nonnegative().nullable(),
        sourceReferences: z.array(referenceEntrySchema),
        binaryReferences: z.array(referenceEntrySchema),
        hasDifferences: z.boolean(),
        differences: z.object({
          onlyInSource: z.array(referenceEntrySchema),
          onlyInBinary: z.array(referenceEntrySchema),
        }),
      })
      .passthrough(),
    z
      .object({
        symbol: z.string(),
        scope: z.enum(["module", "binary", "source"]),
        references: z.array(referenceEntrySchema),
        totalCount: z.number().int().nonnegative(),
        truncated: z.boolean(),
        nextOffset: z.number().int().nonnegative().nullable(),
      })
      .passthrough(),
  ]),
});

export const detectDeadCodeResultContract = defineResultContract({
  description: "Dead VBA procedure and declaration findings with evidence and risk summary.",
  schema: z
    .object({
      scope: z.enum(["binary", "source", "module"]),
      module: z.string().optional(),
      scannedModules: z.array(z.string()),
      scannedAt: z.string(),
      findings: z.array(
        z
          .object({
            symbol: z.string(),
            module: z.string(),
            kind: z.enum(["sub", "function", "property", "declaration"]),
            line: z.number().int().positive(),
            evidence: z.object({
              scannedModules: z.array(z.string()),
              referenceCount: z.number().int().nonnegative(),
              definitionSnippet: z.string(),
            }),
            risk: z.enum(["Low", "Med", "High"]),
          })
          .passthrough(),
      ),
      summary: z.object({
        total: z.number().int().nonnegative(),
        low: z.number().int().nonnegative(),
        med: z.number().int().nonnegative(),
        high: z.number().int().nonnegative(),
      }),
    })
    .passthrough(),
});

export const validateManifestResultContract = defineResultContract({
  description: "VBA test-manifest validity, diagnostics, allowlist drift and counts.",
  schema: z
    .object({
      valid: z.boolean(),
      errors: z.array(z.unknown()),
      warnings: z.array(z.unknown()),
      invalid: z.array(z.unknown()),
      summary: z
        .object({
          totalTests: z.number().int().nonnegative(),
          validTests: z.number().int().nonnegative(),
          errorCount: z.number().int().nonnegative(),
          warningCount: z.number().int().nonnegative(),
          invalidCount: z.number().int().nonnegative(),
        })
        .passthrough(),
    })
    .passthrough(),
});

export const lintModuleResultContract = defineResultContract({
  description: "Per-rule and flat VBA lint diagnostics with an aggregate summary.",
  schema: z
    .object({
      module: z.string(),
      rules: z.array(z.string()),
      isClean: z.boolean(),
      diagnostics: z.record(z.string(), z.array(diagnosticSchema)),
      flatDiagnostics: z.array(diagnosticSchema),
      summary: z.object({
        errors: z.number().int().nonnegative(),
        warnings: z.number().int().nonnegative(),
      }),
    })
    .passthrough(),
});

/**
 * Canonical ownership map for bespoke modern analysis handlers. Coverage derives
 * from MODERN_ANALYSIS_TOOL_NAMES; consumers must not maintain another name list.
 */
export const REMAINING_RESULT_CONTRACTS = {
  list_procedures: listProceduresResultContract,
  get_procedure: getProcedureResultContract,
  find_references: findReferencesResultContract,
  detect_dead_code: detectDeadCodeResultContract,
  validate_manifest: validateManifestResultContract,
  lint_module: lintModuleResultContract,
} as const satisfies Record<string, ExecutableResultContract>;

export function remainingResultContractForTool(name: string): ExecutableResultContract | undefined {
  return REMAINING_RESULT_CONTRACTS[name as keyof typeof REMAINING_RESULT_CONTRACTS];
}
