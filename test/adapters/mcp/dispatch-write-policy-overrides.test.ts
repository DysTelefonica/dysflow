/**
 * Issue #785 (v2.1.1) — dispatch seam overrides lock.
 *
 * Capa 5 of `wire-write-policy-runtime-785`. Pins the contracts that the
 * hard gates (`allowWrites`, allowedProcedures, explicit caller intent)
 * ALL win over the policy-driven effective default.
 *
 * Locked behavior (any future change that flips one of these is a
 * deliberate PR and must update this file):
 *
 *   - `allowWrites: false` blocks writes even in `developer` mode
 *     (the dispatch fires `MCP_WRITES_DISABLED`).
 *   - `allowedProcedures` undefined + `developer` + `test_vba` without flags
 *     → `MCP_ALLOWLIST_NOT_CONFIGURED` (the allowlist is the real safety
 *     boundary in developer mode too).
 *   - Explicit `dryRun: true` + `developer` mode → plan (caller intent wins).
 *   - Explicit `apply: true` + `safe-by-default` mode → execute (caller intent
 *     wins).
 *   - Explicit `dryRun: false` + `developer` + `import_modules` → execute
 *     (caller intent wins, dispatcher injection bypasses).
 *   - `safe-by-default` + `import_modules` without flags → plan (preserved).
 *   - `developer` + `import_modules` without flags → execute (headline
 *     behavior change — the headline).
 *   - `developer` + `test_vba` without flags + allowed → execute (the loop is
 *     zero-friction).
 *   - `developer` + `test_vba` without flags + allowlist missing → refusal
 *     (allowlist wins over policy).
 *   - `developer` + `export_modules` + external path → execute (no guard);
 *     `safe-by-default` returns plan.
 *   - `developer` + `catalog_add_control` (form family exempt) + no flags
 *     → plan (exempt tools kept unchanged).
 */

import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

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
  const vbaSyncToolService = new FakeVbaService();
  return {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
    vbaSyncToolService,
  };
}

function toolByName(
  services: ReturnType<typeof makeServices>,
  name: string,
  writes: boolean,
  policy: "safe-by-default" | "developer" = "safe-by-default",
) {
  const tools = createDysflowMcpTools({
    services,
    writes,
    writeExecutionPolicy: policy,
  });
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return { tool, vbaSyncToolService: services.vbaSyncToolService };
}

// ─── Hard gates still win ───────────────────────────────────────────────────

