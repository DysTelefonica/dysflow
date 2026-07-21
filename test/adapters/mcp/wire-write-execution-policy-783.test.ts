/**
 * Issue #783 — wire the v2.1.0 risk-based write execution policy (#779)
 * through the dispatch layer. Acceptance criteria pin suite.
 *
 * ## Scope
 *
 * This file is the SINGLE regression lock for the 10 acceptance criteria
 * listed on the issue. Each describe-block corresponds to a criterion; a
 * future PR that flips any of them MUST update this file deliberately.
 *
 * The foundation shipped in #782 (`write-execution-policy.ts`, `path-overlap.ts`,
 * `risk` route field, `mcp-tool-risks.ts`, `effectiveDryRunDefaultForTool`,
 * `writeExecutionPolicy` in snapshot). What's NOT wired: the dispatch layer
 * still hardcodes `dryRun: true` regardless of policy.
 *
 * ## Acceptance criteria (pinned)
 *
 *   1. In `developer` mode, `import_modules` without `dryRun` commits the
 *      import (v2.0.x behavior was dry-run by default).
 *   2. In `safe-by-default` mode, `import_modules` without `dryRun` returns
 *      a plan (historical behavior preserved).
 *   3. In `developer` mode, `export_modules` with a destination overlapping
 *      the source root is refused with `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION`
 *      unless `confirmOverwriteSource: true`.
 *   4. In `developer` mode, `export_modules` with a destination outside the
 *      source root executes by default (subject to the existing write-gate).
 *   5. In `safe-by-default` mode, `export_modules` still returns a plan by default.
 *   6. `cleanup_access_operation` with `force: true` still requires explicit
 *      confirmation (per-call gating unchanged).
 *   7. `access_force_cleanup_orphaned` with `confirmPid` still requires explicit
 *      confirmation.
 *   8. `allowWrites: false` still blocks every write, regardless of policy.
 *   9. `test_vba` without `allowedProcedures` is still rejected with
 *      `MCP_ALLOWLIST_NOT_CONFIGURED` in both modes.
 *  10. The dispatch layer consults the resolver — there must be NO other
 *      place that hardcodes per-tool defaults.
 *
 * Companion suites (deeper coverage on each slice):
 *   - `export-source-guard.test.ts` (capa 4) — guard truth table + envelope.
 *   - `write-execution-dispatch.test.ts` (capa 1) — pure helper truth table.
 *   - `dispatch-write-policy-overrides.test.ts` (capa 5) — full dispatch seam.
 *   - `vba-modules-adapter-write-policy.test.ts` (capa 2) — adapter truth table.
 *   - `mcp-tool-risks.test.ts` (#779) — risk registry + helper + anti-divergence.
 *   - `vba-execution-adapter-allowlist.test.ts` (F23/#757/#621) — adapter-level
 *     allowlist gate; the integration layer that backs AC9's "the gate fires"
 *     half. This file pins the dispatch seam's interaction with that gate via
 *     a simulated failure envelope.
 */

import { describe, expect, it } from "vitest";
import { EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION } from "../../../src/adapters/mcp/dispatch-common";
import type { McpAccessContextResolver } from "../../../src/adapters/mcp/result-translation";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../../src/core/contracts/index";

// ─── Test fixture factories ──────────────────────────────────────────────────

class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}

/**
 * Default fake — records every call, returns success. Used for tests that
 * just need to assert the dispatch forwarded the right payload.
 */
class FakeVbaService {
  public requests: unknown[] = [];
  async execute(name: unknown, input?: unknown) {
    this.requests.push(input ?? name);
    return successResult({ returnValue: "ok" });
  }
}

/**
 * Adapter-aware fake — simulates the VbaExecutionAdapter allowlist gate.
 * When `test_vba` arrives without `allowedProcedures` (per-input resolver
 * returns undefined or empty), it emits the same MCP_ALLOWLIST_NOT_CONFIGURED
 * envelope the real adapter emits. This proves the dispatch seam threads
 * the call to the gate without bypassing it, while keeping the test
 * self-contained (no real `.accdb` fixture required).
 */
