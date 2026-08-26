import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  VbaModulesAdapter,
  type VbaModulesOrchestrator,
} from "../../../src/adapters/vba-sync/vba-modules-adapter.js";
import { successResult } from "../../../src/core/contracts/index.js";
import type { ComparisonFileSystemPort } from "../../../src/core/services/vba-source-comparison.js";
import { runNoopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

describe("managed source layout parity (#1577)", () => {
  it("routes orphan audit through the canonical managed-source rules", () => {
    const source = readFileSync(resolve("src/adapters/vba-sync/vba-modules-adapter.ts"), "utf8");
    const audit = source.slice(
      source.indexOf("async auditOrphans"),
      source.indexOf("private getComparisonContext"),
    );

    expect(audit).toContain("managedFolders(destinationRoot)");
    expect(audit).toContain("managedSourceFile(entry)");
    expect(audit).not.toContain('[".bas", ".cls"]');
  });

  it("audits every managed extension across every managed folder", async () => {
    const root = resolve("C:/project/src");
    const file = (name: string) => ({
      name,
      isDirectory: () => false,
      isFile: () => true,
    });
    const entries = new Map([
      [root, [file("RootModule.bas")]],
      [resolve(root, "modules"), [file("Standard.bas")]],
      [resolve(root, "classes"), [file("Customer.cls")]],
      [resolve(root, "forms"), [file("Orders.form.txt")]],
      [resolve(root, "reports"), [file("Summary.report.txt")]],
    ]);
    const orchestrator = {
      runPreflightCleanup: runNoopPreflightCleanup,
      resolveExecutionTarget: async () =>
        successResult({ destinationRoot: root, accessPath: "C:/project/front.accdb" }),
      validateStrictContext: () => successResult(undefined),
      executeMappedTool: async () =>
        successResult({
          modules: ["RootModule", "Standard"],
          classes: ["Customer"],
          forms: ["Orders"],
          reports: ["Summary"],
          documentModules: [],
        }),
    } as unknown as VbaModulesOrchestrator;
    const fileSystem = {
      readdir: async (folder: string) => entries.get(folder) ?? [],
    } as unknown as ComparisonFileSystemPort;

    const result = await new VbaModulesAdapter(orchestrator, fileSystem).execute(
      "vba_orphan_audit",
      {},
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      orphans: expect.arrayContaining(
        ["RootModule", "Standard", "Customer", "Orders", "Summary"].map((moduleName) =>
          expect.objectContaining({ moduleName, isOrphan: false, sourcePath: expect.any(String) }),
        ),
      ),
    });
  });

  it("does not pair a VBE module with a managed-extension directory", async () => {
    const root = resolve("C:/project/src");
    const orchestrator = {
      runPreflightCleanup: runNoopPreflightCleanup,
      resolveExecutionTarget: async () =>
        successResult({ destinationRoot: root, accessPath: "C:/project/front.accdb" }),
      validateStrictContext: () => successResult(undefined),
      executeMappedTool: async () =>
        successResult({
          modules: ["Legacy"],
          classes: [],
          forms: [],
          reports: [],
          documentModules: [],
        }),
    } as unknown as VbaModulesOrchestrator;
    const fileSystem = {
      readdir: async (folder: string) =>
        folder === resolve(root, "modules")
          ? [{ name: "Legacy.bas", isDirectory: () => true, isFile: () => false }]
          : [],
    } as unknown as ComparisonFileSystemPort;

    const result = await new VbaModulesAdapter(orchestrator, fileSystem).execute(
      "vba_orphan_audit",
      {},
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      orphans: [
        expect.objectContaining({ moduleName: "Legacy", isOrphan: true, sourcePath: null }),
      ],
    });
  });
});
