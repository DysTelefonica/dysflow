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
| BR-EXP-4 | `Expediente.TextoExpediente` prioriza `Nemotecnico (CodExp)` y cae a `CodExp` si falta nemotécnico. | Tests `tests/tests.vba.cap-exp.json` | Sí — `Test_EXP_TextoExpediente_NemotecnicoYCodExp_FormateaConParentesis_Atomic`, `..._SoloNemotecnico_FormateaSinParentesis_Atomic`, `..._SoloCodExp_FormateaSinNemotecnico_Atomic` 3/3 PASS contra staging HEAD | Cubierto. Cache memoization cubierto por `..._CacheMemoization_ReutilizaCacheEnSegundaLectura_Atomic` (BR-EXP-5) | Verified-runtime |
| BR-EXP-5 | Un expediente puede exponer jurídicas, responsables, responsable de calidad, jefe de proyecto y riesgos asociados. | Tests `tests/tests.vba.cap-exp.json` | Sí — `Test_EXP_Expediente_ExponePropiedades_PropertiesRoundTrip_Atomic` valida 13/13 propiedades round-trip (`IDExpediente`, `Nemotecnico`, `CodExp`, `CodExpLargo`, `Titulo`, `Estado`, `CodProyecto`, `IDResponsableCalidad`, `IDUsuarioCreacion`, `IDUsuarioUltimoCambio`, `Ambito`, `Tipo`, `NPedido`) | Cubierto. Cache memoization cubierta por `..._CacheMemoization_ReutilizaCacheEnSegundaLectura_Atomic` | Verified-runtime |
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

### §6.1 Conservar (comportamiento de negocio que debe sobrevivir)
- El filtrado de la búsqueda de expedientes por palabra clave y responsable de calidad antes de seleccionar (BR-EXP-1): la web debe seguir exigiendo al menos uno de los dos filtros, o el `IDExpediente` directo, antes de devolver candidatos.
- La selección de expediente solo se completa cuando hay un expediente cargado con `IDExpediente` válido (BR-EXP-2): la API de selección debe rechazar intentos de "elegir" cuando no hay fila seleccionada, replicando el `ComandoElegir_Click` y `ListaFiltrados_Click` del VBA.
- Los responsables de calidad del combo de búsqueda proceden siempre de `m_ObjEntorno.ColUsuariosCalidad` (BR-EXP-3): la web no debe aceptar responsables arbitrarios; debe consultar un endpoint de "responsables de calidad" y limitar la búsqueda a ese dominio.
- `Expediente.TextoExpediente` prioriza `Nemotecnico (CodExp)` y cae a `CodExp` si falta nemotécnico (BR-EXP-4): la API REST debe mantener esa regla de presentación y nunca devolver un literal vacío.
- El expediente expone sus `Juridicas`, `Responsables`, `RESPONSABLECALIDAD`, `JefeProyecto` y `Riesgos` asociados (BR-EXP-5): la web debe serializar el expediente como agregado con sus vínculos, no como entidad aislada.
- La lectura de riesgos de NC Proyecto con semántica cache-first cuando la caché está cargada (BR-EXP-6): si la caché tiene el expediente/riesgo, se responde desde ella; cargado-vacío es válido, no es fallback a backend.

### §6.2 Transformar (mecanismo legacy que se reformula)
- Sustituir `Form_FormExpedientesBusqueda` por un endpoint REST `GET /expedientes?keyword=...&responsableCalidad=...` con paginación, retornando `{IDExp, Cod_Exp, Nemotécnico, Título}` y dejando que la UI pinte.
- Convertir la combinación `Expediente` + `ExpedienteResponsable` en un agregado de dominio, con `constructor.getExpediente(IDExp)` retornando el expediente hidratado con todas sus relaciones.
- Reemplazar el acceso a `m_ObjEntorno.ColUsuariosCalidad` por una API de catálogo de responsables de calidad, versionada y cacheable, no por un global mutado en runtime.
- Mover el ciclo de vida de riesgos a una máquina de estados explícita con comandos (`Aceptar`, `Mitigar`, `Materializar`, `Retirar`, `Cerrar`, `Retipificar`) y eventos versionados, en lugar de un objeto `Riesgo` con propiedades dispersas.
- Sustituir `RiesgoServicio` y `RiesgoRepositorio` por un servicio de dominio que reciba un comando, valide el estado origen, y devuelva el nuevo estado, no por un objeto con setters múltiples.

