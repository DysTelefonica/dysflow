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
    "Run",
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
  constructor(private readonly orchestrator: VbaSyncOrchestrator) {}

  static handles(toolName: string): boolean {
    return toolName === "run_vba" || toolName === "test_vba" || toolName === "compile_vba";
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<OperationResult<unknown>> {
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

  private async executeTestVba(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    if (truthy(params.compile)) {
      const compileResult = await this.orchestrator.executeMappedTool(
        "compile_vba",
        params,
        EXECUTION_MAPPINGS.compile_vba,
      );
      if (!compileResult.ok) return compileResult;
    }

    const directProceduresJson = stringValue(params.proceduresJson);
    if (directProceduresJson !== undefined) {
      const directPlan = validateTestProceduresJson(directProceduresJson);
      if (!directPlan.ok) return directPlan;
      return inspectTestResult(
        await this.orchestrator.executeMappedTool(
          "test_vba",
          { ...params, proceduresJson: directPlan.data },
          EXECUTION_MAPPINGS.test_vba,
        ),
      );
    }

    const planResult = await this.resolveTestProceduresJson(params);
    if (!planResult.ok) return planResult;
    return inspectTestResult(
      await this.orchestrator.executeMappedTool(
        "test_vba",
        { ...params, proceduresJson: planResult.data },
        EXECUTION_MAPPINGS.test_vba,
      ),
    );
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

      const projectRoot = stringValue(params.projectRoot) || this.orchestrator.cwd;
      const testsPath = stringValue(params.testsPath) ?? "tests.vba.json";
      const resolvedPath = isAbsolutePath(testsPath) ? testsPath : resolve(projectRoot, testsPath);
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

function directTestProceduresJson(input: Record<string, unknown>): string | undefined {
  return stringValue(input.proceduresJson);
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

function validateTestProceduresJson(proceduresJson: string): OperationResult<string> {
  try {
    const procedures = normalizeTestPlan(JSON.parse(proceduresJson));
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
