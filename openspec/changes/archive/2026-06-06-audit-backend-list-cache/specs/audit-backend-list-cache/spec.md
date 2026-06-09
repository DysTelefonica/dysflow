# audit-backend-list-cache Specification

## Purpose

Define the shared backend audit list-cache contract for `FormNCAuditoriaGestion`, including schema location, positive cache reads, explicit fallback, keyword parity, form/helper boundaries, and fixture-first verification.

## Requirements

### Requirement: Shared backend audit list-cache table

The system MUST ensure `TbCacheListadoNCAuditoria` exists in the shared backend `NoConformidades_Datos.accdb` or sandbox backend, and MUST NOT create or rely on the table in the frontend `NoConformidades.accdb`.

#### Scenario: Backend table exists

- GIVEN a configured backend or sandbox backend
- WHEN audit cache readiness is ensured
- THEN `TbCacheListadoNCAuditoria` exists in that backend
- AND the frontend does not satisfy the requirement by holding a local table.

#### Scenario: Readiness is idempotent

- GIVEN the backend table already exists with the required contract
- WHEN readiness is ensured again
- THEN the operation succeeds without destructive table recreation.

### Requirement: Audit-specific list-cache schema

The cache schema MUST follow the `TbCacheListadoNC` list-cache pattern while using audit-specific fields and source-compatible types.

#### Scenario: Required audit fields are present

- GIVEN `TbCacheListadoNCAuditoria` exists
- WHEN its schema is inspected
- THEN it includes `ID`, `IDAuditoria`, `Numero`, `Descripcion`, `CAUSARAIZ`, `RESPONSABLEIMPLANTACION`, `Estado`, `FechaApertura`, `FECHACIERRE`, `RequiereControlEficacia`, `ControlEficacia`, `Borrado`, `AccionesCorrectivasConcatenadas`, `AccionesRealizadasConcatenadas`, `FechaCache`, `CacheValida`, and `Version`.

#### Scenario: Audit divergences are preserved

- GIVEN the cache schema is inspected
- WHEN field types are compared with audit sources
- THEN `RequiereControlEficacia` supports Text(25)
- AND `ControlEficacia` supports LongText.

### Requirement: Positive audit cache reader

`NCAuditoriaGestionListadoHelper` MUST return materialized audit list rows from `TbCacheListadoNCAuditoria` when cache usage is enabled and valid rows match the requested filters.

#### Scenario: Valid cache hit

- GIVEN valid cache rows exist for the requested audit filters
- WHEN the helper builds the audit list
- THEN it returns rows from the cache path
- AND each row preserves the current list contract.

### Requirement: Explicit observable fallback

The helper MUST keep fallback behavior explicit and observable when the table is missing, cache is disabled, rows are invalid, or cache reading fails safely.

#### Scenario: Cache unavailable

- GIVEN cache usage is disabled or no valid cache rows are available
- WHEN the helper builds the audit list
- THEN it uses the existing non-cache path
- AND records observable fallback telemetry.

### Requirement: Audit keyword search parity

Cache-backed keyword search MUST match non-cache audit search semantics, including audit NC text plus flattened AC and AR child text.

#### Scenario: Search matches child action text

- GIVEN valid cache rows include flattened AC and AR text
- WHEN the keyword matches only `AccionesCorrectivasConcatenadas` or `AccionesRealizadasConcatenadas`
- THEN the cache-backed list includes the same audit NC as the non-cache path.

### Requirement: Form remains a UI adapter

`Form_FormNCAuditoriaGestion` MUST remain a thin UI adapter and MUST NOT own business, cache, schema, rebuild, or fallback decisions.

#### Scenario: Form delegates cache decisions

- GIVEN the form requests audit list data
- WHEN cache behavior is needed
- THEN cache decisions are handled by `NCAuditoriaGestionListadoHelper` or dedicated modules
- AND the form only passes UI criteria and renders results.

### Requirement: Strict fixture-first verification

Tests for this capability MUST be schema-first, fixture-first, deterministic, and sandbox-safe.

#### Scenario: Deterministic audit fixture graph

- GIVEN a test covers data-backed cache behavior
- WHEN arranging data
- THEN it seeds sandbox rows in FK order: `TbAuditorias`, `TbNoConformidadesAuditoria`, audit AC, audit AR, then cache rows
- AND teardown removes only deterministic test markers in reverse order.

#### Scenario: No lucky-data assertions

- GIVEN cache behavior is verified
- WHEN assertions are evaluated
- THEN tests prove concrete seeded values, cardinality, backend location, schema, fallback, and search parity without relying on pre-existing rows.
