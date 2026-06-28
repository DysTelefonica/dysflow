/**
 * E2E coverage for runtime-guard (issue #574) over the MCP protocol.
 *
 * Pins the wire-level contract that filesystem-writing tools exposed via the
 * Dysflow MCP server refuse paths inside the production runtime directory —
 * NOT just at the unit-test level (mocked orchestrator) but through the FULL
 * SDK client/server pair + dispatch-factory + the REAL vba-sync adapters
 * (VbaModulesAdapter and VbaFormService, which carry the isWithinRuntime
 * guard), exactly the way a consuming agent would invoke the tool over the
 * wire.
 *
 * Three sites must hold the line:
 *   1. `generate_form`     — destinationRoot / projectRoot / cwd fallback (#574)
 *   2. `export_modules`    — exportPath override (#185 / #574)
 *   3. `export_all`        — exportPath override AND prune:destroy (#574)
 *
 * If any of these tools accepts a runtime path, dysflow would mutate the
 * installed runtime directory (AGENTS.md hard rule violation). The MCP
 * response MUST be a structured failure (`INVALID_INPUT` code, runtime-aware
 * message), and the underlying PowerShell runner MUST NOT be called — the
 * guard fails CLOSED at the adapter layer, BEFORE any I/O.
 *
 * The unit-test coverage in
 * `test/adapters/vba-sync/runtime-guard-filesystem-writes.test.ts` exercises
 * the adapter surface with mocks. This E2E suite pins the SDK + dispatch +
 * adapter chain so a future regression in any layer (the dispatch-factory,
 * the SDK wiring, the adapter's guard) is caught here.
 *
 * No real Access COM / PowerShell required — the rejection happens at the
 * adapter layer before any service is touched.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startWithSdkServer } from "../../src/adapters/mcp/stdio.js";
import type { DysflowMcpServices } from "../../src/adapters/mcp/tools.js";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools.js";
import {
  VbaModulesAdapter,
  type VbaModulesExecutionTarget,
} from "../../src/adapters/vba-sync/vba-modules-adapter.js";
import type { OperationResult } from "../../src/core/contracts/index.js";
import { successResult } from "../../src/core/contracts/index.js";
import type { AccessOperationPreflightCleanupResult } from "../../src/core/operations/access-operation-preflight.js";
import { VbaFormService } from "../../src/core/services/vba-form-service.js";

type Harness = {
  client: Client;
  executor: ReturnType<typeof vi.fn>;
  formFileSystem: { mkdir: ReturnType<typeof vi.fn>; writeFile: ReturnType<typeof vi.fn> };
  close: () => Promise<void>;
};

const RUNTIME_HOME = "C:/runtime/dysflow";
const RUNTIME_APP = "C:/runtime/dysflow/app/scripts";
const RUNTIME_ENV = { DYSFLOW_HOME: RUNTIME_HOME } as unknown as Record<string, string | undefined>;

async function createHarness(): Promise<Harness> {
  // PowerShell executor MUST NOT be invoked for any runtime-path input — the
  // guard should fire at the adapter layer. If it does, this throws loudly.
  const executor = vi.fn(async () => {
    throw new Error(
      "PowerShell executor MUST NOT be called for runtime-path inputs (#574 regression)",
    );
  });

  // Form service fileSystem MUST NOT call mkdir/writeFile for any runtime-path
  // input. If it does, the test fails loudly with the path that leaked through.
  const formFileSystem = {
    mkdir: vi.fn(async () => {
      throw new Error("formService mkdir MUST NOT be called for runtime-path inputs");
    }),
    writeFile: vi.fn(async () => {
      throw new Error("formService writeFile MUST NOT be called for runtime-path inputs");
    }),
  };

  // Build the two real adapters that carry the isWithinRuntime guard.
  const resolveExecutionTarget = vi.fn(
    async (_params: unknown): Promise<OperationResult<VbaModulesExecutionTarget>> =>
      successResult<VbaModulesExecutionTarget>({
        accessDbPath: "C:/projects/myapp/MyApp.accdb",
        destinationRoot: RUNTIME_APP,
        projectRoot: RUNTIME_APP,
        configSource: "explicit-request",
      }),
  );
  const validateStrictContext = vi.fn(() => successResult<undefined>(undefined));
  const runPreflightCleanup = vi.fn(
    async (_target: VbaModulesExecutionTarget): Promise<AccessOperationPreflightCleanupResult> => ({
      cleaned: [],
      killed: [],
      orphanedKilled: [],
      errors: [],
    }),
  );
  // exportAllWithPrune calls executeMappedTool("export_all", ...) first to
  // gather the list of exported modules. Stub a benign empty-list result so
  // the adapter proceeds past that step into its OWN runtime guard.
  const executeMappedTool = vi.fn(async () => successResult({ exported: [], warnings: [] }));

  const modulesAdapter = new VbaModulesAdapter({
    scriptPath: "scripts/dysflow-vba-manager.ps1",
    cwd: RUNTIME_HOME,
    env: RUNTIME_ENV,
    executeMappedTool,
    resolveExecutionTarget,
    validateStrictContext,
    runPreflightCleanup,
    executor,
  });

  const formService = new VbaFormService({
    cwd: RUNTIME_HOME,
    env: RUNTIME_ENV,
    fileSystem: formFileSystem as unknown as ConstructorParameters<
      typeof VbaFormService
    >[0] extends infer T
      ? T extends { fileSystem?: infer F }
        ? F
        : never
      : never,
  });

  // The dispatch-factory delegates to vbaSyncToolService, which dispatches by
  // toolName. Mirror the production VbaSyncAdapter routing here (the production
  // adapter is too heavyweight to wire up in a unit-style E2E; the two real
  // adapters carry the actual guards, so routing them through the same dispatch
  // contract is the regression we want to pin).
  const vbaSyncToolService = {
    execute: async (toolName: string, input: unknown): Promise<OperationResult<unknown>> => {
      const params = (input ?? {}) as Record<string, unknown>;
      if (toolName === "generate_form" || toolName === "catalog_add_control") {
        // The dispatch-factory only sends filesystem-write tools here when the
        // write-gate has been resolved. Pin the parity by routing to the real
        // form service, which carries the runtime guard.
        if (toolName === "generate_form") return formService.generateForm(params);
      }
      if (
        toolName === "export_modules" ||
        toolName === "export_all" ||
        toolName === "import_modules" ||
        toolName === "import_all" ||
        toolName === "list_objects" ||
        toolName === "exists" ||
        toolName === "verify_code" ||
        toolName === "delete_module" ||
        toolName === "fix_encoding" ||
        toolName === "vba_orphan_audit"
      ) {
        return modulesAdapter.execute(toolName, params);
      }
      // Other routes are out of scope for this regression — surface clearly.
      throw new Error(`vbaSyncToolService stub does not route tool: ${toolName}`);
    },
  };

  const services: DysflowMcpServices & {
    vbaSyncToolService: NonNullable<DysflowMcpServices["vbaSyncToolService"]>;
  } = {
    vbaService: { execute: vi.fn(async () => successResult({ returnValue: "ok" })) },
    queryService: { execute: vi.fn(async () => successResult({ rows: [] })) },
    diagnosticsService: { run: vi.fn(async () => successResult({ checks: [] })) },
    vbaSyncToolService,
  };

  // writesEnabled=true because the runtime guard should fire BEFORE the
  // write-gate; this proves the adapter's isWithinRuntime is the one
  // rejecting the call, not MCP_WRITES_DISABLED.
  const tools = createDysflowMcpTools(services, true);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(tools, serverTransport);
  const client = new Client({ name: "e2e-runtime-guard", version: "0.0.1" }, { capabilities: {} });
  await client.connect(clientTransport);

  return {
    client,
    executor,
    formFileSystem,
    close: async () => {
      await client.close();
      await serverDone.catch(() => {});
    },
  };
}

const openHarnesses: Harness[] = [];
afterEach(async () => {
  await Promise.all(openHarnesses.splice(0).map((h) => h.close().catch(() => {})));
});

async function withHarness<T>(body: (h: Harness) => Promise<T>): Promise<T> {
  const h = await createHarness();
  openHarnesses.push(h);
  try {
    return await body(h);
  } finally {
    const idx = openHarnesses.indexOf(h);
    if (idx >= 0) openHarnesses.splice(idx, 1);
    await h.close().catch(() => {});
  }
}

describe("Issue #574 — runtime guard for filesystem writes via MCP (E2E)", () => {
  describe("generate_form — destinationRoot inside production runtime is refused", () => {
    it("generate_form tools/call with destinationRoot inside runtime returns INVALID_INPUT and does NOT invoke the fileSystem port", async () => {
      await withHarness(async ({ client, formFileSystem, executor }) => {
        const result = await client.callTool({
          name: "generate_form",
          arguments: {
            spec: { name: "Form_SmuggleA", kind: "Form", controls: [] },
            destinationRoot: RUNTIME_APP,
            apply: true,
          },
        });

        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ text: string }> | undefined)?.[0]?.text ?? "";
        expect(text).toMatch(/INVALID_INPUT/);
        expect(text).toMatch(/production runtime|inside the runtime/i);
        // Guard fired BEFORE mkdir/writeFile and BEFORE PowerShell — fail-closed.
        expect(formFileSystem.mkdir).not.toHaveBeenCalled();
        expect(formFileSystem.writeFile).not.toHaveBeenCalled();
        expect(executor).not.toHaveBeenCalled();
      });
    });

    it("generate_form tools/call with projectRoot fallback inside runtime returns INVALID_INPUT", async () => {
      await withHarness(async ({ client, formFileSystem, executor }) => {
        const result = await client.callTool({
          name: "generate_form",
          arguments: {
            spec: { name: "Form_SmuggleB", kind: "Form", controls: [] },
            projectRoot: RUNTIME_HOME,
            apply: true,
          },
        });

        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ text: string }> | undefined)?.[0]?.text ?? "";
        expect(text).toMatch(/INVALID_INPUT/);
        expect(formFileSystem.mkdir).not.toHaveBeenCalled();
        expect(formFileSystem.writeFile).not.toHaveBeenCalled();
        expect(executor).not.toHaveBeenCalled();
      });
    });
  });

  describe("export_modules / export_all — exportPath inside production runtime is refused", () => {
    it("export_modules tools/call with exportPath inside runtime returns INVALID_INPUT and does NOT invoke PowerShell", async () => {
      await withHarness(async ({ client, executor }) => {
        const result = await client.callTool({
          name: "export_modules",
          arguments: {
            exportPath: RUNTIME_APP,
            moduleNames: ["Module1"],
          },
        });

        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ text: string }> | undefined)?.[0]?.text ?? "";
        expect(text).toMatch(/INVALID_INPUT/);
        expect(text).toMatch(/production runtime|inside the runtime/i);
        expect(executor).not.toHaveBeenCalled();
      });
    });

    it("export_all tools/call with exportPath inside runtime returns INVALID_INPUT and does NOT invoke PowerShell", async () => {
      await withHarness(async ({ client, executor }) => {
        const result = await client.callTool({
          name: "export_all",
          arguments: {
            exportPath: RUNTIME_HOME,
          },
        });

        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ text: string }> | undefined)?.[0]?.text ?? "";
        expect(text).toMatch(/INVALID_INPUT/);
        expect(text).toMatch(/production runtime|inside the runtime/i);
        expect(executor).not.toHaveBeenCalled();
      });
    });
  });

  describe("export_all prune — destructive phase refuses runtime destinationRoot", () => {
    it("export_all tools/call with prune:true refuses runtime destinationRoot BEFORE the prune loop runs", async () => {
      await withHarness(async ({ client, executor }) => {
        const result = await client.callTool({
          name: "export_all",
          arguments: {
            destinationRoot: RUNTIME_APP,
            prune: true,
          },
        });

        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ text: string }> | undefined)?.[0]?.text ?? "";
        expect(text).toMatch(/INVALID_INPUT/);
        expect(text).toMatch(/production runtime|inside the runtime/i);
        // Guard fired inside the adapter BEFORE PowerShell and BEFORE the rm loop.
        expect(executor).not.toHaveBeenCalled();
      });
    });
  });
});

describe("Issue #574 — runtime guard allow-cases (regression: guard must NOT block non-runtime paths)", () => {
  it("export_modules with exportPath outside the runtime reaches the orchestrator without INVALID_INPUT", async () => {
    await withHarness(async ({ client, executor }) => {
      const result = await client.callTool({
        name: "export_modules",
        arguments: {
          exportPath: "C:/projects/myapp/src",
          moduleNames: ["Module1"],
        },
      });

      // The guard did NOT block. Downstream resolution may fail for unrelated
      // reasons (mocked orchestrator returns the runtime path we set up), so
      // we only assert the guard's specific rejection did NOT fire.
      if (result.isError) {
        const text = (result.content as Array<{ text: string }> | undefined)?.[0]?.text ?? "";
        expect(text).not.toMatch(/INVALID_INPUT/);
        expect(text).not.toMatch(/production runtime|inside the runtime/i);
      }
      void executor;
    });
  });
});
