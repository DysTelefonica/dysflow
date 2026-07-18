// `package.json` is the source of truth for the adapter version. The
// import is intentional — it is resolved at build/test time and bundled
// for production, so the runtime cost is zero. The cast keeps the
// `noUncheckedIndexedAccess` strict mode happy.
import packageJson from "../../../package.json" with { type: "json" };
import type { OperationResult } from "../../core/contracts/index.js";
import { successResult } from "../../core/contracts/index.js";
import { commitFlagMetadataForOrNoop } from "../../core/runtime/commit-flag-registry.js";
import { isHumanCompilePending } from "../../core/runtime/human-compile-state.js";
import type { WriteExecutionPolicy } from "../../core/runtime/write-execution-policy.js";
import type { DocumentationBundleStatus } from "../../shared/install-docs.js";
import type { ProjectConfigDiagnostic } from "../config/project-config-diagnostic.js";
import { MCP_TOOL_CONTRACTS, type McpToolAccess } from "./mcp-tool-contracts.js";
import { effectiveDryRunDefaultForTool, MCP_TOOL_RISKS } from "./mcp-tool-risks.js";
import type { DysflowMcpTool, McpWriteAccessResolver } from "./result-translation.js";
import { translateCoreResultToMcpContent } from "./result-translation.js";
import { NO_INPUT_SCHEMA } from "./schemas/dysflow-schemas.js";

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * PR-1 (issue #656) — aggregated capabilities snapshot for the live MCP
 * adapter. The consumer surface for the gate-introspection-v1 umbrella (#655).
 *
 * Field semantics:
 * - `adapterVersion`: the running `dysflow` package version (from package.json).
 * - `surface`: the MCP transport this snapshot is served from. The stdio
 *   adapter is the only surface that registers this tool today; HTTP callers
 *   never reach this code path.
 * - `writesProcess.enabled`: process-level write flag (`writesEnabled`).
 * - `writesProcess.resolverConfigured`: whether a per-input write-access
 *   resolver is wired in (`writeAccessResolver !== undefined`).
 * - `writesProject.allowWrites`: project-level flag (`.dysflow/project.json`
 *   `allowWrites`). Consumers use this to know whether the project is open
 *   to writes regardless of the process flag.
 * - `projectIdResolution.projectId`: the projectId resolved at startup.
 *   `null` when the startup config carried no projectId.
 * - `projectIdResolution.outcome`: how the projectId was resolved.
 *   `resolved` — a projectId is in scope; `unresolved` — no projectId.
 * - `allowedProcedures`: the project's `allowedProcedures` allowlist, copied
 *   verbatim from the resolved `DysflowConfig`. `undefined` when no allowlist
 *   is configured.
 * - `dryRunDefault`: the global default for `dryRun`. Today every write-class
 *   tool in `MCP_TOOL_CONTRACTS` either declares `dryRunDefault: true` or
 *   defaults to true via the `contractFromGeneratedRoute` derivation
 *   (`src/adapters/mcp/mcp-tool-contracts.ts:32`), so the global default is
 *   `true`. Surfaced as a snapshot field so a consumer can detect drift.
 * - `toolsVisible`: count of tools in `MCP_TOOL_CONTRACTS`. Equal to the
 *   number of tools advertised in `tools/list` after the hidden-stub filter.
 * - `writeClassToolsPermitted`: names of write-class tools (i.e. `access`
 *   is `read-write` or `conditional-write`) that the process-level gate
 *   currently permits. When `writesProcess.enabled` is `false` and no
 *   resolver is configured, the resolver outcome is unknown to the snapshot
 *   and the list is empty — the consumer must call `get_capabilities`
 *   with the per-input tool name to resolve the per-tool gate.
 * - `humanCompilePending` (v1.20.0, issue #762): inferred flag that tells
 *   the consumer whether the human has likely to need to compile the
 *   project in Access (Debug ▸ Compile) before any test run. Sourced from
 *   the process-local `human-compile-state` cache keyed by `accessDbPath`.
 *   `false` when no `accessDbPath` is in scope (no project recorded).
 */
export type McpCapabilitySnapshot = {
  adapterVersion: string;
  surface: "stdio" | "http";
  writesProcess: {
    enabled: boolean;
    resolverConfigured: boolean;
  };
  writesProject: {
    allowWrites: boolean;
  };
  projectIdResolution: {
    projectId: string | null;
    outcome: "resolved" | "unresolved" | "ambiguous";
  };
  projectConfig?: ProjectConfigDiagnostic;
  allowedProcedures: readonly string[] | undefined;
  dryRunDefault: boolean;
  /**
   * v2.1.0 (#779) — active write-execution policy, resolved from
   * `.dysflow/project.json` `capabilities.writeExecutionPolicy`. Defaults
   * to `"safe-by-default"` when the field is absent or undefined.
   *
   * The per-tool `effectiveDryRunDefault` map (below) is computed against
   * THIS policy — consumers can predict whether a write-class tool will
   * plan or commit by default.
   */
  writeExecutionPolicy: WriteExecutionPolicy;
  /**
   * v2.1.0 (#779) — per-tool effective `dryRun` default under the active
   * policy. Keys are the same set as `MCP_TOOL_CONTRACTS`. A consumer
   * checks `effectiveDryRunDefault[toolName]` to decide whether the
   * routine dev loop requires explicit `dryRun: false`.
   *
   * The truth table is locked in
   * `src/adapters/mcp/mcp-tool-risks.ts: effectiveDryRunDefaultForTool` —
   * do NOT hardcode the per-tool default elsewhere.
   */
  effectiveDryRunDefault: Readonly<Record<string, boolean>>;
  toolsVisible: number;
  writeClassToolsPermitted: readonly string[];
  /** v1.20.0 (#762) — true when the human has not yet compiled since the last dysflow persistence for this project. */
  humanCompilePending: boolean;
  /**
   * v2.14.1 (#940) — runtime documentation bundle status. Always present
   * (never undefined) so consumers can branch on the shape without a guard.
   * The two booleans report whether the install pipeline copied the
   * referenced markdown files into `<runtimeDir>`. `version` is the runtime
   * version (read from `<runtimeDir>/app/package.json` when present) or
   * `"unknown"` when the caller did not wire a resolver. Default path
   * (no resolver) is fail-closed: every flag is `false` and `version` is
   * the adapter version or `"unknown"`.
   */
  documentationBundle: DocumentationBundleStatus;
  /**
   * v2.9.0 (#757 C2) — per-tool commit-flag metadata. An AI consumer
   * can branch on `tools[toolName].commitFlag` instead of reading
   * schema docs. The shape is the contract:
   *
   *   { commitFlag: "apply" | "dryRun" | "diff",
   *     noWriteAlias: "dryRun" | "diff" | null,
   *     defaultBehavior: "writes" | "plan" | "noop" }
   *
   * Keys are the same set as `MCP_TOOL_CONTRACTS`. Unknown tools fall
   * back to `{ commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" }`
   * via `commitFlagMetadataForOrNoop`.
   *
   * Single source of truth: `src/core/runtime/commit-flag-registry.ts`.
   * Adding a tool means an entry there AND a passing test in
   * `test/adapters/mcp/get-capabilities-commit-flags.test.ts`.
   */
  tools: Readonly<
    Record<string, import("../../core/runtime/commit-flag-registry.js").CommitFlagMetadata>
  >;
};

export type GetCapabilitiesAllInput = {
  writesEnabled: boolean;
  writeAccessResolver: McpWriteAccessResolver | undefined;
  allowedProcedures: readonly string[] | undefined;
  projectId: string | undefined;
  allowWrites: boolean;
  surface?: "stdio" | "http";
  adapterVersion?: string;
  /**
   * v1.20.0 (#762) — front-end `.accdb` path used to look up the
   * per-project `human-compile-state`. When omitted, the snapshot
   * reports `humanCompilePending: false` (no project in scope).
   */
  accessDbPath?: string;
  /**
   * v2.1.0 (#779) — active write-execution policy. Resolved by the caller
   * from `.dysflow/project.json` `capabilities.writeExecutionPolicy`
   * (defaults to `"safe-by-default"` when the field is absent). When
   * omitted from this input, the snapshot defaults to `"safe-by-default"`
   * so legacy callers continue to work.
   */
  writeExecutionPolicy?: WriteExecutionPolicy;
  /**
   * v2.14.1 (#940) — optional resolver for the runtime documentation
   * bundle status. When omitted, the snapshot falls back to a fail-closed
   * default (`errorCodesMd: false, hresultGuideMd: false, version:
   * adapterVersion ?? "unknown"`). The stdio adapter wires a resolver
   * that probes `<runtimeDir>/references/error-codes.md` and
   * `<runtimeDir>/docs/diagnostics/hresult-guide.md`.
   */
  documentationBundleResolver?: () => DocumentationBundleStatus;
};

// ─── Pure aggregate function ──────────────────────────────────────────────────

/**
 * Pure aggregator: no I/O, no Access, no PowerShell. The result is a
 * snapshot of the static + process-level state of the MCP adapter.
 */
export function getCapabilitiesAll(input: GetCapabilitiesAllInput): McpCapabilitySnapshot {
  const surface: "stdio" | "http" = input.surface ?? "stdio";
  const adapterVersion = input.adapterVersion ?? readAdapterVersion();
  const toolNames = Object.keys(MCP_TOOL_CONTRACTS);

  const writeClassToolsPermitted = computeWriteClassToolsPermitted(input.writesEnabled, toolNames);

  // v1.20.0 (#762) — surface the human-compile reminder signal. When no
  // accessDbPath is in scope (no project), the flag stays false: there is
  // nothing for the human to compile.
  const humanCompilePending =
    input.accessDbPath !== undefined && input.accessDbPath.length > 0
      ? isHumanCompilePending(input.accessDbPath)
      : false;

  // v2.1.0 (#779) — resolve the active policy (default safe-by-default
  // when the caller didn't pass one) and compute the per-tool effective
  // dry-run map. The resolver is the single source of truth; we do NOT
  // duplicate the truth table here.
  const writeExecutionPolicy: WriteExecutionPolicy =
    input.writeExecutionPolicy ?? "safe-by-default";
  const effectiveDryRunDefault: Record<string, boolean> = {};
  for (const name of Object.keys(MCP_TOOL_RISKS)) {
    effectiveDryRunDefault[name] = effectiveDryRunDefaultForTool(name, writeExecutionPolicy);
  }

  // v2.9.0 (#757 C2) — per-tool commit-flag metadata for the snapshot.
  // Sourced from `COMMIT_FLAG_REGISTRY` (the single source of truth) and
  // frozen so consumers can pass the snapshot around safely.
  const tools: Record<string, ReturnType<typeof commitFlagMetadataForOrNoop>> = {};
  for (const name of toolNames) {
    tools[name] = commitFlagMetadataForOrNoop(name);
  }

  // v2.14.1 (#940) — documentation bundle status. When the caller wires a
  // resolver (the stdio adapter does), use the live on-disk verdict. When
  // no resolver is wired, fall back to a fail-closed default: every flag
  // is false and version is the raw `adapterVersion` from the input (or
  // "unknown" when the caller did not pass one). We deliberately do NOT
  // consult `readAdapterVersion()` here — the no-resolver path means the
  // caller has not wired filesystem probing, so the version reported for
  // the bundle should match what the caller declared for the adapter.
  const documentationBundle: DocumentationBundleStatus =
    input.documentationBundleResolver !== undefined
      ? input.documentationBundleResolver()
      : {
          errorCodesMd: false,
          hresultGuideMd: false,
          version: input.adapterVersion ?? "unknown",
        };

  return {
    adapterVersion,
    surface,
    writesProcess: {
      enabled: input.writesEnabled,
      resolverConfigured: input.writeAccessResolver !== undefined,
    },
    writesProject: {
      allowWrites: input.allowWrites,
    },
    projectIdResolution: {
      projectId: input.projectId ?? null,
      outcome: input.projectId === undefined ? "unresolved" : "resolved",
    },
    allowedProcedures: input.allowedProcedures,
    dryRunDefault: deriveGlobalDryRunDefault(),
    writeExecutionPolicy,
    effectiveDryRunDefault,
    toolsVisible: toolNames.length,
    writeClassToolsPermitted,
    humanCompilePending,
    documentationBundle,
    tools: Object.freeze(tools),
  };
}

function computeWriteClassToolsPermitted(
  writesEnabled: boolean,
  toolNames: readonly string[],
): readonly string[] {
  // When writes are fully open at the process level, every write-class tool
  // is permitted. Otherwise the resolver-evaluated outcome is unknown to the
  // aggregate (the resolver takes a per-input argument), so the snapshot
  // reports an empty list. Consumers who need the per-input verdict call
  // `resolveEffectiveGate` (a follow-up layer of #655) or re-invoke
  // `get_capabilities` with the specific tool input.
  if (!writesEnabled) return [];
  return toolNames.filter((name) => {
    const contract = MCP_TOOL_CONTRACTS[name as keyof typeof MCP_TOOL_CONTRACTS];
    return contract !== undefined && contract.access !== ("read-only" satisfies McpToolAccess);
  });
}

function deriveGlobalDryRunDefault(): boolean {
  // #746 — every write-class tool in MCP_TOOL_CONTRACTS now declares
  // `dryRunDefault: true` (see `contractFromGeneratedRoute`). The dispatcher
  // path realises that default for every tool — `resolveIsDryRun` for query
  // aliases, `buildMaintenanceRequest` for query-maintenance, and
  // `VbaModulesAdapter.execute` for vba-sync — so the snapshot must agree with
  // AGENTS.md and the CHANGELOG v1.14 promise. The loop is preserved for
  // defense-in-depth: if a future contract ever opts out, the global surfaces
  // that explicit opt-out rather than silently flipping to false.
  for (const contract of Object.values(MCP_TOOL_CONTRACTS)) {
    if (contract.dryRunDefault === false) {
      return false;
    }
  }
  return true;
}

function readAdapterVersion(): string {
  // The `package.json` import is a build-time resolved module — the JSON
  // value is bundled at compile time, so the runtime cost is zero. Wrapped
  // in a try/catch so the tool never throws on a misconfigured install.
  try {
    const pkg = packageJson as { version?: string };
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

// Re-exported so `tools.ts` can build the `diagnose` snapshot from the same
// source the `get_capabilities` snapshot consults (#965 — single source of
// truth for `runtime.dysflowVersion`).
export { readAdapterVersion };

// ─── Tool factory ─────────────────────────────────────────────────────────────

/**
 * Factory for the `get_capabilities` tool. Wires the aggregate
 * function with the captured adapter context (writesEnabled, resolver,
 * allowlist, projectId). Returns a `DysflowMcpTool` ready to register via
 * the `createDysflowMcpTools` factory.
 *
 * The tool is read-only: it never touches Access, never spawns PowerShell,
 * and never mutates the binary. The `NO_INPUT_SCHEMA` enforces "no input"
 * at the JSON-schema layer; the handler ignores its `input` argument.
 */
export function createGetCapabilitiesTool(opts: {
  writesEnabled: boolean;
  writeAccessResolver: McpWriteAccessResolver | undefined;
  // #674 — accept the resolver form too so the per-input snapshot is
  // honest. The snapshot tool reads allowedProcedures for the introspection
  // surface, so a frozen start-up array would mis-report cross-project.
  allowedProcedures: import("./allowed-procedures-resolver.js").AllowedProcedures | undefined;
  projectId: string | undefined;
  allowWrites: boolean;
  /**
   * v1.20.0 (#762) — optional front-end `.accdb` path used to surface
   * the per-project `humanCompilePending` flag. When omitted, the
   * snapshot reports `humanCompilePending: false` (no project in scope).
   */
  accessDbPath?: string;
  /**
   * v2.1.0 (#779) — active write-execution policy. Resolved upstream by
   * the project config; passed through to the snapshot so
   * `effectiveDryRunDefault` reflects the same policy the dispatcher will
   * consult.
   */
  writeExecutionPolicy?: WriteExecutionPolicy;
  projectConfigResolver?: () => ProjectConfigDiagnostic | Promise<ProjectConfigDiagnostic>;
  /**
   * v2.14.1 (#940) — optional resolver for the runtime documentation
   * bundle status. When omitted, the snapshot reports every flag as
   * `false` and the version as the raw `adapterVersion` (or `"unknown"`).
   * The stdio entry point wires a resolver that probes
   * `<runtimeDir>/references/error-codes.md` and
   * `<runtimeDir>/docs/diagnostics/hresult-guide.md` for the live install.
   */
  documentationBundleResolver?: () => DocumentationBundleStatus;
}): DysflowMcpTool {
  const snapshot = getCapabilitiesAll({
    writesEnabled: opts.writesEnabled,
    writeAccessResolver: opts.writeAccessResolver,
    // Pass through the resolver/array as-is. The snapshot tool does not
    // take an input, so it surfaces the STARTUP value of the gate; per-input
    // semantics apply only on the call path (dysflow_vba_execute / test_vba).
    allowedProcedures: Array.isArray(opts.allowedProcedures) ? opts.allowedProcedures : undefined,
    projectId: opts.projectId,
    allowWrites: opts.allowWrites,
    accessDbPath: opts.accessDbPath,
    writeExecutionPolicy: opts.writeExecutionPolicy,
    documentationBundleResolver: opts.documentationBundleResolver,
  });

  return {
    name: "get_capabilities",
    description: `Return the aggregated capabilities snapshot for the live Dysflow MCP adapter. Read-only — does not open Access, does not spawn PowerShell, does not mutate state. Snapshot surface: ${snapshot.surface}. Adapter version: ${snapshot.adapterVersion}. Writes process: ${snapshot.writesProcess.enabled ? "enabled" : "disabled"}. Writes project (allowWrites): ${snapshot.writesProject.allowWrites}. Tools visible: ${snapshot.toolsVisible}. Write-class tools permitted: ${snapshot.writeClassToolsPermitted.length}. Human-compile pending: ${snapshot.humanCompilePending}. Documentation bundle (errorCodesMd=${snapshot.documentationBundle.errorCodesMd}, hresultGuideMd=${snapshot.documentationBundle.hresultGuideMd}, version=${snapshot.documentationBundle.version}) is exposed under snapshot.documentationBundle (#940). Write execution policy: ${snapshot.writeExecutionPolicy}. Per-tool commit-flag metadata (commitFlag, noWriteAlias, defaultBehavior) is exposed under snapshot.tools for ${Object.keys(snapshot.tools).length} tools (#757). ${MCP_TOOL_CONTRACTS.get_capabilities.summary}`,
    inputSchema: NO_INPUT_SCHEMA,
    handler: async (): Promise<ReturnType<typeof translateCoreResultToMcpContent>> => {
      const projectConfig = await opts.projectConfigResolver?.();
      const result: OperationResult<McpCapabilitySnapshot> = successResult(
        projectConfig === undefined ? snapshot : { ...snapshot, projectConfig },
      );
      return translateCoreResultToMcpContent(result);
    },
  };
}
