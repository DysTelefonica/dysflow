# Dysflow Local HTTP API

The HTTP adapter is a local-first wrapper over Dysflow core services. It uses Node's built-in `node:http` server to keep the first adapter dependency-free.

Default bind: `127.0.0.1:17321`

Writes are disabled by default. Start with `--enable-writes` only for scripts that intentionally run write SQL, VBA procedures, or `force: true` Access cleanup. Non-force cleanup remains allowed while writes are disabled so failed or terminal Dysflow-owned operations can be recovered safely.

```powershell
dysflow serve --host 127.0.0.1 --port 17321
```

## Authentication

By default the server has no authentication. To require a Bearer token, use the env-first `httpTokenEnv` path in `.dysflow/project.json` and set `DYSFLOW_HTTP_TOKEN` in the runtime environment:

```json
{
  "httpTokenEnv": "DYSFLOW_HTTP_TOKEN"
}
```

`httpTokenEnv` is preferred because the secret stays outside the repository. If both `httpTokenEnv` and inline `httpToken` are configured, the env var value takes precedence. The inline `httpToken` is local-only for uncommitted scratch configs and must not be committed.

When configured, every request must include the header:

```
Authorization: Bearer your-secret-token
```

Missing or incorrect token — response `401`:

```json
{
  "ok": false,
  "error": {
    "code": "HTTP_UNAUTHORIZED",
    "message": "Unauthorized",
    "retryable": false
  }
}
```

When neither `httpTokenEnv` nor `httpToken` resolves a token, all requests pass through without authentication (backwards-compatible default).

## Routes

### GET /health

Response `200`:

```json
{ "ok": true, "service": "dysflow", "writesEnabled": false }
```

### GET /diagnostics

Runs core diagnostics with environment checks enabled.

Response `200`:

```json
{
  "ok": true,
  "data": { "checks": [{ "name": "access-db-path", "ok": true, "message": "configured" }] },
  "diagnostics": [],
  "durationMs": 3
}
```

### POST /query/read

Request:

```json
{ "sql": "SELECT id, name FROM People" }
```

The adapter calls the core query service as `{ "mode": "read" }`.

### POST /query/write

Request:

```json
{ "sql": "UPDATE People SET name = 'Ada' WHERE id = 1" }
```

When writes are disabled, response `403`:

```json
{
  "ok": false,
  "error": {
    "code": "HTTP_WRITES_DISABLED",
    "message": "Write routes are disabled. Start dysflow serve with --enable-writes to allow them.",
    "retryable": false
  },
  "diagnostics": [],
  "durationMs": 0
}
```

When writes are enabled, the adapter calls the core query service as `{ "mode": "write" }`.

### POST /vba/execute

Request:

```json
{
  "moduleName": "Automation",
  "procedureName": "Refresh",
  "arguments": [2026]
}
```

This is treated as a write route and is blocked unless the server was started with `--enable-writes`.

When `allowedProcedures` is configured in `.dysflow/project.json`, procedures not in the list are rejected — response `403`:

```json
{
  "ok": false,
  "error": {
    "code": "HTTP_PROCEDURE_NOT_ALLOWED",
    "message": "Procedure 'Refresh' is not in the configured allowedProcedures list.",
    "retryable": false
  },
  "diagnostics": [],
  "durationMs": 0
}
```

For this `/vba/execute` route, an empty list (`[]`) or absent `allowedProcedures` field means all procedures are allowed. The `/vba/test` route below is stricter and defaults to deny unless the request uses `dryRun:true`.


### POST /vba/test

Runs a `test_vba` plan through the same adapter used by the MCP `test_vba` tool. This is a write route: start the HTTP server with `--enable-writes` before using it.

The HTTP route is inline-plan only: send `proceduresJson`. It does not accept `testsPath` or project/Access target overrides.

Request:

```json
{
  "proceduresJson": "[\"Test_Smoke\"]",
  "dryRun": true
}
```

Security contract:

| Rule | Result |
|------|--------|
| Writes disabled | `403 HTTP_WRITES_DISABLED` |
| No `allowedProcedures` and no `dryRun:true` | `400 MCP_INPUT_INVALID` |
| Procedure not in `allowedProcedures` | `403 PROCEDURE_NOT_ALLOWED` |
| `dryRun:true` with no allowlist | Allowed as an explicit planning escape hatch |
| Target overrides such as `accessPath`, `projectId`, or `testsPath` | `400 HTTP_INVALID_INPUT` |

The endpoint is bound to the server startup project config. It intentionally rejects per-request target and manifest-path overrides so one project's allowlist cannot authorize test execution against another Access database or arbitrary local file path.


### GET /access/operations

Lists recent Dysflow-owned Access operations, including completed, failed, timed out, cleanup pending, and pid unknown records. This is the discovery endpoint AI agents should use after an error or timeout.

### POST /access/cleanup

Request:

```json
{ "operationId": "dysflow-...", "accessPath": "C:/data/app.accdb" }
```

Cleanup is safety-gated. Dysflow refuses to kill Access unless the operation exists, `accessPath` matches exactly, the registered PID still exists, the process start time matches, and the process name is `MSACCESS.EXE`. Never kill `MSACCESS.EXE` by process name from caller scripts; use this endpoint/tool only.

The HTTP cleanup write gate is force-only, matching MCP behavior: requests with `force` absent or `false` may reach the core cleanup eligibility checks while writes are disabled, but `force: true` returns `403 HTTP_WRITES_DISABLED` unless the server was started with `--enable-writes`.

## Script examples

### PowerShell example

```powershell
$base = "http://127.0.0.1:17321"
$headers = @{ Authorization = "Bearer your-secret-token" }

Invoke-RestMethod -Method Get -Uri "$base/health" -Headers $headers
Invoke-RestMethod -Method Post -Uri "$base/query/read" `
  -ContentType "application/json" `
  -Headers $headers `
  -Body (@{ sql = "SELECT id, name FROM People" } | ConvertTo-Json)
```

Omit `-Headers $headers` if no HTTP token is configured.

To enable write routes explicitly:

```powershell
dysflow serve --enable-writes
```

### Node fetch example

```js
const base = "http://127.0.0.1:17321";
const headers = {
  "content-type": "application/json",
  authorization: "Bearer your-secret-token", // omit if no HTTP token is configured
};

const health = await fetch(`${base}/health`, { headers }).then((r) => r.json());
const rows = await fetch(`${base}/query/read`, {
  method: "POST",
  headers,
  body: JSON.stringify({ sql: "SELECT id, name FROM People" }),
}).then((r) => r.json());

console.log({ health, rows });
```
