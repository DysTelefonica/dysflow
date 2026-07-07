/**
 * F13 friction regression pin — `compile: false` / `compile: true` must be
 * a silent no-op on `import_modules` and `import_all`.
 *
 * Background (from friction log F13):
 *   - In v1.19.0 the `compile_vba` tool and the `compile` parameter on
 *     `import_modules` / `import_all` were removed end-to-end. The runtime
 *     no longer compiles; the human compiles in Access (Debug > Compile).
 *   - Round-3 user direction: existing briefs that still pass `compile:
 *     false` (or `compile: true`) must keep working. The dispatch layer
 *     silently strips the deprecated parameter before schema validation,
 *     so an old orchestrator brief that hard-codes the parameter does
 *     not receive `MCP_INPUT_INVALID: compile is not allowed`.
 *   - The schema layer (`validateInput`) keeps rejecting `compile` —
 *     existing v1.19.0 schema tests in `vba-sync-schemas.test.ts` still
 *     pass because the schema contract is unchanged. The DEPRECATION
 *     lives ONLY at the dispatch-factory boundary (one strip site).
 *
 * Test infrastructure note:
 *   This test uses `createDispatchTool` from `dispatch-factory.ts`
 *   DIRECTLY (NOT `createDysflowMcpTools` from `tools.ts`). The latter
 *   transitively imports `mcp-tool-contracts.ts`, which is currently
 *   mid-rename in the F12 worktree and may throw at module load. The
 *   dispatch factory has no such dependency — it only loads the schema
 *   for the named tool, the route table, and `result-translation.ts`.
 *
 * Locks the contract on:
 *   1. `import_modules({ compile: false })` reaches the vbaSyncToolService
 *      execute call (no MCP_INPUT_INVALID from the schema).
 *   2. `import_modules({ compile: true })` also reaches the execute call,
 *      because silently stripping is the documented behavior (per the
 *      round-3 brief).
 *   3. `import_modules({ rollbackOnCompileFail: true })` likewise reaches
 *      the execute call (same deprecation category).
 *   4. `import_all({ compile: false })` reaches the execute call.
 *   5. `import_all({ compile: true })` reaches the execute call.
 *   6. The stripped payload forwarded to the vbaSyncToolService does NOT
 *      carry `compile` / `rollbackOnCompileFail` — the strip is real, not
 *      a bypass that leaves the deprecated keys in the forwarded payload.
 */
import { describe, expect, it } from "vitest";
import { createDispatchTool } from "../../../src/adapters/mcp/dispatch-factory.js";
import { successResult } from "../../../src/core/contracts/index.js";

/* biome-ignore-start lint/suspicious/noExplicitAny: test mocks and type casts */

interface CapturedCall {
  name: string;
  input: Record<string, unknown>;
}

/**
 * Builds a `DysflowMcpServices` whose `vbaSyncToolService.execute` records
 * every call. Returns the recorder so tests can assert on forwarded payloads.
 *
 * NOTE: we pass writesEnabled=true so the dispatch does not short-circuit
 * at MCP_WRITES_DISABLED before reaching the schema-validate step. F13 is
 * a SCHEMA-LAYER rejection, not a write-gate rejection — they happen at
 * different points in the handler, and the write-gate must not be the
 * one that returns the assertion signal.
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

function buildHandlerForTool(name: "import_modules" | "import_all") {
  const { services, captured } = makeServices();
  // createDispatchTool is the lower-level factory that does NOT import the
  // mcp-tool-contracts module (so it sidesteps any in-progress F12 alias
  // wiring and stays available even mid-rename).
  const tool = createDispatchTool(name, services, /* writesEnabled */ true, undefined, {});
  return { handler: tool.handler, captured };
}

