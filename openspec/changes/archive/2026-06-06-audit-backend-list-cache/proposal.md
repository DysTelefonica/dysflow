# Proposal: Audit Backend List Cache

## Intent

Implement GitHub issue #57 by adding the missing shared backend audit list-cache table, `TbCacheListadoNCAuditoria`. Issue #49 only verified helper fallback; it did not provide the positive shared materialized cache path. Without this table, `FormNCAuditoriaGestion` stays slower and cannot use a reusable cache across users.

## Scope

### In Scope
- Create/ensure `TbCacheListadoNCAuditoria` in `NoConformidades_Datos.accdb` / sandbox backends, never in the frontend.
- Add positive audit cache reader behavior behind testable helpers/repositories.
- Add rebuild/invalidation seams for audit NC, AC, and AR changes.
- Add strict schema-first, fixture-first, sandbox-safe tests.
- Keep implementation slices under the 400 changed-line review budget.

### Out of Scope
- Frontend-local cache tables or frontend-only existence checks.
- Guessed schema or blind copy of `TbCacheListadoNC` project fields.
- Broad unrelated form rewrites or moving business/cache logic back into forms.

## Capabilities

### New Capabilities
- `audit-backend-list-cache`: shared backend schema, reader, rebuild/invalidation, fallback, and verification contract for audit list caching.

### Modified Capabilities
- None. Existing project cache specs remain unchanged; this is an audit-specific cache capability.

## Approach

Use a dedicated audit list-cache table mirroring the list-cache pattern, not the detail JSON cache. Preserve audit-specific fields/types (`ID`, `IDAuditoria`, `Numero`, `CAUSARAIZ`, `RESPONSABLEIMPLANTACION`, `RequiereControlEficacia` Text(25), `ControlEficacia` LongText) plus flattened audit AC/AR text for keyword parity. Keep `Form_FormNCAuditoriaGestion.cls` as a thin caller of `NCAuditoriaGestionListadoHelper.bas`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| Backend `NoConformidades_Datos.accdb` | New | Add shared `TbCacheListadoNCAuditoria` schema/index. |
| `src/modules/NCAuditoriaGestionListadoHelper.bas` | Modified | Add positive cache read path and retain fallback telemetry. |
| `src/modules/*Audit*Cache*.bas` or narrow cache helper | New/Modified | Idempotent ensure, rebuild, upsert, invalidation seams. |
| `src/forms/Form_FormNCAuditoriaGestion.cls` | Minimal | Remain thin; no business/cache decisions. |
| `src/modules/Test_NCAuditoriaGestionListadoHelper.bas` | Modified | Add schema-first, fixture-first audit cache tests. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Table created in frontend | Med | Tests assert backend/sandbox existence through backend DB access. |
| Schema/type drift | Med | Use explored audit source schema, not guessed project-cache copy. |
| Search/filter regression | Med | Include flattened AC/AR text and strict parity tests. |
| Oversized PR | Med | Chain slices: schema, reader, rebuild/invalidation, verification. |

## Rollback Plan

Revert VBA helper/repository/test changes and remove or ignore `TbCacheListadoNCAuditoria` through a guarded backend migration. Existing fallback remains the safe runtime path.

## Dependencies

- Exploration artifact `sdd/audit-backend-list-cache/explore` / `exploration.md`.
- Dysflow backend schema inspection; Access import later requires user manual VBE compile.

## Success Criteria

- [ ] Backend/sandbox contains idempotently ensured `TbCacheListadoNCAuditoria` with unique `ID` index.
- [ ] Audit listing uses valid cache rows when available and logs fallback when not.
- [ ] Rebuild/invalidation seams keep audit cache stale state explicit.
- [ ] Tests prove backend location, schema, filters/search, fallback, and fixture discipline.
- [ ] Delivery is split into chained slices under 400 changed lines each.
