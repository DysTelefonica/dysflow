import { z } from "zod";

import { defineResultContract } from "./result-contract.js";

const unknownRecord = z.record(z.string(), z.unknown());
const registryHealth = unknownRecord;

export const getCapabilitiesResultContract = defineResultContract({
  description: "Live adapter identity, project resolution, write gates, tools and workflows.",
  schema: z
    .object({
      adapterVersion: z.string(),
      surface: z.enum(["stdio", "http"]),
      writesProcess: z
        .object({ enabled: z.boolean(), resolverConfigured: z.boolean() })
        .passthrough(),
      writesProject: z.object({ allowWrites: z.boolean() }).passthrough(),
      projectIdResolution: z.object({
        projectId: z.string().nullable(),
        outcome: z.enum(["resolved", "unresolved", "ambiguous"]),
      }),
      projectConfig: unknownRecord.optional(),
      allowedProcedures: z.array(z.string()).optional(),
      dryRunDefault: z.boolean(),
      writeExecutionPolicy: z.enum(["safe-by-default", "developer"]),
      resultValidationPolicy: z.enum(["off", "report", "enforce"]),
      effectiveDryRunDefault: z.record(z.string(), z.boolean()),
      migrationNotes: unknownRecord,
      toolsVisible: z.number().int().nonnegative(),
      preferredAgentWorkflows: z.array(unknownRecord),
      writeClassToolsPermitted: z.array(z.string()),
      humanCompilePending: z.boolean(),
      documentationBundle: unknownRecord,
      tools: z.record(z.string(), unknownRecord),
    })
    .passthrough(),
});

export const schemaResultContract = defineResultContract({
  description: "Static tool catalog in compact or full form.",
  schema: z
    .object({ projectId: z.string().nullable(), tools: z.array(unknownRecord) })
    .passthrough(),
});

export const describeToolResultContract = defineResultContract({
  description: "One canonical tool's complete introspection projection.",
  schema: z
    .object({
      name: z.string(),
      description: z.string(),
      inputSchema: unknownRecord,
      parameters: z.record(z.string(), unknownRecord),
      params: z.record(z.string(), unknownRecord),
      returns: unknownRecord,
      resultContract: unknownRecord,
      errorCodes: z.array(unknownRecord),
      useCases: z.array(z.string()),
      crossReferences: z.array(z.string()),
    })
    .passthrough(),
});

export const resolveProjectResultContract = defineResultContract({
  description: "Discriminated project resolution plus its current project-config diagnosis.",
  schema: z.discriminatedUnion("outcome", [
    z.object({
      projectId: z.string(),
      outcome: z.literal("resolved"),
      reason: z.enum(["explicit id match", "single project config found"]),
      accessPath: z.string().nullable(),
      projectRoot: z.string().nullable(),
      sourceRoot: z.string().nullable(),
      projectConfig: unknownRecord,
    }),
    z.object({
      projectId: z.null(),
      outcome: z.literal("unresolved"),
      reason: z.enum(["project.json not found", "id mismatch", "unknown"]),
      accessPath: z.null(),
      projectRoot: z.null(),
      sourceRoot: z.null(),
      projectConfig: unknownRecord,
    }),
  ]),
});

export const diagnoseResultContract = defineResultContract({
  schema: z
    .object({
      projectConfig: unknownRecord,
      filesystem: unknownRecord,
      runtime: unknownRecord,
      checks: z.array(unknownRecord),
    })
    .strict(),
});

export const stateResultContract = defineResultContract({
  schema: z
    .object({
      operations: z.array(unknownRecord),
      markers: z.array(unknownRecord),
      locks: z.array(unknownRecord),
      counters: unknownRecord,
      orphans: z
        .object({
          msaccess: z.array(
            z
              .object({
                pid: z.number().int().positive(),
                ageSeconds: z.number().int().nonnegative().nullable(),
              })
              .strict(),
          ),
          scanStatus: z.enum(["ok", "unavailable"]),
          error: z.string().optional(),
        })
        .strict(),
    })
    .strict(),
});

export const logsResultContract = defineResultContract({
  schema: z
    .object({
      entries: z.array(unknownRecord),
      totalCount: z.number().int().nonnegative(),
      truncated: z.boolean(),
      aggregate: z
        .object({
          tools: z.array(unknownRecord),
          rejectedParams: z.array(unknownRecord),
          missingParams: z.array(unknownRecord),
        })
        .strict()
        .optional(),
    })
    .strict(),
});

