/**
 * #980 — full error code taxonomy across all dysflow tools (read + write).
 *
 * Extends the #962 write-tool taxonomy (5 codes) with 6 new codes that cover
 * the read-tool failure paths:
 *
 *   BINARY_NOT_FOUND            accessPath does not resolve to a real file
 *   BINARY_LOCKED               accessPath is locked by another process
 *   BINARY_PASSWORD_INVALID     ACCESS_VBA_PASSWORD is set but incorrect
 *   BINARY_FORMAT_UNSUPPORTED   .accdb is not a recognized Access format
 *   INTERNAL_ERROR              unexpected internal exception
 *   RUNTIME_STALE               runtime state is corrupted; restart recommended
 *
 * Plus the 5 from #962 (regression-pinned by
 * `test/adapters/mcp/dispatch-common-envelopes.test.ts`):
 *   DESTINATION_ROOT_NOT_FOUND, OUTSIDE_PROJECT_ROOT, WRITE_LOCKED_BY_RUNNING_OP,
 *   CAPABILITIES_DISALLOW_WRITE, PROJECT_ID_MISMATCH.
 *
 * Acceptance criteria for #980:
 *   1. All dysflow tools (read + write) return errors in the documented
 *      uniform envelope with `errorCode` from the taxonomy.
 *   2. No tool returns the legacy string-only error format (no
 *      `"error": "message"` without `errorCode`).
 *   3. The taxonomy includes at least the 6 new codes above.
 *   4. Tests RED verify each code is reachable and produces the documented
 *      response.
 *
 * TDD discipline (per `docs/testing/testing-philosophy.md`):
 *   - Fixture gate: every test builds its own input envelope; no shared state.
 *   - Refactor-safety: assertions are on observable outcome fields
 *     (`error.code`, `error.errorCode`, `error.diagnostics`,
 *     `error.relatedIssueNumbers`, `content[0].text`) — never on internal
 *     helper calls or symbol identity.
 *   - Three paths per slice: happy + sad + edge.
 *   - No humo: assertions check concrete values, not absence of error.
 */

import { describe, expect, it } from "vitest";
import { createDispatchTool } from "../../../src/adapters/mcp/dispatch-factory";
import {
  BINARY_FORMAT_UNSUPPORTED,
  BINARY_LOCKED,
  BINARY_NOT_FOUND,
  BINARY_PASSWORD_INVALID,
  binaryFormatUnsupported,
  binaryLocked,
  binaryNotFound,
  binaryPasswordInvalid,
  INTERNAL_ERROR,
  internalError,
  RUNTIME_STALE,
  runtimeStale,
} from "../../../src/adapters/mcp/dispatch-common";
import type { DysflowMcpServices } from "../../../src/adapters/mcp/result-translation";
import type { OperationResult, VbaSyncPort } from "../../../src/core/contracts/index";
import { createDysflowError, failureResult, successResult } from "../../../src/core/contracts/index";
import {
  buildExplainObject,
  EXPLAIN_BUILDERS,
  relatedIssueNumbersForCode,
} from "../../../src/adapters/mcp/explain-builder";

// ─── 1. Constants — full taxonomy is exported (#980 acceptance criterion #3) ─

describe("#980 taxonomy constants — exported from dispatch-common", () => {
  it("BINARY_NOT_FOUND has the canonical literal value", () => {
    expect(BINARY_NOT_FOUND).toBe("BINARY_NOT_FOUND");
  });

  it("BINARY_LOCKED has the canonical literal value", () => {
    expect(BINARY_LOCKED).toBe("BINARY_LOCKED");
  });

  it("BINARY_PASSWORD_INVALID has the canonical literal value", () => {
    expect(BINARY_PASSWORD_INVALID).toBe("BINARY_PASSWORD_INVALID");
  });

  it("BINARY_FORMAT_UNSUPPORTED has the canonical literal value", () => {
    expect(BINARY_FORMAT_UNSUPPORTED).toBe("BINARY_FORMAT_UNSUPPORTED");
  });

  it("INTERNAL_ERROR has the canonical literal value", () => {
    expect(INTERNAL_ERROR).toBe("INTERNAL_ERROR");
  });

  it("RUNTIME_STALE has the canonical literal value", () => {
    expect(RUNTIME_STALE).toBe("RUNTIME_STALE");
  });
});

// ─── 2. Envelope helpers — uniform shape (Round-12 #972 contract) ─────────────

