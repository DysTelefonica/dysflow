# Design: dysflow-gate-introspection-v1 (release v1.14.0)

## Summary

Five-layer additive capability layer: new `dysflow_get_capabilities` tool + descriptor metadata on every `tools/list` entry + per-call `resolveEffectiveGate` projection over `DysflowConfig` + three new error codes (`MCP_PROCEDURE_NOT_ALLOWED`, `MCP_REQUIRES_DRY_RUN`, `MCP_ALLOWLIST_NOT_CONFIGURED`) aliased to `MCP_INPUT_INVALID` for one minor version. Edits live in `src/adapters/mcp/{mcp-tool-contracts.ts:9-167, dispatch-common.ts:13-79, canonical-handlers.ts:38-65, stdio.ts:181-241, tools.ts:63-191}` plus `src/core/config/dysflow-config.ts:33-147`. No runtime gate change.

## Layer 1 — `dysflow_get_capabilities` tool

**New file** `src/adapters/mcp/get-capabilities-tool.ts`. Schema: `NO_INPUT_SCHEMA` (`src/adapters/mcp/schemas/dysflow-schemas.ts:39-43`); handler returns `getCapabilitiesAll()`. Read-only.

| Site | File:line | Edit |
|---|---|---|
| `MODERN_TOOL_NAMES` | `tools.ts:63-70` | append `"dysflow_get_capabilities"` |
| `currentTools[]` | `tools.ts:90-191` | new entry |
| `MCP_TOOL_CONTRACTS` | `mcp-tool-contracts.ts:153-157` | `{access:"read-only",writeGate:"none"}` |
| `modernContracts` | `mcp-tool-contracts.ts:121-151` | new entry |
| validation loop | `mcp-tool-contracts.ts:159-163` | parallel `MODERN_TOOL_NAMES` loop |

## Layer 2 — `project.json.capabilities` and backward-compat aliases

`src/core/config/dysflow-config.ts`:

| Site | File:line | Edit |
|---|---|---|
| `DysflowProjectConfig` | `dysflow-config.ts:33-49` | `capabilities?: {allowWrites?,allowedProcedures?,dryRunDefault?}` |
| `DysflowConfig` | `dysflow-config.ts:51-69` | mirror `capabilities` |
| `loadDysflowConfigShared` | `dysflow-config.ts:98-147` | read-through to top-level `allowWrites`/`allowedProcedures` |

Read-side aliasing only (top-level fields stay for v2.x). Three new codes register at `tool-parity-registry.ts:97-100`; old `MCP_INPUT_INVALID` text ships one minor version.

## Layer 3 — `getCapabilities` enrichment of `tools/list` and per-tool contract

`tools/list` site `stdio.ts:181-193`. Inside the `.map((t) => …)` after `inputSchema`, attach `_meta.capabilities: getCapabilities(t.name)`. Hidden stubs (`stdio.ts:183`) skip the block.

Descriptor in `mcp-tool-contracts.ts` after `McpToolContract:9`:

```
type McpCapabilityDescriptor = McpToolContract & {
  requiresAllowlist: boolean;
  requiresDryRunEscape: boolean;
  gateSource: "writes-disabled" | "allowlist" | "schema-only";
  gateEffective: "always-blocked" | "dryrun-only" | "allowlist-gated" | "open";
}
```

Accessors next to `getMcpToolContract:165-167`: `getCapabilities(name)`, `getCapabilitiesAll()`, `isWriteCapability(name)`, `isReadCapability(name)`. Module-load build from `MCP_TOOL_CONTRACTS:153-157`.

## Layer 4 — `resolveEffectiveGate` per-call projection

New export in `src/adapters/mcp/stdio.ts` next to `resolveMcpWriteAccessForInput:231-241`:

```
resolveEffectiveGate(
  input: {toolName: ContractToolName; input: unknown},
  startupConfig?: DysflowConfig,
  options?: {cwd?, env?}
): Promise<McpCapabilityDescriptor>
```

Algorithm: (1) `getCapabilities(input.toolName)` for the static descriptor; (2) per-project override via `inputTargetsConfig(input.input, startupConfig)` at `stdio.ts:575-590`; (3) `gateSource === "writes-disabled"` → fold `allowWrites`: `true`→`"open"`, `false`→`"always-blocked"`; (4) `gateSource === "allowlist"` → fold `allowedProcedures`: non-empty→`"allowlist-gated"`, empty/undefined→`"dryrun-only"`; (5) otherwise static with `gateEffective:"open"`. Pure config projection.

## Layer 5 — error-code unification with `PROCEDURE_NOT_ALLOWED`

Three helpers in `src/adapters/mcp/dispatch-common.ts` after `writesDisabled:13-25` / `invalidInput:27-33`:

| Helper | Body prefix |
|---|---|
| `procedureNotAllowed(procedureName, allowed)` | `MCP_PROCEDURE_NOT_ALLOWED:` |
| `requiresDryRun(procedureName)` | `MCP_REQUIRES_DRY_RUN:` |
| `allowlistNotConfigured(procedureName)` | `MCP_ALLOWLIST_NOT_CONFIGURED:` |

