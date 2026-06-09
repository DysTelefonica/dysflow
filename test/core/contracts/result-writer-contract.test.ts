import { describe, expect, it } from "vitest";
import {
  buildSerializationFailedEnvelope,
  DIAGNOSTICS_MAX_LENGTH,
  DIAGNOSTICS_PREFIX,
  PAYLOAD_TYPE_WHITELIST,
  RESULT_MARKER,
  SERIALIZATION_FAILED_CODE,
  whyPayloadTypeIsNotWhitelisted,
} from "../../../src/core/contracts/index";

/**
 * Spec for the Write-DysflowResult writer contract (issue #496).
 *
 * This suite pins the **observable contract** that any adapter
 * implementing `Write-DysflowResult` must satisfy. It is intentionally
 * pure: no PowerShell, no Access COM, no filesystem. The PowerShell
 * adapters in `scripts/dysflow-vba-manager.ps1` and
 * `scripts/dysflow-access-runner.ps1` are tested separately through
 * the E2E suite (`test/e2e/import-modules-regression.e2e.test.ts`),
 * which spawns `pwsh` and asserts the captured stdout.
 *
 * If this suite fails, the contract itself has changed and any
 * adapter implementation must be updated to match. If an E2E test
 * fails while this suite stays green, the contract holds but the
 * adapter drifted — the adapter is the defect.
 */
