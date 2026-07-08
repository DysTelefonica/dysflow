/**
 * Issue #785 (v2.1.1) — write-execution dispatch seam.
 *
 * Centralizes the two adjustments the dispatch layer applies on top of a
 * caller-supplied payload before forwarding to the VBA-sync adapter:
 *
 * 1. `resolveEffectiveDryRunInput` — when the caller did not pass `dryRun`
 *    AND did not pass `apply`, inject the policy-driven effective default
 *    (`dryRun: false` in `developer` mode for `routine-dev-write` tools;
 *    `dryRun: true` everywhere else). Explicit caller intent is preserved
 *    verbatim — a caller can always force execution with `dryRun: false` /
 *    `apply: true` or a dry-run with `dryRun: true`, regardless of policy.
 *
 * 2. `requiresExportSourceConfirmation` — when the policy yields
 *    `requiresConfirmOverwriteSource === true` (i.e. `developer` mode for
 *    a `destructive-write` tool), the export-source guard checks that the
 *    caller's export destination does NOT overlap the project's active
 *    source root unless `confirmOverwriteSource: true` is passed.
 *
 * Both helpers are pure and dependency-free; they consume the v2.1.0
 * foundation (`resolveWriteExecutionPolicy`, `effectiveDryRunDefaultForTool`)
 * without mutating it.
 *
 * The dispatch seam lives in `src/adapters/mcp/` because it consumes
 * adapter-layer route metadata (`MCP_TOOL_ROUTES`, `MCP_TOOL_RISKS`) and
 * its output is fed into the dispatch handler. The pure resolver stays
 * in `src/core/runtime/` — this helper is a thin policy-application layer
 * over that resolver.
 */

import { resolveRiskForTool, effectiveDryRunDefaultForTool } from "./mcp-tool-risks.js";
import { pathOverlapsSourceRoot } from "../../core/utils/path-overlap.js";
import {
  resolveWriteExecutionPolicy,
  type WriteExecutionPolicy,
} from "../../core/runtime/write-execution-policy.js";

// ─── (1) Dry-run default injection ──────────────────────────────────────────

/**
 * Tools whose dispatch behavior intentionally never consults the per-tool
 * dryRun default. These have service-level default plans ("always plan by
 * default") that the policy helper must NOT flatten — the dispatch keeps
 * relying on the explicit caller intent (`dryRun: false` / `apply: true`)
 * for these tools, and the absence of those flags falls through to the
 * existing service-level plan path.
 *
 * The list mirrors the dispatch-factory's `isDryRunCapableBinaryWrite`
 * guard plus `catalog_add_control` and `generate_form` (the form mutation
 * family + the catalog/form generation surface).
 */
const POLICY_EXEMPT_TOOLS: ReadonlySet<string> = new Set([
  "form_add_control",
  "form_move_control",
  "form_rename_control",
  "form_deserialize",
  "create_form_from_template",
  "catalog_add_control",
  "generate_form",
]);

/**
 * Returns a (possibly shallow-copied) input object with the policy-driven
 * `dryRun` default applied. Pure:
 *   - Caller intent (`dryRun` or `apply` key present) is preserved verbatim.
 *   - Non-object / null / undefined inputs return verbatim.
 *   - Form mutation / catalog family (`POLICY_EXEMPT_TOOLS`) returns the
 *     input verbatim regardless of mode.
 *   - Otherwise, the helper injects `dryRun: <effective>` where
 *     `effective` comes from `effectiveDryRunDefaultForTool`.
 *
 * The original object is preserved when no injection is needed so callers
 * that pass a frozen object see a clone only when the policy actually
 * flipped the default.
 */
export function resolveEffectiveDryRunInput(
  toolName: string,
  mode: WriteExecutionPolicy,
  input: unknown,
): unknown {
  if (typeof input !== "object" || input === null) return input;
  const record = input as Record<string, unknown>;
  // Explicit caller intent — must not be overridden.
  if (Object.hasOwn(record, "dryRun") || Object.hasOwn(record, "apply")) return record;
  if (POLICY_EXEMPT_TOOLS.has(toolName)) return record;
  // Unknown tools: skip injection. The dispatcher rejects unknown tool
  // names well before reaching this helper, so this branch is defensive.
  if (resolveRiskForTool(toolName) === undefined) return record;

  const effective = effectiveDryRunDefaultForTool(toolName, mode);
  return { ...record, dryRun: effective };
}

