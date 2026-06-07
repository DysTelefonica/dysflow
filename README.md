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

## Cambio Reciente

Issue #55 / SDD `ncproyecto-seguimiento-tareas-helper` agrego `src/modules/NCProyectoSeguimientoTareasListadoHelper.bas`, un helper cache-first con fallback/logging seguro para filtrar tareas de seguimiento de proyecto. La cobertura automatizada esta en `tests/tests.vba.seguimiento-tareas-helper.json` y valida seams de helper/modulo; 9/9 tests pasaron despues de compilacion manual en Access.
