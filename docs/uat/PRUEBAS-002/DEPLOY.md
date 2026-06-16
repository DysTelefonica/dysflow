# PRUEBAS-002 — Deployment prep para el release batch staging→producción 2026-06-16

> **Web**: `uat-acceptance.html` (generada en este commit, branch `feature/issue-67-final-fixes-2026-06-15`).
> **Tag UAT**: `PRUEBAS-002` · **Criterios**: v1.0.0 (checksum cyrb53 computado al cargar).
> **Feature**: Release batch staging→producción con 71 commits acumulados en `origin/staging` que aún no están en `origin/main`.
> **Recipient**: `{{RECIPIENT_EMAIL}}` (placeholder — reemplazar antes de enviar al validador).

## Alcance del release batch

71 commits en `origin/staging` no presentes en `origin/main`. Los commits user-visible cubiertos por este UAT son:

- **#45** — Posponer gate de `FechaPrevistaControlEficacia` al cierre de NC (5 casos UAT-1..UAT-5; re-validación de PRUEBAS-001 v1.0.0).
- **Fix de botón "Informe" en NC de auditoría** (commit `ad96b95`): el botón ahora usa `EnsureNCAuditoriaGestionSelected` en vez de armar el contexto ad-hoc. Cubre 1 caso UAT-6.
- **#51** — Carga diferida de indicadores de auditoría (commit `3243f65`): los indicadores cargan vía timer; la pantalla no se congela. Cubre 1 caso UAT-7.
- **Fix de regresiones en indicadores** (commit `bf97614`): restaura valores correctos en formularios `Form_Form0BDOpcionesAuditorias`, `Form_Form0BDOpcionesParteProyectos`, y los seguimientos. Cubre 1 caso UAT-8.