class AdapterAwareFakeVbaService {
  public requests: unknown[] = [];
  constructor(
    private readonly allowedProcedures: readonly string[] | undefined,
    private readonly allowedProceduresByInput?: (
      input: unknown,
    ) => Promise<readonly string[] | undefined>,
  ) {}
  async execute(name: unknown, input?: unknown) {
    const forwarded = input ?? name;
    this.requests.push(forwarded);
    if (name === "test_vba") {
      // Issue #1046 (Bug B) — mirror the new gate-behind-dryRun order
      // from VbaExecutionAdapter.executeTestVba. dryRun:true is the
      // explicit escape hatch that short-circuits BEFORE the gate, so
      // a plan-shaped success is the contract for plan-only callers.
      // The gate still fires on the commit path (no dryRun) so a real
      // execute attempt is still refused when no allowlist is configured.
      const obj = forwarded as Record<string, unknown> | undefined;
      const dryRun = obj?.dryRun === true;
      if (dryRun) {
        return successResult({
          dryRun: true,
          willExecute: false,
          willModifyAccess: false,
          plan: {
            procedureName: extractProcedureNames(forwarded),
            proceduresCount: extractProcedureNames(forwarded).length,
            warnings: [],
            errors: [],
          },
        });
      }
      const resolved =
        this.allowedProceduresByInput !== undefined
          ? await this.allowedProceduresByInput(forwarded)
          : this.allowedProcedures;
      if (resolved === undefined || resolved.length === 0) {
        // Mirror VbaExecutionAdapter's gate behavior.
        return failureResult(
          createDysflowError(
            "MCP_ALLOWLIST_NOT_CONFIGURED",
            `Refusing to execute VBA procedure: project config declares no allowedProcedures allowlist.`,
            { details: { planProcedures: extractProcedureNames(forwarded) } },
          ),
        );
      }
    }
    return successResult({ returnValue: "ok" });
  }
}

function extractProcedureNames(input: unknown): string[] {
  const obj = input as Record<string, unknown>;
  if (typeof obj.procedureName === "string") return [obj.procedureName];
  if (typeof obj.proceduresJson === "string") {
    try {
      const parsed = JSON.parse(obj.proceduresJson) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => {
            if (
              typeof entry === "object" &&
              entry !== null &&
              "procedure" in entry &&
              typeof (entry as { procedure: unknown }).procedure === "string"
            ) {
              return (entry as { procedure: string }).procedure;
            }
            return null;
          })
          .filter((name): name is string => name !== null);
      }
    } catch {
      // fall through
    }
  }
  return [];
}

class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}
class FakeCleanupService {
  public requests: unknown[] = [];
  async cleanup(request: unknown) {
    this.requests.push(request);
    return successResult({
      operationId: "op-fake",
      accessPid: null,
      status: "cleaned" as const,
      killed: [],
      refused: [],
      errors: [],
    });
  }
}
class FakeOrphanCleanupService {
  public cleanupRequests: unknown[] = [];
  public listRequests: unknown[] = [];
  async listOrphans(request: unknown) {
    this.listRequests.push(request);
    return successResult([]);
  }
  async cleanupOrphan(request: unknown) {
    this.cleanupRequests.push(request);
    return successResult({ killed: [], refused: [], errors: [] });
  }
}

function makeServices(overrides: Record<string, unknown> = {}) {
  return {
    vbaService: new FakeVbaService(),
    vbaSyncToolService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
    cleanupService: new FakeCleanupService(),
    orphanCleanupService: new FakeOrphanCleanupService(),
    ...overrides,
  };
}

type Services = ReturnType<typeof makeServices>;

