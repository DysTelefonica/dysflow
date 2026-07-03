/**
 * #674 — AllowedProceduresResolver: per-input allowlist resolution.
 *
 * The MCP gate (canonical-handlers.ts:ensureProcedureAllowed) used a
 * frozen `allowedProcedures` array captured at MCP server startup. That
 * let a caller pass the gate with project A's allowlist and execute
 * against project B's binary — cross-project leak.
 *
 * The resolver receives the input and returns the allowlist of the project
 * the input targets (resolved via the same loadDysflowConfig path the
 * rest of the dispatcher uses). The legacy array form is preserved as a
 * fast path for callers that already have a single-project server.
 */

import type { OperationResult } from "../../core/contracts/index.js";

export type AllowedProcedures =
  | readonly string[]
  | ((
      input: unknown,
    ) => Promise<readonly string[] | undefined> | OperationResult<readonly string[] | undefined>);

export type ResolvedAllowedProcedures = readonly string[] | undefined;

export async function resolveAllowedProceduresFor(
  allowed: AllowedProcedures | undefined,
  input: unknown,
): Promise<ResolvedAllowedProcedures> {
  if (allowed === undefined) return undefined;
  // Discriminate: arrays are frozen values, functions are resolvers. The
  // type union makes `allowed(input)` ambiguous (TypeScript can't tell which
  // branch the call would land on) so we narrow by checking the runtime tag
  // explicitly.
  if (typeof allowed === "function") {
    try {
      const result = await (allowed as Exclude<AllowedProcedures, readonly string[]>)(input);
      // Allow either a direct value or an OperationResult envelope (so the
      // resolver can surface CONFIG_* errors via the failureResult path).
      if (result && typeof result === "object" && "ok" in result) {
        return result.ok ? result.data : undefined;
      }
      return result as ResolvedAllowedProcedures;
    } catch {
      // The resolver MUST NOT crash the gate. Fall back to undefined
      // (default-deny) so a misconfigured resolver still refuses execution
      // instead of letting it through.
      return undefined;
    }
  }
  return allowed as ResolvedAllowedProcedures;
}
