# Delta Spec: Core Utils Extraction

**Change**: core-utils-extraction
**Type**: Structural refactor — no observable behavior changes
**Closes**: #64

---

## ADDED Requirements

### Requirement: Shared Utils Module

`src/core/utils/index.ts` MUST exist and MUST export exactly these six named symbols:

| Symbol | Signature | Contract |
|--------|-----------|----------|
| `REDACTED_SECRET` | `string` | Sentinel constant used as the redaction replacement value |
| `isRecord` | `(value: unknown) => value is Record<string, unknown>` | Type guard; returns true iff value is a non-null plain object |
| `stringValue` | `(value: unknown) => string \| undefined` | Trims the value; returns undefined if blank or non-string |
| `sanitizeSecrets` | `(value: string, secrets: readonly string[]) => string` | Replaces each non-empty secret in value with REDACTED_SECRET |
| `readJsonFileSync` | `<T>(path: string) => T` | Reads and JSON-parses a file synchronously; throws on missing/invalid file |
| `readJsonFileAsync` | `<T>(path: string) => Promise<T>` | Reads and JSON-parses a file asynchronously; rejects on missing/invalid file |

#### Scenario: All six symbols are importable from the module

- GIVEN `src/core/utils/index.ts` has been created
- WHEN a consumer does `import { REDACTED_SECRET, isRecord, stringValue, sanitizeSecrets, readJsonFileSync, readJsonFileAsync } from ".../core/utils/index.js"`
- THEN all six names resolve without type errors and the module compiles under `tsc --noEmit`

#### Scenario: isRecord rejects null and primitives

- GIVEN `isRecord` is called with `null`, a number, a string, or an array
- WHEN the type guard is evaluated
- THEN it returns `false` for all those inputs

#### Scenario: isRecord accepts plain objects

- GIVEN `isRecord` is called with `{ key: "value" }`
- WHEN the type guard is evaluated
- THEN it returns `true` and the TypeScript type narrows to `Record<string, unknown>`

#### Scenario: stringValue returns undefined for blank or non-string input

- GIVEN `stringValue` is called with `""`, `"   "`, `undefined`, `null`, or a number
- WHEN the function is evaluated
- THEN it returns `undefined`

#### Scenario: stringValue trims and returns non-blank strings

- GIVEN `stringValue` is called with `"  hello  "`
- WHEN the function is evaluated
- THEN it returns `"hello"`

#### Scenario: sanitizeSecrets replaces non-empty secrets

- GIVEN `secrets = ["tok123", "pass"]` and `value = "Bearer tok123 pass"`
- WHEN `sanitizeSecrets(value, secrets)` is called
- THEN the result is `"Bearer <REDACTED> <REDACTED>"` (where `<REDACTED>` is `REDACTED_SECRET`)

#### Scenario: sanitizeSecrets skips empty-string secrets

- GIVEN `secrets = ["", "tok123"]` and `value = "Bearer tok123"`
- WHEN `sanitizeSecrets(value, secrets)` is called
- THEN only `"tok123"` is replaced; the empty string is ignored and does not cause errors

#### Scenario: readJsonFileSync parses a valid JSON file

- GIVEN a file at `path` contains valid JSON `{"key":"val"}`
- WHEN `readJsonFileSync<{key: string}>(path)` is called
- THEN it returns `{ key: "val" }` synchronously

#### Scenario: readJsonFileAsync parses a valid JSON file

- GIVEN a file at `path` contains valid JSON `{"key":"val"}`
- WHEN `await readJsonFileAsync<{key: string}>(path)` is called
- THEN the promise resolves with `{ key: "val" }`

---

### Requirement: No Duplicate Definitions in src/core

After the change is applied, no file under `src/core/**` MAY contain a local definition of `REDACTED_SECRET`, `isRecord`, `stringValue`, or `readJsonFile*`. All such definitions MUST be replaced with imports from `src/core/utils/index.js`.

#### Scenario: Duplicate detection at source level

- GIVEN the change has been applied
- WHEN the files `dysflow-config.ts`, `access-runner.ts`, `vba-sync-legacy-service.ts`, `tools.ts`, and `stdio.ts` are inspected for local `const REDACTED_SECRET`, `function isRecord`, `function stringValue`, `function readJsonFile`
- THEN none of those definitions are found in those files

---

### Requirement: sanitizePowerShellOutput Back-Compat Shim

`sanitizePowerShellOutput` MUST remain importable from `src/core/runner/access-runner.ts`. It MAY be implemented as a thin wrapper over `sanitizeSecrets` or as a re-export, but the symbol MUST be resolvable at that path for test-import compatibility.

#### Scenario: Existing test import resolves

- GIVEN existing tests import `{ sanitizePowerShellOutput }` from `"...access-runner.js"`
- WHEN `pnpm test` is run after the change
- THEN the import resolves without error and the test suite passes

#### Scenario: Functional parity with original

- GIVEN `sanitizePowerShellOutput(value, secrets)` is called with a non-empty secret present in value
- WHEN the function executes
- THEN the secret is replaced with `REDACTED_SECRET` (same behavior as before)

---

### Requirement: Architecture Boundary Preserved

`src/core/utils/index.ts` MUST NOT import from `src/adapters/mcp/`, `src/adapters/http/`, `@modelcontextprotocol/*`, `express`, `fastify`, `hono`, or `node:http`.

#### Scenario: Boundary test continues to pass

- GIVEN the change has been applied
- WHEN `pnpm test` runs `test/architecture/core-boundary.test.ts`
- THEN the test passes with zero violations

#### Scenario: Adapters may import from core/utils (direction is legal)

- GIVEN `src/adapters/mcp/tools.ts` imports `isRecord` from `src/core/utils/index.js`
- WHEN `pnpm test` and `pnpm build` are run
- THEN both succeed — this import direction (adapter → core) is legal per the architecture

---

### Requirement: Unit Tests for All Six Exports

A file `test/core/utils/utils.test.ts` MUST exist and MUST contain at least one test for each of the six exported symbols: `REDACTED_SECRET`, `isRecord`, `stringValue`, `sanitizeSecrets`, `readJsonFileSync`, `readJsonFileAsync`.

#### Scenario: Test file is discovered and passes

- GIVEN `test/core/utils/utils.test.ts` exists with coverage of all six symbols
- WHEN `pnpm test` is run
- THEN Vitest discovers and executes the file; all tests pass

#### Scenario: Edge cases are covered

- GIVEN the test file is inspected
- THEN it includes at least one test for a blank-string input to `stringValue`, at least one for an empty-secret in `sanitizeSecrets`, at least one for `isRecord(null)`, and at least one for file-read success for each of `readJsonFileSync` and `readJsonFileAsync`

---

## MODIFIED Requirements

None. This change introduces no modifications to existing spec-level behavior. All externally observable contracts (configuration loading, secret redaction, JSON parsing, adapter tool parsing) remain identical after the refactor.

---

## REMOVED Requirements

None.