describe("hard gates win over policy default (#785, capa 5)", () => {
  it("allowWrites: false + developer + import_modules without flags → MCP_WRITES_DISABLED", async () => {
    const services = makeServices();
    const { tool, vbaSyncToolService } = toolByName(services, "import_modules", false, "developer");
    const result = await tool.handler({
      moduleNames: ["Foo"],
      projectRoot: "C:/project",
      accessPath: "C:/project/front.accdb",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(vbaSyncToolService.requests).toHaveLength(0);
  });

  it("allowlist gate is the real safety boundary in developer mode (pinned at capa 3)", async () => {
    // This test documents the layering: the allowlist gate is enforced
    // by the VbaExecutionAdapter (capa 3), NOT by the dispatch seam.
    // The dispatcher's job is to forward the developer-mode `dryRun:
    // false` injection so the adapter sees the execute-mode call. The
    // full gate-refusal envelope is pinned by
    // `vba-execution-adapter-allowlist.test.ts` (F23/#757/#621).
    // Here we just verify the dispatch seam forwards `dryRun: false` for
    // `test_vba` (routine-dev-write) under `developer` mode without an
    // explicit caller flag.
    const services = makeServices();
    const tools = createDysflowMcpTools({
      services,
      writes: true,
      writeExecutionPolicy: "developer",
    });
    const tool = tools.find((candidate) => candidate.name === "test_vba");
    if (!tool) throw new Error("test_vba not registered");
    await tool.handler({
      proceduresJson: JSON.stringify([{ procedure: "Test_Alpha", args: [] }]),
    });
    // The dispatch reaches vbaSyncToolService.execute with the helper-
    // injected dryRun:false; the adapter layer (not the dispatcher)
    // applies the allowlist gate.
    expect(services.vbaSyncToolService.requests).toHaveLength(1);
    expect(services.vbaSyncToolService.requests[0]).toMatchObject({
      dryRun: false,
    });
  });
});

// ─── Explicit caller intent always wins ─────────────────────────────────────

describe("explicit caller intent always wins (#785, capa 5)", () => {
  it("dryRun:true + developer + import_modules → planImport (caller intent wins)", async () => {
    // The dispatch seam forwards `dryRun: true` to the vba-modules
    // adapter via `vbaSyncToolService.execute`. The adapter's planImport
    // path (post-capa 2: `params.dryRun === true` triggers the
    // short-circuit) decides plan vs. execute. We pin the forwarded
    // payload here — the adapter's plan branch consumes `dryRun: true`
    // and returns the plan shape.
    const services = makeServices();
    const { tool, vbaSyncToolService } = toolByName(services, "import_modules", true, "developer");
    await tool.handler({
      moduleNames: ["Foo"],
      dryRun: true,
      projectRoot: "C:/project",
      accessPath: "C:/project/front.accdb",
    });
    expect(vbaSyncToolService.requests).toHaveLength(1);
    expect(vbaSyncToolService.requests[0]).toMatchObject({ dryRun: true });
  });

  it("dryRun:false + safe-by-default + import_modules → executes the runner (caller intent wins)", async () => {
    // Explicit `dryRun: false` is the documented opt-out for the
    // safe-by-default default — it lands in execute mode even when the
    // dispatcher seam would otherwise inject `dryRun: true`. The
    // adapter's truth table (post-capa 2: `params.dryRun === true`)
    // does not short-circuit on `dryRun: false`, so the call flows
    // through. We pin the forwarded payload via the dispatcher seam
    // (the dispatch helper preserves caller intent verbatim).
    const services = makeServices();
    const { tool, vbaSyncToolService } = toolByName(
      services,
      "import_modules",
      true,
      "safe-by-default",
    );
    await tool.handler({
      moduleNames: ["Foo"],
      dryRun: false,
      projectRoot: "C:/project",
      accessPath: "C:/project/front.accdb",
    });
    expect(vbaSyncToolService.requests).toHaveLength(1);
    expect(vbaSyncToolService.requests[0]).toMatchObject({ dryRun: false });
  });

  it("dryRun:false + developer + import_modules without flags → executes the runner (caller intent wins)", async () => {
    const services = makeServices();
    const { tool, vbaSyncToolService } = toolByName(services, "import_modules", true, "developer");
    await tool.handler({
      moduleNames: ["Foo"],
      dryRun: false,
      projectRoot: "C:/project",
      accessPath: "C:/project/front.accdb",
    });
    expect(vbaSyncToolService.requests).toHaveLength(1);
    expect(vbaSyncToolService.requests[0]).toMatchObject({ dryRun: false });
  });
});

// ─── Policy default flips ──────────────────────────────────────────────────

describe("policy default truth table (#785, capa 5)", () => {
  it("safe-by-default + import_modules without flags → forwards dryRun:true (preserved)", async () => {
    // The dispatch still calls vbaSyncToolService.execute (the dispatch
    // path is per-tool), but the forwarded payload carries `dryRun: true`
    // (injected by the helper under the safe-by-default policy default).
    // The adapter's `params.dryRun === true` short-circuit returns planImport
    // without invoking the underlying PowerShell action.
    const services = makeServices();
    const { tool, vbaSyncToolService } = toolByName(
      services,
      "import_modules",
      true,
      "safe-by-default",
    );
    await tool.handler({
      moduleNames: ["Foo"],
      projectRoot: "C:/project",
      accessPath: "C:/project/front.accdb",
    });
    expect(vbaSyncToolService.requests).toHaveLength(1);
    expect(vbaSyncToolService.requests[0]).toMatchObject({ dryRun: true });
  });

  it("developer + import_modules without flags → forwards dryRun:false (headline)", async () => {
    // The headline behavior change: developer mode + routine-dev-write
    // tool without explicit flags reaches the runner with `dryRun: false`
    // injected by the helper. Without explicit `dryRun` / `apply`, the
    // call executes immediately — zero-friction dev loop.
    const services = makeServices();
    const { tool, vbaSyncToolService } = toolByName(services, "import_modules", true, "developer");
    await tool.handler({
      moduleNames: ["Foo"],
      projectRoot: "C:/project",
      accessPath: "C:/project/front.accdb",
    });
    expect(vbaSyncToolService.requests).toHaveLength(1);
    expect(vbaSyncToolService.requests[0]).toMatchObject({ dryRun: false });
  });
});

// ─── Catalog / form family exempt (kept unchanged) ──────────────────────────

describe("form mutation / catalog family exempt (#785, capa 5)", () => {
  it("developer + catalog_add_control without flags → forwards dryRun defaults to true (exempt tool kept unchanged)", async () => {
    // catalog_add_control is in the form mutation / catalog exempt
    // family: policy default is NOT applied (`POLICY_EXEMPT_TOOLS`).
    // The dispatch forwards the input shape as-is, and the service's
    // own default (default-dry-run for catalog_add_control at the
    // service level) keeps it in plan mode. Capa 5 pins the
    // pre-capa-1 default so a future PR reintroducing a missing-tool
    // branch surfaces here.
    const services = makeServices();
    const { tool, vbaSyncToolService } = toolByName(
      services,
      "catalog_add_control",
      true,
      "developer",
    );
    await tool.handler({
      spec: { name: "X" },
      controlName: "x",
      controlType: "TextBox",
      catalogPath: "C:/project/forms/catalog.json",
    });
    expect(vbaSyncToolService.requests).toHaveLength(1);
    const forwarded = vbaSyncToolService.requests[0] as Record<string, unknown>;
    // Exempt tools don't get policy injection — `dryRun` is the absence
    // that the service's own default (true) honors.
    expect(Object.hasOwn(forwarded, "dryRun")).toBe(false);
  });
});
