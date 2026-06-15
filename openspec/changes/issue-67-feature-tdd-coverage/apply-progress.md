# Apply Progress — Cobertura documental + TDD para migración a web

> Cambio: `issue-67-feature-tdd-coverage`
> Proposal: `proposal.md`
> Inicio: 2026-06-15
> Estado global: **Fase 0 (bootstrap) en curso** — el proposal está creado pero Fase 1-3 pendientes

## §0 Resumen ejecutivo

| Fase | Estado | Avance | Última actualización |
|---|---|---|---|
| **Fase 0** — bootstrap documental | en curso | 80 % (falta vincular desde `REGRESSION-ANCHOR.md`) | 2026-06-15 |
| **Fase 1** — inventario + matriz de huecos | pendiente | 0 % | — |
| **Fase 2** — TDD authoring por capability | pendiente | 0 % | — |
| **Fase 3** — completar docs + index + closeout | pendiente | 0 % | — |

Aceptación de la épica: 8 criterios (AC-1 a AC-8) en `proposal.md` §3. Cierre real solo cuando los 8 estén en verde y el `REGRESSION-ANCHOR.md` esté poblado.

## §1 Estado de acceptance criteria (live)

| AC | Descripción | Estado | Evidencia |
|---|---|---|---|
| AC-1 | `docs/capabilities/index.md` con todos los CAP-IDs | ✅ completo | `a5af092 docs(capabilities): add master capabilities index per access-vba-capability-docs v2` — 14 capabilities, 19 lagunas, 2 divergencias |
| AC-2 | `docs/inventory/feature-matrix.md` ≥ 1 fila por feature | ❌ pendiente | archivo no existe; requiere lectura de `src/classes/`, `src/forms/`, `src/modules/` (43+48+25 archivos) |
| AC-3 | §6 sustantivo (≥ 4 bullets que respondan las 4 preguntas) por doc | 🟡 parcial | la mayoría de los §6 existen pero pocos llegan a 4 bullets sustantivos (ver §3) |
| AC-4 | §7 confianza ≥ 1 fila por BR del §2 | 🟡 parcial | la mayoría de los §7 existen pero varios están incompletos (ver §3) |
| AC-5 | Cero BR con `Verified-static` permanente | 🟡 parcial | varios BR `Intended` o `Verified-static` con `FALTA → crear mediante access-vba-tdd` (ver §3) |
| AC-6 | Toda `Divergent` en REGRESSION-ANCHOR con issue + plan | 🟡 parcial | 2 divergencias en `index.md` §3 (CAP-UPN BR-UPN-7, CAP-CE BR-CE-5/6); pendientes de referenciar en REGRESSION-ANCHOR con su issue |
| AC-7 | Cada BR con prueba corre en verde contra staging HEAD | 🟡 parcial | varios BR tienen tests, pero no todos los manifests corren completo (e.g. `tests/tests.vba.indicadores-caracterizacion.json` timeoutea como conjunto) |
| AC-8 | apply-progress.md actualizado con estado por capability | 🟡 parcial | este doc está recién creado; pendiente poblar tabla §2 |

## §2 Estado por capability (plantilla para poblar en Fase 1)

