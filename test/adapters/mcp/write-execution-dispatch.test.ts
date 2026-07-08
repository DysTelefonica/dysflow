/**
 * Issue #785 (v2.1.1) — write-execution dispatch seam tests.
 *
 * Pins the contract of `resolveEffectiveDryRunInput` (the helper centralizing
 * the per-tool dryRun default driven by the v2.1.0 write execution policy).
 * The helper is the SINGLE place that decides whether to inject `dryRun:
 * false` on top of a caller-supplied payload — the rest of the dispatch
 * pipeline and the adapter layer only see the resulting object.
 *
 * The contract is the (toolName, mode, input) triple:
 *   - Caller intent (any presence of `dryRun` or `apply`) always wins.
 *   - The form mutation / catalog family preserves its existing
 *     default-dry-run behavior under any policy.
 *   - routine-dev-write tools flip to execute-by-default ONLY in
 *     `developer` mode; everything else stays at the default.
 *   - Defensive: non-object inputs are returned verbatim.
 *   - Integration: dispatching `import_modules` through `createDispatchTool`
 *     with `writeExecutionPolicy: "developer"` reaches
 *     `vbaSyncToolService.execute` with a payload that carries `dryRun:
 *     false` injected.
 */

import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { resolveEffectiveDryRunInput } from "../../../src/adapters/mcp/write-execution-dispatch.js";
import { successResult } from "../../../src/core/contracts/index";
import type { WriteExecutionPolicy } from "../../../src/core/runtime/write-execution-policy.js";

// ─── Pure-helper truth table ─────────────────────────────────────────────────

describe("resolveEffectiveDryRunInput — (mode, risk, input) truth table (#785)", () => {
  // Per (mode, risk) row from `src/core/runtime/write-execution-policy.ts`.
  // Each row pins the helper's behavior on the input shape that lacks
  // explicit dryRun / apply.
  const cases: ReadonlyArray<{
    tool: string;
    risk: "routine-dev-write" | "protected-write" | "destructive-write" | "arbitrary-write";
    expected: Record<WriteExecutionPolicy, boolean>;
  }> = [
    { tool: "import_modules", risk: "routine-dev-write", expected: { "safe-by-default": true, developer: false } },
    { tool: "import_all", risk: "routine-dev-write", expected: { "safe-by-default": true, developer: false } },
    { tool: "test_vba", risk: "routine-dev-write", expected: { "safe-by-default": true, developer: false } },
    { tool: "export_modules", risk: "destructive-write", expected: { "safe-by-default": true, developer: true } },
    { tool: "delete_module", risk: "destructive-write", expected: { "safe-by-default": true, developer: true } },
    { tool: "fix_encoding", risk: "protected-write", expected: { "safe-by-default": true, developer: true } },
    { tool: "query_execute", risk: "arbitrary-write", expected: { "safe-by-default": true, developer: true } },
  ];

  for (const { tool, expected } of cases) {
    it(`${tool} in developer (no dryRun/apply) injects dryRun=${expected.developer}`, () => {
      const out = resolveEffectiveDryRunInput(tool, "developer", { moduleNames: ["Foo"] });
      expect(out).toEqual({ moduleNames: ["Foo"], dryRun: expected.developer });
    });

    it(`${tool} in safe-by-default (no dryRun/apply) injects dryRun=${expected["safe-by-default"]}`, () => {
      const out = resolveEffectiveDryRunInput(tool, "safe-by-default", { moduleNames: ["Foo"] });
      expect(out).toEqual({ moduleNames: ["Foo"], dryRun: expected["safe-by-default"] });
    });
  }
});

// ─── Caller intent always wins ───────────────────────────────────────────────

describe("resolveEffectiveDryRunInput — explicit caller intent wins (#785)", () => {
  it("dryRun:true is preserved even in developer mode", () => {
    const input = { moduleNames: ["Foo"], dryRun: true };
    const out = resolveEffectiveDryRunInput("import_modules", "developer", input);
    expect(out).toEqual(input);
  });

  it("dryRun:false is preserved even in safe-by-default", () => {
    const input = { moduleNames: ["Foo"], dryRun: false };
    const out = resolveEffectiveDryRunInput("import_modules", "safe-by-default", input);
    expect(out).toEqual(input);
  });

  it("apply:true is preserved (no dryRun injection)", () => {
    const input = { moduleNames: ["Foo"], apply: true };
    const out = resolveEffectiveDryRunInput("import_modules", "developer", input);
    expect(out).toEqual(input);
  });

  it("an empty input object receives the effective dryRun injection", () => {
    // design.md: "Explicit caller intent always wins" — an empty object is
    // explicit no intent, so the policy helper applies the effective default.
    const out = resolveEffectiveDryRunInput("import_modules", "developer", {});
    expect(out).toEqual({ dryRun: false });
  });
});

// ─── Form mutation / catalog family exemption ────────────────────────────────

