# Indicator Cache Specification

## Purpose

This specification defines the shared backend indicator cache required to render and filter Proyecto and Auditoria indicator buckets without live indicator queries on the cache-read path.

## Requirements

### Requirement: Shared Backend Cache Ownership

The system MUST store indicator cache configuration, headers, and detail rows in dedicated shared backend tables. Frontend-local backend routing, including `TbConfiguracionBackends`, active backend selection, and sandbox selection, MUST remain frontend-local and MUST NOT be reinterpreted as cache configuration.

#### Scenario: Backend cache is shared

- GIVEN two users connect to the same backend
- WHEN indicator cache rows exist for Proyecto and Auditoria work
- THEN both users MUST read from the same backend cache dataset

#### Scenario: Routing remains local

- GIVEN frontend-local backend routing is configured
- WHEN indicator cache tables are created or read
- THEN routing tables and sandbox selection MUST remain frontend-local

### Requirement: Detail-Complete Domain Coverage

The cache MUST contain the NC, AC, AR, task, bucket, responsible, status, date, and display/detail fields needed to render and filter both Proyecto and Auditoria indicator buckets. The cache MUST NOT be counts-only.

#### Scenario: Proyecto detail rows are renderable

- GIVEN cached Proyecto indicator rows exist
- WHEN the Proyecto indicator detail view is opened
- THEN the view MUST render required bucket and detail fields from cache rows

#### Scenario: Auditoria detail rows are renderable

- GIVEN cached Auditoria indicator rows exist
- WHEN the Auditoria indicator detail view is opened
- THEN the view MUST render required bucket and detail fields from cache rows

### Requirement: Immediate Incremental Synchronization

After a successful relevant NC, AC, AR, or task write, the system MUST synchronize cache rows immediately and incrementally for only the affected `IDNoConformidad`. The system MUST resolve AC to NC and AR/task to AC to NC before synchronization.

#### Scenario: NC write refreshes one NC

- GIVEN cached rows exist for two NC records
- WHEN one NC is successfully changed
- THEN only that NC cache scope MUST be refreshed
- AND unrelated NC cache rows MUST remain unchanged

#### Scenario: Child write resolves parent NC

- GIVEN an AR or task belongs to an AC that belongs to an NC
- WHEN that AR or task is successfully changed
- THEN synchronization MUST target only the resolved parent NC

### Requirement: Controlled Full Rebuild

The system MAY run a full cache rebuild only for bootstrap, repair, or global indicator rule/configuration changes. It MUST NOT run a full rebuild for each individual NC, AC, AR, or task mutation.

#### Scenario: Repair rebuilds all rows

- GIVEN cache repair is explicitly requested
- WHEN the full rebuild operation runs
- THEN cache rows for both Proyecto and Auditoria MUST be rebuilt

#### Scenario: Individual mutation avoids full rebuild

- GIVEN a single task mutation succeeds
- WHEN cache synchronization runs
- THEN the system MUST NOT rebuild unrelated NC cache scopes

### Requirement: Runtime Cached Reads and Filtering

Form-open and indicator filtering paths for Proyecto and Auditoria MUST read bucket counts and detail rows from backend cache tables on the cache path. Runtime reads MUST filter shared rows by connected user, responsible, and domain without live indicator queries.

#### Scenario: Connected user sees filtered rows

- GIVEN shared cache rows exist for two responsibles
- WHEN one responsible opens an indicator bucket
- THEN only rows visible to that connected user MUST be returned

#### Scenario: Cache path avoids live queries

- GIVEN the cache path is enabled and cache rows are current
- WHEN a Proyecto or Auditoria indicator form opens
- THEN bucket counts and detail rows MUST be loaded from cache tables
