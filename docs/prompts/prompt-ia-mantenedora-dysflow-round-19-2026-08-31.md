Eres la IA mantenedora de dysflow. Repo: `<tu ruta al repo dysflow>`. Base: `main` @ `5305452c`. Versión instalada: `v4.2.4`. Branch sugerida: `fix/formserializationnoise-docstring-namemap-1686`.

## Contexto del round

Round 19 = un único gap de documentación en el clasificador semántico, destapado durante el triaje de un falso positivo de una IA consumidora. No hay defecto funcional: el código es correcto y está bien testeado. Lo que falla es el docstring que describe ese código, y ese docstring ya provocó un diagnóstico erróneo en un consumer.

Rounds previos relevantes:
- Round 18 (2026-08-03): auditoría de código vivo, épica #1359 + issues #1353-#1358 — cerrado.
- `eb056c5b` "fix(verify): reduce Access export false positives" (2026-06-13): es el commit que introdujo el gap de este round. Su cambio de comportamiento es correcto y NO se revierte.

### El falso positivo que originó este round: issue #1685

Una IA consumidora (`DysTelefonica/GESTION_RIESGOS`, WT staging, HEAD `6a5cf7f`) abrió #1685 reportando que el round-trip `export_modules` + `import_modules` "elimina el bloque `NameMap` del `.form.txt`, randomiza `PrtDevMode`/`PrtDevModeW` y deja el form muerto por pérdida del binding de controles". Pedía idempotencia byte a byte (SHA1 idéntico) en `.cls`, `.form.txt` y `.accdb`, más un bump a `2.2.0`.

**Ese diagnóstico es falso y la issue ya está cerrada como `invalid`. NO la implementes. NO reabras ese contrato.** El desglose verificado, por si alguien vuelve a proponerlo:

1. **`export_modules` no elimina nada del `.form.txt`.** La ruta de export escribe la salida literal de `Access.Application.SaveAsText` (`scripts/dysflow-vba-manager.ps1:2456`). El único post-proceso es aditivo: `Ensure-AccessFormAutoResizeMarker` (`:2481`) y `Ensure-CodeBehindFormVbName` (`:2483`). Que `NameMap` desaparezca es comportamiento propio de `SaveAsText`: Access omite y regenera esa tabla binaria entre exports.
2. **La función que sí quita `NameMap` es exclusiva de comparación.** `stripFormSerializationNoise` (`src/core/services/vba-semantic-classifier.ts:226`) solo se alcanza vía `applyStructuralStrips` (`:514`) dentro de la cadena de `classifyDifference`. Nunca toca el disco.
3. **`PrtDevMode`/`PrtDevModeW`** son la estructura `DEVMODE` del driver de impresora: bytes dependientes de máquina, driver y memoria no inicializada. Cambian en cada `SaveAsText`. `Checksum` es derivado.
4. **Las diferencias del `.cls`** son del VBE: el export usa `CodeModule.Lines`, que por diseño no devuelve declaraciones ocultas como `Attribute VB_VarHelpID` (documentado en `scripts/dysflow-vba-manager.ps1:2507`); `pm` → `PM` es normalización de literales del propio parser.
5. **SHA1 idéntico del `.accdb` tras un import no es alcanzable.** `LoadFromText` obliga a Access a reescribir el objeto y reorganizar páginas y metadatos internos.

El contrato de idempotencia correcto para forms es **semántico, no de SHA1**: `verify_code` devuelve `hasFunctionalDifferences: false` con el delta clasificado como `formSerializationOnly`. Ese contrato ya se cumple.

**Por qué la IA consumidora se equivocó**: leyó el docstring de `stripFormSerializationNoise`, que le dijo que dysflow considera `NameMap` metadata funcional y la conserva. Eso es exactamente el gap de este round.

## Lo que YA funciona (NO tocar)

- **El comportamiento de `stripFormSerializationNoise` es correcto.** No quites `NameMap` de `FORM_NOISE_KEYS`. La decisión de `eb056c5b` es deliberada: Access omite y recrea `NameMap` entre exports sin cambiar comportamiento, y los cambios reales de nombre y control sobreviven en las líneas de propiedades y controles.
- **`GUID` es funcional** y NO debe entrar nunca en `FORM_NOISE_KEYS`.
- **`form-noise-keys.ts` es la fuente única de verdad** del conjunto, con re-export desde `vba-semantic-classifier.ts` y `form-ir-compare-service.ts` de forma que `Object.is(consumer.FORM_NOISE_KEYS, shared.FORM_NOISE_KEYS)` se mantiene. No dupliques el conjunto.
- **La ruta de export en PowerShell no se toca.** Sigue escribiendo `SaveAsText` literal, con normalizaciones únicamente aditivas.
- Tests existentes que fijan esta semántica y deben seguir verdes:
  - `test/core/services/vba-semantic-classifier.test.ts:84` y `:643`
  - `test/core/services/vba-source-comparison.test.ts:1723` y `:1962`
  - snapshot de membresía en `test/core/services/form-ir-compare.test.ts:72` y `:320`
