# Tasks: hexagonal-tech-debt — Hex, dup, validator, dead-code, override dedup (#624)

## Review Workload Forecast

| PR  | Estimated changed lines | 400-line budget risk | Files touched | Tests added | Notes |
| --- | ----------------------- | -------------------- | ------------- | ----------- | ----- |
| PR1 | 50–90 | Low | 5 | +4 | Minimal surface area |
| PR2 | 110–170 | Low | 9 | +5 (+1 new file) | New `dispatch-factory.test.ts` created |
| PR3 | 90–150 | Low | 2 | +7 | Pure dedup; test-heavy |
| PR4 | 160–260 | **Medium** | 6 | +4 | Tightest margin; recheck after PR2 |
| PR5 | 65–115 | Low | 2 | +6 | Smallest delta |

Decision needed before apply: Yes (chain split confirmed)
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: **Medium** (PR4 is the tightest margin; if >250L diff surfaces post-PR2, surface to orchestrator)

**PR4 recheck gate**: After PR2 lands, re-estimate PR4's diff. If the diff exceeds 250L, surface to orchestrator before launching sdd-apply.

---

## Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `#B.2 ELIGIBLE_STATUSES` unification | `[#624/1]` | Standalone; gate for PR2 tests |
| 2 | `#B.1 + #E` consolidation + dead code removal | `[#624/2]` | CHANGELOG: no |
| 3 | `#F` override dedup + `coerceTimeoutMs` | `[#624/3]` | CHANGELOG: no |
| 4 | `#A` FS port injection | `[#624/4]` | CHANGELOG: yes (architectural) |
| 5 | `#D` JSON Schema validator schema-form | `[#624/5]` | CHANGELOG: no |

---

## PR 1 — `[#624/1] #B.2 ELIGIBLE_STATUSES unified membership`

**Commit**: `fix(core): consolidate ELIGIBLE_STATUSES to single source (#624)`

Body: `SDD: hexagonal-tech-debt`, `Issue: #624`

### Test plan (RED FIRST)

1. **RED** — `test/core/operations/access-operation-preflight.test.ts`:
   - Add: `imports ELIGIBLE_STATUSES from access-operation-status`
     - Asserts `Object.is(PREFLIGHT_ELIGIBLE, MODULE_ELIGIBLE) === true`
   - Add: `accepts a pid_unknown record (was previously eligible only in preflight)`
     - Creates registry record with `status: "pid_unknown"`; preflight cleanup must clean it

2. **RED** — `test/core/operations/access-operation-cleanup.test.ts`:
   - Add: `imports ELIGIBLE_STATUSES from access-operation-status`
     - Asserts `Object.is(CLEANUP_ELIGIBLE, MODULE_ELIGIBLE) === true`
   - Add: `pid_unknown returns CLEANUP_PID_UNKNOWN error envelope`
     - Creates registry record with `status: "pid_unknown"`; cleanup must return `error.code === "CLEANUP_PID_UNKNOWN"`

3. Run tests — confirm both RED (preflight test passes on identity only; cleanup test fails on missing constant)

### Implementation steps

- [ ] 1.1 **Create** `src/core/operations/access-operation-status.ts`
  - Exports `ELIGIBLE_STATUSES: ReadonlySet<AccessOperationStatus>` = `new Set(["timed_out", "failed", "cleanup_pending", "pid_unknown"])`
  - Imports `AccessOperationStatus` from `./access-operation-registry.js`

- [ ] 1.2 **Modify** `src/core/operations/access-operation-preflight.ts:50-55`
  - Delete local `const ELIGIBLE_STATUSES = new Set<AccessOperationStatus>([...])`
  - Add: `import { ELIGIBLE_STATUSES } from "./access-operation-status.js";`
  - `AccessOperationStatus` import may stay if other usages exist in file

- [ ] 1.3 **Modify** `src/core/operations/access-operation-cleanup.ts:50`
  - Delete local `const ELIGIBLE_STATUSES = new Set(["timed_out", "failed", "cleanup_pending"])`
  - Add: `import { ELIGIBLE_STATUSES } from "./access-operation-status.js";`

