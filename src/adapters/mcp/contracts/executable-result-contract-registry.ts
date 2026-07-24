import { ALIAS_TOOL_NAMES, type AliasToolName } from "../alias-tools.js";
import { type GeneratedDispatchToolName, MCP_TOOL_ROUTES } from "../dispatch-routes.js";
import { bootstrapRecoveryResultContracts } from "./bootstrap-result-contracts.js";
import {
  resultContractForDispatchTool,
  resultContractForToolAlias,
} from "./dispatch-result-contracts.js";
import {
  doctorResultContract,
  queryExecuteResultContract,
  remainingResultContractForTool,
} from "./remaining-result-contracts.js";
import type { AnyExecutableResultContract } from "./result-contract.js";

/**
 * Resolves the executable contract owned by a canonical tool registration.
 * This is intentionally a derived lookup: payload schemas stay in their
 * bootstrap, dispatch-family, and bespoke tool definitions.
 */
export function executableResultContractForTool(
  name: string,
): AnyExecutableResultContract | undefined {
  const bootstrap =
    bootstrapRecoveryResultContracts[name as keyof typeof bootstrapRecoveryResultContracts];
  if (bootstrap !== undefined) return bootstrap;
  if (name === "query_execute") return queryExecuteResultContract;
  if (name === "doctor") return doctorResultContract;
  if ((ALIAS_TOOL_NAMES as ReadonlySet<string>).has(name)) {
    return resultContractForToolAlias(name as AliasToolName).contract;
  }
  if (Object.hasOwn(MCP_TOOL_ROUTES, name)) {
    return resultContractForDispatchTool(name as GeneratedDispatchToolName);
  }
  return remainingResultContractForTool(name);
}