describe("F13 — compile / rollbackOnCompileFail are silently stripped (silent no-op)", () => {
  describe("import_modules", () => {
    it("accepts { compile: false } without MCP_INPUT_INVALID and forwards the call", async () => {
      const { handler, captured } = buildHandlerForTool("import_modules");

      const result = await handler(
        {
          accessPath: "C:/project/Foo.accdb",
          projectRoot: "C:/project",
          dryRun: false,
          compile: false,
        },
        {} as any,
      );

      expect(result.isError).toBe(false);
      // The execute was called (proves validation did not reject the input).
      expect(captured).toHaveLength(1);
      expect(captured[0]?.name).toBe("import_modules");
      // The forwarded payload MUST NOT carry the deprecated `compile` key.
      expect(captured[0]?.input).not.toHaveProperty("compile");
    });

    it("accepts { compile: true } without MCP_INPUT_INVALID (silent no-op for old briefs)", async () => {
      const { handler, captured } = buildHandlerForTool("import_modules");

      const result = await handler(
        {
          accessPath: "C:/project/Foo.accdb",
          projectRoot: "C:/project",
          dryRun: false,
          compile: true,
        },
        {} as any,
      );

      expect(result.isError).toBe(false);
      expect(captured).toHaveLength(1);
      expect(captured[0]?.name).toBe("import_modules");
      expect(captured[0]?.input).not.toHaveProperty("compile");
    });

    it("accepts { rollbackOnCompileFail: true } without MCP_INPUT_INVALID (same deprecation category)", async () => {
      const { handler, captured } = buildHandlerForTool("import_modules");

      const result = await handler(
        {
          accessPath: "C:/project/Foo.accdb",
          projectRoot: "C:/project",
          dryRun: false,
          rollbackOnCompileFail: true,
        },
        {} as any,
      );

      expect(result.isError).toBe(false);
      expect(captured).toHaveLength(1);
      expect(captured[0]?.input).not.toHaveProperty("rollbackOnCompileFail");
    });

    it("does not synthesize a headless compile call when compile: true is passed (no compile_vba path exists)", async () => {
      // Belt-and-suspenders: even though compile_vba is removed end-to-end,
      // a passing compile:true brief MUST NOT regress by triggering a
      // compilation path. The captured call is the only execution side
      // effect; its data shape carries the import payload verbatim.
      const { handler, captured } = buildHandlerForTool("import_modules");

      await handler(
        {
          accessPath: "C:/project/Foo.accdb",
          projectRoot: "C:/project",
          moduleNames: ["Mod1", "Mod2"],
          dryRun: false,
          compile: true,
        },
        {} as any,
      );

      expect(captured).toHaveLength(1);
      // Only the import_modules dispatch ran. No compile_vba step, no second
      // execute call — the runtime simply does not compile.
      expect(captured[0]?.name).toBe("import_modules");
    });
  });

  describe("import_all", () => {
    it("accepts { compile: false } without MCP_INPUT_INVALID and forwards the call", async () => {
      const { handler, captured } = buildHandlerForTool("import_all");

      const result = await handler(
        {
          accessPath: "C:/project/Foo.accdb",
          projectRoot: "C:/project",
          dryRun: false,
          compile: false,
        },
        {} as any,
      );

      expect(result.isError).toBe(false);
      expect(captured).toHaveLength(1);
      expect(captured[0]?.name).toBe("import_all");
      expect(captured[0]?.input).not.toHaveProperty("compile");
    });

    it("accepts { compile: true } without MCP_INPUT_INVALID (silent no-op for old briefs)", async () => {
      const { handler, captured } = buildHandlerForTool("import_all");

      const result = await handler(
        {
          accessPath: "C:/project/Foo.accdb",
          projectRoot: "C:/project",
          dryRun: false,
          compile: true,
        },
        {} as any,
      );

      expect(result.isError).toBe(false);
      expect(captured).toHaveLength(1);
      expect(captured[0]?.name).toBe("import_all");
      expect(captured[0]?.input).not.toHaveProperty("compile");
    });
  });

  describe("behavioral parity with the no-compile call", () => {
    it("the captured input for { compile: false } matches the captured input for the same call without `compile` (only the deprecated key is absent)", async () => {
      const { handler: baselineHandler, captured: capturedBaseline } =
        buildHandlerForTool("import_modules");
      await baselineHandler(
        {
          accessPath: "C:/project/Foo.accdb",
          projectRoot: "C:/project",
          moduleNames: ["Mod1"],
          dryRun: false,
        },
        {} as any,
      );

      const { handler: compileHandler, captured: capturedCompile } =
        buildHandlerForTool("import_modules");
      await compileHandler(
        {
          accessPath: "C:/project/Foo.accdb",
          projectRoot: "C:/project",
          moduleNames: ["Mod1"],
          dryRun: false,
          compile: false,
        },
        {} as any,
      );

      expect(capturedBaseline).toHaveLength(1);
      expect(capturedCompile).toHaveLength(1);
      // Both forwarded inputs agree on every field that survived the strip.
      // We compare via JSON.stringify to keep the test assertion-order
      // independent (object key insertion order is preserved by the spread).
      expect(JSON.stringify(capturedCompile[0]?.input)).toBe(
        JSON.stringify(capturedBaseline[0]?.input),
      );
    });
  });
});

/* biome-ignore-end lint/suspicious/noExplicitAny: test mocks and type casts */
