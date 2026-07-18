/**
 * Round-12 #972 — explain mode + uniform ErrorEnvelope.
 *
 * The explain mode adds a `decisionTree` to the error response when the
 * caller passes `explain: true` on any tool call. The tree has ≥3 steps:
 *
 *   1. The failed check (result: FAIL) — what was being verified.
 *   2. The root-cause hypothesis (result: LIKELY) — the most likely cause.
 *   3. The remediation (text) — what the caller should do next.
 *
 * The decision tree is derived from the error code + the diagnostic
 * evidence so an AI agent can read the response and act without
 * re-deriving the cause from first principles.
 *
 * Pure functions. No filesystem, no I/O. Tests pin each code's tree.
 */

import type { DysflowError, OperationResult } from "../../core/contracts/index.js";

/**
 * A single step in the explain-mode `decisionTree`. Step numbers are
 * 1-based; the first step is always the FAILED check. Subsequent steps
 * describe root-cause hypotheses and remediation actions.
 */
export type ExplainDecisionTreeStep = {
  /** 1-based step number. Step 1 is always the failed check (FAIL). */
  step: number;
  /** The check or hypothesis being made. */
  check: string;
  /**
   * The outcome of this step.
   *   - `FAIL`     — the check did not pass (root failure).
   *   - `LIKELY`   — root-cause hypothesis under the failure.
   *   - `PASS`     — succeeded (only used in chained checks, e.g. "did
   *                  we retry with `allowExternalAccessPath:true`?").
   */
  result: "FAIL" | "LIKELY" | "PASS";
  /** Concrete observation the agent can verify (path, value, status). */
  evidence: string;
  /** Optional remediation text — present on the leaf step (last step). */
  remediation?: string;
};

export type ExplainObject = {
  /** Human-readable summary of what went wrong. */
  summary: string;
  /** ≥3 steps: failed check, root-cause hypothesis, remediation. */
  decisionTree: readonly ExplainDecisionTreeStep[];
};

/**
 * Typed input for {@link buildExplainObject}. Loosened to allow both
 * `OperationResult.error.code/message` AND a loose object literal so the
 * helper is callable from every envelope source (MCP gate helpers,
 * `translateCoreResultToMcpContent`, etc.) without forcing each caller
 * to wrap their error in a specific shape.
 */
export type ExplainInput = {
  code: string;
  message: string;
  remediation?: string;
  /** Optional details from `core.error.details` to enrich the evidence. */
  details?: Record<string, unknown>;
};

export type ExplainDecisionTree = readonly ExplainDecisionTreeStep[];

// ─── relatedIssueNumbers lookup ──────────────────────────────────────────────

/**
 * Every canonical MCP error code → related issue numbers. Sourced from
 * issue #962 (error codes taxonomy) + the historical issues that first
 * introduced each code (#659 gate envelopes, #757 F4/F6, #785 source
 * guard, #941 form-property catalog). New codes MUST add an entry here
 * so consumers can grep related PRs from the envelope alone.
 */
export const RELATED_ISSUE_NUMBERS: Readonly<Record<string, readonly string[]>> = {
  // #962 — gate envelope taxonomy
  PROJECT_CONFIG_NOT_WRITE_READY: ["#962"],
  DESTINATION_ROOT_NOT_FOUND: ["#962"],
  OUTSIDE_PROJECT_ROOT: ["#962"],
  WRITE_LOCKED_BY_RUNNING_OP: ["#962"],
  CAPABILITIES_DISALLOW_WRITE: ["#962", "#659"],
  PROJECT_ID_MISMATCH: ["#962"],
  // #659 — gate envelope pattern
  MCP_WRITES_DISABLED: ["#659"],
  MCP_PROCEDURE_NOT_ALLOWED: ["#659"],
  // #757 — flag-rejection remediation + allowlist-not-configured
  MCP_INPUT_INVALID: ["#757"],
  MCP_ALLOWLIST_NOT_CONFIGURED: ["#757"],
  // #785 — export-source guard
  EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION: ["#785"],
  // #941 — form-property catalog
  FORM_UNKNOWN_PROPERTY: ["#941"],
  FORM_PROPERTY_VALUE_INVALID: ["#941"],
};

