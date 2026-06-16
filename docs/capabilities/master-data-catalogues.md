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

### §6.1 Conservar (comportamiento de negocio que debe sobrevivir)
- El motivo de "no requiere control de eficacia" persiste en NC Proyecto y NC Auditoría con sus campos de dominio (BR-CAT-1): la web debe seguir garantizando que un motivo registrado desde `Form_FormMotivosNoRequiereControlEficacia` se persista y se pueda consultar desde ambas trayectorias de NC.
- El evento `MotivoRegistrado` se emite con el valor actual del motivo al confirmar (BR-CAT-2): la web debe exponer un endpoint que registre el motivo y devuelva el evento/movimiento al consumidor, replicando el `ComandoAceptar_Click` del formulario.
- El catálogo de estados se crea/idempotente y conserva los códigos esperados (BR-CAT-3): `BootstrapEstadoCatalogo` debe seguir presente en el servicio de bootstrap; la web debe poder llamarlo y verificar que los códigos esperados están, sin duplicar.
- La recarga del diccionario de estados falla si falta un código esperado (BR-CAT-4): la web debe propagar el error con el código ausente, no degradar silenciosamente ni continuar con un catálogo incompleto.
- La gestión de tipología de NC Proyecto está restringida a no técnicos/autorizados (BR-CAT-5): la API web debe chequear el rol y devolver `403` para técnicos, replicando el bloqueo de menú de `Form_Form0BDOpcionesParteProyectos.cls`.
- Los catálogos de técnicos, responsables, jurídicas, proveedores y tipologías exponen contrato de alta/baja/edición y se usan en filtros (BR-CAT-6): la web debe permitir CRUD en cada catálogo, con permisos diferenciados, y mantener la integridad referencial con NC.
- Las normalizaciones de instalador para responsables/tipologías son idempotentes (BR-CAT-7): una migración que se ejecute dos veces sobre el mismo dataset no debe duplicar filas ni destruir valores válidos.

### §6.2 Transformar (mecanismo legacy que se reformula)
- Sustituir los formularios `Form_FormNCProyectoTipologiaGestion`, `Form_FormTipologiaNCProyecto`, `Form_FormMotivosNoRequiereControlEficacia`, `Form_Form0BDTecnicos` por endpoints REST `GET/POST/PUT/DELETE` con autenticación, autorización y versionado, no por formularios Access.
- Convertir `EstadoCatalogoBootstrap` en un job de bootstrap del backend con un endpoint `POST /catalogos/estados/bootstrap` que valide los códigos esperados, no por un módulo VBA ejecutado al abrir la app.
- Reemplazar el patrón "combos poblados desde `Entorno.Col*`" por catálogos servidos desde la API, cacheables en cliente con TTL, en lugar de colecciones globales en memoria.
- Mover la instalación/normalización de catálogos (`Instalador`) a migraciones versionadas de base de datos con `up`/`down` explícitos, no por rutinas in-process disparadas por eventos.
- Sustituir el conjunto disperso de catálogos (tipologías, motivos CE, técnicos, responsables, jurídicas, proveedores) por un único servicio de catálogos con discriminador `tipoCatalogo`, no por cinco clases paralelas.

### §6.3 NO copiar (deuda legacy de Access que no debe portarse)
- No portar la normalización puntual del instalador como regla permanente: la web debe distinguir entre "migración inicial" (idempotente) y "regla de negocio" (continua), y no mezclarlas.
- No usar la visibilidad de un menú como control de seguridad real para catálogos sensibles: la web debe aplicar permisos en el servidor, no en la UI.
- No exponer catálogos como colecciones en memoria (`ColTipos`, `ColEstadosNC`, `ColUsuariosCalidad`): la web debe servirlos desde base de datos o caché con TTL explícito, no mantenerlos como globales de proceso.
- No migrar la combinación `Entorno` + `Instalador` como única puerta de entrada: la web debe tener un servicio de catálogos con endpoints CRUD para cada tipo.
- No portar la duplicación entre "motivoCE" en `TbMotivosNoRequiereControlEficacia` y "tipología" en `TbTipologia` con la misma UI: la web debe tratarlos como catálogos independientes con UIs dedicadas, no como un único formulario genérico.

