# Delta for vba-form-service

## MODIFIED Requirements

### Requirement: Catalog Add Control Con Paridad Dry-Run Por Defecto

La operación `catalogAddControl` de `VbaFormService` (`src/core/services/vba-form-service.ts:134-187`) DEBE resolver el estado de escritura con la misma prioridad canónica que `generateForm` (`:99`): si `apply === true` la operación se trata como escritura habilitada; en cualquier otro caso, si `dryRun === false`, también; en los demás casos (incluyendo `dryRun` y `apply` ausentes), la operación se trata como dry-run activo y NO DEBE escribir en disco.

#### Scenario: dryRun y apply ausentes caen a dry-run
- DADO `catalogAddControl` invocado con `arguments: { controlName, controlType, spec }` (sin `dryRun` ni `apply`)
- CUANDO el servicio evalúa el estado de escritura
- ENTONCES el resultado DEBE ser un `successResult` con `dryRun: true` y `written: false`
- Y el catálogo en disco NO DEBE modificarse

#### Scenario: apply true desactiva el dryRun
- DADO `catalogAddControl` invocado con `apply: true`
- CUANDO el servicio procesa la solicitud
- ENTONCES el resultado DEBE incluir `catalogPath` y `controlCount` actualizado
- Y el catálogo en disco DEBE contener la nueva entrada

#### Scenario: apply true prevalece sobre dryRun true
- DADO `catalogAddControl` invocado con `{ apply: true, dryRun: true }`
- CUANDO el servicio evalúa el estado de escritura
- ENTONCES DEBE tratarse como escritura habilitada (coherente con la regla canónica del change `dry-run-explicit`)

#### Scenario: dryRun true explícito se respeta como intencional
- DADO `catalogAddControl` invocado con `dryRun: true`
- CUANDO el servicio evalúa el estado de escritura
- ENTONCES el resultado DEBE indicar `dryRun: true`
- Y NO DEBE escribir en disco

(Previously: `catalogAddControl` ejecutaba la escritura directamente cuando ambos flags estaban ausentes, divergiendo de `generateForm` que sí cae a dry-run por defecto.)

### Requirement: Validación De Parámetros En Catalog Add Control

`catalogAddControl` DEBE retornar `failureResult` con código `FORM_SPEC_INVALID` cuando falten `controlName`/`name` o `controlType`/`type`. El código `VBA_CATALOG_WRITE_FAILED` se conserva para errores de E/S al escribir el catálogo.

#### Scenario: controlName ausente
- DADO `catalogAddControl` invocado sin `controlName` ni `name`
- CUANDO el servicio resuelve los parámetros
- ENTONCES DEBE retornar `failureResult` con código `FORM_SPEC_INVALID`

#### Scenario: controlType ausente
- DADO `catalogAddControl` invocado sin `controlType` ni `type`
- CUANDO el servicio resuelve los parámetros
- ENTONCES DEBE retornar `failureResult` con código `FORM_SPEC_INVALID`

## Verification

- **Test command**: `pnpm test`
- **Files**: `src/core/services/vba-form-service.ts`, `src/adapters/mcp/schemas/vba-sync-schemas.ts`, `src/adapters/mcp/dispatch-factory.ts`, `test/core/services/vba-form-service.test.ts`
- **Capability**: vba-form-service
- **Delta reference**: DELTA-007