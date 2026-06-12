# Proposal: indicator-issues-cleanup

## Intent

Replace the obsolete interpretation of GitHub issue #18 with the clarified requirement: indicator startup MUST use a shared persistent backend cache that stores the rows needed to render and filter indicator buckets for each connected user without live indicator queries on the cache-read path.

## User-clarified #18 scope

- The persistent indicator cache is shared backend state in `NoConformidades_Datos.accdb`.
- `TbConfiguracionBackends`, active backend routing, and sandbox selection remain frontend/local; they MUST NOT move to the shared backend or be reinterpreted as cache configuration.
- Indicator cache configuration and cache data live in backend tables dedicated to this cache.
- The cache is global/shared for all users, not per-user snapshots. Runtime reads filter shared detail rows by connected user/responsible as needed.
- The cache is not counts-only. It MUST store the task/NC/AC/AR/detail rows required to show and filter each bucket for both No Conformidades de Proyecto and No Conformidades de Auditorías.
- No lazy invalidation and no full rebuild on every change: after successful relevant NC/AC/AR/tarea changes, the backend cache MUST be synchronized immediately and incrementally for the affected `IDNoConformidad` only.
- When AC changes, the sync service MUST resolve AC -> parent NC and synchronize only that NC. When AR/task changes, it MUST resolve AR/task -> AC -> NC and synchronize only that NC.
- Full rebuild is allowed only for bootstrap, repair, or global indicator rule/configuration changes that affect all cache rows.
- Form open/runtime indicator loading for both Proyecto and Auditoría flows MUST read from cache tables and avoid live indicator queries when using the cache path.

## Scope

- Plan schema migration/DDL for backend cache header/detail/config tables if the existing schema is insufficient.
- Plan incremental per-NC cache sync service, bootstrap/repair full rebuild service, read/filter API, and immediate sync hooks after successful NC/AC/AR/tarea writes.
- Plan shared backend materialized cache coverage for Proyecto and Auditoría buckets/details.
- Plan strict TDD with schema-first inspection, explicit backend sandbox fixtures, `BeginTestSession`/`m_TestingMode`, no lucky data, Proyecto and Auditoría scenarios, and cross-domain non-regression coverage.
- Use hybrid artifacts: OpenSpec files plus Engram topic keys.
- Keep implementation slices reviewable under the 400 changed-line budget; recommend chained PRs when the forecast exceeds the budget.

## Out of scope

- Moving `TbConfiguracionBackends` or backend routing from frontend/local storage.
- Per-user persistent snapshots as separate cache instances.
- Lazy invalidation or stale-read semantics for this indicator cache.
- Full cache rebuild on every individual NC/AC/AR/tarea mutation.
- Proyecto-only cache design that excludes Auditoría task buckets/details.
- Editing production VBA, importing, compiling, running Access, committing, or pushing during this planning rework.

## Delivery approach

1. Rework SDD/OpenSpec artifacts to reflect the clarified #18 contract.
2. Implement later in phased strict-TDD slices: backend schema, incremental per-NC sync/read API, bootstrap/repair rebuild, immediate sync hooks, runtime integration for both domains, and verification.
3. Gate Access work later through Dysflow import only, then user manual compile in Access VBE before any tests.
