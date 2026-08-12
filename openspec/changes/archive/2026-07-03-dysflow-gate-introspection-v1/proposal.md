# Proposal: dysflow-gate-introspection-v1 (release v1.14.0)

## Intent

IAs repeatedly had to discover *what the gates would do* by firing a write call
and reading the failure envelope back. The IA-consumer dead-ends observed in
this session: (a) treating `dryRun: true` as evidence the gate was *blocking*
when in fact it is the only escape hatch (issue #244 family); (b) discovering
the `allowedProcedures` allowlist exists by hitting
`MCP_INPUT_INVALID: Refusing to execute VBA procedure '…'` for the first time
(`src/adapters/mcp/canonical-handlers.ts:48-54`); (c) re-checking the write
gate by re-running `dysflow_doctor` after every config tweak because
`tools/list` (`src/adapters/mcp/stdio.ts:181-193`) returns only `name`,
`description`, `inputSchema` and ships **zero** capability metadata. The
refactor closes all three by giving the consumer a single, honest
introspection surface — `getCapabilities()` — so a tool's gate posture is
knowable *before* the call. Release `v1.14.0` ships the consumer surface,
the four-gate unification, and TDD coverage of every consumer branch.

## Motivation

The MCP tool surface exposes four write gates today, each in a different file
and shape:

1. **`writesDisabled` envelope** — `src/adapters/mcp/dispatch-common.ts:13-25`
   emits `MCP_WRITES_DISABLED` only at runtime. Consumers cannot enumerate
   which tools are gated (the `attempted: <name>` suffix is a debug string,
   not a contract). Nine callers depend on it
   (`dispatch-common.ts`, `dispatch-factory.ts`, `dispatch.ts`,
   `canonical-handlers.ts`, `test/adapters/mcp/vba-sync-frictions-infra.test.ts`).
2. **`invalidInput` envelope** — `src/adapters/mcp/dispatch-common.ts:27-33`
   emits `MCP_INPUT_INVALID` for both schema-rejection and allowlist-rejection
   paths (`canonical-handlers.ts:48-54, 60-63`). The two meanings are
   indistinguishable from the consumer side.
3. **`isWriteAllowed` predicate** — `src/adapters/mcp/dispatch-common.ts:35-43`
   is the runtime truth: `writesEnabled || (resolver(input) === true)`. It is
   the only honest place to ask "is this call gated right now?" but it is
   private to the adapter layer. Sixteen `invalidInput` callers plus the
   factory wiring (`dispatch-factory.ts:49, 70, 105-107`) duplicate the
   `isWriteGated && !(await isWriteAllowed(...))` check instead of asking the
   contract.
4. **`ensureProcedureAllowed` gate** — `src/adapters/mcp/canonical-handlers.ts:38-65`
   is the per-call default-deny allowlist for `run_vba` /
   `dysflow_vba_execute` / `test_vba` (PR1b forward, see
   `vba-sync-adapter.ts:160-165`). The contract shape
   `McpToolContract` (`mcp-tool-contracts.ts:9-14` — `access`,
   `writeGate`, `dryRunDefault?`, `summary`) carries the *intended*
   classification but `getMcpToolContract`
   (`mcp-tool-contracts.ts:165-167`) is the only consumer helper, and no
   `isWriteCapability` / `isReadCapability` / `getCapabilities(name)` predicates exist.

A fifth consumer surface gap compounds the four: `resolveMcpWriteAccessForInput`
(`src/adapters/mcp/stdio.ts:231-241`) resolves per-input `allowWrites` via
`inputTargetsConfig` (`stdio.ts:575-590`), but consumers cannot ask "for this
projectId, are writes enabled?" without re-deriving it.

## Scope

### In Scope

Five deliverables, each lands as one reviewable work unit:

- **#656** — Promote `McpToolContract` (`mcp-tool-contracts.ts:9-14`) into a
  full **capability descriptor** with a typed `McpCapabilityDescriptor` that
  adds `requiresAllowlist: boolean`, `requiresDryRunEscape: boolean`,
  `gateSource: "writes-disabled" | "allowlist" | "schema-only"`, and a
  resolved `gateEffective: "always-blocked" | "dryrun-only" |
  "allowlist-gated" | "open"` field. Ship `getCapabilities(name)`,
  `getCapabilitiesAll()`, `isWriteCapability(name)`, `isReadCapability(name)`
  in `mcp-tool-contracts.ts` next to the existing
  `getMcpToolContract` (`mcp-tool-contracts.ts:165`).
- **#657** — Expose capability metadata in `tools/list` (stdio SDK path,
  `stdio.ts:181-193`): every tool descriptor carries an `_meta.capabilities`
  block derived from `getCapabilities`. Removes the consumer's need to
  call `getMcpToolContract` indirectly through the schema or to call
  `dysflow_doctor` (`stdio.ts` factory) for an aggregate snapshot.
