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

const CONTRACTS = {
  "query-read": defineResultContract({
    description: "Read-only SQL/query payload.",
    schema: passthroughObject,
  }),
  "query-write": defineResultContract({
    description: "SQL/query maintenance result discriminated by plan or apply.",
    modes: ["plan", "apply"],
    schema: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("plan"), affectedCount: z.number().optional() }).loose(),
      z.object({ mode: z.literal("apply"), affectedCount: z.number().optional() }).loose(),
    ]),
  }),
  "vba-read": defineResultContract({
    description: "Read-only VBA dispatch payload.",
    outputModes: ["summary", "file", "full"],
    schema: passthroughObject,
  }),
  "vba-write": defineResultContract({
    description: "VBA mutation result discriminated by plan or apply.",
    modes: ["plan", "apply"],
    schema: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("plan"), applied: stringArray.optional() }).loose(),
      z.object({ mode: z.literal("apply"), applied: stringArray.optional() }).loose(),
    ]),
  }),
  "vba-export": defineResultContract({
    description: "VBA export result with executable plan/apply variants.",
    modes: ["plan", "apply"],
    outputModes: ["summary", "file", "full"],
    schema: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("plan"), exportedPaths: stringArray }).loose(),
      z.object({ mode: z.literal("apply"), exportedPaths: stringArray }).loose(),
    ]),
  }),
  "vba-test": defineResultContract({
    description: "VBA test execution result.",
    modes: ["plan", "apply"],
    schema: z
      .object({
        mode: planApplyMode,
        passed: z.number().optional(),
        failed: z.number().optional(),
        tests: z.array(z.unknown()).optional(),
      })
      .loose(),
  }),
  "verify-code": defineResultContract({
    description: "Source-to-binary drift report.",
    outputModes: ["summary", "full"],
    schema: z
      .object({
        driftDetected: z.boolean(),
        summary: z
          .object({
            total: z.number(),
            inSync: z.number(),
            sourceOnly: z.number(),
            binaryOnly: z.number(),
            diverged: z.number(),
          })
          .loose(),
        bulkImportable: stringArray.optional(),
        bulkExportable: stringArray.optional(),
        conflicts: stringArray.optional(),
      })
      .loose(),
  }),
  "sync-binary": defineResultContract({
    description: "Binary synchronization workflow result.",
    modes: ["plan", "apply"],
    outputModes: ["summary", "full"],
    schema: z.discriminatedUnion("mode", [
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
  const canonicalFamily = ALIAS_CANONICAL_FAMILIES[name];
  const canonicalContract = deriveDispatchResultContract(canonicalFamily);
  return { canonicalFamily, contract: canonicalContract, canonicalContract };
}
