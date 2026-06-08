# No Conformidades ÔÇö Reglas locales del proyecto

## Identidad
Proyecto Microsoft Access/VBA para la gesti├│n de no conformidades en Telef├│nica.
El c├│digo generado se trabaja mediante exportaci├│n a `src/` y validaci├│n posterior en Access.

---

## dysflow MCP ÔÇö Este proyecto

**Versi├│n estable activa:** `v0.5.3` (runtime en `C:\Users\adm.DEFENSA\AppData\Local\dysflow-runtime`)

- `projectId`: `00-no-conformidades-staging-clean`
- `accessPath`: `NoConformidades.accdb` (relativo al repo)
- `backendPath`: `NoConformidades_Datos.accdb` (relativo al repo)
- `destinationRoot`: `src`
- `projectRoot`: `.`
- `allowWrites`: `true`
- `timeoutMs`: `600000`
- La contrase├▒a se resuelve con `ACCESS_VBA_PASSWORD`; no pasar ni documentar passwords inline.

**No usar** `projectId: "no_conformidades"` ÔÇö puede resolver a otro entorno. El identificador seguro es `00-no-conformidades-staging-clean`.

---

## dysflow ÔÇö C├│mo usar MCP correctamente

### Happy path
1. Usar `dysflow.doctor` con `projectId: "00-no-conformidades-staging-clean"` para verificar contexto antes de operar.
2. Usar `dysflow.import_modules` con `projectId` + `moduleNames` para importar VBA editado.
3. Usar `dysflow.test_vba` o `dysflow.run_vba` para ejecutar procedimientos.
4. Nunca ejecutar varias operaciones Access en paralelo contra el mismo `.accdb`.

### Herramientas disponibles
| Necesidad | Tool MCP |
|---|---|
| Importar m├│dulos editados | `dysflow.import_modules` |
| Importar todo src/ | `dysflow.import_all` |
| Exportar desde Access | `dysflow.export_modules` |
| Verificar src vs binario | `dysflow.verify_binary` |
| Ejecutar tests VBA | `dysflow.test_vba` |
| Ejecutar procedimiento VBA | `dysflow.run_vba` |
| Compilar VBA | `dysflow.compile_vba` (solo diagn├│stico manual) |
| Consultar datos | `dysflow.query_sql`, `dysflow.list_tables`, `dysflow.get_schema` |
| Escribir datos | `dysflow.exec_sql` / `dysflow.run_script` con dry-run salvo intenci├│n expl├¡cita |
| Ver operaciones activas | `dysflow.list_access_operations` |
| Limpiar operaci├│n | `dysflow.cleanup_access_operation` (solo con `operationId` real + `cleanupSafe=true`) |

### Payload m├¡nimo (operaci├│n normal)
```json
{
  "projectId": "00-no-conformidades-staging-clean",
  "moduleNames": ["ModuloEditado"]
}
```

### Para tests VBA
```json
{
  "projectId": "00-no-conformidades-staging-clean",
  "testsPath": "tests/tests.vba.json",
  "procedureName": "Test_Algo_Especifico",
  "compile": false
}
```

---

## Regla de compilaci├│n ÔÇö SIEMPRE el usuario compila

> **El usuario es el ├║nico que compila. Yo nunca compilo.**

Despu├®s de cualquier `dysflow.import_modules` o `dysflow.import_all`:
1. **NOTIFICAR**: "M├│dulo(s) importado(s). Compil├í vos manualmente en Access VBE ÔåÆ Debug ÔåÆ Compile."
2. **ESPERAR** confirmaci├│n del usuario antes de ejecutar tests o procedimientos.
3. **NUNCA** usar `dysflow.compile_vba` para compilar autom├íticamente.

---

## dysflow MCP ÔÇö seguridad multi-proyecto

- Cada operaci├│n Access queda registrada en `.dysflow/runtime/operations/<operationId>.json`.
- `.dysflow/runtime/` es estado local: no commitear, no copiar entre worktrees.
- `dysflow.list_access_operations` debe mostrar solo operaciones del proyecto actual.
- `dysflow.cleanup_access_operation` solo con `operationId` real + `accessPath` coincidente + `cleanupSafe=true`.
- Marcadores sin `accessPid` o `cleanupSafe=false` son evidencia hist├│rica, **no permiso para matar procesos**.
- **Nunca** usar `Stop-Process MSACCESS` gen├®rico.

