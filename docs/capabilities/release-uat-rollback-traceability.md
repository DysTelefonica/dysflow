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
- **Origen de la intención**: `docs/features/README.md`, `openspec/REGRESSION-ANCHOR.md` (presente en este checkout y reconciliado por `f122d9a chore(sdd): reconcile openspec config for capability catalog`) y reglas locales de trazabilidad SDD. La copia externa en `C:\00repos\documentacion\OPENSPEC\00_No_Conformidades` queda pendiente de verificación.
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
| BR-REL-1 | Ninguna feature se cierra sin página en `docs/features/` y, cuando exista, link en `openspec/REGRESSION-ANCHOR.md`; si el anchor falta en el checkout, debe quedar documentado como deuda de reconciliación. | Docs/features | Documental | FALTA → author via access-vba-tdd no aplica; crear check documental/script si procede | Verified-static |
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
- `docs/features/README.md` y, cuando esté disponible, `openspec/REGRESSION-ANCHOR.md` coinciden en gates; si el anchor no existe en el checkout, la ausencia está documentada como deuda.
- Huecos de prueba aparecen en una matriz priorizada.

## §3 Mapa de implementación
- **Puntos de entrada de UI**: no aplica; capacidad documental-operativa.
- **Puntos de entrada de código/documentación**: `docs/features/README.md`, `docs/capabilities/README.md`, páginas de capability, OpenSpec archives y la referencia pendiente a `openspec/REGRESSION-ANCHOR.md`.
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
| Regression anchor | Issue #67 | Reconciliado | reconciled | Pendiente | Pendiente | `openspec/REGRESSION-ANCHOR.md` presente y reconciliado por `f122d9a`; la fila de release/UAT/rollback queda pendiente hasta contar con tag UAT aprobado y release de producción. |
| Matriz de huecos capability | Issue #67 | Pendiente | pending | Pendiente | Pendiente | Actualizada en `docs/capabilities/README.md`. |
| `indicator-issues-cleanup` | Issue #67 / Issue #18 | Pendiente | pending | Pendiente | Pendiente | Evidencia mixta: slices verdes y focused PASS 2026-06-15 para reconstrucción completa/fallo post-escritura; manifest completo no verde, reachability Phase 3 y UAT/release pendientes. |
| `audit-backend-list-cache` | Issue #67 | Pendiente | pending | Pendiente | Pendiente | SHA de regresión resuelto (`ad96b95` en `staging`; equivalente `c2026f5` en la rama documental) y manifest/config reconciliado por `staging:openspec/config.yaml`; faltan UAT/release. |

| Síntoma | Causa probable | Comprobación | Ancla del documento |
|---|---|---|---|
| Feature “passing” pero falla UAT | Evidencia antigua o commit no alcanzable | Revisar regression anchor + manifests | BR-REL-2..3 |
| No se sabe qué revertir | Rollback anchor ausente | Revisar feature/capability release table | BR-REL-6 |
| Capacidad sin pruebas nuevas | Hueco no registrado | Revisar matriz de huecos | BR-REL-5 |

## §6 Notas de migración web

### §6.1 Conservar (comportamiento de negocio que debe sobrevivir)
- El modelo de trazabilidad `spec → implementación → tests → UAT tag → release → rollback` (BR-REL-1, BR-REL-3): la web debe seguir el mismo flujo, no reemplazarlo por un pipeline de CI sin gate de UAT. Toda capability debe tener al menos una página de feature en `docs/features/` y, cuando exista, link en `openspec/REGRESSION-ANCHOR.md`.
- La obligación de que `last_known_passing` sea prueba contra HEAD actual o commit staging verificado (BR-REL-2): la web no puede afirmar `passing` basándose solo en commit message; debe tener commit alcanzable desde `staging` y evidencia de ejecución reciente.
- La inmutabilidad del tag UAT: cada ronda UAT crea un tag `PRUEBAS-###` (BR-REL-4); el tag final aprobado es gate de producción. La web no debe permitir mover tags UAT ni reescribirlos; cada tag es un punto inmutable en la historia.
- La trazabilidad de cada capability: UAT, release, commit, pruebas y estado (BR-REL-5): la web debe mantener una fila por capability en su página, aunque esté pendiente, para que cualquier release/UAT pueda responder "qué versión tenía esta funcionalidad".
- El rollback como vuelta al release/tag anterior documentado (BR-REL-6): la web no debe permitir rollback a un commit arbitrario; debe ser siempre a un tag de producción anterior explícito y documentado.

