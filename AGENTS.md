# No Conformidades — Reglas locales del proyecto

## Identidad
Proyecto Microsoft Access/VBA para la gestión de no conformidades en Telefónica.
El código generado se trabaja mediante exportación a `src/` y validación posterior en Access.

---

## dysflow MCP — Este proyecto

**Versión estable activa:** `v0.5.3` (runtime en `C:\Users\adm.DEFENSA\AppData\Local\dysflow-runtime`)

- `projectId`: `00-no-conformidades-staging-clean`
- `accessPath`: `NoConformidades.accdb` (relativo al repo)
- `backendPath`: `NoConformidades_Datos.accdb` (relativo al repo)
- `destinationRoot`: `src`
- `projectRoot`: `.`
- `allowWrites`: `true`
- `timeoutMs`: `300000`
- La contraseña se resuelve con `ACCESS_VBA_PASSWORD`; no pasar ni documentar passwords inline.

**No usar** `projectId: "no_conformidades"` — puede resolver a otro entorno. El identificador seguro es `00-no-conformidades-staging-clean`.

---

## dysflow — Cómo usar MCP correctamente

### Happy path
1. Usar `dysflow.doctor` con `projectId: "00-no-conformidades-staging-clean"` para verificar contexto antes de operar.
2. Usar `dysflow.import_modules` con `projectId` + `moduleNames` para importar VBA editado.
3. Usar `dysflow.test_vba` o `dysflow.run_vba` para ejecutar procedimientos.
4. Nunca ejecutar varias operaciones Access en paralelo contra el mismo `.accdb`.

### Herramientas disponibles
| Necesidad | Tool MCP |
|---|---|
| Importar módulos editados | `dysflow.import_modules` |
| Importar todo src/ | `dysflow.import_all` |
| Exportar desde Access | `dysflow.export_modules` |
| Verificar src vs binario | `dysflow.verify_binary` |
| Ejecutar tests VBA | `dysflow.test_vba` |
| Ejecutar procedimiento VBA | `dysflow.run_vba` |
| Compilar VBA | `dysflow.compile_vba` (solo diagnóstico manual) |
| Consultar datos | `dysflow.query_sql`, `dysflow.list_tables`, `dysflow.get_schema` |
| Escribir datos | `dysflow.exec_sql` / `dysflow.run_script` con dry-run salvo intención explícita |
| Ver operaciones activas | `dysflow.list_access_operations` |
| Limpiar operación | `dysflow.cleanup_access_operation` (solo con `operationId` real + `cleanupSafe=true`) |

### Payload mínimo (operación normal)
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

## Regla de compilación — SIEMPRE el usuario compila

> **El usuario es el único que compila. Yo nunca compilo.**

Después de cualquier `dysflow.import_modules` o `dysflow.import_all`:
1. **NOTIFICAR**: "Módulo(s) importado(s). Compilá vos manualmente en Access VBE → Debug → Compile."
2. **ESPERAR** confirmación del usuario antes de ejecutar tests o procedimientos.
3. **NUNCA** usar `dysflow.compile_vba` para compilar automáticamente.

---

## dysflow MCP — seguridad multi-proyecto

- Cada operación Access queda registrada en `.dysflow/runtime/operations/<operationId>.json`.
- `.dysflow/runtime/` es estado local: no commitear, no copiar entre worktrees.
- `dysflow.list_access_operations` debe mostrar solo operaciones del proyecto actual.
- `dysflow.cleanup_access_operation` solo con `operationId` real + `accessPath` coincidente + `cleanupSafe=true`.
- Marcadores sin `accessPid` o `cleanupSafe=false` son evidencia histórica, **no permiso para matar procesos**.
- **Nunca** usar `Stop-Process MSACCESS` genérico.

---

## Access/VBA workflow — MCP SOLO, nunca CLI

- **Usar SIEMPRE el servidor MCP `dysflow`** para sincronizar, verificar, testear y consultar Access.
- **NUNCA usar `node cli.js`** ni ningún CLI directo como camino normal.
- El binario Access solo se actualiza con `dysflow.import_modules`/`dysflow.import_all`. Sin import, el cambio NO existe para Access.

### Workflow después de editar código en src/
```
1. dysflow.import_modules <Módulo> <Clase> <Formulario>...  (con projectId)
2. El usuario compila en Access VBE → Debug → Compile
3. dysflow.test_vba o dysflow.run_vba si existe harness
```

---

## dysflow — Reglas de higiene de operaciones Access

1. Resolver `projectId` desde `.dysflow/project.json` antes de cualquier operación.
2. Si falta `.dysflow/project.json`, usar `dysflow.init_project` para provisionar; no editar JSON a mano.
3. Verificar contexto con `dysflow.doctor` cuando haya duda, timeout previo o sesión abierta.
4. Ejecutar una sola operación Access por vez. Nunca并行 contra el mismo frontend/backend.
5. La contraseña se resuelve desde `passwordEnv` del proyecto. No pasar passwords inline.

---

## Reglas técnicas del proyecto

1. **Zero regresiones:** lo que funciona, debe seguir funcionando.
2. **Transaccionalidad estricta:** no modificar datos críticos sin control transaccional.
3. **Workflow inmutable:** los cambios de estado deben respetar la lógica de negocio existente.
4. **Doble edición en formularios:** si se modifica un `.cls` de formulario, revisar también su `.form.txt`.
5. **UI documentada:** si se toca `.form.txt`, detallar los cambios de controles.
6. **Documentación fuera del repo main**: `C:\00repos\documentacion\OPENSPEC\00_No_Conformidades`

---

## Skills

- `access-vba-sync`, `access-query`, `access-form-creation`, `jira-confluence-sdd`, `access-vba-tdd`