- [ ] 1.4 **GREEN**: Run tests — all 4 new tests pass; existing tests unchanged

### Verification

- `pnpm test test/core/operations/access-operation-preflight.test.ts test/core/operations/access-operation-cleanup.test.ts` — GREEN
- `pnpm exec biome check src/core/operations/access-operation-status.ts src/core/operations/access-operation-preflight.ts src/core/operations/access-operation-cleanup.ts` — pass
- `pnpm build` — pass

### Rollback

`git revert <sha>` — divergent constants return; behavior unchanged (cleanup still rejects `pid_unknown` via its line-124 guard)

### CHANGELOG task

- [ ] Add entry: `Fix latent cleanup-eligibility divergence for pid_unknown records (#B.2, #624)`

---

## PR 2 — `[#624/2] #B.1 + #E constants consolidation + dead code removal`

**Commit**: `refactor(core): consolidate FORM_NOISE_KEYS; remove dead query-write-fixture route (#624)`

Body: `SDD: hexagonal-tech-debt`, `Issue: #624`

### Test plan (RED FIRST)

1. **RED** — `test/core/services/form-ir-compare.test.ts`:
   - Add: `FORM_NOISE_KEYS identity equals shared module reference`
   - Add: `FORM_NOISE_KEYS membership preserved (14 keys)`
   - Asserts `Object.is(FORM_NOISE_KEYS, sharedModule.FORM_NOISE_KEYS)` + set equality

2. **RED** — `test/core/services/vba-semantic-classifier.test.ts`:
   - Add: `FORM_NOISE_KEYS identity equals shared module reference`

3. **RED** — `test/core/services/form-lint.test.ts`:
   - Add: `ListBox.ColumnWidths returns no warning after guard removed`
   - Add test case: `Me.MyListBox.ColumnWidths = "10cm"` → no `ColumnWidths` warning

4. **RED** — `test/adapters/mcp/dispatch-factory.test.ts` (**NEW FILE** — does not exist):
   - Add: `McpToolRoute union has no query-write-fixture kind`
   - Add: `dispatch switch has no query-write-fixture case branch`
   - Add: `exhaustiveness guard still rejects unknown kinds`
   - Add: `every existing tool still routes to its documented handler`

5. Run tests — confirm RED (shared module doesn't exist yet; `dispatch-factory.test.ts` doesn't exist)

### Implementation steps

**#B.1 — FORM_NOISE_KEYS consolidation**

- [ ] 2.1 **Create** `src/core/services/form-noise-keys.ts`
  - Exports `FORM_NOISE_KEYS: ReadonlySet<string>` with the 14 keys (same order as current `form-ir-compare-service.ts:30-45`)
  - Copy the exact 14-key set from `form-ir-compare-service.ts`

- [ ] 2.2 **Modify** `src/core/services/form-ir-compare-service.ts`
  - Replace local `FORM_NOISE_KEYS` declaration with: `export { FORM_NOISE_KEYS } from "./form-noise-keys.js";`
  - Keep the `ReadonlySet<string>` type annotation (re-export satisfies it)
  - Delete the `* LOCKED` comment block (lines 26-28) — moved intent to the shared module's JSDoc

- [ ] 2.3 **Modify** `src/core/services/vba-semantic-classifier.ts`
  - Replace local `FORM_NOISE_KEYS` declaration with: `import { FORM_NOISE_KEYS } from "./form-noise-keys.js";`
  - Change `const FORM_NOISE_KEYS` → keep the same local alias for internal use (or have both re-export — design says "re-export for backward compat")
  - **Decision**: Both modules re-export from shared; tests assert `Object.is(consumer.FORM_NOISE_KEYS, shared.FORM_NOISE_KEYS)`

**#E — query-write-fixture removal**

- [ ] 2.4 **Modify** `src/adapters/mcp/dispatch-routes.ts`
  - Delete `| { kind: "query-write-fixture" };` from `McpToolRoute` union (line 17)
  - Add JSDoc above `McpToolRoute`: re-introduction note explaining removal reason and path

