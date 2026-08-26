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
const reportSourceName = "Report_RptMonthly";
const fileEntry = (name: string) => ({
  name,
  isDirectory: () => false,
  isFile: () => true,
});

async function auditDocumentSources(options: {
  binaryName: string;
  documentModules: readonly string[];
  kind: "form" | "report";
  moduleEntries?: readonly string[];
  sourceEntries?: readonly string[];
  sourceName: string;
}) {
  const orchestrator = {
    runPreflightCleanup: runNoopPreflightCleanup,
    resolveExecutionTarget: async () =>
      successResult({ destinationRoot: root, accessPath: "C:/project/front.accdb" }),
    validateStrictContext: () => successResult(undefined),
    executeMappedTool: async () =>
      successResult({
        modules: ["__dysflow_inline__"],
        classes: [],
        forms: options.kind === "form" ? [options.binaryName] : [],
        reports: options.kind === "report" ? [options.binaryName] : [],
        documentModules: options.documentModules,
      }),
  } as unknown as VbaModulesOrchestrator;
  const fileSystem = {
    readdir: async (folder: string) => {
      if (folder === resolve(root, `${options.kind}s`)) {
        return (
          options.sourceEntries ?? [
            `${options.sourceName}.cls`,
            `${options.sourceName}.${options.kind}.txt`,
          ]
        ).map(fileEntry);
      }
      if (folder === resolve(root, "modules")) return (options.moduleEntries ?? []).map(fileEntry);
      return [];
    },
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
    const data = await auditDocumentSources({
      binaryName: "FormGestionRiesgos",
      documentModules: [formSourceName],
      kind: "form",
      sourceName: formSourceName,
    });

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
    const data = await auditDocumentSources({
      binaryName: "FormGestionRiesgos",
      documentModules: [],
      kind: "form",
      sourceName: formSourceName,
    });

    expect(data.orphans).not.toContainEqual(
      expect.objectContaining({ moduleName: formSourceName, isOrphan: true }),
    );
  });

  it("prefers the forms code-behind when a module has the same alias", async () => {
    const data = await auditDocumentSources({
      binaryName: "FormGestionRiesgos",
      documentModules: [formSourceName],
      kind: "form",
      moduleEntries: [`${formSourceName}.bas`],
      sourceEntries: [`${formSourceName}.form.txt`, `${formSourceName}.cls`],
      sourceName: formSourceName,
    });

    expect(data.orphans.find(({ moduleName }) => moduleName === "FormGestionRiesgos")).toEqual(
      expect.objectContaining({
        isOrphan: false,
        sourcePath: expect.stringMatching(/[\\/]forms[\\/]Form_FormGestionRiesgos\.cls$/i),
      }),
    );
  });

  it("does not treat a same-named module as form code-behind", async () => {
    const data = await auditDocumentSources({
      binaryName: "FormGestionRiesgos",
      documentModules: [formSourceName],
      kind: "form",
      moduleEntries: [`${formSourceName}.bas`],
      sourceEntries: [],
      sourceName: formSourceName,
    });

    expect(data.orphans.find(({ moduleName }) => moduleName === "FormGestionRiesgos")).toEqual(
      expect.objectContaining({ isOrphan: true, sourcePath: null }),
    );
  });
});

describe("Access report orphan normalization (#1605)", () => {
  it("pairs a binary report with its prefixed document-module source", async () => {
    const data = await auditDocumentSources({
      binaryName: "RptMonthly",
      documentModules: [reportSourceName],
      kind: "report",
      sourceName: reportSourceName,
    });

    expect(data.orphans.find(({ moduleName }) => moduleName === "RptMonthly")).toEqual(
      expect.objectContaining({
        isOrphan: false,
        sourcePath: expect.stringMatching(/Report_RptMonthly\.cls$/i),
      }),
    );
  });

  it("does not emit the prefixed report source as a second orphan", async () => {
    const data = await auditDocumentSources({
      binaryName: "RptMonthly",
      documentModules: [],
      kind: "report",
      sourceName: reportSourceName,
    });

    expect(data.orphans).not.toContainEqual(
      expect.objectContaining({ moduleName: reportSourceName, isOrphan: true }),
    );
  });
});
