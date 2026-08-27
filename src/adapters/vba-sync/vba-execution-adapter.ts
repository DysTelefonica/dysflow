import { resolve } from "node:path";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import { parseArgsJson } from "../../core/services/vba-import-plan.js";
import {
  isAbsolutePath,
  isRecord,
  readJsonFileAsync,
  stringValue,
} from "../../core/utils/index.js";
import {
  type AllowedProcedures,
  resolveAllowedProceduresFor,
} from "../mcp/allowed-procedures-resolver.js";
import { type DirectMapping, mapping, stringArray } from "./vba-sync-types.js";

// feat-759-no-compile (v1.19.0) — the `compile_vba` MCP tool and the general
// compile-and-save path were removed; user modules are compiled by the human
// in Access. The `compile_vba` MCP tool no longer exists.
const EXECUTION_MAPPINGS = {
  test_vba: mapping(
    "Run-Tests",
    true,
    () => [],
    (input) => ({ proceduresJson: directTestProceduresJson(input) }),
  ),
  run_vba: mapping(
    "Run-Procedure",
    true,
    (input) => stringArray(input.moduleNames),
    (input) => ({
      procedureName: stringValue(input.procedureName),
      argsJson: stringValue(input.argsJson),
    }),
  ),
};

export interface VbaSyncOrchestrator {
  executeMappedTool(
    toolName: string,
    params: Record<string, unknown>,
    mapping: DirectMapping,
  ): Promise<OperationResult<unknown>>;
  cwd: string;
}

export class VbaExecutionAdapter {
  /**
   * `allowedProcedures` is an opt-in whitelist for test_vba. Undefined and
   * empty allowlists impose no restriction; when non-empty, every procedure
   * in the test plan must appear in the list. run_vba keeps its separate
   * default-deny gate at the MCP boundary.
   */
  constructor(
    private readonly orchestrator: VbaSyncOrchestrator,
    private readonly allowedProcedures?: AllowedProcedures,
  ) {}

