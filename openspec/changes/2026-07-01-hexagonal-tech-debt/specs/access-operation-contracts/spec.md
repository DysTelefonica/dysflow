# Delta for access-operation-contracts

Closed by PR 1 (`[#624/1] #B.2 ELIGIBLE_STATUSES unified membership`). Latent
bug: preflight and cleanup declare divergent `ELIGIBLE_STATUSES` sets today
(preflight has 4 statuses including `pid_unknown`; cleanup has 3 — see
`src/core/operations/access-operation-preflight.ts:50-55` and
`src/core/operations/access-operation-cleanup.ts:50`).

## ADDED Requirements

### Requirement: Canonical ELIGIBLE_STATUSES membership is single-source

`ELIGIBLE_STATUSES` for Access-operation cleanup eligibility MUST be a single
canonical set, exported exactly once from
`src/core/operations/access-operation-status.ts`. Its membership MUST be
`{timed_out, failed, cleanup_pending, pid_unknown}` — the union of historic
preflight and cleanup statuses (preflight's 4-status set is the superset).

Both `src/core/operations/access-operation-preflight.ts` AND
`src/core/operations/access-operation-cleanup.ts` MUST import the constant from
this single module and MUST NOT redeclare a local `ELIGIBLE_STATUSES` array
or `Set`. TypeScript MUST fail compilation if either module declares a local
constant with the same name.

#### Scenario: Both modules resolve the same Set identity

- **GIVEN** `src/core/operations/access-operation-status.ts` exports
  `ELIGIBLE_STATUSES`
- **WHEN** `preflight.ELIGIBLE_STATUSES` and `cleanup.ELIGIBLE_STATUSES` are
  read at runtime
- **THEN** `Object.is(preflight.ELIGIBLE_STATUSES, cleanup.ELIGIBLE_STATUSES)`
  MUST be `true` (strict reference equality)
- **AND** neither module MUST declare a local `const ELIGIBLE_STATUSES` —
  TypeScript MUST fail the build if either file does

#### Scenario: Membership is the canonical union

- **GIVEN** the exported constant
- **WHEN** its membership is enumerated
- **THEN** it MUST contain exactly `timed_out`, `failed`, `cleanup_pending`,
  AND `pid_unknown` — and no other status names

#### Scenario: preflight accepts a `pid_unknown` record (happy path post-fix)

- **GIVEN** a record whose `status === "pid_unknown"` and whose PID is
  unknown to the OS
- **WHEN** `AccessOperationPreflightCleanupService.cleanup(...)` runs
- **THEN** the record MUST be considered eligible for cleanup
- **AND** the service MUST NOT raise `STATUS_NOT_ELIGIBLE` for this record

#### Scenario: cleanup refuses `pid_unknown` with `CLEANUP_PID_UNKNOWN` (sad path)

- **GIVEN** a record whose `status === "pid_unknown"` and whose PID is unknown
- **WHEN** `AccessOperationCleanupService.reconcile(operationId)` runs
- **THEN** it MUST return an error envelope whose
  `error.code === "CLEANUP_PID_UNKNOWN"`
- **AND** it MUST NOT attempt to kill a process (no PID to target)
- **AND** the error message MUST be a stable, structured string an operator
  can recognize

#### Scenario: divergence is closed at the source (adversarial)

- **GIVEN** the bug fix is in place
- **WHEN** a future contributor copies a 3-status list into cleanup "for
  convenience"
- **THEN** the build MUST fail (no local redeclaration allowed) at compile
  time, surfacing the regression before runtime

#### Scenario: existing pre-`pid_unknown` flows still eligible (regression)

- **GIVEN** records whose `status` is `timed_out` or `failed` or
  `cleanup_pending`
- **WHEN** preflight or cleanup runs
- **THEN** both services MUST continue to treat these records as eligible
  (no regression from the membership expansion)

### Test surface

| Test file | New test name | Class of scenario |
|---|---|---|
| `test/core/operations/access-operation-preflight.test.ts` | `imports ELIGIBLE_STATUSES from access-operation-status` | identity |
| `test/core/operations/access-operation-preflight.test.ts` | `accepts a pid_unknown record (was previously eligible only in preflight)` | happy |
| `test/core/operations/access-operation-cleanup.test.ts` | `imports ELIGIBLE_STATUSES from access-operation-status` | identity |
| `test/core/operations/access-operation-cleanup.test.ts` | `pid_unknown returns CLEANUP_PID_UNKNOWN error envelope` | sad |

A new `src/core/operations/access-operation-status.ts` module hosts the
constant. Both tests assert `Object.is(...)` against the imported reference.
