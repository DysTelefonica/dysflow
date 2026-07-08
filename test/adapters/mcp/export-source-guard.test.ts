/**
 * Issue #785 (v2.1.1) — export-source guard runtime enforcement tests.
 *
 * Capa 4 of `wire-write-policy-runtime-785`. Verifies:
 *
 *   1. `requiresExportSourceConfirmation` helper truth table (mode × tool ×
 *      destination × confirmation).
 *   2. `dispatch-factory` short-circuits on a refusal and surfaces a
 *      structured `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` envelope.
 *   3. The new structured-envelope shape (dispatch-common.ts) carries
 *      `code`, `message`, `destination`, `sourceRoot`, and `remediation`
 *      — mirroring the `MCP_PROCEDURE_NOT_ALLOWED` shape from #659.
 *
 * This is the runtime half of the v2.1.0 README §3b promise that the
 * dispatch layer refuses exports that would overwrite the active source
 * root unless the caller passes `confirmOverwriteSource: true`.
 */

import { describe, expect, it } from "vitest";
import {
  EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION,
  exportSourceGuardRefused,
} from "../../../src/adapters/mcp/dispatch-common";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { requiresExportSourceConfirmation } from "../../../src/adapters/mcp/write-execution-dispatch";
import { successResult } from "../../../src/core/contracts/index";

// ─── Helper truth table ──────────────────────────────────────────────────────

