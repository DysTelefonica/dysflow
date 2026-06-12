# Spec: indicator-issues-cleanup

## Requirement: Shared backend indicator cache (#18)

The system MUST persist indicator cache configuration and cache data in shared backend tables. `TbConfiguracionBackends` and active backend routing MUST remain frontend/local.

### Scenarios

- GIVEN a frontend connected to a backend WHEN issue #18 cache tables are read THEN cache data comes from the shared backend.
- GIVEN local backend routing changes WHEN cache configuration is maintained THEN `TbConfiguracionBackends` remains frontend/local and is not migrated or reinterpreted.

## Requirement: Detail-complete global cache (#18)

The cache MUST be global/shared and MUST store all NC/AC/AR/tarea/detail rows required to render and filter indicator buckets for both No Conformidades de Proyecto and No Conformidades de Auditorías. It MUST NOT be counts-only, Proyecto-only, or per-user snapshot storage.

### Scenarios

- GIVEN multiple users share one backend WHEN the cache is rebuilt THEN one shared cache dataset contains rows for all relevant responsibles.
- GIVEN a connected user opens indicators WHEN the UI needs user buckets THEN the read API filters shared detail rows by connected user/responsible.
- GIVEN a bucket opens details WHEN the cache path is used THEN required task/NC/AC/AR fields are available without live indicator queries.
- GIVEN Proyecto and Auditoría tasks exist in the backend WHEN the cache is synchronized THEN shared cache rows cover both domain buckets and details.
- GIVEN a Proyecto user flow and an Auditoría user flow use indicators WHEN each reads the cache path THEN each flow receives only its applicable domain rows without crossing buckets.

## Requirement: Immediate incremental synchronization (#18)

Relevant NC/AC/AR/tarea mutations MUST synchronize the backend indicator cache immediately after the successful data change and MUST do so incrementally for the affected `IDNoConformidad`. The cache MUST NOT rely on lazy invalidation, stale-read repair, or full rebuilds on every individual mutation.

### Scenarios

- GIVEN a successful NC change WHEN the transaction completes THEN only cache rows related to that `IDNoConformidad` are recalculated/synchronized before returning success.
- GIVEN a successful AC change WHEN the transaction completes THEN the system resolves AC -> parent `IDNoConformidad` and synchronizes only that NC.
- GIVEN a successful AR/task change WHEN the transaction completes THEN the system resolves AR/task -> AC -> parent `IDNoConformidad` and synchronizes only that NC.
- GIVEN bootstrap, repair, or global indicator rule/configuration changes WHEN cache synchronization is requested THEN a full rebuild is allowed and explicitly identified as a global operation.
- GIVEN the data change fails or rolls back WHEN control returns THEN no successful cache sync is claimed.
- GIVEN synchronization fails after a successful mutation WHEN the caller handles the result THEN the failure is surfaced and logged without pretending the cache is current.

## Requirement: Runtime cache-read path (#18)

Runtime form open and indicator refresh for both Proyecto and Auditoría flows MUST read from backend cache tables on the cache path and MUST avoid live indicator queries on a cache hit/path.

### Scenarios

- GIVEN backend cache tables contain current rows WHEN the indicator form opens THEN startup uses cache reads, not constructor/live indicator queries.
- GIVEN Proyecto or Auditoría task indicators are filtered at runtime WHEN the cache path is selected THEN filtering is performed over cached rows and does not execute live source-domain indicator queries.
- GIVEN the cache schema or data is unavailable WHEN the form opens THEN behavior follows an explicit error/fallback contract, not silent stale data.

## Requirement: Strict TDD and non-regression (#18)

Tests MUST be schema-first, fixture-first, sandbox-safe, and JSON-runner compatible. Proyecto and Auditoría scenarios MUST both be covered, including non-regression assertions proving one domain's cache synchronization does not corrupt or hide the other domain's buckets/details.

### Scenarios

- GIVEN a test writes backend cache rows WHEN it arranges data THEN it first inspects real schema and seeds deterministic sandbox rows through `BeginTestSession`/`m_TestingMode`.
- GIVEN cache filtering tests run WHEN assertions execute THEN they verify concrete rows, cardinality, and user/responsible filtering without `SELECT TOP 1` or lucky data.
- GIVEN Proyecto cache behavior changes WHEN Auditoría indicators run THEN Auditoría cached rows and filters remain valid.
- GIVEN Auditoría cache behavior changes WHEN Proyecto indicators run THEN Proyecto cached rows and filters remain valid.
- GIVEN incremental sync tests run WHEN NC, AC, AR, and task mutations are arranged THEN each test proves only the affected NC is refreshed and unrelated NC/domain rows are preserved.
