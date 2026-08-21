import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  orchestrateVbaImport,
  type VbaImportPassPort,
  type VbaImportRawAttempt,
} from "../../../src/core/services/vba-import-orchestration";

type FixtureCase = {
  id: string;
  targets: string[];
  passes: VbaImportRawAttempt[][];
  saveWarning?: string;
  expectedPassRequests: string[][];
  expectedSaveRequests: string[][];
  expectedExitCode: number;
  expectedResult: unknown;
};

const fixturePath = fileURLToPath(
  new URL("../../fixtures/vba-import-orchestration-contract.json", import.meta.url),
);
const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as {
  schemaVersion: string;
  invariants: string[];
  cases: FixtureCase[];
};

function fakePort(testCase: FixtureCase): {
  port: VbaImportPassPort;
  passRequests: string[][];
  saveRequests: string[][];
} {
  const passRequests: string[][] = [];
  const saveRequests: string[][] = [];
  const passes = [...testCase.passes];
  return {
    port: {
      runPass: async (moduleNames, rollbackOnMutationFailure) => {
        passRequests.push([...moduleNames]);
        expect(rollbackOnMutationFailure).toBe(true);
        const next = passes.shift();
        if (next === undefined) throw new Error(`No pass fixture remains for ${testCase.id}`);
        return { attempts: next };
      },
      save: async (moduleNames) => {
        saveRequests.push([...moduleNames]);
        return testCase.saveWarning === undefined ? {} : { warning: testCase.saveWarning };
      },
    },
    passRequests,
    saveRequests,
  };
}

describe("VBA import orchestration legacy contract (#1463)", () => {
  it("pins a versioned behavior matrix before the adapter logic moves", () => {
    expect(fixture.schemaVersion).toBe("dysflow.vba-import-orchestration-contract/v1");
    expect(fixture.invariants).toHaveLength(7);
    expect(fixture.cases.map((testCase) => testCase.id)).toEqual([
      "explicit-empty-plan",
      "existing-module-success",
      "created-component-save-only",
      "reimported-document-save-only",
      "progress-enables-targeted-retry",
      "typed-terminal-failure-with-rollback",
      "multi-module-no-progress-is-terminal",
      "save-warning-keeps-success",
    ]);
  });

  for (const testCase of fixture.cases) {
    it(`preserves ${testCase.id}`, async () => {
      const { port, passRequests, saveRequests } = fakePort(testCase);

      const result = await orchestrateVbaImport(testCase.targets, port);

      expect(passRequests).toEqual(testCase.expectedPassRequests);
      expect(saveRequests).toEqual(testCase.expectedSaveRequests);
      expect(result).toMatchObject({
        exitCode: testCase.expectedExitCode,
        result: testCase.expectedResult,
      });
    });
  }
});
