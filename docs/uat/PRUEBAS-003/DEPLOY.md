# PRUEBAS-003 — Guía de despliegue y ejecución

> **Tag de staging**: `v0.1.0-staging.1` (commit `7fe71cb`, rama `staging`)
> **Versión de criterios UAT**: `0.1.0` (cyrb53 calculado en cada web al cargar)
> **Audiencia**: Natalia + equipo de calidad (UAT de usuarios) · Andrés (UAT técnica)

---

## 1. Contexto

Esta tanda cubre los **dos cambios funcionales** que entraron en `staging` respecto a `main`, más toda la tanda técnica que los soporta:

- **CR-1**: cuando una NC **no** requiere control de eficacia, hay que justificar el motivo antes de poder cerrar.
- **CR-2**: cuando una NC **sí** requiere control de eficacia, podés abrirla sin fecha prevista, pero el sistema te la exige al cerrar.
- Cambios de soporte: TUI PowerShell, tarea programada, 22 tests VBA, refactor de 9 forms y 12 clases nuevas (Services/Validators/VM).

El resto del refactor (capability docs, cache, sync, encoding) está documentado en `docs/uat/dev-internal-changes-2026-06-16-v010.md`.

---

## 2. Orden de ejecución

```
[A] Smoke test personal del dev (informal, ~20-30 min)
        ↓ si pasa todo
[B] UAT técnica (D-1 a D-12) — la firma el dev
        ↓ si pasa todo
[C] UAT de usuarios (UAT-1, UAT-2) — la firman Natalia + compis
        ↓ si pasa todo
[D] Merge a main + tag v0.1.0 → producción
```

**Si en cualquier paso falla algo, se para. No se avanza al siguiente.**

---

## 3. [A] Smoke test personal del dev (informal, sin documentar)

**Objetivo**: pisar la app antes que los compis, detectar regresiones del refactor, ganar confianza.

### 3.1 Smoke de los 4 forms refactorizados

Abrir el `.accdb` de staging y, para cada form, hacer las acciones principales:

| Form | Acciones a clickear |
|---|---|
| `Form_FormNCProyectoGestion` | Abrir → «Actualizar lista» (ojo, usa el nuevo `PrepareNCProyectoGestionRefresh`) → seleccionar NC → «Alta NC vinculada» → «Eliminar» → «Informe» |
| `Form_FormNCAuditoriaGestion` | Abrir → listar → seleccionar → «ComandoInforme» |
| `Form_FormNCProyectoSeguimiento` | Abrir → ver tareas |
| `Form_FormNCProyectoSeguimientoTareas` | Alta y listado |

**Si salta cualquier `Err.Raise 1000` o runtime error → hay regresión del refactor. NO se manda a QA.**

### 3.2 Smoke de las 2 funcionalidades nuevas (UAT-1, UAT-2)

- **UAT-1 (motivo de no CE)**: alta de NC → marcar «No» en CE → ver botón «Meter Motivos No CE» → intentar cerrar sin motivo → debe bloquearte.
- **UAT-2 (fecha prevista aplazada)**: alta de NC → marcar «Sí» en CE → dejar fecha vacía → guardar (debe dejar) → cerrar sin fecha (debe bloquearte).

### 3.3 Compilar VBA en Access VBE

`Alt+F11` → `Debug` → `Compile`. **Esperado: 0 errores.** Si hay alguno, NO se manda a QA.

### 3.4 Smoke rápido del TUI

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\cache-listado-nc-tui.ps1 -Action AuditOpen
```

Esperado: termina con sentinel `CACHE_TUI_CHILD_RESULT: OK action=AuditOpen` y crea un .txt nuevo en `scripts\reports\cache-listado-nc\`.

---

## 4. [B] UAT técnica — `docs/uat/PRUEBAS-003/dev-uat-acceptance.html`

**Quién la firma**: vos (dev).
**Qué cubre**: D-1 a D-12 (compilación, smoke de los 4 forms, TUI, scheduled task, tests VBA, source-binary sync, capabilities propuestos).
**Salida**: registro descargado en HTML + mail a `andres.romandelperal@telefonica.com`.

### 4.1 Cómo correrla

1. Abrir `docs/uat/PRUEBAS-003/dev-uat-acceptance.html` en Chrome/Edge.
2. Para cada tarjeta D-1 a D-12:
   - Leer la sección «Cómo probar / qué esperar» (incluye comandos concretos).
   - Correr los comandos en PowerShell / dysflow MCP.
   - Marcar «Sí, pasa» o «No pasa».
   - Dejar observaciones con la evidencia (output, IDs, etc.).
3. Poner tu nombre.
4. Descargar el registro y mandarlo por mail a `andres.romandelperal@telefonica.com`.

### 4.2 Criterio de aceptación

Las 12 tarjetas en **PASA**. Si alguna queda en NO PASA → NO se manda la UAT de usuarios; se arregla y se vuelve a empezar desde [A].

---

## 5. [C] UAT de usuarios — `docs/uat/PRUEBAS-003/uat-acceptance.html`

**Quién la firma**: Natalia + equipo de calidad.
**Qué cubre**: UAT-1 (motivo de no CE) y UAT-2 (fecha prevista aplazada).
**Salida**: registro descargado en HTML + mail a `andres.romandelperal@telefonica.com`.

### 5.1 Cómo pasarla

1. Asegurarse de que el smoke [A] y la UAT técnica [B] pasaron.
2. Mandarles a Natalia y compis el enlace a `docs/uat/PRUEBAS-003/uat-acceptance.html` (o el archivo adjunto).
3. Ellos abren en Chrome/Edge, marcan SÍ/NO en las 2 tarjetas, ponen su nombre, descargan el registro.
4. Te lo mandan por mail a `andres.romandelperal@telefonica.com`.

### 5.2 Criterio de aceptación

Las 2 tarjetas en **CUMPLE**. Si alguna queda en NO CUMPLE → se reportan las observaciones, se arregla, y se vuelve a la UAT con un **nuevo tag** (`v0.1.0-staging.2` o `v0.1.1-staging.1`).

### 5.3 Trazabilidad visible

La web lleva, en bloque separado, el tag `v0.1.0-staging.1` + commit `7fe71cb` + rama `staging`. El checksum cyrb53 se calcula sobre los criterios firmados; si los criterios cambian entre rounds, esta aceptación deja de ser válida.

---

## 6. [D] Merge a main + tag de producción

Una vez firmadas las dos UATs:

1. Merge `staging` → `main` con `--no-ff` (mantiene la traza del batch).
2. Crear el tag anotado: `git tag -a v0.1.0 -m "Release ..."` y push.
3. Cerrar los issues correspondientes en GitHub.
4. Avisar al equipo.

---

## 7. Estructura de esta carpeta

```
docs/uat/PRUEBAS-003/
├── uat-acceptance.html          ← UAT de usuarios (2 tarjetas, la firman Natalia + compis)
├── dev-uat-acceptance.html      ← UAT técnica (12 tarjetas, la firma el dev)
└── DEPLOY.md                    ← este archivo
```

La UAT de usuarios NO referencia la técnica ni viceversa. Son independientes y pueden firmarse por personas distintas.

---

## 8. Contacto y trazabilidad

- **Responsable del batch**: andres.romandelperal@telefonica.com
- **Tag**: `v0.1.0-staging.1`
- **Commit**: `7fe71cb`
- **Rama**: `staging` (congelada hasta aceptación final)
- **Repo**: github.com/DysTelefonica/No_conformidades
