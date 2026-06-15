# Capacidad: trazabilidad UAT, release y rollback

## §0 Identidad
- **ID de capacidad**: `CAP-RELEASE-UAT-ROLLBACK`
- **Tier**: standard
- **Estado**: active / capacidad documental-operativa
- **Source**: sdd
- **Responsable / autoridad de producto**: Pendiente de confirmación — equipo de calidad / release
- **Última verificación**: 2026-06-15 mediante revisión documental; no se ejecutó Dysflow/Access
- **Confianza global**: `Intended` con reglas documentales `Verified-static`

## §1 Intención de negocio
- **Propósito**: Saber qué capacidad pasó en qué commit/tag UAT, qué release la llevó a producción y cómo diagnosticar o revertir una regresión.
- **Usuarios / perfiles**: Equipo de calidad, release manager, desarrolladores/agentes IA y revisores de UAT.
- **Problema que resuelve**: Evita afirmar “está hecho” con evidencias obsoletas o commits no alcanzables desde `staging`.
- **Valor de negocio / por qué existe**: Una release de calidad necesita trazabilidad desde petición → SDD → código → prueba → UAT → producción → rollback.
- **No-objetivos**: No ejecuta releases ni sustituye los gates de Git/SDD.
- **Origen de la intención**: `docs/features/README.md`, `openspec/REGRESSION-ANCHOR.md`, reglas locales de trazabilidad SDD.
- **Referencia de tracker de origen**: Issue #67 y política de UAT tags.

## §2 Contrato de comportamiento

### Escenarios (Dado / Cuando / Entonces)
- **DADO** una capacidad nueva o corregida **CUANDO** se declara lista para UAT **ENTONCES** debe tener pruebas frescas, commits alcanzables desde `staging` y fila de trazabilidad documental.
- **DADO** una ronda UAT **CUANDO** se promueve `staging` a pruebas **ENTONCES** se crea un tag inmutable `PRUEBAS-###`.
- **DADO** que UAT falla **CUANDO** se corrige staging **ENTONCES** se crea un nuevo tag UAT; no se mueve el anterior.
- **DADO** que producción falla **CUANDO** se requiere rollback **ENTONCES** se vuelve al release/tag de producción anterior documentado.

### Reglas de negocio
| ID regla | Enunciado (pretendido) | Autoridad | ¿Aplicada en código? | Prueba | Confianza |
|---|---|---|---|---|---|
| BR-REL-1 | Ninguna feature se cierra sin página en `docs/features/` y link en `openspec/REGRESSION-ANCHOR.md`. | Docs/features | Documental | FALTA → author via access-vba-tdd no aplica; crear check documental/script si procede | Verified-static |
| BR-REL-2 | `last_known_passing` debe ser prueba contra HEAD actual o commit staging verificado; evidencia de commit message no basta. | Regression anchor | Documental | FALTA → check documental automatizable | Verified-static |
| BR-REL-3 | Todos los commits de integración deben ser ancestros de `staging` antes de declarar `passing`. | Regression anchor + AGENTS | Documental/proceso | FALTA → check Git en verify/archive | Verified-static |
| BR-REL-4 | Cada ronda UAT crea tag inmutable `PRUEBAS-###`; el tag final aprobado es gate de producción. | Docs/features README | Documental | FALTA → checklist o script de release | Verified-static |
| BR-REL-5 | Cada capability debe registrar UAT, release, commit, pruebas y estado. | Capability standard | Parcial en docs actuales | FALTA → completar filas en cada página cuando existan tags | Intended |
| BR-REL-6 | Rollback de producción vuelve a release/tag anterior documentado. | Docs/features README | Documental | FALTA → runbook de rollback probado fuera de Access | Intended |

### Validaciones
- No usar `passing` si hay commits no alcanzables, evidencias antiguas o drift de manifest.
- No promover producción sin `approved_uat_tag`.
- No marcar `Verified-runtime` en capabilities sin evidencia Dysflow reciente.

### Transiciones de estado
- `Feature con pruebas verdes` --(`Docs actualizadas + reachability`)--> `Lista para UAT`.
- `Staging a UAT` --(`Crear PRUEBAS-###`)--> `UAT en curso`.
- `UAT aprobado` --(`Promoción main`)--> `Producción release`.
- `Producción fallida` --(`Rollback`)--> `Release anterior restaurada`.

