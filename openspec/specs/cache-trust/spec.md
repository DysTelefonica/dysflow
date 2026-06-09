# Cache Trust Specification

## Purpose

Define the behavior for GitHub issue #39: when `TbCacheNCProyecto` provides a valid cache hit, NC Proyecto read/open paths MUST trust hydrated in-memory data, and corrupt/incomplete cache data MUST be handled as explicit miss/invalidation.

## Requirements

### Requirement: Trusted cache-hit in-memory graph (#39)

The system MUST treat a valid `TbCacheNCProyecto` hit as a fully in-memory source for NC Proyecto read/open behavior. For cache-hit paths, the system SHALL use hydrated `NCProyecto`, `ACProyecto`, `ARProyecto`, risks, and replanifications without hidden DAO reconstruction.

#### Scenario: Valid cache hit opens without DAO fallback

- GIVEN a cache row with all required NC/AC/AR/risk/replanification sections
- WHEN an NC Proyecto is opened through the cache-enabled read path
- THEN the returned object graph is hydrated and read-ready from memory
- AND DAO-backed constructor helpers are not used on that cache-hit path

#### Scenario: State reads on cache-hit graph

- GIVEN a hydrated cache-hit object graph containing ACs with mixed AR states
- WHEN calculated-state and read-only status properties are evaluated
- THEN results are resolved from the in-memory graph
- AND behavior remains consistent with defined business state semantics

### Requirement: Explicit miss and invalidation for corrupt cache (#39)

The system MUST detect incomplete, unparseable, or structurally inconsistent cache payloads and SHALL convert them into explicit miss/invalidation outcomes. The system MUST NOT silently continue as if the cache-hit payload were valid.

#### Scenario: Incomplete cache payload

- GIVEN a cache row missing one or more required JSON sections
- WHEN cache hydration is attempted
- THEN hydration returns an explicit miss/invalidation outcome
- AND the invalid payload is not trusted as a cache hit

#### Scenario: Corrupt cache payload

- GIVEN a cache row with malformed JSON or broken parent-child linkage
- WHEN cache hydration is attempted
- THEN hydration returns an explicit miss/invalidation outcome
- AND no partial in-memory graph is exposed as valid

### Requirement: Loaded-empty collections are first-class

For cache-hit objects, the system MUST distinguish “loaded empty” from “not loaded” for AC, AR, risk, and replanification collections. Empty-but-loaded collections SHALL remain authoritative and MUST NOT trigger implicit DAO reads.

#### Scenario: Empty AC collection remains authoritative

- GIVEN a valid cache-hit NC with an explicitly empty AC collection
- WHEN read paths evaluate AC-dependent properties
- THEN the collection is treated as loaded-empty
- AND no DAO fallback is triggered solely because it is empty

#### Scenario: Empty risks stay loaded-empty

- GIVEN a valid cache-hit NC with an explicitly empty risks set
- WHEN risk-code/read properties are evaluated
- THEN results are produced from the loaded-empty risk set
- AND no hidden risk lookup is executed through DAO helpers

### Requirement: Cache-first UI list and selection reads

UI read paths for NC Proyecto actions/opening SHOULD consume hydrated cached collections directly and SHOULD keep deterministic ordering for list rendering. On valid cache hits, list and selection reads MUST NOT require rehydration via constructor DAO paths.

#### Scenario: List population on cache hit

- GIVEN a valid cache-hit NC with hydrated AC/AR collections
- WHEN the actions UI populates AC/AR lists
- THEN list data is sourced from cached in-memory collections
- AND ordering is deterministic for repeat renders

#### Scenario: Selection read on cache hit

- GIVEN a user selects an AC or AR from a cache-populated list
- WHEN detail read paths resolve the selected item
- THEN the selected in-memory object is reused
- AND constructor DAO rebuild is not required for that selection

### Requirement: Strict TDD verification contract for #39

Verification for this capability MUST follow strict Access/VBA TDD discipline: schema-first inspection, fixture-first sandbox seeding, deterministic identifiers, strong value/cardinality assertions, and defensive teardown. Tests MUST NOT depend on pre-existing records.

#### Scenario: Object-level cache trust tests

- GIVEN object-level tests that validate cache-hit read semantics
- WHEN tests execute without backend dependency
- THEN they assert in-memory behavior and explicit miss/invalidation outcomes
- AND they do not rely on accidental environment data

#### Scenario: Data-touching cache regression tests

- GIVEN sandbox E2E tests for cache-hit and corrupt-cache paths
- WHEN fixtures are seeded from inspected schema and executed
- THEN tests assert concrete values/cardinality and cleanup in reverse FK order
- AND tests fail if they only pass through pre-existing data luck