  static handles(toolName: string): boolean {
    // feat-759-no-compile (v1.19.0) — `compile_vba` was removed from the
    // MCP surface. Compile is no longer a tool the adapter routes through.
    return toolName === "run_vba" || toolName === "test_vba";
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<OperationResult<unknown>> {
    if (toolName === "run_vba") {
      // Just map it using normal flow. If run_vba is handled manually, this acts as fallback.
      return this.orchestrator.executeMappedTool(toolName, params, EXECUTION_MAPPINGS.run_vba);
    }
    if (toolName === "test_vba") {
      return this.executeTestVba(params);
    }
    return failureResult(
      createDysflowError(
        "TOOL_NOT_IMPLEMENTED",
        `Tool ${toolName} not supported by VbaExecutionAdapter.`,
      ),
    );
  }

  private async executeTestVba(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    // Resolve the plan (either direct `proceduresJson` or resolved from
    // `procedureName+argsJson` / `testsPath`). Capture both the canonical
    // JSON string (passed through to the runner) and the procedure names
    // (consumed by the gate below).
    const directProceduresJson = stringValue(params.proceduresJson);
    let resolvedProceduresJson: string;
    let resolvedProcedureNames: readonly string[];
    if (directProceduresJson !== undefined) {
      const directPlan = validateTestProceduresJson(directProceduresJson);
      if (!directPlan.ok) return directPlan;
      resolvedProceduresJson = directPlan.data;
      resolvedProcedureNames = extractProcedureNames(directPlan.data);
    } else {
      const planResult = await this.resolveTestProceduresJson(params);
      if (!planResult.ok) return planResult;
      resolvedProceduresJson = planResult.data;
      resolvedProcedureNames = extractProcedureNames(planResult.data);
    }

    // Issue #1046 (Bug B) — `dryRun:true` short-circuits BEFORE the allowlist
    // gate. The docs at `assets/examples/test-vba.md:31-35` (canonical,
    // mirrored in dysflow-usage) promise that `dryRun:true` validates the
    // manifest shape without executing the atoms and does NOT raise
    // `PROCEDURE_NOT_ALLOWED` / `MCP_ALLOWLIST_NOT_CONFIGURED`. The
    // previous order (gate → dryRun) violated that promise: a consumer
    // passing `dryRun:true` on a procedure outside `allowedProcedures`
    // got `PROCEDURE_NOT_ALLOWED` instead of a plan-shaped success.
    //
    // Why gate-behind-dryRun is safe: the gate exists to prevent UNSANCTIONED
    // EXECUTION of compiled VBA. A plan-shaped result never spawns Access
    // and never invokes a `Test_*` procedure — the only thing the gate
    // could refuse is a hypothetical execution that the dryRun path
    // explicitly opts out of. The gate is still consulted on the commit
    // path (any caller that did NOT pass `dryRun:true`).
    //
    // Issue #785 (v2.1.1, capa 3) — the dispatch seam (capa 1) is the
    // single source of truth for the policy-driven effective dryRun
    // default. By the time the adapter is invoked through the MCP
    // boundary, the helper has already injected the policy default. This
    // adapter therefore observes a fully-decided `params.dryRun` — the
    // implicit absence-default has been removed; only explicit
    // `dryRun === true` short-circuits here. Direct adapter callers (no
    // dispatch seam) bypass the policy default and reach the runner
    // unless they pass `dryRun: true` explicitly.
    //
    // Issue #1167 — `apply: false` is also a plan signal (the canonical
    // form of the polarity after the test_vba apply-flag unification).
    // The dispatch seam accepts `apply:true` (commit) / `apply:false`
    // (plan) / `dryRun:true` (plan, legacy alias) / `dryRun:false`
    // (commit, legacy alias) — the validator's apply/dryRun
    // contradiction check (F8 #1057) catches the bad combination
    // BEFORE this method sees it, so we only need to recognize the
    // plan-shape inputs here. `apply:true` and `dryRun:false` both fall
    // through to the runner; `apply:false` and `dryRun:true` both
    // short-circuit to the plan shape.
    if (params.dryRun === true || params.apply === false) {
      return successResult({
        dryRun: true,
        willExecute: false,
        willModifyAccess: false,
        plan: {
          procedureName: resolvedProcedureNames,
          proceduresCount: resolvedProcedureNames.length,
          warnings: [],
          errors: [],
        },
      });
    }

    // Opt-in whitelist gate. Fires AFTER plan resolution
    // (so we know which procedures will execute) and AFTER the dryRun
    // short-circuit (so a plan-only call does not consult the allowlist at
    // all — Bug B fix #1046). On the commit path (no dryRun) the gate still
    // runs BEFORE the runner, so neither the binary write nor the test
    // execution happens when the plan is rejected. The previous order ran
    // compile_vba first, which wrote the .accdb even when the gate would
    // later refuse — an unwanted side effect on the live binary.
    const gateError = await this.ensureTestProceduresAllowed(params, resolvedProcedureNames);
    if (gateError !== undefined) return gateError;

    return inspectTestResult(
      await this.orchestrator.executeMappedTool(
        "test_vba",
        { ...params, proceduresJson: resolvedProceduresJson },
        EXECUTION_MAPPINGS.test_vba,
      ),
    );
  }

  /**
   * Opt-in whitelist gate for test_vba at the adapter boundary:
   *
   *   1. When `allowedProcedures` is undefined OR empty, execution proceeds.
   *   2. When `allowedProcedures` is configured, EVERY procedure in the
   *      plan must appear in the list — the plan is atomic.
   *
   * Returns an `OperationResult<unknown>` failure when a configured whitelist
   * refuses the plan, or `undefined` when execution may proceed.
   */
  private async ensureTestProceduresAllowed(
    params: Record<string, unknown>,
    procedures: readonly string[],
  ): Promise<OperationResult<unknown> | undefined> {
    // #748 — resolve per-input so the gate always sees the current
    // allowedProcedures of the project the input targets. Accepts either
    // a static array (legacy, frozen at construction) OR a resolver
    // function (per-input, reads project config each call) per the
    // #674 AllowedProcedures contract.
    const resolved = await resolveAllowedProceduresFor(this.allowedProcedures, params);
    if (resolved === undefined || resolved.length === 0) {
      return undefined;
    }

    const allowSet = new Set(resolved);
    const disallowed = procedures.filter((procedure) => !allowSet.has(procedure));
    if (disallowed.length > 0) {
      // Issue #659 — split: this is case (b) (gate IS configured AND the
      // plan contains a procedure not in the allowlist). Emits
      // `PROCEDURE_NOT_ALLOWED` with the current allowlist and a
      // remediation line, mirroring the MCP-handler split in
      // `canonical-handlers.ts:ensureProcedureAllowed`. The structured
      // `error.allowedProcedures` and `error.remediation` fields are
      // carried by the `DysflowError` shape and propagated to the
      // `McpToolResult.error` envelope by `translateCoreResultToMcpContent`.
      return failureResult(
        createDysflowError(
          "PROCEDURE_NOT_ALLOWED",
          `Refusing to execute test_vba plan: procedure(s) [${disallowed.join(", ")}] ` +
            `are not in the configured allowedProcedures list. ` +
            `Set allowedProcedures in .dysflow/project.json to allow these procedures.`,
          {
            allowedProcedures: resolved,
            remediation:
              disallowed.length === 1
                ? `Add '${disallowed[0]}' to allowedProcedures in .dysflow/project.json or test a procedure that is in the list.`
                : `Add procedures [${disallowed.join(", ")}] to allowedProcedures in .dysflow/project.json or test a procedure that is in the list.`,
          },
        ),
      );
    }
    return undefined;
  }

  private async resolveTestProceduresJson(
    params: Record<string, unknown>,
  ): Promise<OperationResult<string>> {
    try {
      const procedureName = stringValue(params.procedureName);
      if (procedureName !== undefined) {
        const parsed = parseArgsJson(params.argsJson);
        if (!parsed.ok)
          return failureResult(createDysflowError("VBA_INVALID_TEST_PLAN", parsed.error));
        return successResult(JSON.stringify([{ procedure: procedureName, args: parsed.value }]));
      }

      // Hotfix (post-v1.10.1): resolve the manifest path with guardrails so the
      // adapter never returns an opaque `ENOENT ... [PATH]` error when neither
      // projectRoot nor orchestrator cwd is wired up, and so the default search
      // covers the `tests/tests.vba.json` location real projects (e.g.
      // gestion_riesgos) actually use.
      const baseDir = resolveTestBaseDir(params, this.orchestrator.cwd);
      if (!baseDir.ok) return baseDir;

      const candidates = buildTestManifestCandidates(stringValue(params.testsPath), {
        projectRoot: baseDir.data,
        destinationRoot: stringValue(params.destinationRoot),
        cwd: this.orchestrator.cwd,
      });

      const foundManifest = await findExistingManifest(candidates);
      if (!foundManifest.ok) return foundManifest;
      const resolvedPath = foundManifest.data;

      const parsed = await readJsonFileAsync<unknown>(resolvedPath);
      const tests = normalizeTestPlan(parsed);
      const parsedFilter = parseTestFilter(params.filter);
      if (!parsedFilter.ok) return parsedFilter;
      const filterParts = parsedFilter.data;
      const selected =
        filterParts === undefined
          ? tests
          : tests.filter((test) => matchesTestFilter(test, filterParts));
      if (selected.length === 0) {
        return failureResult(
          createDysflowError(
            "VBA_NO_TESTS_SELECTED",
            `No VBA tests selected from ${resolvedPath}${describeTestFilter(filterParts)}.`,
          ),
        );
      }
      return successResult(
        JSON.stringify(selected.map((test) => ({ procedure: test.procedure, args: test.args }))),
      );
    } catch (err) {
      return failureResult(
        createDysflowError(
          "VBA_INVALID_TEST_PLAN",
          err instanceof Error ? err.message : String(err),
        ),
      );
    }
  }
}

/**
 * Resolve the base directory for test-manifest resolution.
 *
 * Priority: `params.projectRoot` (non-empty after trim) → orchestrator's
 * `cwd` (non-empty) → error. Returns a non-empty string when OK.
 *
 * The defensive `cwd ?? process.cwd()` step is intentionally NOT applied here:
 * an empty/missing cwd IS a configuration problem the agent should see, and
 * silently swapping `process.cwd()` would mask real wiring bugs.
 */
function resolveTestBaseDir(
  params: Record<string, unknown>,
  cwd: unknown,
): OperationResult<string> {
  const explicit = stringValue(params.projectRoot);
  const fallback = stringValue(cwd);
  const base = explicit ?? fallback ?? "";
  if (!base) {
    return failureResult(
      createDysflowError(
        "VBA_INVALID_TEST_PLAN",
        "Test plan manifest cannot be located: neither projectRoot nor orchestrator cwd is available. Provide proceduresJson, procedureName+argsJson, or supply an absolute testsPath.",
      ),
    );
  }
  return successResult(base);
}

/**
 * Build the ordered list of manifest paths to try.
 *
 * - When `testsPath` is absolute: it is used literally as the single candidate.
 * - When `testsPath` is relative: it is resolved against `projectRoot` only —
 *   mirroring the existing contract that `testsPath` is project-root relative
 *   (not destinationRoot or cwd relative).
 * - When `testsPath` is absent: search `tests/tests.vba.json` and
 *   `tests.vba.json` across projectRoot, destinationRoot and cwd (deduped) so
 *   real projects that keep the manifest under `tests/` are discovered without
 *   a parameter.
 */
function buildTestManifestCandidates(
  testsPathInput: string | undefined,
  dirs: { projectRoot: string; destinationRoot?: string; cwd?: string },
): string[] {
  if (testsPathInput !== undefined) {
    return [
      isAbsolutePath(testsPathInput) ? testsPathInput : resolve(dirs.projectRoot, testsPathInput),
    ];
  }

  const seen = new Set<string>();
  const out: string[] = [];
  const basenames = ["tests/tests.vba.json", "tests.vba.json"];

  const pushCandidate = (base: string | undefined, basename: string): void => {
    if (!base) return;
    const candidate = resolve(base, basename);
    if (!seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  };

  const bases: Array<string | undefined> = [dirs.projectRoot];
  if (dirs.destinationRoot && dirs.destinationRoot !== dirs.projectRoot) {
    bases.push(dirs.destinationRoot);
  }
  if (dirs.cwd && dirs.cwd !== dirs.projectRoot && dirs.cwd !== dirs.destinationRoot) {
    bases.push(dirs.cwd);
  }

  for (const base of bases) {
    for (const basename of basenames) {
      pushCandidate(base, basename);
    }
  }

  return out;
}

/**
 * Iterate the candidate list and return the first readable manifest.
 *
 * - ENOENT (missing file) is expected → try the next candidate.
 * - Other failures (e.g. malformed JSON) are surfaced immediately because the
 *   manifest IS at the candidate path; silently swallowing them would mask the
 *   real root cause.
 *
 * When ALL candidates are missing, returns `VBA_INVALID_TEST_PLAN` with the
 * exact set of paths the caller can sanity-check, plus a message pointing at
 * the explicit overrides (`proceduresJson`, `procedureName+argsJson`,
 * `testsPath`).
 */
async function findExistingManifest(
  candidates: readonly string[],
): Promise<OperationResult<string>> {
  for (const candidate of candidates) {
    try {
      await readJsonFileAsync<unknown>(candidate);
      return successResult(candidate);
    } catch (err) {
      if (isFsMissingError(err)) continue;
      return failureResult(
        createDysflowError(
          "VBA_INVALID_TEST_PLAN",
          `${err instanceof Error ? err.message : String(err)} (at ${candidate})`,
          { details: { candidates: [...candidates] } },
        ),
      );
    }
  }

  return failureResult(
    createDysflowError(
      "VBA_INVALID_TEST_PLAN",
      `Test plan manifest not found. Tried: ${candidates.join(", ")}. Provide proceduresJson, procedureName+argsJson, or testsPath (absolute or relative to projectRoot).`,
      { details: { candidates: [...candidates] } },
    ),
  );
}

function isFsMissingError(err: unknown): boolean {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return true;
    // `readJsonFileAsync` wraps ENOENT as a generic Error after the underlying
    // node call; surface any error whose message carries ENOENT regardless.
    if (typeof err.message === "string" && err.message.includes("ENOENT")) return true;
  }
  return false;
}

function directTestProceduresJson(input: Record<string, unknown>): string | undefined {
  return stringValue(input.proceduresJson);
}

/**
 * Extract procedure names from a canonical test-plan JSON string
 * (`[{procedure: "X", args: []}, ...]`). The shape is produced by
 * {@link validateTestProceduresJson} and {@link resolveTestProceduresJson} —
 * both strip `name`/`tags` and keep only `{procedure, args}` so the runner
 * payload stays minimal. The gate consumes the names to check the
 * `allowedProcedures` allowlist.
 *
 * Returns an empty array when the payload is malformed — the gate treats
 * "no procedures" as "nothing to execute" and lets the runner proceed; the
 * runner's own validation will surface a typed error if the plan is unusable.
 */
function extractProcedureNames(planJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(planJson);
    if (!Array.isArray(parsed)) return [];
    const names: string[] = [];
    for (const entry of parsed) {
      if (isRecord(entry) && typeof entry.procedure === "string" && entry.procedure.length > 0) {
        names.push(entry.procedure);
      }
    }
    return names;
  } catch {
    return [];
  }
}