- [ ] 2.5 **Modify** `src/adapters/mcp/dispatch-factory.ts:51`
  - Delete `route.kind === "query-write-fixture" ||` from `isWriteGated` expression
  - Delete `case "query-write-fixture":` block at lines 156-161

**#E — form-lint redundant guard**

- [ ] 2.6 **Modify** `src/core/services/form-lint.ts:520-522`
  - Delete the `if (type === "ListBox" && prop === "ColumnWidths") { return null; }` block
  - Ensure JSDoc above the function documents that `ColumnWidths` is supported
  - Default `return null` at line 523 handles the case

- [ ] 2.7 **GREEN**: Run tests — all new + existing tests pass

### Verification

- `pnpm test test/core/services/form-ir-compare.test.ts test/core/services/vba-semantic-classifier.test.ts test/core/services/form-lint.test.ts test/adapters/mcp/dispatch-factory.test.ts` — GREEN
- `pnpm exec biome check src/core/services/form-noise-keys.ts src/core/services/form-ir-compare-service.ts src/core/services/vba-semantic-classifier.ts src/core/services/form-lint.ts src/adapters/mcp/dispatch-routes.ts src/adapters/mcp/dispatch-factory.ts` — pass
- `pnpm build` — pass
- `pnpm test` (full suite) — GREEN

### Rollback

`git revert <sha>` — duplication returns; dead `case` returns; form-lint guard returns

### CHANGELOG task

- None (no observable behavior change)

---

## PR 3 — `[#624/3] #F override mapping dedup + coerceTimeoutMs helper`

**Commit**: `refactor(core): deduplicate override mapping with pickOverrides helper (#624)`

Body: `SDD: hexagonal-tech-debt`, `Issue: #624`

### Test plan (RED FIRST)

1. **RED** — `test/core/mapping/access-query-request-mapper.test.ts`:
   - Add: `pickOverrides is the single source of override fields` (structural)
   - Add: `all 3 builders produce identical override shapes for the same input` (happy)
   - Add: `pickOverrides preserves missing-field defaults as undefined` (edge)
   - Add: `coerceTimeoutMs is the only timeoutMs coercion site in the mapper` (structural)
   - Add: `coerceTimeoutMs number pass-through returns the number` (regression)
   - Add: `coerceTimeoutMs undefined pass-through returns undefined` (regression)
   - Add: `pickOverrides delegates timeoutMs to coerceTimeoutMs` (identity)