describe("resolveEffectiveDryRunInput — form mutation / catalog family exempt (#785)", () => {
  // These tools have service-level defaults that this helper must not
  // flatten. Their dispatch is unchanged across both policies.
  const exemptFamily = [
    "form_add_control",
    "form_move_control",
    "form_rename_control",
    "form_deserialize",
    "create_form_from_template",
    "catalog_add_control",
    "generate_form",
  ] as const;

  for (const tool of exemptFamily) {
    it(`${tool} in developer (no flags) returns input unchanged`, () => {
      const input = { spec: { name: "Foo" }, projectRoot: "C:/p" };
      const out = resolveEffectiveDryRunInput(tool, "developer", input);
      expect(out).toEqual(input);
    });

    it(`${tool} in safe-by-default (no flags) returns input unchanged`, () => {
      const input = { spec: { name: "Foo" }, projectRoot: "C:/p" };
      const out = resolveEffectiveDryRunInput(tool, "safe-by-default", input);
      expect(out).toEqual(input);
    });
  }
});

// ─── Defensive shape handling ────────────────────────────────────────────────

describe("resolveEffectiveDryRunInput — defensive shape handling (#785)", () => {
  it("returns primitive input verbatim (defensive)", () => {
    const a = resolveEffectiveDryRunInput("import_modules", "developer", "raw-string");
    const b = resolveEffectiveDryRunInput("import_modules", "developer", 42);
    const c = resolveEffectiveDryRunInput("import_modules", "developer", true);
    expect(a).toBe("raw-string");
    expect(b).toBe(42);
    expect(c).toBe(true);
  });

  it("returns null / undefined input verbatim (defensive)", () => {
    expect(resolveEffectiveDryRunInput("import_modules", "developer", null)).toBeNull();
    expect(resolveEffectiveDryRunInput("import_modules", "developer", undefined)).toBeUndefined();
  });

  it("uses Object.hasOwn semantics — { dryRun: undefined } counts as 'present'", () => {
    // The design uses `Object.hasOwn(record, "dryRun")` which returns
    // `true` even when the value is `undefined`. The helper therefore
    // treats `{ dryRun: undefined }` as explicit caller intent (which
    // happens to say "no opinion"). This pins the actual contract so a
    // future refactor that flips to `in` / `'dryRun' in record` would
    // change behavior — and that flip would be a real contract change,
    // not a silent mutation.
    const out = resolveEffectiveDryRunInput("import_modules", "developer", {
      moduleNames: ["Foo"],
      dryRun: undefined,
    });
    expect(out).toEqual({ moduleNames: ["Foo"], dryRun: undefined });
  });
});

// ─── Dispatch seam — forwarding through createDispatchTool ──────────────────

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
    vbaSyncToolService,
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  };
}

describe("writeExecutionPolicy forward — dispatch seam (#785)", () => {
  it("developer + import_modules without flags → vbaSyncToolService receives dryRun:false", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools({
      services,
      writes: true,
      writeExecutionPolicy: "developer",
    });
    const tool = tools.find((candidate) => candidate.name === "import_modules");
    if (!tool) throw new Error("import_modules not registered");

    await tool.handler({
      moduleNames: ["Foo"],
      projectRoot: "C:/project",
      accessPath: "C:/project/frontend.accdb",
    });

    expect(services.vbaSyncToolService.requests).toHaveLength(1);
    expect(services.vbaSyncToolService.requests[0]).toMatchObject({
      dryRun: false,
      moduleNames: ["Foo"],
    });
  });

  it("safe-by-default + import_modules without flags → vbaSyncToolService receives dryRun:true", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools({
      services,
      writes: true,
      writeExecutionPolicy: "safe-by-default",
    });
    const tool = tools.find((candidate) => candidate.name === "import_modules");
    if (!tool) throw new Error("import_modules not registered");

    await tool.handler({
      moduleNames: ["Foo"],
      projectRoot: "C:/project",
      accessPath: "C:/project/frontend.accdb",
    });

    expect(services.vbaSyncToolService.requests).toHaveLength(1);
    expect(services.vbaSyncToolService.requests[0]).toMatchObject({
      dryRun: true,
      moduleNames: ["Foo"],
    });
  });

  it("explicit dryRun:true wins over developer mode (caller intent)", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools({
      services,
      writes: true,
      writeExecutionPolicy: "developer",
    });
    const tool = tools.find((candidate) => candidate.name === "import_modules");
    if (!tool) throw new Error("import_modules not registered");

    await tool.handler({
      moduleNames: ["Foo"],
      projectRoot: "C:/project",
      accessPath: "C:/project/frontend.accdb",
      dryRun: true,
    });

    expect(services.vbaSyncToolService.requests).toHaveLength(1);
    expect(services.vbaSyncToolService.requests[0]).toMatchObject({
      dryRun: true,
    });
  });

  it("omitted writeExecutionPolicy defaults to safe-by-default (no behavior change)", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools({ services, writes: true });
    const tool = tools.find((candidate) => candidate.name === "import_modules");
    if (!tool) throw new Error("import_modules not registered");

    await tool.handler({
      moduleNames: ["Foo"],
      projectRoot: "C:/project",
      accessPath: "C:/project/frontend.accdb",
    });

    expect(services.vbaSyncToolService.requests).toHaveLength(1);
    expect(services.vbaSyncToolService.requests[0]).toMatchObject({
      dryRun: true,
    });
  });
});