### §6.4 Preguntas abiertas al product owner
- ¿El catálogo de estados es el mismo para Proyecto y Auditoría o se diferencia? (BR-CAT-3) Confirmar lista canónica de estados por dominio.
- ¿Los motivos de "no requiere control de eficacia" son los mismos para NC Proyecto y NC Auditoría? (BR-CAT-1) ¿O cada dominio tiene su propio subconjunto?
- ¿La gestión de tipología NC Proyecto (BR-CAT-5) es por Calidad, por un rol específico, o por un permiso por proyecto? Confirmar la regla de rol.
- ¿Los catálogos de técnicos, responsables, jurídicas, proveedores y tipologías (BR-CAT-6) requieren workflow de aprobación o el alta/baja es directa?
- ¿La normalización del instalador (BR-CAT-7) tiene una fecha de corte o se mantiene corriendo en cada release? Hoy se ejecuta como parte de `Instalador`; ¿se mantiene ese patrón o se eliminará tras la primera migración?
- ¿Qué versión de cada catálogo debe quedar congelada cuando una NC se cierra? Confirmar si las NC cerradas deben "ver" el catálogo vigente al cierre o el actual.

## §7 Registro de confianza
| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| BR-CAT-1 — El motivo de no requerir control de eficacia tiene campos de dominio y persiste en NC Proyecto y NC Auditoría. | Verified-static | `Test_MotivoNoRequiereControlEficacia_DomainFields_Atomic`, `Test_E2E_MotivoPersistencia_*`; FALTA → reejecutar | 2026-06-15 |
| BR-CAT-2 — El formulario de motivos emite evento `MotivoRegistrado` con el valor actual. | Verified-static | `Form_FormMotivosNoRequiereControlEficacia`; FALTA → author via access-vba-tdd de contrato de formulario/costura | 2026-06-15 |
| BR-CAT-3 — El catálogo de estados se crea/idempotente y conserva códigos esperados. | Verified-static | Familia `Test_EstadoCatalogo_*` registrada en `tests/tests.vba.json`; FALTA → reejecutar | 2026-06-15 |
| BR-CAT-4 — La recarga de diccionario de estados falla si falta un código esperado. | Verified-static | `Test_EstadoCatalogo_DictionaryReload_FailsOnMissingCode_Atomic`; FALTA → reejecutar | 2026-06-15 |
| BR-CAT-5 — La gestión de tipología NC Proyecto está restringida a no técnicos/autorizados. | Verified-static | Menú bloquea técnicos para configuración; FALTA → author via access-vba-tdd | 2026-06-15 |
| BR-CAT-6 — Catálogos de técnicos, responsables, jurídicas, proveedores y tipologías tienen contrato de alta/baja/edición y uso en filtros. | Intended | FALTA → author via access-vba-tdd tras inventario de esquema; cross-link `users-permissions-navigation` BR-UPN-7 y `cross-cutting-support` BR-XCUT-6 | 2026-06-15 |
| BR-CAT-7 — Normalizaciones de instalador para responsables/tipologías son idempotentes y no destruyen valores válidos. | Intended | FALTA → author via access-vba-tdd | 2026-06-15 |
| Hay tests registrados para motivo no requiere CE. | Verified-static | `tests/tests.vba.json` | 2026-06-15 |
| Hay tests registrados para catálogo de estados. | Verified-static | `tests/tests.vba.json`, `tests/tests.vba.cache-readiness.json` | 2026-06-15 |
| Existe formulario de motivos que emite evento con el motivo. | Verified-static | `src/forms/Form_FormMotivosNoRequiereControlEficacia.cls` | 2026-06-15 |
| Catálogos de proveedores/técnicos/responsables están completamente especificados. | Intended | Falta inventario de esquema y pruebas | 2026-06-15 |

**⚠️ Divergencias (intención SDD ≠ realidad del código)**
- Sin divergencia confirmada. Hueco: hay catálogos visibles por nombres y tests parciales, pero falta contrato completo por catálogo.