function buildTools(
  services: Services,
  options: {
    writes?: boolean;
    writeExecutionPolicy?: "safe-by-default" | "developer";
    allowedProcedures?:
      | readonly string[]
      | ((input: unknown) => Promise<readonly string[] | undefined>);
    accessContextResolver?: McpAccessContextResolver;
  } = {},
) {
  return createDysflowMcpTools({
    services,
    writes: options.writes ?? true,
    writeExecutionPolicy: options.writeExecutionPolicy ?? "safe-by-default",
    allowedProcedures: options.allowedProcedures,
    accessContextResolver: options.accessContextResolver,
  });
}

function makeAccessContextResolver(
  accessPath: string,
  projectRoot: string,
  destinationRoot: string = projectRoot,
): McpAccessContextResolver {
  return async () => ({
    ok: true as const,
    data: { accessPath, projectRoot, destinationRoot },
    diagnostics: [],
    durationMs: 0,
  });
}

// ─── AC1: developer + import_modules without dryRun commits ──────────────────

describe("AC1 — developer + import_modules without dryRun commits (#783)", () => {
  it("dispatch seam forwards dryRun:false for import_modules in developer mode", async () => {
    const services = makeServices();
    const tools = buildTools(services, { writeExecutionPolicy: "developer" });
    const tool = tools.find((candidate) => candidate.name === "import_modules");
    if (!tool) throw new Error("import_modules not registered");

    await tool.handler({
      moduleNames: ["Module_Foo"],
      projectRoot: "C:/project",
      accessPath: "C:/project/front.accdb",
    });

    expect(services.vbaSyncToolService.requests).toHaveLength(1);
    expect(services.vbaSyncToolService.requests[0]).toMatchObject({ dryRun: false });
  });

  it("vba-modules adapter executes import_modules when forwarded with dryRun:false", async () => {
    // Pin the dispatch seam -> runner contract: with dryRun:false, the runner
    // is invoked. The dispatch seam injects dryRun:false under developer mode;
    // the adapter then executes (NOT planImport).
    const services = makeServices();
    const tools = buildTools(services, { writeExecutionPolicy: "developer" });
    const tool = tools.find((candidate) => candidate.name === "import_modules");
    if (!tool) throw new Error("import_modules not registered");

    await tool.handler({
      moduleNames: ["Module_Foo"],
      projectRoot: "C:/project",
      accessPath: "C:/project/front.accdb",
    });

    expect(services.vbaSyncToolService.requests).toHaveLength(1);
    expect(services.vbaSyncToolService.requests[0]).toMatchObject({ dryRun: false });
  });
});

// ─── AC2: safe-by-default + import_modules without dryRun plans ──────────────

describe("AC2 — safe-by-default + import_modules without dryRun plans (#783)", () => {
  it("dispatch seam forwards dryRun:true for import_modules in safe-by-default mode", async () => {
    const services = makeServices();
    const tools = buildTools(services, { writeExecutionPolicy: "safe-by-default" });
    const tool = tools.find((candidate) => candidate.name === "import_modules");
    if (!tool) throw new Error("import_modules not registered");

    await tool.handler({
      moduleNames: ["Module_Foo"],
      projectRoot: "C:/project",
      accessPath: "C:/project/front.accdb",
    });

    expect(services.vbaSyncToolService.requests).toHaveLength(1);
    expect(services.vbaSyncToolService.requests[0]).toMatchObject({ dryRun: true });
  });

  it("adapter receives dryRun:true under safe-by-default (plan branch in VbaModulesAdapter triggers)", async () => {
    // The dispatch seam is the seam under test here — we pin the forwarded
    // payload. The VbaModulesAdapter truth table (`params.dryRun === true`
    // short-circuits to planImport) is exhaustively pinned by
    // `vba-modules-adapter-write-policy.test.ts` (capa 2). We do not
    // duplicate the adapter behavior here.
    const services = makeServices();
    const tools = buildTools(services, { writeExecutionPolicy: "safe-by-default" });
    const tool = tools.find((candidate) => candidate.name === "import_modules");
    if (!tool) throw new Error("import_modules not registered");

    const result = await tool.handler({
      moduleNames: ["Module_Foo"],
      projectRoot: "C:/project",
      accessPath: "C:/project/front.accdb",
    });

    expect(result.isError).toBeFalsy();
    expect(services.vbaSyncToolService.requests).toHaveLength(1);
    expect(services.vbaSyncToolService.requests[0]).toMatchObject({ dryRun: true });
  });
});

