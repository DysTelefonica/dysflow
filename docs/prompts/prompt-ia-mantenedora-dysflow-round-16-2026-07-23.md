# Prompt para la IA mantenedora de Dysflow — round 16

## Modo

`bug-hunt` long, dividido en una épica y nueve slices atómicas.

## Contexto verificado

Runtime consumidor:

- Dysflow MCP `2.22.1`.
- 90 herramientas anunciadas.
- 164 nombres de parámetro únicos.
- 992 apariciones de parámetros.
- Política live: `safe-by-default`.

Evidencia completa:

- `docs/analysis/dysflow-api-homogeneity-audit-2026-07-23.md`
- `docs/analysis/dysflow-api-tool-map-2.22.1.md`
- `docs/analysis/dysflow-api-parameter-map-2.22.1.csv`

No hay issues abiertas en `DysTelefonica/dysflow` en el momento de preparar
este round.

## Problema

La API funciona, pero un consumidor automático no dispone todavía de un único
contrato coherente. `get_capabilities`, `schema`, los schemas MCP anunciados y
algunos handlers ofrecen verdades parciales incompatibles.

Reproducciones verificadas:

```text
schema({}).tools = 90
schema({toolName:"schema"}).parameters = {}
schema({toolName:"diagnose"}).parameters = {}
schema({toolName:"state"}).parameters = {}
schema({toolName:"clean_stale_markers"}).parameters = {}
```

Sin embargo, los schemas MCP reales de esas herramientas aceptan parámetros.

```text
get_capabilities.tools.link_tables.canonicalCommitFlag = "apply"
schema(link_tables).parameters = projectId, contextId, accessPath, target,
  backendPath, mode, tableNames, dryRun
```

`apply` se declara canónico pero no es invocable según el schema.

La misma divergencia afecta a:

```text
generate_erd
link_tables
cleanup_access_operation
access_force_cleanup_orphaned
clean_stale_markers
```

Además:

```text
form_serialize ∉ writeClassToolsPermitted
schema(form_serialize).parameters incluye apply y dryRun
```

Requiredness:

```text
describe_tool.name => required:false
handler => MCP_INPUT_INVALID cuando faltan name y toolName

cleanup_access_operation.accessPath => required:true
description => "Optional override..."

analyze_form_ui.sourcePath => required:false
handler => FORM_SPEC_MISSING cuando faltan sourcePath y path
```

Ergonomía del catálogo:

```text
defaults estructurados: 1
defaults descritos solo en prosa: 126
aliases descritos solo en prosa: 97
tools sin useCases: 81
return schemas específicos: 0
```

La implementación de `resolveIsDryRun` confirma:

```ts
if (input.apply === true) return false;
if (input.dryRun === false) return false;
return true;
```

Por tanto, `apply:true + dryRun:true` ejecuta por precedencia. No existe una
política uniforme de conflicto.

## Lo que ya funciona y NO debe romperse

- Los 90 nombres anunciados.
- Compatibilidad con aliases existentes durante la ventana de deprecación.
- `get_capabilities` como snapshot de estado live.
- `schema` y `describe_tool` como herramientas read-only.
- `test_vba` conserva `dryRun` como flag canónico mientras no exista una
  migración explícita.
- Gate humano de compilación.
- Write gates de proceso/proyecto.
- Selección multiworktree: `cwd` solo en reads project-scoped; writes por
  `projectId` o `accessPath` registrado.
- `export_modules` con copia binaria desechable por defecto.
- Envelopes de error tipados y compatibilidad aditiva.
- Prohibición de matar `MSACCESS.EXE` genéricamente.

## Plan obligatorio — nueve slices

### Slice 1 — Paridad de schemas

Hacer que `schema`/`describe_tool` deriven del mismo input schema que se
anuncia al host MCP. Corregir como mínimo `schema`, `diagnose`, `state` y
`clean_stale_markers`. Añadir un test exhaustivo de paridad para las 90 tools.

### Slice 2 — Coherencia de write intent

Cruzar automáticamente:

- `writeClassToolsPermitted`
- `canonicalCommitFlag`
- schema MCP
- `schema`/`describe_tool`
- clasificación read/write

Resolver `generate_erd`, `link_tables`, `cleanup_access_operation`,
`access_force_cleanup_orphaned`, `clean_stale_markers` y `form_serialize`.

### Slice 3 — Required aliases

Representar `name | toolName`, `sourcePath | path`,
`tableName | table` y demás alternativas mediante `oneOf`/`anyOf` o metadata
equivalente consumible por máquina. Requiredness del schema y handler deben
coincidir.

### Slice 4 — Metadata de parámetros

Añadir:

- `default`
- `canonicalName`
- `aliases[]`
- `deprecated`
- `conflictsWith[]`
- `precedence`
- `sensitive`

Ningún default o alias operativo debe vivir solo en prosa.

### Slice 5 — Componentes comunes

Crear definiciones reutilizables:

