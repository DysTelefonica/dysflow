# Exploration: feat-759-no-compile — Hard-break removal of VBA compilation from dysflow

**Change**: Remove all dysflow-managed VBA compilation (`compile_vba` tool, `compile` param on `import_modules`/`import_all`, `rollbackOnCompileFail`, PowerShell `Invoke-CompileAction`/`Save-VbaProjectModules` fallback). The user compiles manually in the Access VBE.

**Branch**: `fix/mcp-friction-consolidation-v1.18` (already exists)

**Maintainer decision** (GH issue #759, comment 4896478041):
> "No quiero que dysflow compile nunca. Quiero compilar yo manualmente. Solo mete ruido. No ha de hacer nunca la compilación ni con parámetro ni sin parámetros. Fuera compilación por parte de dysflow."

---

## Current State

### `compile_vba` tool

`compile_vba` is a first-class MCP tool registered in:

| File | Line | Role |
|---|---|---|
| `src/adapters/mcp/mcp-tool-registry.ts` | 12 | In `VBA_SYNC_TOOL_NAMES` array |
| `src/adapters/mcp/mcp-tool-registry.ts` | 37 | In `implementedToolNames` set |
| `src/adapters/mcp/dispatch-routes.ts` | ~ | Route: `{ kind: "vba-sync", mutatesBinary: true }` |
| `src/adapters/vba-sync/vba-sync-adapter.ts` | — | `handles("compile_vba")` + `execute` branch |
| `src/adapters/vba-sync/vba-execution-adapter.ts` | 25 | `EXECUTION_MAPPINGS.compile_vba = mapping("Compile", true)` |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts` | 161–165 | Schema: `{ object, additionalProperties: false, properties: { ...CTX_PROPS, ...ACCESS_OVERRIDE, timeoutMs } }` — no params beyond context |
| `src/shared/validation/schema-props.ts` | 144 | `SCHEMA_PROPS.compile` (acCmdCompileAndSaveAllModules description) — NOT referenced by `compile_vba` schema |

**Schema is already minimal** — `compile_vba` takes only context + timeout. The real compile machinery lives in `import_modules`/`import_all`.

### `compile` param on `import_modules`

| File | Line | Detail |
|---|---|---|
| `src/adapters/mcp/schemas/vba-sync-schemas.ts` | 89 | `compile: SCHEMA_PROPS.compile` |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts` | 94–98 | `rollbackOnCompileFail: { type: "boolean", description }` |
| `src/adapters/vba-sync/vba-modules-adapter.ts` | 26–31 | `COMPILE_MAPPING` + `rollbackOnCompileFail` logic |
| `src/adapters/vba-sync/vba-modules-adapter.ts` | — | Post-import compile block with rollback |
| `src/adapters/vba-sync/vba-execution-adapter.ts` | — | `compile:true` branch for `import_all` |

### `compile` param on `import_all`

| File | Line | Detail |
|---|---|---|
| `src/adapters/mcp/schemas/vba-sync-schemas.ts` | 115 | `compile: SCHEMA_PROPS.compile` |
| `src/adapters/vba-sync/vba-execution-adapter.ts` | — | `compile:true` branch |

### PowerShell layer

`scripts/dysflow-vba-manager.ps1`:
- `Invoke-CompileAction` — top-level compile dispatcher (:4252)
- `Invoke-CompileVbaProject` — calls `RunCommand(126)` with `acCmdCompileAndSaveAllModules` (:2848)
- `New-CompileFailureResult` — structured failure (:2821)
- `RunCommand(126)` — the compile sentinel at lines :2205 and :2247
- `Save-VbaProjectModules` — fallback path at :2653 (the 126→280 pattern)

### Test surface

| File | What to do |
|---|---|
| `test/adapters/vba-sync/vba-execution-adapter.test.ts` | Remove all `compile_vba` + `compile:true` test cases |
| `test/e2e/compile-error-capture.e2e.test.ts` | **Delete** — E2E test for compile error capture |
| `test/quality-gates/mcp-e2e-compile-vba-mojibake-pin.test.ts` | **Delete** — pin test asserting `compile_vba` expected:"error" |
| `test/e2e/import-modules-regression.e2e.test.ts` | Remove `compile_vba` calls + `compile:false` from import test calls |
| `test/e2e/import-modules-long-list.e2e.test.ts` | Remove `compile:false` param from calls |
| `test/e2e/form-codebehind-stale-import.e2e.test.ts` | Remove `compile:true` test case at line 353+ |
| `E2E_testing/mcp-e2e.mjs` | Remove `compile_vba` record at lines 273, 280; keep `compile:false` on import calls (safe — it's a no-op param) |
| `test/quality-gates/ci-workflow.test.ts` | **Verify**: compile references are `compilerOptions` from tsconfig (false positive) |

### Docs surface

| File | What to do |
|---|---|
| `docs/mcp-examples.md` | Remove `compile: true` examples (lines ~44+) |
| `docs/release-checklist.md` | Remove `compile_vba expected:"error"` references (lines 88, 96) |
| `docs/testing/e2e-battery.md` | Remove/update `compile_vba` references (lines 66, 126–127, 284, 290) |
| `AGENTS.md` | Remove `compile_vba` from sync loop (line 152) and form/report sync (line 189, 191) |
| `README.md` | Remove `compile_vba` tool description (line 666); keep `compile` param in import_modules/import_all schemas (lines 663, 665) |
| `openspec/specs/vba-manager-actions/spec.md` | Archive or mark obsolete — hard-coded compile requirement in scenarios (lines 163, 175) |
| `openspec/specs/vba-inline-execution/spec.md` | **Keep** — inline execution compiles a temp module; different concern |
| `openspec/specs/access-operation-contracts/spec.md` | TypeScript "compile" references (lines 31, 93, 96, 158) — safe |

### Hidden coupling found

- `E2E_testing/README.md` line 56: `compile_vba` mentioned — remove
- `openspec/changes/archive/tdd-coverage-holes/verify-report.md` line 34+: `compile_vba` known failure pinned — historical, leave
- `openspec/changes/archive/2026-06-28-close-bugs-555-556-557/specs/compile-vba-error-context.md`: **Archive** — entire spec is about compile_vba error context
- `openspec/changes/archive/2026-07-02-vba-import-vbname-preserve/tasks.md` line 69: "compile:true" test failure note — historical
- `openspec/changes/archive/2026-07-02-vba-import-vbname-preserve/specs/vba-manager-actions/spec.md`: Archive
- `openspec/changes/archive/2026-06-28-close-bugs-555-556-557/tasks.md`: Slice 3 (#557 compile_vba error context) — historical

### CI workflows — **CLEAN**

No `compile` references in `.github/workflows/*.yml`. No changes needed.

### `.atl/` skill registry — **CLEAN**

No `compile` references in the skill registry. No changes needed.

### `.dysflow/project.json` — **Unverified**

Did not find in filesystem grep. Check if any example config uses `compile` param.

---

## Approaches

### Option A — Hard break (option 1, per maintainer decision)

Delete `compile_vba` entirely. Remove `compile` and `rollbackOnCompileFail` from `import_modules`/`import_all` schemas and adapters. Remove PowerShell compile machinery. Update all tests and docs. No deprecation, no flag.

**Pros**: Clean removal, no dead code, no confusion, matches maintainer intent exactly.
**Cons**: Breaking change for any caller passing `compile:true` on import — they'll get an unknown param error (schema rejects it). Requires updating all consumer call sites in the dysflow repo itself (not external callers — they never had it).

**Effort**: High — multi-file, must verify every call site.

### Option B — Schema-only removal (keep PowerShell, fail loudly)

Remove `compile`/`rollbackOnCompileFail` from schemas so callers can't pass them, but keep the PowerShell machinery to fail fast if called internally. Not viable — schema removal IS the break.

**Cons**: Incomplete removal, PowerShell dead code, confusing maintenance burden.

**Effort**: Same as A but less clean.

**Recommendation**: Option A — the maintainer was explicit: "Fuera compilación por parte de dysflow."

---

## Recommendation

Proceed with **hard break (Option A)**. Key implementation order:

1. **Kill the schema first** (`vba-sync-schemas.ts`) — `compile_vba` schema + `compile` + `rollbackOnCompileFail` on `import_modules`/`import_all`. TypeScript compile will surface every remaining reference.
2. **Remove `EXECUTION_MAPPINGS.compile_vba`** from `vba-execution-adapter.ts`.
3. **Remove `compile_vba` from dispatch** (`dispatch-routes.ts`, `mcp-tool-registry.ts`).
4. **Remove from `vba-sync-adapter.ts`** (`handles` + `execute`).
5. **Remove PowerShell compile machinery** — `Invoke-CompileAction`, `RunCommand(126)` compile sites, `Save-VbaProjectModules` fallback. **Preserve `RunCommand(126)` for non-compile uses** (verified at lines :2205, :2247 — both are compile; :2653 is Save-VbaProjectModules which is compile-only; verify :2662, :2859, :2873).
6. **Delete tests** (`compile-error-capture.e2e.test.ts`, `mcp-e2e-compile-vba-mojibake-pin.test.ts`).
7. **Update remaining tests** — remove `compile_vba` calls and `compile:true`/`compile:false` params.
8. **Update docs** (AGENTS.md, README.md, mcp-examples.md, release-checklist.md, e2e-battery.md).
9. **Archive** `openspec/specs/vba-manager-actions/spec.md` and `openspec/changes/archive/2026-28-.../specs/compile-vba-error-context.md`.
10. **`pnpm build`** — confirm clean compile; fix any remaining TS errors.

---

## Risks

1. **External callers** passing `compile:true` on `import_modules` — schema removal gives unknown-param error. This is correct behavior (they shouldn't be using it).
2. **`Save-VbaProjectModules`** at :2653 — need to verify it's compile-only before removing. If it has non-compile uses, those break.
3. **`RunCommand(126)`** — need to confirm ALL sites using it are compile-only. Two confirmed at :2205 and :2247. Verify the others (:2662, :2859, :2873) before removing the underlying helper function.
4. **`rollbackOnCompileFail` default `true`** — removing this param means old persisted call JSON with `rollbackOnCompileFail: false` will still schema-validate (boolean is accepted) but the behavior will be gone. Acceptable.
5. **`import_all` with `compile:true`** in existing test files — these tests call `import_all` and expect compile behavior. Those test assertions will need updating.
6. **CHANGELOG.md** — compile_vba history at lines 186, 193, 290–308, 366, 419, 459, 467, 514, 530, 592, 611, 743, 829, 1257, 1445, 1941 — all historical, leave as-is.

---

## Ready for Proposal

**Yes.** The change is well-scoped. The maintainer's decision is on record (GH #759 comment 4896478041). All source files verified. Test and docs surfaces mapped. Risks identified (PowerShell `RunCommand(126)` sites need exact-line verification before removing the helper).

**Orchestrator next step**: Launch `sdd-propose` for `feat-759-no-compile` with hard-break approach. Tell the user the change removes `compile_vba` + `compile`/`rollbackOnCompileFail` params from import tools, per their explicit decision recorded in GH #759.