- **#658** — Add `resolveEffectiveGate(input, config?)` in
  `src/adapters/mcp/stdio.ts` next to `resolveMcpWriteAccessForInput`
  (`stdio.ts:231-241`) and `inputTargetsConfig` (`stdio.ts:575-590`).
  Returns the same `McpCapabilityDescriptor` projected against the
  resolved config: for `run_vba` it folds `allowedProcedures` into the
  effective gate; for `exec_sql` it folds `allowWrites`; for `query_sql`
  it returns `open`. Lets an IA ask one question and stop asking.
- **#659** — Unify the four gate envelopes (`writesDisabled`,
  `invalidInput`, `isWriteAllowed`, `ensureProcedureAllowed`) so the
  consumer can branch on `error.code` instead of regex-matching
  `MCP_INPUT_INVALID` vs `MCP_WRITES_DISABLED`. Add three new error
  codes — `MCP_PROCEDURE_NOT_ALLOWED`, `MCP_REQUIRES_DRY_RUN`,
  `MCP_ALLOWLIST_NOT_CONFIGURED` — alongside the existing
  `MCP_INPUT_INVALID` / `MCP_WRITES_DISABLED`. Old codes stay as aliases
  for one minor version to honor the contract extension discipline
  (`tool-parity-registry.ts:97-100`).
- **#660** — TDD coverage: every new function gets a unit test
  (`getCapabilities`, `isWriteCapability`, `isReadCapability`,
  `resolveEffectiveGate`, `dispatch-common.ts` envelope discrimination),
  plus a cheap integration test that `tools/list` returns the
  `_meta.capabilities` block on the SDK path (`stdio.ts:181-193`) for
  every `DysflowMcpToolName`.

### Out of Scope

