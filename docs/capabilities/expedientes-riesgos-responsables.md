# Capacidad: expedientes, riesgos y responsables

## §0 Identidad
- **ID de capacidad**: `CAP-EXP-RISK-RESP`
- **Tier**: standard
- **Estado**: active / inventario documental inicial
- **Source**: reverse-engineered
- **Responsable / autoridad de producto**: Pendiente de confirmación — Calidad / gestión de proyectos
- **Última verificación**: 2026-06-15 mediante inspección estática; no se ejecutó Dysflow/Access
- **Confianza global**: mixta — mayoritariamente `Verified-static` y `Likely`

## §1 Intención de negocio
- **Propósito**: Permitir que las no conformidades se vinculen a expedientes, responsables de calidad/técnicos/jefes de proyecto y riesgos asociados.
- **Usuarios / perfiles**: Calidad, responsables de proyecto, técnicos y usuarios que filtran o asignan trabajo por expediente/responsable.
- **Problema que resuelve**: Sin esta capacidad, las NC pierden contexto de contrato/proyecto, propietario y riesgo, y los listados/seguimientos pueden mostrar trabajo no trazable.
- **Valor de negocio / por qué existe**: Aporta contexto contractual, responsabilidad operativa y visibilidad de riesgo para priorizar acciones y cierre.
- **No-objetivos**: No documenta el ciclo de vida completo de NC Proyecto/Auditoría ni todos los indicadores.
- **Origen de la intención**: Inferido desde código exportado y specs de seguimiento/listado; intención de producto pendiente.
- **Referencia de tracker de origen**: Issue #67; OpenSpec `seguimiento-tareas-helper` para filtros de `IDExpediente` y responsables.

## §2 Contrato de comportamiento

### Escenarios (Dado / Cuando / Entonces)
- **DADO** que un usuario busca expedientes **CUANDO** filtra por palabra clave o responsable de calidad **ENTONCES** se muestra una lista con `IDExp`, `Cod_Exp`, `Nemotécnico` y `Título`, y la selección emite un `Expediente`.
- **DADO** que una NC o tarea está vinculada a un expediente **CUANDO** se filtra seguimiento por `IDExpediente` **ENTONCES** solo aparecen los elementos del expediente seleccionado.
- **DADO** que un expediente tiene responsables/jurídicas/riesgos asociados **CUANDO** se carga su objeto de dominio **ENTONCES** las relaciones se resuelven desde `constructor` y no se inventan valores por defecto.
- **DADO** que una NC Proyecto tiene riesgos relacionados **CUANDO** se usa la ruta cache-first **ENTONCES** un resultado cargado-vacío es válido y no debe forzar fallback a backend.

### Reglas de negocio
| ID regla | Enunciado (pretendido) | Autoridad | ¿Aplicada en código? | Prueba | Confianza |
|---|---|---|---|---|---|
| BR-EXP-1 | La búsqueda de expedientes filtra por palabra clave y responsable de calidad antes de seleccionar. | Código exportado | Sí — `Form_FormExpedientesBusqueda.Filtrar`, `constructor.getExpedientesBusqueda` | FALTA → author via access-vba-tdd con fixtures de expedientes y responsables | Verified-static |
| BR-EXP-2 | La selección de expediente solo emite evento si hay un expediente cargado; si no hay selección, no fuerza un objeto inválido. | Código exportado | Sí — `ComandoElegir_Click`, `ListaFiltrados_Click` | FALTA → author via access-vba-tdd | Verified-static |
| BR-EXP-3 | Los responsables de calidad del combo proceden de `m_ObjEntorno.ColUsuariosCalidad`. | Código exportado | Sí — `EstablecerComboResponsablesCalidad` | FALTA → author via access-vba-tdd | Verified-static |
| BR-EXP-4 | `Expediente.TextoExpediente` prioriza `Nemotecnico (CodExp)` y cae a `CodExp` si falta nemotécnico. | Código exportado | Sí — `Expediente.TextoExpediente` | FALTA → author via access-vba-tdd unitario | Verified-static |
| BR-EXP-5 | Un expediente puede exponer jurídicas, responsables, responsable de calidad, jefe de proyecto y riesgos asociados. | Código exportado | Sí — propiedades `Juridicas`, `Responsables`, `RESPONSABLECALIDAD`, `JefeProyecto`, `Riesgos` | FALTA → author via access-vba-tdd con esquema primero | Verified-static |
| BR-EXP-6 | Los riesgos asociados a NC Proyecto deben leerse con semántica cache-first cuando la caché está cargada. | Feature `trust-ncproyecto-cache-hits` | Sí según docs de feature | Evidencia runtime más cercana: `tests/tests.vba.cache-e2e.json` 7/7 PASS (2026-06-14, staging `20b71f64`), registrada en `docs/features/cache-management/trust-ncproyecto-cache-hits.md` — no reejecutado en esta sesión documental; no afirmar runtime para 2026-06-15 | Verified-static |
| BR-EXP-7 | El ciclo de vida propio de riesgos — aceptación, mitigación, contingencia, materialización, retirada, cierre y retipificación — está definido y probado. | Producto pendiente | Desconocido | FALTA → author via access-vba-tdd tras confirmar estados | Intended |

### Validaciones
- No seleccionar expediente sin `IDExpediente`.
- No afirmar responsable/jefe/proveedor/jurídica si el constructor no devuelve objeto.
- Tratar los valores de riesgo como dominio pendiente: muchas propiedades existen, pero el flujo de aprobación/rechazo no está probado.

