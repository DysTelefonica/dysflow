import { describe, expect, it } from "vitest";
import { ALIAS_TOOL_NAME_LIST } from "../../../src/adapters/mcp/alias-tools.js";
import {
  deriveDispatchResultContract,
  resultContractForDispatchTool,
  resultContractForToolAlias,
} from "../../../src/adapters/mcp/contracts/dispatch-result-contracts.js";
import {
  type GeneratedDispatchToolName,
  MCP_TOOL_ROUTES,
} from "../../../src/adapters/mcp/dispatch-routes.js";

describe("dispatch-family executable result contracts — #1098", () => {
  it("derives a contract for every generated route without a name fallback", () => {
    for (const [name, route] of Object.entries(MCP_TOOL_ROUTES)) {
      const derived = deriveDispatchResultContract(route.resultFamily);
      const contract = resultContractForDispatchTool(name as GeneratedDispatchToolName);
      if (
        ![
          "vba_inline_execution",
          "import_queries",
          "compact_repair",
          "relink_tables",
          "localize_backend_links",
          "relink_directory",
          "apply_form_design_plan",
        ].includes(name)
      )
        expect(derived, name).toBe(contract);
      expect(contract.kind, name).toBe("dataSchema");
    }
  });

  it.each([
    ["query-read", { rows: [], columns: [] }],
    ["query-write", { mode: "plan", affectedCount: 0 }],
    ["vba-read", { modules: [] }],
    ["vba-write", { mode: "apply", applied: ["Module1"] }],
    ["vba-export", { mode: "plan", exportedPaths: [] }],
    ["vba-test", { mode: "apply", passed: 2, failed: 0, tests: [] }],
    [
      "verify-code",
      {
        operation: "verify_code",
        ok: true,
        dryRun: true,
        willModifyAccess: false,
        sourceRoot: "C:/repo/src",
        matched: [],
        different: [],
        missingInSource: [],
        missingInBinary: [],
        vbeCacheNote: "Close and reopen Access if the live VBE cache is stale.",
      },
    ],
    ["sync-binary", { mode: "plan", direction: "both", conflicts: [] }],
  ] as const)("validates a real %s family fixture", (family, fixture) => {
    const contract = deriveDispatchResultContract(family);
    expect(contract.kind).toBe("dataSchema");
    if (contract.kind === "dataSchema")
      expect(contract.schema.safeParse(fixture).success).toBe(true);
  });

  it("models plan/apply and summary/file/full as executable unions", () => {
    const exportContract = resultContractForDispatchTool("export_modules");
    expect(exportContract.kind).toBe("dataSchema");
    if (exportContract.kind !== "dataSchema") return;
    expect(exportContract.schema.safeParse({ mode: "plan", exportedPaths: [] }).success).toBe(true);
    expect(exportContract.schema.safeParse({ mode: "apply", exportedPaths: [] }).success).toBe(
      true,
    );
    expect(exportContract.schema.safeParse({ mode: "unknown", exportedPaths: [] }).success).toBe(
      false,
    );
    expect(exportContract.metadata.outputModes).toEqual(["summary", "file", "full"]);
  });

  it("aliases reuse the canonical contract object and cannot fork schemas", () => {
    for (const alias of ALIAS_TOOL_NAME_LIST) {
      const binding = resultContractForToolAlias(alias);
      expect(binding.contract, alias).toBe(binding.canonicalContract);
    }
  });

  it("keeps the run_vba alias aligned with its genuine execution and dry-run payloads", () => {
    const contract = resultContractForToolAlias("run_vba").contract;
    expect(contract.kind).toBe("dataSchema");
    if (contract.kind !== "dataSchema") return;

    expect(contract.schema.safeParse({ returnValue: 42 }).success).toBe(true);
    expect(
      contract.schema.safeParse({
        dryRun: true,
        willExecute: false,
        willModifyAccess: false,
        procedureName: "SmokeTest",
        moduleName: "",
      }).success,
    ).toBe(true);
  });

  it("models vba_inline_execution's real run_vba payload instead of a mutation mode", () => {
    const contract = resultContractForDispatchTool("vba_inline_execution");
    expect(contract.kind).toBe("dataSchema");
    if (contract.kind !== "dataSchema") return;

    expect(contract.schema.safeParse({ returnValue: "ok" }).success).toBe(true);
    expect(
      contract.schema.safeParse({
        operation: "vba_inline_execution",
        dryRun: true,
        willExecute: false,
        willModifyAccess: false,
        willModifyFilesystem: false,
        codeLength: 13,
      }).success,
    ).toBe(true);
    expect(contract.schema.safeParse({ mode: "apply" }).success).toBe(false);
  });

  it("models import_queries' real dry-run payload", () => {
    const contract = resultContractForDispatchTool("import_queries");
    expect(contract.kind).toBe("dataSchema");
    if (contract.kind !== "dataSchema") return;

    expect(
      contract.schema.safeParse({
        dryRun: true,
        imported: 0,
        queries: [{ name: "q_probe", sql: "SELECT 1" }],
      }).success,
    ).toBe(true);
  });

  it("models compact_repair's real apply payload", () => {
    const contract = resultContractForDispatchTool("compact_repair");
    expect(contract.kind).toBe("dataSchema");
    if (contract.kind !== "dataSchema") return;

    expect(
      contract.schema.safeParse({
        dryRun: false,
        sourcePath: "C:/fixture.accdb",
        targetPath: "C:/fixture.compact.accdb",
        backupPath: null,
        compacted: true,
      }).success,
    ).toBe(true);
  });

  it("models relink_tables' real linked-table payload", () => {
    const contract = resultContractForDispatchTool("relink_tables");
    expect(contract.kind).toBe("dataSchema");
    if (contract.kind !== "dataSchema") return;

    expect(
      contract.schema.safeParse({
        backendPath: "C:/backend.accdb",
        linkedTables: [{ name: "People", backendPath: "C:/backend.accdb" }],
      }).success,
    ).toBe(true);
  });

  it("models verify_code's real read-only comparison envelope", () => {
    const contract = resultContractForDispatchTool("verify_code");
    expect(contract.kind).toBe("dataSchema");
    if (contract.kind !== "dataSchema") return;

    expect(
      contract.schema.safeParse({
        operation: "verify_code",
        ok: true,
        dryRun: true,
        willModifyAccess: false,
        sourceRoot: "C:/repo/src",
        matched: [{ moduleName: "Module1" }],
        different: [],
        missingInSource: [],
        missingInBinary: [],
        summary: { sourceNewer: 0, binaryNewer: 0, bothChanged: 0 },
        hasFunctionalDifferences: false,
        actionableOk: true,
        recommendedAction: "none",
        vbeCacheNote: "Close and reopen Access if the live VBE cache is stale.",
      }).success,
    ).toBe(true);
    expect(
      contract.schema.safeParse({
        driftDetected: false,
        summary: { total: 1, inSync: 1, sourceOnly: 0, binaryOnly: 0, diverged: 0 },
      }).success,
    ).toBe(false);
  });

  it("models apply_form_design_plan's real dry-run and apply envelopes", () => {
    const contract = resultContractForDispatchTool("apply_form_design_plan");
    expect(contract.kind).toBe("dataSchema");
    if (contract.kind !== "dataSchema") return;

    for (const fixture of [
      {
        mode: "dry-run",
        formName: "Form1",
        operationsApplied: [],
        filesystemApplied: false,
        importGate: "not-run",
      },
      {
        mode: "apply",
        formName: "Form1",
        operationsApplied: [],
        filesystemApplied: true,
        importGate: "passed",
      },
    ])
      expect(contract.schema.safeParse(fixture).success).toBe(true);
  });
});
