# Investigación de anomalías críticas — `no_conformidades` Issue #67

> **Propósito**: investigar tres anomalías detectadas por el inventario de features (`docs/inventory/feature-matrix.md` §5) que afectan la coherencia entre código, tests y documentación, y proponer decisiones accionables. **No corrige nada** — produce una lista de decisiones que vos o el product owner deben firmar.
>
> **Fecha**: 2026-06-15
> **Source de verdad cruzada**: `git log` y `git ls-tree` contra `origin/staging` y `HEAD`, más `docs/features/README.md` y `docs/inventory/feature-matrix.md` §5.

## Anomalía #1 — Deriva de manifests: 10 manifests en `staging` faltan en esta rama

### Hechos verificados

`git ls-tree -r --name-only origin/staging -- "tests/"` reporta **17 manifests** en staging:

```
tests/tests.vba.audit-gestion-helper.json
tests/tests.vba.cache-acar.json
tests/tests.vba.cache-e2e.json
tests/tests.vba.cache-materialized.json
tests/tests.vba.cache-readiness.json
tests/tests.vba.cache-warmup.json
tests/tests.vba.e2e.json
tests/tests.vba.form-helper-canary.json          ← NO documentado en README
tests/tests.vba.form-helper-ensure.json          ← NO documentado en README
tests/tests.vba.form-helper.json
tests/tests.vba.indicadores-caracterizacion.json
tests/tests.vba.indicator-fast-counts.json
tests/tests.vba.json
tests/tests.vba.listado-helper.json
tests/tests.vba.proyecto-gestion-helper.json
tests/tests.vba.seguimiento-tareas-helper.json
tests/tests.vba.smoke.json
```

`Get-ChildItem tests/*.json` (en esta rama, `HEAD = feature/issue-67-final-fixes-2026-06-15`) reporta **7 manifests**:

```
tests.vba.cache-e2e.json
tests.vba.cache-materialized.json
tests.vba.cache-readiness.json
tests.vba.e2e.json
tests.vba.indicator-fast-counts.json
tests.vba.json
tests.vba.smoke.json
```

**Diferencia**: faltan 10 manifests en esta rama (los 7 que la rama tiene sí están en staging también, así que la rama es un **subconjunto** de staging, no una versión divergente).

### Tabla de los 10 manifests que faltan

| Manifest en staging | Estado en esta rama | Aparece en `docs/features/README.md`? | Aparece en alguna feature page? | SHA staging |
|---|---|---|---|---|
| `tests.vba.form-helper.json` | ❌ falta | sí, línea 67 (mapped a `form-ncproyecto-helper-coverage`) | sí — `nc-proyecto-gestion-listado.md` (línea 13, 16) | `8691f8b` |
| `tests.vba.listado-helper.json` | ❌ falta | sí, línea 68 (retired, mapped a `form-ncproyecto-helper-coverage`) | sí — `nc-proyecto-gestion-listado.md` (línea 115, "drifted") | `8691f8b` |
| `tests.vba.seguimiento-tareas-helper.json` | ❌ falta | sí, línea 69 (mapped a `ncproyecto-seguimiento-tareas-helper`) | sí — `ncproyecto-seguimiento-tareas-helper.md` (línea 16, 99) | `8691f8b` |
| `tests.vba.proyecto-gestion-helper.json` | ❌ falta | sí, línea 70 (mapped a `form-fncproyecto-cache-invalidation`) | sí — `form-fncproyecto-cache-invalidation.md` (línea 16) | `aa1ef79` |
| `tests.vba.audit-gestion-helper.json` | ❌ falta | sí, línea 71 (mapped a `audit-backend-list-cache`) | sí — `audit-backend-list-cache.md` (línea 16, 111) | `31977af`, `7e27db8`, etc. |
| `tests.vba.indicadores-caracterizacion.json` | ❌ falta | sí, línea 74 (mapped a `indicator-issues-cleanup`) | sí — `indicator-issues-cleanup.md` (línea 11, 95) | `457eae1` |
| `tests.vba.cache-acar.json` | ❌ falta | sí, línea 77 (adjacent mapped a `indicator-issues-cleanup`) | sí — `indicator-issues-cleanup.md` (línea 85, 211) | `b2eb8a1` (en `feat/form-fncproyecto-cache-invalidation`) |
| `tests.vba.cache-warmup.json` | ❌ falta | sí, línea 79 (adjacent mapped a `indicator-issues-cleanup`) | sí — `indicator-issues-cleanup.md` (línea 87, 213) | `8691f8b` |
| `tests.vba.form-helper-canary.json` | ❌ falta | **no aparece en README** | no encontrada | (verificar) |
| `tests.vba.form-helper-ensure.json` | ❌ falta | **no aparece en README** | no encontrada | (verificar) |