2. Run tests — confirm RED (helpers don't exist yet)

### Implementation steps

- [ ] 3.1 **Add** `OVERRIDE_KEYS` const array + `OverrideShape` type + `pickOverrides(params)` helper + `coerceTimeoutMs(value)` helper to `src/core/mapping/access-query-request-mapper.ts` (before `buildQueryReadRequest`)

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
    timeoutMs: number | undefined;
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

- [ ] 3.2 **Modify** `buildQueryReadRequest` (lines ~140-158)
  - Replace inline override block with `{ ...pickOverrides(params) }`
  - Delete the inline `typeof === "string"` timeoutMs coercion block

- [ ] 3.3 **Modify** `buildWriteFixtureRequest` (lines ~185-200)
  - Same transformation: spread `pickOverrides(params)`; delete string coercion block

- [ ] 3.4 **Modify** `buildMaintenanceRequest` (lines ~255-264)
  - Same transformation: spread `pickOverrides(params)`; delete string coercion block

- [ ] 3.5 **GREEN**: Run tests — all new tests pass; existing mapper tests unchanged

### Verification

- `pnpm test test/core/mapping/access-query-request-mapper.test.ts` — GREEN
- `pnpm exec biome check src/core/mapping/access-query-request-mapper.ts` — pass
- `pnpm build` — pass
- `pnpm test` (full suite) — GREEN

### Rollback

`git revert <sha>` — triplication returns; dead string branches return (safe)

### CHANGELOG task

- None (no observable behavior change)

---

## PR 4 — `[#624/4] #A FS port injection (FileAccessOperationRegistry + VbaFormService)`

**Commit**: `refactor(core): extract Node FS ports for FileAccessOperationRegistry and VbaFormService (#624)`

Body: `SDD: hexagonal-tech-debt`, `Issue: #624`

### Test plan (RED FIRST)

1. **RED** — `test/core/operations/access-operation-registry.test.ts`:
   - Add: `constructor accepts fileSystem port and routes every FS call through it` (happy)
   - Add: `default factory wires Node adapter at the documented path` (sad)
   - Add: `failing fake port surfaces typed Error unchanged` (adversarial)

2. **RED** — `test/core/services/vba-form-service.test.ts`:
   - No new tests (refactor is opaque to existing tests); confirm existing tests remain GREEN after implementation

3. Run tests — confirm RED (port doesn't exist yet)

### Implementation steps

**#A — RegistryFileSystemPort extraction**

- [ ] 4.1 **Create** `src/core/operations/registry-file-system-port.ts`
  - Exports `RegistryFileSystemPort` interface with: `mkdir`, `readFile`, `writeFile(path, data, encoding, options?)`, `rename`, `rm`, `rmdir`, `stat`
  - `writeFile` options accepts `{ flag?: "wx" }` only; unsupported flags throw `TypeError`

- [ ] 4.2 **Create** `src/adapters/operations/node-registry-file-system.ts`
  - Exports `nodeRegistryFileSystem: RegistryFileSystemPort` wrapping `node:fs/promises` calls
  - `stat` catches `ENOENT` and returns `undefined` (matches current behavior)
  - `writeFile` throws `TypeError("Unsupported writeFile flag: <x>")` for non-`wx` flags

- [ ] 4.3 **Modify** `src/core/operations/access-operation-registry.ts`
  - Drop `node:fs/promises` import (line 2)
  - Add: `import type { RegistryFileSystemPort } from "./registry-file-system-port.js";`
  - Add: `import { nodeRegistryFileSystem } from "../../adapters/operations/node-registry-file-system.js";`
  - `FileAccessOperationRegistryOptions` adds `fileSystem?: RegistryFileSystemPort`
  - `FileAccessOperationRegistry` constructor adds `private readonly fileSystem: RegistryFileSystemPort` field
  - Constructor resolves: `this.fileSystem = options.fileSystem ?? nodeRegistryFileSystem`
  - Every `mkdir/readFile/writeFile/rename/rm/rmdir/stat` call swaps to `this.fileSystem.X(...)` (~20 sites, mechanical)
  - `createFileAccessOperationRegistry({ filePath })` factory wires `nodeRegistryFileSystem` by default

**#A — VbaFormService default extraction**

- [ ] 4.4 **Create** `src/adapters/services/node-form-file-system.ts`
  - Exports `nodeFormFileSystem: FormFileSystemPort` — mirrors current `nodeFileSystem` impl (lines 46-59 of `vba-form-service.ts`)
  - `readJson` helper: reads file, JSON.parse, throws `Error("Invalid JSON file: <path>")` on parse failure

- [ ] 4.5 **Modify** `src/core/services/vba-form-service.ts`
  - Drop `node:fs/promises` import (line 1)
  - Drop local `nodeFileSystem` constant (lines 46-59)
  - Update JSDoc header: "Default Node.js port implementations" now points to `src/adapters/services/node-form-file-system.ts`
  - Constructor: `this.fileSystem = options.fileSystem ?? nodeFormFileSystem` (import added)

- [ ] 4.6 **GREEN**: Run tests — all new + existing tests pass

### Verification

- `pnpm test test/core/operations/access-operation-registry.test.ts test/core/services/vba-form-service.test.ts` — GREEN
- `pnpm exec biome check src/core/operations/registry-file-system-port.ts src/adapters/operations/node-registry-file-system.ts src/core/operations/access-operation-registry.ts src/adapters/services/node-form-file-system.ts src/core/services/vba-form-service.ts` — pass
- `pnpm build` — pass
- `pnpm test` (full suite) — GREEN
- Confirm `src/core/operations/access-operation-registry.ts` contains no `node:` import
- Confirm `src/core/services/vba-form-service.ts` contains no `node:fs/promises` import

### Rollback

`git revert <sha>` — FS coupling returns; `nodeFileSystem` constant returns; existing tests keep working (defaults re-establish)

### CHANGELOG task

- [ ] Add entry: `Extract Node FS port for FileAccessOperationRegistry and VbaFormService (hexagonal split, #A, #624)`

---

## PR 5 — `[#624/5] #D JSON Schema validator: enforce schema-form additionalProperties`

**Commit**: `fix(validation): enforce schema-form additionalProperties in validateInput (#624)`

Body: `SDD: hexagonal-tech-debt`, `Issue: #624`

### Test plan (RED FIRST)

1. **RED** — `test/shared/validation/validator.test.ts`:
   - Add: `additionalProperties: { type: "string" } accepts valid extra keys` (happy)
   - Add: `additionalProperties: { type: "string" } rejects extra key with wrong primitive type` (sad)
   - Add: `additionalProperties: { enum: [...] } rejects disallowed value` (edge)
   - Add: `additionalProperties schema form is enforced recursively in nested objects` (adversarial)
   - Add: `additionalProperties: false still rejects extra keys (regression)`
   - Add: `additionalProperties: true still allows extra keys (regression)`

2. Run tests — confirm RED (validator doesn't handle schema form yet)

### Implementation steps

- [ ] 5.1 **Modify** `src/shared/validation/validator.ts:11-15` (top-level loop in `validateInput`)
  - After the `additionalProperties === false` boolean branch, add:
    ```ts
    if (typeof schema.additionalProperties === "object" && schema.additionalProperties !== null) {
      for (const key of Object.keys(params)) {
        if (schema.properties[key] !== undefined) continue;
        const validation = validateJsonSchemaProperty(params[key], schema.additionalProperties, key);
        if (validation !== undefined) return validation;
      }
    }
    ```

- [ ] 5.2 **Modify** `src/shared/validation/validator.ts:80-91` (nested-object loop in `validateJsonSchemaProperty`)
  - After the `property.additionalProperties === false` boolean branch, add:
    ```ts
    if (typeof property.additionalProperties === "object" && property.additionalProperties !== null) {
      for (const key of Object.keys(value)) {
        if (property.properties?.[key] !== undefined) continue;
        const validation = validateJsonSchemaProperty(value[key], property.additionalProperties, `${path}.${key}`);
        if (validation !== undefined) return validation;
      }
    }
    ```

- [ ] 5.3 **GREEN**: Run tests — all new + existing validator tests pass

### Verification

- `pnpm test test/shared/validation/validator.test.ts` — GREEN
- `pnpm exec biome check src/shared/validation/validator.ts` — pass
- `pnpm build` — pass
- `pnpm test` (full suite) — GREEN

### Rollback

`git revert <sha>` — schema-form gap returns; boolean form unchanged

### CHANGELOG task

- None (internal validator change)

---

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `<sha1>` | `[#624/1] #B.2 ELIGIBLE_STATUSES unified membership` | 1.1–1.4 | `pnpm test` GREEN | N/A (TypeScript only) |
| `<sha2>` | `[#624/2] #B.1 + #E constants consolidation + dead code removal` | 2.1–2.7 | `pnpm test` GREEN | N/A |
| `<sha3>` | `[#624/3] #F override mapping dedup + coerceTimeoutMs helper` | 3.1–3.5 | `pnpm test` GREEN | N/A |
| `<sha4>` | `[#624/4] #A FS port injection` | 4.1–4.6 | `pnpm test` GREEN | N/A |
| `<sha5>` | `[#624/5] #D JSON Schema validator schema-form enforcement` | 5.1–5.3 | `pnpm test` GREEN | N/A |

---

## Orchestrator notes

1. **PR4 recheck gate**: After PR2 lands, re-estimate PR4's actual diff. If >250L, surface before launching sdd-apply for PR4.
2. **New test file**: `test/adapters/mcp/dispatch-factory.test.ts` does not exist — PR2 creates it.
3. **CHANGELOG entries**: Only PR1 (bug fix) and PR4 (architectural) need CHANGELOG entries.
4. **No E2E this cycle**: Strict TDD + `pnpm test` gate only.
5. **Target**: `main` (user authorized per campaign precedent).
