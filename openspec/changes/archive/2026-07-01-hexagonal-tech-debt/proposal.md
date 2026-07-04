# Proposal: hexagonal-tech-debt — Hex, dup, validator, dead-code, override dedup (issue #624)

## Intent

Close the 5 in-scope tech-debt findings from the 2026-07-01
audit (#624) and the latent BUG in `ELIGIBLE_STATUSES`
membership (#B.2). One PR per finding → 5 force-chained PRs,
each within the 400-line review budget. NO E2E this cycle
(campaign rule); `pnpm test` green gate per PR.

## Scope

### In Scope

- **#B.2 (🔴 BUG LATENT)** `ELIGIBLE_STATUSES` membership
  divergence between
  `src/core/operations/access-operation-preflight.ts:50-55`
  (`timed_out`, `failed`, `cleanup_pending`, `pid_unknown`)
  and `src/core/operations/access-operation-cleanup.ts:50`
  (`timed_out`, `failed`, `cleanup_pending`). Consolidate to
  one constant.
- **#B.1** `FORM_NOISE_KEYS` duplication between
  `src/core/services/form-ir-compare-service.ts:30-45` and
  `src/core/services/vba-semantic-classifier.ts:90-106`.
  Membership is currently identical (14 keys, validated); the
  LOCKED comment at line 26-28 is a maintenance burden.
  Extract to a shared module.
- **#A** Hex violations:
  - `access-operation-registry.ts:2` imports `node:fs/promises`
    directly inside `FileAccessOperationRegistry` (no port).
    Introduce `RegistryFileSystemPort` + extract Node impl.
  - `vba-form-service.ts:1` imports `node:fs/promises` for the
    default `nodeFileSystem` impl at lines 46-59 (port exists
    at line 17, but default impl lives in core). Extract
    default impl to `src/adapters/services/`. Mirror
    `cross-process-lock.ts` pattern (port in core, Node impl
    in `src/adapters/runner/node-lock-file-system.ts`).
- **#D** `additionalProperties` SCHEMA FORM (e.g.
  `additionalProperties: { type: "string" }`) is accepted by
  `JsonSchemaProperty` (`schemas.ts:23`) but the validator
  (`validator.ts`) treats it as `true`. Add enforcement when
  the property is an object (documented at `schemas.ts:16-23`).
- **#E** Dead code:
  - `query-write-fixture` route kind at `dispatch-routes.ts:17`
    is referenced at `dispatch-factory.ts:51,156` but no tool
    in `MCP_TOOL_ROUTES` uses it → dead `case` branch.
  - `timeoutMs` string→number coercion at 5 sites:
    `access-query-request-mapper.ts:147-152,190-195,246-251`,
    `execution-target.ts:36`, `stdio.ts:556`. Schemas declare
    `timeoutMs` as `number`; the string branch is dead.
  - `form-lint.ts:520-522` redundant guard
    (`ListBox.ColumnWidths → null` duplicates default
    `return null` at line 523).
- **#F** `access-query-request-mapper.ts:144-157,185-200,
  255-264` — 10-field override block triplicated. Extract a
  `pickOverrides(params)` helper.

### Out of Scope

- Migration of the JSON Schema validator to `ajv` (deferred,
  per audit).
- Refactor of the MCP dispatch chain (`dispatch-*.ts`,
  `canonical-handlers.ts`, `stdio*.ts`) — out of scope per
  audit (high risk). See Audit-precision note C.
- Universal adoption of `restoreMocks`/`clearMocks` in
  `vitest.config.ts` — deferred (repo policy decision).
- Wiring the new `RegistryFileSystemPort` into the tests of
  `FileAccessOperationRegistry` that currently hit the real
  FS — separate test-hygiene PR.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- **`access-operation-contracts`** (delta, 1 requirement):
  ELIGIBLE_STATUSES membership MUST be the canonical union
  `{timed_out, failed, cleanup_pending, pid_unknown}`,
  exported once from
  `src/core/operations/access-operation-status.ts`, and used
  by both preflight and cleanup.
- **`access-core-services`** (delta, 2 requirements):
  `FileAccessOperationRegistry` MUST depend on an injected
  `RegistryFileSystemPort`; the Node.js implementation MUST
  live in `src/adapters/operations/node-registry-file-system.ts`.
  `VbaFormService`'s default `nodeFileSystem` MUST live in
  `src/adapters/services/node-form-file-system.ts`; the port
  (`FormFileSystemPort`) stays in core.
- **`shared-validation`** (delta, 1 requirement):
  `validateInput` MUST enforce `additionalProperties` when the
  value is a `JsonSchemaProperty` (schema form), not only
  when it's a boolean.
- **`mcp-query-tools`** (delta, 2 requirements):
  `buildQueryReadRequest` / `buildWriteFixtureRequest` /
  `buildMaintenanceRequest` MUST share a `pickOverrides(params)`
  helper (10 fields). `timeoutMs` coercion MUST be a single
  helper `coerceTimeoutMs(value)`.
- **`mcp-stdio-adapter`** (delta, 1 requirement):
  The `query-write-fixture` route kind MUST be removed from
  `McpToolRoute` (no live caller) along with the dead
  `case "query-write-fixture"` branch in `dispatch-factory.ts`.

## Approach

RED-first per PR. Each PR is a single-file or small-cluster
refactor with a focused RED test that pins the old buggy
behavior (or the missing enforcement), then the fix, then
GREEN, then refactor. No E2E.

For #A, follow the `cross-process-lock.ts` precedent
(commit `6ac0af1` "refactor(core): move lock filesystem port
out of core into an adapter"): port interface in
`src/core/...`, Node impl in `src/adapters/.../`. Wire
default-injection so production behavior is unchanged. Tests
that currently use real FS get a fake-port option via
constructor (no test rewrite required, just adoption).

For #D, the `JsonSchemaProperty.additionalProperties` type is
already `boolean | JsonSchemaProperty`. The validator at
`validator.ts:80-84` only checks the boolean branch. Add an
object-form enforcement that runs `validateJsonSchemaProperty`
on each extra key against the supplied schema, recursively.

For #E, removal is the RED test: assert the dead branch is
absent. For #B.2, RED test asserts that preflight accepts a
`pid_unknown` record AND that cleanup refuses it with
`CLEANUP_PID_UNKNOWN` (the current code, post-fix, makes
this consistent).

For #F, RED test asserts that all 3 builders produce the same
override fields from a fixed input set.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/operations/access-operation-status.ts` | New | #B.2: `ELIGIBLE_STATUSES` exported once. |
| `src/core/operations/access-operation-preflight.ts:50` | Modified | #B.2: import the constant. |
| `src/core/operations/access-operation-cleanup.ts:50` | Modified | #B.2: import the constant. |
| `src/core/services/form-noise-keys.ts` | New | #B.1: `FORM_NOISE_KEYS` shared module. |
| `src/core/services/form-ir-compare-service.ts:30-45` | Modified | #B.1: re-export from shared module. |
| `src/core/services/vba-semantic-classifier.ts:90-106` | Modified | #B.1: import from shared module. |
| `src/core/operations/registry-file-system-port.ts` | New | #A: port interface. |
| `src/adapters/operations/node-registry-file-system.ts` | New | #A: Node.js impl. |
| `src/core/operations/access-operation-registry.ts:2,146` | Modified | #A: inject port. |
| `src/core/services/vba-form-service.ts:1,46-59` | Modified | #A: drop default impl. |
| `src/adapters/services/node-form-file-system.ts` | New | #A: Node.js impl. |
| `src/shared/validation/validator.ts:80-91` | Modified | #D: enforce schema form. |
| `src/core/mapping/access-query-request-mapper.ts:144-264` | Modified | #F: extract `pickOverrides` + `coerceTimeoutMs`. |
| `src/core/config/execution-target.ts:36` | Modified | #E: drop dead string branch. |
| `src/adapters/mcp/stdio.ts:556` | Modified | #E: drop dead string branch. |
| `src/core/services/form-lint.ts:520-522` | Modified | #E: remove redundant guard. |
| `src/adapters/mcp/dispatch-routes.ts:17` | Modified | #E: remove `query-write-fixture` kind. |
| `src/adapters/mcp/dispatch-factory.ts:51,156-161` | Modified | #E: drop dead `case`. |
| `test/core/operations/access-operation-preflight.test.ts` | Modified | #B.2: pin membership. |
| `test/core/operations/access-operation-cleanup.test.ts` | Modified | #B.2: pin membership. |
| `test/core/services/form-ir-compare.test.ts` | Modified | #B.1: assert shared module identity. |
| `test/core/services/vba-semantic-classifier.test.ts` | Modified | #B.1: assert shared module identity. |
| `test/core/operations/access-operation-registry.test.ts` | Modified | #A: port injection + fake. |
| `test/core/services/vba-form-service.test.ts` | Modified | #A: continue using port injection (no test rewrite). |
| `test/shared/validation/validator.test.ts` | Modified | #D: schema-form RED cases. |
| `test/core/mapping/access-query-request-mapper.test.ts` | Modified | #F: identical override coverage across builders. |
| `test/core/services/form-lint.test.ts` | Modified | #E: assert no behavior change. |
| `test/adapters/mcp/dispatch-factory.test.ts` | Modified | #E: assert dead branch removed. |
| `openspec/specs/{access-operation-contracts,access-core-services,shared-validation,mcp-query-tools,mcp-stdio-adapter}/spec.md` | Modified | Deltas above. |

## Chain Split (force-chained PRs, 400-line budget)

**Decision needed before apply: Yes** (chain split confirmed).
**Chained PRs recommended: Yes.** **400-line budget risk:
Low** (each PR ≤ 250L forecast).

| # | PR | Goal | Likely Δ | TDD evidence | Rollback |
|---|---|---|---|---|---|
| **1** | `[#624/1] #B.2 ELIGIBLE_STATUSES unified membership` | Consolidate the bug-latent constant. | 40-80 | RED `preflight.test.ts` accepts `pid_unknown`; `cleanup.test.ts` returns `CLEANUP_PID_UNKNOWN` for it. | Revert; divergence returns. |
| **2** | `[#624/2] #B.1 + #E constants consolidation + dead code removal` | Shared `form-noise-keys`; drop dead `query-write-fixture` + redundant `form-lint` guard. | 100-160 | RED tests for shared module identity; `dispatch-factory.test.ts` asserts dead branch absent. | Revert; duplication returns, dead branch returns. |
| **3** | `[#624/3] #F override mapping dedup + `coerceTimeoutMs` helper` | Extract `pickOverrides` + `coerceTimeoutMs`. Drop the 5 dead string branches in 2 of the 5 sites (the mapper's 3 sites are deleted by the helper). | 80-140 | RED `access-query-request-mapper.test.ts` asserts identical output across the 3 builders + `timeoutMs` coercion helper. | Revert; triplication returns. |
| **4** | `[#624/4] #A FS port injection (FileAccessOperationRegistry + VbaFormService)` | Inject `RegistryFileSystemPort` + extract Node impl; drop `VbaFormService`'s default impl. | 150-250 | RED `access-operation-registry.test.ts` port injection + fake; `vba-form-service.test.ts` continues to pass (already uses port). | Revert; FS coupling returns. |
| **5** | `[#624/5] #D JSON Schema validator: enforce schema-form additionalProperties` | Extend validator to enforce object-form `additionalProperties`. | 60-110 | RED `validator.test.ts` cases for `{type: "string"}` map, `{enum: [...]}` map, recursive nested. | Revert; schema-form gap returns. |

Total: 430-740 changed lines across 5 PRs (each individually
under 400). User authorized merging to `main` as we go (per
#619-#623 precedent) — no `staging` gate.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| #A port injection changes file-lock race semantics | Med | Pin all existing `access-operation-registry.test.ts` GREEN before refactor; the port wraps the same `mkdir/readFile/writeFile/rename/stat/rm` calls, byte-for-byte. |
| #A `vba-form-service` tests already inject port — port extraction should be a no-op for tests | Low | Confirmed: `VbaFormServiceOptions.fileSystem` already exists. The refactor only moves the default impl. |
| #D new validator branch breaks schemas that LEGITIMATELY use `additionalProperties: false` and rely on extra keys being silently accepted | Low | Boolean form already enforced (line 80-84). Schema form is NEW and was previously a no-op. Only schemas that opt into the schema form are affected. |
| #E removing `query-write-fixture` kind breaks a future tool that wants this routing | Low | A future tool author can re-add the kind (5 lines); the `case` (4 lines) is trivial. Document in `dispatch-routes.ts` JSDoc. |
| #E removing the redundant `form-lint.ts:520-522` guard obscures a future rule author from the "known-supported" intent | Low | Move the intent to a JSDoc above the function (existing comment at line 519-523 stays). |
| #B.1 shared module identity test pins membership too tightly (1-line edit drift) | Low | Test asserts `Set.prototype === FORM_NOISE_KEYS` (same reference) AND membership equality. Edits to either location break the test; both MUST be updated. |
| #F refactor accidentally changes behavior of one builder (e.g., default for missing `expectedAccessPath`) | Med | Snapshot test: run all 3 builders with the same input, assert deep-equal output to current behavior. RED first. |
| `pnpm test` flake on `access-runner.test.ts:1358` (campaign note, not regression) | Med | Tolerated per #619-#623 precedent; not introduced here. |

## Rollback Plan

Each PR is independently revertable. No data loss in any
rollback — all changes are code-shape, not schema or data.

- PR1: revert → divergent constants return.
- PR2: revert → duplication returns, dead branch returns.
- PR3: revert → triplication returns.
- PR4: revert → FS coupling returns (Node impls become
  unreachable; cross-process-lock-style extraction undone).
- PR5: revert → schema-form gap returns.

## Dependencies

- Existing tests: `access-operation-preflight.test.ts`,
  `access-operation-cleanup.test.ts`, `form-ir-compare.test.ts`,
  `vba-semantic-classifier.test.ts`,
  `access-operation-registry.test.ts`, `vba-form-service.test.ts`,
  `validator.test.ts`, `access-query-request-mapper.test.ts`,
  `form-lint.test.ts`, `dispatch-factory.test.ts`.
- Capability specs: `access-operation-contracts`,
  `access-core-services`, `shared-validation`,
  `mcp-query-tools`, `mcp-stdio-adapter`.
- Reference pattern: `src/core/runner/cross-process-lock.ts`
  + `src/adapters/runner/node-lock-file-system.ts`
  (commit `6ac0af1`).
- `access-runner.test.ts:1358` flake — campaign note.

## Success Criteria

- [ ] PR1: `preflight` accepts a `pid_unknown` record (line
      118); `cleanup` returns `CLEANUP_PID_UNKNOWN` for
      `pid_unknown` (line 124). Both import from
      `access-operation-status.ts`.
- [ ] PR2: `FORM_NOISE_KEYS` is the same `Set` reference in
      `form-ir-compare-service.ts` and `vba-semantic-classifier.ts`.
      `query-write-fixture` no longer in `McpToolRoute`; dead
      `case` in `dispatch-factory.ts` removed. `form-lint.ts`
      has no redundant `ListBox.ColumnWidths` guard.
- [ ] PR3: All 3 builders in
      `access-query-request-mapper.ts` produce identical
      override shapes for the same input. `timeoutMs`
      coercion lives in one helper.
- [ ] PR4: `FileAccessOperationRegistry` constructor accepts
      a `fileSystem` option (default = Node impl). `VbaFormService`
      has no `nodeFileSystem` constant; default is the new
      adapter. All existing tests still GREEN.
- [ ] PR5: `validateInput` returns an error when a schema
      has `additionalProperties: { type: "string" }` and an
      extra non-string key is supplied. Existing boolean-form
      tests still GREEN.
- [ ] `pnpm test`, `pnpm lint`, `pnpm build` pass after each PR.
- [ ] Each PR commit body carries `SDD: hexagonal-tech-debt`
      and `Issue: #624`.
- [ ] No commit body carries AI co-author attribution.

## Audit-precision notes (informed by reading code)

- **#A file paths.** Audit locates the bad files at
  `src/core/operations/file-access-operation-registry.ts` and
  `src/core/services/vba-form-service.ts`. The second is
  correct; the first is wrong — the class `FileAccessOperationRegistry`
  lives at `src/core/operations/access-operation-registry.ts:146`
  alongside `InMemoryAccessOperationRegistry` (line 427). Same
  path-imprecision pattern as #620.
- **#A `vba-form-service.ts` is HALF the good pattern.** The
  audit frames it as "imports `node:fs` directly instead of an
  injected port", but `FormFileSystemPort` already exists
  (lines 17-23) AND the service already accepts the port via
  `VbaFormServiceOptions.fileSystem` (line 35). The hex
  violation is subtler: the DEFAULT Node.js implementation
  (`nodeFileSystem` at lines 46-59) lives INSIDE the service
  file, so `src/core/services/` still imports `node:fs/promises`.
  The fix is to extract `nodeFileSystem` to
  `src/adapters/services/node-form-file-system.ts` — same
  shape as the `cross-process-lock.ts` / `node-lock-file-system.ts`
  precedent (commit `6ac0af1`).
- **#B.1 `FORM_NOISE_KEYS` membership is currently IDENTICAL**
  (14 keys each, validated by reading both sets). The "BUG
  LATENT" claim is correct in the FUTURE — the lists are
  duplicated and one edit away from divergence (the LOCKED
  comment at `form-ir-compare-service.ts:26-28` is a maintenance
  burden). The real divergence BUG is `#B.2 ELIGIBLE_STATUSES`
  (different membership TODAY).
- **#B.2 `ELIGIBLE_STATUSES` divergence is REAL.** Preflight
  has 4 statuses including `pid_unknown`; cleanup has 3. The
  divergence matters because preflight considers `pid_unknown`
  records eligible for cleanup, but cleanup refuses them at
  line 124 with `CLEANUP_PID_UNKNOWN` (the early-return
  short-circuits before `ELIGIBLE_STATUSES` is even consulted).
  The fix is one canonical membership = union of both
  (preflight's 4 is the superset).
- **#C dispatch chain is OUT OF SCOPE per audit** ("high
  risk"). I read the files: `dispatch-routes.ts:144L`,
  `dispatch-factory.ts:169L`, `dispatch-common.ts:80L`,
  `canonical-handlers.ts:240L`, `stdio.ts:650L`,
  `stdio-size-guard.ts:125L`, `stdio-wrappers.ts:63L` —
  total ~1471 lines. The audit counted "4 dispatch-*.ts +
  canonical-handlers + stdio*"; the actual count is 3
  dispatch files (not 4). The complexity is partly justified
  (route table is the single source of truth for
  `mutatesBinary`/`mutatesFilesystem`) and partly accidental
  (`dispatch-factory.ts` has accumulated dry-run / write-gate
  logic from slices 2-5). Confirming out-of-scope; deferring
  the refactor to a future change.
- **#C how #621 🔴 #6 drift crept in.** The audit claims
  "this is exactly how the 🔴 #6 from #621 drift crept in."
  Looking at `git log -- src/adapters/mcp/dispatch-factory.ts`
  recent commits: `b08c33f fix(mcp): VBA execution default-deny
  gate (#621, F1 PR 1a of 4)` and the slice 2/3/4/5 work
  (`a1243ae`, `3d311d5`, `42c0438`) all piled dry-run /
  write-gate logic into the same factory. Future drift is
  inevitable without a refactor.
- **#D validator gap is partial.** The audit says
  "`additionalProperties` nested accepted but NOT enforced".
  Reading `validator.ts:11-15,80-84`: the BOOLEAN form
  (`false`) IS enforced at top-level and nested-object level.
  The SCHEMA form (`additionalProperties: { type: "string" }`)
  is accepted by the type (`schemas.ts:23`) but the validator
  passes it through without enforcement (the comment at
  `schemas.ts:16-23` documents this explicitly). The fix is
  to add enforcement for the schema form, not to remove the
  boolean form.
- **#E `query-write-fixture` is dead CODE, not dead TYPE.**
  Reading `dispatch-routes.ts:21-89`: `MCP_TOOL_ROUTES` has
  no entry with `kind: "query-write-fixture"` — all routes
  are `vba-sync`, `query-maintenance`, or `query-read`. The
  `case "query-write-fixture":` at `dispatch-factory.ts:156-161`
  is unreachable in practice (TypeScript keeps the union for
  future expansion, but no live caller exists). Removing the
  union member + case is safe.
- **#E `timeoutMs` coercion is in 5 sites, not "never
  executes".** Audit says "string→number coercion never
  executes" — correct intent, broader blast radius than
  named. Sites: `access-query-request-mapper.ts:147-152,
  190-195, 246-251` (3), `execution-target.ts:36` (1),
  `stdio.ts:556` (1). All 5 schemas declare `timeoutMs` as
  `number`. PR3 replaces the 3 mapper sites with a helper;
  the other 2 sites (`execution-target.ts`, `stdio.ts`) keep
  the dead branch for now (separate concern, listed in
  PR3's "Also drops" note).
- **#E `form-lint.ts:520-522` is REDUNDANT, not unreachable.**
  The audit says "Inaccessible guard". Reading the code: the
  guard IS reachable (any `ListBox.ColumnWidths` reference
  hits it), but it returns `null` — same as the default at
  line 523. The guard exists ONLY to document
  "ColumnWidths is supported". The intent survives as a
  JSDoc comment above the function; the explicit guard is
  maintenance burden. Removing it is a one-liner RED test.
- **#F override block is triplicated.** Audit confirms: the
  same 10-field override appears in
  `buildQueryReadRequest` (144-157),
  `buildWriteFixtureRequest` (185-200),
  `buildMaintenanceRequest` (255-264). Same family of
  fields that burned with #13228 / #622. The fix is a
  `pickOverrides(params)` helper that returns the 10-field
  shape; each builder spreads it.
- **#G `vitest.config.ts` is missing `restoreMocks`/
  `clearMocks`.** Confirmed by reading the file (53 lines,
  no mock globals). Per audit, this is OUT OF SCOPE (deferred
  to a repo-policy decision). Future PR, possibly a docs
  PR like #623.

## TDD for this change

Strict TDD active per `openspec/config.yaml`. Every PR:

1. Write the RED test first (pin the old behavior OR pin
   the missing enforcement).
2. Implement the fix.
3. GREEN.
4. Refactor (only if GREEN).

No E2E. `pnpm test` is the green gate; `pnpm exec biome check
src/ test/` is the lint gate. The
`access-runner.test.ts:1358` flake is the campaign-wide
tolerated flake, not introduced here.