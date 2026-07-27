/**
 * Issue #1169 — uniform destinationRoot override contract for every
 * write-class tool.
 *
 * The seven write-class tools that read or write managed source files
 * (`export_modules`, `export_all`, `import_modules`, `import_all`,
 * `sync_binary`, `form_deserialize`, `form_serialize`) MUST honor a
 * caller-supplied `params.destinationRoot` for the duration of the call
 * and surface the EFFECTIVE path used in the success envelope. The
 * helper in this file is the single chokepoint that derives the
 * effective value and stamps the result data with the two stable
 * contract fields:
 *
 *   - `resolvedDestinationRoot` — the actual destinationRoot used
 *     (override, configured, projectRoot, or cwd fallback).
 *   - `destinationRootSource` — provenance tag, one of
 *     `"override" | "config" | "projectRoot" | "cwd" | "default"`.
 *
 * Both fields are uniform across the seven tools, so a consumer can
 * audit the resolution with the same shape no matter which entry point
 * produced the result.
 */
import type { OperationResult } from "../../core/contracts/index.js";
import { stringValue } from "../../core/utils/index.js";

/**
 * Stable set of provenance tags. The contract is additive: future
 * resolutions extend the union but never rename an existing member.
 */
export type DestinationRootSource = "override" | "config" | "projectRoot" | "cwd" | "default";

export type DestinationRootResolution = {
  resolved: string;
  source: DestinationRootSource;
};

/**
 * Issue #1169 — the canonical set of write-class tools that MUST surface
 * `resolvedDestinationRoot` and `destinationRootSource` on their success
 * envelope. Read-class tools (`list_objects`, `verify_code`, `exists`,
 * `list_vba_modules`, `vba_orphan_audit`, ...) keep their exact prior
 * shape untouched. Centralized here so the contract surface is
 * discoverable from one place — adapters import this set instead of
 * declaring local copies that drift out of sync.
 */
export const DESTINATION_ROOT_WRITE_TOOLS = new Set<string>([
  "export_modules",
  "export_all",
  "import_modules",
  "import_all",
  "delete_module",
  "sync_binary",
  "form_serialize",
  "form_deserialize",
]);

/**
 * The minimum surface of the orchestrator this helper depends on.
 * Declared structurally so the helper can be invoked through any
 * object that exposes `env`, `cwd`, and `resolveExecutionTarget` (the
 * `VbaSyncAdapter` and the modules / forms orchestrators all satisfy
 * this shape). The `resolveExecutionTarget` return type is kept loose
 * (`OperationResult<unknown>`) because each orchestrator returns its own
 * target shape; the helper casts internally to read the two fields it
 * needs (`destinationRoot`, `projectRoot`) without forcing every caller
 * to declare the same shape.
 */
export type DestinationRootOrchestratorLike = {
  env?: Record<string, string | undefined>;
  cwd: string;
  destinationRoot?: string;
  resolveExecutionTarget(params: Record<string, unknown>): Promise<OperationResult<unknown>>;
};

type ResolvedTargetShape = {
  destinationRoot?: unknown;
  projectRoot?: unknown;
};

/**
 * Resolve the effective destinationRoot for a given call and tag the
 * provenance. Pure async helper — the orchestrator does the real
 * config / project.json lookup, this just layers the override-
 * precedence on top and classifies the result so the consumer can audit
 * the resolution without re-running the resolver.
 *
 * Precedence (highest first):
 *
 *   1. `params.destinationRoot`     → `"override"`
 *   2. configured `destinationRoot` → `"config"`
 *   3. configured `projectRoot`      → `"projectRoot"`
 *   4. orchestrator `cwd`           → `"cwd"`
 *
 * The orchestrator already implements the same precedence; the helper
 * just classifies the returned value against the orchestrator's
 * surface so the source tag is stable and machine-parseable.
 */
export async function resolveDestinationRoot(
  params: Record<string, unknown>,
  orchestrator: DestinationRootOrchestratorLike,
): Promise<DestinationRootResolution> {
  const override = stringValue(params.destinationRoot);
  if (override !== undefined) {
    return { resolved: override, source: "override" };
  }
  const target = await orchestrator.resolveExecutionTarget(params);
  if (!target?.ok) {
    // Resolution failed or the orchestrator returned an undefined /
    // non-OperationResult value (e.g. a vi.fn() stub in unit tests).
    // Report a stable sentinel so the consumer never has to null-check
    // the field. The default falls back to the orchestrator's cwd,
    // mirroring the resolver's own fallback.
    return { resolved: orchestrator.cwd, source: "default" };
  }
  const data = (target.data ?? {}) as ResolvedTargetShape;
  const resolvedRoot = stringValue(data.destinationRoot) ?? orchestrator.cwd;
  const projectRoot = stringValue(data.projectRoot);
  return classifyResolved(resolvedRoot, orchestrator, projectRoot);
}

function classifyResolved(
  resolved: string,
  orchestrator: DestinationRootOrchestratorLike,
  projectRoot: string | undefined,
): DestinationRootResolution {
  // The configured `destinationRoot` (passed into the orchestrator
  // constructor) is the strongest non-override signal. When the
  // resolved value matches it, tag as `"config"` even if the
  // orchestrator also projected the same value as `projectRoot` (the
  // #1169 follow-along fix made projectRoot fall back to the override
  // destinationRoot, so a configured-root projectRoot is also a
  // configured-root destinationRoot).
  const configured = orchestrator.destinationRoot;
  if (configured !== undefined && resolved === configured) {
    return { resolved, source: "config" };
  }
  if (projectRoot !== undefined && resolved === projectRoot) {
    return { resolved, source: "projectRoot" };
  }
  if (resolved === orchestrator.cwd) {
    return { resolved, source: "cwd" };
  }
  return { resolved, source: "default" };
}

/**
 * Stamp the success envelope with `resolvedDestinationRoot` and
 * `destinationRootSource`. Failure envelopes are returned unchanged
 * (the override is irrelevant when the call did not run). The original
 * `data` object is preserved — the helper never drops or overwrites
 * caller-supplied fields, it only ADDS the two contract fields. If the
 * data already carries the same key, the helper's value wins (this is
 * the contract: the helper is the single source of truth for the two
 * contract fields).
 */
export async function withResolvedDestinationRoot<T>(
  result: OperationResult<T>,
  params: Record<string, unknown>,
  orchestrator: DestinationRootOrchestratorLike,
): Promise<OperationResult<T>> {
  if (!result.ok) return result;
  const resolution = await resolveDestinationRoot(params, orchestrator);
  const data = (result.data ?? {}) as Record<string, unknown>;
  return {
    ...result,
    data: {
      ...data,
      resolvedDestinationRoot: resolution.resolved,
      destinationRootSource: resolution.source,
    },
  } as OperationResult<T>;
}