type VbaTestPlanEntry = {
  name: string;
  procedure: string;
  args: unknown[];
  tags: string[];
};

function normalizeTestPlan(value: unknown): VbaTestPlanEntry[] {
  const tests = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.tests)
      ? value.tests
      : undefined;
  if (tests === undefined) {
    throw new Error(
      'Test plan must be an array of tests or an object with a "tests" array, e.g. ["Test_Name"] or [{"procedure":"Test_Name","args":[]}].',
    );
  }
  return tests.map((item, index) => {
    // Shorthand: a bare string is the procedure name with no arguments.
    if (typeof item === "string") {
      const procedure = item.trim();
      if (procedure.length === 0) {
        throw new Error(`Test #${index + 1} is an empty procedure name.`);
      }
      return { name: procedure, procedure, args: [], tags: [] };
    }
    if (!isRecord(item)) {
      throw new Error(
        `Test #${index + 1} must be a procedure name string or an object like {"procedure":"Test_Name","args":[]}.`,
      );
    }
    const procedure = stringValue(item.procedure) ?? stringValue(item.proc);
    if (procedure === undefined) {
      throw new Error(
        `Test #${index + 1} is missing "procedure" (e.g. {"procedure":"Test_Name","args":[]}).`,
      );
    }
    const args = Array.isArray(item.args) ? item.args : [];
    const tags = Array.isArray(item.tags) ? item.tags.map(String) : [];
    return {
      name: stringValue(item.name) ?? procedure,
      procedure,
      args,
      tags,
    };
  });
}