Body keeps the `MCP_INPUT_INVALID:` literal until v1.15.0 (proposal §"Risks"). `ensureProcedureAllowed` rewires two branches: `47-57`→`allowlistNotConfigured`; `59-63`→`procedureNotAllowed`. `requiresDryRun` ships without a runtime wiring (Unit test asserts it).

## Decisions

| # | Choice | Alternative | Rationale |
|---|---|---|---|
| 1 | Descriptor exposed twice: `_meta.capabilities` + `dysflow_get_capabilities` tool | Either/or | UI render vs CI probe. Same source. |
| 2 | Three new codes aliased for one minor version | Replace `MCP_INPUT_INVALID` | Regex-consumer compat. |
| 3 | Module-load map from `MCP_TOOL_CONTRACTS:153-157` | Per-call derivation | Closes drift. |
| 4 | `resolveEffectiveGate` next to `resolveMcpWriteAccessForInput:231-241`, reuses `inputTargetsConfig:575-590` | New module | Same `resolveConfigForInput` path. |
| 5 | Hidden stubs emit no `_meta.capabilities` | `gateEffective:"open"` placeholder | "Stub has no real gate" contract. |
| 6 | No removal of `allowWrites` / `allowedProcedures` | Remove in v1.14.0 | v2.x breaking branch only. |

## File-by-file change list

| File | Action | Marker |
|---|---|---|
| `src/adapters/mcp/get-capabilities-tool.ts` | Create | `createGetCapabilitiesTool` export |
| `src/adapters/mcp/mcp-tool-contracts.ts` | Modify | append `McpCapabilityDescriptor`; add `getCapabilities`/`getCapabilitiesAll`/`isWriteCapability`/`isReadCapability` next to `getMcpToolContract:165-167`; extend validation loop at `159-163` |
| `src/adapters/mcp/tools.ts:63-70, 90-191` | Modify | append `"dysflow_get_capabilities"` to `MODERN_TOOL_NAMES`; new entry in `currentTools[]` |
| `src/adapters/mcp/dispatch-common.ts:13-33` | Modify | add `procedureNotAllowed`, `requiresDryRun`, `allowlistNotConfigured` |
| `src/adapters/mcp/canonical-handlers.ts:38-65` | Modify | branch 47-57 → `allowlistNotConfigured`; branch 59-63 → `procedureNotAllowed` |
| `src/adapters/mcp/stdio.ts:181-193, 231-241` | Modify | `_meta.capabilities` in `tools/list`; add `resolveEffectiveGate` |
| `src/core/config/dysflow-config.ts:33-49, 51-69, 98-147` | Modify | `capabilities?: {...}` on both types; read-through in `loadDysflowConfigShared` |
| `src/adapters/mcp/tool-parity-registry.ts:97-100` | Modify | register three new codes |
| `test/adapters/mcp/mcp-tool-capabilities.test.ts` | Create | Unit: descriptor shape |
| `test/adapters/mcp/stdio-tools-list-meta.test.ts` | Create | Unit: `_meta.capabilities` per tool |
| `test/adapters/mcp/resolve-effective-gate.test.ts` | Create | Unit: projector over stub `DysflowConfig` |
| `test/adapters/mcp/dispatch-common-envelopes.test.ts` | Create | Unit: envelope discrimination + body-prefix |
| `test/adapters/mcp/dysflow-get-capabilities-tool.test.ts` | Create | Unit: tool round-trip |

## Test Strategy

Cheap-first pyramid. No MSACCESS, no PowerShell.

| Layer | What | Approach |
|---|---|---|
| Unit (Vitest, < 2 s) | Descriptor map, envelope helpers, `resolveEffectiveGate`, `tools/list._meta` shape, `dysflow_get_capabilities` round-trip | Module-import + function call against stub `DysflowConfig` |
| Integration (Vitest dispatch harness) | `registerMcpTools` + alias + dispatch-factory still emits `_meta.capabilities` | Extend `test/adapters/mcp/dispatch-write-gate.test.ts` |
| E2E | Out of scope (proposal §"Approach" #5: zero Access spawn) | `pnpm test` + `pnpm build` only |

## Backward Compatibility

| Item | Kept | Aliased to | Removed when |
|---|---|---|---|
| `MCP_INPUT_INVALID` text body | yes | new codes in `error.code`; body literal kept | v1.15.0 |
| `MCP_WRITES_DISABLED` text body | yes | unchanged | never |
| `DysflowConfig.allowWrites` / `allowedProcedures` | yes | read-through into `capabilities` | v2.x |
| `McpToolContract` shape | additive | `extends` only | n/a |
| Hidden stubs in `tools/list` | unchanged | no `_meta.capabilities` | n/a |
| `tools/list` consumers reading `name/description/inputSchema` | compatible | `_meta.capabilities` additive | n/a |

## Rejected Alternatives

1. **Replace `MCP_INPUT_INVALID` outright** — kills regex consumers.
2. **Wildcard `allowedProcedures` (`["Test_*"]`)** — character-exact; PR1b invariant.
3. **Derive descriptor per call** — drift risk.
4. **`resolveEffectiveGate` in a new module** — breaks colocation.
5. **`gateEffective:"open"` for hidden stubs** — violates stub contract.
6. **Drop `allowWrites` / `allowedProcedures` in v1.14.0** — v2.x branch only.
