import { describe, expect, it } from "vitest";
import { writesDisabled } from "../../../src/adapters/mcp/dispatch-common.js";
import { DYSFLOW_MCP_TOOL_NAMES } from "../../../src/adapters/mcp/mcp-tool-registry.js";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/vba-sync-schemas.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { VbaModulesAdapter } from "../../../src/adapters/vba-sync/vba-modules-adapter.js";
import { sanitizeMcpErrorMessage } from "../../../src/core/utils/sanitize-error.js";
import { validateInput } from "../../../src/shared/validation/validator.js";

/* biome-ignore-start lint/suspicious/noExplicitAny: test mocks and type casts */

describe("MCP tool schema registration for vba-sync-frictions", () => {
  it("includes vba_orphan_audit in tool names and defines its schema", () => {
    expect(DYSFLOW_MCP_TOOL_NAMES).toContain("vba_orphan_audit");
    const schema = VBA_SYNC_TOOL_SCHEMAS.vba_orphan_audit;
    expect(schema).toBeDefined();
    expect(schema.type).toBe("object");
    expect(schema.properties.projectRoot).toBeDefined();
    expect(schema.properties.destinationRoot).toBeDefined();
  });

  it("includes vba_inline_execution in tool names and defines its schema", () => {
    expect(DYSFLOW_MCP_TOOL_NAMES).toContain("vba_inline_execution");
    const schema = VBA_SYNC_TOOL_SCHEMAS.vba_inline_execution;
    expect(schema).toBeDefined();
    expect(schema.type).toBe("object");
    expect(schema.properties.code).toBeDefined();
  });
});

describe("delete_module batch input contract", () => {
  it("accepts a moduleNames array so multiple modules delete in one Access session", () => {
    const schema = VBA_SYNC_TOOL_SCHEMAS.delete_module;
    expect(schema.properties.moduleNames).toBeDefined();
    const error = validateInput(
      {
        moduleNames: ["ACService", "ARService", "Test_CRUDService_TransactionBoundaries"],
        force: true,
      },
      schema,
    );
    expect(error).toBeUndefined();
  });

  it("still accepts a single moduleName (backward compatible)", () => {
    const schema = VBA_SYNC_TOOL_SCHEMAS.delete_module;
    const error = validateInput({ moduleName: "ACService", force: true }, schema);
    expect(error).toBeUndefined();
  });
});

describe("writesDisabled helper tool-name gating", () => {
  it("includes the tool name in the error message when provided", () => {
    const res = writesDisabled("delete_module");
    expect(res.isError).toBe(true);
    expect(res.content?.[0]?.text).toBe(
      'MCP_WRITES_DISABLED: Write tools are disabled for this MCP adapter (attempted: delete_module). Enable writes by setting "allowWrites": true in .dysflow/project.json (per-repo, recommended) or by launching the server with `dysflow mcp --enable-writes` (process-wide).',
    );
  });
});