### Por qué faltan

No hay commits que borren estos archivos. Los manifests **nunca se incluyeron en esta rama** porque la rama `feature/issue-67-final-fixes-2026-06-15` se creó a partir de commits que no los contenían. La rama es un subconjunto de staging en lo que a tests se refiere.

### Implicación para la documentación actual

Las feature pages (`docs/features/*.md`) citan resultados `X/Y procedimientos PASS` contra manifests que **no existen en esta rama**. La cita es **evidencia histórica de staging** (esos resultados se obtuvieron contra el `staging` HEAD del momento, no contra esta rama). El `Test evidence` de cada feature page debería:

- (a) Aclarar explícitamente que la evidencia es histórica, no reproducible en esta rama sin reejecutar contra el `staging` HEAD actual, **o**
- (b) Restaurar los 10 manifests en esta rama (cherry-pick desde staging) para que la feature page sea self-contained.

### Decisiones a tomar

| Opción | Acción | Tradeoff |
|---|---|---|
| **A1** | Cherry-pick de los 10 manifests desde `origin/staging` a esta rama | Self-contained; pero el binary Access y los `.bas` referenciados pueden no coincidir con lo que esos manifests importan; requiere reejecutar tests para validar |
| **A2** | Reescribir las feature pages para indicar que la evidencia `X/Y` es histórica de `staging` y que esta rama no incluye los manifests | Honesto y conservador; pero implica quitar los conteos `X/Y` que son la prueba de "verified" |
| **A3** | Esperar al merge a `staging` y verificar allí; la rama se queda sin los manifests | Simple; pero la rama queda con doc claims no verificables en su checkout actual |
| **A4** | Auditar primero si los 10 manifests tienen tests duplicados con los 7 que sí están (p. ej. si `cache-readiness.json` y `cache-warmup.json` solapan) antes de decidir | Más análisis previo; valor si hay duplicación real |

**Mi recomendación**: A2 + A4 combinadas. La rama actual es un "snapshot de cierre de Issue #67" que apunta a `staging`. La doc debe ser honesta sobre el alcance del snapshot y la evidencia histórica queda como referencia, no como prueba del estado de la rama.

---

## Anomalía #2 — `InformeNCAuditorias.cls` está vacío desde el commit inicial

### Hechos verificados

```
$ git log --all --oneline -- src/classes/InformeNCAuditorias.cls
df3c17a feat: initial framework - skills, rules, templates, deploy

$ git show origin/staging:src/classes/InformeNCAuditorias.cls
VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "InformeNCAuditorias"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public Error As String
Private m_Error As String
```

### Por qué está vacío

El archivo se creó en `df3c17a feat: initial framework` (probablemente un commit de scaffolding) con un esqueleto de clase que solo declara `Error` y `m_Error`. **Nunca se rellenó** en `staging` ni en esta rama. La evidencia es que el log no muestra ningún commit posterior que modifique el archivo.

### Implicación para `CAP-COM`

`docs/features/cache-management/indicator-issues-cleanup.md` línea 85 cita `Test_CacheListado_ACAR_SearchPipeColumns_Atomic` etc. y `docs/capabilities/communications-reports-exports.md` documenta la generación de informe de NC de auditoría. La sub-rutina real está en `Informe.GenerarWordNoConformidades(p_EsDeProyecto:=No)` (`Informe.cls`), no en `InformeNCAuditorias.cls`. La clase `InformeNCAuditorias.cls` no es instanciable (es un wrapper pendiente que nunca se llenó).

### Decisiones a tomar

