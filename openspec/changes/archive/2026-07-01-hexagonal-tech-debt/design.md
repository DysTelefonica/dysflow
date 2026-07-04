# Design: hexagonal-tech-debt — Hex, dup, validator, dead-code, override dedup (#624)

## Technical Approach

Five force-chained PRs close the in-scope findings from the 2026-07-01
audit of dysflow's TypeScript MCP + CLI runtime. Each PR is a single
small refactor with a RED-first TDD pin. The chain order (lowest-risk
→ highest-risk):

| PR | Finding | Why first |
|---|---|---|
| 1 | #B.2 `ELIGIBLE_STATUSES` unification | Latent real bug; tiny surface; gate for #B.1 tests that already touch shared state. |
| 2 | #B.1 + #E constants consolidation + dead code | Removes dead `query-write-fixture` route + `form-lint` guard; consolidates `FORM_NOISE_KEYS`. |
| 3 | #F override mapping dedup + `coerceTimeoutMs` helper | Pure dedup of mapper triplication; no behavior change. |
| 4 | #A FS port injection (`FileAccessOperationRegistry` + `VbaFormService`) | Mirrors `cross-process-lock.ts` precedent (commit `6ac0af1`); higher risk because the registry holds the project's `.dysflow/runtime/operations.json`. |
| 5 | #D JSON Schema validator: enforce schema-form `additionalProperties` | Validator gap; new enforcement branch only. |

Reference pattern: `src/core/runner/cross-process-lock.ts` (port in
core) + `src/adapters/runner/node-lock-file-system.ts` (Node impl in
adapters), per commit `6ac0af1`.

---

## Architecture Decisions

### Decision 1 — `ELIGIBLE_STATUSES` is exported as `ReadonlySet<AccessOperationStatus>` (not array)

**Choice**: `src/core/operations/access-operation-status.ts` exports
`ELIGIBLE_STATUSES: ReadonlySet<AccessOperationStatus>`. Both preflight
and cleanup `import { ELIGIBLE_STATUSES } from "./access-operation-status"`.
**Alternatives considered**: (a) array export — rejected because the
current preflight uses a `Set` (membership check at line 118) and the
spec mandates `Object.is(preflight, cleanup)` strict identity; an array
forces a `new Set(arr)` at every call site and breaks identity. (b)
plain `Record` / `const tuple` — same problem. **Rationale**: matches
the existing preflight style; satisfies the strict-identity scenario at
the cheapest possible surface area.

### Decision 2 — `RegistryFileSystemPort` supports `writeFile(..., { flag?: "wx" })`

**Choice**: `writeFile(path, data, encoding, options?)` where
`options?.flag === "wx"` is the only supported flag (lock creation).
**Alternatives considered**: (a) `writeFile(path, data, encoding)`
without `wx` and a separate `writeFileExclusive` method — rejected
because the registry uses both shapes (regular + atomic) and the
adapter must wrap `node:fs/promises.writeFile` directly anyway. (b)
throw on unsupported flag values — added as a runtime check (cheap,
fails loud). **Rationale**: keeps the port surface close to the
underlying Node call while preserving the registry's existing atomic-
create semantics byte-for-byte. The `wx` flag path is exercised by
`acquireRegistryMutationLock` (line 265 of the current file); removing
it changes mutual-exclusion semantics — unacceptable.

### Decision 3 — `FORM_NOISE_KEYS` lives in `src/core/services/form-noise-keys.ts`

**Choice**: New module exports the `ReadonlySet<string>`. Both
`form-ir-compare-service.ts` and `vba-semantic-classifier.ts` re-export
it for backward compatibility (existing callers still import from
those modules). **Alternatives considered**: (a) one consumer imports
the other — rejected because it inverts a layering principle (both are
siblings, neither is the canonical owner). (b) both consumers import
the new module directly, no re-export — would break every external
caller (including `tool-parity-registry.ts:146`'s JSDoc reference is a
string literal, not an import, but `form-ir-compare-service.test.ts` and
`vba-semantic-classifier.test.ts` import the symbol). **Rationale**:
in-place refactor + re-export preserves the public surface; tests
assert `Object.is(consumer.FORM_NOISE_KEYS, shared.FORM_NOISE_KEYS)`,
which is satisfied because the consumer module re-exports the same
reference.

### Decision 4 — Dead `query-write-fixture` route kind + `case` removed (not merely commented)