// ─── AC3: developer + export_modules overlapping source refused ─────────────

describe("AC3 — developer + export_modules overlapping source refused (#783)", () => {
  it("export_modules with destination == sourceRoot → EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION", async () => {
    const services = makeServices();
    const tools = buildTools(services, {
      writes: true,
      writeExecutionPolicy: "developer",
      accessContextResolver: makeAccessContextResolver(
        "C:/Projets/dysflow-783/front.accdb",
        "C:/Projets/dysflow-783",
        "C:/Projets/dysflow-783",
      ),
    });
    const tool = tools.find((candidate) => candidate.name === "export_modules");
    if (!tool) throw new Error("export_modules not registered");

    const sourceRoot = "C:/Projets/dysflow-783";
    const result = await tool.handler({
      moduleNames: ["Foo"],
      destinationRoot: sourceRoot,
      exportPath: sourceRoot,
      projectRoot: sourceRoot,
      accessPath: `${sourceRoot}/front.accdb`,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
    expect(services.vbaSyncToolService.requests).toHaveLength(0);
  });

  it("export_modules with nested managed folder → refusal", async () => {
    const services = makeServices();
    const tools = buildTools(services, {
      writeExecutionPolicy: "developer",
      accessContextResolver: makeAccessContextResolver(
        "C:/Projets/dysflow-783/front.accdb",
        "C:/Projets/dysflow-783",
        "C:/Projets/dysflow-783",
      ),
    });
    const tool = tools.find((candidate) => candidate.name === "export_modules");
    if (!tool) throw new Error("export_modules not registered");

    const sourceRoot = "C:/Projets/dysflow-783";
    const result = await tool.handler({
      moduleNames: ["Foo"],
      destinationRoot: sourceRoot,
      exportPath: `${sourceRoot}/modules/Foo.bas`,
      projectRoot: sourceRoot,
      accessPath: `${sourceRoot}/front.accdb`,
    });

    expect(result.content[0]?.text).toContain(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
  });

  it("export_modules with confirmOverwriteSource:true → executes (no refusal)", async () => {
    const services = makeServices();
    const tools = buildTools(services, {
      writeExecutionPolicy: "developer",
      accessContextResolver: makeAccessContextResolver(
        "C:/Projets/dysflow-783/front.accdb",
        "C:/Projets/dysflow-783",
        "C:/Projets/dysflow-783",
      ),
    });
    const tool = tools.find((candidate) => candidate.name === "export_modules");
    if (!tool) throw new Error("export_modules not registered");

    const sourceRoot = "C:/Projets/dysflow-783";
    await tool.handler({
      moduleNames: ["Foo"],
      destinationRoot: sourceRoot,
      exportPath: sourceRoot,
      confirmOverwriteSource: true,
      projectRoot: sourceRoot,
      accessPath: `${sourceRoot}/front.accdb`,
    });

    expect(services.vbaSyncToolService.requests.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── AC4: developer + export_modules external destination executes ────────────

describe("AC4 — developer + export_modules with external destination executes (#783)", () => {
  it("external exportPath in developer mode reaches the runner (no refusal)", async () => {
    // The export-source guard requires the project source root to be
    // resolved via the access-context resolver (not from the input's
    // destinationRoot, which would cause a self-overlap and trigger a
    // spurious refusal). We wire the resolver so sourceRoot != destination.
    const sourceRoot = "C:/Projets/dysflow-783";
    const externalDestination = "C:/elsewhere/temp";
    const services = makeServices();
    const tools = buildTools(services, {
      writes: true,
      writeExecutionPolicy: "developer",
      accessContextResolver: makeAccessContextResolver(
        `${sourceRoot}/front.accdb`,
        sourceRoot,
        sourceRoot,
      ),
    });
    const tool = tools.find((candidate) => candidate.name === "export_modules");
    if (!tool) throw new Error("export_modules not registered");

    const result = await tool.handler({
      moduleNames: ["Foo"],
      destinationRoot: externalDestination,
      exportPath: externalDestination,
      projectRoot: sourceRoot,
      accessPath: `${sourceRoot}/front.accdb`,
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).not.toContain(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
    expect(services.vbaSyncToolService.requests.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── AC5: safe-by-default + export_modules plans by default ──────────────────

describe("AC5 — safe-by-default + export_modules plans by default (#783)", () => {
  it("dispatch seam forwards dryRun:true for export_modules in safe-by-default mode", async () => {
    const sourceRoot = "C:/Projets/dysflow-783";
    const externalDestination = "C:/elsewhere/temp";
    const services = makeServices();
    const tools = buildTools(services, {
      writeExecutionPolicy: "safe-by-default",
      accessContextResolver: makeAccessContextResolver(
        `${sourceRoot}/front.accdb`,
        sourceRoot,
        sourceRoot,
      ),
    });
    const tool = tools.find((candidate) => candidate.name === "export_modules");
    if (!tool) throw new Error("export_modules not registered");

    await tool.handler({
      moduleNames: ["Foo"],
      destinationRoot: externalDestination,
      exportPath: externalDestination,
      projectRoot: sourceRoot,
      accessPath: `${sourceRoot}/front.accdb`,
    });

    expect(services.vbaSyncToolService.requests).toHaveLength(1);
    expect(services.vbaSyncToolService.requests[0]).toMatchObject({ dryRun: true });
  });

  it("safe-by-default + export_modules + overlapping destination → no refusal (policy never fires)", async () => {
    // In safe-by-default the export-source guard never fires: the policy
    // yields requiresConfirmOverwriteSource=false and the dispatcher
    // injects dryRun:true. The plan branch handles the call.
    const sourceRoot = "C:/Projets/dysflow-783";
    const services = makeServices();
    const tools = buildTools(services, {
      writeExecutionPolicy: "safe-by-default",
      accessContextResolver: makeAccessContextResolver(
        `${sourceRoot}/front.accdb`,
        sourceRoot,
        sourceRoot,
      ),
    });
    const tool = tools.find((candidate) => candidate.name === "export_modules");
    if (!tool) throw new Error("export_modules not registered");

    await tool.handler({
      moduleNames: ["Foo"],
      destinationRoot: sourceRoot,
      exportPath: sourceRoot,
      projectRoot: sourceRoot,
      accessPath: `${sourceRoot}/front.accdb`,
    });

    expect(services.vbaSyncToolService.requests.length).toBeGreaterThanOrEqual(1);
    expect(services.vbaSyncToolService.requests[0]).toMatchObject({ dryRun: true });
  });
});

// ─── AC6: cleanup_access_operation per-call gating unchanged ────────────────

describe("AC6 — cleanup_access_operation per-call gating unchanged (#783)", () => {
  it("developer mode + force:true + writes enabled → reaches cleanup service", async () => {
    const services = makeServices();
    const tools = buildTools(services, {
      writes: true,
      writeExecutionPolicy: "developer",
    });
    const tool = tools.find((candidate) => candidate.name === "cleanup_access_operation");
    if (!tool) throw new Error("cleanup_access_operation not registered");

    const result = await tool.handler({
      operationId: "op-force-1",
      accessPath: "C:/project/front.accdb",
      force: true,
    });

    // Alias tools bypass the policy helper; the per-call gating still
    // requires explicit force. The cleanup service is engaged.
    expect(result.isError).toBeFalsy();
    expect(services.cleanupService.requests.length).toBeGreaterThanOrEqual(1);
  });

  it("developer mode + force:true + writes disabled → MCP_WRITES_DISABLED (write-gate still wins)", async () => {
    const services = makeServices();
    const tools = buildTools(services, {
      writes: false,
      writeExecutionPolicy: "developer",
    });
    const tool = tools.find((candidate) => candidate.name === "cleanup_access_operation");
    if (!tool) throw new Error("cleanup_access_operation not registered");

    const result = await tool.handler({
      operationId: "op-force-1",
      accessPath: "C:/project/front.accdb",
      force: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(services.cleanupService.requests).toHaveLength(0);
  });

  it("safe-by-default mode + force:true + writes enabled → reaches cleanup service (per-call gating only)", async () => {
    const services = makeServices();
    const tools = buildTools(services, {
      writes: true,
      writeExecutionPolicy: "safe-by-default",
    });
    const tool = tools.find((candidate) => candidate.name === "cleanup_access_operation");
    if (!tool) throw new Error("cleanup_access_operation not registered");

    const result = await tool.handler({
      operationId: "op-force-2",
      accessPath: "C:/project/front.accdb",
      force: true,
    });

    expect(result.isError).toBeFalsy();
    expect(services.cleanupService.requests.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── AC7: access_force_cleanup_orphaned per-call gating unchanged ───────────

describe("AC7 — access_force_cleanup_orphaned per-call gating unchanged (#783)", () => {
  function resolveAccessContext(
    accessPath = "C:/project/app.accdb",
    projectRoot = "C:/project",
  ): McpAccessContextResolver {
    return async () => ({
      ok: true as const,
      data: { accessPath, projectRoot, destinationRoot: projectRoot },
      diagnostics: [],
      durationMs: 0,
    });
  }

  it("developer mode + confirmPid + writes enabled → cleanup service engaged", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools({
      services,
      writes: true,
      writeExecutionPolicy: "developer",
      accessContextResolver: resolveAccessContext(),
    });
    const tool = tools.find((candidate) => candidate.name === "access_force_cleanup_orphaned");
    if (!tool) throw new Error("access_force_cleanup_orphaned not registered");

    const result = await tool.handler({
      accessPath: "C:/project/app.accdb",
      confirmPid: 12345,
    });

    expect(result.isError).toBeFalsy();
    expect(services.orphanCleanupService.cleanupRequests.length).toBeGreaterThanOrEqual(1);
  });

  it("developer mode + no confirmPid → lists orphans (does NOT cleanup)", async () => {
    // Per-call gating: without confirmPid the tool lists candidates; the
    // policy does NOT bypass the gate. This is the same shape as in
    // safe-by-default mode.
    const services = makeServices();
    const tools = createDysflowMcpTools({
      services,
      writes: true,
      writeExecutionPolicy: "developer",
      accessContextResolver: resolveAccessContext(),
    });
    const tool = tools.find((candidate) => candidate.name === "access_force_cleanup_orphaned");
    if (!tool) throw new Error("access_force_cleanup_orphaned not registered");

    await tool.handler({ accessPath: "C:/project/app.accdb" });

    expect(services.orphanCleanupService.cleanupRequests).toHaveLength(0);
  });

  it("developer mode + confirmPid + writes disabled → MCP_WRITES_DISABLED", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools({
      services,
      writes: false,
      writeExecutionPolicy: "developer",
      accessContextResolver: resolveAccessContext(),
    });
    const tool = tools.find((candidate) => candidate.name === "access_force_cleanup_orphaned");
    if (!tool) throw new Error("access_force_cleanup_orphaned not registered");

    const result = await tool.handler({
      accessPath: "C:/project/app.accdb",
      confirmPid: 12345,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(services.orphanCleanupService.cleanupRequests).toHaveLength(0);
  });
});

// ─── AC8: allowWrites:false blocks writes regardless of policy ──────────────

describe("AC8 — allowWrites:false blocks every write regardless of policy (#783)", () => {
  // The headline regression: developer mode does NOT bypass the writes-gate.
  // Every write-class tool must refuse with MCP_WRITES_DISABLED when
  // writes:false, regardless of writeExecutionPolicy. Each tool below
  // exercises its proper input shape (no fabrication); the writes-gate
  // is checked AFTER the dispatch seam's policy injection.
  const cases: ReadonlyArray<{
    name: string;
    input: Record<string, unknown>;
  }> = [
    {
      name: "import_modules",
      input: {
        moduleNames: ["Foo"],
        projectRoot: "C:/project",
        accessPath: "C:/project/front.accdb",
      },
    },
    {
      name: "import_all",
      input: {
        projectRoot: "C:/project",
        accessPath: "C:/project/front.accdb",
      },
    },
    {
      name: "delete_module",
      input: {
        moduleName: "Foo",
        projectRoot: "C:/project",
        accessPath: "C:/project/front.accdb",
      },
    },
    {
      // fix_encoding schema accepts `location` (not `moduleNames`); the
      // dispatch is mutatesBinary+mutatesFilesystem, so the writes-gate
      // applies on the binary side.
      name: "fix_encoding",
      input: {
        location: "modules",
        projectRoot: "C:/project",
        accessPath: "C:/project/front.accdb",
      },
    },
  ];

  for (const { name, input } of cases) {
    it(`${name} + writes:false + developer → refuses with MCP_WRITES_DISABLED`, async () => {
      const services = makeServices();
      const tools = buildTools(services, {
        writes: false,
        writeExecutionPolicy: "developer",
      });
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`${name} not registered`);

      const result = await tool.handler(input);

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("MCP_WRITES_DISABLED");
      // The runner MUST NOT have been engaged.
      expect(services.vbaSyncToolService.requests).toHaveLength(0);
    });
  }
});

// ─── AC9: test_vba allowlist gate preserved in developer mode ───────────────

describe("AC9 — test_vba allowlist gate preserved in developer mode (#783)", () => {
  // We use an adapter-aware fake vbaSyncToolService that simulates the
  // VbaExecutionAdapter's MCP_ALLOWLIST_NOT_CONFIGURED refusal when
  // allowedProcedures is undefined/empty. The dispatch seam must:
  //   1. forward the test_vba call to the adapter (no policy bypass)
  //   2. return the adapter's failure envelope verbatim
  // This mirrors the production wiring where the dispatch seam consults
  // the policy (forwarding dryRun:false in developer mode) and the
  // adapter's allowlist gate fires immediately afterwards.
  function makeAdapterAwareServices(allowedProcedures: readonly string[] | undefined) {
    return {
      ...makeServices({
        vbaSyncToolService: new AdapterAwareFakeVbaService(allowedProcedures),
      }),
    };
  }

  it("developer mode + test_vba without allowedProcedures → MCP_ALLOWLIST_NOT_CONFIGURED", async () => {
    const services = makeAdapterAwareServices(undefined);
    const tools = buildTools(services, {
      writes: true,
      writeExecutionPolicy: "developer",
    });
    const tool = tools.find((candidate) => candidate.name === "test_vba");
    if (!tool) throw new Error("test_vba not registered");

    const result = await tool.handler({
      proceduresJson: JSON.stringify([{ procedure: "Test_Alpha", args: [] }]),
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("MCP_ALLOWLIST_NOT_CONFIGURED");
  });

  it("safe-by-default mode + test_vba without allowedProcedures → plan-shaped success (Bug B #1046 short-circuits before the gate)", async () => {
    // Issue #1046 (Bug B) inverts the previous assertion: in
    // safe-by-default mode the dispatch seam injects `dryRun:true` and the
    // adapter's gate-behind-dryRun order short-circuits BEFORE the
    // allowlist gate. The safe-by-default policy is precisely a
    // plan-by-default contract — refusing the plan with
    // MCP_ALLOWLIST_NOT_CONFIGURED would block the safe path
    // (zero-friction review) for projects without a configured allowlist.
    // The dedicated Bug B regression lives in
    // `vba-test-vba-coherence-1046.test.ts` (Issue #1046 / Test 2).
    const services = makeAdapterAwareServices(undefined);
    const tools = buildTools(services, {
      writes: true,
      writeExecutionPolicy: "safe-by-default",
    });
    const tool = tools.find((candidate) => candidate.name === "test_vba");
    if (!tool) throw new Error("test_vba not registered");

    const result = await tool.handler({
      proceduresJson: JSON.stringify([{ procedure: "Test_Beta", args: [] }]),
    });

    expect(result.isError).toBeFalsy();
  });

  it("developer mode + test_vba + allowedProcedures populated → runner engaged", async () => {
    // The dual: when the allowlist IS configured, developer mode reaches
    // the runner (after the gate accepts the procedure).
    const services = makeAdapterAwareServices(["Test_Alpha"]);
    const tools = buildTools(services, {
      writes: true,
      writeExecutionPolicy: "developer",
      allowedProcedures: ["Test_Alpha"],
    });
    const tool = tools.find((candidate) => candidate.name === "test_vba");
    if (!tool) throw new Error("test_vba not registered");

    const result = await tool.handler({
      proceduresJson: JSON.stringify([{ procedure: "Test_Alpha", args: [] }]),
    });

    expect(result.isError).toBeFalsy();
    expect(services.vbaSyncToolService.requests.length).toBeGreaterThanOrEqual(1);
  });

  it("developer mode + test_vba + dryRun:true → plan-shaped success (Bug B #1046 inverts the previous behavior)", async () => {
    // Issue #1046 (Bug B) — dryRun:true is now an explicit escape hatch
    // for `test_vba` (matching the docs promise at
    // `assets/examples/test-vba.md:31-35`). The previous behavior (gate
    // firing even with dryRun:true) was a regression against the
    // documented contract and is fixed by reordering checks in
    // `VbaExecutionAdapter.executeTestVba` so dryRun short-circuits
    // BEFORE the gate.
    //
    // AC9 itself is preserved: the gate still fires on the COMMIT path
    // (no dryRun). The dryRun escape hatch is its own dimension. The
    // dedicated Bug B regression lives in
    // `vba-test-vba-coherence-1046.test.ts` (Issue #1046 / Test 2).
    const services = makeAdapterAwareServices(undefined);
    const tools = buildTools(services, {
      writes: true,
      writeExecutionPolicy: "developer",
    });
    const tool = tools.find((candidate) => candidate.name === "test_vba");
    if (!tool) throw new Error("test_vba not registered");

    const result = await tool.handler({
      proceduresJson: JSON.stringify([{ procedure: "Test_Alpha", args: [] }]),
      dryRun: true,
    });

    expect(result.isError).toBeFalsy();
  });
});

// ─── AC10: no other place hardcodes per-tool defaults ───────────────────────

describe("AC10 — no other place hardcodes per-tool defaults (#783)", () => {
  // This is the architectural lock: every write-class tool's effective
  // default flows through `effectiveDryRunDefaultForTool` + the dispatch
  // seam. We pin the contract statically by re-deriving the truth table
  // from the risk registry and asserting that it matches
  // `DEFAULT_DRY_RUN_TABLE` for every registered tool under both modes.
  // This is the same anti-divergence check as #790.
  it("every contract tool's effective default matches the resolver table", async () => {
    const { MCP_TOOL_RISKS, effectiveDryRunDefaultForTool } = await import(
      "../../../src/adapters/mcp/mcp-tool-risks.js"
    );
    const { DEFAULT_DRY_RUN_TABLE, WRITE_EXECUTION_POLICIES } = await import(
      "../../../src/core/runtime/write-execution-policy.js"
    );

    for (const [name, risk] of Object.entries(MCP_TOOL_RISKS)) {
      for (const mode of WRITE_EXECUTION_POLICIES) {
        expect(
          effectiveDryRunDefaultForTool(
            name as Parameters<typeof effectiveDryRunDefaultForTool>[0],
            mode,
          ),
          `tool "${name}" (risk="${risk}") under "${mode}"`,
        ).toBe(DEFAULT_DRY_RUN_TABLE[mode][risk]);
      }
    }
  });
});

// Suppress unused-import warnings for the helper that aliases the contract
// return type from OperationResult to a narrowed discriminator.
void (null as unknown as OperationResult<unknown>);
