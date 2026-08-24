import { readFile, rm } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { getCapabilitiesAll } from "../../../src/adapters/mcp/get-capabilities-tool.js";
import {
  STRICT_CONTEXT_EXCEPTIONS,
  sharedBlockPolicyForTool,
  TIMEOUT_EXCEPTIONS,
} from "../../../src/adapters/mcp/mcp-tool-risks.js";
import { withSharedOutputModes } from "../../../src/adapters/mcp/output-mode.js";
import { buildToolSchemaCatalog } from "../../../src/adapters/mcp/schema-tool.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter.js";
import { successResult } from "../../../src/core/contracts/index.js";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service.js";
import { SCHEMA_PROPS } from "../../../src/shared/validation/index.js";

class FakeVbaService {
  async execute() {
    return successResult({ returnValue: "ok" });
  }
}

class FakeQueryService {
  readonly requests: Record<string, unknown>[] = [];

  async execute(request: unknown) {
    this.requests.push(request as Record<string, unknown>);
    return successResult({ tables: ["Customers", "Orders"] });
  }
}

class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

const TOOLS = createDysflowMcpTools({
  services: {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  },
});

function tool(name: string) {
  const result = TOOLS.find((candidate) => candidate.name === name);
  if (result === undefined) throw new Error(`Missing tool ${name}`);
  return result;
}

function properties(name: string): Record<string, unknown> {
  return tool(name).inputSchema?.properties ?? {};
}

function capabilitySupport(
  snapshot: ReturnType<typeof getCapabilitiesAll>,
  name: string,
): (typeof snapshot.sharedBlockSupport)[string] {
  const entry = snapshot.sharedBlockSupport[name];
  if (entry === undefined) throw new Error(`Missing capability metadata for ${name}`);
  return entry;
}

function payload(result: Awaited<ReturnType<ReturnType<typeof tool>["handler"]>>) {
  return JSON.parse(result.content.map((item) => item.text).join("\n")) as Record<string, unknown>;
}