describe("VBA-modifying tools write-gating", () => {
  const fakeVbaSyncToolService = {
    execute: async (name: string, input: any) => {
      return { ok: true, data: { name, input } };
    },
  };

  const services = {
    vbaSyncToolService: fakeVbaSyncToolService,
    vbaService: {},
    queryService: {},
    diagnosticsService: {},
  } as any;

  it("blocks import_modules and import_all when writesEnabled=false even if dryRun is omitted (import has no real dry-run)", async () => {
    const tools = createDysflowMcpTools({
      services: services,
    });

    // No dryRun field — the default. resolveIsDryRun() would return true, but
    // import always writes (no -DryRun in the PS manager), so the gate MUST
    // still fire. Each tool gets only its own schema-valid params.
    const cases: Array<[string, Record<string, unknown>]> = [
      ["import_modules", { moduleNames: ["Mod1"] }],
      ["import_all", {}],
    ];
    for (const [name, input] of cases) {
      const tool = tools.find((t) => t.name === name);
      expect(tool).toBeDefined();
      if (!tool) throw new Error(`tool ${name} should be defined`);
      const res = await tool.handler(input, {} as any);
      expect(res.isError).toBe(true);
      expect(res.content?.[0]?.text).toContain(
        `MCP_WRITES_DISABLED: Write tools are disabled for this MCP adapter (attempted: ${name}).`,
      );
    }
  });

  it("blocks delete_module, import_modules, import_all, and vba_inline_execution when writesEnabled=false (compile_vba removed in v1.19.0)", async () => {
    const tools = createDysflowMcpTools({
      services: services,
    });

    // Test delete_module
    {
      const tool = tools.find((t) => t.name === "delete_module");
      expect(tool).toBeDefined();
      if (!tool) throw new Error("tool should be defined");
      const res = await tool.handler({ moduleName: "Mod1" }, {} as any);
      expect(res.isError).toBe(true);
      expect(res.content?.[0]?.text).toContain(
        "MCP_WRITES_DISABLED: Write tools are disabled for this MCP adapter (attempted: delete_module).",
      );
    }

    // Test import_modules
    {
      const tool = tools.find((t) => t.name === "import_modules");
      expect(tool).toBeDefined();
      if (!tool) throw new Error("tool should be defined");
      const res = await tool.handler({ moduleNames: ["Mod1"], dryRun: false }, {} as any);
      expect(res.isError).toBe(true);
      expect(res.content?.[0]?.text).toContain(
        "MCP_WRITES_DISABLED: Write tools are disabled for this MCP adapter (attempted: import_modules).",
      );
    }

    // Test import_all
    {
      const tool = tools.find((t) => t.name === "import_all");
      expect(tool).toBeDefined();
      if (!tool) throw new Error("tool should be defined");
      const res = await tool.handler({ dryRun: false }, {} as any);
      expect(res.isError).toBe(true);
      expect(res.content?.[0]?.text).toContain(
        "MCP_WRITES_DISABLED: Write tools are disabled for this MCP adapter (attempted: import_all).",
      );
    }

    // feat-759-no-compile (v1.19.0) — compile_vba was removed; the
    // write-gate no longer needs to fire for it. Use delete_module as
    // a representative write-gate check (it is the canonical binary
    // mutator that is still write-gated).

    // Test vba_inline_execution
    {
      const tool = tools.find((t) => t.name === "vba_inline_execution");
      expect(tool).toBeDefined();
      if (!tool) throw new Error("tool should be defined");
      const res = await tool.handler({ code: "Sub Test(): End Sub" }, {} as any);
      expect(res.isError).toBe(true);
      expect(res.content?.[0]?.text).toContain(
        "MCP_WRITES_DISABLED: Write tools are disabled for this MCP adapter (attempted: vba_inline_execution).",
      );
    }
  });

  it("allows delete_module, import_modules, import_all, and vba_inline_execution when writesEnabled=true (compile_vba removed in v1.19.0)", async () => {
    const tools = createDysflowMcpTools({
      services: services,
      writes: true,
    });

    // Test delete_module
    {
      const tool = tools.find((t) => t.name === "delete_module");
      if (!tool) throw new Error("tool should be defined");
      const res = await tool.handler({ moduleName: "Mod1" }, {} as any);
      expect(res.isError).toBeFalsy();
    }

    // Test import_modules
    {
      const tool = tools.find((t) => t.name === "import_modules");
      if (!tool) throw new Error("tool should be defined");
      const res = await tool.handler({ moduleNames: ["Mod1"], dryRun: false }, {} as any);
      expect(res.isError).toBeFalsy();
    }

    // Test import_all
    {
      const tool = tools.find((t) => t.name === "import_all");
      if (!tool) throw new Error("tool should be defined");
      const res = await tool.handler({ dryRun: false }, {} as any);
      expect(res.isError).toBeFalsy();
    }

    // feat-759-no-compile (v1.19.0) — compile_vba was removed; the
    // write-gate no longer needs to fire for it. Use delete_module as
    // a representative write-gate check.

    // Test vba_inline_execution
    {
      const tool = tools.find((t) => t.name === "vba_inline_execution");
      if (!tool) throw new Error("tool should be defined");
      const res = await tool.handler({ code: "Sub Test(): End Sub" }, {} as any);
      expect(res.isError).toBeFalsy();
    }
  });
});

