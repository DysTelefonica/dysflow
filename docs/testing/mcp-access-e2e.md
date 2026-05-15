# Batería E2E MCP Dysflow contra Access real

Este documento define la batería real de pruebas para ejecutar después de reabrir el entorno. El objetivo es validar que Dysflow funciona como herramienta instalada en perfil de usuario, que OpenCode lo consume por MCP desde la ruta definitiva, y que las operaciones Access quedan auditadas con PID propio y cleanup seguro.

## Quick path

1. Cerrar y abrir de nuevo OpenCode/Codex para heredar variables de usuario.
2. Verificar que `dysflow` resuelve desde `AppData\Local`.
3. Verificar `opencode mcp list` con `dysflow connected`.
4. Ejecutar pruebas MCP: `initialize`, `tools/list`, `dysflow.doctor`, query read, list operations y cleanup seguro.
5. Validar PID ownership: cada operación que abre Access registra `operationId`, `accessPid`, `processStartTime`, `accessPath` y `status`.

## Entorno esperado

| Concepto | Valor |
|---|---|
| Runtime Dysflow | `C:\Users\adm1\AppData\Local\dysflow` |
| Bin Dysflow | `C:\Users\adm1\AppData\Local\dysflow\bin\dysflow.cmd` |
| OpenCode config | `C:\Users\adm1\.config\opencode\opencode.json` |
| MCP command | `C:/Users/adm1/AppData/Local/dysflow/bin/dysflow.cmd mcp` |
| Front Access | `C:\Proyectos\dysflow\NoConformidades.accdb` |
| Backend Access | `C:\Proyectos\dysflow\NoConformidades_Datos.accdb` |
| Password | `DYSFLOW_ACCESS_PASSWORD` configurado como secreto de usuario |
| PowerShell target | Windows PowerShell 5.1 vía `powershell.exe`, no `pwsh` |

## Preflight tras reabrir

```powershell
Get-Command dysflow -All | Select-Object CommandType, Source
[Environment]::GetEnvironmentVariable('DYSFLOW_HOME','User')
[Environment]::GetEnvironmentVariable('DYSFLOW_ACCESS_DB_PATH','User')
[Environment]::GetEnvironmentVariable('DYSFLOW_ACCESS_BACKEND_PATH','User')
[bool][Environment]::GetEnvironmentVariable('DYSFLOW_ACCESS_PASSWORD','User')
```

Resultado esperado:

- El primer `dysflow` debe venir de `C:\Users\adm1\AppData\Local\dysflow\bin`.
- `DYSFLOW_HOME` debe apuntar a `C:\Users\adm1\AppData\Local\dysflow`.
- `DYSFLOW_ACCESS_DB_PATH` debe apuntar al front.
- La password debe estar seteada, pero nunca imprimirse.

## Prueba 1 — CLI runtime instalado

```powershell
dysflow setup
dysflow doctor
```

Resultado esperado:

```txt
Dysflow core configuration resolved.
Password: [REDACTED]
✓ access-db-path: configured
✓ access-open: opened
```

Criterios de aceptación:

- [ ] No aparece la password en claro.
- [ ] `doctor` abre Access correctamente.
- [ ] No falla por `scripts/dysflow-access-runner.ps1` inexistente.
- [ ] No requiere PowerShell 7.

## Prueba 2 — OpenCode ve el MCP productivo

```powershell
opencode mcp list
```

Resultado esperado:

```txt
✓ dysflow connected
C:/Users/adm1/AppData/Local/dysflow/bin/dysflow.cmd mcp
```

Criterios de aceptación:

- [ ] No aparece `C:/Proyectos/workflow/skills/dysflow/mcp.js`.
- [ ] No aparece `MCP_STDIO_RUNTIME_NOT_IMPLEMENTED`.
- [ ] No aparece `Connection closed`.

## Prueba 3 — MCP stdio básico sin OpenCode

Esta prueba aísla el MCP real sin depender de UI.

```powershell
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo.FileName = 'C:\Users\adm1\AppData\Local\dysflow\bin\dysflow.cmd'
$proc.StartInfo.Arguments = 'mcp'
$proc.StartInfo.RedirectStandardInput = $true
$proc.StartInfo.RedirectStandardOutput = $true
$proc.StartInfo.RedirectStandardError = $true
$proc.StartInfo.UseShellExecute = $false
$proc.StartInfo.CreateNoWindow = $true
[void]$proc.Start()
$proc.StandardInput.WriteLine('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}')
$proc.StandardInput.WriteLine('{"jsonrpc":"2.0","id":2,"method":"tools/list"}')
$proc.StandardInput.Close()
$stdout = $proc.StandardOutput.ReadToEnd()
$stderr = $proc.StandardError.ReadToEnd()
$proc.WaitForExit(10000) | Out-Null
$stdout
$stderr
```