---

## Access/VBA workflow ÔÇö MCP SOLO, nunca CLI

- **Usar SIEMPRE el servidor MCP `dysflow`** para sincronizar, verificar, testear y consultar Access.
- **NUNCA usar `node cli.js`** ni ning├║n CLI directo como camino normal.
- El binario Access solo se actualiza con `dysflow.import_modules`/`dysflow.import_all`. Sin import, el cambio NO existe para Access.

### Workflow despu├®s de editar c├│digo en src/
```
1. dysflow.import_modules <M├│dulo> <Clase> <Formulario>...  (con projectId)
2. El usuario compila en Access VBE ÔåÆ Debug ÔåÆ Compile
3. dysflow.test_vba o dysflow.run_vba si existe harness
```

---

## dysflow ÔÇö Reglas de higiene de operaciones Access

1. Resolver `projectId` desde `.dysflow/project.json` antes de cualquier operaci├│n.
2. Si falta `.dysflow/project.json`, usar `dysflow.init_project` para provisionar; no editar JSON a mano.
3. Verificar contexto con `dysflow.doctor` cuando haya duda, timeout previo o sesi├│n abierta.
4. Ejecutar una sola operaci├│n Access por vez. Nunca en paralelo contra el mismo frontend/backend.
5. La contrase├▒a se resuelve desde `passwordEnv` del proyecto. No pasar passwords inline.

---

## Reglas t├®cnicas del proyecto

1. **Zero regresiones:** lo que funciona, debe seguir funcionando.
2. **Transaccionalidad estricta:** no modificar datos cr├¡ticos sin control transaccional.
3. **Workflow inmutable:** los cambios de estado deben respetar la l├│gica de negocio existente.
4. **Doble edici├│n en formularios:** si se modifica un `.cls` de formulario, revisar tambi├®n su `.form.txt`.
5. **UI documentada:** si se toca `.form.txt`, detallar los cambios de controles.
6. **Documentaci├│n fuera del repo main**: `C:\00repos\documentacion\OPENSPEC\00_No_Conformidades`

---

## Tests Access/VBA ÔÇö Fixture expl├¡cita obligatoria

Regla dura para cualquier test que toque datos, tablas, configuraci├│n, cach├® persistente/local o backend:

1. **ERD/schema primero:** antes de escribir o aceptar un seed, inspeccionar el schema real de cada tabla tocada: PK, FKs, campos `Required`/`NOT NULL`, tipos y valores v├ílidos. Si falta ese conocimiento, parar e inspeccionar; no adivinar.
2. **Poblar no es verificar:** el test debe insertar/controlar exactamente las filas que necesita antes del Act. No vale `SELECT TOP 1`, no vale ÔÇ£si existe una filaÔÇØ, no vale depender de datos de usuario.
3. **Sandbox/local obligatorio:** toda escritura de test debe ir contra backend local/sandbox mediante el patr├│n `ForceLocalBackend` / `m_TestingMode` cuando aplique.
4. **Orden FK:** crear padres antes que hijos; borrar en orden inverso. Los teardowns solo pueden borrar IDs/marcadores determin├¡sticos de test.
5. **Asserts fuertes:** adem├ís de que no explote, verificar valores concretos, cardinalidad esperada y efectos secundarios.
6. **Test inv├ílido:** si pasa porque el dato ÔÇ£justo estabaÔÇØ, el test est├í mal aunque est├® verde. Reescribir antes de confiar en la implementaci├│n.

---

## Skills inyectables a sub-agentes

- **S├ì inyectar**: `access-form-creation`, `access-vba-tdd`
- **NO inyectar** (regla dura, vigente desde 2026-06-08): `access-vba-sync`, `access-query`
  - El runtime can├│nico de import/export/test/query de Access es `dysflow` MCP (`projectId=00-no-conformidades-staging-clean`).
  - Inyectar `access-vba-sync` o `access-query` a sub-agentes contradice el workflow dysflow-only y queda prohibido en este proyecto.