function sanitizeProceduresJson(jsonStr: string): string {
  let cleaned = jsonStr;
  if (cleaned.startsWith("\uFEFF")) {
    cleaned = cleaned.substring(1);
  }
  cleaned = cleaned.trim();
  const markdownFenceRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
  const match = markdownFenceRegex.exec(cleaned);
  if (match) {
    cleaned = (match[1] ?? "").trim();
  }
  if (cleaned.startsWith("\uFEFF")) {
    cleaned = cleaned.substring(1);
  }
  return cleaned.trim();
}

function validateTestProceduresJson(proceduresJson: string): OperationResult<string> {
  try {
    const sanitized = sanitizeProceduresJson(proceduresJson);
    const procedures = normalizeTestPlan(JSON.parse(sanitized));
    if (procedures.length === 0) {
      return failureResult(
        createDysflowError(
          "VBA_NO_TESTS_SELECTED",
          "proceduresJson must contain at least one VBA test procedure.",
        ),
      );
    }
    return successResult(
      JSON.stringify(procedures.map((test) => ({ procedure: test.procedure, args: test.args }))),
    );
  } catch (err) {
    return failureResult(
      createDysflowError("VBA_INVALID_TEST_PLAN", err instanceof Error ? err.message : String(err)),
    );
  }
}

