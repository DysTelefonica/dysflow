/**
 * #1166 — `test_vba` failure envelope must be accessible without string-parsing
 * `error.message`.
 *
 * Background: the docs at `assets/examples/test-vba.md` § "Result shape (what
 * the agent reads back)" promise a normal `{ ok: false, error: { code:
 * "VBA_TESTS_FAILED", details: { failedCount, failures[], results[] } } }`
 * envelope — matching `verify_code` and other read-class tools. The runtime
 * did attach `error.details.failures[]` at the core level
 * (see `inspectTestResult` in `src/adapters/vba-sync/vba-execution-adapter.ts`),
 * but consumers running inside OpenCode Code Mode (the JSON-wrapping bug
 * surface) report the structured envelope is practically inaccessible because
 * the host framework rewraps `isError: true` MCP responses as thrown `Error`
 * objects with only `.name` + `.message` reachable.
 *
 * The contract this suite REGRESSION-LOCKS:
 *
 *   1. `test_vba` failure path returns a normal `OperationResult` (does NOT
 *      throw). The resulting `McpToolResult` carries `isError: true`,
 *      `ok: false`, and `error` with structured fields.
 *   2. The structured `error.details.failures[]` array is reachable AS AN
 *      ARRAY with per-procedure entries carrying `procedure`, `error`,
 *      `logs`, `durationMs`, `payload`. Consumers should not need to
 *      regex-parse `error.message`.
 *   3. The full per-procedure report (including passing procedures) is
 *      preserved in `error.details.results[]` so a debugger can correlate
 *      failures against the manifest.
 *   4. The SUCCESS path is unchanged — `test_vba` returning a passing
 *      manifest still emits `isError: false`, `ok: true`, and the structured
 *      per-procedure data in `content[0].text`.
 *   5. The legacy `content[0].text` body still begins with `VBA_TESTS_FAILED:`
 *      so regex-based consumers that survived so far keep working.
 *
 * Fixture gate: every atom constructs its own `OperationResult` via the
 * production builders (`successResult`, `failureResult`,
 * `createDysflowError`). No shared mutable state, no production binary
 * access. Refactor-safety: assertions target the OBSERVABLE envelope
 * (fields the consumer reads), not internal helper names or call counts.
 */

import { describe, expect, it } from "vitest";
import { translateCoreResultToMcpContent } from "../../../src/adapters/mcp/result-translation";
import type { OperationResult } from "../../../src/core/contracts/index";
import {
  createDysflowError,
  failureResult,
  successResult,
} from "../../../src/core/contracts/index";

type TestFailureDetail = {
  procedure?: string;
  error?: string;
  logs?: unknown[];
  durationMs?: number;
  payload?: unknown;
};

type TestFailureDetails = {
  failedCount: number;
  failures: TestFailureDetail[];
  results: unknown[];
};

/**
 * Builder: collapse per-procedure failures into the `VBA_TESTS_FAILED`
 * envelope that `inspectTestResult` produces. Mirrors the production shape
 * so atoms assert the OBSERVABLE envelope end-to-end.
 */
function makeVbaTestsFailedResult(
  failures: readonly TestFailureDetail[],
  results: readonly unknown[],
  message?: string,
): OperationResult<unknown> {
  const TESTS_FAILED_SUMMARY_LIMIT = 5;
  const named = failures.slice(0, TESTS_FAILED_SUMMARY_LIMIT).map((f) => {
    const procedure = f.procedure ?? "(unknown procedure)";
    return f.error ? `${procedure} — ${f.error}` : procedure;
  });
  const overflow = failures.length - named.length;
  const suffix = overflow > 0 ? `; +${overflow} more` : "";
  const defaultMessage = `${failures.length} VBA test(s) failed: ${named.join("; ")}${suffix}`;
  return failureResult(
    createDysflowError("VBA_TESTS_FAILED", message ?? defaultMessage, {
      details: {
        failedCount: failures.length,
        failures,
        results,
      },
    }),
  );
}

/**
 * Strict per-procedure shape assertion. Locks the contract that every
 * entry of `error.details.failures[]` carries `procedure`, `error`, `logs`,
 * `durationMs`, and `payload` reachable WITHOUT regex-parsing
 * `error.message`. Optional fields (`durationMs`, `payload`) must equal
 * `undefined` exactly when the runner omitted them.
 */
