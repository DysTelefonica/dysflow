Closes #1044.

## What

`run_vba` rejects context aliases that resolve to the exact same Windows paths. It reports the legacy text `PROJECT_CONFIG_NOT_WRITE_READY` instead of a structured typed error.

Concrete repro:
- `accessPath` = `C:/00repos/codigo/00_EXPEDIENTES/Expedientes.accdb`
- `backendPath` = `C:/00repos/datos/Expedientes_datos.accdb`
- `expectedAccessPath` = same as `accessPath`
- `expectedProjectRoot` = same as `projectRoot`

The legitimate `run_vba` call that names both `accessPath` AND `backendPath` was rejected as `Conflicting Access target aliases were supplied.` even when both resolved to their respective configured files.

## Why

`src/adapters/config/project-config-diagnostic.ts:349-358` lumped `backendPath` into the same alias equivalence set as the frontend Access aliases (`accessPath`, `accessDbPath`, `databasePath`, `sourcePath`). `backendPath` is the data backend file (legitimately a different file from the frontend), but the alias comparison used the same equivalence class — tripping `targets.size > 1` and returning the generic conflict error.

## Fix

Three minimal, paired changes:
- **`project-config-diagnostic.ts`** — remove `backendPath` from the frontend alias set; route it through `requestedTarget` validation only when no frontend alias was supplied; pin a `request.backendPath` override to the configured `backendPath` (mismatch still fails closed with `OUTSIDE_PROJECT_ROOT`).
- **`dispatch-common.ts`** — add `CONFLICTING_TARGET_ALIASES` constant, register it in `writeGateCodes` so `resolveWriteGateErrorCode` returns it instead of the `PROJECT_CONFIG_NOT_WRITE_READY` fallback. Legacy `[legacy: PROJECT_CONFIG_NOT_WRITE_READY]` substring preserved in `error.message` for #962 backward compat.
- **`explain-builder.ts`** — add `#1044` to `RELATED_ISSUE_NUMBERS` for the new code.

## Tests (4 RED → GREEN)

1. **Equivalent aliases normalize and pass** — `/` vs `\\`, case, `.`/`..`, trailing separators differences resolve to the same path.
2. **True frontend conflict still fails closed** — genuinely different resolved paths return `status: "ambiguous"`.
3. **Structured `CONFLICTING_TARGET_ALIASES` envelope** — `error.code` is now `CONFLICTING_TARGET_ALIASES`, legacy substring preserved, `ok:false`, `diagnostics[0].code` matches.
4. **No-regression: `accessPath` + `backendPath` together** — the original issue repro now returns `status: "valid"`.

## Acceptance

- 4 tests RED → GREEN (`test/adapters/config/project-config-target-aliases.test.ts`).
- `pnpm test` regression: 4153 pass, 4 pre-existing docs-drift failures unrelated to this fix.
- `references/error-codes.md` documents `CONFLICTING_TARGET_ALIASES`.
- No regression of #1040 (FORM_VBNAME_PREFIX_MISMATCH), #1037 (writeExecutionPolicy), #962 / #970 (write-readiness taxonomy).
- No `compile_vba` called. No production `.accdb` mutated. Conventional commit (no AI attribution).
