<!--
ÍNDICE DE CAPACIDADES — registro maestro para navegación.
Vive en docs/capabilities/index.md. Una fila por capacidad.
Una IA lee ESTO primero para encontrar una capacidad y luego abre su documento.
Mantenlo sincronizado siempre que se añada, retire o cambie de tier/estado/confianza una capacidad.
Idioma: castellano de España. Los enums (tier/status/source/confianza) se mantienen tal cual.
-->

# Índice de capacidades

> Recordatorio de fuente de verdad: código + tests de Dysflow. Este índice es un mapa, no evidencia.

## Tabla principal

| ID capacidad | Nombre | Dominio | Tier | Estado | Source | Confianza global | ¿Pruebas en verde? | Última release de producción | Documento |
|---|---|---|---|---|---|---|---|---|---|
| CAP-NCP-LC | Ciclo de vida de NC Proyecto | NC-Proyecto-Lifecycle | critical | active | hybrid | mixed | 5/9 | Pendiente | [enlace](./nc-proyecto-lifecycle.md) |
| CAP-NCA-LC | Ciclo de vida de NC Auditoría | NC-Auditoria-Lifecycle | critical | active | hybrid | mixed | 5/7 | Pendiente | [enlace](./nc-auditoria-lifecycle.md) |
| CAP-NCP-AF | Acciones y seguimiento de NC Proyecto | NC-Proyecto-Acciones-Seguimiento | critical | active | hybrid | mixed | 2/7 | Pendiente | [enlace](./nc-proyecto-actions-follow-up.md) |
| CAP-NCA-AF | Acciones y seguimiento de NC Auditoría | NC-Auditoria-Acciones-Seguimiento | critical | active | reverse-engineered | mixed | 3/5 | Pendiente | [enlace](./nc-auditoria-actions-follow-up.md) |
| CAP-CE | Flujo de control de eficacia | Control-Eficacia | critical | active | hybrid | partial | 4/6 | Pendiente | [enlace](./control-eficacia-workflow.md) |
| CAP-IND | Cuadro de mando de indicadores | Indicadores | critical | active | hybrid | mixed | 7/8 | Pendiente | [enlace](./indicators-dashboard.md) |
| CAP-CAT | Maestros y catálogos | Maestros-Catalogos | standard | active | hybrid | mixta | 0/7 | Pendiente | [enlace](./master-data-catalogues.md) |
| CAP-DGE | Documentos y evidencia generada | Documentos-Evidencia | standard | active | hybrid | low-to-mixed | 0/6 | Pendiente | [enlace](./documents-generated-evidence.md) |
| CAP-EXP | Expedientes, riesgos y responsables | Expedientes-Riesgos | standard | active | reverse-engineered | mixta | 0/7 | Pendiente | [enlace](./expedientes-riesgos-responsables.md) |
| CAP-CFG | Configuración, backends y runtime local | Configuracion-Backends | critical | active | hybrid | mixta | 0/6 | Pendiente | [enlace](./configuration-backends-runtime.md) |
| CAP-UPN | Usuarios, permisos y navegación | Usuarios-Permisos | critical | active | reverse-engineered | mixta | 0/7 | Pendiente | [enlace](./users-permissions-navigation.md) |
| CAP-XCUT | Soporte transversal | Soporte-Cross-Cutting | standard | active | hybrid | mixed | 0/7 | Pendiente | [enlace](./cross-cutting-support.md) |
| CAP-COM | Comunicaciones, informes y exportaciones | Comunicacion-Informes-Exportaciones | standard | active | hybrid | mixta | 0/8 | Pendiente | [enlace](./communications-reports-exports.md) |
| CAP-REL | Trazabilidad UAT, release y rollback | Release-UAT-Rollback | standard | active | sdd | Intended | 0/6 | Pendiente | [enlace](./release-uat-rollback-traceability.md) |

> Notas sobre la tabla principal:
> - Los `CAP-ID` siguen la convención corta `CAP-NNN` usada en `openspec/changes/issue-67-feature-tdd-coverage/apply-progress.md` §2. Cada doc de capacidad define además un ID largo propio (por ejemplo `CAP-NCP-LIFECYCLE`); ambos referencian la misma capacidad.
> - "¿Pruebas en verde?" cuenta reglas con `Verified-runtime` (incluyendo `Verified-runtime focused`) sobre el total de reglas de la tabla §2 del doc. Los `Verified-static` figuran como deuda; ver sección de lagunas.
> - "Última release de producción" se mantiene en `Pendiente` para todas las capacidades: la épica `issue-67-feature-tdd-coverage` (Fase 0) aún no tiene tag UAT aprobado ni release de producción; la fila de release/UAT se completará en Fase 3.