/**
 * Fallback bucket for codes not yet in the catalog. Every code
 * inherits at minimum its own introducing PR (`#972`) so consumers
 * always see SOMETHING.
 */
const FALLBACK_RELATED_ISSUES: readonly string[] = ["#972"];

export function relatedIssueNumbersForCode(code: string): readonly string[] {
  return RELATED_ISSUE_NUMBERS[code] ?? FALLBACK_RELATED_ISSUES;
}

// ─── Decision tree builders per code ─────────────────────────────────────────

function explainDestinationRootNotFound(input: ExplainInput): ExplainObject {
  const destinationRoot =
    typeof input.details?.destinationRoot === "string"
      ? (input.details.destinationRoot as string)
      : "<configured-destinationRoot>";
  return {
    summary: "destinationRoot directory does not exist on disk.",
    decisionTree: [
      {
        step: 1,
        check: `destinationRoot directory exists at '${destinationRoot}'`,
        result: "FAIL",
        evidence: `fs.existsSync('${destinationRoot}') === false`,
      },
      {
        step: 2,
        check: "Did a recent `git rm -r` or move operation drop this directory?",
        result: "LIKELY",
        evidence:
          "destinationRoot missing after a clean checkout, a `git rm -r`, or a directory rename in the repo.",
      },
      {
        step: 3,
        check: "Re-create the destinationRoot directories and retry the write.",
        result: "LIKELY",
        evidence:
          "After `mkdir -p`, the next write should succeed without re-firing this envelope.",
        remediation:
          input.remediation ??
          `mkdir -p '${destinationRoot}/classes' '${destinationRoot}/modules' '${destinationRoot}/forms' and retry the write.`,
      },
    ],
  };
}

function explainOutsideProjectRoot(input: ExplainInput): ExplainObject {
  const target =
    typeof input.details?.accessPath === "string"
      ? (input.details.accessPath as string)
      : "<target>";
  return {
    summary: "target path is outside the owning worktree.",
    decisionTree: [
      {
        step: 1,
        check: `target '${target}' is contained in the active worktree's projectRoot`,
        result: "FAIL",
        evidence:
          "canonical(target) is not under canonical(projectRoot) — either the accessPath/destinationRoot override points outside, or the configured paths do not match.",
      },
      {
        step: 2,
        check: "Is this a sibling-worktree reference without the proper sibling canonicalization?",
        result: "LIKELY",
        evidence:
          "Real sibling worktrees are recognized only when lexical(target) === canonical(target) (Windows reparse points fall through).",
      },
      {
        step: 3,
        check: "Move the target under a worktree's projectRoot, or update .dysflow/project.json.",
        result: "LIKELY",
        evidence:
          "After the path resolves under a known worktree root, this envelope will not fire again.",
        remediation:
          input.remediation ??
          "Run `dysflow doctor --cwd <target-parent>` from the target's worktree, or fix `.dysflow/project.json` so paths agree.",
      },
    ],
  };
}

function explainWriteLockedByRunningOp(input: ExplainInput): ExplainObject {
  const opIds =
    typeof input.message === "string" ? input.message : "<no-running-operations-listed>";
  return {
    summary: "a running Access operation holds the write lock.",
    decisionTree: [
      {
        step: 1,
        check: "no `status: running` operations are present under `.dysflow/runtime/`",
        result: "FAIL",
        evidence: opIds,
      },
      {
        step: 2,
        check: "Is the running operation genuinely alive, or is it an orphaned marker?",
        result: "LIKELY",
        evidence:
          "Orphaned markers from crashed ops look alive but the owning MSACCESS.EXE is gone. This is the most common cause.",
      },
      {
        step: 3,
        check: "Force-clean the orphaned operation, then retry the write.",
        result: "LIKELY",
        evidence: "After the cleanup, `findRunningOperations` returns an empty list.",
        remediation:
          input.remediation ??
          "Call `access_force_cleanup_orphaned({})` to list candidates, verify their headless + accessPath ownership, then `access_force_cleanup_orphaned({ confirmPid: <pid> })` for the confirmed orphan and retry.",
      },
    ],
  };
}

