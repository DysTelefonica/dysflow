/**
 * Issue #1046 — `test_vba` coherence drift across four axes.
 *
 * Four distinct contracts drifted apart on `test_vba`:
 *
 *   A. Registry ↔ schema inconsistency.
 *      `get_capabilities.tools.test_vba` reported `commitFlag: "apply"` +
 *      `defaultBehavior: "noop"`, but the schema exposes `dryRun` only
 *      (no `apply` property) and the commit path is `dryRun:false`. A
 *      caller passing `apply:true` was rejected with `MCP_INPUT_INVALID:
 *      apply is not allowed`. Two contradictions: registry says apply
 *      family, schema rejects it; registry says noop, the tool actually
 *      executes a runner when called.
 *
 *   B. `dryRun:true` opt-out mismatch.
 *      `assets/examples/test-vba.md:31-35` claims `dryRun:true`
 *      "validates the manifest shape without executing the atoms, and
 *      does not raise MCP_PROCEDURE_NOT_ALLOWED / MCP_ALLOWLIST_NOT_CONFIGURED."
 *      Runtime refused with `PROCEDURE_NOT_ALLOWED` even on `dryRun:true`
 *      because the adapter's allowlist gate ran BEFORE the dryRun
 *      short-circuit. The docs promised a bypass the code did not
 *      implement.
 *
 *   C. Error-code taxonomy drift.
 *      Runtime emits `PROCEDURE_NOT_ALLOWED` (adapter layer) while docs
 *      (`references/error-codes.md`) declare `MCP_PROCEDURE_NOT_ALLOWED`
 *      (canonical-handler layer). Two paths, two codes; consumers grep
 *      one or the other and miss the rejection. Decision per #1046:
 *      keep the runtime's `PROCEDURE_NOT_ALLOWED`, re-sync docs +
 *      verify-examples-vs-runtime.ps1 filter to match.
 *
 *   D. `validate_manifest` ↔ `test_vba` allowlist coherence.
 *      `validate_manifest` reported `valid: 4, invalid: 0` for a
 *      manifest where one atom's procedure had drifted out of
 *      `allowedProcedures`. `test_vba` then blocked the run with
 *      `PROCEDURE_NOT_ALLOWED`. `validate_manifest` only checked JSON
 *      shape + procedure existence in source modules — never asked the
 *      allowlist resolver. Decision per #1046: add an opt-in
 *      `validateManifestIncludesAllowlistCheck: true` flag that, when
 *      set, surfaces allowlist drift as `invalid[]` entries with
 *      `reason` matching `/allowlist|allowedProcedures/i`.
 *
 * Each RED test below pins one axis. Each is RED for a distinct reason.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AllowedProcedures } from "../../../src/adapters/mcp/allowed-procedures-resolver";
import { getCapabilitiesAll } from "../../../src/adapters/mcp/get-capabilities-tool";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import {
  VbaExecutionAdapter,
  type VbaSyncOrchestrator,
} from "../../../src/adapters/vba-sync/vba-execution-adapter";
import { successResult } from "../../../src/core/contracts/index";
import {
  type CommitFlagMetadata,
  commitFlagMetadataFor,
} from "../../../src/core/runtime/commit-flag-registry";

function makeBaseServices(): DysflowMcpServices {
  return {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
  } as unknown as DysflowMcpServices;
}

function getValidateManifestTool(
  accessContextResolver?: Parameters<typeof createDysflowMcpTools>[0]["accessContextResolver"],
  allowedProcedures?: Parameters<typeof createDysflowMcpTools>[0]["allowedProcedures"],
) {
  const tools = createDysflowMcpTools({
    services: makeBaseServices(),
    accessContextResolver: accessContextResolver,
    allowedProcedures,
  });
  const tool = tools.find((t) => t.name === "validate_manifest");
  if (tool === undefined) throw new Error("validate_manifest tool not found");
  return tool;
}

const MODULES = {
  TestModule: [
    "Option Explicit",
    "Public Sub Test_Alpha()",
    "End Sub",
    "Public Sub Test_Beta()",
    "End Sub",
  ].join("\r\n"),
};

// ─────────────────────────────────────────────────────────────────────────────
// Test 1 — Registry ↔ schema consistency (Bug A).
//
// The single source of truth is `COMMIT_FLAG_REGISTRY.test_vba`. The schema
// (`VBA_SYNC_TOOL_SCHEMAS.test_vba`) exposes `dryRun` and NOT `apply`, so
// the registry's `commitFlag` MUST match the schema-accepted commit path:
// `commitFlag === "dryRun"`. The legacy `apply:true` rejection shape is
// not the bug — it is the registry's job to advertise the right flag.
// ─────────────────────────────────────────────────────────────────────────────

describe("Issue #1046 / Test 1 — test_vba registry entry agrees with the schema-accepted commit flag", () => {
  it("registry.test_vba.commitFlag is the flag the schema actually accepts", () => {
    const entry = commitFlagMetadataFor("test_vba") as CommitFlagMetadata;
    // The schema exposes `dryRun` and does NOT expose `apply`; the runtime
    // commit path is `dryRun:false`. Therefore the registry MUST advertise
    // `commitFlag: "dryRun"`. The buggy legacy value was `"apply"`, which
    // contradicted the schema (schema rejects apply with MCP_INPUT_INVALID)
    // and the dispatch path (dispatcher does not consume apply).
    expect(entry.commitFlag).toBe("dryRun");
    expect(entry.noWriteAlias).toBeNull();
    // When neither flag is supplied and no policy override fires, the tool
    // must PLAN (matches the safe-by-default policy: dryRun:true is injected;
    // matches the developer policy: dryRun:false is injected; the plan
    // default is the contract consumers expect).
    expect(entry.defaultBehavior).toBe("plan");
  });

  it("get_capabilities.tools.test_vba mirrors the registry — snapshot does not lie", () => {
    const snapshot = getCapabilitiesAll({
      writesEnabled: true,
      writeAccessResolver: undefined,
      allowedProcedures: ["Test_Alpha"],
      projectId: "p",
      allowWrites: true,
    });
    const tools = snapshot.tools as Readonly<Record<string, CommitFlagMetadata>>;
    expect(tools.test_vba).toEqual({
      commitFlag: "dryRun",
      noWriteAlias: null,
      defaultBehavior: "plan",
      // #1057 (F7) — additive homogenized-flag fields.
      canonicalCommitFlag: "dryRun",
      legacyAliases: [],
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2 — `dryRun:true` opt-out (Bug B).
//
// The adapter's `executeTestVba` must short-circuit on `dryRun:true`
// BEFORE the allowlist gate runs. The docs at
// `assets/examples/test-vba.md:31-35` promise this. The buggy runtime
// ran gate → dryRun, so even `dryRun:true` triggered
// `PROCEDURE_NOT_ALLOWED` when the procedure drifted out of
// `allowedProcedures`. The fix reorders checks: dryRun → gate.
// ─────────────────────────────────────────────────────────────────────────────

describe("Issue #1046 / Test 2 — test_vba dryRun:true bypasses the allowlist gate (gate-behind-dryRun)", () => {
  it("adapter: test_vba with dryRun:true + procedure OUT of allowlist returns a plan-shaped success (gate does NOT fire)", async () => {
    const executeMappedTool = vi.fn();
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: "C:/repo",
    };
    // Resolver returns a non-empty allowlist that does NOT contain the
    // procedure. The OLD (buggy) order ran the gate first and emitted
    // PROCEDURE_NOT_ALLOWED. The FIXED order short-circuits on dryRun:true
    // before the gate — a plan-shaped success is the contract.
    const resolver: AllowedProcedures = vi.fn().mockResolvedValue(["Test_Other", "Test_Third"]);
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, resolver);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify([{ procedure: "Test_Alpha", args: [] }]),
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(
        `Bug B regression: gate fired on dryRun:true with code ${result.error.code}: ${result.error.message}`,
      );
    }
    // Plan shape — the dryRun short-circuit returns the resolved plan.
    expect(result.data).toMatchObject({
      dryRun: true,
      willExecute: false,
      willModifyAccess: false,
    });
    const plan = (result.data as { plan: { procedureName: string[] } }).plan;
    expect(plan.procedureName).toEqual(["Test_Alpha"]);
    // Runner was NEVER invoked.
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("adapter: test_vba with dryRun:true + NO allowlist configured returns a plan-shaped success (MCP_ALLOWLIST_NOT_CONFIGURED is NOT raised)", async () => {
    const executeMappedTool = vi.fn();
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: "C:/repo",
    };
    // Resolver returns undefined — the project config has no allowlist
    // declared at all. Old behavior emitted MCP_ALLOWLIST_NOT_CONFIGURED
    // even with dryRun:true. Fixed: dryRun short-circuit returns plan.
    const resolver: AllowedProcedures = vi.fn().mockResolvedValue(undefined);
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, resolver);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify([{ procedure: "Test_Alpha", args: [] }]),
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      // The regex explicitly matches both possible error codes so the
      // regression signal is loud: any future gate-first drift surfaces
      // here with the exact code that fired.
      const code = result.error.code ?? "";
      expect(code).not.toMatch(/PROCEDURE_NOT_ALLOWED|ALLOWLIST_NOT_CONFIGURED/);
      throw new Error(
        `Bug B regression: gate fired on dryRun:true with code ${code}: ${result.error.message}`,
      );
    }
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("adapter: test_vba with dryRun:false/undefined STILL runs the gate (commit path is preserved)", async () => {
    // Anti-regression for Bug B fix: the gate must STILL fire when the
    // caller asks for an actual execute (dryRun absent or false). The fix
    // moves dryRun FIRST; it does not remove the gate from the commit
    // path. This test pins the negative case so a future refactor cannot
    // silently drop the gate.
    const executeMappedTool = vi.fn();
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: "C:/repo",
    };
    const resolver: AllowedProcedures = vi.fn().mockResolvedValue(undefined);
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, resolver);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify([{ procedure: "Test_Alpha", args: [] }]),
      // no dryRun → execute mode
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected gate refusal on execute-mode call");
    expect(result.error.code).toMatch(/PROCEDURE_NOT_ALLOWED|ALLOWLIST_NOT_CONFIGURED/);
    expect(executeMappedTool).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3 — Error-code taxonomy (Bug C).
//
// Runtime emits `PROCEDURE_NOT_ALLOWED` from `VbaExecutionAdapter`
// (`vba-execution-adapter.ts:612`). The canonical docs file
// (`references/error-codes.md`) MUST list the runtime code verbatim so a
// consumer reading the docs is not surprised by the actual envelope. The
// test reads the docs file at runtime, extracts the section heading for
// `test_vba` procedure rejection, and asserts the runtime code is among
// the canonical names. The buggy state: docs say `MCP_PROCEDURE_NOT_ALLOWED`,
// runtime emits `PROCEDURE_NOT_ALLOWED`. RED until the docs are re-synced
// to match the runtime (per the #1046 decision: keep runtime, update docs).
// ─────────────────────────────────────────────────────────────────────────────

describe("Issue #1046 / Test 3 — runtime error code is listed in canonical error-codes.md", () => {
  it("runtime code for test_vba gate refusal is documented in references/error-codes.md", async () => {
    // The runtime path the consumer hits on a test_vba gate refusal.
    const runtimeCode = "PROCEDURE_NOT_ALLOWED";

    // The canonical docs are committed at the repo root, mirroring the
    // same shape the dysflow-usage skill ships — but the runtime code is
    // the source of truth per HR-5. The docs file MUST list the runtime
    // code so a consumer that greps docs and code agrees.
    const docsPath = join(process.cwd(), "references", "error-codes.md");
    const docs = await readFile(docsPath, "utf8");
    // Section heading detection: the canonical heading pattern is `### `CODE``.
    // The fix is to either rename the section header to match the runtime,
    // OR add a new entry. Both must result in `runtimeCode` appearing as a
    // section heading. Any other reference is not enough — a section
    // heading is the canonical contract.
    const headingPattern = new RegExp(`^###\\s+(\`?)${runtimeCode}\\1\\s*$`, "m");
    expect(
      docs.match(headingPattern),
      `references/error-codes.md must declare a section heading for ${runtimeCode} (runtime code emitted by VbaExecutionAdapter on gate refusal)`,
    ).not.toBeNull();
  });

  it("docs do not declare MCP_PROCEDURE_NOT_ALLOWED as the canonical heading anymore (Bug C fix path)", async () => {
    // Per the #1046 decision matrix: keep the runtime's
    // PROCEDURE_NOT_ALLOWED (no MCP_ prefix), update the docs to match.
    // After the fix the canonical docs no longer carry
    // `### MCP_PROCEDURE_NOT_ALLOWED` — that heading was the symptom of
    // the MCP-handler/run-vba layer drifting to a different code than the
    // adapter/test-vba layer. Pin the post-fix invariant.
    const docsPath = join(process.cwd(), "references", "error-codes.md");
    const docs = await readFile(docsPath, "utf8");
    const staleHeading = /^###\s+`?MCP_PROCEDURE_NOT_ALLOWED`?\s*$/m;
    expect(docs.match(staleHeading)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4 — `validate_manifest` allowlist coherence (Bug D).
//
// `validate_manifest` historically reported `valid: 4, invalid: 0` for a
// manifest whose atoms included a procedure outside `allowedProcedures`.
// Then `test_vba` blocked the run with `PROCEDURE_NOT_ALLOWED`. The
// fix: opt-in flag `validateManifestIncludesAllowlistCheck: true` runs
// the same allowlist resolver against every atom and surfaces drift as
// `invalid[]` entries with `reason` matching `/allowlist|allowedProcedures/i`.
// ─────────────────────────────────────────────────────────────────────────────

describe("Issue #1046 / Test 4 — validate_manifest surfaces allowlist drift behind an opt-in flag", () => {
  it("opt-in flag false (default): allowlist drift is NOT surfaced (back-compat shape preserved)", async () => {
    // Without the opt-in flag, the tool keeps the legacy shape — JSON
    // shape + procedure existence + arg compatibility, no allowlist
    // check. This pins the back-compat invariant so a consumer that
    // depended on the JSON-shape-only report keeps working.
    const tool = getValidateManifestTool(async () =>
      successResult({
        accessPath: "C:/fake/frontend.accdb",
        projectRoot: "C:/fake/projectRoot",
        destinationRoot: "C:/fake/destinationRoot",
      }),
    );

    const result = await tool.handler({
      manifest: { tests: [{ procedure: "Test_Alpha", args: [] }] },
      modules: MODULES,
      // opt-in flag absent → legacy shape preserved
    });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.valid).toBe(true);
  });

  it("opt-in flag true: allowlist drift is surfaced as invalid[] entries with allowlist-flavored reason", async () => {
    // The fix wires the allowlist resolver into the validate_manifest
    // path. When `validateManifestIncludesAllowlistCheck: true` is set,
    // every atom whose procedure is NOT in the resolved allowlist shows
    // up in `invalid[]` with `reason` matching `/allowlist|allowedProcedures/i`.
    // Test_Alpha is in the source catalog but NOT in the configured
    // allowlist (only Test_Beta is) — the drift MUST surface.
    const allowlist = ["Test_Beta"];
    const tool = getValidateManifestTool(
      async () =>
        successResult({
          accessPath: "C:/fake/frontend.accdb",
          projectRoot: "C:/fake/projectRoot",
          destinationRoot: "C:/fake/destinationRoot",
        }),
      allowlist,
    );

    const result = await tool.handler({
      manifest: {
        tests: [
          { procedure: "Test_Alpha", args: [] }, // drifted — NOT in allowlist
          { procedure: "Test_Beta", args: [] }, // in allowlist — must pass
        ],
      },
      modules: MODULES,
      validateManifestIncludesAllowlistCheck: true,
    });

    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.invalid.length).toBeGreaterThan(0);
    const invalidProcedures = parsed.invalid.map((entry: { procedure: string }) => entry.procedure);
    expect(invalidProcedures).toContain("Test_Alpha");
    const driftReason = parsed.invalid.find(
      (entry: { procedure: string }) => entry.procedure === "Test_Alpha",
    );
    expect(String(driftReason.reason ?? "")).toMatch(/allowlist|allowedProcedures/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5 — Cross-coherence regression net.
//
// Single integration assertion: every axis agrees. Registry says
// `commitFlag ∈ {apply, dryRun}`. Runtime rejects the legacy `apply:true`
// shape on `test_vba` (since schema does not declare it). `dryRun:true`
// does NOT raise the allowlist gate. Commit-path error code matches the
// canonical docs name. `validate_manifest` opt-in reports drift.
// ─────────────────────────────────────────────────────────────────────────────

describe("Issue #1046 / Test 5 — cross-coherence regression net", () => {
  it("registry + runtime + docs + validate_manifest all agree", async () => {
    // 5a. Registry surface is a valid commit flag.
    const entry = commitFlagMetadataFor("test_vba") as CommitFlagMetadata;
    expect(["apply", "dryRun"]).toContain(entry.commitFlag);

    // 5b. dryRun:true bypasses the gate.
    const executeMappedTool = vi.fn();
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: "C:/repo",
    };
    const resolver: AllowedProcedures = vi.fn().mockResolvedValue(undefined);
    const adapter = new VbaExecutionAdapter(orchestrator, undefined, resolver);
    const dryRunResult = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify([{ procedure: "Test_Alpha", args: [] }]),
      dryRun: true,
    });
    expect(dryRunResult.ok).toBe(true);

    // 5c. Commit-path error code matches the canonical docs name.
    const docsPath = join(process.cwd(), "references", "error-codes.md");
    const docs = await readFile(docsPath, "utf8");
    const codeHeading = /^###\s+`?([A-Z][A-Z_]+)`?\s*$/gm;
    const canonicalCodes = new Set<string>();
    for (const match of docs.matchAll(codeHeading)) {
      // The capture group is guaranteed non-null when the regex matches,
      // but TypeScript treats it as `string | undefined` because matchAll
      // yields nullable groups in the lib types. Coerce to string for the
      // set membership check; the regex above requires the capture to be
      // present for the match to succeed at all.
      const captured = match[1] ?? "";
      if (captured.length > 0) canonicalCodes.add(captured);
    }
    // The runtime's gate refusal code MUST appear in the canonical docs.
    expect(canonicalCodes.has("PROCEDURE_NOT_ALLOWED")).toBe(true);

    // 5d. validate_manifest opt-in surfaces drift as invalid[].
    const tool = getValidateManifestTool(
      async () =>
        successResult({
          accessPath: "C:/fake/frontend.accdb",
          projectRoot: "C:/fake/projectRoot",
          destinationRoot: "C:/fake/destinationRoot",
        }),
      ["Test_Beta"],
    );
    const validateResult = await tool.handler({
      manifest: { tests: [{ procedure: "Test_Alpha", args: [] }] },
      modules: MODULES,
      validateManifestIncludesAllowlistCheck: true,
    });
    const parsed = JSON.parse(validateResult.content[0]?.text ?? "{}");
    expect(parsed.invalid.length).toBeGreaterThan(0);
  });
});
