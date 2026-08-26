import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  VbaModulesAdapter,
  type VbaModulesOrchestrator,
} from "../../../src/adapters/vba-sync/vba-modules-adapter.js";
import { successResult } from "../../../src/core/contracts/index.js";
import type { ComparisonFileSystemPort } from "../../../src/core/services/vba-source-comparison.js";
import { runNoopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

const root = resolve("C:/project/src");
const formSourceName = "Form_FormGestionRiesgos";

async function auditFormSources(documentModules: readonly string[]) {
  const orchestrator = {
    runPreflightCleanup: runNoopPreflightCleanup,
    resolveExecutionTarget: async () =>
      successResult({ destinationRoot: root, accessPath: "C:/project/front.accdb" }),
    validateStrictContext: () => successResult(undefined),
    executeMappedTool: async () =>
      successResult({
        modules: ["__dysflow_inline__"],
        classes: [],
        forms: ["FormGestionRiesgos"],
        reports: [],
        documentModules,
      }),
  } as unknown as VbaModulesOrchestrator;
  const fileSystem = {
    readdir: async (folder: string) =>
      folder === resolve(root, "forms")
        ? [`${formSourceName}.cls`, `${formSourceName}.form.txt`]
        : [],
  } as unknown as ComparisonFileSystemPort;

  const result = await new VbaModulesAdapter(orchestrator, fileSystem).execute(
    "vba_orphan_audit",
    {},
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected vba_orphan_audit to succeed");
  return result.data as {
    orphans: Array<{ isOrphan: boolean; moduleName: string; sourcePath: string | null }>;
  };
}

describe("Access form orphan normalization (#1591)", () => {
  it("pairs a binary form with its prefixed document-module source", async () => {
    const data = await auditFormSources([formSourceName]);

    expect(data.orphans.find(({ moduleName }) => moduleName === "FormGestionRiesgos")).toEqual(
      expect.objectContaining({
        isOrphan: false,
        sourcePath: expect.stringMatching(/Form_FormGestionRiesgos\.cls$/i),
      }),
    );
    expect(
      data.orphans.filter(({ isOrphan }) => isOrphan).map(({ moduleName }) => moduleName),
    ).toEqual(["__dysflow_inline__"]);
  });

  it("does not emit the prefixed source as a second orphan when document modules are omitted", async () => {
    const data = await auditFormSources([]);

    expect(data.orphans).not.toContainEqual(
      expect.objectContaining({ moduleName: formSourceName, isOrphan: true }),
    );
  });
});
