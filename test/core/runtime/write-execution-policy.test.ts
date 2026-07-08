/**
 * Issue #779 — truth table for the (policy × risk) resolver.
 *
 * Locks down the v2.1.0 contract:
 *
 * - `safe-by-default` mode keeps the historical "every write-class tool
 *   defaults to dry-run: true" behavior — the new policy never weakens
 *   existing safety.
 * - `developer` mode flips ONLY `routine-dev-write` to `effectiveDryRunDefault: false`.
 *   Every other risk class stays at `true` (operator must still confirm).
 * - `requiresConfirmOverwriteSource` is `true` for `destructive-write`
 *   in `developer` mode only.
 *
 * Each (mode, risk) pair is asserted explicitly so the table becomes the
 * authoritative spec. Refactors that change a row MUST update the test.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_DRY_RUN_TABLE,
  inputOptsIntoExecution,
  parseWriteExecutionPolicyValue,
  resolveWriteExecutionPolicy,
  TOOL_RISKS,
  type ToolRisk,
  WRITE_EXECUTION_POLICIES,
  type WriteExecutionPolicy,
} from "../../../src/core/runtime/write-execution-policy";

describe("WRITE_EXECUTION_POLICIES / TOOL_RISKS — closed unions", () => {
  it("freezes the supported policy modes", () => {
    expect([...WRITE_EXECUTION_POLICIES]).toEqual(["safe-by-default", "developer"]);
  });

  it("freezes the supported risk classes", () => {
    expect([...TOOL_RISKS]).toEqual([
      "read-only",
      "routine-dev-write",
      "protected-write",
      "destructive-write",
      "arbitrary-write",
      "process-control",
    ]);
  });
});

describe("parseWriteExecutionPolicyValue() — defensive guard", () => {
  it("returns the policy for known modes", () => {
    expect(parseWriteExecutionPolicyValue("safe-by-default")).toBe("safe-by-default");
    expect(parseWriteExecutionPolicyValue("developer")).toBe("developer");
  });

  it("returns undefined for unknown / absent / wrong-typed values", () => {
    expect(parseWriteExecutionPolicyValue(undefined)).toBeUndefined();
    expect(parseWriteExecutionPolicyValue(null)).toBeUndefined();
    expect(parseWriteExecutionPolicyValue(123)).toBeUndefined();
    expect(parseWriteExecutionPolicyValue({})).toBeUndefined();
    expect(parseWriteExecutionPolicyValue("rambo")).toBeUndefined();
    expect(parseWriteExecutionPolicyValue("SAFE-BY-DEFAULT")).toBeUndefined();
  });
});

describe("resolveWriteExecutionPolicy() — dry-run truth table", () => {
  const cases: ReadonlyArray<{
    mode: WriteExecutionPolicy;
    risk: ToolRisk;
    expectedDryRun: boolean;
    expectedConfirmSource: boolean;
  }> = [
    // safe-by-default: every write class stays at true (legacy contract).
    {
      mode: "safe-by-default",
      risk: "read-only",
      expectedDryRun: true,
      expectedConfirmSource: false,
    },
    {
      mode: "safe-by-default",
      risk: "routine-dev-write",
      expectedDryRun: true,
      expectedConfirmSource: false,
    },
    {
      mode: "safe-by-default",
      risk: "protected-write",
      expectedDryRun: true,
      expectedConfirmSource: false,
    },
    {
      mode: "safe-by-default",
      risk: "destructive-write",
      expectedDryRun: true,
      expectedConfirmSource: false,
    },
    {
      mode: "safe-by-default",
      risk: "arbitrary-write",
      expectedDryRun: true,
      expectedConfirmSource: false,
    },
    {
      mode: "safe-by-default",
      risk: "process-control",
      expectedDryRun: true,
      expectedConfirmSource: false,
    },
    // developer: ONLY routine-dev-write flips to false.
    {
      mode: "developer",
      risk: "read-only",
      expectedDryRun: true,
      expectedConfirmSource: false,
    },
    {
      mode: "developer",
      risk: "routine-dev-write",
      expectedDryRun: false,
      expectedConfirmSource: false,
    },
    {
      mode: "developer",
      risk: "protected-write",
      expectedDryRun: true,
      expectedConfirmSource: false,
    },
    {
      mode: "developer",
      risk: "destructive-write",
      expectedDryRun: true,
      expectedConfirmSource: true, // exports can overwrite source
    },
    {
      mode: "developer",
      risk: "arbitrary-write",
      expectedDryRun: true,
      expectedConfirmSource: false,
    },
    {
      mode: "developer",
      risk: "process-control",
      expectedDryRun: true,
      expectedConfirmSource: false,
    },
  ];

  it("covers every (mode, risk) combination — refactor-safe", () => {
    expect(cases.length).toBe(WRITE_EXECUTION_POLICIES.length * TOOL_RISKS.length);
    for (const mode of WRITE_EXECUTION_POLICIES) {
      for (const risk of TOOL_RISKS) {
        const row = cases.find((c) => c.mode === mode && c.risk === risk);
        expect(row, `missing row mode=${mode}, risk=${risk}`).toBeDefined();
      }
    }
  });

  for (const row of cases) {
    it(`mode=${row.mode}, risk=${row.risk} → dry-run=${row.expectedDryRun}, confirm-source=${row.expectedConfirmSource}`, () => {
      const resolved = resolveWriteExecutionPolicy({
        mode: row.mode,
        risk: row.risk,
      });
      expect(resolved.mode).toBe(row.mode);
      expect(resolved.risk).toBe(row.risk);
      expect(resolved.effectiveDryRunDefault).toBe(row.expectedDryRun);
      expect(resolved.requiresConfirmOverwriteSource).toBe(row.expectedConfirmSource);
    });
  }

  it("matches DEFAULT_DRY_RUN_TABLE byte-for-byte (refactor net)", () => {
    // If a future PR adds a new mode or risk, the table and the iteration above
    // must stay in lockstep — we re-derive the rows from the const table here.
    for (const mode of WRITE_EXECUTION_POLICIES) {
      for (const risk of TOOL_RISKS) {
        const resolved = resolveWriteExecutionPolicy({ mode, risk });
        expect(resolved.effectiveDryRunDefault).toBe(DEFAULT_DRY_RUN_TABLE[mode][risk]);
      }
    }
  });
});

describe("inputOptsIntoExecution() — caller-supplied dry-run/apply override", () => {
  it("returns true when dryRun === false", () => {
    expect(inputOptsIntoExecution({ dryRun: false })).toBe(true);
  });

  it("returns true when apply === true", () => {
    expect(inputOptsIntoExecution({ apply: true })).toBe(true);
  });

  it("treats dryRun === true as plan mode (not opted-in)", () => {
    expect(inputOptsIntoExecution({ dryRun: true })).toBe(false);
    expect(inputOptsIntoExecution({ dryRun: true, apply: true })).toBe(true);
  });

  it("returns false when both flags are absent", () => {
    expect(inputOptsIntoExecution({})).toBe(false);
    expect(inputOptsIntoExecution({ unrelated: 1 })).toBe(false);
  });

  it("defensive defaults — null / non-object / undefined return false", () => {
    expect(inputOptsIntoExecution(null)).toBe(false);
    expect(inputOptsIntoExecution(undefined)).toBe(false);
    expect(inputOptsIntoExecution(123)).toBe(false);
    expect(inputOptsIntoExecution("true")).toBe(false);
  });
});