function assertFullFailureDetail(
  detail: TestFailureDetail | undefined,
  expected: TestFailureDetail,
): void {
  expect(detail?.procedure).toBe(expected.procedure);
  expect(detail?.error).toBe(expected.error);
  expect(detail?.logs).toEqual(expected.logs ?? []);
  expect(detail?.durationMs).toBe(expected.durationMs);
  expect(detail?.payload).toEqual(expected.payload);
}

function makeFailingResult(): OperationResult<unknown> {
  const failures: TestFailureDetail[] = [
    {
      procedure: "Test_B",
      error: "Assert failed",
      logs: ["expected 1", "got 2"],
      durationMs: 123,
      payload: { ok: false, error: "Assert failed" },
    },
    {
      procedure: "Test_D",
      error: "Timeout",
      logs: ["slow start"],
      durationMs: 999,
      payload: { ok: false, error: "Timeout" },
    },
  ];
  const results: unknown[] = [
    { ok: true, procedure: "Test_A", durationMs: 4 },
    {
      ok: false,
      procedure: "Test_B",
      error: "Assert failed",
      logs: ["expected 1", "got 2"],
      durationMs: 123,
      payload: { ok: false, error: "Assert failed" },
    },
    { ok: true, procedure: "Test_C", durationMs: 6 },
    {
      ok: false,
      procedure: "Test_D",
      error: "Timeout",
      logs: ["slow start"],
      durationMs: 999,
      payload: { ok: false, error: "Timeout" },
    },
  ];
  return makeVbaTestsFailedResult(failures, results);
}