function explainCapabilitiesDisallowWrite(input: ExplainInput): ExplainObject {
  return {
    summary: "project config declares `capabilities.allowWrites = false`.",
    decisionTree: [
      {
        step: 1,
        check: "`.dysflow/project.json` has `capabilities.allowWrites = true`",
        result: "FAIL",
        evidence: "Read of project.json shows `capabilities.allowWrites === false`.",
      },
      {
        step: 2,
        check:
          "Is this a read-only review/staging worktree, or was allowWrites disabled by mistake?",
        result: "LIKELY",
        evidence:
          "The most common cause is a freshly-cloned staging worktree that intentionally disables writes — verify with `dysflow doctor`.",
      },
      {
        step: 3,
        check: "Enable allowWrites on the project config and retry.",
        result: "LIKELY",
        evidence: "After flipping the flag and running doctor, write-class tools should succeed.",
        remediation:
          input.remediation ??
          "Set `capabilities.allowWrites: true` in `.dysflow/project.json`, then `dysflow doctor --cwd <projectRoot>` and retry.",
      },
    ],
  };
}

function explainProjectIdMismatch(input: ExplainInput): ExplainObject {
  const requested =
    typeof input.details?.requestedProjectId === "string"
      ? (input.details.requestedProjectId as string)
      : "<requested>";
  const configured =
    typeof input.details?.configuredProjectId === "string"
      ? (input.details.configuredProjectId as string)
      : "<configured>";
  return {
    summary: `caller-supplied projectId '${requested}' does not match configured '${configured}'.`,
    decisionTree: [
      {
        step: 1,
        check: `caller's projectId '${requested}' equals the configured project id`,
        result: "FAIL",
        evidence: `configured projectId is '${configured}' (from .dysflow/project.json).`,
      },
      {
        step: 2,
        check: "Are you addressing the right worktree, or did the projectConfig rotate?",
        result: "LIKELY",
        evidence:
          "Each worktree holds its own `.dysflow/project.json`; a stale `--projectId` from one worktree does not apply to another.",
      },
      {
        step: 3,
        check: "Retry with the configured projectId, or update the config to match.",
        result: "LIKELY",
        evidence: "After the IDs agree, the gate envelope stops firing.",
        remediation:
          input.remediation ??
          `Run \`dysflow doctor --cwd <projectRoot>\`, then retry with projectId '${configured}'.`,
      },
    ],
  };
}

function explainWritesDisabled(input: ExplainInput): ExplainObject {
  const toolName =
    typeof input.details?.toolName === "string"
      ? (input.details.toolName as string)
      : "<attempted-tool>";
  return {
    summary: "this MCP adapter has writes process-wide disabled.",
    decisionTree: [
      {
        step: 1,
        check: "writes process-wide are enabled for this MCP session",
        result: "FAIL",
        evidence: `writesProcess.enabled === false (attempted: ${toolName}).`,
      },
      {
        step: 2,
        check:
          "Was this adapter started with `--disable-writes`, or did the project opt in via `allowWrites: false`?",
        result: "LIKELY",
        evidence:
          "Two escape paths exist: process-wide (`dysflow mcp --enable-writes`) or per-project (`allowWrites: true` in `.dysflow/project.json`). One of them is set explicitly.",
      },
      {
        step: 3,
        check: "Enable writes either per-project or process-wide and retry.",
        result: "LIKELY",
        evidence: "After enabling, write-class tools reach the dispatch seam again.",
        remediation:
          input.remediation ??
          'Set `"allowWrites": true` in `.dysflow/project.json`, or launch with `dysflow mcp --enable-writes` (process-wide).',
      },
    ],
  };
}

