# Dysflow Local HTTP API

The HTTP adapter is a local-first wrapper over Dysflow core services. It uses Node's built-in `node:http` server to keep the first adapter dependency-free.

Default bind: `127.0.0.1:17321`

Writes are disabled by default. Start with `--enable-writes` only for scripts that intentionally run write SQL or VBA procedures.

```powershell
dysflow serve --host 127.0.0.1 --port 17321
```

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


### GET /access/operations

Lists recent Dysflow-owned Access operations, including completed, failed, timed out, cleanup pending, and pid unknown records. This is the discovery endpoint AI agents should use after an error or timeout.

### POST /access/cleanup

Request:

```json
{ "operationId": "dysflow-...", "accessPath": "C:/data/app.accdb" }
```

Cleanup is safety-gated. Dysflow refuses to kill Access unless the operation exists, `accessPath` matches exactly, the registered PID still exists, the process start time matches, and the process name is `MSACCESS.EXE`. Never kill `MSACCESS.EXE` by process name from caller scripts; use this endpoint/tool only.

## Script examples

### PowerShell example

```powershell
$base = "http://127.0.0.1:17321"
Invoke-RestMethod -Method Get -Uri "$base/health"
Invoke-RestMethod -Method Post -Uri "$base/query/read" `
  -ContentType "application/json" `
  -Body (@{ sql = "SELECT id, name FROM People" } | ConvertTo-Json)
```

To enable write routes explicitly:

```powershell
dysflow serve --enable-writes
```

### Node fetch example

```js
const base = "http://127.0.0.1:17321";

const health = await fetch(`${base}/health`).then((response) => response.json());
const rows = await fetch(`${base}/query/read`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ sql: "SELECT id, name FROM People" }),
}).then((response) => response.json());

console.log({ health, rows });
```