### Casos límite y de error
- Commit funcional presente por export/reimport pero SHA original no ancestro: documentar equivalencia, no fingir reachability.
- Test histórico verde sin reejecución actual: `Verified-static`/`thin`, no `Verified-runtime`.

### Señales de aceptación / presencia
- Todas las páginas de capacidad tienen filas de release/UAT aunque estén pendientes.
- `docs/features/README.md` y `openspec/REGRESSION-ANCHOR.md` coinciden en gates.
- Huecos de prueba aparecen en una matriz priorizada.

## §3 Mapa de implementación
- **Puntos de entrada de UI**: no aplica; capacidad documental-operativa.
- **Puntos de entrada de código/documentación**: `docs/features/README.md`, `openspec/REGRESSION-ANCHOR.md`, `docs/capabilities/README.md`, páginas de capability, OpenSpec archives.
- **Datos afectados**: metadatos de Git, tags UAT/release, manifests, docs de trazabilidad.
- **Salidas**: tablas de release, anchors de rollback, matriz de huecos, close-gate evidence.
- **Dependencias e integraciones**: todas las capacidades y features.
- **Sincronización fuente↔binario**: no aplica salvo cuando la feature sea Access/VBA; entonces se registra importación + compilación manual + tests.
- **Valoración de diseño**: el proceso está bien definido en features/OpenSpec; faltaba elevarlo como capability transversal para que no se pierda durante auditorías documentales.

## §4 Receta de reconstrucción
1. Antes de declarar una capability completa, comprobar página capability + feature docs + OpenSpec + manifests.
2. Registrar commit, manifest, fecha, tag UAT, estado UAT, release y rollback en tablas de la página.
3. Si falta test, dejar `FALTA → author via access-vba-tdd` o check documental equivalente.
4. Si falta tag/release, dejar `Pendiente` sin inventar evidencia.

## §5 Evidencia y trazabilidad
- **Tests**: no aplica como runtime Access; requiere checks documentales/Git y evidencia Dysflow por capability concreta.

| Elemento | Ref. tracker | Versión de staging (UAT) | Estado UAT | Release de producción | Fecha en producción | Nota |
|---|---|---|---|---|---|---|
| Política de UAT tags | Issue #67 | Pendiente | pending | Pendiente | Pendiente | Documentada en `docs/features/README.md`. |
| Regression anchor | Issue #67 | Pendiente | pending | Pendiente | Pendiente | Documentado en `openspec/REGRESSION-ANCHOR.md`. |
| Matriz de huecos capability | Issue #67 | Pendiente | pending | Pendiente | Pendiente | Actualizada en `docs/capabilities/README.md`. |

| Síntoma | Causa probable | Comprobación | Ancla del documento |
|---|---|---|---|
| Feature “passing” pero falla UAT | Evidencia antigua o commit no alcanzable | Revisar regression anchor + manifests | BR-REL-2..3 |
| No se sabe qué revertir | Rollback anchor ausente | Revisar feature/capability release table | BR-REL-6 |
| Capacidad sin pruebas nuevas | Hueco no registrado | Revisar matriz de huecos | BR-REL-5 |

## §6 Notas de migración web
- Mantener el mismo modelo de trazabilidad para la migración: spec → implementación → tests → UAT tag → release → rollback.
- Automatizar checks documentales para no depender de memoria humana.
- No mezclar intención de producto con evidencia runtime; conservar niveles de confianza.

## §7 Registro de confianza
| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| Existe política de UAT tags inmutables `PRUEBAS-###`. | Verified-static | `docs/features/README.md` | 2026-06-15 |
| Existe close-gate de commits alcanzables y evidencia fresca. | Verified-static | `openspec/REGRESSION-ANCHOR.md` | 2026-06-15 |
| Todas las capabilities tienen evidencia release/UAT completa. | Intended | Muchas filas siguen pendientes | 2026-06-15 |

**⚠️ Divergencias (intención SDD ≠ realidad del código)**
- No aplica como divergencia de código. Riesgo documental: las filas UAT/release siguen mayoritariamente pendientes.
