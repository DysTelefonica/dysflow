# Capacidad: maestros y catálogos

## §0 Identidad
- **ID de capacidad**: `CAP-MASTER-CATALOGUES`
- **Tier**: standard
- **Estado**: active / inventario documental inicial
- **Source**: hybrid
- **Responsable / autoridad de producto**: Pendiente de confirmación — Calidad / administración de datos maestros
- **Última verificación**: 2026-06-15 mediante inspección estática; no se ejecutó Dysflow/Access
- **Confianza global**: mixta — algunos catálogos tienen pruebas registradas; otros solo nombres/código

## §1 Intención de negocio
- **Propósito**: Mantener vocabularios controlados para tipologías, motivos de control de eficacia, estados, técnicos, responsables, jurídicas y otros datos maestros.
- **Usuarios / perfiles**: Administradores/calidad, responsables de dominio, usuarios que filtran/listan NC.
- **Problema que resuelve**: Evita valores libres incompatibles y filtros rotos en formularios, indicadores e informes.
- **Valor de negocio / por qué existe**: Los catálogos son reglas de negocio: determinan clasificación, visibilidad, estados y controles.
- **No-objetivos**: No documenta el ciclo de vida completo de cada NC.
- **Origen de la intención**: Formularios/clases `Tipologia*`, `FormMotivosNoRequiereControlEficacia`, bootstrap de estado y tests issue-3/47.
- **Referencia de tracker de origen**: Issues #3, #24, #47, #67.

## §2 Contrato de comportamiento

### Escenarios (Dado / Cuando / Entonces)
- **DADO** que un usuario registra motivo de “no requiere control de eficacia” **CUANDO** confirma el formulario **ENTONCES** se emite `MotivoRegistrado` con el texto actual.
- **DADO** que se inicializa el catálogo de estados **CUANDO** faltan códigos esperados **ENTONCES** la carga debe fallar de forma explícita.
- **DADO** que se gestiona tipología de NC Proyecto **CUANDO** se abre desde menú de configuración **ENTONCES** solo usuarios autorizados acceden.
- **DADO** que se normalizan responsables o tipologías **CUANDO** se ejecutan operaciones de instalador/migración **ENTONCES** los valores resultantes deben ser idempotentes y verificables.

### Reglas de negocio
| ID regla | Enunciado (pretendido) | Autoridad | ¿Aplicada en código? | Prueba | Confianza |
|---|---|---|---|---|---|
| BR-CAT-1 | El motivo de no requerir control de eficacia tiene campos de dominio y persiste en NC Proyecto y NC Auditoría. | Tests issue-3 | Sí según manifest principal | `Test_MotivoNoRequiereControlEficacia_DomainFields_Atomic`, `Test_E2E_MotivoPersistencia_*`; no reejecutado | Verified-static |
| BR-CAT-2 | El formulario de motivos emite evento `MotivoRegistrado` con el valor actual. | Código exportado | Sí — `Form_FormMotivosNoRequiereControlEficacia` | FALTA → author via access-vba-tdd de contrato de formulario/costura | Verified-static |
| BR-CAT-3 | El catálogo de estados se crea/idempotente y conserva códigos esperados. | Tests issue-47 | Sí según manifests | `Test_EstadoCatalogo_*`; no reejecutado | Verified-static |
| BR-CAT-4 | La recarga de diccionario de estados falla si falta un código esperado. | Tests issue-47 | Sí según manifest principal | `Test_EstadoCatalogo_DictionaryReload_FailsOnMissingCode_Atomic`; no reejecutado | Verified-static |
| BR-CAT-5 | La gestión de tipología NC Proyecto está restringida a no técnicos/autorizados. | Código exportado | Parcial — menú bloquea técnicos para configuración | FALTA → author via access-vba-tdd | Verified-static |
| BR-CAT-6 | Catálogos de técnicos, responsables, jurídicas, proveedores y tipologías tienen contrato de alta/baja/edición y uso en filtros. | Producto pendiente | Desconocido/parcial por nombres | FALTA → author via access-vba-tdd tras inventario de esquema. Cross-link: misma matriz de cobertura referenciada por `users-permissions-navigation` BR-UPN-7 y `cross-cutting-support` BR-XCUT-6 | Intended |
| BR-CAT-7 | Normalizaciones de instalador para responsables/tipologías son idempotentes y no destruyen valores válidos. | Código exportado | Probable — `Instalador` tiene rutinas | FALTA → author via access-vba-tdd | Intended |

### Validaciones
- No añadir motivos vacíos si producto lo prohíbe — pendiente de confirmación.
- Estados esperados deben existir antes de confiar en cachés/listados.
- La edición de catálogos sensibles requiere permisos explícitos.

### Transiciones de estado
- `Catálogo ausente` --(`BootstrapEstadoCatalogo`)--> `Catálogo creado`.
- `Catálogo existente` --(`BootstrapEstadoCatalogo`)--> `Sin duplicados / idempotente`.
- `Motivo escrito` --(`ComandoAceptar`)--> `MotivoRegistrado`.