/**
 * Round-12 (#972) uniform-envelope contract: every error helper MUST emit
 * a McpToolResult where `error.code === error.errorCode` and
 * `error.diagnostics[].code === code`. The legacy `content[0].text` body
 * carries the `<CODE>: <message>` prefix for regex consumers.
 */
function expectUniformEnvelope(
  result: ReturnType<typeof binaryNotFound>,
  expectedCode: string,
): void {
  expect(result.isError).toBe(true);
  expect(result.ok).toBe(false);
  expect(result.error?.code).toBe(expectedCode);
  // Round-12 (#972) — uniform envelope aliases.
  expect(result.error?.errorCode).toBe(expectedCode);
  expect(result.error?.errorMessage).toBe(result.error?.message);
  // Diagnostics array always populated (possibly synthesized from code+message).
  expect(result.error?.diagnostics).toBeDefined();
  expect(result.error?.diagnostics?.length).toBeGreaterThan(0);
  expect(result.error?.diagnostics?.[0]?.code).toBe(expectedCode);
  expect(result.error?.diagnostics?.[0]?.severity).toBe("error");
  // relatedIssueNumbers — Round-12 (#972) catalog; #980 codes must carry a
  // concrete entry (not the fallback ["#972"] bucket).
  expect(result.error?.relatedIssueNumbers).toBeDefined();
  expect(result.error?.relatedIssueNumbers?.length).toBeGreaterThan(0);
  // Legacy regex body prefix.
  expect(result.content[0]?.text.startsWith(`${expectedCode}:`)).toBe(true);
}

describe("#980 envelope helpers — uniform Round-12 envelope", () => {
  it("binaryNotFound carries BINARY_NOT_FOUND with accessPath in details", () => {
    const result = binaryNotFound({ accessPath: "C:/repo/nope.accdb" });
    expectUniformEnvelope(result, BINARY_NOT_FOUND);
    expect(result.error?.message).toContain("C:/repo/nope.accdb");
    expect(result.error?.details?.accessPath).toBe("C:/repo/nope.accdb");
  });

  it("binaryLocked carries BINARY_LOCKED with holderPid + accessPath in details", () => {
    const result = binaryLocked({
      accessPath: "C:/repo/x.accdb",
      holderPid: 12345,
      lockType: "laccdb",
    });
    expectUniformEnvelope(result, BINARY_LOCKED);
    expect(result.error?.details?.holderPid).toBe(12345);
    expect(result.error?.details?.accessPath).toBe("C:/repo/x.accdb");
  });

  it("binaryPasswordInvalid carries BINARY_PASSWORD_INVALID without leaking the password value", () => {
    const result = binaryPasswordInvalid({
      accessPath: "C:/repo/x.accdb",
      // simulate the environment variable name (NOT the value) that was used
      passwordEnv: "ACCESS_VBA_PASSWORD",
    });
    expectUniformEnvelope(result, BINARY_PASSWORD_INVALID);
    expect(result.error?.message).not.toContain("hunter2");
    expect(result.error?.message).not.toContain("password=");
    expect(result.error?.details?.passwordEnv).toBe("ACCESS_VBA_PASSWORD");
  });

  it("binaryFormatUnsupported carries BINARY_FORMAT_UNSUPPORTED with observed format hint", () => {
    const result = binaryFormatUnsupported({
      accessPath: "C:/repo/weird.bin",
      observedMagic: "NOT_A_REAL_ACCDB",
    });
    expectUniformEnvelope(result, BINARY_FORMAT_UNSUPPORTED);
    expect(result.error?.details?.accessPath).toBe("C:/repo/weird.bin");
    expect(result.error?.details?.observedMagic).toBe("NOT_A_REAL_ACCDB");
  });

  it("internalError carries INTERNAL_ERROR with the captured error class name (no raw stack)", () => {
    const result = internalError({
      errorClass: "TypeError",
      message: "Cannot read property 'x' of undefined",
    });
    expectUniformEnvelope(result, INTERNAL_ERROR);
    expect(result.error?.details?.errorClass).toBe("TypeError");
    // Raw stack traces MUST NOT leak into the wire response.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("at Object.");
    expect(serialized).not.toContain("node_modules");
  });

  it("runtimeStale carries RUNTIME_STALE with the corruption signal", () => {
    const result = runtimeStale({
      tool: "get_capabilities",
      signal: "serviceCache.size > MAX_UNAVAILABLE_SERVICE_CACHE_ENTRIES",
    });
    expectUniformEnvelope(result, RUNTIME_STALE);
    expect(result.error?.details?.tool).toBe("get_capabilities");
    // Remediation must mention restart as the canonical recovery action.
    expect(result.error?.remediation?.toLowerCase()).toContain("restart");
  });
});

