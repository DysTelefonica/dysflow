import { rm, writeFile } from "node:fs/promises";
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
  truthy,
} from "../../core/utils/index.js";
import { isWithinRuntime } from "../../shared/runtime-dir.js";
import { type DirectMapping, mapping, stringArray } from "./vba-sync-types.js";

const EXECUTION_MAPPINGS = {
  compile_vba: mapping("Compile", true),
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
  import_modules: mapping(
    "Import",
    false,
    (input) => stringArray(input.moduleNames),
    (input) => ({ importMode: stringValue(input.importMode) }),
  ),
  delete_module: mapping(
    "Delete",
    true,
    (input) => {
      const moduleNames = stringArray(input.moduleNames);
      const moduleName = stringValue(input.moduleName);
      return moduleNames.length > 0 ? moduleNames : moduleName ? [moduleName] : [];
    },
    (input) => ({ force: input.force === true ? true : undefined }),
  ),
};

/** Defense-in-depth limits for vba_inline_execution (issue #533). */
const MAX_INLINE_CODE_CHARS = 1024;
const INLINE_TIMEOUT_CEILING_MS = 30_000;

export interface VbaSyncOrchestrator {
  executeMappedTool(
    toolName: string,
    params: Record<string, unknown>,
    mapping: DirectMapping,
  ): Promise<OperationResult<unknown>>;
  cwd: string;
  resolveExecutionTarget?(params: Record<string, unknown>): Promise<OperationResult<unknown>>;
  env?: Record<string, string | undefined>;
}

export interface ExecutionFileSystemPort {
  writeFile(path: string, content: string): Promise<void>;
  rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<void>;
}

const defaultExecutionFileSystem: ExecutionFileSystemPort = {
  writeFile: (path, content) => writeFile(path, content, "utf8"),
  rm: (path, options) => rm(path, options),
};

export class VbaExecutionAdapter {
  /**
   * PR1b (#621 F1) — `allowedProcedures` allowlist used by the test_vba gate.
   * When undefined or empty, the gate refuses execution unless the caller
   * passes `dryRun: true`. When non-empty, every procedure in the test plan
   * must appear in the list — the plan is atomic. Mirrors the MCP-handler
   * gate semantics from `canonical-handlers.ts:ensureProcedureAllowed`
   * (PR1a), relocated to the adapter boundary because `test_vba` routes
   * through `VbaExecutionAdapter.executeTestVba`, NOT through
   * `handleMcpVbaExecute`.
   */
  constructor(
    private readonly orchestrator: VbaSyncOrchestrator,
    private readonly fileSystem: ExecutionFileSystemPort = defaultExecutionFileSystem,
    private readonly allowedProcedures?: readonly string[],
  ) {}