### Casos límite y de error
- Catálogo de estados incompleto debe fallar rápido, no degradar silenciosamente.
- Los catálogos con nombres parecidos (`Responsable`, `ResponsableCalidad`, `Técnico`) requieren esquema primero para evitar falsos positivos.

### Señales de aceptación / presencia
- Tests de motivo y estado pasan en staging actual.
- Cada catálogo usado por filtros/listas tiene página o sección con reglas, permisos y pruebas.

## §3 Mapa de implementación
- **Puntos de entrada de UI**: `Form_FormNCProyectoTipologiaGestion`, `Form_FormTipologiaNCProyecto`, `Form_FormMotivosNoRequiereControlEficacia`, `Form_Form0BDTecnicos`, menús de configuración.
- **Puntos de entrada de código**: `TipologiaNCProyectos`, `EstadoCatalogoBootstrap`, `Instalador`, `Entorno` colecciones `ColTipos`, `ColEstadosNC`, `ColUsuariosCalidad`, `ColJefesProyecto`, `Juridica`.
- **Datos afectados**: `TbTipologia`, tablas de estados, motivos no requiere CE, usuarios/técnicos/responsables/jurídicas/proveedores exactos pendientes de esquema.
- **Salidas**: combos, filtros, captions, validaciones de dominio.
- **Dependencias e integraciones**: control eficacia, listados, indicadores, expediente/responsables, usuarios/permisos.
- **Sincronización fuente↔binario**: no comprobada; tarea solo documental.
- **Valoración de diseño**: los catálogos están dispersos entre formulario, entorno e instalador. Para migración conviene centralizarlos como APIs de catálogo con permisos y versionado.

## §4 Receta de reconstrucción
1. Inventariar tablas reales de catálogo y sus FK antes de escribir fixtures.
2. Separar catálogos críticos: estados, tipologías, motivos CE, usuarios/técnicos/responsables, jurídicas/proveedores.
3. Crear pruebas de bootstrap/idempotencia/validación por catálogo.
4. Crear pruebas de UI/costura para formularios de gestión de catálogo solo donde aporten contrato de negocio.

## §5 Evidencia y trazabilidad
- **Tests**: `tests/tests.vba.json` contiene pruebas de motivo no requiere CE y estado catálogo; `tests/tests.vba.cache-readiness.json` contiene warm-up de catálogo de estados. No se reejecutaron.

| Elemento | Ref. tracker | Versión de staging (UAT) | Estado UAT | Release de producción | Fecha en producción | Nota |
|---|---|---|---|---|---|---|
| Motivo no requiere CE | Issue #3 | Pendiente | pending | Pendiente | Pendiente | Tests registrados. |
| Icono/botón motivos NR | Issue #24 | Pendiente | pending | Pendiente | Pendiente | Evidencia de issue closeout; capacidad funcional necesita prueba actual. |
| Catálogo de estados | Issue #47 | Pendiente | pending | Pendiente | Pendiente | Tests registrados. |
| Tipologías/técnicos/proveedores/responsables | Pendiente | Pendiente | pending | Pendiente | Pendiente | Falta inventario/pruebas. |

| Síntoma | Causa probable | Comprobación (Dysflow) | Ancla del documento |
|---|---|---|---|
| Estado desaparece de filtros/listados | Catálogo de estados incompleto | Reejecutar issue-47 | BR-CAT-3..4 |
| Motivo CE no persiste | Regresión de motivo no requiere CE | Reejecutar issue-3 | BR-CAT-1..2 |
| Tipología no editable o filtro roto | Catálogo sin contrato | Crear prueba de tipología | BR-CAT-5..6 |

## §6 Notas de migración web
- Tratar catálogos como recursos versionados y auditables.
- No mezclar normalizaciones puntuales de instalador con reglas permanentes de negocio.
- Exponer catálogos mediante APIs con permisos, no globals de entorno.
- Añadir migraciones de catálogo con idempotencia y rollback.

## §7 Registro de confianza
| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| Hay tests registrados para motivo no requiere CE. | Verified-static | `tests/tests.vba.json` | 2026-06-15 |
| Hay tests registrados para catálogo de estados. | Verified-static | `tests/tests.vba.json`, `tests/tests.vba.cache-readiness.json` | 2026-06-15 |
| Existe formulario de motivos que emite evento con el motivo. | Verified-static | `src/forms/Form_FormMotivosNoRequiereControlEficacia.cls` | 2026-06-15 |
| Catálogos de proveedores/técnicos/responsables están completamente especificados. | Intended | Falta inventario de esquema y pruebas | 2026-06-15 |

**⚠️ Divergencias (intención SDD ≠ realidad del código)**
- Sin divergencia confirmada. Hueco: hay catálogos visibles por nombres y tests parciales, pero falta contrato completo por catálogo.