describe("Write-DysflowResult contract (issue #496)", () => {
  describe("payload type whitelist", () => {
    it("accepts primitive types (string, number, boolean, null, undefined)", () => {
      expect(whyPayloadTypeIsNotWhitelisted(null)).toBeNull();
      expect(whyPayloadTypeIsNotWhitelisted(undefined)).toBeNull();
      expect(whyPayloadTypeIsNotWhitelisted("hello")).toBeNull();
      expect(whyPayloadTypeIsNotWhitelisted(42)).toBeNull();
      expect(whyPayloadTypeIsNotWhitelisted(true)).toBeNull();
      expect(whyPayloadTypeIsNotWhitelisted(false)).toBeNull();
    });

    it("accepts plain arrays and plain objects", () => {
      expect(whyPayloadTypeIsNotWhitelisted([])).toBeNull();
      expect(whyPayloadTypeIsNotWhitelisted([1, 2, 3])).toBeNull();
      expect(whyPayloadTypeIsNotWhitelisted({ a: 1 })).toBeNull();
      expect(whyPayloadTypeIsNotWhitelisted({ nested: { ok: true } })).toBeNull();
    });

    it("rejects Map and Set (Collection-like, not whitelisted)", () => {
      const mapReason = whyPayloadTypeIsNotWhitelisted(new Map());
      expect(mapReason).not.toBeNull();
      expect(mapReason).toMatch(/Map|Collection|prototype/i);

      const setReason = whyPayloadTypeIsNotWhitelisted(new Set());
      expect(setReason).not.toBeNull();
    });

    it("rejects class instances and Date", () => {
      class CustomClass {
        x = 1;
      }
      const reason = whyPayloadTypeIsNotWhitelisted(new CustomClass());
      expect(reason).not.toBeNull();
      expect(reason).toMatch(/non-plain|CustomClass|prototype/i);

      const dateReason = whyPayloadTypeIsNotWhitelisted(new Date());
      expect(dateReason).not.toBeNull();
    });

    it("rejects functions and symbols", () => {
      expect(whyPayloadTypeIsNotWhitelisted(() => 1)).not.toBeNull();
      expect(whyPayloadTypeIsNotWhitelisted(Symbol("x"))).not.toBeNull();
    });

    it("exposes the whitelist as a frozen, public list (so AST guards and adapters share one source of truth)", () => {
      // Adding to or removing from the whitelist is a contract change;
      // pin the canonical list so the AST guard and the spec cannot
      // drift apart silently.
      expect([...PAYLOAD_TYPE_WHITELIST]).toEqual([
        "null",
        "string",
        "number",
        "boolean",
        "object[]",
        "pscustomobject",
        "Record<string, unknown>",
        "[ordered]@{}",
        "[hashtable]",
      ]);
    });
  });

  describe("sentinel contract (issue #440)", () => {
    it("exposes a single canonical prefix that the TS extractor and the PS writer both use", () => {
      // RESULT_MARKER here MUST equal the one in ps-result-channel.ts.
      // If a future refactor changes one but not the other, the
      // strict sentinel extractor would silently lose every result.
      expect(RESULT_MARKER).toBe("DYSFLOW_RESULT ");
    });
  });

  describe("fallback envelope (the contract that prevents diagnostic loss)", () => {
    it("emits a non-empty diagnostics array whose first element names the original cause", () => {
      const envelope = buildSerializationFailedEnvelope(
        "VBA_MANAGER_SERIALIZATION_FAILED",
        "System.ArgumentException: Argument types do not match",
      );
      expect(envelope.ok).toBe(false);
      expect(envelope.error.code).toBe("VBA_MANAGER_SERIALIZATION_FAILED");
      expect(envelope.error.message).toBe(
        "Write-DysflowResult could not serialize the result payload.",
      );
      expect(envelope.diagnostics.length).toBeGreaterThan(0);
      expect(envelope.diagnostics[0]).toMatch(/^LastSerializationError: /);
      expect(envelope.diagnostics[0]).toContain("Argument types do not match");
    });

    it("truncates diagnostics text at the documented 4 KB budget to keep the sentinel line bounded", () => {
      const longText = "x".repeat(DIAGNOSTICS_MAX_LENGTH * 2);
      const envelope = buildSerializationFailedEnvelope(
        "VBA_MANAGER_SERIALIZATION_FAILED",
        longText,
      );
      const first = envelope.diagnostics[0];
      if (first === undefined) {
        throw new Error("diagnostics[0] must be defined per the contract");
      }
      // Prefix + truncated text + suffix must not exceed the budget
      // by more than the prefix length and the suffix overhead.
      expect(first.length).toBeLessThanOrEqual(
        DIAGNOSTICS_PREFIX.length + DIAGNOSTICS_MAX_LENGTH + "...[truncated]".length,
      );
      expect(first).toContain("...[truncated]");
    });

    it("does not truncate when the original text fits in the budget", () => {
      const envelope = buildSerializationFailedEnvelope(
        "VBA_MANAGER_SERIALIZATION_FAILED",
        "short",
      );
      expect(envelope.diagnostics[0]).toBe(`${DIAGNOSTICS_PREFIX}short`);
      expect(envelope.diagnostics[0]).not.toContain("truncated");
    });

    it("accepts subclass codes so per-script variants stay in the same family", () => {
      const vba = buildSerializationFailedEnvelope("VBA_MANAGER_SERIALIZATION_FAILED", "x");
      const runner = buildSerializationFailedEnvelope("RUNNER_SERIALIZATION_FAILED", "x");
      expect(vba.error.code).toMatch(new RegExp(`${SERIALIZATION_FAILED_CODE}$`));
      expect(runner.error.code).toMatch(new RegExp(`${SERIALIZATION_FAILED_CODE}$`));
    });

    it("never produces an empty diagnostics array (the contract that prevents silent failures)", () => {
      // Empty string after the prefix would still be a contract violation:
      // the operator would have nothing to grep for. Pin the predicate.
      const envelope = buildSerializationFailedEnvelope("VBA_MANAGER_SERIALIZATION_FAILED", "");
      expect(envelope.diagnostics[0]).toBe(`${DIAGNOSTICS_PREFIX}`);
      // The prefix alone is acceptable as a "no original text" signal,
      // but the field is non-empty so the AST guard can assert on it.
      expect(envelope.diagnostics[0]?.length).toBeGreaterThan(0);
    });
  });

  describe("contract invariants (the rules that survive any refactor)", () => {
    it("the fallback envelope is always an object (never a bare string or array)", () => {
      // Mirrors the production ConvertTo-Json -Compress output:
      // the writer wraps everything in {ok, error, diagnostics}.
      const envelope = buildSerializationFailedEnvelope("VBA_MANAGER_SERIALIZATION_FAILED", "x");
      expect(typeof envelope).toBe("object");
      expect(Array.isArray(envelope)).toBe(false);
      expect(typeof envelope.ok).toBe("boolean");
      expect(typeof envelope.error).toBe("object");
      expect(Array.isArray(envelope.diagnostics)).toBe(true);
    });

    it("the diagnostics prefix is a non-empty, stable string (so operators can grep for it)", () => {
      expect(DIAGNOSTICS_PREFIX.length).toBeGreaterThan(0);
      expect(DIAGNOSTICS_PREFIX).toBe("LastSerializationError: ");
    });

    it("the serialization-failed code is a non-empty, stable string (so callers can branch on it)", () => {
      expect(SERIALIZATION_FAILED_CODE.length).toBeGreaterThan(0);
      expect(SERIALIZATION_FAILED_CODE).toBe("SERIALIZATION_FAILED");
    });
  });
});
