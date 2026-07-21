# Round 13 — `run_vba`: procedimiento inexistente aplanado a `RUNNER_FAILED` y diagnóstico con mojibake

**Tool:** dysflow MCP  
**Mode:** bug-hunt / bug-regression  
**Variant:** medium  
**Versión observada:** v2.20.0  
**Consumer:** `DysTelefonica/Expedientes`, proyecto Engram `expedientes`  
**Issue GitHub:** https://github.com/DysTelefonica/dysflow/issues/1045

## Contexto del round

Round 13 es el segundo slot libre posterior al round-5/#1040, después de reservar round 11 para el gap de aliases. El round-5/#1040 sigue siendo independiente y no se mezcla con este problema de `run_vba`.

La búsqueda de duplicados no encontró una issue para `run_vba` que clasifique la ausencia de un procedimiento como error tipado. #703 trata una herramienta distinta (`validate_manifest`); #496 trata la serialización genérica de `Write-DysflowResult`; #749 trata un falso bloqueo de `dryRun`. Este round solicita un preflight y una taxonomía específica para `run_vba`.

## Lo que YA funciona — NO tocar

- Un procedimiento existente debe seguir ejecutándose con los mismos argumentos y semántica de `apply`.
- Un fallo real del runner o de Access debe conservar su diagnóstico y no quedar falsamente clasificado como ausencia de procedimiento.
- El allowlist de `run_vba`, HR-1 (humano compila), HR-2, HR-3, HR-6 y HR-8 permanecen intactos.
- El cambio debe limitarse a la detección de procedimiento inexistente y al transporte/encoding del error; no incluir superficies no reproducidas.

## Gap B — missing procedure y encoding incorrecto

### Síntoma verificado

El procedimiento `DumpWhereForTest` no existe en el binario `Expedientes.accdb`, pero `run_vba` invoca el runner y aplana la causa conocida a `RUNNER_FAILED`. Además, el mensaje de PowerShell llega con el carácter de reemplazo `�` en lugar de `ó`.

### Evidencia literal de reproducción

Llamada `run_vba`:

```json
{
  "projectId": "expedientes",
  "procedureName": "DumpWhereForTest",
  "argsJson": "[]",
  "apply": true
}
```

Salida literal:

```text
RUNNER_FAILED: PowerShell runner failed with exit code 1: Excepci�n al llamar a "Run" con los argumentos "31": "EXPEDIENTES no encuentra el procedimiento 'DumpWhereForTest'."
```

### Comportamiento esperado

1. Resolver/verificar la existencia del procedimiento antes de lanzar la ejecución COM/PowerShell cuando el runtime pueda hacerlo de forma fiable.
2. Devolver un error typed `PROCEDURE_NOT_FOUND` o el código canónico equivalente para la ausencia conocida, con envelope estructurado y encoding UTF-8 correcto.
3. Mantener `RUNNER_FAILED` para fallos reales del runner que no sean una ausencia conocida.
4. Entregar texto Unicode sin mojibake en el código, mensaje y detalles anidados del error.

### Tests RED obligatorios

1. **Missing procedure:** un procedimiento ausente en el binario devuelve `ok:false` y el código canónico de procedimiento inexistente; no devuelve únicamente `RUNNER_FAILED` y no arranca el runner.
2. **Existing procedure:** un procedimiento público existente con `argsJson:"[]"` sigue recorriendo el camino normal y devuelve el resultado esperado; el preflight no produce falsos positivos.
3. **Encoding:** el error de ausencia y un fallo runner controlado preservan `Excepción` y el resto de caracteres Unicode sin `�`, pérdida de bytes ni sustitución de encoding.
4. **No-regresión:** los fallos genuinos de PowerShell/Access siguen siendo observables con su taxonomía y detalle originales, y la validación de allowlist/`apply` no cambia.

## Disciplina

- TDD estricto: tests RED contra v2.20.0, luego GREEN y REFACTOR.
- Conventional commit sugerido: `fix(run-vba): classify missing procedures before runner execution`.
- No convertir todo `RUNNER_FAILED` en `PROCEDURE_NOT_FOUND`: la clasificación debe basarse en una ausencia verificada.
- No introducir ni documentar capacidades cuya reproducción literal no está incluida en este round.

## Acceptance output

- PR con los tests de missing procedure, existing procedure, encoding y no-regresión en verde.
- `CHANGELOG.md` actualizado con la nueva clasificación y la corrección de encoding.
- Version bump obligatorio, justificado por el maintainer; un nuevo error público normalmente requiere minor.
- Documentación del código canónico y del envelope de `run_vba` actualizada.
- Body del PR con una declaración explícita de no-regresión: solo la ausencia conocida cambia a error tipado; los fallos reales del runner mantienen su diagnóstico.

## Quick start

```bash
git checkout -b fix/run-vba-procedure-not-found
pnpm install
pnpm test
```

Reproducir contra el runtime de desarrollo con la llamada JSON de este prompt. El resultado anterior al fix es la línea `RUNNER_FAILED` literal; el resultado posterior debe ser un envelope tipado `PROCEDURE_NOT_FOUND` o el código canónico equivalente, sin mojibake.

## Reinforcement

Una ausencia conocida debe fallar en el límite que puede explicarla, no como un fallo genérico del proceso que la ejecutó. La corrección de encoding es parte del mismo contrato de observabilidad: el mensaje debe llegar íntegro y parseable al consumer.
