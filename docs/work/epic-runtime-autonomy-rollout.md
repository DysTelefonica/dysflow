# Épica "Runtime Autonomy" — plan de despliegue

> Documento de despliegue de la épica descrita en
> [`docs/prompts/prompt-ia-mantenedora-dysflow-round-17-2026-07-29.md`](../prompts/prompt-ia-mantenedora-dysflow-round-17-2026-07-29.md).
> Benchmark: [Gentleman-Programming/engram](https://github.com/Gentleman-Programming/engram).
> Base: dysflow v2.29.0 · fecha 2026-07-29.

---

## 1. Objetivo y criterio de "hecho"

**Objetivo:** un agente con **cero skills instaladas** opera dysflow con el mismo rigor que hoy exige cargar 5 skills a mano.

**Criterio de hecho (uno solo, binario):** el E2E de la issue `E7.2` — un cliente MCP sin ninguna skill instalada completa el loop `get_capabilities` → escribir test → `import_modules` → bloqueo de compilación humana → `test_vba` verde — pasa en CI.

Todo lo demás es progreso hacia ese test.

---

## 2. Grafo de dependencias

```
                    ┌──────────────────────────┐
                    │ F0 · Matriz de cobertura │  ← métrica, bloquea la ACEPTACIÓN de todas
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │ F1 · instructions        │  ⭐ fase clave
                    └────────────┬─────────────┘
              ┌──────────────────┼──────────────────┐
              │                  │                  │
      ┌───────▼──────┐   ┌───────▼──────┐   ┌───────▼──────┐
      │ F2 · Tiering │   │ F3 · Gates   │   │ F5 · Prompts │
      └───────┬──────┘   └───────┬──────┘   └───────┬──────┘
              │                  │                  │
              └──────────────────┼──────────────────┘
                                 │
      ┌──────────────┐   ┌───────▼──────┐
      │ F4 · Doctor  │──▶│ F6 · Distrib │
      │ (paralelo    │   └───────┬──────┘
      │  desde día 1)│           │
      └──────────────┘   ┌───────▼──────┐
                         │ F7 · Retirada│
                         └──────────────┘
```

**Reglas del grafo:**
- **F1 bloquea F2, F3 y F5.** Las tres publican su contrato a través de `instructions`. Empezar cualquiera antes crea contrato huérfano.
- **F4 es independiente.** Arranca el día 1 en paralelo. No toca el handshake.
- **F0 no bloquea el arranque, bloquea el cierre.** Ninguna fase se acepta sin su fila de la matriz.
- **F7 requiere F1-F6 completas.** Es la prueba, no una entrega.
- **#1230 (105 RUNTIME GAP findings)** es prerequisito **blando** de F2. Tierizar sobre metadata inconsistente congela la inconsistencia.

---

## 3. Issues a abrir

21 issues + 1 de tracking. Todas con `status:needs-review` hasta que la IA especialista opine (§7).

### Épica

| ID | Título | Labels |
|---|---|---|
| `E0` | `epic(mcp): runtime autonomy — dysflow deja de depender de skills` | `architecture`, `ai-friendly`, `status:needs-review` |

### F0 — Matriz de cobertura

| ID | Título | Labels | Depende de |
|---|---|---|---|
| `E0.1` | `feat(contracts): matriz de cobertura del protocolo con ruleId estables + gate CI` | `architecture`, `test`, `ai-friendly` | — |

Entrega `src/core/contracts/agent-protocol-coverage.ts` con las 20 obligaciones (HR-1..HR-9, AP-1..AP-11), cada una con `ruleId` y `enforcement: "runtime-gate" | "advertised" | "skill-only"`. Gate de CI que falla cuando una regla sigue en `skill-only` pasada su fase objetivo.

### F1 — El protocolo viaja con el binario ⭐

| ID | Título | Labels | Depende de |
|---|---|---|---|
| `E1.1` | `feat(mcp-protocol): fuente única agent-protocol.ts versionada con SERVER_VERSION` | `architecture`, `ai-friendly` | `E0.1` |
| `E1.2` | `feat(mcp-protocol): poblar instructions en el handshake MCP (presupuesto ≤6k chars)` | `enhancement`, `ai-friendly`, `high` | `E1.1` |
| `E1.3` | `feat(mcp-protocol): get_protocol + dysflow protocol CLI + test de paridad con el arnés` | `enhancement`, `ai-friendly`, `test` | `E1.2` |

**Evidencia del gap** — `src/adapters/mcp/stdio.ts:278`:
```ts
const server = new McpServer({ name: "dysflow", version: SERVER_VERSION });
```
`rg -n "instructions" src --type ts` → 0 resultados.

### F2 — Progressive disclosure

| ID | Título | Labels | Depende de |
|---|---|---|---|
| `E2.1` | `feat(mcp-tiering): tools/list sirve el tier preferred por defecto + DYSFLOW_TOOL_TIER` | `enhancement`, `ai-friendly`, `high` | `E1.2`, (blando) `#1230` |
| `E2.2` | `feat(mcp-tiering): find_tool({intent}) — índice local que reemplaza dysflow-usage` | `enhancement`, `ai-friendly` | `E2.1` |
| `E2.3` | `chore(mcp-tiering): deprecar los 2 tools legacy con fecha de retiro` | `chore`, `tech-debt` | `E2.1` |

**Evidencia** — `E2E_testing/_helpers/advertised-tool-count.mjs:79` → `EXPECTED_ADVERTISED_TOOL_COUNT = 91`.
La clasificación ya existe (`src/adapters/mcp/agent-workflow-registry.ts:11`, `AgentWorkflowStatus = "preferred" | "specialized" | "legacy"`); lo que falta es que `tools/list` la use.

### F3 — De prosa a gates ejecutables ⭐

| ID | Título | Labels | Depende de |
|---|---|---|---|
| `E3.1` | `feat(mcp-gates): HUMAN_COMPILE_PENDING bloquea test_vba/run_vba (HR-1, AP-11)` | `enhancement`, `reliability`, `critical` | `E1.2` |
| `E3.2` | `feat(mcp-gates): preflight({tool,intent}) — veredicto go/no-go en un round-trip (HR-4)` | `enhancement`, `ai-friendly` | `E1.2` |
| `E3.3` | `feat(mcp-gates): PRODUCTION_BACKEND_WRITE_BLOCKED en el seam de escritura de datos (HR-3)` | `enhancement`, `reliability`, `critical` | `E1.2` |
| `E3.4` | `feat(diagnose): check msaccess_terminated_externally (HR-2, enforcement parcial)` | `enhancement`, `reliability` | `E4.1` |
| `E3.5` | `audit(mcp-gates): cobertura de cross-process-lock desde el dispatch MCP (HR-8)` | `test`, `architecture` | — |

**Evidencia de E3.1** — `src/adapters/mcp/result-translation.ts:677`, `withHumanCompileReminder` es **aditivo y post-hoc**: agrega un campo a un resultado ya producido. `test_vba` corre igual con compilación pendiente.

**Nota sobre E3.5:** `src/core/runner/cross-process-lock.ts` ya serializa por `.accdb` a nivel `access-runner`. **Puede cerrarse como no-op** si el audit confirma cobertura desde el dispatch MCP. En ese caso HR-8 pasa a `runtime-gate` en la matriz sin escribir código.

**Nota sobre E3.4:** HR-2 es la única regla del arnés **no convertible a gate** — el kill pasa fuera del MCP. Se asume enforcement parcial (detección post-hoc + `instructions`) y se declara así en la matriz.

### F4 — `diagnose` aprende a reparar

| ID | Título | Labels | Depende de |
|---|---|---|---|
| `E4.1` | `refactor(diagnose): check registry pluggable + envelope estable por check` | `refactor`, `architecture` | — |
| `E4.2` | `feat(diagnose): repair({check,mode}) con plan/dryRun/apply, backup y allowlist` | `enhancement`, `reliability`, `high` | `E4.1` |
| `E4.3` | `feat(diagnose): checks reparables que retiran vba-form-repair, vba-form-metadata-repair y vba-binary-drift` | `enhancement`, `ai-friendly` | `E4.2` |

Envelope objetivo, copiado de engram:
```json
{
  "check_id": "form_vb_name_mismatch",
  "result": "ok|warning|blocked|error",
  "severity": "info|warning|blocking|error",
  "reason_code": "stable_reason_code",
  "evidence": {},
  "safe_next_step": "…",
  "requires_confirmation": false
}
```

**Decisión de diseño abierta (bloquea `E4.2`):** estrategia de backup antes de `apply` sobre un `.accdb` de cientos de MB. Tres opciones sobre la mesa — backup completo, backup del artefacto afectado, o `apply` restringido a checks reversibles por diseño.

### F5 — Los workflows los sirve el runtime

| ID | Título | Labels | Depende de |
|---|---|---|---|
| `E5.1` | `feat(mcp-prompts): exponer la capability prompts con los 5 workflows canónicos` | `enhancement`, `ai-friendly` | `E1.2` |
| `E5.2` | `feat(schema): examples por tool servidos desde el runtime (retira dysflow-examples-sync)` | `enhancement`, `ai-friendly` | `E1.2` |

**Evidencia** — `src/adapters/mcp/stdio.ts` registra handlers solo para `ListToolsRequestSchema` (284) y `CallToolRequestSchema` (298). No hay `prompts`.

### F6 — Distribución zero-config

| ID | Título | Labels | Depende de |
|---|---|---|---|
| `E6.1` | `feat(dist): .claude-plugin/ + plugin/ in-repo, versionados con el binario` | `enhancement`, `architecture` | `E1.3` |
| `E6.2` | `feat(dist): dysflow setup --agent <claude\|opencode\|codex\|gemini>` | `enhancement`, `ux` | `E6.1` |

### F7 — Retirada y prueba

| ID | Título | Labels | Depende de |
|---|---|---|---|
| `E7.1` | `chore(skills): retirar dysflow-arnes y dysflow-usage (generadas desde runtime o eliminadas)` | `chore`, `documentation` | F1-F6 |
| `E7.2` | `test(e2e): loop completo sin skills instaladas + gate anti-regreso de meta-skills` | `test`, `critical` | `E7.1` |

---

## 4. Orden de despliegue por release

Una **minor por fase**. Nada se acumula: cada fase sale sola y se observa antes de la siguiente.

| Release | Fase | Contenido | Breaking |
|---|---|---|---|
| `v2.30.0` | F0 + F1 | Matriz de cobertura + `instructions` + `get_protocol` | No |
| `v2.31.0` | F4 (a) | Check registry + envelope estable | No |
| `v2.32.0` | F3 (a) | `HUMAN_COMPILE_PENDING`, `PRODUCTION_BACKEND_WRITE_BLOCKED` | **Sí — de facto** |
| `v2.33.0` | F3 (b) | `preflight`, audit HR-8, check HR-2 | No |
| `v2.34.0` | F4 (b) | `repair` con plan/dryRun/apply + checks reparables | No |
| `v2.35.0` | F5 | Capability `prompts` + `examples` desde runtime | No |
| `v2.36.0` | F2 | Tiering **detrás de flag opt-in** (`DYSFLOW_TOOL_TIER`) | No |
| `v2.37.0` | F6 | Plugin in-repo + `dysflow setup` | No |
| `v3.0.0` | F2 flip + F7 | Tiering por defecto + retirada de skills | **Sí** |

**Por qué F3 va antes que F2:** los gates protegen contra corrupción de binario y escritura a producción. El tiering es coste de contexto. Si hay que elegir qué llega antes al fleet, llega lo que evita perder trabajo.

**Por qué el tiering va opt-in primero:** cortar `tools/list` de 91 a 22 puede romper consumidores que llaman tools `specialized` por nombre. Una minor con opt-in da una ventana de observación; el flip del default espera a la major.

**Por qué F4 se parte en dos releases:** el registry (`E4.1`) es refactor sin cambio de comportamiento y puede salir temprano. `repair` (`E4.2`) escribe sobre `.accdb` y necesita la decisión de backup resuelta.

---

## 5. Gates por release

Cada release de la épica pasa estos gates **además** de los del release checklist estándar del repo:

1. **Gate de cobertura** — la matriz de `E0.1` refleja el nuevo `enforcement` de cada regla tocada. CI falla si una regla cambió de nivel sin actualizar la fila.
2. **Gate de paridad de protocolo** — los 20 `ruleId` aparecen en el payload de `instructions` + `get_protocol`. Desde v2.30.0.
3. **Gate de presupuesto** — `instructions` ≤ 6 000 chars. Desde v2.30.0.
4. **Gate de dependencias** — `pnpm ls --depth 0` sigue reportando exactamente `@modelcontextprotocol/sdk` y `zod`. En todas.
5. **Gate de no-regresión intencional** — `compile_vba` no existe, el kill genérico sigue prohibido, `bothChanged` sigue manual. En todas.
6. **Gate de tool count** — `EXPECTED_ADVERTISED_TOOL_COUNT` actualizado y coherente con el tier activo. Desde v2.36.0.

---

## 6. Rollback

| Fase | Estrategia | Coste |
|---|---|---|
| F1 | Vaciar `instructions`. El campo es aditivo; ningún cliente lo requiere. | Trivial |
| F2 | `DYSFLOW_TOOL_TIER=all` restaura las 91. | Trivial |
| F3 | **El más delicado.** Los gates rechazan llamadas que antes pasaban. Cada gate lleva su override explícito documentado (ej. `acknowledgeCompilePending:true`). Rollback = flag de política a `advisory`. | Medio — requiere override por diseño |
| F4 | `repair` es opt-in por llamada; `diagnose` sigue read-only por defecto. Backup previo a `apply` permite restauración manual. | Bajo |
| F5 | Capability aditiva. Se retira sin afectar tools. | Trivial |
| F6 | Distribución. No toca runtime. | Trivial |
| F7 | Las skills están en git. Se restauran. | Trivial |

**Regla de rollback:** ningún gate de F3 se despliega sin su override. Un gate sin salida de emergencia bloquea trabajo real de un humano frente a un Access abierto.

---

## 7. Antes de abrir las issues

Las 21 issues están especificadas pero **no creadas**. Esperan la opinión de la IA especialista en dysflow sobre cinco decisiones (detalle en §9 del documento de la épica):

1. `get_protocol` como tool o como MCP resource; presupuesto de 6 000 chars.
2. Si el corte de `tools/list` rompe consumidores del fleet.
3. Si `cross-process-lock` ya cubre HR-8 desde el dispatch MCP.
4. **Estrategia de backup antes de `apply` sobre un `.accdb` grande** — la decisión más importante.
5. Si el orden de fases es correcto.

Y la pregunta de fondo: **¿algo está mal diagnosticado?** La comparación con engram es herramienta, no mandato. Si dysflow tiene razón de diseño para algo marcado como gap, esa razón gana y la issue no se abre.

---

## 8. Tabla de retirada de skills

Trazabilidad de qué fase mata qué skill. Es el marcador de la épica.

| Skill | Qué la reemplaza | Fase |
|---|---|---|
| `dysflow-arnes` | `instructions` + `get_protocol` | F1 → retiro F7 |
| `dysflow-usage` | `schema` + `describe_tool` + `find_tool` | F2 → retiro F7 |
| `dysflow-examples-sync` | `examples` servidos por runtime | F5 |
| `dysflow-pointer-rollout` | Sin arnés externo, no hay pointers que redistribuir | F1 |
| `dysflow-codegraph-update` | Sin drift posible, no hay drift que reparar | F7 |
| `vba-form-metadata-repair` | Check reparable `form_vb_name_mismatch` | F4 |
| `vba-form-repair` | Checks reparables de forms | F4 |
| `vba-binary-drift` | Check reparable `source_binary_drift` | F4 |
| `vba-run-tests`, `vba-validate-manifest` | Prompt `tdd-loop` + `preflight` | F3 + F5 |
| `vba-blast-radius`, `vba-source-impact`, `vba-symbol-rename`, `vba-control-rename-safe` | Prompts orquestadores (cruzan a codegraph-vba — **no se absorben**) | F5 |
| `vba-access`, `access-vba-tdd-*`, `access-vba-e2e-methodology` | **Se quedan.** Son didácticas, no operativas. | — |

**8 skills retiradas, 4 convertidas en prompts, el resto se queda como material de enseñanza.**
