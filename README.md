# No Conformidades

Proyecto Microsoft Access/VBA para la gestion de no conformidades. El codigo VBA se trabaja exportado en `src/` y se sincroniza contra `NoConformidades.accdb` mediante Dysflow MCP.

## Workflow

1. Editar codigo fuente exportado en `src/`.
2. Importar los modulos modificados con Dysflow MCP usando `projectId: "00-no-conformidades-staging-clean"`.
3. Compilar manualmente en Access VBE: `Debug` -> `Compile`.
4. Ejecutar tests Dysflow solo despues de que el usuario confirme la compilacion manual.

## Reglas Access/VBA

- No usar `dysflow.compile_vba`: la compilacion la hace siempre el usuario en Access.
- No pasar passwords inline; Dysflow resuelve credenciales desde la configuracion del proyecto.
- No ejecutar operaciones Access en paralelo contra el mismo frontend/backend.
- No tocar archivos `.accdb` salvo que el flujo lo requiera explicitamente.

## Dysflow MCP

Configuracion local esperada:

| Campo | Valor |
|---|---|
| `projectId` | `00-no-conformidades-staging-clean` |
| Frontend | `NoConformidades.accdb` |
| Backend | `NoConformidades_Datos.accdb` |
| Source root | `src` |

Uso normal:

- `dysflow.import_modules` para importar VBA editado.
- `dysflow.test_vba` para ejecutar pruebas despues de compilacion manual.
- `dysflow.query_sql` / `dysflow.get_schema` para inspeccion de datos y esquema.
- `dysflow.list_access_operations` y `dysflow.cleanup_access_operation` para higiene de operaciones, nunca `Stop-Process MSACCESS` generico.

## Tests

- Los tests que tocan datos deben usar fixture explicita, backend local/sandbox y teardown defensivo.
- Antes de sembrar datos, inspeccionar schema real: PK, FKs, campos requeridos, tipos y dominios validos.
- No confiar en datos existentes, `SELECT TOP 1` ni filas de usuario como fixture.
- Los tests automatizados no deben manejar automatizacion de UI o formularios; la validacion final de UI es manual del usuario.

## Migraciones de backend (issue #18)

Issue #18 / SDD `indicator-issues-cleanup` requiere extender el cache backend compartido. La DDL de referencia vive en `database/issue18_backend_indicator_cache.sql` y el script de referencia en `database/issue18_migration_v1.sql`. La aplicacion real se hace via el helper VBA `src/modules/ModuloMigracionIssue18.bas`, que es **idempotente y no destructivo**.

Puntos de entrada publicos del helper (devuelven JSON):

- `MigracionIssue18_DryRun([backendPath], [backendPassword])` - describe cambios pendientes sin aplicar.
- `MigracionIssue18_Aplicar([backendPath], [backendPassword])` - aplica la migracion; idempotente.
- `MigracionIssue18_Estado([backendPath], [backendPassword])` - reporta el estado actual sin modificar nada.

Modos:

- **Sandbox** (default): usa `TestHelper.BeginTestSession` y `m_TestingMode` para apuntar al backend sandbox.
- **Produccion**: pasar `backendPath` y `backendPassword` explicitos. El helper tiene un guard contra `\\datoste\` para no apuntar a produccion por accidente.

Reglas duras del helper:

- Idempotente: aplicar dos veces = mismo resultado, sin errores.
- No destructivo: nunca borra datos, nunca recrea tablas, preserva PKs.
- Valida el `field list` y `Unique` de cada indice: si no coinciden con el contrato, dropea y recrea el indice.
- Devuelve `{ok, error, mode, migration, version, changeCount, changes[], logs[], value}` en JSON via `JsonConverter`.

## Cambio Reciente

### Issue #18 / SDD `indicator-issues-cleanup` (wu1)

Commit `b7eaa86` en `staging`: agrego `src/modules/ModuloMigracionIssue18.bas` (helper de migracion backend) y `database/issue18_migration_v1.sql` (script de referencia), y extiendo `src/modules/Test_IndicadoresCaracterizacion.bas` con 4 tests RED que ahora son GREEN. Backend DDL aplicado al sandbox: nueva tabla `TbCacheIndicadoresConfig` (4 campos requeridos + PK), 7 campos nuevos en `TbCacheIndicadoresProyectoHeader` (2 requeridos), 10 campos nuevos en `TbCacheIndicadoresProyectoDetalle` (2 requeridos) y 8 indices (1 UX Config, 1 UX Header, 6 IX Detalle) con field lists correctos. Cobertura: 4/4 tests `issue-18` / `indicator-cache` / `wu1` GREEN; 4/4 tests `cache-sync` pre-existentes siguen GREEN (sin regresion). Ver `openspec/changes/indicator-issues-cleanup/apply-progress.md` para la traza completa de Phase 1 + Phase 2.

### Issue #55 / SDD `ncproyecto-seguimiento-tareas-helper`

Issue #55 / SDD `ncproyecto-seguimiento-tareas-helper` agrego `src/modules/NCProyectoSeguimientoTareasListadoHelper.bas`, un helper cache-first con fallback/logging seguro para filtrar tareas de seguimiento de proyecto. La cobertura automatizada esta en `tests/tests.vba.seguimiento-tareas-helper.json` y valida seams de helper/modulo; 9/9 tests pasaron despues de compilacion manual en Access.
