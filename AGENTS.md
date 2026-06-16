# No Conformidades — Reglas locales del proyecto

Este AGENTS.md define **solo** lo específico de este proyecto. Para
convenciones globales (Dysflow reference, Engram protocol, persona,
SDD defaults, Access/VBA TDD rules, fixture discipline, etc.) ver
`C:\Users\adm1\.config\opencode\AGENTS.md` — el global es
autoritativo y se mantiene una sola vez.

---

## Identidad del proyecto

Proyecto Microsoft Access/VBA para la gestión de no conformidades en Telefónica.
El código generado se trabaja mediante exportación a `src/` y validación posterior en Access.

- **Runtime Dysflow activo:** `v1.2.32` instalado en
  `C:\Users\adm1\AppData\Local\dysflow` (gestionado por `dysflow install` / `dysflow update`).
- **`projectId` canónico:** `00-no-conformidades-staging-clean`
  (resuelto desde `<repo>/.dysflow/project.json`).
- **No usar** `projectId: "no_conformidades"` — resuelve a otro entorno.

### Project config (`.dysflow/project.json`)

| Campo | Valor |
|---|---|
| `id` | `00-no-conformidades-staging-clean` |
| `accessPath` | `NoConformidades.accdb` (relativo al repo) |
| `backendPath` | `NoConformidades_Datos.accdb` (relativo al repo) |
| `destinationRoot` | `src` |
| `projectRoot` | `.` |
| `allowWrites` | `true` |
| `timeoutMs` | `600000` |
| `passwordEnv` / `frontendPasswordEnv` / `backendPasswordEnv` | `ACCESS_VBA_PASSWORD` |

La contraseña se resuelve desde `ACCESS_VBA_PASSWORD`; no pasar ni
documentar passwords inline. Verificar contexto con
`dysflow.doctor projectId=00-no-conformidades-staging-clean` antes
de operar.

---

## Regla de compilación — SIEMPRE el usuario compila

> **El usuario es el único que compila. Yo nunca compilo.**

Después de cualquier `dysflow.import_modules` o `dysflow.import_all`:

1. **NOTIFICAR**: "Módulo(s) importado(s). Compilá vos manualmente en Access VBE → Debug → Compile."
2. **ESPERAR** confirmación del usuario antes de ejecutar tests o procedimientos.
3. **NUNCA** usar `dysflow.compile_vba` para compilar automáticamente.

---

## Skills inyectables a sub-agentes (override del registry local)

> **Override del proyecto sobre `.atl/skill-registry.md`. Si hay conflicto,
> gana esta lista.**

- **SÍ inyectar**: `sdd-apply`, `vba-access`, `access-vba-tdd`, `access-form-creation`.
- **NO inyectar** (regla dura, vigente desde 2026-06-08): `access-vba-sync`, `access-query`, `jira-confluence-sdd`.
  - El runtime canónico de import/export/test/query de Access es `dysflow` MCP (`projectId=00-no-conformidades-staging-clean`).
  - Inyectar `access-vba-sync` o `access-query` a sub-agentes contradice el workflow dysflow-only y queda prohibido en este proyecto.
  - Inyectar `jira-confluence-sdd` a sub-agentes contradice la política de trazabilidad SDD local (toda la trazabilidad vive en `openspec/changes/` + engram + git; no se opera Jira/Confluence desde sub-agentes).
- Los skills se resuelven desde las instalaciones globales/locales del entorno; no mantener copias vendorizadas en `.agents/skills/` dentro del repo salvo decisión explícita.
- Registry canónico local: `.atl/skill-registry.md`.

`access-vba-tdd` y `access-form-creation` se mantienen como **inyectables**
porque siguen siendo relevantes para sub-agentes focalizados (test TDD
de Access/VBA, creación de formularios). El listado legacy del final
del AGENTS.md anterior que las marcaba como "deprecated" es histórico
y no aplica.

---

## Reglas VBA — Cosas que no hacer

