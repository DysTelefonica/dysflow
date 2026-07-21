# Round 11 — `run_vba`: aliases de contexto Windows equivalentes tratados como conflicto

**Tool:** dysflow MCP  
**Mode:** bug-hunt / bug-regression  
**Variant:** medium  
**Versión observada:** v2.20.0  
**Consumer:** `DysTelefonica/Expedientes`, proyecto Engram `expedientes`  
**Issue GitHub:** https://github.com/DysTelefonica/dysflow/issues/1044

## Contexto del round

Round 11 es el primer slot libre posterior al round-5/#1040: los slots 6, 7, 8, 9, 10 y 12 están ocupados por issues previas del maintainer. El round-5/#1040 sigue siendo independiente: trata la regresión de `import_modules` Auto sobre forms completos, false-success y ausencia de rollback.

Este gap tampoco duplica #962: aquella issue separó cinco causas distintas de `PROJECT_CONFIG_NOT_WRITE_READY`; aquí el problema es que el resolver rechaza aliases que representan exactamente la misma ruta. Tampoco duplica #970: aquí se solicita un envelope estructurado para este rechazo concreto, no una nueva semántica general de `remediation`.

## Lo que YA funciona — NO tocar

- El write gate debe continuar rechazando un conflicto real entre aliases.
- La validación estricta de contexto debe continuar siendo fail-closed antes de abrir Access.
- `apply:true`, el allowlist de `run_vba` y la regla cross-project de que el humano compila no deben cambiar.
- Las reglas HR-2, HR-3, HR-6 y HR-8 deben permanecer intactas.
- El fix debe quedar limitado al resolver de contexto y al contrato de error afectado; no incluir superficies no reproducidas.

## Gap A — aliases equivalentes rechazados y error no estructurado

### Síntoma verificado

Cuando el consumer suministra `accessPath`, `projectRoot`, `destinationRoot` y sus correspondientes valores `expected*` con rutas que coinciden exactamente con `projectConfig`, el resolver las trata como conflictivas en lugar de aceptar la igualdad.

### Evidencia literal de reproducción

Llamada `run_vba`:

```json
{
  "projectId": "expedientes",
  "procedureName": "DumpWhereForTest",
  "argsJson": "[]",
  "apply": true,
  "accessPath": "C:/00repos/codigo/00_EXPEDIENTES/Expedientes.accdb",
  "backendPath": "C:/00repos/datos/Expedientes_datos.accdb",
  "destinationRoot": "C:/00repos/codigo/00_EXPEDIENTES/src",
  "projectRoot": "C:/00repos/codigo/00_EXPEDIENTES",
  "expectedAccessPath": "C:/00repos/codigo/00_EXPEDIENTES/Expedientes.accdb",
  "expectedProjectRoot": "C:/00repos/codigo/00_EXPEDIENTES",
  "expectedDestinationRoot": "C:/00repos/codigo/00_EXPEDIENTES/src",
  "timeoutMs": 60000
}
```

Salida literal:

```text
PROJECT_CONFIG_NOT_WRITE_READY: Conflicting Access target aliases were supplied. [legacy: PROJECT_CONFIG_NOT_WRITE_READY]
```

La salida no es un envelope estructurado y no permite distinguir igualdad válida de conflicto real.

### Comportamiento esperado

1. Normalizar rutas Windows antes de compararlas: separadores `/` y `\\`, casing, segmentos `.`/`..` y separadores finales conforme al contrato de rutas del runtime.
2. Aceptar aliases equivalentes después de esa normalización y continuar hacia la validación/ejecución normal.
3. Rechazar un conflicto real, sin abrir Access ni mutar estado.
4. Devolver en ambos casos rechazados un envelope tipado y parseable, con código canónico, mensaje y diagnóstico accionable. El texto legacy puede conservarse como compatibilidad, pero no puede ser el único resultado.

### Tests RED obligatorios

1. **Igualdad normalizada:** `accessPath` y `expectedAccessPath`, `projectRoot` y `expectedProjectRoot`, y `destinationRoot` y `expectedDestinationRoot` deben aceptarse cuando solo difieren por slash, casing, `.`/`..` o separador final. El test debe demostrar que no se devuelve `PROJECT_CONFIG_NOT_WRITE_READY` por conflicto.
2. **Conflicto verdadero:** dos aliases que resuelven a rutas distintas deben fallar antes de abrir Access, con un error tipado de conflicto y sin mutación.
3. **Envelope:** el rechazo de conflicto debe cumplir el schema estructurado vigente (`ok:false` y `error`/`errorCode` canónico, más `message` y diagnóstico cuando corresponda); no debe ser una string legacy desnuda.
4. **No-regresión:** un contexto válido sin aliases redundantes y el camino de ejecución existente de `run_vba` deben seguir funcionando; el test debe conservar la regla de fail-closed para conflictos reales.

## Disciplina

- TDD estricto: tests RED contra v2.20.0, luego GREEN y REFACTOR.
- Conventional commit sugerido: `fix(config): normalize equivalent Windows target aliases`.
- No modificar el comportamiento de conflictos reales, la política de escritura ni los fixes de #1040.
- No introducir ni documentar capacidades cuya reproducción literal no está incluida en este round.

## Acceptance output

- PR con los tests RED → GREEN y la suite de no-regresión relevante en verde.
- `CHANGELOG.md` actualizado con la normalización de aliases equivalentes y el envelope tipado.
- Version bump obligatorio, justificado por el maintainer; si el envelope público cambia, tratarlo como minor.
- Documentación del código de error y del caso de rutas Windows actualizada si el contrato lo requiere.
- Body del PR con una declaración explícita de no-regresión: los conflictos verdaderos siguen bloqueando y los aliases equivalentes dejan de producir un falso conflicto.

## Quick start

```bash
git checkout -b fix/run-vba-normalize-context-aliases
pnpm install
pnpm test
```

Reproducir contra el runtime de desarrollo con la llamada JSON de este prompt. El resultado anterior al fix es el texto legacy literal; el resultado posterior debe ser ejecución normal para aliases equivalentes o envelope tipado para un conflicto verdadero.

## Reinforcement

La igualdad normalizada no debe debilitar el write gate: solo aliases que representan la misma ruta pueden converger. Una ruta realmente distinta continúa siendo un rechazo fail-closed y siempre debe ser observable como error estructurado.