**Choice**: Drop the union member from `McpToolRoute` AND drop the
`case "query-write-fixture":` block from `dispatch-factory.ts`. The
`route.kind === "query-write-fixture"` term in the `isWriteGated`
expression at line 51 disappears with the union member.
**Alternatives considered**: (a) keep the union member, remove only
the `case` — rejected because TypeScript would require an unreachable
`case` to satisfy exhaustiveness, which is the opposite of the goal.
(b) keep both with a `// @ts-expect-error` — hides the regression.
**Rationale**: removal is the simplest cleanup, and the spec's
"Scenario: exhaustiveness guard still rejects unknown kinds" pins the
behavior. Re-introduction requires a deliberate type-widening PR per
the spec's documented path.

### Decision 5 — `coerceTimeoutMs` returns `number | undefined`, throws on non-number non-undefined

**Choice**: Helper signature
`coerceTimeoutMs(value: number | string | undefined): number | undefined`.
Passes through `number` and `undefined`. Throws `TypeError` for string
input (Zod rejects strings at parse time, so the throw branch is
unreachable in practice — but the type system needs the explicit
check). **Alternatives considered**: (a) accept strings silently via
`parseFloat` — re-introduces the dead branch the spec wants gone. (b)
return `number` (no `undefined`) — would force callers to pass
explicit values, breaking the current "missing = undefined"
semantics. **Rationale**: spec line 126-128 mandates either
"returns number|undefined or throws TypeError" — this is the second.

---

## Data Flow

### PR 1 (#B.2) — `ELIGIBLE_STATUSES` data flow

```
access-operation-preflight.ts:50-55  ──reads──>  ELIGIBLE_STATUSES
access-operation-cleanup.ts:50      ──reads──>  ELIGIBLE_STATUSES
                                              ▲
                                              │ exports
                            access-operation-status.ts  (NEW)
                                              │
                                              └─ membership: {timed_out, failed, cleanup_pending, pid_unknown}
```