// ─── (2) Export-source guard payload ────────────────────────────────────────

/**
 * Structured refusal returned by `requiresExportSourceConfirmation`. Designed
 * to be translated 1:1 into the `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION`
 * MCP envelope by the dispatch handler (see `dispatch-common.ts`).
 *
 * The shape is intentionally additive — new fields can be added without
 * breaking consumers that read the existing ones.
 */
export type ExportSourceConfirmationRefusal = {
  code: "EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION";
  message: string;
  toolName: string;
  destination: string;
  sourceRoot: string;
  /** A human-readable remediation hint the dispatch layer surfaces verbatim. */
  remediation: string;
};

/**
 * Resolved paths the dispatch layer passes into the guard.
 *
 * `destination` is the path the export would write to (caller's
 * `exportPath` override, project `destinationRoot`, or `undefined` when
 * the project has no resolved root yet). `sourceRoot` is the active
 * project source root — the same string that backs `resolveEffectiveDryRunInput`'s
 * sibling files.
 */
export type ExportSourceGuardPaths = {
  destination: string | undefined;
  sourceRoot: string | undefined;
};

/**
 * Returns a structured refusal when:
 *   - The tool is `destructive-write` AND mode is `developer` (so the
 *     policy yields `requiresConfirmOverwriteSource === true`), AND
 *   - The call is in execute mode (caller passed `dryRun: false` or
 *     `apply: true`, or the policy default set `dryRun: false` for the
 *     tool — here `destructive-write` defaults to `dryRun: true`, so
 *     execute mode is gated on explicit caller intent), AND
 *   - The resolved destination overlaps the active source root (Windows-
 *     aware, via `pathOverlapsSourceRoot`), AND
 *   - The caller did NOT pass `confirmOverwriteSource: true`.
 *
 * Returns `undefined` when the guard does not fire. Returning `undefined`
 * (not `null`) lets the dispatch handler short-circuit on the truthy check
 * without risking a `null === undefined` confusion.
 */
export function requiresExportSourceConfirmation(
  toolName: string,
  mode: WriteExecutionPolicy,
  input: unknown,
  paths: ExportSourceGuardPaths,
): ExportSourceConfirmationRefusal | undefined {
  const record = isRecord(input) ? input : null;
  if (record === null) return undefined;

  const risk = resolveRiskForTool(toolName);
  if (risk === undefined) return undefined;
  const resolved = resolveWriteExecutionPolicy({ mode, risk });
  if (!resolved.requiresConfirmOverwriteSource) return undefined;

  // Only enforce the guard on tools that actually carry a destination
  // (export_modules / export_all today; future destructive writers may
  // opt in). The dispatch layer short-circuits before reaching this
  // helper for non-vba-sync routes, so the check is defensive.
  if (toolName !== "export_modules" && toolName !== "export_all") return undefined;

  // Explicit confirmation bypasses the guard (the caller accepts the
  // overwrite risk on top of the policy and write-gate permits).
  // Issue #785 acceptance criteria — the guard fires regardless of
  // dryRun/apply; the dispatch seam surfaces the refusal before any
  // plan or commit begins. `safe-by-default` mode never reaches this
  // branch (handled by `requiresConfirmOverwriteSource === false`
  // above).
  if (record.confirmOverwriteSource === true) return undefined;

  const destination = typeof paths.destination === "string" ? paths.destination : undefined;
  const sourceRoot = typeof paths.sourceRoot === "string" ? paths.sourceRoot : undefined;
  if (destination === undefined || sourceRoot === undefined) return undefined;
  if (!pathOverlapsSourceRoot(destination, sourceRoot)) return undefined;

  const remediation =
    `Refusing ${toolName}: destination ${destination} overlaps the project's active source root (${sourceRoot}). ` +
    `Pass confirmOverwriteSource: true to confirm the overwrite, or point exportPath / destinationRoot outside the project's source tree.`;
  return {
    code: "EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION",
    message: remediation,
    toolName,
    destination,
    sourceRoot,
    remediation,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