1. **No evaluar propiedad de objeto en la misma línea que se pregunta si es Nothing:**
   ```vba
   ' INCORRECTO — error de compilación en VBA
   Debug.Print IIf(obj Is Nothing, "Nothing", obj.Property)

   ' CORRECTO — separar en dos líneas
   If obj Is Nothing Then
       Debug.Print "Nothing"
   Else
       Debug.Print obj.Property
   End If
   ```
2. **No usar `And`/`Or` para combinar `Nothing` check con acceso a propiedad en la misma línea:**
   ```vba
   ' INCORRECTO — si obj es Nothing, al evaluar obj.Prop VBA da error
   If Not obj Is Nothing And obj.Prop.Count > 0 Then

   ' CORRECTO — chequeos separados, evaluación en cortocircuito
   If Not obj Is Nothing Then
       If obj.Prop.Count > 0 Then
   ```
   Esto aplica siempre que se encadene `Is Nothing` con acceso a `.Count`, `.Exists`, `.Keys`, `.Items` u otra propiedad de la misma colección.
3. **No concatenar valores de campos sin verificar tipo:** campos Short Text con espacios pueden no ser numéricos aunque parezcan serlo.
4. **Parámetros con nombre siempre para ByRef opcional:** usar `parametro:=valor` para evitar ambigüedad posicional en VBA.

---

## Reglas técnicas del proyecto

1. **Zero regresiones:** lo que funciona, debe seguir funcionando.
2. **Transaccionalidad estricta:** no modificar datos críticos sin control transaccional.
3. **Workflow inmutable:** los cambios de estado deben respetar la lógica de negocio existente.
4. **Doble edición en formularios:** si se modifica un `.cls` de formulario, revisar también su `.form.txt`.
5. **UI documentada:** si se toca `.form.txt`, detallar los cambios de controles.
6. **Documentación fuera del repo main**: `C:\00repos\documentacion\OPENSPEC\00_No_Conformidades`.

---

## Tests Access/VBA — Fixture discipline

> Las reglas completas de Access/VBA TDD y fixture discipline viven en
> el global `C:\Users\adm1\.config\opencode\AGENTS.md`
> (`<!-- gentle-ai:access-vba-tdd-rules -->` y
> `<!-- gentle-ai:access-vba-fixture-discipline -->`).

Reglas duras para cualquier test que toque datos, tablas, configuración, caché persistente/local o backend:

1. **ERD/schema primero** antes de cualquier seed.
2. **Poblar no es verificar**: el test debe insertar/controlar exactamente las filas que necesita antes del Act. No `SELECT TOP 1`, no "si existe una fila".
3. **Sandbox/local obligatorio**: escrituras contra backend local/sandbox con patrón `ForceLocalBackend` / `m_TestingMode`.
4. **Orden FK**: padres antes que hijos; teardowns en orden inverso.
5. **Asserts fuertes**: cardinalidad esperada, valores concretos, efectos secundarios.
6. **Test inválido si pasa por suerte**: reescribir antes de confiar.

---

##dysflow MCP — referencia completa

> **Toda la referencia de Dysflow (CLI, lista de tools, sync loop, path resolution, error codes v1.2.32, etc.) vive en el bloque
> `<!-- gentle-ai:dysflow-reference -->` del global
> `C:\Users\adm1\.config\opencode\AGENTS.md`. No se duplica acá.

**Resumen del must-know para este proyecto:**

