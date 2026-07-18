/**
 * Round-12 (#972) — explain-builder.ts unit tests.
 *
 * Exercises every per-code decision-tree builder so the coverage floor on
 * `src/adapters/mcp/explain-builder.ts` is high. These tests are pure:
 * no filesystem, no PowerShell, no Access. They pin the contract that
 * every canonical code emits ≥3 steps (`FAIL` check → `LIKELY` root
 * cause hypothesis → `LIKELY` remediation), and that the generic
 * fallback handles codes outside the catalog the same way.
 */

import { describe, expect, it } from "vitest";
import {
  buildExplainFromDysflowError,
  buildExplainFromOperationResult,
  buildExplainObject,
  type ExplainObject,
  relatedIssueNumbersForCode,
} from "../../../src/adapters/mcp/explain-builder.js";
import {
  createDysflowError,
  failureResult,
  successResult,
} from "../../../src/core/contracts/index.js";

/**
 * Every ExplainObject MUST contain at least 3 steps (per #972). Pin
 * the contract here as a reusable predicate so individual code
 * builders can leverage it.
 */
function assertThreeStepTree(explain: ExplainObject | undefined): void {
  expect(explain).toBeDefined();
  expect(explain?.decisionTree.length).toBeGreaterThanOrEqual(3);
  expect(explain?.decisionTree[0]?.result).toBe("FAIL");
  // Step 2 should always carry a root-cause hypothesis.
  expect(explain?.decisionTree[1]?.result).toMatch(/^(LIKELY|PASS|FAIL)$/);
  // The last step must include a remediation text (step ≥ 3 has a
  // `remediation` field with non-empty content).
  const last = explain?.decisionTree[explain.decisionTree.length - 1];
  expect(typeof last?.remediation).toBe("string");
  expect((last?.remediation ?? "").length).toBeGreaterThan(0);
}