describe("requiresExportSourceConfirmation — truth table (#785, capa 4)", () => {
  it("developer + export_modules + destination == source root + no confirmation → refusal", () => {
    const out = requiresExportSourceConfirmation(
      "export_modules",
      "developer",
      { exportPath: "C:/Projets/dysflow" },
      { destination: "C:/Projets/dysflow", sourceRoot: "C:/Projets/dysflow" },
    );
    expect(out?.code).toBe(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
    expect(out?.toolName).toBe("export_modules");
    expect(out?.destination).toBe("C:/Projets/dysflow");
    expect(out?.sourceRoot).toBe("C:/Projets/dysflow");
    expect(out?.remediation).toContain("confirmOverwriteSource");
  });

  it("developer + export_modules + nested managed folder + no confirmation → refusal", () => {
    const out = requiresExportSourceConfirmation(
      "export_modules",
      "developer",
      { exportPath: "C:/Projets/dysflow/modules/Foo.bas" },
      {
        destination: "C:/Projets/dysflow/modules/Foo.bas",
        sourceRoot: "C:/Projets/dysflow",
      },
    );
    expect(out?.code).toBe(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
    expect(out?.destination).toBe("C:/Projets/dysflow/modules/Foo.bas");
  });

  it("developer + export_modules + external path → no refusal", () => {
    const out = requiresExportSourceConfirmation(
      "export_modules",
      "developer",
      { exportPath: "C:/elsewhere/temp" },
      { destination: "C:/elsewhere/temp", sourceRoot: "C:/Projets/dysflow" },
    );
    expect(out).toBeUndefined();
  });

  it("developer + export_modules + confirmOverwriteSource: true → no refusal", () => {
    const out = requiresExportSourceConfirmation(
      "export_modules",
      "developer",
      {
        exportPath: "C:/Projets/dysflow",
        confirmOverwriteSource: true,
      },
      { destination: "C:/Projets/dysflow", sourceRoot: "C:/Projets/dysflow" },
    );
    expect(out).toBeUndefined();
  });

  it("developer + export_all + confirmOverwriteSource: true → no refusal", () => {
    const out = requiresExportSourceConfirmation(
      "export_all",
      "developer",
      { destinationRoot: "C:/Projets/dysflow", confirmOverwriteSource: true },
      { destination: "C:/Projets/dysflow", sourceRoot: "C:/Projets/dysflow" },
    );
    expect(out).toBeUndefined();
  });

  it("safe-by-default + export_modules + dangerous destination → no refusal (policy never fires)", () => {
    // The guard is policy-driven. In safe-by-default mode the gate never
    // reaches the export-source guard; the dispatch seam fires the dryRun
    // default upstream. The helper still receives the call but the policy
    // resolution says `requiresConfirmOverwriteSource === false`.
    const out = requiresExportSourceConfirmation(
      "export_modules",
      "safe-by-default",
      { exportPath: "C:/Projets/dysflow" },
      { destination: "C:/Projets/dysflow", sourceRoot: "C:/Projets/dysflow" },
    );
    expect(out).toBeUndefined();
  });

  it("case-insensitive Windows overlap: C:\\Projets\\dysflow vs c:\\projets\\dysflow → refuse", () => {
    const out = requiresExportSourceConfirmation(
      "export_modules",
      "developer",
      { exportPath: "C:\\Projets\\dysflow" },
      { destination: "C:\\Projets\\dysflow", sourceRoot: "c:\\projets\\dysflow" },
    );
    expect(out?.code).toBe(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
  });

  it("mixed slashes: C:/Projets/dysflow matches C:\\Projets\\dysflow → refuse", () => {
    const out = requiresExportSourceConfirmation(
      "export_all",
      "developer",
      {},
      {
        destination: "C:/Projets/dysflow",
        sourceRoot: "C:\\Projets\\dysflow",
      },
    );
    expect(out?.code).toBe(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
  });

  it("dryRun:true + dangerous destination → refusal (guard fires regardless of dryRun)", () => {
    // Capa 4 contract: the export-source guard fires at the dispatch
    // boundary whenever the destination overlaps the active source root,
    // regardless of dryRun/apply. The dispatch seam surfaces the refusal
    // before any plan or commit begins. `confirmOverwriteSource: true`
    // is the only opt-out.
    const out = requiresExportSourceConfirmation(
      "export_modules",
      "developer",
      { exportPath: "C:/Projets/dysflow", dryRun: true },
      { destination: "C:/Projets/dysflow", sourceRoot: "C:/Projets/dysflow" },
    );
    expect(out?.code).toBe(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
  });

  it("apply:true + dangerous destination → refusal (execute mode)", () => {
    const out = requiresExportSourceConfirmation(
      "export_modules",
      "developer",
      { exportPath: "C:/Projets/dysflow", apply: true },
      { destination: "C:/Projets/dysflow", sourceRoot: "C:/Projets/dysflow" },
    );
    expect(out?.code).toBe(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
  });

  it("non-export tool (developer + destructive-write false) → no refusal (guard never fires)", () => {
    const out = requiresExportSourceConfirmation(
      "delete_module",
      "developer",
      {},
      { destination: "C:/Projets/dysflow", sourceRoot: "C:/Projets/dysflow" },
    );
    expect(out).toBeUndefined();
  });

  it("refusal envelope carries the requested-fields hint", () => {
    const out = requiresExportSourceConfirmation(
      "export_modules",
      "developer",
      {},
      {
        destination: "C:/Projets/dysflow/modules",
        sourceRoot: "C:/Projets/dysflow",
      },
    );
    expect(out).not.toBeNull();
    expect(out?.code).toBe(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
    expect(out?.message.toLowerCase()).toContain("export");
    expect(out?.remediation).toContain("confirmOverwriteSource");
  });
});

// ─── Envelope helper (dispatch-common.ts) ───────────────────────────────────

describe("exportSourceGuardRefused — envelope shape (#785, capa 4)", () => {
  it("emits the structured envelope with code, message, destination, sourceRoot, remediation", () => {
    const result = exportSourceGuardRefused({
      toolName: "export_modules",
      destination: "C:/Projets/dysflow",
      sourceRoot: "C:/Projets/dysflow",
    });
    expect(result.isError).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.content[0]?.text).toContain(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
    expect(result.error?.code).toBe(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
    expect(result.error?.destination).toBe("C:/Projets/dysflow");
    expect(result.error?.sourceRoot).toBe("C:/Projets/dysflow");
    expect(result.error?.remediation).toContain("confirmOverwriteSource");
  });
});

// ─── Dispatch seam short-circuit ────────────────────────────────────────────

class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}
class FakeVbaService {
  public requests: unknown[] = [];
  async execute(...args: unknown[]) {
    this.requests.push(args.length > 1 ? args[1] : args[0]);
    return successResult({ returnValue: "ok" });
  }
}
class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

function makeServices() {
  return {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
    vbaSyncToolService: new FakeVbaService(),
  };
}

describe("dispatch-factory — export-source guard short-circuit (#785, capa 4)", () => {
  it("developer + export_modules + matching destination → short-circuits with refusal envelope", async () => {
    const services = makeServices();
    const sourceRoot = "C:/Projets/dysflow";
    const tools = createDysflowMcpTools({
      services,
      writes: true,
      writeExecutionPolicy: "developer",
    });
    const tool = tools.find((candidate) => candidate.name === "export_modules");
    if (!tool) throw new Error("export_modules not registered");

    const result = await tool.handler({
      moduleNames: ["Foo"],
      destinationRoot: sourceRoot,
      exportPath: sourceRoot,
      confirmOverwriteSource: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
    expect(services.vbaSyncToolService.requests).toHaveLength(0);
  });

  it("developer + export_modules + confirmOverwriteSource:true → executes the runner", async () => {
    const services = makeServices();
    const sourceRoot = "C:/Projets/dysflow";
    const tools = createDysflowMcpTools({
      services,
      writes: true,
      writeExecutionPolicy: "developer",
    });
    const tool = tools.find((candidate) => candidate.name === "export_modules");
    if (!tool) throw new Error("export_modules not registered");

    await tool.handler({
      moduleNames: ["Foo"],
      destinationRoot: sourceRoot,
      exportPath: sourceRoot,
      confirmOverwriteSource: true,
    });

    expect(services.vbaSyncToolService.requests.length).toBeGreaterThanOrEqual(1);
  });

  it("safe-by-default + export_modules + matching destination → no refusal (policy never fires)", async () => {
    const services = makeServices();
    const sourceRoot = "C:/Projets/dysflow";
    const tools = createDysflowMcpTools({
      services,
      writes: true,
      writeExecutionPolicy: "safe-by-default",
    });
    const tool = tools.find((candidate) => candidate.name === "export_modules");
    if (!tool) throw new Error("export_modules not registered");

    // safe-by-default: the export-source guard never fires (policy
    // resolution yields `requiresConfirmOverwriteSource === false`).
    // The dispatcher injects `dryRun: true` per the policy default,
    // and the vba-modules adapter delegates to the runner. The guard
    // is the only thing that was tested here — verify the result is
    // not the refusal envelope and that the underlying runner is
    // engaged normally.
    const result = await tool.handler({
      moduleNames: ["Foo"],
      destinationRoot: sourceRoot,
      exportPath: sourceRoot,
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).not.toContain(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
    expect(services.vbaSyncToolService.requests.length).toBeGreaterThanOrEqual(1);
  });
});
