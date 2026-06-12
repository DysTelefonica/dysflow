# Adapter write gates — MCP vs HTTP

This document records a **deliberate** design decision so it is auditable and is not
re-flagged as a bug: the MCP and HTTP adapters apply **different** write-protection to
VBA execution, on purpose, because they sit behind **different threat models**.

## The two adapters have different exposure

| Adapter | Transport | Authentication | Trust model |
|---------|-----------|----------------|-------------|
| HTTP    | TCP socket (`dysflow serve`) | Bearer token, constant-time compare (`src/adapters/http/server.ts` `timingSafeEqual`) | A **network** surface. Anything that can reach the port is a potential caller. |
| MCP     | stdio (the client spawns `dysflow mcp` as a child process) | None at the transport — trust is process ownership | A **local** surface. The caller is the parent process that launched it (OpenCode/Codex). |

HTTP is more exposed, so it is more restrictive. That difference is the whole reason
the gates differ.

## What each adapter gates

| Operation | HTTP | MCP | Why |
|-----------|------|-----|-----|
| SQL writes (`exec_sql`, fixtures, maintenance writes) | gated on `writesEnabled` | gated on `writesEnabled` / write resolver | Same on both — destructive SQL is always gated. |
| `force` cleanup | gated | gated (`src/adapters/mcp/canonical-handlers.ts:122-127`) | Destructive escalation, gated on both. |
| **VBA execution** (`/vba/execute`, `dysflow_vba_execute`, `run_vba`) | gated on `writesEnabled` (`server.ts:276-280`) | **controlled by the `allowedProcedures` allowlist, NOT the write-gate** | See below. |

## Why VBA on MCP is allowlist-controlled, not write-gated

On MCP, the control for VBA is the `allowedProcedures` allowlist. This is intentional
and is locked by tests:

- `test/adapters/mcp/tools.test.ts:1109-1223` — the allowlist is the gate: a procedure
  not in the list is blocked; one in the list runs; an empty/unset list runs.
- VBA executes under the default (writes-disabled) MCP configuration in many tests
  (`tools.test.ts:112-117`, `:199-236`, `:522-555`, `:1052-1068`, `:1091-1106`).

The rationale: a stdio MCP server is launched by a trusted parent process. The operator
who wires `dysflow mcp` into their client is the same operator who controls what runs.
The meaningful, per-deployment control over *which* VBA can run is the allowlist, which
an operator sets in `.dysflow/project.json` / config. HTTP cannot make that assumption,
because a network caller is not necessarily the operator — hence its blanket write-gate.

## Residual consideration (not a code change)

The one case worth an operator's attention: **writes disabled AND no `allowedProcedures`
configured** ⇒ any public VBA procedure can be invoked over MCP. On stdio this has no
remote vector (the client is the trust boundary), so it is not a vulnerability. For
shared or less-trusted deployments, the recommendation is operational, not structural:

> Configure `allowedProcedures` in the project config to constrain MCP VBA execution to
> a known set of procedures.

## Decision

The HTTP/MCP VBA gate asymmetry is **by design** and stays. Tracked as
[#522](https://github.com/DysTelefonica/dysflow/issues/522) (reclassified from bug to
documentation). No code change is made; this document is the deliverable.