describe("buildExplainObject — decision tree per canonical code (#972)", () => {
  // ── Code-specific builders (12 codes with first-class trees) ──

  it("DESTINATION_ROOT_NOT_FOUND emits a 3+ step tree with FAIL on step 1", () => {
    const tree = buildExplainObject({
      code: "DESTINATION_ROOT_NOT_FOUND",
      message: "destinationRoot missing",
      details: { destinationRoot: "C:/repo/src" },
    });
    assertThreeStepTree(tree);
    expect(tree.summary).toContain("destinationRoot");
    expect(tree.decisionTree[1]?.check).toContain("git");
  });

  it("OUTSIDE_PROJECT_ROOT emits a 3+ step tree with sibling-worktree hypothesis", () => {
    const tree = buildExplainObject({
      code: "OUTSIDE_PROJECT_ROOT",
      message: "outside-project-root",
      details: { accessPath: "C:/external/Project.accdb" },
    });
    assertThreeStepTree(tree);
    expect(tree.decisionTree[1]?.check).toContain("sibling");
  });

  it("WRITE_LOCKED_BY_RUNNING_OP emits a 3+ step tree citing running markers", () => {
    const tree = buildExplainObject({
      code: "WRITE_LOCKED_BY_RUNNING_OP",
      message: "op-123,op-456",
    });
    assertThreeStepTree(tree);
    expect(tree.decisionTree[0]?.evidence).toContain("op-123");
  });

  it("CAPABILITIES_DISALLOW_WRITE emits a 3+ step tree", () => {
    const tree = buildExplainObject({
      code: "CAPABILITIES_DISALLOW_WRITE",
      message: "allowWrites=false",
    });
    assertThreeStepTree(tree);
    expect(tree.summary).toContain("allowWrites");
  });

  it("PROJECT_ID_MISMATCH emits a 3+ step tree with both projectIds in evidence", () => {
    const tree = buildExplainObject({
      code: "PROJECT_ID_MISMATCH",
      message: "id mismatch",
      details: { requestedProjectId: "A", configuredProjectId: "B" },
    });
    assertThreeStepTree(tree);
    expect(tree.summary).toContain("'A'");
    expect(tree.summary).toContain("'B'");
  });

  it("MCP_WRITES_DISABLED emits a 3+ step tree with the attempted tool name", () => {
    const tree = buildExplainObject({
      code: "MCP_WRITES_DISABLED",
      message: "writes disabled",
      details: { toolName: "delete_module" },
    });
    assertThreeStepTree(tree);
    expect(tree.decisionTree[0]?.evidence).toContain("delete_module");
  });

  it("MCP_PROCEDURE_NOT_ALLOWED emits a 3+ step tree naming the procedure", () => {
    const tree = buildExplainObject({
      code: "MCP_PROCEDURE_NOT_ALLOWED",
      message: "procedure not allowed",
      details: { procedure: "Test_X" },
    });
    assertThreeStepTree(tree);
    expect(tree.summary).toContain("Test_X");
  });

  it("MCP_ALLOWLIST_NOT_CONFIGURED emits a 3+ step tree", () => {
    const tree = buildExplainObject({
      code: "MCP_ALLOWLIST_NOT_CONFIGURED",
      message: "allowlist missing",
      details: { procedure: "Test_X" },
    });
    assertThreeStepTree(tree);
    expect(tree.summary).toContain("Test_X");
  });

  it("MCP_INPUT_INVALID emits a 3+ step tree citing the schema-rejection message", () => {
    const tree = buildExplainObject({
      code: "MCP_INPUT_INVALID",
      message: '"propertyName" is not allowed.',
    });
    assertThreeStepTree(tree);
    expect(tree.decisionTree[0]?.evidence).toContain("propertyName");
  });

  it("EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION cites destination + sourceRoot", () => {
    const tree = buildExplainObject({
      code: "EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION",
      message: "destination overlaps source",
      details: { destination: "C:/repo/src", sourceRoot: "C:/repo/src" },
    });
    assertThreeStepTree(tree);
    expect(tree.decisionTree[0]?.check).toContain("C:/repo/src");
  });

  it("FORM_UNKNOWN_PROPERTY cites control + attempted key", () => {
    const tree = buildExplainObject({
      code: "FORM_UNKNOWN_PROPERTY",
      message: "NoSuch is not recognized",
      details: { controlName: "txtName", attemptedKey: "NoSuch" },
    });
    assertThreeStepTree(tree);
    expect(tree.summary).toContain("NoSuch");
    expect(tree.summary).toContain("txtName");
  });

  it("FORM_PROPERTY_VALUE_INVALID cites expected + actual types", () => {
    const tree = buildExplainObject({
      code: "FORM_PROPERTY_VALUE_INVALID",
      message: "type mismatch",
      details: { property: "TabIndex", expectedType: "integer", actualType: "string" },
    });
    assertThreeStepTree(tree);
    expect(tree.summary).toContain("integer");
    expect(tree.summary).toContain("string");
  });

  // ── Fallback path ──

  it("unknown code falls back to genericExplain with ≥3 steps", () => {
    const tree = buildExplainObject({
      code: "FUTURE_ERROR_CODE_NOT_YET_CATALOGUED",
      message: "some unrecognized failure",
    });
    assertThreeStepTree(tree);
    expect(tree.summary).toBe("some unrecognized failure");
    // The fallback MUST still surface the code on the first step so an
    // agent can grep for `FUTURE_ERROR_CODE` in the tree.
    expect(tree.decisionTree[0]?.check).toContain("FUTURE_ERROR_CODE");
  });

  // ── relatedIssueNumbers lookup ──

  it("relatedIssueNumbersForCode returns the canonical bucket for known codes", () => {
    expect(relatedIssueNumbersForCode("DESTINATION_ROOT_NOT_FOUND")).toContain("#962");
    expect(relatedIssueNumbersForCode("MCP_WRITES_DISABLED")).toContain("#659");
    expect(relatedIssueNumbersForCode("MCP_INPUT_INVALID")).toContain("#757");
    expect(relatedIssueNumbersForCode("MCP_ALLOWLIST_NOT_CONFIGURED")).toContain("#757");
    expect(relatedIssueNumbersForCode("EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION")).toContain(
      "#785",
    );
    expect(relatedIssueNumbersForCode("CAPABILITIES_DISALLOW_WRITE")).toEqual(
      expect.arrayContaining(["#962", "#659"]),
    );
  });

  it("relatedIssueNumbersForCode falls back to #972 for unknown codes", () => {
    expect(relatedIssueNumbersForCode("UNKNOWN_CODE")).toEqual(["#972"]);
  });

  // ── Convenience helpers (DysflowError / OperationResult variants) ──

  it("buildExplainFromDysflowError surfaces code + message + remediation", () => {
    const error = createDysflowError("DESTINATION_ROOT_NOT_FOUND", "missing dir", {
      remediation: "mkdir -p C:/repo/src",
    });
    const tree = buildExplainFromDysflowError(error);
    assertThreeStepTree(tree);
    // The remediation is overridden by the source.error.remediation value.
    expect(tree.decisionTree[2]?.remediation).toContain("mkdir");
  });

  it("buildExplainFromOperationResult returns undefined on success", () => {
    const ok = successResult({ rows: [] });
    expect(buildExplainFromOperationResult(ok)).toBeUndefined();
  });

  it("buildExplainFromOperationResult returns ExplainObject on failure", () => {
    const result = failureResult(
      createDysflowError("MCP_WRITES_DISABLED", "writes disabled", {
        details: { toolName: "delete_module" },
      }),
    );
    const tree = buildExplainFromOperationResult(result);
    assertThreeStepTree(tree);
    expect(tree?.decisionTree[0]?.evidence).toContain("delete_module");
  });
});
