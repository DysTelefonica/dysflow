# PRUEBAS-001 — Deployment prep para Issue #19

> **Web**: `uat-acceptance.html` (commit `ac42ec5`, feature branch `feature/issue-67-final-fixes-2026-06-15`).
> **Tag UAT**: `PRUEBAS-001` · **Criterios**: v1.0.0 (checksum cyrb53 computado al cargar).
> **Feature**: Issue #19 — Posponer gate de `FechaPrevistaControlEficacia` al cierre de NC.
> **Recipient**: `andres.romandelperal@telefonica.com`.

## Pre-oficina (esta noche o mañana temprano)

1. **Merge de PRs #69 y #70 a `staging`** (si todavía no están mergeados).
   - `#69` (`fix/issue-67-catalog-2026-06-15` → `staging`): catálogo v2 + 7 commits de foundation.
   - `#70` (`feature/issue-67-final-fixes-2026-06-15` → `fix/issue-67-catalog-2026-06-15`, encadenado): 4 commits atómicos de Issue #18 + 9 commits de la épica de docs + UAT web.
   - Cuando #69 mergee, #70 se rebasea a `staging` automáticamente.

2. **Sincronización binaria** (post-merge en `staging`):
   - El `commit/access): retire dead class InformeNCAuditorias` (`53acb24`) borra `src/classes/InformeNCAuditorias.cls` pero **no borra la clase del binario** (los imports de Dysflow no eliminan módulos).
   - Acción manual: abrir VBE en `NoConformidades.accdb` → click derecho sobre `InformeNCAuditorias` → `Remove InformeNCAuditorias` → `No` (no exportar) → `Debug → Compile` → commit del binario nuevo.
   - Alternativa: `dysflow.delete_module` con `moduleName: "InformeNCAuditorias"` y `apply: true` (requiere `--enable-writes` en el MCP o `allowWrites: true` en `.dysflow/project.json`).

3. **Copiar la web a la lanzadera**:
   - Source (en el repo, post-merge a `staging`): `staging:docs/uat/PRUEBAS-001/uat-acceptance.html`.
   - Destino: `\\datoste\aplicaciones_dys\Aplicaciones PpD\0Lanzadera\recursos\uat-acceptance.html`.
   - Método: `Copy-Item` desde PowerShell o drag-and-drop desde el explorador de archivos.

4. **Ajustar el href del staging app** en la web:
   - Abrir `uat-acceptance.html` con un editor de texto.
   - Buscar `file:///\\datoste\aplicaciones_dys\Aplicaciones%20PpD\0Lanzadera\NoConformidades.accdb` (placeholder actual).
   - Reemplazar por la ruta UNC real del `.accdb` de staging en la lanzadera. Opciones típicas:
     - `file:///\\<servidor>\aplicaciones_dys\Aplicaciones%20PpD\0Lanzadera\NoConformidades.accdb`
     - `file:///\\<servidor>\aplicaciones_dys\Aplicaciones%20PpD\0Lanzadera\<carpeta-app>\NoConformidades.accdb`
   - El `href` queda como `<a href="..." target="_blank" rel="noopener">`; el validador hace click y Access se abre.

5. **Crear el acceso directo en la lanzadera**:
   - Click derecho en la carpeta `\\datoste\...\0Lanzadera\` → `Nuevo → Acceso directo`.
   - Ubicación: `\\datoste\aplicaciones_dys\Aplicaciones PpD\0Lanzadera\recursos\uat-acceptance.html`.
   - Nombre: `UAT — Issue #19 — Posponer gate FE al cierre de NC` (o el que prefieras).
   - Colocarlo **al lado del acceso directo existente del staging** (tal como pediste).

## En la oficina (mañana)

1. **Validador abre la web** desde el acceso directo de la lanzadera.
2. **Responde los 5 casos DADO/CUANDO/ENTONCES**:
   - UAT-1: Alta sin `FechaPrevistaControlEficacia` → ¿no bloquea?
   - UAT-2: Edición sin fecha → ¿no bloquea?
   - UAT-3: Cierre sin fecha → ¿bloquea con mensaje claro?
   - UAT-4: Cierre con fecha → ¿permite cerrar?
   - UAT-5: Bypass `MotivoAlta = "No requiere control de eficacia"` → ¿funciona?
3. **Escribe observaciones** en cada caso (especialmente si marca "No cumple": qué vio vs qué esperaba, pasos para reproducir).
4. **Rellena Nombre** (campo obligatorio para habilitar la descarga) y opcionalmente Cargo/área.
5. **Pulsa "Descargar registro"** — se baja un `.html` autocontenido con el veredicto.
6. **Pulsa "Enviar por correo"** — abre el cliente de correo con un `mailto:` pre-llenado (destinatario `andres.romandelperal@telefonica.com`, subject con verdict, cuerpo con criterios/checksum).
7. **Adjunta el `.html` descargado** al correo y envíalo.

## Post-oficina (cuando llega el correo)

- Si la aceptación es `ACEPTADO` (todos los casos pasan): merge de `staging` a `main` con PR de release; tag de producción.
- Si la aceptación es `RECHAZADO` (algún caso falla): abrir issue con el caso fallido, planear fix, nueva ronda UAT (`PRUEBAS-002`).
- En cualquier caso: actualizar `docs/capabilities/control-eficacia-workflow.md` §5 con el veredicto (cambiar `pending` por `passed` o `rejected`) y la fecha.

## Caveats / cosas a saber

- **El cache fix de Issue #18 NO entra en este UAT** (es infraestructura interna; UAT-testable solo con escenario de fallo artificial). Va a Dysflow `test_vba` con `filter=Issue18_*`, no a la oficina.
- **El retire de `InformeNCAuditorias.cls` NO se valida en el UAT** (se valida por binary sync manual arriba, paso 2). Si el binary sync falla, el usuario verá un error de "Sub or Function not defined" en el arranque de la app y el UAT no es ejecutable.
- **Manifest drift**: las 5 feature pages tienen un `Scope note` que indica que parte de su evidencia es histórica de `staging`. Esto NO afecta al UAT del Issue #19, que se mide contra `tests.vba.json` con `filter=issue-19` (13/13 PASS histórico en `8cb7f0a` y runtime fresco 2026-06-15).
- **Manifests faltantes en la rama de feature**: 10 manifests están en `staging` pero no en `feature/issue-67-final-fixes-2026-06-15`. Después del merge a `staging`, esos manifests vuelven a estar disponibles para runs de Dysflow. No afectan al UAT del Issue #19.

## Contacto

- Si hay problemas con el binario: ver `docs/inventory/anomalies-investigation.md` (anomalía #2) para el contexto del retire de `InformeNCAuditorias.cls`.
- Si hay problemas con los criterios o el UAT web: este `DEPLOY.md` + el cuerpo del commit `ac42ec5` tienen la info necesaria para regenerar.
- Si hay dudas sobre el alcance del UAT: el §5 del capability doc `control-eficacia-workflow.md` (commit `ac42ec5`) lista los 5 casos con su ID, criterio y resultado esperado.