/**
 * Shape of a parsed `test_vba` filter.
 *
 * Issue #1442 — the tool accepts two filter forms and they select differently,
 * so the parsed value carries which form was used instead of collapsing both
 * into a bare string array. Normalization (trim + lowercase) happens here, at
 * parse time, so the per-atom matcher stays allocation-free.
 */
type TestFilterParts =
  | { kind: "name_or_tag"; parts: readonly string[] }
  | { kind: "tag_only"; tag: string };

/**
 * Parse the `filter` parameter into its matching form.
 *
 * Returns a successful `undefined` when no usable filter was supplied (the
 * historical behavior for an absent, blank, or non-string filter), and a
 * `MCP_INPUT_INVALID` failure for an object that cannot be honored. Rejecting
 * rather than ignoring matters: a caller who mistypes the object would
 * otherwise silently run the ENTIRE manifest instead of the slice they asked
 * for, which is the failure this returns a typed error to prevent.
 */
function parseTestFilter(value: unknown): OperationResult<TestFilterParts | undefined> {
  if (isRecord(value)) return parseTestFilterObject(value);

  const filterText = stringValue(value);
  if (filterText === undefined) return successResult(undefined);
  const parts = filterText
    .split("|")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
  return successResult(parts.length > 0 ? { kind: "name_or_tag", parts } : undefined);
}

