# Optional Config Semantics

Dysflow intentionally does not enable TypeScript `exactOptionalPropertyTypes`.

Runtime inputs come from CLI flags, JSON, MCP payloads, HTTP bodies, environment variables, and project
configuration files. At those boundaries the project treats `{ field: undefined }` the same as an
absent `field`; callers should check the value (`config.field !== undefined`) rather than the
property's presence.

`exactOptionalPropertyTypes` would make TypeScript assignment stricter, but it would not protect the
runtime boundary where parsed objects can still carry explicit `undefined` values. The repo therefore
uses a lint-time static guard instead:

```bash
node scripts/check-optional-presence-guards.mjs
```

The guard runs as part of `pnpm lint` and rejects these presence checks on config/params-like subjects
under `src/**`:

- `"field" in config`
- `Object.hasOwn(params, "field")`
- `Object.prototype.hasOwnProperty.call(options, "field")`
- `config.hasOwnProperty("field")`

Use value semantics instead:

```ts
if (config.timeoutMs !== undefined) {
  // Treats absent and explicit undefined identically.
}
```

Narrow exceptions are allowed only when code must intentionally distinguish absent from explicit
`undefined`, such as a serialization-boundary test. Put the exception immediately above the relevant
line with the reason after `allow`:

```ts
// optional-presence-guard: allow required for serialization boundary tests.
Object.hasOwn(config, "timeoutMs");
```

Do not use this exception for normal config, params, options, args, payload, request, or input parsing.