- **NO inyectar** (regla dura, vigente desde 2026-06-08): `jira-confluence-sdd`
  - Este proyecto no opera issues/tracking v├¡a Jira/Confluence desde sub-agentes; toda la trazabilidad SDD vive en `openspec/changes/` + engram + git.
- Los skills se resuelven desde las instalaciones globales/locales del entorno; no mantener copias vendorizadas en `.agents/skills/` dentro del repo salvo decisi├│n expl├¡cita.
- Registry can├│nico local: `.atl/skill-registry.md`. Si hay conflicto entre la lista de arriba y el registry, gana esta lista de AGENTS.md.

---

## Reglas VBA ÔÇö Cosas que no hacer

1. **No evaluar propiedad de objeto en la misma l├¡nea que se pregunta si es Nothing:**
   ```vba
   ' INCORRECTO ÔÇö error de compilaci├│n en VBA
   Debug.Print IIf(obj Is Nothing, "Nothing", obj.Property)

   ' CORRECTO ÔÇö separar en dos l├¡neas
   If obj Is Nothing Then
       Debug.Print "Nothing"
   Else
       Debug.Print obj.Property
   End If
   ```
2. **No usar `And`/`Or` para combinar `Nothing` check con acceso a propiedad en la misma l├¡nea:**
   ```vba
   ' INCORRECTO ÔÇö si obj es Nothing, al evaluar obj.Prop VBA da error
   If Not obj Is Nothing And obj.Prop.Count > 0 Then

   ' CORRECTO ÔÇö chequeos separados, evaluaci├│n en cortocircuito
   If Not obj Is Nothing Then
       If obj.Prop.Count > 0 Then
   ```
   Esto aplica siempre que se encadene `Is Nothing` con acceso a `.Count`, `.Exists`, `.Keys`, `.Items` u otra propiedad de la misma colecci├│n.
3. **No concatenar valores de campos sin verificar tipo:** campos Short Text con espacios pueden no ser num├®ricos aunque parezcan serlo.
4. **Par├ímetros con nombre siempre para ByRef opcional:** usar `parametro:=valor` para evitar ambig├╝edad posicional en VBA.

## Dysflow

This project is a dysflow consumer. **All Access/VBA work goes through dysflow** ÔÇö do not use legacy skills like `vba-sync`, `access-query`, `access-vba-sync`, or `access-form-creation` for new work. They are deprecated; dysflow replaces them.

For the full reference (every tool, the sync loop, secret management, safe cleanup), read the opencode global `AGENTS.md` `<!-- gentle-ai:dysflow-reference -->` block. The summary below is the must-know subset.

### Project config

- This project ships a `.dysflow/project.json` at the repo root. Use its `projectId` (and any password env name declared in it) as the canonical identity.
- If the file is missing, do not invent a project id ÔÇö fix the config first.

### Secret management

- Never hardcode the Access password. Resolve it through `ACCESS_VBA_PASSWORD` (or the password env name declared in `.dysflow/project.json`).

### Reach for these dysflow MCP tools first

- Schema and data: `query_sql`, `exec_sql`, `list_tables`, `list_linked_tables`, `get_schema`, `get_relationships`, `count_rows`, `distinct_values`, `compare_backends`.
- VBA source sync: `import_all` / `import_modules`, `export_all` / `export_modules`, `compile_vba`, `test_vba`, `run_vba`, `verify_code`, `verify_binary`, `reconcile_binary`, `delete_module`, `fix_encoding`, `list_objects`, `exists`.
- SQL fixtures: `seed_fixture`, `teardown_fixture`, `create_table`, `drop_table`, `run_script`, `export_queries`, `import_queries`.
- Links: `link_tables`, `relink_tables`, `localize_backend_links`, `unlink_table`, `relink_directory`.
- Operations and cleanup: `dysflow_access_operations_list`, `dysflow_access_cleanup`, `list_access_operations`, `cleanup_access_operation`, `compact_repair`.
- Forms and catalog: `validate_form_spec`, `generate_form`, `catalog_add_control`, `harvest_form_catalog`, `generate_erd`.
- Diagnostics: `dysflow_doctor`, `dysflow_query_execute`, `dysflow_vba_execute`.