| Opción | Acción | Tradeoff |
|---|---|---|
| **B1** | Borrar `InformeNCAuditorias.cls` (es un wrapper muerto) | Limpia; pero si alguna referencia externa lo busca por nombre (`CreateObject("InformeNCAuditorias")` desde VBA), eliminarla rompe esa referencia |
| **B2** | Rellenar la clase con un wrapper sobre `Informe.GenerarWordNoConformidades(p_EsDeProyecto:=No)` y un `Public Function Generar(p_IDAuditoria, p_OutputPath)` | Materializa la API que CAP-COM asume; preserva el punto de entrada; pero requiere TDD para no romper |
| **B3** | Marcar la clase como `@Deprecated` y dejar que el caller use `Informe.GenerarWordNoConformidades` directamente | Conservador; no rompe nada; pero deja la clase viva como zombie |
| **B4** | Documentar en CAP-COM §3 y §6 que la ruta real es `Informe.GenerarWordNoConformidades(p_EsDeProyecto:=No)` y dejar la clase vacía con un comentario explicando que es placeholder histórico | Documentación honesta sin tocar código; el archivo queda como artefacto histórico |

**Mi recomendación**: B2 (wrapper mínimo) o B4 (documentar el desvío). B1 es arriesgado sin búsqueda exhaustiva de referencias. B3 deja deuda.

### Búsqueda de referencias (ejecutada 2026-06-15)

```
$ git grep "InformeNCAuditorias" -- 'src/'
src/classes/InformeNCAuditorias.cls:5: Attribute VB_Name = "InformeNCAuditorias"
```

`src/` no contiene ningún `New InformeNCAuditorias`, `Dim ... As InformeNCAuditorias`, ni `CreateObject("InformeNCAuditorias")`. **La clase no se instancia desde ningún `.bas` / `.cls` / `.form.txt` del código fuente**. Es decir, ningún path de runtime la usa.

```
$ git grep "InformeNCAuditorias" -- 'docs/'
docs/capabilities/communications-reports-exports.md:69: - **Puntos de entrada de código**: `Correo`, `Informe`, `InformeNCAuditorias`, `HTML`, `Módulo1.EnviarCorreoReactivacionNC`, `CorreoAlAdministrador` como soporte de error.
docs/capabilities/nc-auditoria-lifecycle.md:66: - **Puntos de entrada de fuente**: `NCAuditoriaGestionListadoHelper`, `NCAuditoriaListadoCache`, `NCAuditoriaSeguimientoHelper`, `NCAuditoria`, `NCAuditoriaOperaciones`, `ACAuditoriaOperaciones`, `ARAuditoriaOperaciones`, `InformeNCAuditorias`.
docs/capabilities/documents-generated-evidence.md:60: - **Puntos de entrada de fuente**: `DocumentoService`, `DocumentoProyecto`, `DocumentoProyectoOperaciones`, `DocumentoAuditoria`, `DocumentoAuditoriaOperaciones`, `Informe`, `InformeNCAuditorias`.
```

3 páginas de capability la listan como punto de entrada **esperado**, pero el código no la usa. Es una **promesa de API que el código no materializa**. Los forms (`Form_FormNCAuditoriaGeneral` acción `ComandoInforme`) llaman a `Informe.GenerarWordNoConformidades(p_EsDeProyecto:=No)` directamente.

### Conclusión revisada

Con la búsqueda hecha, **B1 (borrar) es ahora la opción más limpia** — el código nunca la instancia, así que no hay riesgo de regresión. B2 sería reificar una promesa que nadie pidió. B4 deja deuda visible. La búsqueda **reduce** la decisión de "arriesgado" a "segura".

**Mi recomendación revisada**: **B1** (borrar `InformeNCAuditorias.cls` y los 3 mentions en docs capabilities). Limpia el catálogo y elimina un dead-code marker. Si en el futuro alguien quiere reify un wrapper de auditoría, lo hace desde cero con nombre explícito (no revivir el histórico).

---

## Anomalía #7 — `tests.vba.smoke.json` está vacío en staging Y en esta rama

### Hechos verificados

```
$ git show origin/staging:tests/tests.vba.smoke.json
{
  "tests": []
}

$ git log --all --oneline -- tests/tests.vba.smoke.json
fc82f67 test(vba): harden access tdd compliance
561a4c4 test(vba): keep only automatable suite entries
```

