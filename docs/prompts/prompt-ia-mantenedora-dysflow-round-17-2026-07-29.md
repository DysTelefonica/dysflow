# Round 17 — Épica "Runtime Autonomy": que dysflow no dependa de skills

Eres la IA mantenedora de dysflow MCP. Repo: `DysTelefonica/dysflow`. Versión actual: **2.29.0**.
Branch sugerida por fase (ver `docs/work/epic-runtime-autonomy-rollout.md`).

Este round **no es un bug-hunt**. Es una épica de arquitectura, y se te entrega para que **opines antes de que se abran las issues**. Si algo de lo que sigue está mal diagnosticado, decilo: el objetivo es el diseño correcto, no validar el borrador.

---

## 0. Por qué comparamos con engram

El benchmark de esta épica es **[engram](https://github.com/Gentleman-Programming/engram)**, el MCP de memoria persistente de Gentleman Programming — una referencia en el mundo de la programación, y un MCP que resolvió el mismo problema estructural que dysflow tiene hoy.

No se trata de copiar features. Engram es memoria persistente; dysflow es sync source↔binario de Access/VBA. Son dominios distintos. Lo que se copia es **cómo un MCP se hace autosuficiente**: cómo entrega su propio protocolo, cómo controla su superficie, y cómo repara su propio estado sin que un humano lea un markdown.

La comparación es honesta en las dos direcciones: hay cosas donde dysflow está **por delante** de engram (§3), y están marcadas como tal.

---

## 1. La tesis

> Hoy, un agente que se conecta a dysflow **sin skills instaladas opera sin rigor**.
> El contrato de comportamiento (el arnés) vive fuera del binario, en archivos markdown mantenidos a mano.

Eso tiene tres consecuencias medibles:

1. **Drift estructural.** El arnés declara `dysflow MCP >= 2.13` y `last_dysflow_version: 2.29.0`; su propio §10 dice `harness v0.1.10 · last_verified 2026-07-27` mientras el frontmatter dice `version: 0.1.12 · last_verified: 2026-07-29`. El documento que define cómo comportarse **está desincronizado consigo mismo**. No es descuido: es lo que pasa cuando el contrato no se versiona con el runtime.

2. **Tres skills existen solo para combatir ese drift.** `dysflow-codegraph-update`, `dysflow-pointer-rollout` y `dysflow-examples-sync` no aportan capacidad — son mantenimiento de la desincronización. Si el runtime publicara su propio contrato, las tres desaparecen.

3. **El rigor no es exigible.** Las reglas duras HR-1..HR-9 y los anti-patterns AP-1..AP-11 son **prosa**. Un agente que no cargó el arnés no las viola: ni siquiera las conoce.

### North star

> Un agente con **cero skills instaladas** que se conecta al MCP de dysflow debe operar con el mismo rigor que hoy exige cargar 5 skills a mano.

### Métrica de la épica

**Skill-dependency count** = cuántas skills hacen falta para operar dysflow con rigor.

| | Hoy | Target |
|---|---|---|
| Skills **requeridas** para operar | 5 (`dysflow-arnes`, `dysflow-usage`, `vba-access`, + TDD + task skill) | **0** |
| Skills que existen **solo por el drift** | 3 | **0** |
| Reglas del arnés **enforced por runtime** | 2 de 20 (HR-8 parcial, HR-3 vía `allowWrites`) | **≥ 12 de 20** |
| Tools advertised en `tools/list` | 91 | ≤ 20 por defecto |

Las skills no se prohíben — quedan como material **didáctico opcional**. Lo que se elimina es la **dependencia**.

---

## 2. Lo que YA funciona (NO tocar)

Esto está validado contra v2.29.0 y es la base sobre la que se construye. Romper cualquiera de estas cosas invalida la épica entera.

**Introspección (dysflow está por delante de engram acá):**
- Cadena de 4 niveles: `get_capabilities` → `schema({view:'compact'|'full'})` → `describe_tool({name})` → `diagnose`. Engram no tiene equivalente a `schema` ni a `describe_tool`.
- `McpCapabilitySnapshot` con `adapterVersion`, `writeExecutionPolicy`, `effectiveDryRunDefault` por tool, `humanCompilePending`, `toolsVisible`, `projectConfig.status`, `projectConfig.writeReady`, `documentationBundle`.
- `ToolResultContract`, `ToolErrorEnvelopeShape`, `ToolOutputMode`, `ToolResultMode`, `CompactToolWriteIntent` — contratos tipados por tool en `src/adapters/mcp/schema-tool.ts`.
- `diagnose` (#965) colapsa 5 round-trips en una llamada read-only. No abre Access, no spawnea PowerShell, no escribe.
- `dysflow.state` (#978), `resolve_project` (#963), `schema` (#971).

**Política de escritura:**
- `write-execution-policy.ts`: clasificación de riesgo por tool × modo de política por proyecto. `safe-by-default` + `dryRunDefault:true`.
- `apply` como commit flag canónico unificado (#1167). `diff`/`dryRun` son alias de compatibilidad.
- `export_modules` con copia binaria desechable por defecto; `mutateBinary:true` es opt-in legacy.
- Gate `allowWrites` por proyecto.

**Comportamiento intencional que NO se debe revertir:**
- **`compile_vba` no existe y no vuelve.** El humano compila. Es regla cross-project.
- **Nunca matar `MSACCESS.EXE` genéricamente.** El cleanup canónico es `list_access_operations` → `access_force_cleanup_orphaned` → `cleanup_access_operation`.
- **`bothChanged` es manual por defecto.** Ninguna parte de esta épica automatiza esa decisión (ver §4.7, que es explícitamente *advisory*).
- `cross-process-lock.ts` serializa a nivel `access-runner` por `.accdb`.
- Dependencias mínimas: `@modelcontextprotocol/sdk` + `zod`. **No sumar dependencias** en esta épica.

**Estado del round 16 y anteriores:** #1230 (105 RUNTIME GAP findings de metadata) sigue abierto y es **prerequisito blando** de la Fase 2 — ver §5.

---

## 3. El benchmark, honesto

| Dimensión | engram | dysflow 2.29.0 | Veredicto |
|---|---|---|---|
| Protocolo de comportamiento | En el handshake MCP (`instructions`) | **Vacío** — `new McpServer({name, version})` | ❌ dysflow atrás |
| Superficie de tools | 20, tiered 7 core + 13 deferred | **91, sin tiering** | ❌ dysflow atrás |
| Introspección por tool | No tiene | `schema` + `describe_tool` + contratos tipados | ✅ **dysflow adelante** |
| Diagnóstico | `doctor` con registry de checks + envelope estable | `diagnose` agregador, sin registry | ⚠️ empate técnico, engram mejor forma |
| Reparación | `doctor repair` con `--plan`/`--dry-run`/`--apply` + backup + allowlist | **No existe** | ❌ dysflow atrás |
| Workflows | Protocolo en instructions | En skills externas | ❌ dysflow atrás |
| Prompts MCP | — | **No expuestos** | ❌ ambos, oportunidad |
| Seam LLM | `internal/llm` con vocabulario cerrado + costo estimado + frontera de import | No existe | ➖ opcional para dysflow |
| Distribución | `.claude-plugin/`, `plugin/`, `setup.sh`, `internal/setup` in-repo | 1 skill in-repo; el resto en repo privado aparte | ❌ dysflow atrás |
| Deps de runtime | 0 (binario Go) | 2 (`sdk`, `zod`) + Node ≥20 | ⚠️ aceptable, no es el cuello de botella |

**Lectura:** dysflow tiene **mejor introspección** que engram. Lo que le falta no es capacidad — es **entrega del contrato**. Engram publica su protocolo; dysflow lo delega a markdown externo.

---

## 4. Las 7 fases

### Fase 0 — Matriz de cobertura auditable

#### Síntoma verificado
No existe forma de medir cuánto del arnés está cubierto por el runtime. Sin métrica, la épica no tiene criterio de "hecho" y el drift no se detecta hasta que un agente falla.

#### Evidencia
`dysflow-arnes/SKILL.md` define 9 reglas duras (HR-1..HR-9) y 11 anti-patterns (AP-1..AP-11) = 20 obligaciones. Ninguna tiene identificador estable dentro del repo de dysflow. Grep sobre `src/` no encuentra `HR-1`, `AP-3`, ni ningún código de regla.

#### Entrega
Artefacto in-repo `src/core/contracts/agent-protocol-coverage.ts`: cada obligación con `ruleId` estable y `enforcement: "runtime-gate" | "advertised" | "skill-only"`. Gate de CI que falla cuando una regla sigue en `skill-only` pasada su fase objetivo.

#### Test RED
```ts
it('every arnés rule has a stable ruleId and an enforcement level', () => {
  expect(AGENT_PROTOCOL_RULES).toHaveLength(20);
  expect(AGENT_PROTOCOL_RULES.every(r => /^(HR|AP)-\d+$/.test(r.ruleId))).toBe(true);
});
```

---

### Fase 1 — El protocolo viaja con el binario ⭐ **la fase clave**

#### Síntoma verificado
El servidor MCP no publica `instructions`. Un cliente que hace `initialize` recibe nombre y versión, nada más. Todo el contrato de comportamiento depende de que alguien haya instalado y cargado `dysflow-arnes` a mano.

#### Evidencia de repro
`src/adapters/mcp/stdio.ts:278`:
```ts
const server = new McpServer({ name: "dysflow", version: SERVER_VERSION });
```
```bash
rg -n "instructions" src --type ts
# → 0 resultados
```
El SDK de MCP acepta `instructions` en `ServerOptions` y lo devuelve en el `InitializeResult`. El campo está disponible y sin usar.

#### Riesgo actual
Cualquier agente nuevo del fleet (OpenCode, Codex, Gemini CLI, Cursor) opera dysflow **sin las reglas duras**. HR-1 (el humano compila) y HR-2 (no matar MSACCESS) protegen contra corrupción de binario y pérdida de trabajo — hoy son opcionales de facto.

#### Entrega
- Fuente única en `src/core/contracts/agent-protocol.ts`, versionada con `SERVER_VERSION`.
- Poblar `instructions` en el handshake.
- Tool `get_protocol({section?})` + comando `dysflow protocol` para clientes que no propagan `instructions`.
- **Presupuesto de contexto**: el payload de `instructions` ≤ 6 000 chars. Lo que no entra se sirve por `get_protocol`.
- Test de paridad en CI: los 20 `ruleId` de la Fase 0 aparecen en el payload.

#### Test RED
```ts
it('the MCP handshake advertises the agent protocol', async () => {
  const init = await client.initialize();
  expect(init.instructions).toContain('HR-1');
  expect(init.instructions.length).toBeLessThanOrEqual(6000);
});
```

#### Pregunta abierta para vos
¿`get_protocol` como tool, o como **MCP resource** (`resources/list`)? Un resource es semánticamente más correcto, pero muchos clientes del fleet no consumen resources. Tu criterio.

---

### Fase 2 — Progressive disclosure sobre 91 tools

#### Síntoma verificado
`tools/list` devuelve 91 tools. Todas. Siempre.

#### Evidencia de repro
`E2E_testing/_helpers/advertised-tool-count.mjs:79`:
```js
export const EXPECTED_ADVERTISED_TOOL_COUNT = 91;
```
Engram advierte 20 y las parte 7 core / 13 deferred, declarando el corte en sus instructions.

#### Diagnóstico
**La clasificación ya existe** — `src/adapters/mcp/agent-workflow-registry.ts:11`:
```ts
export type AgentWorkflowStatus = "preferred" | "specialized" | "legacy";
```
Con 18 preferred / 71 specialized / 2 legacy según el audit de #1230. El metadato está; **el tiering no**. `tools/list` ignora la clasificación.

#### Riesgo
Coste de contexto por sesión en todo consumidor. Un agente que solo quiere `export_modules` + `test_vba` paga las 91. La familia `form_*` sola son ~19 tools.

#### Entrega
- `tools/list` sirve por defecto el tier `preferred` (18) + las 4 de introspección.
- `list_tools({tier})` / variable de entorno `DYSFLOW_TOOL_TIER=all` para el resto.
- `find_tool({intent})` — búsqueda local sobre el catálogo. **Reemplaza el rol de `dysflow-usage` como índice.**
- Los 2 legacy se marcan deprecados con fecha de retiro.

#### Test RED
```ts
it('tools/list defaults to the preferred tier', async () => {
  const { tools } = await client.listTools();
  expect(tools.length).toBeLessThanOrEqual(22);
  expect(tools.map(t => t.name)).toContain('get_capabilities');
});
```

#### Pregunta abierta para vos
¿El corte por defecto rompe consumidores existentes del fleet? Si sí, la alternativa es **opt-in** (`DYSFLOW_TOOL_TIER=preferred`) durante una minor y flip del default en la siguiente major. Preferimos tu lectura de compatibilidad.

---

### Fase 3 — De prosa a gates ejecutables ⭐ **la que de verdad elimina la dependencia**

Esta es la fase que convierte "el agente debería" en "el runtime no te deja". Es la más grande y la que más criterio tuyo necesita.

#### 3.1 HR-1 — el humano compila

**Síntoma verificado:** `humanCompilePending` es **solo un recordatorio**, no un gate.

**Evidencia** — `src/adapters/mcp/result-translation.ts:677-700`, `withHumanCompileReminder`:
```ts
export function withHumanCompileReminder(
  result: McpToolResult,
  options: { toolName: string; accessPath: string },
): McpToolResult {
  if (result.isError || result.ok === false) return result;
  if (!HUMAN_COMPILE_REMINDER_TOOLS.has(options.toolName)) return result;
  ...
```
Es **aditivo y post-hoc**: agrega un campo a un resultado que ya se produjo. `test_vba` corre igual con compilación pendiente. La regla que impide reportar "TDD-green" falso (AP-11) es puramente prosa.

**Entrega:** error tipado `HUMAN_COMPILE_PENDING` que **bloquea** `test_vba`/`run_vba` cuando el flag está activo, con `remediation` y un override explícito (`acknowledgeCompilePending:true`) para el caso en que el humano ya compiló y el flag quedó sucio.

#### 3.2 HR-4 — pre-flight de 5 puntos

**Síntoma:** el arnés exige 5 chequeos antes de cada write. El agente los hace **a mano leyendo markdown**. Si no cargó el arnés, no los hace.

**Entrega:** tool `preflight({tool, intent})` → veredicto `go`/`no-go` + qué falló. Un round-trip en vez de cinco y una lectura de skill.

#### 3.3 HR-3 — guarda de producción

**Síntoma:** `allowWrites` protege el proyecto, pero la regla "nunca escribir al backend de producción, `m_TestingMode=True` es el único camino" no tiene gate propio.

**Entrega:** rechazo tipado `PRODUCTION_BACKEND_WRITE_BLOCKED` en el seam de escritura de datos, con la ruta del backend en `evidence`.

#### 3.4 HR-2 — ban de kill, verificable

**Síntoma:** dysflow **no puede** impedir que el agente corra `Stop-Process -Name MSACCESS` — eso pasa fuera del MCP. Es la única regla del arnés que **no es convertible a gate**.

**Entrega realista:** detección post-hoc. Check `msaccess_terminated_externally` en el registry de la Fase 4 (operación registrada, proceso muerto, sin cleanup asociado) + la regla en `instructions`. Se asume enforcement parcial y se declara como tal en la matriz de la Fase 0.

#### 3.5 HR-8 — serialización de writes

**Estado real:** `src/core/runner/cross-process-lock.ts` ya serializa por `.accdb` a nivel `access-runner` (in-process queue + lock cross-process). **La regla puede estar ya cubierta.**

**Entrega:** auditar cobertura desde el dispatch MCP y, si hay hueco, exponer rechazo tipado `WRITE_IN_PROGRESS` en vez de encolar en silencio. **Si ya está cubierto, esta sub-fase se cierra como no-op y se marca `runtime-gate` en la matriz.** Confirmanos.

---

### Fase 4 — `diagnose` aprende a reparar

#### Síntoma verificado
`diagnose` observa y no repara. Las reparaciones viven como procedimientos manuales en skills: `vba-form-metadata-repair` (60 líneas), `vba-form-repair` (91), `vba-binary-drift` (99).

#### Evidencia
`src/adapters/mcp/diagnose-tool.ts:14-15`, comentario del propio handler:
```
// The handler never opens Access, never spawns PowerShell, never writes to the
// filesystem. The dispatcher registers it as `read-only`
```

#### El modelo de engram (a copiar)
- **Registry pluggable** — `internal/diagnostic/registry.go`: los checks se registran, no se hardcodean en el agregador.
- **Envelope estable por check**: `{check_id, result, severity, reason_code, evidence, safe_next_step, requires_confirmation}`. Ese `requires_confirmation` es la joya — el propio check declara "acá mira un humano antes de tocar".
- **Repair en tres modos mutuamente excluyentes**: `--plan` / `--dry-run` / `--apply`. Backup antes de `apply`. Allowlist estrecha de qué se puede mutar (engram: tres columnas, nada más). Nunca borra filas.

#### Entrega
1. Registry + envelope sobre el `diagnose` actual (compatible hacia atrás: el agregado sigue saliendo).
2. `repair({check, mode})` con `plan`/`dryRun`/`apply`, backup del `.accdb` antes de `apply`, allowlist explícita por check.
3. Primeros checks reparables — los que hoy son skills: metadata `VB_Name` corrupta, encoding, drift source↔binario, operaciones huérfanas, `.dysflow/project.json` desincronizado.

**Resultado:** mueren `vba-form-metadata-repair`, `vba-form-repair` y `vba-binary-drift`.

#### Pregunta abierta para vos
El backup de engram es un archivo SQLite. El de dysflow sería un `.accdb` — que puede pesar cientos de MB. ¿Backup completo antes de `apply`, backup solo del módulo/form afectado, o `apply` solo permitido sobre checks cuya reparación es reversible por diseño? **Esta es la decisión de diseño que más nos interesa de vos.**

---

### Fase 5 — Los workflows los sirve el runtime

#### Síntoma verificado
dysflow **no expone la capability `prompts` de MCP**. `src/adapters/mcp/stdio.ts` registra handlers solo para `ListToolsRequestSchema` (línea 284) y `CallToolRequestSchema` (línea 298).

#### Consecuencia
Los workflows multi-paso viven en skills: el loop TDD de 8 pasos, blast radius, rename seguro de símbolo, perceive→act→verify de forms. Todos son **procedimientos que el runtime conoce mejor que el markdown**.

#### Entrega
- Capability `prompts`: `tdd-loop`, `sync-binary`, `form-ui-builder`, `symbol-rename-safe`, `blast-radius`.
- Ejemplos por tool servidos desde el runtime (hoy `schema-tool.ts` no tiene `examples`). **Mata `dysflow-examples-sync`.**
- Los workflows que cruzan a `codegraph-vba` quedan como **prompts orquestadores**, no como composite tools: dysflow no debe absorber otro MCP.

---

### Fase 6 — Distribución zero-config

#### Síntoma verificado
`skills/` in-repo contiene **una** skill (`access-form-ui-builder`). Las otras 15 que tocan dysflow viven en un repo privado separado (`C:\Proyectos\skills`). **Esa separación es la causa raíz del drift** que las tres meta-skills intentan parchear.

#### El modelo de engram
`.claude-plugin/`, `plugin/`, `skills/`, `setup.sh` e `internal/setup` **en el mismo repo que el binario**. Instalás el plugin y el protocolo viene con él, en la versión correcta, siempre.

#### Entrega
- `.claude-plugin/` + `plugin/` in-repo.
- `dysflow setup --agent <claude|opencode|codex|gemini>` que escribe la config MCP.
- Las skills que sobrevivan a las fases 1-5 se mueven al repo de dysflow y se versionan con él.

**Restricción:** sin sumar dependencias. Las 2 actuales se mantienen.

---

### Fase 7 — Retirada, y la prueba de que funcionó

#### Entrega
- `dysflow-arnes` y `dysflow-usage`: **generadas desde el runtime** o eliminadas.
- `dysflow-codegraph-update`, `dysflow-pointer-rollout`, `dysflow-examples-sync`: **eliminadas**. Su razón de existir desapareció.
- Gate de CI que verifica que no vuelven.

#### Prueba de aceptación de la épica
E2E con un cliente MCP **sin ninguna skill instalada** que ejecuta el loop completo: `get_capabilities` → escribir test → `import_modules` → bloqueo de compilación humana → `test_vba` → verde. Si eso pasa sin markdown externo, la épica está hecha.

---

### 4.7 Fuera de scope, pero sobre la mesa: juez advisory para `bothChanged`

**No es una fase.** Se menciona porque el patrón de engram es bueno y la decisión es tuya.

`internal/llm` de engram: interfaz `AgentRunner` de un solo método, `Verdict{Relation, Confidence, Model, DurationMS}` con **vocabulario cerrado** (`conflicts_with|supersedes|scoped|related|compatible|not_conflict`), errores sentinela tipados (`ErrCLINotInstalled`, `ErrCLIAuthMissing`, `ErrTimeout`, `ErrInvalidJSON`, `ErrUnknownRelation`), **estimación de coste antes de ejecutar** (`EstimateScanCost` con constantes de tokens fijadas), y frontera de import explícita: **solo 2 paquetes del repo pueden importarlo**.

`bothChanged` en dysflow es el mismo problema: dos versiones divergieron, alguien tiene que juzgar. Hoy es manual siempre — que es el default seguro correcto.

Un juez **advisory** que nunca escribe, emite verdict + confidence, y deja la decisión al humano, respetaría `acceptBothChanged` sin tocarlo. **Pero suma una dependencia de CLI externo y coste por llamada.** Nuestra posición: no en esta épica. Si tenés una lectura distinta, queremos oírla.

---

## 5. Dependencias y blockers

- **#1230 (105 RUNTIME GAP findings)** es prerequisito **blando** de la Fase 2: normalizar la metadata antes de tierizar evita congelar inconsistencias en el corte. No bloquea la Fase 1.
- Fase 1 bloquea Fases 2, 3 y 5 (todas publican a través de `instructions`).
- Fase 0 bloquea la aceptación de todas (es la métrica).
- Fase 4 es independiente: puede correr en paralelo desde el día 1.
- Fase 7 requiere 1-6 completas.

---

## 6. Disciplina

- TDD estricto (RED → GREEN → REFACTOR). Cada fase arranca con su test RED.
- Conventional commits. Scope por fase: `mcp-protocol`, `mcp-tiering`, `mcp-gates`, `diagnose`, `mcp-prompts`, `dist`.
- **No sumar dependencias.** `@modelcontextprotocol/sdk` + `zod` y nada más.
- **No revertir comportamiento intencional** listado en §2 — en particular: `compile_vba` no vuelve, el kill genérico sigue prohibido, `bothChanged` sigue manual.
- Compatibilidad hacia atrás en cada minor. Los cortes que rompan consumidores van con flag opt-in primero.
- Cada fase entrega su fila de la matriz de cobertura de la Fase 0.

---

## 7. Acceptance output

- Una PR por fase, con tests verdes y la fila correspondiente de la matriz de cobertura actualizada.
- `CHANGELOG.md` con bullet por fase citando su issue.
- Version bump: **minor** por fase (cambian superficie o comportamiento). La Fase 2, si el corte de `tools/list` es breaking, va como major o detrás de flag opt-in — tu criterio.
- Al cerrar la Fase 7: E2E sin skills verde, y las 3 meta-skills borradas.

---

## 8. Quick start

```bash
git clone https://github.com/DysTelefonica/dysflow.git
cd dysflow
git checkout -b feat/mcp-protocol-instructions
pnpm install
pnpm run build
```

Reproducir el gap central (Fase 1):
```bash
rg -n "instructions" src --type ts
# Esperado tras el fix: hit en src/core/contracts/agent-protocol.ts + stdio.ts
# Actual: 0 resultados

rg -n "new McpServer" src/adapters/mcp/stdio.ts
# Actual: 278: const server = new McpServer({ name: "dysflow", version: SERVER_VERSION });
# Esperado: tercer campo `instructions` poblado desde agent-protocol.ts
```

---

## 9. Lo que necesitamos de vos antes de abrir las issues

Cinco preguntas concretas. Respondelas y las issues se abren corregidas:

1. **Fase 1** — ¿`get_protocol` como tool o como MCP resource? ¿6 000 chars es el presupuesto correcto para `instructions`?
2. **Fase 2** — ¿El corte por defecto de `tools/list` rompe consumidores del fleet? ¿Opt-in primero o default directo?
3. **Fase 3.5** — ¿`cross-process-lock` ya cubre HR-8 desde el dispatch MCP, o hay hueco?
4. **Fase 4** — Estrategia de backup antes de `apply` sobre un `.accdb` que puede pesar cientos de MB. Es la decisión de diseño más importante de la épica.
5. **Global** — ¿El orden de fases es el correcto, o hay una dependencia que no vimos?

Y la pregunta abierta: **¿algo acá está mal diagnosticado?** La comparación con engram es una herramienta, no un mandato. Si dysflow tiene una razón de diseño para algo que marcamos como gap, esa razón gana.

---

## 10. Reinforcement

La regla cross-project que esta épica **no puede romper bajo ninguna circunstancia**: *el humano compila, y dysflow nunca mata `MSACCESS.EXE` genéricamente*. La Fase 3 endurece ambas — no las relaja. Si alguna entrega termina permitiendo compilación automática o terminación de proceso sin cleanup registrado, se revierte y escala a un round nuevo.

---

*Referencia de benchmark: [Gentleman-Programming/engram](https://github.com/Gentleman-Programming/engram) — analizado el 2026-07-29 contra dysflow v2.29.0.*