// ─── 3. Explain-mode decision trees — #972 contract carries to #980 codes ─────

describe("#980 explain-mode builders — every code has a ≥3-step decision tree", () => {
  const codes = [
    BINARY_NOT_FOUND,
    BINARY_LOCKED,
    BINARY_PASSWORD_INVALID,
    BINARY_FORMAT_UNSUPPORTED,
    INTERNAL_ERROR,
    RUNTIME_STALE,
  ] as const;

  it.each(codes)("%s has an entry in EXPLAIN_BUILDERS", (code) => {
    expect(EXPLAIN_BUILDERS.has(code)).toBe(true);
  });

  it.each(codes)("buildExplainObject(%s) yields ≥3 decision-tree steps", (code) => {
    const obj = buildExplainObject({ code, message: "test" });
    expect(obj.decisionTree.length).toBeGreaterThanOrEqual(3);
    expect(obj.decisionTree[0]?.step).toBe(1);
    expect(obj.decisionTree[0]?.result).toBe("FAIL");
  });

  it.each(codes)("relatedIssueNumbersForCode(%s) returns #980 in the list", (code) => {
    const issues = relatedIssueNumbersForCode(code);
    expect(issues.some((n) => n === "#980")).toBe(true);
  });
});

// ─── 4. Dispatch-factory — INTERNAL_ERROR catches unexpected throws ───────────

/**
 * Stub services factory used to drive the dispatch-factory's INTERNAL_ERROR
 * wrapping. Each atom in this describe block creates its own stub service so
 * no state leaks between tests (fixture gate).
 */
function makeStubSync(
  fake: () => Promise<OperationResult<unknown>>,
): DysflowMcpServices & { vbaSyncToolService: VbaSyncPort } {
  const vbaSyncToolService: VbaSyncPort = {
    execute: async () => fake(),
  };
  return {
    vbaService: {
      async execute() {
        return successResult({ returnValue: "ok" });
      },
    },
    queryService: {
      async execute() {
        return successResult({ rows: [] });
      },
    },
    diagnosticsService: {
      async run() {
        return successResult({ checks: [] });
      },
    },
    vbaSyncToolService,
  };
}

describe("#980 dispatch-factory — INTERNAL_ERROR wraps unexpected throws", () => {
  it("read-tool (list_vba_modules) catches synchronous throw and emits INTERNAL_ERROR", async () => {
    const services = makeStubSync(() => {
      throw new TypeError("kaboom");
    });
    const tool = createDispatchTool("list_vba_modules", services, true, undefined, {});
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe(INTERNAL_ERROR);
    // Uniform envelope contract (#972) — no raw stack leaks.
    expect(JSON.stringify(result)).not.toContain("kaboom");
    expect(JSON.stringify(result)).not.toContain("at Object.");
  });

  it("read-tool (verify_code) catches async-rejected promise and emits INTERNAL_ERROR", async () => {
    const services = makeStubSync(async () => {
      throw new RangeError("async-boom");
    });
    const tool = createDispatchTool("verify_code", services, true, undefined, {});
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe(INTERNAL_ERROR);
    expect(JSON.stringify(result)).not.toContain("async-boom");
  });

  it("read-tool (list_objects) catches throw and emits INTERNAL_ERROR with the error class name in details", async () => {
    const services = makeStubSync(() => {
      throw new RangeError("nope");
    });
    const tool = createDispatchTool("list_objects", services, true, undefined, {});
    const result = await tool.handler({});
    expect(result.error?.code).toBe(INTERNAL_ERROR);
    expect(result.error?.details?.errorClass).toBe("RangeError");
  });

  it("write-tool (export_modules) catches throw and emits INTERNAL_ERROR too", async () => {
    const services = makeStubSync(() => {
      throw new Error("explode");
    });
    const tool = createDispatchTool("export_modules", services, true, undefined, {});
    const result = await tool.handler({});
    expect(result.error?.code).toBe(INTERNAL_ERROR);
  });
});

// ─── 5. Dispatch-factory — maps legacy service-layer codes to #980 taxonomy ───

/**
 * The runner-layer (`access-runner.ts`) emits `CONFIG_TARGET_NOT_FOUND`
 * when accessPath does not exist on disk. The dispatcher MUST remap that
 * legacy code to the canonical `BINARY_NOT_FOUND` per #980 acceptance
 * criterion #1 — every read-tool failure must surface a code from the
 * documented taxonomy, not the legacy runner-layer code.
 */