## Lagunas de cobertura (obligaciones abiertas)

> Reglas que aún no están en `Verified-runtime`. Cada una es un test que crear con `access-vba-tdd`.
> La confianza actual se extrae de §2 y §7 de cada doc de capacidad; la acción por defecto es `Crear test con access-vba-tdd` salvo que el doc indique otra cosa.

| Capacidad | Regla | Confianza actual | Acción |
|---|---|---|---|
| CAP-CE | BR-CE-5 | Intended | Crear test con access-vba-tdd |
| CAP-CE | BR-CE-6 | Intended | Crear test con access-vba-tdd |
| CAP-IND | BR-IND-8 | Intended | Crear test con access-vba-tdd |
| CAP-REL | BR-REL-1 | Verified-static | Crear check documental automatizable (no test VBA runtime) |
| CAP-REL | BR-REL-2 | Verified-static | Crear check documental automatizable (no test VBA runtime) |
| CAP-REL | BR-REL-3 | Verified-static | Crear check documental automatizable (no test VBA runtime) |
| CAP-REL | BR-REL-4 | Verified-static | Crear check documental automatizable (no test VBA runtime) |
| CAP-REL | BR-REL-5 | Intended | Crear check documental automatizable (no test VBA runtime) |
| CAP-UPN | BR-UPN-1 | Verified-static | Crear test con access-vba-tdd |
| CAP-UPN | BR-UPN-2 | Verified-static | Crear test con access-vba-tdd |
| CAP-UPN | BR-UPN-3 | Verified-static | Crear test con access-vba-tdd |
| CAP-UPN | BR-UPN-4 | Verified-static | Crear test con access-vba-tdd |
| CAP-UPN | BR-UPN-5 | Verified-static | Crear test con access-vba-tdd |
| CAP-UPN | BR-UPN-6 | Verified-static | Crear test con access-vba-tdd |
| CAP-XCUT | BR-XCUT-6 | Intended | Crear test con access-vba-tdd |
| CAP-DGE | BR-DOC-1 | Intended | Crear test con access-vba-tdd |
| CAP-DGE | BR-DOC-2 | Intended | Crear test con access-vba-tdd |
| CAP-EXP | BR-EXP-6 | Verified-static | Crear test con access-vba-tdd |
| CAP-EXP | BR-EXP-7 | Intended | Crear test con access-vba-tdd |

> Notas sobre las lagunas:
> - En el doc de `users-permissions-navigation` solo existen las reglas `BR-UPN-1`..`BR-UPN-7`. La lista de huecos citaba `BR-UPN-8` pero esa regla no aparece en el doc; se omite para no inventar contenido.
> - En el doc de `documents-generated-evidence` el prefijo de las reglas es `BR-DOC-` (no `BR-DGE-` como aparece en la lista de huecos). Se mantiene el prefijo del doc para no corromper las referencias cruzadas.

## Divergencias pendientes de revisión humana

| Capacidad | Hallazgo | Detectada |
|---|---|---|
| CAP-UPN | BR-UPN-7 — la matriz completa de permisos por acción sensible (cerrar, eliminar, rehabilitar, documento, acción, informe, configuración) está aprobada por producto como `Intended`, pero las reglas de autorización siguen embebidas en formularios (`Form_Form0BDOpciones`, `Form_Form0BDTecnicos`, `Form_FormNCAuditoriaGestion`) sin trazabilidad de producto. El producto debe aprobar la matriz; hasta entonces no se puede ascender de `Intended`. | 2026-06-15 |
| CAP-CE | BR-CE-5 y BR-CE-6 — el botón general de auditoría (`Form_FormNCAuditoriaGeneral.ComandoControlEficaciaDatos_Click`) y el flujo completo de resultados de eficacia (motivo no requerido, eficacia fallida, replanificación, evidencia) están documentados como `Intended`. El comportamiento diferido del botón con `DatosGeneralesOK(p_MenosCef)` queda abierto: el spec no coincide con código probado, hace falta prueba de costura helper/servicio y validación de producto sobre el bypass previsto. | 2026-06-15 |