### §6.3 NO copiar (deuda legacy de Access que no debe portarse)
- No portar la dependencia de `m_ObjEntorno` y `m_ObjUsuarioConectado` como estado compartido implícito: la web debe inyectar el contexto del usuario al servicio, no leer de globals.
- No duplicar la lógica de "qué es un responsable de calidad" en cada formulario: la web debe tener un único servicio de "responsables" y un único catálogo de roles.
- No usar la selección de expediente por `OpenArgs` o un string opaco: la API web debe recibir `IDExpediente` (entero) en la URL.
- No migrar el patrón "consulta viva a backend si la caché está vacía" como ruta normal: en la web, cargado-vacío se responde vacío y se permite reintento explícito, no fallback silencioso.
- No usar `Form_formRiesgosSeleccion` como única puerta de entrada al riesgo: la API web debe permitir consultar riesgos por `IDExpediente` sin necesidad de un formulario de selección intermedio.

### §6.4 Preguntas abiertas al product owner
- ¿Cuáles son los estados canónicos del ciclo de vida de riesgos? (BR-EXP-7) Hoy se mencionan aceptación, mitigación, contingencia, materialización, retirada, cierre y retipificación — ¿están todos o hay otros?
- ¿Los riesgos asociados a NC Proyecto son siempre los mismos que los del expediente, o pueden existir riesgos solo de NC sin expediente? Confirmar cardinalidad.
- ¿Un expediente puede tener más de un responsable de calidad o es único? Hoy `ColUsuariosCalidad` parece ser colección; ¿la búsqueda debe permitir varios? (BR-EXP-3)
- ¿La relación `Riesgo → NC` es muchos-a-muchos o un riesgo está atado a una sola NC? (BR-EXP-5, BR-EXP-6)
- ¿`Nemotécnico` es obligatorio para todos los expedientes o puede estar vacío? Si está vacío, ¿se debe permitir crear la NC asociada? (BR-EXP-4)
- ¿La búsqueda por palabra clave aplica a `Nemotécnico`, `Cod_Exp` y `Título`, o solo a uno de ellos? Confirmar antes de definir el endpoint.

## §7 Registro de confianza
| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| BR-EXP-1 — La búsqueda de expedientes filtra por palabra clave y responsable de calidad antes de seleccionar. | Verified-static | `Form_FormExpedientesBusqueda.Filtrar`, `constructor.getExpedientesBusqueda`; FALTA → author via access-vba-tdd con fixtures de expedientes y responsables | 2026-06-15 |
| BR-EXP-2 — La selección de expediente solo emite evento si hay un expediente cargado; si no hay selección, no fuerza un objeto inválido. | Verified-static | `ComandoElegir_Click`, `ListaFiltrados_Click`; FALTA → author via access-vba-tdd | 2026-06-15 |
| BR-EXP-3 — Los responsables de calidad del combo proceden de `m_ObjEntorno.ColUsuariosCalidad`. | Verified-static | `EstablecerComboResponsablesCalidad`; FALTA → author via access-vba-tdd | 2026-06-15 |
| BR-EXP-4 — `Expediente.TextoExpediente` prioriza `Nemotecnico (CodExp)` y cae a `CodExp` si falta nemotécnico. | Verified-static | `Expediente.TextoExpediente`; FALTA → author via access-vba-tdd unitario | 2026-06-15 |
| BR-EXP-5 — Un expediente puede exponer jurídicas, responsables, responsable de calidad, jefe de proyecto y riesgos asociados. | Verified-static | Propiedades `Juridicas`, `Responsables`, `RESPONSABLECALIDAD`, `JefeProyecto`, `Riesgos`; FALTA → author via access-vba-tdd con esquema primero | 2026-06-15 |
| BR-EXP-6 — Los riesgos asociados a NC Proyecto deben leerse con semántica cache-first cuando la caché está cargada. | Verified-static | `tests/tests.vba.cache-e2e.json` 7/7 PASS (2026-06-14, staging `20b71f64`); referencia archivada en `docs/features/cache-management/trust-ncproyecto-cache-hits.md`; FALTA → reejecutar | 2026-06-15 |
| BR-EXP-7 — El ciclo de vida propio de riesgos — aceptación, mitigación, contingencia, materialización, retirada, cierre y retipificación — está definido y probado. | Intended | FALTA → author via access-vba-tdd tras confirmar estados | 2026-06-15 |
| Existe una UI de búsqueda/selección de expedientes con filtros por palabra clave y responsable. | Verified-static | `src/forms/Form_FormExpedientesBusqueda.cls` | 2026-06-15 |
| El objeto `Expediente` expone responsables, jurídicas, responsable de calidad, jefe de proyecto y riesgos. | Verified-static | `src/classes/Expediente.cls` | 2026-06-15 |
| El objeto `Riesgo` contiene campos de aceptación, retirada, mitigación, cierre y retipificación. | Verified-static | `src/classes/Riesgo.cls` | 2026-06-15 |
| El flujo de negocio de riesgos está probado. | Intended | No hay manifest dedicado localizado | 2026-06-15 |

**⚠️ Divergencias (intención SDD ≠ realidad del código)**
- Sin divergencia confirmada. Hueco: la app tiene modelo de riesgos rico, pero el contrato de negocio y las pruebas son insuficientes.