describe("#1166 — test_vba failure envelope is reachable without parsing error.message", () => {
  describe("failure path returns a structured envelope (NOT a throw)", () => {
    it("returns ok:false / isError:true with error.code = VBA_TESTS_FAILED", () => {
      const translated = translateCoreResultToMcpContent(makeFailingResult());
      expect(translated.isError).toBe(true);
      expect(translated.ok).toBe(false);
      expect(translated.error?.code).toBe("VBA_TESTS_FAILED");
    });

    it("preserves the structured error.details.failures[] array with full per-procedure shape", () => {
      const translated = translateCoreResultToMcpContent(makeFailingResult());
      const details = translated.error?.details as TestFailureDetails | undefined;
      expect(details).toBeDefined();
      expect(Array.isArray(details?.failures)).toBe(true);
      const failures = details?.failures ?? [];
      expect(failures).toHaveLength(2);

      // Per-procedure entries carry every field the docs promise — procedure,
      // error, logs, durationMs, payload — all reachable WITHOUT regex-parsing
      // error.message.
      assertFullFailureDetail(failures[0], {
        procedure: "Test_B",
        error: "Assert failed",
        logs: ["expected 1", "got 2"],
        durationMs: 123,
        payload: { ok: false, error: "Assert failed" },
      });
      assertFullFailureDetail(failures[1], {
        procedure: "Test_D",
        error: "Timeout",
        logs: ["slow start"],
        durationMs: 999,
        payload: { ok: false, error: "Timeout" },
      });
    });

    it("surfaces the full per-procedure report in error.details.results[] (passing + failing)", () => {
      const translated = translateCoreResultToMcpContent(makeFailingResult());
      const details = translated.error?.details as TestFailureDetails | undefined;
      const results = details?.results;
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(4);
      expect(results?.[0]).toMatchObject({ ok: true, procedure: "Test_A" });
      expect(results?.[1]).toMatchObject({ ok: false, procedure: "Test_B" });
      expect(results?.[2]).toMatchObject({ ok: true, procedure: "Test_C" });
      expect(results?.[3]).toMatchObject({ ok: false, procedure: "Test_D" });
    });

    it("error.details.failedCount is reachable as a top-level integer", () => {
      const translated = translateCoreResultToMcpContent(makeFailingResult());
      const details = translated.error?.details as TestFailureDetails | undefined;
      expect(details?.failedCount).toBe(2);
    });

    it("does NOT require parsing error.message to find per-procedure data", () => {
      // Acceptance criterion #1 — the consumer can read structured fields
      // WITHOUT slicing error.message.
      const translated = translateCoreResultToMcpContent(makeFailingResult());
      const details = translated.error?.details as TestFailureDetails | undefined;

      // Read the procedure name directly off the structured field.
      const first = details?.failures[0];
      expect(first?.procedure).toBe("Test_B");

      // error.message is allowed to summarize, but consumers MUST NOT need
      // it. Sanity-check: even an empty message would still leave
      // error.details populated.
      expect(typeof translated.error?.message).toBe("string");
      expect(details).toBeDefined();
    });

    it("keeps the legacy text body starting with the VBA_TESTS_FAILED prefix for regex consumers", () => {
      const translated = translateCoreResultToMcpContent(makeFailingResult());
      expect(translated.content[0]?.text.startsWith("VBA_TESTS_FAILED:")).toBe(true);
    });

    it("is JSON-stringifiable end-to-end (Code Mode F14 contract still holds)", () => {
      // The MCP wire response must be JSON.stringify-able as a whole so the
      // dysflow-usage § Code Mode JSON-wrapping workaround returns a real
      // object, not [object Object].
      const translated = translateCoreResultToMcpContent(makeFailingResult());
      const text = JSON.stringify(translated);
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const error = parsed.error as { code?: string; details?: TestFailureDetails };
      expect(error.code).toBe("VBA_TESTS_FAILED");
      expect(error.details?.failures).toHaveLength(2);
    });

    it("surfaces #1166 in error.relatedIssueNumbers so consumers can grep the source PR", () => {
      // Regression-lock the related-issue register so a future cleanup of
      // explain-builder.ts does not silently drop #1166.
      const translated = translateCoreResultToMcpContent(makeFailingResult());
      const issueNumbers = translated.error?.relatedIssueNumbers ?? [];
      expect(issueNumbers).toContain("#1166");
    });
  });

  describe("single-procedure failure path", () => {
    it("preserves the single failing procedure's structured payload", () => {
      const failures: TestFailureDetail[] = [
        {
          procedure: "Test_Only",
          error: "boom",
          logs: [],
          durationMs: 7,
          payload: { ok: false, error: "boom" },
        },
      ];
      const results: unknown[] = [
        { ok: true, procedure: "Test_Other", durationMs: 1 },
        {
          ok: false,
          procedure: "Test_Only",
          error: "boom",
          logs: [],
          durationMs: 7,
          payload: { ok: false, error: "boom" },
        },
      ];
      const translated = translateCoreResultToMcpContent(
        makeVbaTestsFailedResult(failures, results),
      );
      const details = translated.error?.details as TestFailureDetails | undefined;
      expect(details?.failedCount).toBe(1);
      expect(details?.failures).toHaveLength(1);
      assertFullFailureDetail(details?.failures[0], {
        procedure: "Test_Only",
        error: "boom",
        logs: [],
        durationMs: 7,
        payload: { ok: false, error: "boom" },
      });
      expect(details?.results).toHaveLength(2);
    });
  });

  describe("edge cases — payload can be undefined / logs empty / durationMs missing", () => {
    it("accepts failures with undefined payload, empty logs, and missing durationMs", () => {
      const failures: TestFailureDetail[] = [
        {
          procedure: "Test_Edge",
          error: "edge",
          logs: [],
          payload: undefined,
        },
      ];
      const results: unknown[] = [
        {
          ok: false,
          procedure: "Test_Edge",
          error: "edge",
          logs: [],
          payload: undefined,
        },
      ];
      const translated = translateCoreResultToMcpContent(
        makeVbaTestsFailedResult(failures, results),
      );
      const details = translated.error?.details as TestFailureDetails | undefined;
      assertFullFailureDetail(details?.failures[0], {
        procedure: "Test_Edge",
        error: "edge",
        logs: [],
        payload: undefined,
      });
    });
  });

  describe("success path is unchanged (#1166 AC #4 — no regression)", () => {
    it("a fully-passing manifest returns isError:false / ok:true with the per-procedure data", () => {
      const ok = successResult([
        { ok: true, procedure: "Test_A", durationMs: 4 },
        { ok: true, procedure: "Test_B", durationMs: 5 },
      ]);
      const translated = translateCoreResultToMcpContent(ok);
      expect(translated.isError).toBe(false);
      expect(translated.ok).toBe(true);
      // The structured payload parses cleanly as JSON.
      const text = translated.content[0]?.text ?? "";
      const parsed = JSON.parse(text) as Array<{ ok: boolean; procedure: string }>;
      expect(parsed).toHaveLength(2);
      expect(parsed[0]?.procedure).toBe("Test_A");
      expect(parsed[1]?.procedure).toBe("Test_B");
    });

    it("an empty-passing-list manifest still surfaces ok:true (defensive — runner bug)", () => {
      const ok = successResult([]);
      const translated = translateCoreResultToMcpContent(ok);
      expect(translated.isError).toBe(false);
      expect(translated.ok).toBe(true);
    });
  });
});