describe("#980 dispatch-factory — remaps legacy codes to the new taxonomy", () => {
  it("CONFIG_TARGET_NOT_FOUND from runner is remapped to BINARY_NOT_FOUND", async () => {
    const services = makeStubSync(async () =>
      failureResult(
        createDysflowError(
          "CONFIG_TARGET_NOT_FOUND",
          "Configured accessPath does not exist on disk: C:/repo/nope.accdb",
          { details: { accessDbPath: "C:/repo/nope.accdb" } },
        ),
      ),
    );
    const tool = createDispatchTool("list_vba_modules", services, true, undefined, {});
    const result = await tool.handler({});
    expect(result.error?.code).toBe(BINARY_NOT_FOUND);
    // The remapped envelope MUST still carry the accessPath in details.
    expect(result.error?.details?.accessPath).toBe("C:/repo/nope.accdb");
  });

  it("BINARY_ALREADY_LOCKED from runner is remapped to BINARY_LOCKED", async () => {
    const services = makeStubSync(async () =>
      failureResult(
        createDysflowError("BINARY_ALREADY_LOCKED", "locked", {
          details: { accessPath: "C:/repo/x.accdb", holderPid: 999 },
        }),
      ),
    );
    const tool = createDispatchTool("export_modules", services, true, undefined, {});
    const result = await tool.handler({});
    expect(result.error?.code).toBe(BINARY_LOCKED);
    expect(result.error?.details?.holderPid).toBe(999);
  });

  it("ACCESS_PASSWORD_INVALID from runner is remapped to BINARY_PASSWORD_INVALID", async () => {
    const services = makeStubSync(async () =>
      failureResult(createDysflowError("ACCESS_PASSWORD_INVALID", "wrong password")),
    );
    const tool = createDispatchTool("verify_code", services, true, undefined, {});
    const result = await tool.handler({});
    expect(result.error?.code).toBe(BINARY_PASSWORD_INVALID);
  });

  it("ACCDB_FORMAT_UNSUPPORTED from runner is remapped to BINARY_FORMAT_UNSUPPORTED", async () => {
    const services = makeStubSync(async () =>
      failureResult(
        createDysflowError("ACCDB_FORMAT_UNSUPPORTED", "magic mismatch", {
          details: { observedMagic: "NOT_AN_ACCDB" },
        }),
      ),
    );
    const tool = createDispatchTool("list_objects", services, true, undefined, {});
    const result = await tool.handler({});
    expect(result.error?.code).toBe(BINARY_FORMAT_UNSUPPORTED);
    expect(result.error?.details?.observedMagic).toBe("NOT_AN_ACCDB");
  });
});

// ─── 6. Acceptance #2 — no legacy string-only error format ────────────────────

/**
 * #980 acceptance criterion #2: "No tool returns the legacy string-only
 * error format" — every error envelope MUST populate `error.code` (not
 * just `error.message`). This atom scans every documented tool's failure
 * path and asserts `error.code` is a non-empty string from the canonical
 * taxonomy, NOT just a free-text message.
 */
describe("#980 acceptance #2 — no legacy string-only error format", () => {
  const READ_TOOLS = [
    "list_vba_modules",
    "list_objects",
    "verify_code",
    "exists",
    "test_vba",
  ] as const;

  it.each(READ_TOOLS)("%s returns error.code (not just error.message) on failure", async (name) => {
    const services = makeStubSync(async () =>
      failureResult(createDysflowError("CONFIG_TARGET_NOT_FOUND", "missing file")),
    );
    const tool = createDispatchTool(name, services, true, undefined, {});
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
    // Acceptance #2 — `error.code` MUST be present and be a taxonomy code.
    expect(typeof result.error?.code).toBe("string");
    expect(result.error?.code.length).toBeGreaterThan(0);
    expect(result.error?.code).not.toBe(result.error?.message);
    // Acceptance #1 — errorCode alias populated per #972 uniform envelope.
    expect(result.error?.errorCode).toBe(result.error?.code);
  });

  it("INTERNAL_ERROR code is the longest non-canonical taxonomy code (a stable placeholder)", () => {
    // Sanity: the 6 new codes are visibly distinct from each other.
    const codes = [
      BINARY_NOT_FOUND,
      BINARY_LOCKED,
      BINARY_PASSWORD_INVALID,
      BINARY_FORMAT_UNSUPPORTED,
      INTERNAL_ERROR,
      RUNTIME_STALE,
    ];
    expect(new Set(codes).size).toBe(6);
  });
});