### Transiciones de estado
- `Sin filtro` --(`ComandoActualizar`)--> `Lista de expedientes recargada`.
- `Lista con fila seleccionada` --(`ComandoElegir`)--> `Expediente seleccionado emitido`.
- `Riesgo abierto` --(`Aceptar/mitigar/materializar/retirar/cerrar/retipificar`)--> `Estado de riesgo actualizado` — pendiente de contrato y pruebas.

### Casos límite y de error
- `constructor.getExpediente` o `constructor.getExpedientesBusqueda` con error debe bloquear selección.
- Si `ColUsuariosCalidad` falla, el combo de responsables no debe mostrar datos engañosos.
- Riesgo cache-first cargado-vacío es distinto de fallo de caché.

### Señales de aceptación / presencia
- La UI de búsqueda permite filtrar por palabra clave y responsable, seleccionar y cerrar el formulario.
- Los manifests de expediente/responsable/riesgo pasan con fixtures sandbox, no con datos existentes.
- El comportamiento de riesgo no se marca `Verified-runtime` hasta tener pruebas dedicadas.

## §3 Mapa de implementación
- **Puntos de entrada de UI**: `Form_FormExpedientesBusqueda`; consumidores en seguimiento/listados de Proyecto; `Form_formRiesgosSeleccion` como superficie de selección probable.
- **Puntos de entrada de código**: `Expediente`, `ExpedienteResponsable`, `Riesgo`, `RiesgoServicio`, `RiesgoRepositorio`, `NCProyectoSeguimientoTareasListadoHelper`, `constructor.getExpediente*`, `constructor.getRiesgosDeExpediente`.
- **Datos afectados**: `TbExpedientes`, `TbExpedientesResponsables`, `TbUsuariosAplicaciones`, `TbRiesgosNC` y tablas de vínculo exactas pendientes de esquema.
- **Salidas**: filtros de listas, contexto de NC, asignación de responsables, columnas de informe/listado.
- **Dependencias e integraciones**: NC Proyecto lifecycle, acciones/seguimiento, indicadores, soporte transversal de caché.
- **Sincronización fuente↔binario**: no comprobada; tarea solo documental.
- **Valoración de diseño**: los objetos de dominio existen y son útiles para migración, pero el comportamiento de riesgo y responsables sigue demasiado inferido sin pruebas de negocio.

## §4 Receta de reconstrucción
1. Confirmar con producto qué campos de expediente, responsable, jurídica y riesgo son obligatorios para NC.
2. Inspeccionar esquema real antes de sembrar fixtures (`TbExpedientes`, usuarios, responsables, riesgos y vínculos).
3. Crear pruebas de búsqueda/selección de expedientes, carga de responsables y propiedades de dominio.
4. Crear pruebas de ciclo de vida de riesgos solo después de definir estados y permisos.
5. Si se modifica VBA: importar con Dysflow; el usuario compila manualmente; después ejecutar `dysflow.test_vba`.

## §5 Evidencia y trazabilidad
- **Tests**: evidencia adyacente en `tests/tests.vba.seguimiento-tareas-helper.json` (9/9 PASS, 2026-06-15) — cobertura adyacente a BR-EXP-1: `IDExpediente` filter parity — y `tests/tests.vba.cache-e2e.json`; no hay manifest dedicado de expediente/riesgo.

| Elemento | Ref. tracker | Versión de staging (UAT) | Estado UAT | Release de producción | Fecha en producción | Nota |
|---|---|---|---|---|---|---|
| Búsqueda/selección de expedientes | Pendiente | Pendiente | pending | Pendiente | Pendiente | Falta prueba dedicada. |
| Riesgos asociados cache-first | Issue #39 / #67 | Pendiente | pending | Pendiente | Pendiente | Evidencia de feature; falta reejecución. |
| Ciclo de vida propio de riesgos | Pendiente | Pendiente | pending | Pendiente | Pendiente | Contrato de producto pendiente. |

| Síntoma | Causa probable | Comprobación (Dysflow) | Ancla del documento |
|---|---|---|---|
| No se puede seleccionar expediente | Regresión de filtro/constructor/evento | Crear manifest de búsqueda de expedientes | BR-EXP-1..3 |
| Seguimiento muestra tareas de otro expediente | Filtro `IDExpediente` roto | Reejecutar/crear prueba de seguimiento por expediente | BR-EXP-1 |
| Riesgos ausentes u obsoletos | Regresión cache-first o falta de vínculo | Reejecutar cache-e2e + prueba dedicada de riesgo | BR-EXP-6..7 |

## §6 Notas de migración web
- Modelar expediente como agregado de contexto con responsables, jurídicas y riesgos asociados.
- Separar la búsqueda de expedientes de los formularios consumidores mediante una API de selección reutilizable.
- No copiar dependencia de globals/objetos `m_Obj*` como estado compartido implícito.
- Convertir el ciclo de vida de riesgos en estados y comandos explícitos antes de migrar.

## §7 Registro de confianza
| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| Existe una UI de búsqueda/selección de expedientes con filtros por palabra clave y responsable. | Verified-static | `src/forms/Form_FormExpedientesBusqueda.cls` | 2026-06-15 |
| El objeto `Expediente` expone responsables, jurídicas, responsable de calidad, jefe de proyecto y riesgos. | Verified-static | `src/classes/Expediente.cls` | 2026-06-15 |
| El objeto `Riesgo` contiene campos de aceptación, retirada, mitigación, cierre y retipificación. | Verified-static | `src/classes/Riesgo.cls` | 2026-06-15 |
| El flujo de negocio de riesgos está probado. | Intended | No hay manifest dedicado localizado | 2026-06-15 |

**⚠️ Divergencias (intención SDD ≠ realidad del código)**
- Sin divergencia confirmada. Hueco: la app tiene modelo de riesgos rico, pero el contrato de negocio y las pruebas son insuficientes.