Resultado esperado:

- `initialize` devuelve `serverInfo.name = "dysflow"`.
- `tools/list` incluye:
  - `dysflow.vba.execute`
  - `dysflow.query.execute`
  - `dysflow.doctor`
  - `dysflow.access.operations.list`
  - `dysflow.access.cleanup`
- `stderr` vacío.

## Prueba 4 — MCP doctor abre el front y registra operación

```powershell
# dentro de una sesión MCP stdio
{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"dysflow.doctor","arguments":{"includeEnvironment":true}}}
{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"dysflow.access.operations.list","arguments":{}}}
```

Resultado esperado:

- `dysflow.doctor` devuelve checks OK.
- `dysflow.access.operations.list` muestra una operación `diagnostics` reciente.
- La operación contiene:
  - `operationId`
  - `accessPath = C:\Proyectos\dysflow\NoConformidades.accdb`
  - `accessPid` numérico
  - `processStartTime`
  - `status = completed`
  - `commandLine` compatible con `MSACCESS.EXE`

## Prueba 5 — Query read contra front

Usar una query de sistema para no depender de nombres de negocio.

```json
{"jsonrpc":"2.0","id":20,"method":"tools/call","params":{"name":"dysflow.query.execute","arguments":{"sql":"SELECT TOP 5 Name FROM MSysObjects WHERE Type=1 AND Flags=0","mode":"read"}}}
```

Resultado esperado:

- Devuelve `rows`.
- No escribe datos.
- La operación queda registrada con `action = query`, `status = completed`, PID y start time.

## Prueba 6 — Query read negativa contra tabla inexistente

```json
{"jsonrpc":"2.0","id":30,"method":"tools/call","params":{"name":"dysflow.query.execute","arguments":{"sql":"SELECT TOP 1 * FROM TablaQueNoExiste","mode":"read"}}}
```

Resultado esperado:

- Devuelve error MCP controlado, no crash.
- La operación queda en registry con:
  - `status = failed`
  - `accessPid`
  - `processStartTime`
  - `metadata.sql`

## Prueba 7 — Backend con access-query auxiliar

Dysflow abre el front. Para validar backend directamente usar la skill auxiliar de Access Query.

```powershell
$env:ACCESS_QUERY_PASSWORD = [Environment]::GetEnvironmentVariable('DYSFLOW_ACCESS_PASSWORD','User')
& 'C:\Users\adm1\.codex\skills\access-query\query-backend.ps1' `
  -BackendPath 'C:\Proyectos\dysflow\NoConformidades_Datos.accdb' `
  -Password $env:ACCESS_QUERY_PASSWORD `
  -ListTables `
  -Json
```

Resultado esperado:

- Lista tablas del backend.
- No escribe datos.
- Confirma que el backend existe y acepta la clave.

## Prueba 8 — Ownership PID: proceso exacto abierto por Dysflow

Después de una operación Access, tomar el último registro:

```json
{"jsonrpc":"2.0","id":40,"method":"tools/call","params":{"name":"dysflow.access.operations.list","arguments":{}}}
```

Validar manualmente el PID:

```powershell
$pid = <accessPid del registro>
Get-CimInstance Win32_Process -Filter "ProcessId=$pid" |
  Select-Object ProcessId, Name, CreationDate, CommandLine
```

Criterios de aceptación:

- [ ] `Name` es `MSACCESS.EXE` si el proceso sigue vivo.
- [ ] `CreationDate` corresponde al `processStartTime` registrado.
- [ ] `CommandLine` no indica otro proyecto/base incompatible.
- [ ] Si el proceso ya cerró, el registry igual conserva el ownership histórico.

## Prueba 9 — Cleanup seguro con accessPath incorrecto

Tomar un `operationId` con `accessPid` registrado y llamar cleanup con path falso:

```json
{"jsonrpc":"2.0","id":50,"method":"tools/call","params":{"name":"dysflow.access.cleanup","arguments":{"operationId":"<operationId>","accessPath":"C:\\otra\\base.accdb","force":true}}}
```

Resultado esperado:

- Cleanup rechaza con `CLEANUP_ACCESS_PATH_MISMATCH`.
- No mata ningún proceso.

## Prueba 10 — Cleanup rechaza pid_unknown