El resto de los cambios (Issue #18 cache de indicadores, refactors, tests, schema, docs) son internos y se documentan en `docs/uat/dev-internal-changes-2026-06-16.md` — NO se validan en oficina.

## Pre-oficina (esta noche o mañana temprano)

1. **Verificar merge de PRs #69 y #70 a `staging`** (si todavía no están mergeados).
   - `#69` y `#70` ya están MERGED al cierre de esta sesión.
   - Confirmar que el branch local `feature/issue-67-final-fixes-2026-06-15` está en sync con `origin/staging` después de push.

2. **Sincronización binaria** (post-merge en `staging`):
   - El binary Access `NoConformidades.accdb` debe contener los 5 módulos Test_* importados (commit `5f17e50`) y la clase muerta `InformeNCAuditorias` ya retirada (commit `8f59630`).
   - Si abrís VBE y aparece la clase `InformeNCAuditorias`: `dysflow.delete_module moduleName="InformeNCAuditorias" apply=true` (requiere `--enable-writes`).
   - Si todo OK: saltar al paso 3.

3. **Reemplazar el `{{RECIPIENT_EMAIL}}`** en `uat-acceptance.html` (línea ~210 en `UAT_META.recipient`).
   - **Default ya aplicado**: `andres.romandelperal@telefonica.com` (desarrollador, mismo patrón que PRUEBAS-001 v1.0.0). El mailto se arma con este valor; la web funciona out-of-the-box.
   - Si querés mandarlo al firmante de calidad (Natalia u otra persona), editar la línea `recipient:` en `UAT_META` antes de copiar a la lanzadera.

4. **(Opcional) Ajustar el href de la app en staging** si la ruta real del `.accdb` de staging no es `\\datoste\aplicaciones_dys\Aplicaciones PpD\0Lanzadera\NoConformidades.accdb`.
   - Editar la línea `<a href="file:///..."` en la cabecera de la web.

5. **Copiar la web a la lanzadera**:
   - Source (en el repo, post-merge a `staging`): `staging:docs/uat/PRUEBAS-002/uat-acceptance.html`.
   - Destino: `\\datoste\aplicaciones_dys\Aplicaciones PpD\0Lanzadera\recursos\pruebas-002.html` (o el nombre que prefieras).
   - Método: `Copy-Item` desde PowerShell o drag-and-drop.

6. **Crear el acceso directo en la lanzadera** (al lado del icono de staging de la app):
   - Click derecho en `\\datoste\...\0Lanzadera\` → `Nuevo → Acceso directo`.
   - Ubicación: `\\datoste\aplicaciones_dys\Aplicaciones PpD\0Lanzadera\recursos\pruebas-002.html`.
   - Nombre sugerido: `UAT — Release batch 2026-06-16`.

## En la oficina (mañana)

1. **Validador abre la web** desde el acceso directo de la lanzadera.
2. **Responde los 8 casos DADO/CUANDO/ENTONCES** en este orden:
   - UAT-1 a UAT-5: validación del cambio #45 (5 casos).
   - UAT-6: botón "Informe" en NC de auditoría.
   - UAT-7: indicadores de auditoría sin congelar la pantalla.
   - UAT-8: indicadores muestran contadores correctos.
3. **Escribe observaciones** en cada caso (especialmente si marca "No cumple": qué vio vs qué esperaba, pasos para reproducir).
4. **Rellena Nombre** (campo obligatorio para habilitar la descarga). NO requiere Cargo/área.
5. **Pulsa "Descargar registro"** — se baja un `.html` autocontenido con el veredicto (`ACEPTADO` o `RECHAZADO`).
6. **Pulsa "Enviar por correo"** — abre el cliente de correo con un `mailto:` pre-llenado al recipient que pusiste en UAT_META.
7. **Adjunta el `.html` descargado** al correo y envíalo.

## Post-oficina (cuando llega el correo)

- Si la aceptación es `ACEPTADO` (todos los 8 casos pasan): merge de `staging` a `main` con PR de release; tag de producción. Actualizar el §5 de los capability docs correspondientes:
  - `docs/capabilities/control-eficacia-workflow.md` (para #45)
  - `docs/capabilities/nc-auditoria-lifecycle.md` (para el fix de botón)
  - `docs/capabilities/indicators-dashboard.md` (para #51 + regresiones)
- Si la aceptación es `RECHAZADO` (algún caso falla): abrir issue con el caso fallido, planear fix, nueva ronda UAT (`PRUEBAS-003`).
- En cualquier caso: archivar `PRUEBAS-002/` → `docs/uat/archive/PRUEBAS-002/` y crear la entrada en el changelog de UATs.

## Caveats / cosas a saber

- **Los 8 casos son secuenciales y se responden en orden**. No hace falta re-abrir la app entre casos; cada uno es independiente.
- **El cache de Issue #18 NO entra en este UAT** (es infra interna; su cobertura está en Dysflow `test_vba` con `filter=issue-18` y los 22 tests de Fase 2 de la épica #67 que corren 22/22 verde).
- **El retire de `InformeNCAuditorias.cls` NO se valida en el UAT** (se valida por binary sync manual arriba, paso 2). Si el binary sync falla, el usuario verá "Sub or Function not defined" en el arranque de la app y el UAT no es ejecutable.
- **Las 11 issues abiertos en GitHub** (BR-IND-8, BR-UPN-7, etc.) son governance pendiente de producto, NO entran en este UAT (son contratos que aún no están firmados por el product owner).
- **Las 7 capabilities nuevas propuestas** (CAP-LOG, CAP-REP, CAP-BOOT, CAP-MAIL, CAP-TECH, CAP-EXCEL, CAP-NOTA en `_proposed/`) tampoco entran — no son código aún, son stubs esperando sign-off.
- **PR #58 (`feat/form-fncproyecto-cache-invalidation`)** sigue OPEN. No es bloqueante para este release (su contenido es ortogonal a los 4 cambios user-visible de arriba). Se puede mergear en un round posterior.

## Contacto

- Si hay problemas con el binario: ver `docs/inventory/anomalies-investigation.md` (anomalía #2) para el contexto del retire de `InformeNCAuditorias.cls`.
- Si hay problemas con la web o los criterios: este `DEPLOY.md` + el cuerpo del commit que generó `PRUEBAS-002/` tienen la info para regenerar.
- Si hay dudas sobre el alcance: la lista user-visible está en este `DEPLOY.md` §Alcance. Todo lo demás (cache, tests, refactors) está en `docs/uat/dev-internal-changes-2026-06-16.md`.
