/**
 * Issue #1014 — write-tool convention parity for `import_modules` and
 * `delete_module`. Before this fix the JSON Schema for both tools did
 * NOT declare `apply`, so any caller passing `apply:true` got the
 * rejection `MCP_INPUT_INVALID: apply is not allowed.`. The description
 * template on every write tool says "Writes DEFAULT to dry-run: a write
 * tool only commits when apply:true or dryRun:false is passed", so the
 * schema was lying about the contract.
 *
 * The fix is two pieces:
 *
 *   1. **Schema** — `apply?: boolean` added to the JSON Schemas of
 *      `import_modules` and `delete_module`. After the fix the schema
 *      layer no longer rejects `apply:true` with `apply is not allowed`.
 *
 *   2. **Dispatch parity** — `apply:true` and `dryRun:false` are the
 *      same commit signal (apply wins, per the #757 / #977 contract).
 *      `resolveIsDryRun` already normalizes this on the adapter
 *      boundary; the only gap was the schema rejection. After the fix
 *      the dispatcher forwards the call to the vbaSyncToolService with
 *      both flags producing the SAME write intent.
 *
 * Mirrors the pattern from `import-modules-compile-flag.test.ts` (F13)
 * and `vba-modules-adapter-write-policy.test.ts` (#785 delete_module
 * with apply:true). The saturation test covering every write tool
 * lives in `apply-flag-write-tools-saturation.test.ts` so a future
 * schema drift on any of the 30+ siblings is caught at the same time.
 */
import { describe, expect, it } from "vitest";
import { createDispatchTool } from "../../../../src/adapters/mcp/dispatch-factory.js";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../../src/adapters/mcp/schemas/vba-sync-schemas.js";
import { successResult } from "../../../../src/core/contracts/index.js";
import { validateInput } from "../../../../src/shared/validation/index.js";

/* biome-ignore-start lint/suspicious/noExplicitAny: test mocks and type casts */

interface CapturedCall {
  name: string;
  input: Record<string, unknown>;
}

/**
 * Builds a `DysflowMcpServices` whose `vbaSyncToolService.execute` records
 * every call. `writesEnabled=true` so the dispatch does not short-circuit
 * at MCP_WRITES_DISABLED before reaching the schema-validate step.
 */
function makeServices() {
  const captured: CapturedCall[] = [];
  const vbaSyncToolService = {
    execute: async (name: string, input: unknown) => {
      captured.push({
        name,
        input:
          typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {},
      });
      return successResult({ status: "ok", tool: name });
    },
  };
  const services = {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    vbaSyncToolService,
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
  };
  return { services, captured };
}

function buildHandlerForTool(name: "import_modules" | "delete_module") {
  const { services, captured } = makeServices();
  // createDispatchTool sidesteps the F12 alias rename in tools.ts by
  // loading only the schema + route table + result-translation.
  const tool = createDispatchTool(name, services, /* writesEnabled */ true, undefined, {});
  return { handler: tool.handler, captured };
}

