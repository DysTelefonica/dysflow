/**
 * Default-allow contract for the `run_vba` procedure gate.
 *
 * The gate enforces nothing unless the targeted project declares
 * `capabilities.procedures.strictMode: true` in `.dysflow/project.json`. The
 * write gate (`writesProcess.enabled`, `writesProject.allowWrites`,
 * `writeExecutionPolicy`) owns the unwanted-write risk and
 * `humanCompilePending` owns the stale-p-code risk, so a second allowlist that
 * every project had to hand-maintain bought operational cost and no safety.
 *
 * This file is the full decision matrix: the four config states of the gate
 * crossed with "procedure is in the list" / "procedure is not in the list".
 */

import { describe, expect, it } from "vitest";
import { ensureProcedureAllowed } from "../../../src/adapters/mcp/canonical-handlers";

type StrictModeInput = boolean | undefined;

const IN_LIST = "Refresh";
const NOT_IN_LIST = "IndicadorBackfill.ReconstructReplanificationSnapshots";
const POPULATED = ["Refresh", "Sync"] as const;

function codeOf(
  procedureName: string,
  allow: readonly string[] | undefined,
  strictMode: StrictModeInput,
): string | "ALLOW" {
  const result = ensureProcedureAllowed(procedureName, allow, false, strictMode);
  if (result === undefined) return "ALLOW";
  return result.error?.code ?? "UNKNOWN";
}

describe("procedure gate decision matrix — 4 config states x 2 membership cases", () => {
  const cases: {
    label: string;
    allow: readonly string[] | undefined;
    strictMode: StrictModeInput;
    inList: string | "ALLOW";
    notInList: string | "ALLOW";
  }[] = [
    {
      label: "allowlist absent, strictMode absent",
      allow: undefined,
      strictMode: undefined,
      inList: "ALLOW",
      notInList: "ALLOW",
    },
    {
      label: "allowlist empty, strictMode absent",
      allow: [],
      strictMode: undefined,
      inList: "ALLOW",
      notInList: "ALLOW",
    },
    {
      label: "allowlist populated, strictMode absent (list is documentation)",
      allow: POPULATED,
      strictMode: undefined,
      inList: "ALLOW",
      notInList: "ALLOW",
    },
    {
      label: "allowlist populated, strictMode true (enforced)",
      allow: POPULATED,
      strictMode: true,
      inList: "ALLOW",
      notInList: "MCP_PROCEDURE_NOT_ALLOWED",
    },
  ];

  for (const testCase of cases) {
    it(`${testCase.label} — procedure in list`, () => {
      expect(codeOf(IN_LIST, testCase.allow, testCase.strictMode)).toBe(testCase.inList);
    });

    it(`${testCase.label} — procedure not in list`, () => {
      expect(codeOf(NOT_IN_LIST, testCase.allow, testCase.strictMode)).toBe(testCase.notInList);
    });
  }

  it("strictMode true with no allowlist keeps the default-deny refusal", () => {
    expect(codeOf(NOT_IN_LIST, undefined, true)).toBe("MCP_ALLOWLIST_NOT_CONFIGURED");
    expect(codeOf(NOT_IN_LIST, [], true)).toBe("MCP_ALLOWLIST_NOT_CONFIGURED");
  });

  it("strictMode explicitly false behaves exactly like strictMode absent", () => {
    for (const testCase of cases) {
      if (testCase.strictMode === true) continue;
      expect(codeOf(NOT_IN_LIST, testCase.allow, false)).toBe("ALLOW");
    }
    // Including the case that would refuse under strict mode.
    expect(codeOf(NOT_IN_LIST, POPULATED, false)).toBe("ALLOW");
  });
});

describe("the consumer friction this contract removes", () => {
  it("runs a production procedure that was never registered in a populated test allowlist", () => {
    // The real report: a project whose `capabilities.procedures.allow` holds
    // only its Test_* atoms could not run a production backfill procedure
    // without first editing `.dysflow/project.json`.
    const testAtoms = ["Test_Indicadores_Calcular_ZeroCase_Atomic", "Test_Cache_InvalidarTodo"];
    expect(
      ensureProcedureAllowed(
        "IndicadorBackfill.ReconstructReplanificationSnapshots",
        testAtoms,
        false,
        undefined,
      ),
    ).toBeUndefined();
  });

  it("a project that opts into strictMode still refuses that same call", () => {
    const testAtoms = ["Test_Indicadores_Calcular_ZeroCase_Atomic"];
    const refusal = ensureProcedureAllowed(
      "IndicadorBackfill.ReconstructReplanificationSnapshots",
      testAtoms,
      false,
      true,
    );
    expect(refusal?.error?.code).toBe("MCP_PROCEDURE_NOT_ALLOWED");
  });
});