- **Happy path:** `dysflow.doctor` → `dysflow.import_modules` → (usuario compila) → `dysflow.test_vba` o `dysflow.run_vba`. **Nunca** correr varias operaciones Access en paralelo contra el mismo `.accdb`.
- **Schemas de tools:** los nombres exactos están en la sección "Current MCP Tools" del bloque global. Aliases inventados no funcionan.
- **Path resolution:** si pasás `databasePath` o `backendPath` en el payload, ganás esos. Si no, el runner usa el `accessPath` del `.dysflow/project.json` y cae al frontend local. Si ese path no existe, v1.2.32+ devuelve `CONFIG_TARGET_NOT_FOUND` (estructurado) en vez del viejo `RUNNER_INVALID_JSON` (opaco).
- **VBA sync loop:** editar `src/*.bas` / `src/*.cls` / `src/*.frm` en disco **no** actualiza Access. Hace falta `import_all` (o `import_modules`) → `compile_vba` (o el usuario compila) → `test_vba` / `run_vba`. Saltarse un paso corre código viejo y rompe tests sin razón clara.
- **Safe cleanup:** nunca `Stop-Process -Name MSACCESS -Force`. Usar `list_access_operations` → `cleanup_access_operation` con `operationId` real y `cleanupSafe=true`.
- **Runtime desactualizado:** `dysflow --version` debe devolver la versión publicada actual. Si devuelve `latest: unknown` o un número viejo, `dysflow update` antes de seguir.

### Dysflow MCP — Este proyecto (tabla legacy preservada del catálogo)

- **Versión estable activa referencia:** runtime instalado en
  `C:\Users\adm1\AppData\Local\dysflow`. Resolver siempre el path real
  con `dysflow --version` antes de operar.
- **Payload mínimo (operación normal):**
  ```json
  {
    "projectId": "00-no-conformidades-staging-clean",
    "moduleNames": ["ModuloEditado"]
  }
  ```
- **Para tests VBA:**
  ```json
  {
    "projectId": "00-no-conformidades-staging-clean",
    "testsPath": "tests/tests.vba.json",
    "procedureName": "Test_Algo_Especifico",
    "compile": false
  }
  ```
- **Herramientas disponibles (resumen):** `import_modules`, `import_all`,
  `export_modules`, `verify_binary`, `test_vba`, `run_vba`, `query_sql`,
  `list_tables`, `get_schema`, `exec_sql`, `run_script`,
  `list_access_operations`, `cleanup_access_operation`.
- **Nunca** usar `node cli.js` ni ningún CLI directo como camino normal.

---

## Dysflow — Seguridad multi-proyecto

- Cada operación Access queda registrada en `.dysflow/runtime/operations/<operationId>.json`.
- `.dysflow/runtime/` es estado local: no commitear, no copiar entre worktrees.
- `list_access_operations` debe mostrar solo operaciones del proyecto actual.
- `cleanup_access_operation` solo con `operationId` real + `accessPath` coincidente + `cleanupSafe=true`.
- Marcadores sin `accessPid` o `cleanupSafe=false` son evidencia histórica, **no permiso para matar procesos**.

### Access/VBA workflow — MCP SOLO, nunca CLI (preservado del catálogo)

- **Usar SIEMPRE el servidor MCP `dysflow`** para sincronizar, verificar, testear y consultar Access.
- **NUNCA usar `node cli.js`** ni ningún CLI directo como camino normal.
- El binario Access solo se actualiza con `dysflow.import_modules`/`dysflow.import_all`. Sin import, el cambio NO existe para Access.

### Workflow después de editar código en src/ (preservado del catálogo)
```
1. dysflow.import_modules <Módulo> <Clase> <Formulario>...  (con projectId)
2. El usuario compila en Access VBE → Debug → Compile
3. dysflow.test_vba o dysflow.run_vba si existe harness
```

### Reglas de higiene de operaciones Access (preservado del catálogo)

1. Resolver `projectId` desde `.dysflow/project.json` antes de cualquier operación.
2. Si falta `.dysflow/project.json`, usar `dysflow.init_project` para provisionar; no editar JSON a mano.
3. Verificar contexto con `dysflow.doctor` cuando haya duda, timeout previo o sesión abierta.
4. Ejecutar una sola operación Access por vez. Nunca en paralelo contra el mismo frontend/backend.
5. La contraseña se resuelve desde `passwordEnv` del proyecto. No pasar passwords inline.
