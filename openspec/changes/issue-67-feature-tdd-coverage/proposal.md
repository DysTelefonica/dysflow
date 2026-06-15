# Proposal: Cobertura documental + TDD para migración a web (Issue #67 cierre real)

> **Estado**: draft (2026-06-15)
> **Épica**: Issue #67 — docs(features): complete feature-by-feature regression ledger
> **Tracker**: #67 (`status:approved`, `type:feature`, `documentation`, `enhancement`)
> **Issue #18**: Issue #18 — caché de indicadores en backend (engranado, sub-épic dentro de la cobertura TDD)
> **Issue #45/#46**: FechaPrevistaControlEficacia postponement (sub-épic ya mergeado)
> **Rama de trabajo**: `feature/issue-67-final-fixes-2026-06-15` (PRs #69, #70 abiertos contra `staging`)
> **Autoridad de producto**: pendiente de confirmación; el cierre final requiere su firma
> **Source**: hybrid (SDD existente + ingeniería inversa contra el código de `src/`)

## §0 Resumen ejecutivo

Esta épica tiene **dos objetivos, no uno**, y deben leerse juntos:

1. **Objetivo de negocio — Migración a web**: la aplicación No Conformidades está construida como app Access/VBA legacy; el objetivo final es portar el comportamiento a una aplicación web moderna. Esto no es "convertir formulario a HTML" — es preservar el **contrato de negocio** y abandonar las **mecánicas legacy** que no deben copiarse (acoplamiento a `TempVars`, eventos de formulario que mutan estado global, ribbon como control de seguridad, lógica de cierre en eventos de UI, etc.).

2. **Objetivo técnico — Cobertura TDD**: para migrar sin arrastrar deuda ni romper invariantes, **toda regla de negocio necesita una prueba que la demuestre en verde**. Sin TDD, migraríamos comportamiento sin saber si el original funcionaba. El skill `access-vba-tdd` es el camino canónico para crear esas pruebas (Dysflow `test_vba`).

La documentación (`docs/capabilities/`, `docs/features/`, `openspec/REGRESSION-ANCHOR.md`, índice de capacidades) es el **medio**: sin docs con `§7 Registro de confianza` poblado y `§6 Notas de migración web` sustantivo, ni el equipo de producto puede validar la migración ni el equipo de ingeniería puede ejecutarla con seguridad.

## §1 Por qué ahora

- El catálogo v2 (`17524ed docs(capabilities): add v2-aligned capability catalog (issue #67)`) ya estableció la **estructura**: 14 capabilities + 7 features, secciones §0-§7 con plantilla canónica.
- `docs/capabilities/README.md` ya declara el estándar canónico de documentación y enumera los 8 principios rectores, incluido el #4 ("toda regla de negocio necesita una prueba") y el #8 ("facilitar la migración web").
- Lo que falta es **poblar** las secciones vacías, **descubrir features no documentadas** (inventario exhaustivo) y **probar** las reglas que el catálogo promete. Sin esto, "el catálogo está hecho" es una afirmación documental sin verificación.

## §2 Alcance (qué SÍ y qué NO)

### 2.1 SÍ entra

- **Inventario exhaustivo de features** leyendo el código (`src/classes/`, `src/forms/`, `src/modules/`, consultas) y cruzando contra los docs existentes. Resultado: una matriz de huecos (`docs/inventory/feature-matrix.md`) que diga "feature X → ¿documentada? → ¿probada? → ¿Verified-runtime/static/Intended?".
- **`docs/capabilities/index.md`** (o `capabilities-index.md`): registro maestro que mapea ID de capacidad → páginas en `docs/capabilities/` y `docs/features/` → tests en `tests/*.json` → módulos/formularios/tablas del código → trazabilidad release/UAT. Hoy no existe y el skill lo pide explícitamente.
- **TDD coverage** para cada regla de negocio sin test. Procedimiento: por cada BR en cada `docs/capabilities/*.md` con `Prueba = AUSENTE`, crear un test con `access-vba-tdd` (fixture-first, schema-first, sandbox-safe) hasta llegar a `Verified-runtime`.
- **§6 sustantivo en cada capability**: hoy la mayoría de los §6 son 3-5 bullets genéricos. Hay que poblarlos con: comportamiento a preservar, transformaciones a aplicar, mecánica Access a no copiar, preguntas abiertas al product owner.
- **§7 confianza completa**: hoy varios docs tienen §7 parcial. La regla es: cada hecho del §2 (reglas de negocio, escenarios, validaciones) debe tener su fila en §7 con confianza + evidencia + fecha.
- **Divergencias SDD↔código**: identificar y marcar como `Divergent` todo comportamiento que el código materializa distinto a lo que la intención SDD/producto declara. Hoy están dispersas; centralizarlas en el apply-progress y mencionarlas en `REGRESSION-ANCHOR.md`.
- **Documento de avance** de la épica (este `apply-progress.md` + este proposal).

### 2.2 NO entra

- **Migración a web en sí misma**. Esta épica **prepara** la migración; no la ejecuta. La ejecución será una épica posterior que arrancará desde aquí.
- **Refactor del código legacy**. Si una mecánica legacy debe morir en la migración, se documenta en §6 como "NO copiar" pero no se borra del binario legacy todavía.
- **Cambios funcionales al comportamiento actual**. Salvo que el inventario revele bugs (eso iría a Issue #N+1), esta épica no toca el código de negocio.
- **Cobertura de performance/load**. La épica verifica comportamiento, no rendimiento. El hook/lectura lentos en `Issue #18` ya están en deuda separada.

## §3 Acceptance criteria (qué tiene que ser cierto para cerrar la épica)

Cada criterio tiene que ser verificable con un comando Dysflow o un `git`/`ls` simple:

| # | Criterio | Forma de verificar |
|---|---|---|
| AC-1 | Existe `docs/capabilities/index.md` con todos los CAP-IDs del catálogo actual enlazados a sus páginas. | `test -f docs/capabilities/index.md && grep -c "CAP-" docs/capabilities/index.md` ≥ 14 |
| AC-2 | Existe `docs/inventory/feature-matrix.md` con ≥ 1 fila por feature del código, columnas: feature_key, capability_id, documented (Sí/No/Parcial), tested (Sí/No), confidence (Verified-runtime/Verified-static/Intended/Divergent), test_path. | Inspección visual de la matriz |
| AC-3 | Cada `docs/capabilities/*.md` (excepto `_template.md`) tiene `§6 Notas de migración web` con **≥ 4 bullets** que respondan: ¿qué se conserva? ¿qué se transforma? ¿qué NO se copia? ¿preguntas abiertas? | Conteo de bullets §6 por doc |
| AC-4 | Cada `docs/capabilities/*.md` tiene `§7 Registro de confianza` con **≥ 1 fila por regla de negocio del §2**. | `grep -c "^\| BR-" doc` ≈ `grep -c "^\| Hecho" doc` |
| AC-5 | **Cero** reglas de negocio con `Prueba = AUSENTE` y `Confianza = Verified-static` por más de una release. La salida es `Intended` con plan de prueba, o `Verified-runtime` con la prueba verde. | Recorrido del §2 de cada doc |
| AC-6 | Toda divergencia `Divergent` está documentada en `REGRESSION-ANCHOR.md` con un issue tracker y un plan de resolución. | Inspección de REGRESSION-ANCHOR |
| AC-7 | Cada BR con `Prueba = <ruta>` referencia un test que **corre en verde** contra el `staging` HEAD actual (Dysflow `test_vba` con manifest o filtro). | Salida de `dysflow.test_vba` |
| AC-8 | El `apply-progress.md` está actualizado con el estado de cada capability (`pending / in_progress / verified / archived`) y los SHAs de los commits de cobertura TDD. | Inspección visual |

## §4 Fases y dependencias

```
Fase 0 (esta noche)   ──► Fase 1 (1-2 sesiones) ──► Fase 2 (3-5 sesiones) ──► Fase 3 (1-2 sesiones)
  proposal +              Inventario +              TDD authoring por         Completar §6, §7,
  apply-progress          matriz de huecos          capability, paralelo      index.md, REGRESSION-
                                                    entre docs                ANCHOR, divergences
```

**Fase 0 — Bootstrap documental** (en curso):
- [x] Crear `openspec/changes/issue-67-feature-tdd-coverage/{proposal,apply-progress}.md` ← estamos acá
- [x] Cerrar la pasada estructural de Issue #67 (catálogo v2 + REGRESSION-ANCHOR) vía PRs #69/#70
- [ ] Vincular este proposal desde `REGRESSION-ANCHOR.md` (entrada de épica)

**Fase 1 — Inventario exhaustivo**:
- [ ] Inventariar features en `src/classes/*.cls` y mapear a capabilities
- [ ] Inventariar features en `src/forms/*.cls` y `*.form.txt` y mapear a capabilities
- [ ] Inventariar features en `src/modules/*.bas` y mapear a capabilities
- [ ] Cruzar inventario con docs/capabilities/ y docs/features/ existentes
- [ ] Producir `docs/inventory/feature-matrix.md`

**Fase 2 — TDD authoring** (paralela entre capabilities):
- [ ] Por cada BR sin test, crear test fixture-first con `access-vba-tdd`
- [ ] Correr con `dysflow.test_vba` y promover a `Verified-runtime`
- [ ] Documentar nuevo test en §5 de la capability
- [ ] Commitear trazabilidad (`SDD: feature-tdd-coverage / Issues: #18/#67`)

**Fase 3 — Completar docs y closeout**:
- [ ] Poblado sustantivo de §6 en cada capability (preservar / transformar / no copiar / preguntas)
- [ ] Poblado de §7 confianza en cada capability
- [ ] Crear `docs/capabilities/index.md`
- [ ] Actualizar `REGRESSION-ANCHOR.md` con entradas de épica
- [ ] Marcar `Divergent` las divergencias detectadas y enlazarlas
- [ ] PR final + merge

## §5 Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El inventario revela features no documentadas que cambian el scope | La Fase 1 produce la matriz antes de Fase 2; si el scope explota, re-cotizar y avisar al usuario antes de Fase 2 |
| Tests legacy no se pueden llevar a `Verified-runtime` por quirks DAO/Jet o dependencias COM | Documentar la anomalía como deuda (per `access-vba-tdd` regla), no como "fallo" — el caso `Test_Issue18_ReconstruirTodo_Idempotent_Atomic` ya marca el precedente |
| El manifest completo `tests/tests.vba.indicadores-caracterizacion.json` timeoutea | Trabajar por filtros/slices (ya es la práctica actual) y documentar en §5 de la capability |
| La autoridad de producto no responde a las preguntas abiertas de §6 | Acumular preguntas; si al cierre de Fase 3 siguen abiertas, marcar como `Intended` con referencia al issue y seguir |
| El usuario quiere migrar antes de cerrar TDD coverage | El acceptance criteria AC-5 es el guard: no cerrar la épica con `Verified-static` permanente; si urge migrar, abrir épica nueva y migrar SOLO lo `Verified-runtime` |
| Cobertura de Fase 2 toma más sesiones de las estimadas | Por diseño, Fase 2 es paralelizable entre capabilities; agrupar PRs por dominio (NC Proyecto, NC Auditoría, etc.) |

## §6 Decisiones que necesitan autoridad de producto (preguntas abiertas)

Estas NO son del autor del docs; tienen que ser respondidas por el responsable de producto/calidad:

1. **¿La "migración web" implica abandonar Access inmediatamente o coexistir durante una release de transición?** Esto define si el §6 dice "transformar a endpoint" o "duplicar comportamiento en paralelo".
2. **¿Qué catálogo de reglas de negocio es ground truth — el código o los documentos de producto originales?** Esto define quién arbitra las `Divergent` que aparezcan.
3. **¿Hay un issue/PR ya abierto para la migración web como épica separada?** Si sí, este proposal debe alinearse con su tracker; si no, conviene abrir uno y referenciarlo desde acá.
4. **¿Cuál es el SLA de las pruebas TDD — cuántas por release?** Esto dimensiona el esfuerzo de Fase 2 y debería entrar al plan de release staging/UAT.

## §7 Referencias y trazabilidad

- **Catálogo actual**: `docs/capabilities/README.md` (estándar canónico), `docs/capabilities/_template.md` (plantilla)
- **Skill**: `~/.config/opencode/skills/access-vba-capability-docs/SKILL.md`
- **TDD skill**: `~/.config/opencode/skills/access-vba-tdd/SKILL.md`
- **VBA skill**: `~/.config/opencode/skills/vba-access/SKILL.md`
- **REGRESSION-ANCHOR**: `openspec/REGRESSION-ANCHOR.md`
- **PRs encadenados abiertos**:
  - #69 — `fix/issue-67-catalog-2026-06-15` → `staging` (catalog v2 + foundation)
  - #70 — `feature/issue-67-final-fixes-2026-06-15` → `fix/issue-67-catalog-2026-06-15` (Issue #18 fix + REGRESSION-ANCHOR reconciliation)
- **Trabajo previo relacionado** (commits en `feature/issue-67-final-fixes-2026-06-15`):
  - `2ed53fb feat(NC): postpone FechaPrevistaControlEficacia gating to NC close (closes #45) (#46)`
  - `5c7b97b fix(issue-18-38-50): resolve 3 divergences in indicadores manifest`
  - `c2026f5 fix(audit): ComandoInforme_Click routes through EnsureNCAuditoriaGestionSelected`
  - `aabc636 chore(docs): add / refresh dysflow section in AGENTS.md`
  - `31221bb docs(capabilities): promote 3 indicator divergences to Verified-runtime`
  - `20afe6d docs(features): align feature pages with fresh runtime evidence`
  - `17524ed docs(capabilities): add v2-aligned capability catalog (issue #67)`
  - `18bc693 fix(indicators): propagate Issue #18 cache failures and add compat wrappers`
  - `c227fef docs(capabilities): update Issue #18/67 catalog with focused PASS + REGRESSION-ANCHOR reconciliation`
  - `68b30d7 docs(features): align feature pages with focused PASS + REGRESSION-ANCHOR presence`
  - `7adca2e chore(access): sync frontend binary with Issue #18 VBA source update`
- **Issue #67**: estado `OPEN`, labels `status:approved`, `type:feature`, `documentation`, `enhancement`
- **Project policy reminder**: este proyecto **no** usa `access-vba-sync`, `access-query` ni `jira-confluence-sdd`; el MCP de Dysflow es el camino canónico para verificar.