  static handles(toolName: string): boolean {
    return (
      toolName === "run_vba" ||
      toolName === "test_vba" ||
      toolName === "compile_vba" ||
      toolName === "vba_inline_execution"
    );
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<OperationResult<unknown>> {
    if (toolName === "vba_inline_execution") {
      return this.executeInline(params);
    }
    if (toolName === "compile_vba") {
      return this.orchestrator.executeMappedTool(toolName, params, EXECUTION_MAPPINGS.compile_vba);
    }
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

  private async executeInline(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    const rawCode = stringValue(params.code) || "";

    // Guardrail (#533): 1024-character code cap — reject before touching the binary.
    if (rawCode.length > MAX_INLINE_CODE_CHARS) {
      return failureResult(
        createDysflowError(
          "INVALID_INPUT",
          `Inline VBA code exceeds the ${MAX_INLINE_CODE_CHARS}-character cap (got ${rawCode.length}). Move larger logic into a module and run it with run_vba.`,
        ),
      );
    }

    // Safety guardrail: reject blocklisted unsafe keywords case-insensitively
    if (/\b(Declare|Shell|CreateObject|GetObject|Lib)\b/i.test(rawCode)) {
      return failureResult(
        createDysflowError("INVALID_INPUT", "Unsafe keywords detected in inline VBA snippet"),
      );
    }

    // Guardrail (#533): the snippet is wrapped in Public Sub ExecuteInline()/End Sub,
    // so a snippet that closes its own procedure block produces malformed VBA that
    // Access refuses to import. Reject it and point the caller at run_vba.
    if (/\bEnd\s+(?:Sub|Function|Property)\b/i.test(rawCode)) {
      return failureResult(
        createDysflowError(
          "INVALID_INPUT",
          "Inline VBA code must be a single procedure body and must not contain 'End Sub'/'End Function'/'End Property'. Define helpers in a module and call them with run_vba.",
        ),
      );
    }

    if (typeof this.orchestrator.resolveExecutionTarget !== "function") {
      return failureResult(
        createDysflowError(
          "ORCHESTRATOR_ERROR",
          "Orchestrator must implement resolveExecutionTarget to run inline VBA.",
        ),
      );
    }
    const targetRes = await this.orchestrator.resolveExecutionTarget(params);
    if (!targetRes.ok) return targetRes;
    const targetData = targetRes.data as { destinationRoot: string };
    const destinationRoot = targetData.destinationRoot;

    // Guardrail (#548): inline execution writes a temp module under destinationRoot,
    // which a writes-enabled caller can override via ACCESS_OVERRIDE. Refuse to write
    // into the dysflow production runtime (AGENTS.md hard rule).
    if (isWithinRuntime(destinationRoot, this.orchestrator.env ?? process.env)) {
      return failureResult(
        createDysflowError(
          "INVALID_INPUT",
          "Refusing to run inline VBA against a destinationRoot inside the dysflow production runtime. Point destinationRoot at your project, not the installed runtime.",
        ),
      );
    }

    // Guardrail (#533): clamp the effective timeout to the ceiling before any sub-call.
    const requestedTimeout = Number(params.timeoutMs);
    const clampedTimeout =
      Number.isFinite(requestedTimeout) && requestedTimeout > 0
        ? Math.min(requestedTimeout, INLINE_TIMEOUT_CEILING_MS)
        : INLINE_TIMEOUT_CEILING_MS;
    const inlineParams = { ...params, timeoutMs: clampedTimeout };

    const moduleName = "__dysflow_inline__";

    const folder = resolve(destinationRoot, "modules");
    const filePath = resolve(folder, `${moduleName}.bas`);

    const wrapper = `Attribute VB_Name = "${moduleName}"
Public Sub ExecuteInline()
${rawCode}
End Sub
`;

    // 1. Delete pre-existing database module and file on disk
    try {
      await this.orchestrator.executeMappedTool(
        "delete_module",
        { ...inlineParams, moduleName, force: true },
        EXECUTION_MAPPINGS.delete_module,
      );
    } catch {
      // Suppress pre-cleanup failures
    }
    try {
      await this.fileSystem.rm(filePath, { force: true });
    } catch {
      // Suppress pre-cleanup failures
    }

    // 2. Write file
    try {
      await this.fileSystem.writeFile(filePath, wrapper);
    } catch (err) {
      return failureResult(
        createDysflowError(
          "WRITE_ERROR",
          `Failed to write temporary inline VBA file: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    let inlineResult: OperationResult<unknown> = failureResult(
      createDysflowError("EXECUTION_ERROR", "Inline execution did not produce a result."),
    );
    try {
      // 3. Import module
      const importRes = await this.orchestrator.executeMappedTool(
        "import_modules",
        { ...inlineParams, moduleNames: [moduleName], dryRun: false },
        EXECUTION_MAPPINGS.import_modules,
      );
      if (!importRes.ok) {
        inlineResult = importRes;
      } else {
        const compileRes = await this.orchestrator.executeMappedTool(
          "compile_vba",
          inlineParams,
          EXECUTION_MAPPINGS.compile_vba,
        );
        let hasInlineCompileError = false;
        if (!compileRes.ok) {
          const errStr = JSON.stringify(compileRes.error || {});
          if (errStr.includes(`"component":"${moduleName}"`) || errStr.includes("_inline_")) {
            hasInlineCompileError = true;
            inlineResult = compileRes;
          }
        }
        if (!compileRes.ok && hasInlineCompileError) {
          // Keep the compileRes failure as inlineResult
        } else {
          // 5. Run procedure
          inlineResult = await this.orchestrator.executeMappedTool(
            "run_vba",
            {
              ...inlineParams,
              moduleNames: [moduleName],
              procedureName: `${moduleName}.ExecuteInline`,
            },
            EXECUTION_MAPPINGS.run_vba,
          );
        }
      }
    } catch (err) {
      inlineResult = failureResult(
        createDysflowError(
          "EXECUTION_ERROR",
          `Inline execution encountered an error: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    } finally {
      // 6. Clean up
      try {
        await this.orchestrator.executeMappedTool(
          "delete_module",
          { ...inlineParams, moduleName, force: true },
          EXECUTION_MAPPINGS.delete_module,
        );
      } catch {
        // Suppress deletion tool failure during cleanup
      }
      try {
        await this.fileSystem.rm(filePath, { force: true });
      } catch {
        // Suppress file removal failure
      }
    }

    return inlineResult;
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

    // PR1b (#621 F1) + #667 — default-deny gate. Fires AFTER plan resolution
    // (so we know which procedures will execute) and BEFORE both compile_vba
    // and the runner, so neither the binary write nor the test execution
    // happen when the plan is rejected. The previous order ran compile_vba
    // first, which wrote the .accdb even when the gate would later refuse —
    // an unwanted side effect on the live binary.
    const gateError = this.ensureTestProceduresAllowed(params, resolvedProcedureNames);
    if (gateError !== undefined) return gateError;

    // Round-3 Item 5 (P2) — explicit `dryRun: true` short-circuits BEFORE
    // both compile_vba and the test_vba runner call. The gate already ran
    // (so an out-of-allowlist procedure still emits PROCEDURE_NOT_ALLOWED);
    // dryRun:true only replaces the runner invocation with a plan-shaped
    // result so consumers can review what would have run. The schema gates
    // dryRun via `additionalProperties: false`, so the only way to reach
    // this branch is with the flag explicitly set to `true`.
    if (params.dryRun === true) {
      return successResult({
        dryRun: true,
        willExecute: false,
        willModifyAccess: false,
        plan: {
          procedureName: resolvedProcedureNames,
          proceduresCount: resolvedProcedureNames.length,
          compile: truthy(params.compile),
          warnings: [],
          errors: [],
        },
      });
    }

    if (truthy(params.compile)) {
      const compileResult = await this.orchestrator.executeMappedTool(
        "compile_vba",
        params,
        EXECUTION_MAPPINGS.compile_vba,
      );
      if (!compileResult.ok) return compileResult;
    }

    return inspectTestResult(
      await this.orchestrator.executeMappedTool(
        "test_vba",
        { ...params, proceduresJson: resolvedProceduresJson },
        EXECUTION_MAPPINGS.test_vba,
      ),
    );
  }

  /**
   * PR1b (#621 F1) — default-deny gate for test_vba at the adapter
   * boundary. Mirrors the MCP-handler gate semantics from
   * `canonical-handlers.ts:ensureProcedureAllowed`:
   *
   *   1. When `allowedProcedures` is undefined OR empty, refuse unless the
   *      caller passes `dryRun: true` (default-deny).
   *   2. When `allowedProcedures` is configured, EVERY procedure in the
   *      plan must appear in the list — the plan is atomic.
   *
   * Returns an `OperationResult<unknown>` failure when the gate refuses, or
   * `undefined` when execution may proceed. The error code is `MCP_INPUT_INVALID`
   * so consumers can grep for the same string regardless of which layer
   * caught the call (MCP-handler vs adapter). This layer returns
   * OperationResult, so the result translator wraps the code in the MCP text
   * exactly as it does for PR1a's MCP-handler refusals.
   */
  private ensureTestProceduresAllowed(
    params: Record<string, unknown>,
    procedures: readonly string[],
  ): OperationResult<unknown> | undefined {
    if (this.allowedProcedures === undefined || this.allowedProcedures.length === 0) {
      if (params.dryRun !== true) {
        return failureResult(
          createDysflowError(
            "MCP_INPUT_INVALID",
            `Refusing to execute test_vba plan [${procedures.join(", ")}]: ` +
              `project config must declare allowedProcedures (with every procedure in the list) ` +
              `OR caller must pass dryRun:true. ` +
              `Set allowedProcedures in .dysflow/project.json to allow these procedures.`,
          ),
        );
      }
      return undefined;
    }

    const allowSet = new Set(this.allowedProcedures);
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
            allowedProcedures: this.allowedProcedures,
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
      const filterParts = parseTestFilter(params.filter);
      const selected =
        filterParts === undefined
          ? tests
          : tests.filter((test) => matchesTestFilter(test, filterParts));
      if (selected.length === 0) {
        return failureResult(
          createDysflowError(
            "VBA_NO_TESTS_SELECTED",
            `No VBA tests selected from ${resolvedPath}${stringValue(params.filter) !== undefined ? ` with filter "${stringValue(params.filter)}"` : ""}.`,
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

function parseTestFilter(value: unknown): string[] | undefined {
  const filterText = stringValue(value);
  if (filterText === undefined) return undefined;
  const parts = filterText
    .split("|")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : undefined;
}

function matchesTestFilter(test: VbaTestPlanEntry, filterParts: readonly string[]): boolean {
  return filterParts.some(
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
 * Collapses an array of per-procedure runner results into a single failure when
 * any procedure reported `ok: false`, while PRESERVING the structured detail the
 * runner already produced. The runner returns one object per procedure
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
  const tests = Array.isArray(result.data) ? result.data : undefined;
  if (tests === undefined) return result;

  const failures = tests
    .filter((test): test is Record<string, unknown> => isRecord(test) && test.ok === false)
    .map(toTestFailureDetail);
  if (failures.length === 0) return result;

  return failureResult(
    createDysflowError("VBA_TESTS_FAILED", buildTestsFailedMessage(failures), {
      details: {
        failedCount: failures.length,
        failures,
        results: tests,
      },
    }),
    { diagnostics: result.diagnostics, durationMs: result.durationMs },
  );
}