- No reintroduzcas `compile_vba`: su eliminación es intencional (regla cross-project "human compiles").

## Lo que falta en este round

### Bug 1 (issue #1686): el docstring de `stripFormSerializationNoise` contradice al conjunto que la propia función recorre

#### Síntoma verificado

El docstring declara que la función **conserva** `NameMap` como metadata funcional, mientras `FORM_NOISE_KEYS` —el conjunto que `findNoiseKey` itera— **sí contiene** `"NameMap"`, por lo que el bloque se elimina. Además la lista de "Strips" está incompleta.

#### Evidencia de repro

`src/core/services/vba-semantic-classifier.ts:211-226`, literal:

```ts
/**
 * Strips known form/report serialization noise sections from form.txt and report.txt files.
 *
 * Strips:
 * - Scalar assignments: `Checksum = <value>` (single-line)
 * - Begin..End blocks for: PrtDevMode, PrtDevModeW, PrtDevNames, PrtDevNamesW, PrtMip, RecSrcDt
 *
 * Retains:
 * - NameMap (functional — LOCKED decision)
 * - GUID (functional)
 * - Everything else
 * - Any unknown Begin..End key (bias-to-functional)
 *
 * This normalizer is a no-op for bas, cls, frm files.
 */
export function stripFormSerializationNoise(text: string, fileType: string): string {
```

`src/core/services/form-noise-keys.ts`, el conjunto real que esa función recorre:

```ts
export const FORM_NOISE_KEYS: ReadonlySet<string> = new Set([
  "Checksum",
  "PrtDevMode",
  "PrtDevModeW",
  "PrtDevNames",
  "PrtDevNamesW",
  "PrtMip",
  "RecSrcDt",
  "LayoutCachedLeft",
  "LayoutCachedTop",
  "LayoutCachedWidth",
  "LayoutCachedHeight",
  "PublishOption",
  "NoSaveCTIWhenDisabled",
  "NameMap",
]);
```

Contradicciones concretas:
- `NameMap` figura en `Retains:` y está en el conjunto: se elimina.
- `LayoutCachedLeft`, `LayoutCachedTop`, `LayoutCachedWidth`, `LayoutCachedHeight`, `PublishOption` y `NoSaveCTIWhenDisabled` se eliminan y no figuran en `Strips:`.
- `Checksum` está listado solo como escalar; el matcher acepta ambas formas para cualquier clave.

Comando de verificación:

```bash
rg -n "NameMap" src/core/services/vba-semantic-classifier.ts src/core/services/form-noise-keys.ts
```

#### Root cause (verificado, no preliminar)

`git show eb056c5b -- src/core/services/vba-semantic-classifier.ts`:

```diff
- * NameMap and GUID are NOT in this list (they are functional).
+ * GUID is NOT in this list (it is functional). NameMap is stripped because
+ * repeated Access exports can omit/recreate it without changing behavior; real
+ * control/name changes still survive through the actual property/control lines.
```

Ese commit actualizó el docstring **del conjunto** y añadió `"NameMap"` al set, pero dejó intacto el docstring **de la función**, que sigue describiendo el comportamiento previo.

#### Riesgo

No hay riesgo funcional. El riesgo es de contexto para agentes, y ya se materializó: la issue #1685 es un round-trip completo de una IA consumidora perdido sobre un diagnóstico falso leído en ese docstring. `vba-semantic-classifier.ts` es de los primeros archivos que un agente abre para entender la política de ruido de forms, así que el fallo se repetirá en cada consumer del fleet que lea la función y no el conjunto.

#### Tests RED sugeridos

Test 1 es el que aporta valor duradero: convierte "el docstring coincide con el conjunto" en una invariante mecánica en vez de una promesa en un comentario.

