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
4. Ejecutar una sola operación Access por vez. Nunca en paralelo contra el mismo frontend/backend.
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

## Tests Access/VBA — Fixture explícita obligatoria

Regla dura para cualquier test que toque datos, tablas, configuración, caché persistente/local o backend:

1. **ERD/schema primero:** antes de escribir o aceptar un seed, inspeccionar el schema real de cada tabla tocada: PK, FKs, campos `Required`/`NOT NULL`, tipos y valores válidos. Si falta ese conocimiento, parar e inspeccionar; no adivinar.
2. **Poblar no es verificar:** el test debe insertar/controlar exactamente las filas que necesita antes del Act. No vale `SELECT TOP 1`, no vale “si existe una fila”, no vale depender de datos de usuario.
3. **Sandbox/local obligatorio:** toda escritura de test debe ir contra backend local/sandbox mediante el patrón `ForceLocalBackend` / `m_TestingMode` cuando aplique.
4. **Orden FK:** crear padres antes que hijos; borrar en orden inverso. Los teardowns solo pueden borrar IDs/marcadores determinísticos de test.
5. **Asserts fuertes:** además de que no explote, verificar valores concretos, cardinalidad esperada y efectos secundarios.
6. **Test inválido:** si pasa porque el dato “justo estaba”, el test está mal aunque esté verde. Reescribir antes de confiar en la implementación.

---

## Skills

- `access-vba-sync`, `access-query`, `access-form-creation`, `jira-confluence-sdd`, `access-vba-tdd`
- Los skills se resuelven desde las instalaciones globales/locales del entorno; no mantener copias vendorizadas en `.agents/skills/` dentro del repo salvo decisión explícita.

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
