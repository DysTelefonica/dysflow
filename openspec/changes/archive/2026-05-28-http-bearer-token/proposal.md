# Proposal: Configurable HTTP Bearer Token Authentication

## Intent

Secure the HTTP API adapter by requiring a configured Bearer token in the `Authorization` request header, preventing unauthorized requests when deployed outside a purely trusted local environment.

## Scope

### In Scope
- Add `httpToken` config property in `DysflowConfig` (loaded via environment, config file, CLI, or explicit options).
- Redact `httpToken` in config logs/redaction functions.
- Add `--token <token>` option to the `serve` CLI command.
- Reject requests with 401 Unauthorized if `httpToken` is configured and the `Authorization: Bearer <token>` header is invalid, incorrect, or missing.
- Integrate unit and integration tests for Bearer token auth in server and serve command.

### Out of Scope
- Multiple tokens or client ID management.
- Dynamic key rotation or OAuth2 validation endpoints.
- HTTPS configuration/SSL termination at the HTTP adapter level (deferred to external reverse proxy).

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `http-api-adapter`: Reject requests with HTTP 401 if `httpToken` is configured and the `Authorization` header is invalid or missing.
- `core-configuration`: Support `httpToken` property (env `DYSFLOW_HTTP_TOKEN`, CLI option, config file, explicit input), ensuring it is redacted in config output.

## Approach

1. **Config Expansion**: Add `httpToken` (and env mapping `DYSFLOW_HTTP_TOKEN`) to `src/core/config/dysflow-config.ts`. Update `redactDysflowConfig` to redact `httpToken`.
2. **Server Enforcement**: In `src/adapters/http/server.ts`, extract the Bearer token from the `Authorization` header and compare it with the configured `httpToken` (passed in options/resolved config). Reject with 401 Unauthorized and JSON error on mismatch.
3. **CLI serve option**: Support `--token <value>` in `src/cli/commands/serve.ts` and map to option `httpToken`.
4. **Testing**: Add tests in `test/adapters/http/server.test.ts` and `test/cli/commands/serve.test.ts` to verify 401 logic, valid requests, CLI flag parsing, config resolution.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/config/dysflow-config.ts` | Modified | Add `httpToken` config property and redact it in `redactDysflowConfig`. |
| `src/adapters/http/server.ts` | Modified | Parse and validate Bearer token; return 401 if token is invalid/missing. |
| `src/cli/commands/serve.ts` | Modified | Support `--token` argument and pass it to server options. |
| `test/adapters/http/server.test.ts` | Modified | Test HTTP requests with correct, incorrect, and missing tokens. |
| `test/cli/commands/serve.test.ts` | Modified | Test `--token` CLI argument parsing. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Credentials leak | Low | Ensure `httpToken` is redacted in the logs via `redactDysflowConfig`. |
| Breaking changes | Low | Bearer authentication is opt-in (only active when `httpToken` is configured). |

## Rollback Plan

If issues arise:
1. Revert changes to source files.
2. Re-run test suites `pnpm test` and build checks.
3. Bearer authentication will be disabled, restoring default open (local) access.

## Dependencies

None

## Success Criteria

- [ ] HTTP server rejects requests with HTTP 401 when `httpToken` is set and `Authorization: Bearer <token>` is missing or incorrect.
- [ ] HTTP server accepts requests with HTTP 200/other standard response when a valid token is provided.
- [ ] CLI command `serve` supports `--token` flag and propagates it.
- [ ] Config files and env variables support mapping the token securely.