Esta prueba se puede ejecutar con un registro inyectado en test unitario o provocando una operación donde no se capture PID. En E2E real, si aparece un registro `pid_unknown`:

```json
{"jsonrpc":"2.0","id":60,"method":"tools/call","params":{"name":"dysflow.access.cleanup","arguments":{"operationId":"<pid_unknown_operationId>","accessPath":"C:\\Proyectos\\dysflow\\NoConformidades.accdb","force":true}}}
```

Resultado esperado:

- Cleanup rechaza con `CLEANUP_PID_UNKNOWN`.
- Mensaje claro: no es seguro limpiar automáticamente.

## Prueba 11 — Cleanup de proceso colgado controlado

> Ejecutar solo si hay una operación `timed_out`, `failed` o `cleanup_pending` cuyo `accessPid` siga vivo y pertenezca al Access abierto por Dysflow.

```json
{"jsonrpc":"2.0","id":70,"method":"tools/call","params":{"name":"dysflow.access.cleanup","arguments":{"operationId":"<operationId>","accessPath":"C:\\Proyectos\\dysflow\\NoConformidades.accdb","force":true}}}
```

Resultado esperado:

- Mata solo el PID registrado.
- Actualiza status a `cleaned`.
- No mata otros `MSACCESS.EXE`.

Verificación:

```powershell
Get-Process MSACCESS -ErrorAction SilentlyContinue
```

Comparar antes/después con el PID concreto, no por nombre genérico.

## Prueba 12 — Nunca usar Stop-Process por nombre

Regla de contrato para agentes:

```powershell
# PROHIBIDO
Stop-Process -Name MSACCESS -Force
```

Única vía permitida:

```txt
dysflow.access.cleanup(operationId, accessPath)
```

Criterios de aceptación:

- [ ] Ningún test ni script E2E mata `MSACCESS.EXE` por nombre.
- [ ] Cleanup siempre valida operationId + accessPath + PID + start time.

## Prueba 13 — HTTP API local contra el mismo runtime

Arrancar servidor:

```powershell
dysflow serve --host 127.0.0.1 --port 17321
```

Probar:

```powershell
Invoke-RestMethod http://127.0.0.1:17321/health
Invoke-RestMethod http://127.0.0.1:17321/diagnostics
Invoke-RestMethod http://127.0.0.1:17321/access/operations
```

Resultado esperado:

- Health OK.
- Diagnostics abre Access.
- Operations lista registros recientes.

## Prueba 14 — PowerShell 5.1 compatibility

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File 'C:\Users\adm1\AppData\Local\dysflow\app\scripts\dysflow-access-runner.ps1' `
  -AccessDbPath 'C:\Proyectos\dysflow\NoConformidades.accdb' `
  -Operation diagnostics `
  -PayloadJson '{}' `
  -AccessPassword ([Environment]::GetEnvironmentVariable('DYSFLOW_ACCESS_PASSWORD','User'))
```

Resultado esperado:

- Exit code 0.
- JSON de checks por stdout.
- Marker `DYSFLOW_ACCESS_PROCESS {json}` por stderr.
- No usa `pwsh`.

## Matriz final de aceptación

| Área | Esperado |
|---|---|
| AppData runtime | `dysflow` resuelve desde `C:\Users\adm1\AppData\Local\dysflow\bin` |
| OpenCode MCP | `dysflow connected` |
| MCP stdio | `initialize`, `tools/list`, `tools/call` OK |
| Front Access | `dysflow doctor` abre `NoConformidades.accdb` |
| Backend Access | `access-query` lista tablas de `NoConformidades_Datos.accdb` |
| PID ownership | Operaciones Access registran PID y start time |
| Cleanup seguro | Rechaza path incorrecto, pid_unknown, start time mismatch |
| PS 5.1 | Runner funciona con `powershell.exe` |
| Seguridad | Password redacted, no `Stop-Process MSACCESS` genérico |

## Qué reportar si falla

Copiar siempre:

```powershell
Get-Command dysflow -All | Select-Object CommandType, Source
opencode mcp list
dysflow setup
dysflow doctor
[Environment]::GetEnvironmentVariable('DYSFLOW_HOME','User')
[Environment]::GetEnvironmentVariable('DYSFLOW_ACCESS_DB_PATH','User')
[bool][Environment]::GetEnvironmentVariable('DYSFLOW_ACCESS_PASSWORD','User')
```

Y para fallos de ownership:

```powershell
Get-CimInstance Win32_Process -Filter "Name = 'MSACCESS.EXE'" |
  Select-Object ProcessId, Name, CreationDate, CommandLine
```