describe("HRESULT translation advice", () => {
  it("appends bilingual advice for 0x800ADEB9", () => {
    const msg = "An error occurred. HRESULT: 0x800ADEB9";
    const sanitized = sanitizeMcpErrorMessage(msg);
    expect(sanitized).toContain("Access object cannot be deleted");
    expect(sanitized).toContain("No se puede eliminar");
  });

  it("appends bilingual advice for 0x800ADEB9 in its signed-decimal form (-2146771271)", () => {
    // .NET COMException.ToString() frequently renders the HRESULT as a signed
    // decimal rather than hex, so the decimal guard must match the real value.
    const msg = "System.Runtime.InteropServices.COMException: error -2146771271 occurred";
    const sanitized = sanitizeMcpErrorMessage(msg);
    expect(sanitized).toContain("Access object cannot be deleted");
    expect(sanitized).toContain("No se puede eliminar");
  });

  it("appends bilingual advice for 0x800A09D5", () => {
    const msg = "VBA error. HRESULT: 0x800A09D5";
    const sanitized = sanitizeMcpErrorMessage(msg);
    expect(sanitized).toContain("Name conflicts with");
    expect(sanitized).toContain("El nombre entra en conflicto");
  });
});

describe("vba_orphan_audit tool behavior", () => {
  it("audits modules, maps source paths, and flags suspicious placeholders", async () => {
    const fakeOrchestrator: any = {
      resolveExecutionTarget: async () => ({
        ok: true,
        data: { destinationRoot: "C:\\fake\\src", accessPath: "C:\\fake\\db.accdb" },
      }),
      validateStrictContext: () => ({ ok: true }),
      executeMappedTool: async (name: string) => {
        if (name === "list_objects") {
          return {
            ok: true,
            data: {
              modules: ["Módulo1", "Helper"],
              classes: ["Class1", "clsUser"],
              forms: ["Form1", "Clientes"],
              reports: [],
              documentModules: ["Form_Form1", "Form_Clientes"],
            },
          };
        }
        return { ok: false };
      },
    };

    const mockFs: any = {
      readdir: async (folder: string) => {
        if (folder.endsWith("modules")) return ["Helper.bas", "Módulo1.bas", "ModDisk.bas"];
        if (folder.endsWith("classes")) return ["clsUser.cls"];
        if (folder.endsWith("forms")) return ["Form_Clientes.cls", "Form_Clientes.form.txt"];
        return [];
      },
      stat: async () => ({ isFile: () => true }),
    };

    const adapter = new VbaModulesAdapter(fakeOrchestrator, mockFs);
    const result = await adapter.execute("vba_orphan_audit", {});
    if (!result.ok) throw new Error("Expected result to be ok");
    const data = result.data as any;
    expect(data.orphans).toBeDefined();

    const m1 = data.orphans.find((x: any) => x.moduleName === "Módulo1");
    expect(m1).toBeDefined();
    expect(m1.isSuspicious).toBe(true);
    expect(m1.isOrphan).toBe(false);
    expect(m1.sourcePath).toContain("Módulo1.bas");

    const helper = data.orphans.find((x: any) => x.moduleName === "Helper");
    expect(helper).toBeDefined();
    expect(helper.isSuspicious).toBe(false);
    expect(helper.isOrphan).toBe(false);

    const class1 = data.orphans.find((x: any) => x.moduleName === "Class1");
    expect(class1).toBeDefined();
    expect(class1.isSuspicious).toBe(true);
    expect(class1.isOrphan).toBe(true);
    expect(class1.sourcePath).toBeNull();

    const form1 = data.orphans.find((x: any) => x.moduleName === "Form_Form1");
    expect(form1).toBeDefined();
    expect(form1.isSuspicious).toBe(true);
    expect(form1.isOrphan).toBe(true);
    expect(form1.sourcePath).toBeNull();

    const modDisk = data.orphans.find((x: any) => x.moduleName === "ModDisk");
    expect(modDisk).toBeDefined();
    expect(modDisk.isSuspicious).toBe(false);
    expect(modDisk.isOrphan).toBe(true);
    expect(modDisk.sourcePath).toContain("ModDisk.bas");
  });

  it("matches VBE names to disk files case-insensitively (VBA identifiers are case-insensitive)", async () => {
    const fakeOrchestrator: any = {
      resolveExecutionTarget: async () => ({
        ok: true,
        data: { destinationRoot: "C:\\fake\\src", accessPath: "C:\\fake\\db.accdb" },
      }),
      validateStrictContext: () => ({ ok: true }),
      executeMappedTool: async (name: string) => {
        if (name === "list_objects") {
          // VBE re-cases identifiers; it reports "MiModulo" while disk is "mimodulo.bas".
          return {
            ok: true,
            data: {
              modules: ["MiModulo"],
              classes: [],
              forms: [],
              reports: [],
              documentModules: [],
            },
          };
        }
        return { ok: false };
      },
    };
    const mockFs: any = {
      readdir: async (folder: string) => (folder.endsWith("modules") ? ["mimodulo.bas"] : []),
      stat: async () => ({ isFile: () => true }),
    };

    const adapter = new VbaModulesAdapter(fakeOrchestrator, mockFs);
    const result = await adapter.execute("vba_orphan_audit", {});
    if (!result.ok) throw new Error("Expected result to be ok");
    const data = result.data as any;

    // A single real module — not two false orphans from the case mismatch.
    expect(data.orphans).toHaveLength(1);
    expect(data.orphans[0].moduleName).toBe("MiModulo");
    expect(data.orphans[0].isOrphan).toBe(false);
    expect(data.orphans[0].sourcePath).toContain("mimodulo.bas");
  });
});