describe("shared-block class coverage (#1192)", () => {
  it("derives strict-context and timeout requirements from tool class with documented exceptions", () => {
    const failures: string[] = [];
    for (const candidate of TOOLS) {
      const policy = sharedBlockPolicyForTool(candidate.name);
      const schema = properties(candidate.name);
      if (policy.strictContext === "required") {
        for (const field of [
          "strictContext",
          "expectedAccessPath",
          "expectedProjectRoot",
          "expectedDestinationRoot",
        ]) {
          if (schema[field] !== SCHEMA_PROPS[field as keyof typeof SCHEMA_PROPS]) {
            failures.push(`${candidate.name}.${field}`);
          }
        }
      }
      if (policy.timeoutMs === "required" && schema.timeoutMs !== SCHEMA_PROPS.timeoutMs) {
        failures.push(`${candidate.name}.timeoutMs`);
      }
    }
    expect(failures).toEqual([]);
    expect(STRICT_CONTEXT_EXCEPTIONS).toEqual({
      catalog_add_control:
        "Offline catalog-file mutation; it resolves no Access or managed-source execution target.",
      clean_stale_markers:
        "Local runtime-marker maintenance; it resolves no Access or managed-source execution target.",
      generate_form:
        "Offline form-spec generation; it resolves no Access or managed-source execution target.",
      migrate_project_config:
        "Project-config migration validates its explicit cwd-bound config path and resolves no Access target.",
      setup_project:
        "Project bootstrap validates the selected Git worktree and candidate config before atomic publication.",
    });
    expect(TIMEOUT_EXCEPTIONS).toMatchObject({
      catalog_add_control: expect.stringContaining("offline"),
      generate_form: expect.stringContaining("offline"),
      migrate_project_config: expect.stringContaining("ynchronous"),
    });
    expect(TIMEOUT_EXCEPTIONS).not.toHaveProperty("apply_form_design_plan");
  });

  it("declares transactional and preflight support per tool in get_capabilities", () => {
    const snapshot = getCapabilitiesAll({
      writesEnabled: true,
      writeAccessResolver: undefined,
      allowedProcedures: undefined,
      projectId: "test",
      allowWrites: true,
      adapterVersion: "test",
    });
    expect(capabilitySupport(snapshot, "export_modules")).toMatchObject({
      transactional: true,
      dryRunWithPreflight: true,
    });
    expect(capabilitySupport(snapshot, "import_modules")).toMatchObject({
      transactional: true,
      dryRunWithPreflight: true,
    });
    expect(capabilitySupport(snapshot, "sync_binary")).toMatchObject({
      transactional: true,
      dryRunWithPreflight: true,
    });
    expect(capabilitySupport(snapshot, "drop_table")).toMatchObject({
      strictContext: true,
      timeoutMs: true,
      transactional: false,
      dryRunWithPreflight: false,
    });
    expect(capabilitySupport(snapshot, "generate_form").exceptions.strictContext).toContain(
      "Offline",
    );
  });

  it("advertises outputMode on every high-volume read tool", () => {
    for (const name of [
      "list_objects",
      "list_vba_modules",
      "get_schema",
      "query_sql",
      "export_queries",
      "list_tables",
    ]) {
      expect(properties(name).outputMode, name).toBe(SCHEMA_PROPS.outputMode);
      expect(sharedBlockPolicyForTool(name).outputMode).toBe("required");
      const resultContract = buildToolSchemaCatalog({ toolName: name }).tools[0]?.resultContract;
      expect(
        resultContract?.kind === "dataSchema" ? resultContract.outputModes : undefined,
        name,
      ).toEqual(["summary", "file", "full"]);
    }
  });

  it("reports actual optional shared-block support separately from class requirements", () => {
    const snapshot = getCapabilitiesAll({
      writesEnabled: true,
      writeAccessResolver: undefined,
      allowedProcedures: undefined,
      projectId: "test",
      allowWrites: true,
      adapterVersion: "test",
    });
    expect(sharedBlockPolicyForTool("apply_form_design_plan").outputMode).toBe("not-applicable");
    expect(capabilitySupport(snapshot, "apply_form_design_plan").outputMode).toBe(false);
    const resultContract = buildToolSchemaCatalog({
      toolName: "apply_form_design_plan",
    }).tools[0]?.resultContract;
    expect(resultContract?.kind).toBe("dataSchema");
    if (resultContract?.kind === "dataSchema") {
      expect(resultContract.outputModes).toBeUndefined();
    }
    expect(sharedBlockPolicyForTool("doctor").strictContext).toBe("not-applicable");
    expect(capabilitySupport(snapshot, "doctor").strictContext).toBe(true);
  });

  it("forwards apply_form_design_plan timeoutMs through its import_modules gate", async () => {
    const executeMappedTool = vi.fn().mockResolvedValue(successResult({ imported: true }));
    const orchestrator: VbaFormsOrchestrator = {
      executor: vi.fn(),
      env: {},
      cwd: "C:/repo",
      resolveExecutionTarget: vi.fn().mockResolvedValue(
        successResult({
          accessPath: "C:/repo/App.accdb",
          destinationRoot: "C:/repo",
          projectRoot: "C:/repo",
          timeoutMs: 30_000,
          configSource: "explicit-request",
        }),
      ),
      validateStrictContext: vi.fn(() => successResult(undefined)),
      executeMappedTool,
    };
    const source = `Version =21\nBegin Form\n  Begin\n    Begin TextBox\n      Name ="txtName"\n    End\n  End\nEnd\n`;
    const fileSystem: FormFileSystemPort = {
      mkdir: vi.fn(),
      readdir: vi.fn(),
      readFile: vi.fn().mockResolvedValue(source),
      readJson: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = new VbaFormsAdapter(orchestrator, fileSystem);
    const result = await adapter.execute("apply_form_design_plan", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      plan: {
        formName: "Customer",
        sourceContract: {
          formName: "Customer",
          controls: [],
          formEvents: [],
          unmappedEvidence: [],
          warnings: [],
        },
        operations: [
          { kind: "note", target: "form", intent: "Keep layout", params: {}, preserves: [] },
        ],
        warnings: [],
      },
      apply: true,
      timeoutMs: 12_345,
    });
    expect(result.ok).toBe(true);
    expect(executeMappedTool).toHaveBeenCalledWith(
      "import_modules",
      expect.objectContaining({ timeoutMs: 12_345, apply: true }),
      expect.anything(),
    );
  });

  it("does not project summary/file for apply_form_design_plan when support is not advertised", async () => {
    const applyForm = withSharedOutputModes([
      {
        ...tool("apply_form_design_plan"),
        handler: async () => ({
          content: [{ type: "text" as const, text: JSON.stringify({ ok: true, applied: true }) }],
          isError: false,
          ok: true,
        }),
      },
    ])[0];
    if (applyForm === undefined) throw new Error("Missing apply_form_design_plan");
    for (const outputMode of ["summary", "file"]) {
      expect(payload(await applyForm.handler({ outputMode }))).toEqual({ ok: true, applied: true });
    }
  });

  it("forwards newly advertised strict-context pins and timeout to Access requests", async () => {
    const queryService = new FakeQueryService();
    const tools = createDysflowMcpTools({
      services: {
        vbaService: new FakeVbaService(),
        queryService,
        diagnosticsService: new FakeDiagnosticsService(),
      },
      writes: true,
    });
    const dropTable = tools.find((candidate) => candidate.name === "drop_table");
    if (dropTable === undefined) throw new Error("Missing drop_table");
    const result = await dropTable.handler({
      tableName: "Disposable",
      apply: true,
      implements_check: "drop_table_precheck",
      confirmedRequiresConfirmation: true,
      strictContext: true,
      expectedAccessPath: "C:/sandbox/frontend.accdb",
      expectedProjectRoot: "C:/sandbox",
      expectedDestinationRoot: "C:/sandbox/src",
      timeoutMs: 12_345,
    });
    expect(result.isError).toBe(false);
    expect(queryService.requests.at(-1)).toMatchObject({
      strictContext: true,
      expectedAccessPath: "C:/sandbox/frontend.accdb",
      expectedProjectRoot: "C:/sandbox",
      expectedDestinationRoot: "C:/sandbox/src",
      timeoutMs: 12_345,
    });
  });

  it("projects high-volume output as summary, file, or full instead of accepting a no-op flag", async () => {
    const listTables = tool("list_tables");

    const summary = payload(await listTables.handler({ outputMode: "summary" }));
    expect(summary).toMatchObject({
      ok: true,
      outputMode: "summary",
      summary: { kind: "object", itemCount: 2 },
    });
    expect(JSON.stringify(summary)).not.toContain("Customers");

    const full = payload(await listTables.handler({ outputMode: "full" }));
    expect(JSON.stringify(full)).toContain("Customers");

    const file = payload(await listTables.handler({ outputMode: "file" }));
    expect(file).toMatchObject({ ok: true, outputMode: "file" });
    const filePath = String(file.filePath);
    const stored = await readFile(filePath, "utf8");
    expect(stored).toContain("Customers");
    await rm(filePath, { force: true });
  });
});