### §6.2 Transformar (mecanismo legacy que se reformula)
- Sustituir los checks documentales manuales por un script de CI que verifique (a) presencia de página de capability, (b) presencia de página de feature, (c) commit alcanzable desde `staging`, (d) tag UAT aprobado, (e) fila de release/UAT.
- Convertir `docs/features/README.md` y `openspec/REGRESSION-ANCHOR.md` en una única fuente de verdad generada a partir del grafo de capabilities y features, no dos documentos mantenidos a mano.
- Reemplazar la convención "el responsable rellena la fila manualmente" por un check pre-merge que rellene automáticamente los campos de commit, fecha y manifest.
- Mover la matriz de huecos a un dashboard dinámico que refleje el estado actual de capabilities y sus tests, no una tabla estática en `docs/capabilities/README.md`.
- Sustituir el runbook de rollback (hoy en prosa) por un script versionado que automatice la reversión a un tag de producción y registre el resultado en una entrada de auditoría.

### §6.3 NO copiar (deuda legacy de Access que no debe portarse)
- No portar la convención de "tag UAT móvil": la web debe tratar cada `PRUEBAS-###` como inmutable, sin reescritura ni tag-force-push.
- No usar commit message como única evidencia de "passing": la web debe exigir que el SHA sea alcanzable desde `staging` y que el test haya corrido en verde contra ese SHA.
- No aceptar `passing` con base en evidencia antigua o commits no alcanzables: la web debe rechazar la promoción a `Verified-runtime` si la trazabilidad no está completa.
- No duplicar la fuente de verdad entre `docs/features/README.md` y `openspec/REGRESSION-ANCHOR.md`: la web debe tener un único origen y un consumidor.
- No migrar el patrón "rollback manual a un commit arbitrario" como camino normal: el rollback debe ser siempre a un tag de producción anterior explícito.

### §6.4 Preguntas abiertas al product owner
- ¿Cuál es la convención canónica de tags UAT? (BR-REL-4) ¿`PRUEBAS-###` numérico o incluye fecha/equipo?
- ¿El tag UAT se firma o queda como tag lightweight? Confirmar política de firma criptográfica.
- ¿Quién es el responsable de aprobar el tag UAT final como gate de producción? (BR-REL-4) ¿Es un rol específico (release manager) o un comité?
- ¿La fila de release/UAT de cada capability debe generarse automáticamente por CI o la rellena un humano? (BR-REL-5) Confirmar ownership.
- ¿El rollback de producción (BR-REL-6) se considera un evento de release normal o requiere un runbook separado? Hoy la web lo trata como un "release inverso".
- ¿La convención de "evidencia antigua sigue siendo `Verified-static`" se mantiene en la web, o se eleva a `Likely` por defecto tras N meses? Confirmar política de decaimiento.

## §7 Registro de confianza
| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| BR-REL-1 — Ninguna feature se cierra sin página en `docs/features/` y, cuando exista, link en `openspec/REGRESSION-ANCHOR.md`; si el anchor falta en el checkout, debe quedar documentado como deuda de reconciliación. | Verified-static | Documental; FALTA → check documental automatizable | 2026-06-15 |
| BR-REL-2 — `last_known_passing` debe ser prueba contra HEAD actual o commit staging verificado; evidencia de commit message no basta. | Verified-static | Documental; FALTA → check documental automatizable | 2026-06-15 |
| BR-REL-3 — Todos los commits de integración deben ser ancestros de `staging` antes de declarar `passing`. | Verified-static | Documental/proceso; FALTA → check Git en verify/archive | 2026-06-15 |
| BR-REL-4 — Cada ronda UAT crea tag inmutable `PRUEBAS-###`; el tag final aprobado es gate de producción. | Verified-static | `docs/features/README.md`; FALTA → checklist o script de release | 2026-06-15 |
| BR-REL-5 — Cada capability debe registrar UAT, release, commit, pruebas y estado. | Intended | Parcial en docs actuales; FALTA → completar filas en cada página cuando existan tags | 2026-06-15 |
| BR-REL-6 — Rollback de producción vuelve a release/tag anterior documentado. | Intended | `docs/features/README.md`; FALTA → runbook de rollback probado fuera de Access | 2026-06-15 |
| Existe política de UAT tags inmutables `PRUEBAS-###`. | Verified-static | `docs/features/README.md` | 2026-06-15 |
| Existe close-gate de commits alcanzables y evidencia fresca. | Verified-static | `docs/features/README.md`; `openspec/REGRESSION-ANCHOR.md` presente y reconciliado por `f122d9a` | 2026-06-15 |
| Todas las capabilities tienen evidencia release/UAT completa. | Intended | Muchas filas siguen pendientes | 2026-06-15 |

**⚠️ Divergencias (intención SDD ≠ realidad del código)**
- No aplica como divergencia de código. Riesgo documental: las filas UAT/release siguen mayoritariamente pendientes.