### VBA sync loop (CRITICAL)

After editing any `*.bas` / `*.cls` / `*.frm` file on disk, the changes are NOT visible to Access until you run the loop:

1. `import_all` (or `import_modules`) ÔÇö load the disk changes into the binary.
2. `compile_vba` ÔÇö compile the freshly imported code in Access.
3. `test_vba` (or `run_vba`) ÔÇö run the focused test.

Skipping any of these three will run outdated code and produce confusing failures.

### Safe cleanup

Never `Stop-Process -Name MSACCESS -Force`. Use `dysflow_access_operations_list` (or `list_access_operations`) then `dysflow_access_cleanup` (or `cleanup_access_operation`) with a real operation id and the diagnostics it returns.

### E2E

The MCP E2E entry point resets `DYSFLOW_HOME` so the runner is forced to use the test-runtime copy of `dysflow-access-runner.ps1` instead of inheriting a host-shell `DYSFLOW_HOME` that points at the stale production install. If you are running the E2E manually, you do not need to set `DYSFLOW_HOME` yourself.

## Dysflow

This project is a dysflow consumer. **All Access/VBA work goes through dysflow** — do not use legacy skills like `vba-sync`, `access-query`, `access-vba-sync`, or `access-form-creation` for new work. They are deprecated; dysflow replaces them.

For the full reference (every tool, the sync loop, secret management, safe cleanup), read the opencode global `AGENTS.md` `<!-- gentle-ai:dysflow-reference -->` block. The summary below is the must-know subset.

### Project config

- This project ships a `.dysflow/project.json` at the repo root. Use its `projectId` (and any password env name declared in it) as the canonical identity.
- If the file is missing, do not invent a project id — fix the config first.

### Secret management

- Never hardcode the Access password. Resolve it through `ACCESS_VBA_PASSWORD` (or the password env name declared in `.dysflow/project.json`).

### Reach for these dysflow MCP tools first

- Schema and data: `query_sql`, `exec_sql`, `list_tables`, `list_linked_tables`, `get_schema`, `get_relationships`, `count_rows`, `distinct_values`, `compare_backends`.
- VBA source sync: `import_all` / `import_modules`, `export_all` / `export_modules`, `compile_vba`, `test_vba`, `run_vba`, `verify_code`, `verify_binary`, `reconcile_binary`, `delete_module`, `fix_encoding`, `list_objects`, `exists`.
- SQL fixtures: `seed_fixture`, `teardown_fixture`, `create_table`, `drop_table`, `run_script`, `export_queries`, `import_queries`.
- Links: `link_tables`, `relink_tables`, `localize_backend_links`, `unlink_table`, `relink_directory`.
- Operations and cleanup: `dysflow_access_operations_list`, `dysflow_access_cleanup`, `list_access_operations`, `cleanup_access_operation`, `compact_repair`.
- Forms and catalog: `validate_form_spec`, `generate_form`, `catalog_add_control`, `harvest_form_catalog`, `generate_erd`.
- Diagnostics: `dysflow_doctor`, `dysflow_query_execute`, `dysflow_vba_execute`.

### VBA sync loop (CRITICAL)

After editing any `*.bas` / `*.cls` / `*.frm` file on disk, the changes are NOT visible to Access until you run the loop:

1. `import_all` (or `import_modules`) — load the disk changes into the binary.
2. `compile_vba` — compile the freshly imported code in Access.
3. `test_vba` (or `run_vba`) — run the focused test.

Skipping any of these three will run outdated code and produce confusing failures.

### Safe cleanup

Never `Stop-Process -Name MSACCESS -Force`. Use `dysflow_access_operations_list` (or `list_access_operations`) then `dysflow_access_cleanup` (or `cleanup_access_operation`) with a real operation id and the diagnostics it returns.

### E2E

The MCP E2E entry point resets `DYSFLOW_HOME` so the runner is forced to use the test-runtime copy of `dysflow-access-runner.ps1` instead of inheriting a host-shell `DYSFLOW_HOME` that points at the stale production install. If you are running the E2E manually, you do not need to set `DYSFLOW_HOME` yourself.