/**
 * Validate the object filter form `{ tag: "smoke" }`.
 *
 * This is the single site that enforces the object's shape. The MCP boundary
 * validator cannot do it: it matches one primitive type per property and has
 * no `oneOf`, so `filter` is advertised without a `type` and every object
 * reaches this function unchecked (see `SCHEMA_PROPS.testFilter`).
 */
function parseTestFilterObject(
  value: Record<string, unknown>,
): OperationResult<TestFilterParts | undefined> {
  if ("tags" in value) {
    return failureResult(
      createDysflowError(
        "MCP_INPUT_INVALID",
        'filter does not accept a plural "tags" array. Use the singular object form filter: { tag: "smoke" }, or the string form filter: "smoke|regression".',
      ),
    );
  }

  const unknownKeys = Object.keys(value).filter((key) => key !== "tag");
  if (unknownKeys.length > 0) {
    return failureResult(
      createDysflowError(
        "MCP_INPUT_INVALID",
        `filter object does not allow ${unknownKeys.map((key) => `"${key}"`).join(", ")}. Its only accepted key is "tag", e.g. filter: { tag: "smoke" }.`,
      ),
    );
  }

  if (!("tag" in value)) {
    return failureResult(
      createDysflowError(
        "MCP_INPUT_INVALID",
        'filter object must include a "tag" string, e.g. filter: { tag: "smoke" }.',
      ),
    );
  }

  const tag = value.tag;
  if (typeof tag !== "string") {
    return failureResult(
      createDysflowError(
        "MCP_INPUT_INVALID",
        `filter.tag must be a string (received ${tag === null ? "null" : typeof tag}).`,
      ),
    );
  }

  const normalized = tag.trim().toLowerCase();
  if (normalized.length === 0) {
    return failureResult(
      createDysflowError("MCP_INPUT_INVALID", "filter.tag must be a non-empty string."),
    );
  }

  return successResult({ kind: "tag_only", tag: normalized });
}

/** Render the active filter for the `VBA_NO_TESTS_SELECTED` message. */
function describeTestFilter(filter: TestFilterParts | undefined): string {
  if (filter === undefined) return "";
  return filter.kind === "tag_only"
    ? ` with filter { tag: "${filter.tag}" }`
    : ` with filter "${filter.parts.join("|")}"`;
}

function matchesTestFilter(test: VbaTestPlanEntry, filter: TestFilterParts): boolean {
  // The object form narrows to tags only. Consulting name/procedure here would
  // make `{ tag: "smoke" }` select a `Test_Smoke` atom carrying no tags at all,
  // which is exactly the distinction the object form exists to draw.
  if (filter.kind === "tag_only") {
    return test.tags.some((tag) => tag.toLowerCase().includes(filter.tag));
  }
  return filter.parts.some(
    (filterText) =>
      test.name.toLowerCase().includes(filterText) ||
      test.procedure.toLowerCase().includes(filterText) ||
      test.tags.some((tag) => tag.toLowerCase().includes(filterText)),
  );
}