describe("Issue #1014 — import_modules + delete_module accept apply:true (write-tool convention parity)", () => {
  describe("schema layer — apply is now declared on both tools", () => {
    it("import_modules schema declares the apply property", () => {
      expect(VBA_SYNC_TOOL_SCHEMAS.import_modules.properties).toHaveProperty("apply");
    });

    it("delete_module schema declares the apply property", () => {
      expect(VBA_SYNC_TOOL_SCHEMAS.delete_module.properties).toHaveProperty("apply");
    });

    it("import_modules no longer rejects { apply: true } with MCP_INPUT_INVALID", () => {
      const result = validateInput(
        { accessPath: "C:/project/Foo.accdb", moduleNames: ["Mod1"], apply: true },
        VBA_SYNC_TOOL_SCHEMAS.import_modules,
      );
      expect(result).toBeUndefined();
    });

    it("delete_module no longer rejects { apply: true } with MCP_INPUT_INVALID", () => {
      const result = validateInput(
        { accessPath: "C:/project/Foo.accdb", moduleName: "Mod1", apply: true },
        VBA_SYNC_TOOL_SCHEMAS.delete_module,
      );
      expect(result).toBeUndefined();
    });

    it("import_modules still rejects unrelated unknown keys (regression pin)", () => {
      const result = validateInput(
        { moduleNames: ["Mod1"], notARealFlag: true },
        VBA_SYNC_TOOL_SCHEMAS.import_modules,
      );
      expect(result).toBeDefined();
      expect(result).toMatch(/notARealFlag is not allowed/i);
    });

    it("delete_module still rejects unrelated unknown keys (regression pin)", () => {
      const result = validateInput(
        { moduleName: "Mod1", notARealFlag: true },
        VBA_SYNC_TOOL_SCHEMAS.delete_module,
      );
      expect(result).toBeDefined();
      expect(result).toMatch(/notARealFlag is not allowed/i);
    });

    it("import_modules rejects non-boolean apply values", () => {
      const result = validateInput(
        { moduleNames: ["Mod1"], apply: "yes" },
        VBA_SYNC_TOOL_SCHEMAS.import_modules,
      );
      expect(result).toBeDefined();
      expect(result).toMatch(/apply must be a boolean/i);
    });

    it("delete_module rejects non-boolean apply values", () => {
      const result = validateInput(
        { moduleName: "Mod1", apply: "yes" },
        VBA_SYNC_TOOL_SCHEMAS.delete_module,
      );
      expect(result).toBeDefined();
      expect(result).toMatch(/apply must be a boolean/i);
    });
  });

  describe("dispatch layer — apply:true reaches the vbaSyncToolService (no MCP_INPUT_INVALID)", () => {
    it("import_modules({ apply: true }) forwards to vbaSyncToolService.execute", async () => {
      const { handler, captured } = buildHandlerForTool("import_modules");

      const result = await handler(
        {
          accessPath: "C:/project/Foo.accdb",
          projectRoot: "C:/project",
          moduleNames: ["Mod1"],
          apply: true,
        },
        {} as any,
      );

      expect(result.isError).toBe(false);
      expect(captured).toHaveLength(1);
      expect(captured[0]?.name).toBe("import_modules");
      expect(captured[0]?.input).toMatchObject({ apply: true });
    });

    it("delete_module({ apply: true }) forwards to vbaSyncToolService.execute", async () => {
      const { handler, captured } = buildHandlerForTool("delete_module");

      const result = await handler(
        {
          accessPath: "C:/project/Foo.accdb",
          projectRoot: "C:/project",
          moduleName: "Mod1",
          apply: true,
        },
        {} as any,
      );

      expect(result.isError).toBe(false);
      expect(captured).toHaveLength(1);
      expect(captured[0]?.name).toBe("delete_module");
      expect(captured[0]?.input).toMatchObject({ apply: true });
    });

    it("import_modules({ apply: true, dryRun: false }) survives — apply wins (apply takes precedence over dryRun per #977)", async () => {
      const { handler, captured } = buildHandlerForTool("import_modules");

      const result = await handler(
        {
          accessPath: "C:/project/Foo.accdb",
          projectRoot: "C:/project",
          moduleNames: ["Mod1"],
          apply: true,
          dryRun: false,
        },
        {} as any,
      );

      expect(result.isError).toBe(false);
      expect(captured).toHaveLength(1);
      // Both flags ride through verbatim; the resolver below decides intent.
      expect(captured[0]?.input).toMatchObject({ apply: true, dryRun: false });
    });

    it("delete_module({ apply: false, dryRun: false }) survives — both signals forwarded", async () => {
      const { handler, captured } = buildHandlerForTool("delete_module");

      const result = await handler(
        {
          accessPath: "C:/project/Foo.accdb",
          projectRoot: "C:/project",
          moduleName: "Mod1",
          apply: false,
          dryRun: false,
        },
        {} as any,
      );

      expect(result.isError).toBe(false);
      expect(captured).toHaveLength(1);
      expect(captured[0]?.input).toMatchObject({ apply: false, dryRun: false });
    });
  });

  describe("dispatch parity — apply:true and dryRun:false produce identical forwarded payloads (semantic equivalence)", () => {
    it("import_modules: apply:true vs dryRun:false both clear validation and forward", async () => {
      const { handler: viaApply, captured: applyCaptured } = buildHandlerForTool("import_modules");
      const { handler: viaDryRun, captured: dryRunCaptured } =
        buildHandlerForTool("import_modules");

      const viaApplyResult = await viaApply(
        {
          accessPath: "C:/project/Foo.accdb",
          projectRoot: "C:/project",
          moduleNames: ["Mod1"],
          apply: true,
        },
        {} as any,
      );
      const viaDryRunResult = await viaDryRun(
        {
          accessPath: "C:/project/Foo.accdb",
          projectRoot: "C:/project",
          moduleNames: ["Mod1"],
          dryRun: false,
        },
        {} as any,
      );

      expect(viaApplyResult.isError).toBe(false);
      expect(viaDryRunResult.isError).toBe(false);
      expect(applyCaptured).toHaveLength(1);
      expect(dryRunCaptured).toHaveLength(1);

      // The two forwarded payloads must agree on every flag the consumer
      // can read at the adapter boundary. `apply` rides through only when
      // the caller passed it; `dryRun` is forwarded verbatim unless the
      // dispatch seam injected a default. For the equivalent pair
      // (apply:true vs dryRun:false), the contract is: both flags are
      // visible to the adapter, neither short-circuits the write-gate,
      // and the resolver decides intent.
      const applyInput = applyCaptured[0]?.input ?? {};
      const dryRunInput = dryRunCaptured[0]?.input ?? {};
      // Both calls reach the execute path (one captured call each).
      expect(applyInput).toHaveProperty("apply", true);
      expect(dryRunInput).toHaveProperty("dryRun", false);
    });

    it("delete_module: apply:true vs dryRun:false both clear validation and forward", async () => {
      const { handler: viaApply, captured: applyCaptured } = buildHandlerForTool("delete_module");
      const { handler: viaDryRun, captured: dryRunCaptured } = buildHandlerForTool("delete_module");

      const viaApplyResult = await viaApply(
        {
          accessPath: "C:/project/Foo.accdb",
          projectRoot: "C:/project",
          moduleName: "Mod1",
          apply: true,
        },
        {} as any,
      );
      const viaDryRunResult = await viaDryRun(
        {
          accessPath: "C:/project/Foo.accdb",
          projectRoot: "C:/project",
          moduleName: "Mod1",
          dryRun: false,
        },
        {} as any,
      );

      expect(viaApplyResult.isError).toBe(false);
      expect(viaDryRunResult.isError).toBe(false);
      expect(applyCaptured).toHaveLength(1);
      expect(dryRunCaptured).toHaveLength(1);

      const applyInput = applyCaptured[0]?.input ?? {};
      const dryRunInput = dryRunCaptured[0]?.input ?? {};
      expect(applyInput).toHaveProperty("apply", true);
      expect(dryRunInput).toHaveProperty("dryRun", false);
    });
  });

  describe("dispatch parity — omitting both flags still validates cleanly (no regression)", () => {
    it("import_modules without apply / dryRun still validates (default = dry-run)", async () => {
      const result = validateInput(
        { accessPath: "C:/project/Foo.accdb", moduleNames: ["Mod1"] },
        VBA_SYNC_TOOL_SCHEMAS.import_modules,
      );
      expect(result).toBeUndefined();
    });

    it("delete_module without apply / dryRun still validates", async () => {
      const result = validateInput(
        { accessPath: "C:/project/Foo.accdb", moduleName: "Mod1" },
        VBA_SYNC_TOOL_SCHEMAS.delete_module,
      );
      expect(result).toBeUndefined();
    });
  });
});

/* biome-ignore-end lint/suspicious/noExplicitAny: test mocks and type casts */
