## Exploration: Configurable Bearer token authorization in the HTTP adapter (Item P6 from docs/IMPROVEMENTS_PLAN.md)

### Current State
Today, the HTTP server (`src/adapters/http/server.ts`) is started via `dysflow serve` on a local port (default `127.0.0.1:17321`) with no authentication or authorization checks. Although it runs bound to localhost by default, any local process can execute queries (including write queries if `--enable-writes` is active) and run VBA procedures without credentials. There is no configuration option in `DysflowConfig` to define an access control key.

### Affected Areas
- `src/core/config/dysflow-config.ts` — Add optional `httpToken?: string` to `DysflowProjectConfig`, `DysflowConfig`, and `DysflowConfigInput`. Implement redaction in `redactDysflowConfig`.
- `src/adapters/http/server.ts` — Accept `httpToken?: string` in `StartDysflowHttpServerOptions` and check it in `routeRequest` using `Authorization: Bearer <token>`. Return `401 HTTP_UNAUTHORIZED` if invalid or missing when configured.
- `src/cli/commands/serve.ts` — Parse the `--http-token <token>` command-line option, load the config asynchronously via `loadDysflowConfigAsync` to resolve the token fallback, and pass it to `startDysflowHttpServer`.
- `test/adapters/http/server.test.ts` — Add unit tests verifying request authorization with/without correct token, and backwards compatibility (no-op check when token is undefined).
- `test/cli/commands/serve.test.ts` — Add unit tests validating `--http-token` parsing and option forwarding.

### Approaches
1. **Config & CLI Integrated Bearer Token (Recommended)**
   - Add `httpToken` to config schema, support environment variable `DYSFLOW_HTTP_TOKEN`, support the CLI flag `--http-token <token>` on `serve`, and enforce token verification on all HTTP endpoints when configured.
   - Pros:
     - Extremely flexible: supports file-based, env-based, and command-line configurations.
     - Fully backwards compatible: defaults to no-auth if the token is not specified.
     - Protects all endpoints (including diagnostic check and operations list).
   - Cons:
     - If the token is written to `.dysflow/project.json` in a public repository, it could leak (can be mitigated by using the `DYSFLOW_HTTP_TOKEN` environment variable).
   - Effort: Low

2. **Environment/CLI-Only Bearer Token**
   - Do not add `httpToken` to the shared project configuration file types or parsing logic. Only read it from the environment variable `DYSFLOW_HTTP_TOKEN` and `--http-token` flag within the CLI layer.
   - Pros:
     - Avoids adding credentials metadata to the core `DysflowConfig` schemas.
   - Cons:
     - Less unified configuration; users cannot document/provision the token persistently within their project's `.dysflow/project.json` folder if they want to.
   - Effort: Low

### Recommendation
Proceed with **Approach 1**. It matches the specifications in `IMPROVEMENTS_PLAN.md` exactly, maintains consistent configuration loading patterns, and offers maximum configuration flexibility while remaining fully backwards compatible. We will redact the `httpToken` secret in `redactDysflowConfig` to avoid leaking it in diagnostics.

### Risks
- **Secret Leakage in Git**: Users might accidentally commit their `httpToken` in `.dysflow/project.json`. We should warn users or document that `DYSFLOW_HTTP_TOKEN` environment variable is preferred for production environments.
- **Client Integration Overhead**: Clients using the HTTP API must now support sending `Authorization: Bearer <token>` headers if a token is configured.

### Ready for Proposal
Yes — the topic is fully explored, the path of implementation is clear and small (well under the 400 lines PR budget), and it is ready to move to the Proposal phase.