function explainProcedureNotAllowed(input: ExplainInput): ExplainObject {
  const procedure =
    typeof input.details?.procedure === "string"
      ? (input.details.procedure as string)
      : "<procedure>";
  return {
    summary: `procedure '${procedure}' is not in the project's allowedProcedures.`,
    decisionTree: [
      {
        step: 1,
        check: `'${procedure}' is present in the configured allowedProcedures list`,
        result: "FAIL",
        evidence: `Procedure '${procedure}' absent from allowlist.`,
      },
      {
        step: 2,
        check:
          "Did the allowlist drop this entry intentionally, or is the call coming from an unconfigured workflow?",
        result: "LIKELY",
        evidence: "Most misses come from a renamed procedure or a freshly-tightened allowlist.",
      },
      {
        step: 3,
        check: "Add the procedure to allowedProcedures and retry.",
        result: "LIKELY",
        evidence: "Once `get_capabilities` reports the new entry, the call succeeds.",
        remediation:
          input.remediation ??
          `Add '${procedure}' to the 'allowedProcedures' allowlist in \`.dysflow/project.json\`, or call \`get_capabilities\` to introspect the current allowlist before retrying.`,
      },
    ],
  };
}

function explainAllowlistNotConfigured(input: ExplainInput): ExplainObject {
  const procedure =
    typeof input.details?.procedure === "string"
      ? (input.details.procedure as string)
      : "<procedure>";
  return {
    summary: `project config declares no allowedProcedures allowlist; refusing '${procedure}'.`,
    decisionTree: [
      {
        step: 1,
        check: "`allowedProcedures` is declared as a non-empty array in `.dysflow/project.json`",
        result: "FAIL",
        evidence: "Project config carries no `allowedProcedures` allowlist (or empty array).",
      },
      {
        step: 2,
        check: "Is this a fresh worktree that hasn't set the allowlist yet?",
        result: "LIKELY",
        evidence:
          "A fresh `dysflow setup` may have skipped the allowlist, or the operator has tightened it after removing the previous runtime.",
      },
      {
        step: 3,
        check: "Declare a non-empty allowedProcedures allowlist, or pass dryRun:true.",
        result: "LIKELY",
        evidence: "After populating the allowlist, the gate stops firing.",
        remediation:
          input.remediation ??
          "Declare a non-empty `allowedProcedures` allowlist in `.dysflow/project.json` (re-read per call — no restart is needed), or pass `dryRun:true` to plan without executing.",
      },
    ],
  };
}

function explainInputInvalid(input: ExplainInput): ExplainObject {
  const message = input.message;
  return {
    summary: "the supplied payload did not match the tool schema.",
    decisionTree: [
      {
        step: 1,
        check:
          "the supplied input validates against the tool's inputSchema (additionalProperties:false, type-correct fields)",
        result: "FAIL",
        evidence: message,
      },
      {
        step: 2,
        check:
          "Did the caller pass a deprecated flag (`compile`, `rollbackOnCompileFail`, `propertyName`) or a value the tool does not accept?",
        result: "LIKELY",
        evidence:
          "Most schema-rejection envelopes come from a deprecated flag the runtime silently strips (`compile`) or a renamed property (`propertyName` -> `property`).",
      },
      {
        step: 3,
        check: "Replace unsupported or deprecated fields and retry.",
        result: "LIKELY",
        evidence: "After aligning with the inputSchema, validation passes and the call dispatches.",
        remediation:
          input.remediation ??
          "Re-read the tool's input schema and replace unsupported or missing fields before retrying. Use `get_capabilities` to inspect the per-tool commit flag.",
      },
    ],
  };
}