| CAP-ID | Capability | §2 BRs | §2 BRs con test | §6 sustantivo | §7 completo | Confidence global | Último commit cobertura | Notas |
|---|---|---|---|---|---|---|---|---|
| CAP-CFG | configuration-backends-runtime | ? | ? | 🟡 | 🟡 | mixed | pendiente | BR-CFG-5/6 son precondición |
| CAP-COM | communications-reports-exports | ? | ? | 🟡 | 🟡 | mixed | pendiente | privacidad BCC en §6 |
| CAP-CE | control-eficacia-workflow | ? | ? | 🟡 | 🟡 | mixed | 8cb7f0a (ancla histórica) | BR-CE-5/6 Intended |
| CAP-XCUT | cross-cutting-support | ? | ? | 🟡 | 🟡 | mixed | pendiente | BR-XCUT-6 cross-link |
| CAP-DGE | documents-generated-evidence | ? | ? | 🟡 | 🟡 | mixed | pendiente | preguntas abiertas §6 |
| CAP-EXP | expedientes-riesgos-responsables | ? | ? | 🟡 | 🟡 | mixed | pendiente | BR-EXP-6/7 cache-first |
| CAP-IND | indicators-dashboard | ? | ? | 🟡 | 🟡 | mixed | 18bc693 (Issue #18 final fix) | BR-IND-7 ahora `Verified-runtime focused`; manifest completo timeoutea |
| CAP-CAT | master-data-catalogues | ? | ? | 🟡 | 🟡 | mixed | pendiente | BR-CAT-6 cross-link |
| CAP-NCA-AF | nc-auditoria-actions-follow-up | ? | ? | 🟡 | 🟡 | mixed | pendiente | — |
| CAP-NCA-LC | nc-auditoria-lifecycle | ? | ? | 🟡 | 🟡 | mixed | pendiente | — |
| CAP-NCP-AF | nc-proyecto-actions-follow-up | ? | ? | 🟡 | 🟡 | mixed | pendiente | — |
| CAP-NCP-LC | nc-proyecto-lifecycle | ? | ? | 🟡 | 🟡 | mixed | pendiente | — |
| CAP-REL | release-uat-rollback-traceability | ? | ? | 🟡 | 🟡 | mixed | 18bc693 (REGRESSION-ANCHOR reconciliation) | BR-REL-1/2/3/4/5 Intended — checks documentales pendientes |
| CAP-UPN | users-permissions-navigation | ? | ? | 🟡 | 🟡 | mixed | pendiente | BR-UPN-1..6 sin manifest; BR-UPN-7 cross-link XCUT-6 |

(Las columnas `?` se poblarán en Fase 1 cuando se haga el inventario de cada §2.)

## §3 Huecos conocidos (a atacar en Fase 1-2)

### §6 incompletos (a expandir en Fase 3)

- Revisar cada `docs/capabilities/*.md` y contar bullets en §6. Los que tengan < 4 sustantivos hay que expandirlos.
- Necesario responder siempre a 4 preguntas:
  1. ¿Qué comportamiento de negocio se conserva tal cual en la web?
  2. ¿Qué se transforma (UI/form → endpoint, eventos → servicios)?
  3. ¿Qué mecánica Access legacy **no** se copia (TempVars, globals, eventos de formulario, ribbon como control)?
  4. ¿Preguntas abiertas al product owner/calidad?

### §7 incompletos (a expandir en Fase 3)

- Varios docs tienen §7 con 3-4 filas, no una por BR del §2. Hay que cruzar §2 BRs con §7 hechos y poblar.

### BR con `Prueba = AUSENTE` o `FALTA → crear mediante access-vba-tdd` (Fase 2)

- BR-CE-5, BR-CE-6 (`control-eficacia-workflow`) — flujo completo de resultados de eficacia
- BR-IND-8 (`indicators-dashboard`) — buckets del cuadro de mando aprobados por producto
- BR-REL-1..5 (`release-uat-rollback-traceability`) — checks documentales automatizables
- BR-UPN-1..6, BR-UPN-8 (`users-permissions-navigation`) — manifest dedicado de permisos/roles/navegación
- BR-XCUT-6 (`cross-cutting-support`) — matriz de permisos
- BR-DGE-1, BR-DGE-2 (`documents-generated-evidence`) — evidencia obligatoria al cierre
- BR-EXP-6, BR-EXP-7 (`expedientes-riesgos-responsables`) — riesgos cache-first
- Y posiblemente otros que aparezcan en el inventario de Fase 1.

### Divergencias (a marcar en Fase 3)

- BR-UPN-7: matriz de permisos producto vs permisos embebidos en formularios (ya mencionado en `users-permissions-navigation.md` §7 como "Hueco confirmado")
- BR-CE-5/6: comportamiento diferido del botón general de auditoría (ya mencionado como "Hueco sospechado" en `control-eficacia-workflow.md` §7)
- Cualquier divergencia nueva que el inventario revele.

## §4 Decisiones tomadas

- **2026-06-15**: Estructura de la épica = 4 fases (0 bootstrap, 1 inventario, 2 TDD paralelo, 3 closeout). Source = hybrid.
- **2026-06-15**: El objetivo dual (migración web + TDD coverage) es **explícito** y va en el §0 del proposal. No son "objetivos también" — son co-primarios.
- **2026-06-15**: El trabajo se hace vía PRs encadenados, no un solo PR monolítico (ver PRs #69 y #70 abiertos).
- **2026-06-15**: Las divergencias `Divergent` se centralizan en `REGRESSION-ANCHOR.md` además del §7 de cada doc, para tener un índice transversal.

## §5 Decisiones pendientes

- **Vinculación REGRESSION-ANCHOR**: ¿se agrega una entrada de épica con el SHA del proposal, o se deja hasta Fase 3? Mi recomendación: **agregar ahora** para que la épica sea localizable desde el anchor desde el día 1.
- **Capacities-index**: ¿se crea al final de Fase 1 (cuando el inventario esté cerrado) o al final de Fase 3 (cuando las docs estén completas)? Mi recomendación: **borrador al final de Fase 1, completo al final de Fase 3**.
- **Frecuencia de PRs en Fase 2**: ¿un PR por capability, un PR por dominio, o un PR por sprint de coverage? Mi recomendación: **un PR por capability** para que cada uno sea revisable independientemente, con `force-chained` si excede 400 líneas.

## §6 Trazabilidad de commits (sección viva)

| SHA | Asunto | Fase | ACs tocados | Notas |
|---|---|---|---|---|
| (Fase 0 — previos) | | | | |
| `17524ed` | docs(capabilities): add v2-aligned capability catalog (issue #67) | 0 | AC-3, AC-4 (estructura) | sienta la base de §6/§7 |
| `20afe6d` | docs(features): align feature pages with fresh runtime evidence | 0 | AC-7 | evidencia fresca por feature |
| `31221bb` | docs(capabilities): promote 3 indicator divergences to Verified-runtime | 0 | AC-7 | BR-IND-3/4 promovidos |
| `c2026f5` | fix(audit): ComandoInforme_Click routes through EnsureNCAuditoriaGestionSelected | 0 | — | fix de regresión de auditoría |
| `5c7b97b` | fix(issue-18-38-50): resolve 3 divergences in indicadores manifest | 0 | AC-7 | contratos divergentes previos resueltos |
| `aabc636` | chore(docs): add / refresh dysflow section in AGENTS.md | 0 | — | governance |
| `2ed53fb` | feat(NC): postpone FechaPrevistaControlEficacia gating to NC close (closes #45) (#46) | 0 | AC-7 | sub-épic cerrado |
| (Fase 0 — míos) | | | | |
| `18bc693` | fix(indicators): propagate Issue #18 cache failures and add compat wrappers | 0 | AC-7 | fix + wrappers compat |
| `c227fef` | docs(capabilities): update Issue #18/67 catalog with focused PASS + REGRESSION-ANCHOR reconciliation | 0 | AC-4, AC-6 | focused PASS para BR-IND-7 |
| `68b30d7` | docs(features): align feature pages with focused PASS + REGRESSION-ANCHOR presence | 0 | AC-4, AC-6 | correcciones de REGRESSION-ANCHOR |
| `7adca2e` | chore(access): sync frontend binary with Issue #18 VBA source update | 0 | — | paridad fuente↔binario |
| (Pendiente Fase 0) | | | | |
| `pendiente` | chore(openspec): link issue-67-feature-tdd-coverage from REGRESSION-ANCHOR | 0 | AC-6 | entrada de épica en anchor |
| (Fase 1) | | | | |
| `pendiente` | chore(inventory): add feature-matrix.md with all features | 1 | AC-2 | inventario base |
| (Fase 0 — cierre parcial) | | | | |
| `d8b8bee` | docs(openspec): bootstrap feature-tdd-coverage epic | 0 | AC-1..AC-8 (estructura) | proposal + apply-progress; entrada de épica en REGRESSION-ANCHOR queda en working tree por .gitignore |
| `a5af092` | docs(capabilities): add master capabilities index | 0 | AC-1 (completo) | 14 capabilities, 19 lagunas, 2 divergencias |
| (Fase 2 — uno por capability) | | | | |
| `pendiente` | test(vba): BR-CE-5/6 — flujo completo de resultados de eficacia | 2 | AC-5, AC-7 | access-vba-tdd |
| `pendiente` | test(vba): BR-IND-8 — buckets del cuadro de mando aprobados | 2 | AC-5, AC-7 | access-vba-tdd |
| `pendiente` | test(vba): BR-UPN-1..6 — manifest permisos/roles/navegación | 2 | AC-5, AC-7 | access-vba-tdd |
| (más conforme avance Fase 1) | | | | |
| (Fase 3) | | | | |
| `pendiente` | docs(capabilities): index.md maestro | 3 | AC-1 | navegación |
| `pendiente` | docs(capabilities): §6/§7 sustantivo por doc | 3 | AC-3, AC-4 | poblado final |
| `pendiente` | chore(openspec): archive issue-67-feature-tdd-coverage | 3 | AC-1..AC-8 | closeout |

## §7 Pendiente inmediato para la próxima sesión

1. **Decidir** sobre las 3 decisiones pendientes de §5.
2. **Vincular** este proposal desde `REGRESSION-ANCHOR.md` (entrada de épica).
3. **Fase 1**: arrancar el inventario leyendo `src/classes/*.cls`. Empezar por las clases de dominio: `NCProyecto.cls`, `NCAuditoria.cls`, `ACProyecto.cls`, `ACAuditoria.cls`, `ARProyecto.cls`, `ARAuditoria.cls`, `Expediente.cls`, `Riesgo.cls`, `TipologiaNCProyectos.cls`, `Usuario.cls`, `UsuarioAplicacionPermisos.cls`. Mapear cada método público a una BR o escenario.
4. **Fase 1 (continuación)**: leer `src/forms/*.cls` y mapear eventos de formulario a capabilities/BR. Particular cuidado con `Form_FormNCProyecto*.cls`, `Form_FormNCAuditoria*.cls`, `Form_Form0BDOpciones*.cls`, `Form_FormMotivosNoRequiereControlEficacia.cls`.
5. **Fase 1 (cierre)**: leer `src/modules/*.bas` prestando atención a `CacheNCProyecto.bas`, `ModuloCacheIndicadores.bas`, `InicializadorCache.bas`, `Funciones Generales.bas`, `Variables Globales.bas`, `constructor.bas`, `JSONHelper.bas`, `JsonConverter.bas`, `mdlCursor.bas`, `RiesgoServicio1.bas`, `RiesgoRepositorio.bas`, `IndicadorRepositorio.bas`, `constantes.bas`, `HTML.bas`, `Módulo1.bas`, `Instalador.bas`.
6. **Fase 1 (cierre)**: cruzar con `docs/capabilities/` y `docs/features/` existentes; producir `docs/inventory/feature-matrix.md`.

## §8 Riesgos activos (live)

- (mismos que proposal §5) Se re-evalúan al final de cada fase.
- **Nuevo 2026-06-15**: el manifest `tests/tests.vba.indicadores-caracterizacion.json` (55 procedimientos) timeoutea como conjunto. La estrategia es slices/filtros, pero si Fase 2 genera tests adicionales, hay que verificar que no incrementen el tiempo total más allá del timeout de Dysflow.