describe("vba_inline_execution tool behavior", () => {
  it("writes a temporary module, imports it, runs it, and cleans up", async () => {
    const executedTools: Array<{ name: string; params: any }> = [];
    const writtenFiles: Array<{ path: string; content: string }> = [];
    const removedFiles: string[] = [];

    const fakeOrchestrator: any = {
      cwd: "C:\\fake",
      resolveExecutionTarget: async () => ({
        ok: true,
        data: { destinationRoot: "C:\\fake\\src", accessPath: "C:\\fake\\db.accdb" },
      }),
      validateStrictContext: () => ({ ok: true }),
      executeMappedTool: async (name: string, params: any) => {
        executedTools.push({ name, params });
        // feat-759-no-compile (v1.19.0) — compile_vba was removed; the
        // inline path no longer makes an explicit compile call. The
        // flow is now delete-pre -> import -> run -> delete-post.
        if (name === "import_modules" || name === "run_vba" || name === "delete_module") {
          return { ok: true, data: { status: "success" } };
        }
        return { ok: false };
      },
    };

    const mockFs: any = {
      writeFile: async (path: string, content: string) => {
        writtenFiles.push({ path, content });
      },
      rm: async (path: string) => {
        removedFiles.push(path);
      },
    };

    const adapter = new (
      await import("../../../src/adapters/vba-sync/vba-execution-adapter.js")
    ).VbaExecutionAdapter(fakeOrchestrator, mockFs);
    const result = await adapter.execute("vba_inline_execution", { code: "MsgBox 123" });

    expect(result.ok).toBe(true);

    // Expecting 4 tools to be executed in sequence (delete pre-cleanup, import, run, delete post-cleanup)
    // — compile is gone in v1.19.0.
    expect(executedTools.length).toBe(4);
    expect(executedTools[0]?.name).toBe("delete_module");
    expect(executedTools[1]?.name).toBe("import_modules");
    expect(executedTools[2]?.name).toBe("run_vba");
    expect(executedTools[3]?.name).toBe("delete_module");

    // The generated module name is __dysflow_inline__
    const importParams = executedTools[1]?.params;
    expect(importParams?.moduleNames?.length).toBe(1);
    const generatedModuleName = importParams?.moduleNames?.[0];
    expect(generatedModuleName).toBe("__dysflow_inline__");

    // Verify written file and content (separator-agnostic: CI runs on Linux)
    expect(writtenFiles[0]?.path?.replace(/\\/g, "/")).toContain(
      `modules/${generatedModuleName}.bas`,
    );
    expect(writtenFiles[0]?.content).toContain(`Attribute VB_Name = "${generatedModuleName}"`);
    // #786 — snippet wrapped in a Function that returns `result` (not a Sub, so
    // an introspection snippet can return a value).
    expect(writtenFiles[0]?.content).toContain("Public Function ExecuteInline() As Variant");
    expect(writtenFiles[0]?.content).toContain("ExecuteInline = result");
    expect(writtenFiles[0]?.content).toContain("MsgBox 123");

    // Verify run_vba params
    const runParams = executedTools[2]?.params;
    expect(runParams?.moduleNames).toContain(generatedModuleName);
    // #786 — bare procedure name; a module-qualified name is read by
    // Application.Run as a (non-existent) project qualifier and fails.
    expect(runParams?.procedureName).toBe("ExecuteInline");

    // Verify delete_module params
    const deleteParams = executedTools[3]?.params;
    expect(deleteParams?.moduleName).toBe(generatedModuleName);

    // Verify file removal (pre-cleanup and post-cleanup)
    expect(removedFiles.length).toBe(2);
    expect(removedFiles[1]?.replace(/\\/g, "/")).toContain(`modules/${generatedModuleName}.bas`);
  });

  it("cleans up even if execution fails", async () => {
    const executedTools: Array<{ name: string; params: any }> = [];
    const removedFiles: string[] = [];

    const fakeOrchestrator: any = {
      cwd: "C:\\fake",
      resolveExecutionTarget: async () => ({
        ok: true,
        data: { destinationRoot: "C:\\fake\\src", accessPath: "C:\\fake\\db.accdb" },
      }),
      validateStrictContext: () => ({ ok: true }),
      executeMappedTool: async (name: string, params: any) => {
        executedTools.push({ name, params });
        // feat-759-no-compile (v1.19.0) — compile_vba was removed.
        if (name === "import_modules") {
          return { ok: true };
        }
        if (name === "run_vba") {
          return { ok: false, error: { message: "VBA Execution Failed" } };
        }
        if (name === "delete_module") {
          return { ok: true };
        }
        return { ok: false };
      },
    };

    const mockFs: any = {
      writeFile: async () => {},
      rm: async (path: string) => {
        removedFiles.push(path);
      },
    };

    const adapter = new (
      await import("../../../src/adapters/vba-sync/vba-execution-adapter.js")
    ).VbaExecutionAdapter(fakeOrchestrator, mockFs);
    const result = await adapter.execute("vba_inline_execution", { code: "MsgBox 123" });

    expect(result.ok).toBe(false);

    // Verify delete_module was still called
    const deleteCall = executedTools.find((x) => x.name === "delete_module");
    expect(deleteCall).toBeDefined();

    // Verify file was still removed (pre-cleanup and post-cleanup)
    expect(removedFiles.length).toBe(2);
  });
});

/* biome-ignore-end lint/suspicious/noExplicitAny: end */
