// Issue #1076 — composition blocks for shared context, target and
// write-intent parameter atoms.
//
// The 90-tool catalog duplicated `projectId`, `contextId`, `accessPath`,
// `backendPath`, `destinationRoot`, `projectRoot`, `strictContext`,
// `expected*`, `dryRun`, `apply`, `diff`, and `outputMode` across most
// tool schemas. The audit
// (`docs/analysis/dysflow-api-homogeneity-audit-2026-07-23.md`) counted
// 84 tools redeclaring `projectId`, 80 `contextId`, 65 `accessPath`, 59
// `backendPath`, 49 `destinationRoot`, 48 `projectRoot`, and 30 tools
// redeclaring the strict-context bundle. The modern tool family
// (`src/adapters/mcp/schemas/dysflow-schemas.ts`) inlined these as
// fresh `JsonSchemaProperty` objects with descriptions that drifted
// from the canonical `SCHEMA_PROPS` text (e.g. "unless explicitly
// overridden" vs. "unless explicitly overridden by a tool that supports
// overrides" vs. "unless explicitly overridden" again).
//
// This file defines eight named blocks, each holding a `===` reference
// to the canonical `SCHEMA_PROPS` value so a single internal definition
// is shared across the whole catalog. Tool-specific schemas compose
// these blocks plus their functional parameters (via
// `composeIdentityAndCorrelation`, `composeAccessAndSourceTargets`,
// `composeFullTargetStack`, `composeStrictContext`, `composeWriteIntent`,
// `composeOutputMode`); the consumer-facing schema never duplicates the
// shared text.
//
// The blocks are kept in a separate file from `schema-props.ts` so the
// pure property atoms stay free of any compose-helper dependency. The
// `CTX_PROPS` / `ACCESS_OVERRIDE` / `STRICT_CTX` short aliases already
// shipped by `schema-props.ts` are preserved for backward compat and
// re-defined in terms of the new blocks so the shared reference is
// single-sourced.

import { SCHEMA_PROPS } from "./schema-props.js";
import type { JsonSchemaProperty } from "./schemas.js";

/** Issue #1076 — `projectId` is the project's identity (it is NOT correlation). */
export const PROJECT_IDENTITY_BLOCK = {
  projectId: SCHEMA_PROPS.projectId,
} as const satisfies Record<string, JsonSchemaProperty>;

/** Issue #1076 — `contextId` correlates a call to an external trace id; it is NOT a duplicate of `projectId`. */
export const OPERATION_CORRELATION_BLOCK = {
  contextId: SCHEMA_PROPS.contextId,
} as const satisfies Record<string, JsonSchemaProperty>;

/** Issue #1076 — Access frontend/backend database path overrides. */
export const ACCESS_TARGET_BLOCK = {
  accessPath: SCHEMA_PROPS.accessPath,
  backendPath: SCHEMA_PROPS.backendPath,
} as const satisfies Record<string, JsonSchemaProperty>;

/** Issue #1076 — database path + its `sourcePath` alias. */
export const DATABASE_TARGET_BLOCK = {
  databasePath: SCHEMA_PROPS.databasePath,
  sourcePath: SCHEMA_PROPS.sourcePath,
} as const satisfies Record<string, JsonSchemaProperty>;

/** Issue #1076 — managed source/project roots (override the .dysflow/project.json defaults). */
export const MANAGED_SOURCE_TARGET_BLOCK = {
  destinationRoot: SCHEMA_PROPS.destinationRoot,
  projectRoot: SCHEMA_PROPS.projectRoot,
} as const satisfies Record<string, JsonSchemaProperty>;

/** Issue #1076 — strict-context guard bundle (abort when resolved target diverges from expected). */
export const STRICT_CONTEXT_BLOCK = {
  strictContext: SCHEMA_PROPS.strictContext,
  expectedAccessPath: SCHEMA_PROPS.expectedAccessPath,
  expectedProjectRoot: SCHEMA_PROPS.expectedProjectRoot,
  expectedDestinationRoot: SCHEMA_PROPS.expectedDestinationRoot,
} as const satisfies Record<string, JsonSchemaProperty>;

/** Issue #1076 — write-intent flags. `apply` is the canonical commit signal; `dryRun` and `diff` are aliases / opt-ins. */
export const WRITE_INTENT_BLOCK = {
  dryRun: SCHEMA_PROPS.dryRun,
  apply: SCHEMA_PROPS.apply,
  diff: SCHEMA_PROPS.diff,
} as const satisfies Record<string, JsonSchemaProperty>;

/** Issue #1076 — large-response output mode selector. */
export const OUTPUT_MODE_BLOCK = {
  outputMode: SCHEMA_PROPS.outputMode,
} as const satisfies Record<string, JsonSchemaProperty>;

/** Compose ProjectIdentity + OperationCorrelation — the common case (most tools use both). */
export const composeIdentityAndCorrelation = (): Record<string, JsonSchemaProperty> => ({
  ...PROJECT_IDENTITY_BLOCK,
  ...OPERATION_CORRELATION_BLOCK,
});

/** Compose AccessTarget + ManagedSourceTarget — binary-only tools that override the access path or the source root. */
export const composeAccessAndSourceTargets = (): Record<string, JsonSchemaProperty> => ({
  ...ACCESS_TARGET_BLOCK,
  ...MANAGED_SOURCE_TARGET_BLOCK,
});

/** Compose AccessTarget + DatabaseTarget + ManagedSourceTarget — tools that touch a database path with the `sourcePath` alias. */
export const composeFullTargetStack = (): Record<string, JsonSchemaProperty> => ({
  ...ACCESS_TARGET_BLOCK,
  ...DATABASE_TARGET_BLOCK,
  ...MANAGED_SOURCE_TARGET_BLOCK,
});

/** Compose the strict-context guard bundle. */
export const composeStrictContext = (): Record<string, JsonSchemaProperty> => ({
  ...STRICT_CONTEXT_BLOCK,
});

/** Compose the write-intent flag bundle. Tools pick which flags to surface; the bundle holds all three. */
export const composeWriteIntent = (): Record<string, JsonSchemaProperty> => ({
  ...WRITE_INTENT_BLOCK,
});

/** Compose the output-mode selector. */
export const composeOutputMode = (): Record<string, JsonSchemaProperty> => ({
  ...OUTPUT_MODE_BLOCK,
});