function explainExportSourceGuardRefused(input: ExplainInput): ExplainObject {
  const destination =
    typeof input.details?.destination === "string"
      ? (input.details.destination as string)
      : "<destination>";
  const sourceRoot =
    typeof input.details?.sourceRoot === "string"
      ? (input.details.sourceRoot as string)
      : "<sourceRoot>";
  return {
    summary: "export destination overlaps the project's active source root.",
    decisionTree: [
      {
        step: 1,
        check: `destination '${destination}' is NOT inside the project's active source root '${sourceRoot}'`,
        result: "FAIL",
        evidence: `destination overlaps sourceRoot — confirmed by lexical comparison against projectRoot.`,
      },
      {
        step: 2,
        check:
          "Is the caller intentionally pointing the export back into source (a mirror), or has `destinationRoot` drifted?",
        result: "LIKELY",
        evidence:
          "The most common cause is the caller passing the project root as the export destination without realizing they are about to overwrite the source tree.",
      },
      {
        step: 3,
        check: "Confirm the overwrite or point the export outside source and retry.",
        result: "LIKELY",
        evidence: "After acknowledging the overwrite, the export proceeds.",
        remediation:
          input.remediation ??
          "Pass `confirmOverwriteSource: true` to acknowledge the overwrite, or point `exportPath` / `destinationRoot` outside the project's source tree.",
      },
    ],
  };
}

function explainFormUnknownProperty(input: ExplainInput): ExplainObject {
  const controlName =
    typeof input.details?.controlName === "string"
      ? (input.details.controlName as string)
      : "<control>";
  const attemptedKey =
    typeof input.details?.attemptedKey === "string"
      ? (input.details.attemptedKey as string)
      : "<key>";
  return {
    summary: `property '${attemptedKey}' is not recognized on control '${controlName}'.`,
    decisionTree: [
      {
        step: 1,
        check: `'${attemptedKey}' exists in the form-control catalog`,
        result: "FAIL",
        evidence: `Property key '${attemptedKey}' not present in the form-control catalog for '${controlName}'.`,
      },
      {
        step: 2,
        check:
          "Is the property a deprecated or renamed key (e.g., `propertyName` -> `property`), or did the catalog get out of sync?",
        result: "LIKELY",
        evidence:
          "Most misses come from a typo or a renamed key. Compare against the catalog via `harvest_form_catalog` or `catalog_add_control`.",
      },
      {
        step: 3,
        check: "Use `inspect_form` / `form_list_controls` to find the canonical key and retry.",
        result: "LIKELY",
        evidence: "After aligning with a real catalog key, the call succeeds.",
        remediation:
          input.remediation ??
          "Use `inspect_form` / `form_list_controls` to enumerate the canonical control keys for this form, then pass one of them to `form_set_property`.",
      },
    ],
  };
}

function explainFormPropertyValueInvalid(input: ExplainInput): ExplainObject {
  const property =
    typeof input.details?.property === "string" ? (input.details.property as string) : "<property>";
  const expected =
    typeof input.details?.expectedType === "string"
      ? (input.details.expectedType as string)
      : "<expected>";
  const actual =
    typeof input.details?.actualType === "string"
      ? (input.details.actualType as string)
      : "<actual>";
  return {
    summary: `value type mismatch for property '${property}' (expected ${expected}, got ${actual}).`,
    decisionTree: [
      {
        step: 1,
        check: `value's runtime type matches property '${property}' expected type '${expected}'`,
        result: "FAIL",
        evidence: `Type '${actual}' supplied where '${expected}' is required.`,
      },
      {
        step: 2,
        check: "Was the value coerced from a string or a JSON-decoded number?",
        result: "LIKELY",
        evidence:
          "JSON decodes all numerics as `number`. Common slips: strings passed for `integer` properties (BackColor, etc.) and fractional numbers passed for `integer` properties.",
      },
      {
        step: 3,
        check: "Coerce the value to the expected type and retry.",
        result: "LIKELY",
        evidence: "After coercion (parseInt, parseFloat, String(), Boolean()), validation passes.",
        remediation:
          input.remediation ??
          "Coerce the value to the expected type before passing it. `integer` types must be a whole number; `boolean` types must be literal `true`/`false`; `color` types are Long integers (decimal) representing 0xBBGGRR; `twip` types are integer coordinates.",
      },
    ],
  };
}