- No wildcard / regex / `*` allowlists for `allowedProcedures`. The PR1b
  default-deny gate stays character-exact (the `allowedProcedures` array
  stays a string set, not a pattern set). **#244** (the original
  dryRun-as-evidence confusion) is touched only as a *symptom* in the
  Intent section — no fix lands here; the fix is `resolveEffectiveGate`
  (#658) and the new `MCP_REQUIRES_DRY_RUN` code (#659), neither of
  which alter runtime semantics, only the consumer surface.
- No removal of `allowWrites` / `allowedProcedures` from
  `DysflowConfig` (`src/core/config/dysflow-config.ts:36-37, 53-54`). The
  breaking-removal branch is reserved for v2.x.
- No changes to the 2026-07-01 audit campaign scope (#619, #620, #621,
  #622, #623, #624 — see commit `b6ec1ef` of 2026-07-01), the existing
  `2026-07-01-mcp-contract-safety` change (issues #5/#6/#7 of the audit),
  or any of the other five 2026-07-01 SDD changes (`doc-bookkeeping`,
  `form-ir-bugs`, `hexagonal-tech-debt`, `process-lifecycle-safety`,
  `runtime-path-safety`).
- No changes to PR1b's runtime `VbaExecutionAdapter.ensureTestProceduresAllowed`
  behavior (`vba-sync-adapter.ts:160-165`). We surface its gate; we do not
  reimplement it.
- No edits to `MCP_TOOL_CONTRACTS` taxonomy itself. The existing
  `access` / `writeGate` / `dryRunDefault` / `summary` fields stay
  additive; the new `McpCapabilityDescriptor` extends them.
- No change to `prune` semantics (`src/adapters/vba-sync/vba-modules-adapter.ts`
  guard rules — see issue #619 — and the `.frm` binary format exclusion
  from issue #644).
- Issues #645, #646, #650, #651, #652, #653, #654 are not in scope —
  they live in their own SDD changes (or pending ones).

## Approach

The refactor is a pure additive capability layer; no runtime gate
semantic changes. Build order:

1. **Descriptor type + accessors (#656)** — extend
   `src/adapters/mcp/mcp-tool-contracts.ts` with `McpCapabilityDescriptor`
   (the four new fields above) and a `capabilitiesOf(name)` lookup
   table built at module load from `MCP_TOOL_CONTRACTS` (lines
   `153-157`). Add `getCapabilities(name)`, `getCapabilitiesAll()`,
   `isWriteCapability(name)`, `isReadCapability(name)` next to the
   existing `getMcpToolContract` (line 165). Each alias / modern /
   generated entry in `MCP_TOOL_CONTRACTS` gets a derivation function
   so the new fields are computed once, not per-call.
2. **`tools/list` enrichment (#657)** — extend the SDK `ListToolsRequestSchema`
   handler (`src/adapters/mcp/stdio.ts:181-193`) to attach an
   `_meta.capabilities` block built from `getCapabilities(name)` for every
   entry it emits. Hidden-registered stubs (the existing
   `hiddenRegistry` filter at line 183) skip the block to preserve the
   "stub has no real gate" contract.
3. **`resolveEffectiveGate` (#658)** — new export in
   `src/adapters/mcp/stdio.ts`, sibling to
   `resolveMcpWriteAccessForInput` (line 231). Takes
   `{ toolName, input, config? }`, loads the descriptor via
   `getCapabilities(toolName)`, and projects it against the resolved
   `DysflowConfig` (`src/core/config/dysflow-config.ts:51-69`):
   `allowWrites` for `writesDisabled`-style gates,
   `allowedProcedures` for `ensureProcedureAllowed`-style gates,
   `dryRunDefault` for `MCP_REQUIRES_DRY_RUN`. Re-uses
   `inputTargetsConfig` (`stdio.ts:575-590`) to honor per-project
   overrides — same dispatch as `resolveMcpWriteAccessForInput`.
4. **Envelope unification (#659)** — in
   `src/adapters/mcp/dispatch-common.ts`, add three new helpers
   (`procedureNotAllowed`, `requiresDryRun`, `allowlistNotConfigured`)
   that return the new error codes. `ensureProcedureAllowed`
   (`src/adapters/mcp/canonical-handlers.ts:38-65`) returns the new
   code in `error.code` and keeps the existing `MCP_INPUT_INVALID`
   text body for backward compat. `isWriteAllowed`
   (`dispatch-common.ts:35-43`) is unchanged; the
   `writesDisabled()` envelope (line 13) is unchanged. Old call sites
   keep working because `invalidInput(message)` still exists.
5. **Tests (#660)** — five new test files in `test/adapters/mcp/`,
   each one a Vitest `describe`/`it` pair that fails before the
   production change and passes after. Cheap-test obligation: every
   test boots no MSACCESS, no PowerShell — pure module-import +
   function-call tests (the project's testing philosophy:
   `docs/testing/testing-philosophy.md` "north star: a test must
   survive any internal refactor that preserves observable behavior").

## Linked Issues

- Epic: **#655 — gate-introspection-v1 (umbrella)**
- Sub-issues: **#656** (descriptor + accessors), **#657**
  (`tools/list` enrichment), **#658** (`resolveEffectiveGate`),
  **#659** (envelope unification), **#660** (TDD coverage).
- Cross-references (no scope change): the 2026-07-01 audit epic chain
  (#619-#624) and the v1.13.1 baseline
  (`chore(release): v1.13.1` / `fix(vba-manager): compile_vba exit code on VBA_COMPILE_ERROR`
  commits — see `git log --oneline -5`).

## Acceptance

- **#656** `getCapabilities("run_vba")` returns
  `{ access: "conditional-write", writeGate: "conditional", requiresAllowlist: true, requiresDryRunEscape: true, gateSource: "allowlist", gateEffective: "allowlist-gated", dryRunDefault: undefined, summary: … }`. Cheap test:
  `test/adapters/mcp/mcp-tool-capabilities.test.ts` asserts the shape.
- **#657** `tools/list` payload on the SDK path
  (`stdio.ts:181-193`) carries `_meta.capabilities` for every non-hidden
  tool. Cheap test: assert the SDK handler returns the block when
  called with a stub tool array.
- **#658** `resolveEffectiveGate({ toolName: "run_vba", input: {}, config: { allowedProcedures: ["Test_A"] } })` returns
  `gateEffective: "allowlist-gated"`; the same call with
  `allowedProcedures: []` returns `gateEffective: "dryrun-only"`.
  Cheap test: pure function-call test against a stub `DysflowConfig`.
- **#659** `ensureProcedureAllowed("Test_X", [], false)` returns
  `error.code === "MCP_ALLOWLIST_NOT_CONFIGURED"` and the body still
  begins with `MCP_INPUT_INVALID:`. Cheap test: assert both.
- **#660** `pnpm test` is green; the new test files run in < 2 s and
  touch no `MSACCESS.EXE`, no `PowerShell.exe`. CI gate.

## Risks & Mitigations

Scope creep into the wildcard allowlist direction, the `allowWrites`
removal, or the other six 2026-07-01 audit changes is the primary risk;
mitigation is the hard "Out of Scope" list above (any drift must move
into its own SDD change). Backward-compat aliasing for the three new
error codes (one minor version) prevents `MCP_INPUT_INVALID`-regex
consumers from breaking. TDD discipline: every new function ships with
its failing test first (rule `apply.tdd: true` in
`openspec/config.yaml:57`), and the tests are pure module-level
(zero `MSACCESS`, zero `PowerShell`) so they cannot be silently
mocked away.

## Plan

Branch `release/v1.14.0` already exists. Work five sequential
work-unit commits (#656 → #657 → #658 → #659 → #660) on `release/v1.14.0`,
each one a self-contained PR that lands on `staging` per the
`staging-acceptance-contract`. No edits to `main` without explicit user
go-ahead. Encoding: UTF-8 no-BOM, LF line endings (dysflow repo
convention — see `chore(release): v1.13.1` baseline). Release `v1.14.0`
tags after all five work units land and `pnpm test` +
`pnpm build` are green; the release title equals the tag
(`release-title-guard.yml` invariant).