export const listAccessOperationsResultContract = defineResultContract({
  schema: z.object({ operations: z.array(unknownRecord), registryHealth }).strict(),
});

export const cleanupAccessOperationResultContract = defineResultContract({
  modes: ["plan", "apply"],
  schema: z
    .object({
      cleanup: z.object({
        operationId: z.string(),
        accessPid: z.number().int().nullable(),
        status: z.literal("cleaned"),
      }),
      registryHealth,
    })
    .strict(),
});

const orphanCandidate = z
  .object({
    pid: z.number().int(),
    accessPath: z.string(),
    kind: z.enum(["access", "powershell-worker"]),
    startTime: z.string().optional(),
    ageSeconds: z.number().int().nonnegative().optional(),
    mainWindowHandle: z.number().optional(),
  })
  .strict();

export const orphanCleanupResultContract = defineResultContract({
  modes: ["plan", "apply"],
  schema: z.union([
    z
      .object({
        orphans: z.array(orphanCandidate),
        totalCount: z.number().int().nonnegative(),
      })
      .strict(),
    z
      .object({
        killed: z.array(z.number().int()),
        refused: z.array(z.object({ pid: z.number().int(), reason: z.string() }).strict()),
        syntheticOperationId: z.string().optional(),
        errors: z.array(z.object({ code: z.string(), message: z.string() }).strict()),
      })
      .strict(),
  ]),
});

export const cleanStaleMarkersResultContract = defineResultContract({
  modes: ["plan", "apply"],
  schema: z
    .object({
      ok: z.boolean(),
      scanned: z.number().int().nonnegative(),
      removed: z.number().int().nonnegative(),
      kept: z.number().int().nonnegative(),
      removedMarkerIds: z.array(z.string()),
      keptMarkerIds: z.array(z.string()),
      errors: z.array(z.object({ markerId: z.string(), error: z.string() }).strict()),
    })
    .strict(),
});

export const setupProjectResultContract = defineResultContract({
  modes: ["plan", "apply"],
  description: "Resolved project-config plan or atomic publication result.",
  schema: z.union([
    z
      .object({
        ok: z.literal(true),
        mode: z.literal("plan"),
        dryRun: z.literal(true),
        willWrite: z.literal(true),
        configPath: z.string(),
        resolvedConfig: unknownRecord,
        warnings: z.array(z.string()),
      })
      .strict(),
    z
      .object({
        ok: z.literal(true),
        mode: z.literal("apply"),
        dryRun: z.literal(false),
        configPath: z.string(),
        writtenFields: z.array(z.string()),
      })
      .strict(),
  ]),
});

// Issue #1177 — `migrate_project_config` result contract. The success
// branch carries the full diff preview (current / proposed / diff /
// remediation) plus an `applied` flag; the error branch is a typed
// envelope so consumers can branch on `outcome` instead of catching.
const migrateRemediationEntry = z
  .object({
    field: z.string(),
    from: z.string(),
    to: z.string(),
    reason: z.string(),
  })
  .strict();

const migrateSuccess = z
  .object({
    outcome: z.literal("ok"),
    configPath: z.string(),
    current: unknownRecord,
    proposed: unknownRecord,
    diff: z.string(),
    remediation: z.array(migrateRemediationEntry),
    applied: z.boolean(),
  })
  .strict();

const migrateError = z
  .object({
    outcome: z.literal("error"),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        remediation: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export const migrateProjectConfigResultContract = defineResultContract({
  modes: ["plan", "apply"],
  schema: z.discriminatedUnion("outcome", [migrateSuccess, migrateError]),
});

export const bootstrapRecoveryResultContracts = {
  get_capabilities: getCapabilitiesResultContract,
  schema: schemaResultContract,
  describe_tool: describeToolResultContract,
  resolve_project: resolveProjectResultContract,
  diagnose: diagnoseResultContract,
  state: stateResultContract,
  logs: logsResultContract,
  list_access_operations: listAccessOperationsResultContract,
  cleanup_access_operation: cleanupAccessOperationResultContract,
  access_force_cleanup_orphaned: orphanCleanupResultContract,
  clean_stale_markers: cleanStaleMarkersResultContract,
  setup_project: setupProjectResultContract,
  migrate_project_config: migrateProjectConfigResultContract,
} as const;