```ts
it('stripFormSerializationNoise strips every key in FORM_NOISE_KEYS', () => {
  for (const key of FORM_NOISE_KEYS) {
    const withBlock = `Begin Form\n    Caption ="x"\n    ${key} = Begin\n        0xdeadbeef\n    End\nEnd`;
    const expected  = `Begin Form\n    Caption ="x"\nEnd`;
    const actual = stripFormSerializationNoise(withBlock, 'form.txt');
    expect(actual.replace(/\s+/g, ' ').trim()).toBe(expected.replace(/\s+/g, ' ').trim());
  }
});

it('stripFormSerializationNoise strips every scalar form of FORM_NOISE_KEYS', () => {
  for (const key of FORM_NOISE_KEYS) {
    const withScalar = `Begin Form\n    Caption ="x"\n    ${key} =1234\nEnd`;
    const expected   = `Begin Form\n    Caption ="x"\nEnd`;
    expect(stripFormSerializationNoise(withScalar, 'form.txt').replace(/\s+/g, ' ').trim())
      .toBe(expected.replace(/\s+/g, ' ').trim());
  }
});
```

Test 2 — guarda de no-regresión sobre lo funcional, para que nadie "arregle" el docstring metiendo `GUID` en el conjunto:

```ts
it('stripFormSerializationNoise retains GUID as functional', () => {
  const text = `Begin Form\n    GUID = Begin\n        0xc4073da1\n    End\nEnd`;
  expect(stripFormSerializationNoise(text, 'form.txt')).toContain('GUID');
  expect(FORM_NOISE_KEYS.has('GUID')).toBe(false);
});
```

#### Corrección esperada del docstring

1. `NameMap` sale de `Retains:`.
2. `Strips:` deja de duplicar la lista a mano: remite a `form-noise-keys.ts` como fuente única, o la enumera completa. Preferible lo primero — una lista duplicada a mano es lo que produjo este bug.
3. Se cita el razonamiento de `eb056c5b`: Access omite y regenera `NameMap` entre exports sin cambiar comportamiento; los cambios reales de nombre y control sobreviven en las líneas de propiedades y controles.
4. `Retains:` mantiene `GUID` como funcional y las claves desconocidas (`bias-to-functional`).

## Disciplina

- TDD estricto: RED → GREEN → REFACTOR. Los tests de invariante primero.
- Conventional commits, scope `core` o `verify`.
- No toques el comportamiento: este round es docstring + tests de invariante. Si el fix cambia la salida de `stripFormSerializationNoise` para cualquier entrada, has ido demasiado lejos.
- No dupliques `FORM_NOISE_KEYS` en ningún sitio nuevo.
- Issue-first: el PR lleva `Closes #1686`.

## Acceptance output

- PR contra `main` con `Closes #1686` y los tests de Bug 1 en verde, más la suite completa de `test/core/services/` sin regresiones.
- Docstring de `stripFormSerializationNoise` corregido según los 4 puntos de arriba.
- `rg -n "NameMap" src/` sin ninguna afirmación de que `NameMap` sea funcional o se conserve.
- Bullet en `CHANGELOG.md`: `Fix: correct the stripFormSerializationNoise docstring, which claimed NameMap was retained while FORM_NOISE_KEYS strips it, and lock the docstring-vs-set invariant with a membership test. (#1686)`.
- Version bump: **patch** (`v4.2.5`). Es docs + tests, sin cambio de comportamiento observable.
- Ciclo HR-14 completo: issue → worktree aislado → PR con CI verde → merge → close → borrado de worktree y rama.

## Quick start

```bash
cd <tu ruta al repo dysflow>
git checkout main && git pull
git checkout -b fix/formserializationnoise-docstring-namemap-1686
pnpm install
```

Reproducir la contradicción:

```bash
rg -n -A14 "Strips known form/report serialization noise" src/core/services/vba-semantic-classifier.ts
rg -n "NameMap" src/core/services/form-noise-keys.ts
# Esperado: docstring y conjunto coherentes.
# Actual: el docstring dice "Retains: NameMap (functional)"; el conjunto contiene "NameMap".
```

Suite objetivo:

```bash
pnpm exec vitest run test/core/services/vba-semantic-classifier.test.ts test/core/services/vba-source-comparison.test.ts test/core/services/form-ir-compare.test.ts
```

## Reinforcement

La regla cross-project que este fix debe preservar: **el ruido de serialización de Access se clasifica, no se reescribe**. Dysflow nunca reinyecta ni falsifica metadata que Access genera y regenera por su cuenta; lo que hace es decidir si un delta es funcional. Cualquier propuesta futura de "idempotencia byte a byte del round-trip de forms" viola esa regla y debe cerrarse citando #1685, no implementarse.