/** Per-procedure detail preserved for each failing test (see {@link inspectTestResult}). */
type VbaTestFailureDetail = {
  procedure: string | undefined;
  error: string | undefined;
  logs: unknown[];
  durationMs: number | undefined;
  payload: unknown;
};

/** How many failing procedures to name in the human-readable error message. */
const TESTS_FAILED_SUMMARY_LIMIT = 5;

function toTestFailureDetail(test: Record<string, unknown>): VbaTestFailureDetail {
  return {
    procedure: stringValue(test.procedure),
    error: stringValue(test.error),
    logs: Array.isArray(test.logs) ? test.logs : [],
    durationMs: typeof test.durationMs === "number" ? test.durationMs : undefined,
    payload: test.payload,
  };
}

function buildTestsFailedMessage(failures: readonly VbaTestFailureDetail[]): string {
  const named = failures.slice(0, TESTS_FAILED_SUMMARY_LIMIT).map((failure) => {
    const name = failure.procedure ?? "(unknown procedure)";
    return failure.error ? `${name} — ${failure.error}` : name;
  });
  const overflow = failures.length - named.length;
  const suffix = overflow > 0 ? `; +${overflow} more` : "";
  return `${failures.length} VBA test(s) failed: ${named.join("; ")}${suffix}`;
}

/**
 * Normalizes singleton and array runner results into the documented apply
 * envelope, then collapses them into a single failure when any procedure
 * reported `ok: false`, while PRESERVING the structured detail the runner
 * already produced. The runner returns one object per procedure
 * (`ok`, `procedure`, `error`, `logs`, `payload`, `durationMs`); a consuming
 * agent decides what to do next, so dropping that detail blinds it to WHICH
 * test failed and why.
 *
 * The failing procedures are named in the error message (the MCP adapter only
 * renders `code: message`, so the message is what reaches the agent) and the
 * full structure is carried in `error.details` for programmatic consumers:
 * `{ failedCount, failures[], results[] }`.
 *
 * Limitation: when the runner executes an aggregate entry point such as a VBA
 * `RunAll`, Dysflow can only surface the individual inner failures if `RunAll`
 * itself returns them in its JSON payload (`ok: false` plus error/logs).
 * Dysflow does not parse VBA assertion output on its own.
 */
function inspectTestResult(result: OperationResult<unknown>): OperationResult<unknown> {
  if (!result.ok) return result;
  // Issue #1657 — the PowerShell runner now transports multi-procedure
  // results inside an object envelope (`{ tests: [...] }`). Keeping the array
  // below a named property avoids exposing a top-level JSON array to host
  // wrappers while preserving the existing public MCP apply contract.
  // Continue accepting the legacy singleton and top-level-array shapes so a
  // newer adapter can still consume output from an older packaged script.
  const tests = Array.isArray(result.data)
    ? result.data
    : isRecord(result.data)
      ? Array.isArray(result.data.tests)
        ? result.data.tests
        : [result.data]
      : undefined;
  if (tests === undefined) {
    const failure = failureResult(
      createDysflowError(
        "VBA_MANAGER_INVALID_OUTPUT",
        "test_vba runner returned neither a per-procedure result nor an array of results.",
      ),
      {
        diagnostics: result.diagnostics,
        durationMs: result.durationMs,
        operation: result.operation,
        metadata: result.metadata,
      },
    );
    return result.metadata === undefined ? failure : { ...failure, metadata: result.metadata };
  }

  const failures = tests
    .filter((test): test is Record<string, unknown> => isRecord(test) && test.ok === false)
    .map(toTestFailureDetail);
  if (failures.length === 0) {
    return {
      ...result,
      data: {
        mode: "apply",
        passed: tests.length,
        failed: 0,
        tests,
      },
    };
  }

  const failure = failureResult(
    createDysflowError("VBA_TESTS_FAILED", buildTestsFailedMessage(failures), {
      details: {
        failedCount: failures.length,
        failures,
        results: tests,
      },
    }),
    {
      diagnostics: result.diagnostics,
      durationMs: result.durationMs,
      operation: result.operation,
      metadata: result.metadata,
    },
  );
  return result.metadata === undefined ? failure : { ...failure, metadata: result.metadata };
}