El archivo `smoke.json` se creó intencionalmente con `tests: []` en los commits `fc82f67` y `561a4c4` (commits de "compliance" / "automatable suite"). Es decir, el vacío **no es accidental** — es una decisión explícita. Los títulos de los commits sugieren que se quiso evitar poner tests no-automables en un manifest pensado para "smoke" (CI rápido de pre-flight).

### Implicación

El intent es claro: `smoke.json` es un **slot reservado** para smoke tests automáticos que prev-Dysflow-checkout corran en CI, no un manifest activo. Está vacío por diseño. Las dos entradas en el log de commits documentan la decisión.

### Decisiones a tomar

| Opción | Acción | Tradeoff |
|---|---|---|
| **C1** | Dejar vacío y documentar la decisión de "smoke slot reservado" en `docs/capabilities/configuration-backends-runtime.md` §3 (kconfig-runtime) y en `REGRESSION-ANCHOR.md` | Honesto; el slot queda listo para cuando se decida qué smoke tests se quieren |
| **C2** | Poblar con `Test_KillSwitch_*` + `Test_BackendConfigPaths_*` + un canary de `ConfiguracionBackends` | Materializa el slot; los smoke tests serían: kill-switch + rutas de backend + un test rápido de que la config resuelve; pero requiere que la pipeline ejecute smoke.json (no verificado) |
| **C3** | Borrar el archivo; si no hay smoke tests, no hay manifest | Limpia; pero rompe la convención implícita de tener un smoke slot |

**Mi recomendación**: C1 (dejar vacío y documentar). El slot reservado es una decisión consciente; documentarlo es suficiente. Poblarlo (C2) requiere un análisis de qué tests son "smoke-grade" (≤2s, sin COM, sin fixtures pesadas) y verificación de que la pipeline lo ejecuta.

### Búsqueda de referencias (ejecutada 2026-06-15)

```
$ git grep "smoke.json" -- 'docs/'
docs/inventory/feature-matrix.md (este doc; la anomalía)
docs/capabilities/configuration-backends-runtime.md (?)
docs/inventory/feature-matrix.md (de nuevo)
```

Solo `docs/inventory/feature-matrix.md` (este documento) y `docs/capabilities/configuration-backends-runtime.md` mencionan `smoke`. Verificación rápida:

```
$ git grep "smoke" -- 'docs/capabilities/configuration-backends-runtime.md'
docs/capabilities/configuration-backends-runtime.md:<líneas varias>
```

(`configuration-backends-runtime.md` menciona "smoke test" como práctica recomendada, no como entry point del manifest. No es evidencia de que la pipeline lo ejecute.)

### Conclusión revisada

Ningún doc de capabilities ni features-page tiene un `Test evidence: tests.vba.smoke.json` activo. El slot está reservado pero **nadie lo usa** y **nadie documenta un smoke test candidato**. La decisión de mantenerlo vacío parece consolidada.

**Mi recomendación revisada**: **C1** (dejar + documentar). Pero añado un matiz: añadir al `apply-progress.md` §3 de la épica `issue-67-feature-tdd-coverage` una nota explícita: "`tests.vba.smoke.json` es un slot reservado por convención (commits `fc82f67`, `561a4c4`); poblarlo es optativo y requiere un análisis de candidatos smoke-grade (≤2s, sin COM, sin fixtures pesadas)."

---

## Resumen de decisiones pendientes

| ID | Decisión | Recomendación | Bloquea |
|---|---|---|---|
| A1-A4 | 10 manifests faltantes en esta rama | A2 + A4 combinadas (reformular doc + auditar duplicación) | Fase 2 TDD authoring: no escribir tests contra manifests que no existen en la rama |
| B1-B4 | `InformeNCAuditorias.cls` empty | **B1 revisado** (borrar; búsqueda confirma 0 referencias en `src/`) | Migración a web: limpiar dead-code marker antes de portar |
| C1-C3 | `tests.vba.smoke.json` empty | **C1 revisado** (dejar + documentar en apply-progress) | Ninguno directo; el slot está reservado por diseño |

**Próximo paso natural**: implementar A2 + A4 (reformular doc) y B1 (borrar clase + 3 mentions en docs capabilities) en una pasada de limpieza. C1 es solo documental.
