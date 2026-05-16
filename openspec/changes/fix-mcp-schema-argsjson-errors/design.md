# Design: Harden MCP schema validation and legacy argsJson errors

## Overview

Issue #93 is an adapter-boundary hardening change. The current MCP adapter validates only top-level primitive types, and `run_vba.argsJson` is parsed with raw `JSON.parse`. Invalid JSON can therefore escape the tool handler as an exception and be translated by `JsonLineMcpStdioRuntime` into a JSON-RPC internal error. The desired behavior is a normal MCP tool result with `isError: true` and an `MCP_INPUT_INVALID` message.

## Architecture Approach

### Boundary rule

All changes stay in `src/adapters/mcp/tools.ts`. The adapter remains responsible for validating protocol input and translating invalid input into MCP tool results. Core services receive only validated/mapped protocol-neutral requests.

```text
MCP client
  -> JsonLineMcpStdioRuntime tools/call
  -> createDysflowMcpTools handler
  -> adapter validation / legacy argsJson parsing
  -> core service only after valid input
```

### Validator scope

Enhance the existing `validateInput(input, schema)` implementation into a small recursive validator for the local schema subset:

- object root must be a record;
- `required` checks remain at object level;
- `additionalProperties: false` rejects undeclared keys;
- primitive type checks remain for `string`, `boolean`, `number`, `array`, `object`;
- arrays with `items` validate each element;
- objects with `properties` validate declared child fields and reject child extras when `additionalProperties: false` is declared on that property;
- error messages include a dotted/bracketed path such as `spec.controls[0].name must be a string.`.

This is not a general-purpose JSON Schema engine; it only implements fields represented by the local `JsonSchemaProperty` / `JsonObjectSchema` types.

### Safe legacy argsJson parsing

Replace the raw `parseLegacyArgsJson(argsJson): unknown[]` usage with a safe result shape, for example:

```ts
type ParseLegacyArgsJsonResult =
  | { ok: true; args: unknown[] }
  | { ok: false; message: string };
```

Behavior:

- `undefined`, empty, or whitespace-only `argsJson` => `{ ok: true, args: [] }`.
- valid JSON array => same array.
- valid non-array JSON => wrapped as `[parsed]` to preserve compatibility.
- invalid JSON => `{ ok: false, message: "argsJson must be valid JSON." }` (optionally append parser detail if stable enough).

The `run_vba` handler checks this result after schema validation and before calling `vbaService.execute`; invalid parse returns `invalidInput(message)`.

## Detailed Test Strategy

### RED tests first

Add tests before implementation and run `pnpm test` to capture RED evidence.

1. `test/adapters/mcp/tools.test.ts`
   - malformed `run_vba.argsJson` returns `MCP_INPUT_INVALID`, `isError: true`, and leaves `FakeVbaService.requests` empty.
   - valid `run_vba.argsJson` array still maps to `arguments: [1, 2]`.
   - valid non-array `run_vba.argsJson` still maps to `arguments: [{...}]` or `[value]`.
   - nested object schema rejects invalid child types. A practical target is `validate_form_spec` with `spec.controls[0].name` not a string after tightening the `spec` schema, or an exported test-only schema through a helper if production schemas are not expanded.
   - array schema rejects invalid item types where `items` is declared.

2. `test/adapters/mcp/stdio.test.ts` (optional but recommended)
   - register a `run_vba`-like tool from `createDysflowMcpTools`, call it via JSON-RPC `tools/call` with malformed `argsJson`, and assert the response is a JSON-RPC success result containing `{ isError: true }`, not an `error.code: -32603` response.

### GREEN implementation

Implement the smallest adapter-only changes to satisfy the tests. Do not change core service contracts.

### Verification

Run:

```bash
pnpm test
pnpm build
```

The full test run includes architecture tests that preserve core/adapters dependency direction and forbid old workflow skill runtime dependencies.

## Decisions

### Decision 1: Adapter-only fix

Keep validation in `src/adapters/mcp/tools.ts`; do not introduce MCP validation into core. This preserves adapter/core dependency direction.

### Decision 2: Result-returning parser over throw/catch in handler

Make `argsJson` parsing non-throwing so handler control flow makes the invalid-input path explicit and testable.

### Decision 3: Local schema subset only

Avoid adding a dependency on a JSON Schema library for this small hardening PR. The current project has no validation dependency, and adding one would increase review surface for issue #93.

## Compatibility

- Existing valid legacy `run_vba` calls remain compatible.
- Existing valid tool payloads remain accepted.
- Invalid payloads fail earlier and more predictably as MCP tool errors.

## Review Workload Forecast

| Field                   | Value                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Estimated changed lines | 80-180                                                                                     |
| 400-line budget risk    | Low                                                                                        |
| Chained PRs recommended | No                                                                                         |
| Suggested split         | Single PR for issue #93                                                                    |
| Main reviewer focus     | Validator recursion, error path does not call services, no dependency direction regression |