- `ProjectIdentity`
- `OperationCorrelation`
- `AccessTarget`
- `DatabaseTarget`
- `ManagedSourceTarget`
- `StrictContext`
- `WriteIntent`
- `OutputMode`

No romper el schema público; deduplicar la fuente interna.

### Slice 6 — Return schemas específicos

`describe_tool` debe explicar el payload de cada herramienta, incluidos
plan/apply y success/error. Mantener el envelope MCP externo.

### Slice 7 — Política de flags contradictorios

Decisión recomendada:

```text
apply:true + dryRun:true => MCP_INPUT_INVALID
```

Si se conserva precedencia por compatibilidad, debe quedar estructurada,
versionada y probada en todas las familias.

### Slice 8 — Catálogo compact/full

Añadir una vista compacta de bajo coste de contexto y conservar la vista
completa. La compacta incluye: función, required params, defaults, intención de
write canónica y resultado principal.

### Slice 9 — Superficie recomendada para agentes

Metadata:

- `preferred`
- `specialized`
- `legacy`
- `supersededBy`
- `preferFor[]`

Definir golden paths para bootstrap, sync, tests, SQL, formularios y recovery,
sin eliminar wrappers compatibles.

## Disciplina obligatoria

1. Una issue y un PR por slice, salvo que la épica documente una dependencia
   técnica que haga inseparables dos slices.
2. TDD estricto: RED verificable antes de producción.
3. Tests de contrato generativos sobre las 90 herramientas; no mantener otra
   allowlist manual.
4. Cambios aditivos o con deprecación explícita.
5. Commits convencionales, sin atribución de IA.
6. No modificar el runtime instalado en `%LOCALAPPDATA%\dysflow`; usar
   `test-runtime/`.
7. No publicar release hasta que las nueve slices y los consumer gates estén
   verdes.

## Alineación obligatoria de skills y documentación de agentes

Cada issue debe incluir un bloque **Consumer documentation impact**. La issue
NO se considera cerrada hasta completar lo siguiente cuando el cambio altere
el contrato consumible:

1. Actualizar el catálogo runtime y sus ejemplos.
2. Actualizar la fuente canónica de skills en
   `C:\Proyectos\skills\skills\`, nunca las copias consumidoras directamente.
3. Como mínimo revisar:
   - `dysflow-usage`
   - `dysflow-arnes`
   - `dysflow-codegraph-update`
   - `dysflow-pointer-rollout`
   - la skill funcional afectada
   - todos los ejemplos que invoquen las tools modificadas
4. Ejecutar `dysflow-codegraph-update` y después
   `dysflow-pointer-rollout`.
5. Sincronizar el bloque marker-delimited de `C:\Proyectos\dysflow\AGENTS.md`.
6. Propagar las copias consumidoras a `~/.agents/skills`.
7. Ejecutar:

```powershell
skills/dysflow-usage/assets/scripts/verify-examples-vs-runtime.ps1
Invoke-Pester skills/dysflow-usage/assets/scripts/verify-examples-vs-runtime.tests.ps1
```

8. Añadir un regression test que falle si cualquier ejemplo usa un alias como
   contrato primario cuando el runtime declara otro flag canónico.
9. Documentar en la issue/PR:
   - skills tocadas;
   - ejemplos tocados;
   - hash del arnés/punteros;
   - evidencia de cero drift contra el runtime de la nueva versión.

La implementación del runtime y la actualización de consumers pueden vivir en
commits/repos separados, pero forman parte de la misma definición de done.

## Quick start

```powershell
pnpm install
pnpm test
pnpm build

# Capturar baseline live
get_capabilities({})
schema({})

# Ejecutar tests de contrato focalizados
pnpm vitest run test/adapters/mcp/schema-tool.test.ts
pnpm vitest run test/adapters/mcp/get-capabilities-commit-flags.test.ts

# Gates finales
pnpm test
pnpm test:integration
node E2E_testing/mcp-e2e.mjs
```

## Acceptance output

- Épica con nueve issues enlazadas y dependencias explícitas.
- Nueve PRs TDD o una justificación técnica aprobada para cualquier
  agrupación.
- Paridad de schema demostrada para las 90 tools.
- Cero divergencias entre access class, write registry y flags invocables.
- Requiredness/aliases/defaults consumibles por máquina.
- Return schemas específicos.
- Golden paths declarados por el runtime.
- Changelog y bump semántico.
- Release con título igual al tag.
- Skills, ejemplos, punteros globales y `AGENTS.md` alineados con la release.
- Verificador de ejemplos: cero drift.

## Guardrails

- No eliminar aliases en este round.
- No cambiar nombres canónicos sin deprecación.
- No duplicar manualmente schemas en otra tabla.
- No convertir `contextId` en identidad de proyecto.
- No permitir `cwd` en writes por conveniencia.
- No debilitar `strictContext`, containment ni write gates.
- No cambiar el contrato de compilación humana.