/**
 * Generic fallback for codes without a tree-specific decision list. Still
 * MUST emit ≥3 steps so the contract holds regardless of code.
 */
function genericExplain(input: ExplainInput): ExplainObject {
  return {
    summary: input.message,
    decisionTree: [
      {
        step: 1,
        check: `error code '${input.code}' fired`,
        result: "FAIL",
        evidence: input.message,
      },
      {
        step: 2,
        check:
          "Was the input shape mis-aligned with the tool's contract, or is this a runtime-side condition the caller cannot pre-flight?",
        result: "LIKELY",
        evidence:
          "Verify the input against the tool's inputSchema via `dysflow.schema` and inspect runtime context with `dysflow.state`.",
      },
      {
        step: 3,
        check: "Inspect the input and runtime context; retry after correction.",
        result: "LIKELY",
        evidence: "Once aligned with the tool's contract, the call succeeds.",
        remediation:
          input.remediation ??
          "Inspect `get_capabilities` and the tool's input schema; retry after correcting the input.",
      },
    ],
  };
}

const EXPLAIN_BUILDERS: ReadonlyMap<string, (input: ExplainInput) => ExplainObject> = new Map<
  string,
  (input: ExplainInput) => ExplainObject
>([
  ["DESTINATION_ROOT_NOT_FOUND", explainDestinationRootNotFound],
  ["OUTSIDE_PROJECT_ROOT", explainOutsideProjectRoot],
  ["WRITE_LOCKED_BY_RUNNING_OP", explainWriteLockedByRunningOp],
  ["CAPABILITIES_DISALLOW_WRITE", explainCapabilitiesDisallowWrite],
  ["PROJECT_ID_MISMATCH", explainProjectIdMismatch],
  ["MCP_WRITES_DISABLED", explainWritesDisabled],
  ["MCP_PROCEDURE_NOT_ALLOWED", explainProcedureNotAllowed],
  ["MCP_ALLOWLIST_NOT_CONFIGURED", explainAllowlistNotConfigured],
  ["MCP_INPUT_INVALID", explainInputInvalid],
  ["EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION", explainExportSourceGuardRefused],
  ["FORM_UNKNOWN_PROPERTY", explainFormUnknownProperty],
  ["FORM_PROPERTY_VALUE_INVALID", explainFormPropertyValueInvalid],
]);

/**
 * Build the ExplainObject for an error. The summary + decisionTree are
 * code-aware so the agent can branch on a single field rather than
 * re-reasoning from the message text.
 *
 * When the input.code is not in {@link EXPLAIN_BUILDERS}, a generic
 * 3-step fallback is used. The contract always emits ≥3 steps.
 */
export function buildExplainObject(input: ExplainInput): ExplainObject {
  const builder = EXPLAIN_BUILDERS.get(input.code);
  return builder ? builder(input) : genericExplain(input);
}

/**
 * Convenience helper: build the ExplainObject from a successful
 * (or failing) `OperationResult`. Returns `undefined` when the result
 * is `ok: true` (no explain needed).
 */
export function buildExplainFromOperationResult<TData>(
  result: OperationResult<TData>,
): ExplainObject | undefined {
  if (result.ok) return undefined;
  return buildExplainObject({
    code: result.error.code,
    message: result.error.message,
    ...(result.error.remediation !== undefined ? { remediation: result.error.remediation } : {}),
    ...(result.error.details !== undefined ? { details: result.error.details } : {}),
  });
}

/**
 * Convenience helper: build the ExplainObject directly from a
 * `DysflowError` instance.
 */
export function buildExplainFromDysflowError(error: DysflowError): ExplainObject {
  return buildExplainObject({
    code: error.code,
    message: error.message,
    ...(error.remediation !== undefined ? { remediation: error.remediation } : {}),
    ...(error.details !== undefined ? { details: error.details } : {}),
  });
}