Both consumers import the same `Set` reference. `Object.is` strict
identity holds. A `pid_unknown` record: preflight accepts it (was
already eligible); cleanup rejects it with `CLEANUP_PID_UNKNOWN` via
the pre-existing line-124 guard (not via `ELIGIBLE_STATUSES`). The
fix does NOT change `cleanup`'s behavior for `pid_unknown` — it
changes the SHAPE of the constant to match what preflight already
did. This is intentional (spec: "Both services MUST continue to
treat these records as eligible — no regression").

### PR 4 (#A) — FS port injection data flow

```
                  ┌────────────────────────────────────────────┐
                  │ FileAccessOperationRegistry (core)         │
                  │  - constructor({ ..., fileSystem })        │
                  │  - routes every FS call through port       │
                  └────────────────────┬───────────────────────┘
                                       │
                                       ▼
                  ┌────────────────────────────────────────────┐
                  │ RegistryFileSystemPort (core, NEW)         │
                  │  mkdir | readFile | writeFile(wx) | rename │
                  │  rm | rmdir | stat                         │
                  └────────────────────┬───────────────────────┘
                                       │
                  ┌────────────────────┴────────────────────┐
                  │                                          │
                  ▼                                          ▼
       Node impl (default)                       Test fake (injected)
       src/adapters/operations/                  test/core/operations/
       node-registry-file-system.ts              access-operation-registry.test.ts
```

The same shape as `cross-process-lock.ts` → `node-lock-file-system.ts`.
`createProjectAccessOperationRegistry({ projectRoot })` and
`createFileAccessOperationRegistry({ filePath })` factories inject the
Node impl by default — production behavior unchanged.

### PR 4 — `VbaFormService` extraction data flow

```
                  ┌────────────────────────────────────────────┐
                  │ VbaFormService (core)                     │
                  │  - constructor({ ..., fileSystem? })       │
                  │  - no longer declares nodeFileSystem       │
                  │  - no longer imports node:fs/promises      │
                  └────────────────────┬───────────────────────┘
                                       │
                                       ▼
                  ┌────────────────────────────────────────────┐
                  │ FormFileSystemPort (core, ALREADY EXISTS) │
                  │  mkdir | readdir | readFile | readJson     │
                  │  writeFile                                │
                  └────────────────────┬───────────────────────┘
                                       │
                  ┌────────────────────┴────────────────────┐
                  │                                          │
                  ▼                                          ▼
       Node impl (extracted)                        Test fake (already in use)
       src/adapters/services/                       test/core/services/
       node-form-file-system.ts                     vba-form-service.test.ts
```

The port interface already exists (lines 17-23 of current
`vba-form-service.ts`). The work is to move the `nodeFileSystem`
constant (lines 46-59) out of the core service file into
`src/adapters/services/node-form-file-system.ts`, and have the
constructor resolve the default from the adapter. The service file's
`nodeFileSystem` and `nodeClock` constants both move; only
`nodeFileSystem` is the audit-driven target. `nodeClock` could move
too, but is out of scope (the audit calls out `node:fs/promises`
specifically; `new Date()` is platform-neutral).

---

## File Changes

### PR 1 (#B.2) — `ELIGIBLE_STATUSES` unification (40-80L)

| File | Action | Description |
|------|--------|-------------|
| `src/core/operations/access-operation-status.ts` | **Create** | Exports `ELIGIBLE_STATUSES: ReadonlySet<AccessOperationStatus>` (4 statuses). |
| `src/core/operations/access-operation-preflight.ts:50-55` | Modify | Delete local `ELIGIBLE_STATUSES`; add `import { ELIGIBLE_STATUSES } from "./access-operation-status"`. |
| `src/core/operations/access-operation-cleanup.ts:50` | Modify | Same swap. |
| `test/core/operations/access-operation-preflight.test.ts` | Modify | Add identity + pid_unknown tests. |
| `test/core/operations/access-operation-cleanup.test.ts` | Modify | Add identity + pid_unknown tests. |
| `openspec/specs/access-operation-contracts/spec.md` | Archive | Spec already lives in this change's `specs/` — no archive delta yet (deferred to `sdd-archive`). |

### PR 2 (#B.1 + #E dead code + form-lint guard) (100-160L)

| File | Action | Description |
|------|--------|-------------|
| `src/core/services/form-noise-keys.ts` | **Create** | Exports `FORM_NOISE_KEYS: ReadonlySet<string>` (14 keys). |
| `src/core/services/form-ir-compare-service.ts:30-45` | Modify | Re-export from shared module; delete local `Set` + LOCKED comment (lines 26-28). |
| `src/core/services/vba-semantic-classifier.ts:90-106` | Modify | Re-export from shared module. |
| `src/core/services/form-lint.ts:518-522` | Modify | Remove redundant `if (type === "ListBox" && prop === "ColumnWidths") { return null; }` block. Move intent to JSDoc. |
| `src/adapters/mcp/dispatch-routes.ts:17` | Modify | Delete union member `\| { kind: "query-write-fixture" }`. Add JSDoc re-introduction note. |
| `src/adapters/mcp/dispatch-factory.ts:51,156-161` | Modify | Delete `route.kind === "query-write-fixture"` term in `isWriteGated`; delete the `case "query-write-fixture":` block. |
| `test/core/services/form-ir-compare.test.ts` | Modify | Add identity + membership tests. |
| `test/core/services/vba-semantic-classifier.test.ts` | Modify | Add identity test. |
| `test/core/services/form-lint.test.ts` | Modify | Add ListBox.ColumnWidths no-warning test. |
| `test/adapters/mcp/dispatch-factory.test.ts` | **Create** | New test file (does not exist today — surface in return envelope). Covers union shape + switch cases + exhaustiveness. |
| `openspec/specs/access-core-services/spec.md` | Archive | Deferred to `sdd-archive`. |
| `openspec/specs/mcp-stdio-adapter/spec.md` | Archive | Deferred to `sdd-archive`. |

### PR 3 (#F + #E mapper `timeoutMs`) (80-140L)

| File | Action | Description |
|------|--------|-------------|
| `src/core/mapping/access-query-request-mapper.ts:144-264` | Modify | Add `pickOverrides(params)` helper (10-field shape) + `coerceTimeoutMs(value)` helper. All 3 builders spread `pickOverrides` and delegate `timeoutMs` to `coerceTimeoutMs`. Delete 3 inline `typeof === "string"` blocks. |
| `test/core/mapping/access-query-request-mapper.test.ts` | Modify | Add identical-shape, structural, delegation, pass-through tests. |
| `openspec/specs/mcp-query-tools/spec.md` | Archive | Deferred to `sdd-archive`. |

PR3 also leaves `execution-target.ts:36` and `stdio.ts:556` dead
string branches untouched (audit-imprecision surfaced in proposal +
spec).

### PR 4 (#A FS port injection) (150-250L)

| File | Action | Description |
|------|--------|-------------|
| `src/core/operations/registry-file-system-port.ts` | **Create** | Port interface: `mkdir / readFile / writeFile (with `wx` flag) / rename / rm / rmdir / stat`. |
| `src/adapters/operations/node-registry-file-system.ts` | **Create** | Node impl wrapping `node:fs/promises` calls. |
| `src/core/operations/access-operation-registry.ts:2,146` | Modify | Drop `node:fs/promises` import (line 2). Inject `fileSystem` into `FileAccessOperationRegistry` constructor. Default in `createProjectAccessOperationRegistry` + `createFileAccessOperationRegistry` factories. Every FS call routes through port. |
| `src/adapters/services/node-form-file-system.ts` | **Create** | Node impl for `FormFileSystemPort` (mirrors lines 46-59 of current `vba-form-service.ts`). |
| `src/core/services/vba-form-service.ts:1,46-59` | Modify | Drop `node:fs/promises` import (line 1). Drop local `nodeFileSystem` constant (lines 46-59). Constructor resolves `fileSystem` default from the new adapter module. |
| `test/core/operations/access-operation-registry.test.ts` | Modify | Add port injection + fake + failing-fake-port tests. |
| `test/core/services/vba-form-service.test.ts` | Modify | No new tests required — refactor is opaque to existing tests. Confirm GREEN. |
| `openspec/specs/access-core-services/spec.md` | Archive | Deferred to `sdd-archive`. |

### PR 5 (#D validator) (60-110L)

| File | Action | Description |
|------|--------|-------------|
| `src/shared/validation/validator.ts:11-15,80-91` | Modify | Add schema-form `additionalProperties` enforcement in both top-level loop and nested-object loop. When `additionalProperties` is a `JsonSchemaProperty`, run `validateJsonSchemaProperty(value, additionalProperties, key)` for every key NOT in `properties`. |
| `test/shared/validation/validator.test.ts` | Modify | Add happy / sad / enum / recursive / regression (`false` and `true`) tests. |
| `openspec/specs/shared-validation/spec.md` | Archive | Deferred to `sdd-archive`. |

---

## Interfaces / Contracts

### `RegistryFileSystemPort` (PR 4, new)

```ts
export interface RegistryFileSystemPort {
  mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(
    path: string,
    data: string,
    encoding: "utf8",
    options?: { flag?: "wx" },
  ): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<void>;
  rmdir(path: string): Promise<void>;
  stat(path: string): Promise<{ mtimeMs: number } | undefined>;
}
```

The Node impl `nodeRegistryFileSystem` wraps `node:fs/promises`
calls. The `stat` wrapper catches `ENOENT` and returns `undefined`
(matches current behavior at line 319-322). The `wx` flag is the only
supported write-flag; other flag values throw `TypeError("Unsupported writeFile flag: <x>")`.

### `access-operation-status.ts` exports (PR 1, new)

```ts
import type { AccessOperationStatus } from "./access-operation-registry.js";

export const ELIGIBLE_STATUSES: ReadonlySet<AccessOperationStatus> = new Set([
  "timed_out",
  "failed",
  "cleanup_pending",
  "pid_unknown",
]);
```

`ReadonlySet` prevents accidental `.add` from consumers (spec
"Set is read-only at the boundary"). `Object.is` identity holds across
preflight + cleanup + this module.

### `pickOverrides` + `coerceTimeoutMs` (PR 3, new helpers in `access-query-request-mapper.ts`)

```ts
const OVERRIDE_KEYS = [
  "projectId", "contextId", "accessPath", "destinationRoot",
  "projectRoot", "strictContext", "expectedAccessPath",
  "expectedProjectRoot", "expectedDestinationRoot",
] as const;

export type OverrideShape = {
  projectId: string | undefined;
  contextId: string | undefined;
  accessPath: string | undefined;
  destinationRoot: string | undefined;
  projectRoot: string | undefined;
  strictContext: boolean | undefined;
  expectedAccessPath: string | undefined;
  expectedProjectRoot: string | undefined;
  expectedDestinationRoot: string | undefined;
};

export function pickOverrides(params: Record<string, unknown>): OverrideShape {
  return {
    projectId: getStr(params, "projectId"),
    contextId: getStr(params, "contextId"),
    accessPath: getStr(params, "accessPath"),
    destinationRoot: getStr(params, "destinationRoot"),
    projectRoot: getStr(params, "projectRoot"),
    strictContext:
      params.strictContext === true ? true : params.strictContext === false ? false : undefined,
    expectedAccessPath: getStr(params, "expectedAccessPath"),
    expectedProjectRoot: getStr(params, "expectedProjectRoot"),
    expectedDestinationRoot: getStr(params, "expectedDestinationRoot"),
    timeoutMs: coerceTimeoutMs(params.timeoutMs),
  };
}

export function coerceTimeoutMs(value: number | string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
  throw new TypeError(
    `timeoutMs must be a number; received ${typeof value}. Zod schemas reject strings at parse time.`,
  );
}
```

Each of the 3 builders uses `{ ...pickOverrides(params), ...perBuilderFields }` to
compose its result.

---

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Identity (`Object.is` strict equality of shared sets/ports) | `import` the constant from both modules, assert `Object.is(...)`. |
| Unit | Membership byte-equivalence | Enumerate and snapshot the 14 keys / 4 statuses. |
| Unit | Validator schema-form enforcement | RED-first on each shape (`{ type: "string" }`, `{ enum }`, recursive). |
| Unit | Mapper identical override shapes | Run all 3 builders with same `params`, deep-equal output. |
| Unit | `coerceTimeoutMs` pass-through + throw | Cover `number`, `undefined`, and the typed-error throw. |
| Unit | Port injection (registry) | Construct with `{ fileSystem: fakePort }`, assert `fakePort.calls.length` matches. |
| Unit | Failing fake port | `fakePort.readFile` rejects with `Error("EACCES")`; assert surfaced unchanged. |
| Unit | `VbaFormService` existing tests | All GREEN with default injection. |
| Unit | `form-lint` no behavior change | ListBox.ColumnWidths → no warning. Other violations still fire. |
| Unit | Dispatch dead branch absent | `dispatch-factory.test.ts` (new file) asserts `McpToolRoute` union shape + switch exhaustiveness. |
| E2E | **none** | Campaign rule (no E2E this cycle). |

---

## Migration / Rollout

**No data migration required.** All five PRs are code-shape changes
with no schema, no config, no env-var impact.

### Backward compatibility

- **PR1** changes the membership to the superset of preflight + cleanup.
  Cleanup previously rejected `pid_unknown` at line 124 via the
  pre-existing `CLEANUP_PID_UNKNOWN` guard — which the spec preserves
  ("cleanup refuses `pid_unknown` with `CLEANUP_PID_UNKNOWN`"). Preflight
  was already treating `pid_unknown` as eligible. Net behavior change:
  NONE. The constant is consolidated, not changed.

- **PR2** removes the `query-write-fixture` union member + `case`. The
  proposal confirms no live caller (`MCP_TOOL_ROUTES` has no
  `kind: "query-write-fixture"` entry — verified by reading
  `dispatch-routes.ts:21-89`). If a future tool wants this routing, the
  re-introduction path is documented in the JSDoc above the union.

- **PR2** also removes the `form-lint.ts:520-522` redundant guard.
  Existing test "ListBox.ColumnWidths returns no warning" must remain
  GREEN. Verified by re-reading lines 520-523: removing the guard
  returns the default `null` instead of `null` from the explicit guard
  — same observable result.

- **PR4** changes how `FileAccessOperationRegistry` gets its FS — via
  injected port, default Node impl. Existing tests that hit the real
  FS keep working (default wires Node impl). Pre-push test: run
  `pnpm test test/core/operations/access-operation-registry.test.ts`
  before and after — must be GREEN both times. The same goes for
  `vba-form-service.test.ts`.

- **PR4** `VbaFormService` default moves to the new adapter module.
  Existing tests inject a fake port directly (line 35, `VbaFormServiceOptions.fileSystem`)
  — refactor is opaque to them. Pre-push test: same pattern.

- **PR5** new validator branch is opt-in. Existing schemas that use
  boolean `additionalProperties` are untouched (regression tests pin
  this). New schema-form usage gets enforcement.

### PR-by-PR commit plan (1 commit per PR)

Each PR is one logical change → one commit. Multi-commit
fragmentation would harm chain readability and bloat the review budget.

### Rollback per PR

| PR | Revert command | Side effects of revert |
|---|---|---|
| 1 | `git revert <sha>` | Divergent constants return; `pid_unknown` cleanup behavior unchanged. |
| 2 | `git revert <sha>` | Duplication returns; dead `case` returns. `FORM_NOISE_KEYS` re-export falls back to local definitions. |
| 3 | `git revert <sha>` | Triplication returns; dead `timeoutMs` string branches return (safe — dead). |
| 4 | `git revert <sha>` | FS coupling returns; `nodeFileSystem` constant returns. Existing tests that hit real FS keep working (defaults re-establish). |
| 5 | `git revert <sha>` | Schema-form gap returns; boolean form unchanged. |

---

## Surface Flag — `access-core-services` delta split

The proposal's "Modified Capabilities" mapping omits **#B.1
(`FORM_NOISE_KEYS`)** and **#E form-lint guard**. Both files
(`form-ir-compare-service.ts`, `vba-semantic-classifier.ts`,
`form-lint.ts`) live under `access-core-services`. The spec places
them in the same delta. **Design decision**: keep the consolidated
`access-core-services` delta. Rationale: the spec is the source of
truth, and the affected files genuinely belong to this capability.
The proposal's "Modified Capabilities" list is an audit-summarized
artifact, not the binding spec.

If `sdd-archive` ever needs to split the capability for finer-grained
deltas, the split is straightforward:

- `access-core-services-noise-floor`: `FORM_NOISE_KEYS` only.
- `access-core-services-form-lint`: `form-lint.ts` rules only.
- `access-core-services-fs-ports`: PR4 (FS port injection).

Surface this in the orchestrator's return envelope.

---

## Open Questions

- [ ] **None blocking.** All design decisions are pinned by the proposal +
  spec + audit-precision notes. The audit-imprecision notes (in the
  proposal "Audit-precision" section) are carried into the design.

---

## Documentation Updates

| Doc | Entry | Triggered by |
|---|---|---|
| `CHANGELOG.md` | "Fix latent cleanup-eligibility divergence for `pid_unknown` records (#B.2)" | PR1 (latent bug fix). |
| `CHANGELOG.md` | "Extract Node FS port for `FileAccessOperationRegistry` and `VbaFormService` (#A, hexagonal split)" | PR4 (architectural change). |
| `CHANGELOG.md` | — none — | PR2 dead-code removal (no observable change). |
| `CHANGELOG.md` | — none — | PR3 dedup (no observable change). |
| `CHANGELOG.md` | — none — | PR5 validator (internal). |
| `src/adapters/mcp/dispatch-routes.ts` JSDoc | Re-introduction note for `query-write-fixture` | PR2. |
| `src/core/services/vba-form-service.ts` JSDoc | Update "Default Node.js port implementations" header to point at `src/adapters/services/node-form-file-system.ts`. | PR4. |
| `src/core/operations/access-operation-registry.ts` JSDoc | Update file header to document `fileSystem` port + default injection. | PR4. |

---

## PR-by-PR Detailed Diff Sketches

### PR 1 — Core change (unified diff sketch)

`src/core/operations/access-operation-preflight.ts`:

```diff
@@ -47,13 +47,7 @@ export type AccessOperationPreflightCleanup = {
   cleanup(request: AccessOperationPreflightCleanupRequest): Promise<AccessOperationPreflightCleanupResult>;
 };

-const ELIGIBLE_STATUSES = new Set<AccessOperationStatus>([
-  "timed_out",
-  "failed",
-  "cleanup_pending",
-  "pid_unknown",
-]);
+import { ELIGIBLE_STATUSES } from "./access-operation-status.js";
 const DEFAULT_OPERATION_TIMEOUT_MS = 3_000;
```

(`AccessOperationStatus` import can stay if other code in the file uses it.)

`src/core/operations/access-operation-cleanup.ts`:

```diff
@@ -47,7 +47,7 @@ export type AccessCleanupResult = {
   status: "cleaned";
 };

-const ELIGIBLE_STATUSES = new Set(["timed_out", "failed", "cleanup_pending"]);
+import { ELIGIBLE_STATUSES } from "./access-operation-status.js";
```

**Test surface**:

```ts
// test/core/operations/access-operation-preflight.test.ts (append)
import { ELIGIBLE_STATUSES as PREFLIGHT_ELIGIBLE } from "../../../src/core/operations/access-operation-status.js";
import { ELIGIBLE_STATUSES as MODULE_ELIGIBLE } from "../../../src/core/operations/access-operation-preflight.js";

it("imports ELIGIBLE_STATUSES from access-operation-status", () => {
  expect(Object.is(PREFLIGHT_ELIGIBLE, MODULE_ELIGIBLE)).toBe(true);
});

it("accepts a pid_unknown record", async () => {
  const registry = new InMemoryAccessOperationRegistry();
  await registry.create({ ...baseRecord, status: "pid_unknown", operationId: "op-pid-unknown" });
  const service = new AccessOperationPreflightCleanupService({
    registry,
    processInspector: { getProcess: async () => undefined },
    processKiller: { kill: async () => undefined },
    clock: () => "2026-05-15T10:02:00.000Z",
  });
  const result = await service.cleanup({ accessPath: "C:/DATA/app.accdb", projectRoot: "C:/repo/app" });
  expect(result.errors).toEqual([]);
  expect(result.cleaned).toContain("op-pid-unknown");
});
```

```ts
// test/core/operations/access-operation-cleanup.test.ts (append)
import { ELIGIBLE_STATUSES as CLEANUP_ELIGIBLE } from "../../../src/core/operations/access-operation-status.js";
import { ELIGIBLE_STATUSES as MODULE_ELIGIBLE } from "../../../src/core/operations/access-operation-cleanup.js";

it("imports ELIGIBLE_STATUSES from access-operation-status", () => {
  expect(Object.is(CLEANUP_ELIGIBLE, MODULE_ELIGIBLE)).toBe(true);
});

it("pid_unknown returns CLEANUP_PID_UNKNOWN error envelope", async () => {
  const registry = new InMemoryAccessOperationRegistry();
  await registry.create({ ...baseRecord, status: "pid_unknown", operationId: "op-pid-unknown" });
  const service = new AccessOperationCleanupService({
    registry,
    processInspector: { getProcess: async () => undefined },
    processKiller: { kill: async () => undefined },
  });
  const result = await service.cleanup({ operationId: "op-pid-unknown", accessPath: "C:/DATA/app.accdb" });
  expect(result.ok).toBe(false);
  expect(result.error?.code).toBe("CLEANUP_PID_UNKNOWN");
});
```

### PR 4 — FS port injection (unified diff sketch)

`src/core/operations/access-operation-registry.ts`:

```diff
@@ -1,9 +1,8 @@
 import { randomUUID } from "node:crypto";
-import { mkdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
 import { dirname, join, resolve } from "node:path";
 import { isLockAlreadyExistsError, isTransientLockContentionError } from "../utils/lock-errors.js";
 import { logSwallowedIoError } from "../utils/log-swallowed-io-error.js";
+import type { RegistryFileSystemPort } from "./registry-file-system-port.js";
+import { nodeRegistryFileSystem } from "../../adapters/operations/node-registry-file-system.js";
@@ -91,7 +90,11 @@ export type InMemoryAccessOperationRegistryOptions = {
 };

 export type FileAccessOperationRegistryOptions = InMemoryAccessOperationRegistryOptions & {
   filePath: string;
   lockTimeoutMs?: number;
   staleLockMs?: number;
+  fileSystem?: RegistryFileSystemPort;
 };
@@ -146,12 +149,15 @@ export class FileAccessOperationRegistry implements AccessOperationRegistry {
   private readonly filePath: string;
   private readonly lockPath: string;
   private readonly lockOwnerPath: string;
   private readonly maxRecords: number;
   private readonly lockTimeoutMs: number;
   private readonly staleLockMs: number;
+  private readonly fileSystem: RegistryFileSystemPort;
   private lastHealth: AccessOperationRegistryHealth = { status: "ok" };

   constructor(options: FileAccessOperationRegistryOptions) {
     this.filePath = resolve(options.filePath);
     this.lockPath = `${this.filePath}.lock`;
     this.lockOwnerPath = join(this.lockPath, "owner");
     this.maxRecords = Math.max(1, Math.floor(options.maxRecords ?? DEFAULT_MAX_RECORDS));
     this.lockTimeoutMs = Math.max(1, Math.floor(options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS));
     this.staleLockMs = Math.max(1, Math.floor(options.staleLockMs ?? DEFAULT_STALE_LOCK_MS));
+    this.fileSystem = options.fileSystem ?? nodeRegistryFileSystem;
   }
```

All `mkdir/readFile/writeFile/rename/rm/rmdir/stat` call sites in
`FileAccessOperationRegistry` swap to `this.fileSystem.X(...)`. ~20
sites total — diff is mechanical. `InMemoryAccessOperationRegistry`
is untouched (no FS calls).

`src/core/services/vba-form-service.ts`:

```diff
@@ -1,4 +1,3 @@
-import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
 import { resolve } from "node:path";
 import { isWithinRuntime } from "../../shared/runtime-dir.js";
@@ -3,6 +2,7 @@
 import {
   createDysflowError,
   failureResult,
   type OperationResult,
   successResult,
 } from "../contracts/index.js";
+import { nodeFormFileSystem } from "../../adapters/services/node-form-file-system.js";
@@ -41,21 +41,6 @@
-// ---------------------------------------------------------------------------
-// Default Node.js port implementations (used when no explicit port is injected)
-// ---------------------------------------------------------------------------
-
-const nodeFileSystem: FormFileSystemPort = {
-  mkdir: (path, options) => mkdir(path, options),
-  readdir: (path) => readdir(path),
-  readFile: (path) => readFile(path, "utf8"),
-  readJson: async <T>(path: string): Promise<T> => { ... },
-  writeFile: (path, data, encoding) => writeFile(path, data, encoding),
-};
-
 const nodeClock: FormClockPort = {
   nowIso: () => new Date().toISOString(),
 };
@@ -75,7 +60,7 @@ export class VbaFormService {
   constructor(options: VbaFormServiceOptions = {}) {
     this.cwd = options.cwd ?? process.cwd();
-    this.fileSystem = options.fileSystem ?? nodeFileSystem;
+    this.fileSystem = options.fileSystem ?? nodeFormFileSystem;
     this.clock = options.clock ?? nodeClock;
     this.env = options.env ?? (process.env as Record<string, string | undefined>);
   }
```

`src/adapters/services/node-form-file-system.ts`:

```ts
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";

export const nodeFormFileSystem: FormFileSystemPort = {
  mkdir: (path, options) => mkdir(path, options),
  readdir: (path) => readdir(path),
  readFile: (path) => readFile(path, "utf8"),
  readJson: async <T>(path: string): Promise<T> => {
    const raw = await readFile(path, "utf8");
    try { return JSON.parse(raw) as T; } catch { throw new Error(`Invalid JSON file: ${path}`); }
  },
  writeFile: (path, data, encoding) => writeFile(path, data, encoding),
};
```

### PR 5 — Validator schema-form enforcement (unified diff sketch)

`src/shared/validation/validator.ts`:

```diff
@@ -8,10 +8,21 @@ export function validateInput(input: unknown, schema: JsonObjectSchema): string | undefined {

   if (schema.additionalProperties === false) {
     for (const key of Object.keys(params)) {
       if (schema.properties[key] === undefined) return `${key} is not allowed.`;
     }
   }
+  if (typeof schema.additionalProperties === "object" && schema.additionalProperties !== null) {
+    for (const key of Object.keys(params)) {
+      if (schema.properties[key] !== undefined) continue;
+      const validation = validateJsonSchemaProperty(params[key], schema.additionalProperties, key);
+      if (validation !== undefined) return validation;
+    }
+  }

@@ -78,11 +89,22 @@ function validateJsonSchemaProperty(
     if (property.additionalProperties === false) {
       for (const key of Object.keys(value)) {
         if (property.properties?.[key] === undefined) return `${path}.${key} is not allowed.`;
       }
     }
+    if (typeof property.additionalProperties === "object" && property.additionalProperties !== null) {
+      for (const key of Object.keys(value)) {
+        if (property.properties?.[key] !== undefined) continue;
+        const validation = validateJsonSchemaProperty(value[key], property.additionalProperties, `${path}.${key}`);
+        if (validation !== undefined) return validation;
+      }
+    }
```

---

## Notes for the Apply Phase

1. **Strict TDD**: every behavior change gets a RED test FIRST. Pin
   the OLD behavior (PR1 pre-flight accepts `pid_unknown`, cleanup
   rejects), then refactor, then assert the NEW identity.

2. **`test/adapters/mcp/dispatch-factory.test.ts` does not exist
   today** (verified by glob). PR2 must create it. Surface in
   orchestrator return.

3. **Audit-imprecision carried forward**: the proposal explicitly
   notes `execution-target.ts:36` and `stdio.ts:556` `timeoutMs` sites
   are out of scope for PR3. Do not silently extend PR3 to them.

4. **Lint gate**: `pnpm exec biome check src/ test/` — the
   shared-module refactor in PR2 may surface unused-import warnings
   if a re-export has no remaining in-module usage; verify before
   merging.

5. **Build gate**: `pnpm build` — the new modules under
   `src/core/operations/access-operation-status.ts`,
   `src/core/services/form-noise-keys.ts`,
   `src/core/operations/registry-file-system-port.ts`, and the
   adapters under `src/adapters/operations/` and
   `src/adapters/services/` must compile.

6. **Conventional commits**: each PR title is the chain tag
   (`[#624/1]`, `.../2`, etc.). Commit body: `SDD: hexagonal-tech-debt`,
   `Issue: #624`. No AI co-author attribution.

7. **Review budget forecast vs guardrail**:

| PR | Forecast | Budget | Margin |
|---|---|---|---|
| 1 | 40-80 | 400 | OK |
| 2 | 100-160 | 400 | OK (also creates new test file) |
| 3 | 80-140 | 400 | OK |
| 4 | 150-250 | 400 | TIGHT — recheck after PR2 lands |
| 5 | 60-110 | 400 | OK |

Total ~430-740 lines across 5 PRs (proposal line 184). PR4 is the
only one with margin < 50%; if the diff grows past 250L, surface it.

---

## End