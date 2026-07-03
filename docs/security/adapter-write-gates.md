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

## Process-wide write default

The two adapters also start with **different process-wide write defaults**, for the
same trust-model reason above:

| Adapter | Command | Default | Opt-out / opt-in |
|---------|---------|---------|-------------------|
| MCP (stdio) | `dysflow mcp` | **Writes enabled** | `--disable-writes` runs read-only. `--enable-writes` is an accepted no-op. |
| HTTP | `dysflow serve` | **Writes disabled** | `--enable-writes` opts in for a trusted local session. |

Rationale: the stdio caller is the process owner (the parent that spawned `dysflow
mcp`), so it is safe to default that surface **on**. The HTTP adapter is a network
surface — any caller that can reach the port is untrusted by default — so it stays
**off** until an operator explicitly enables it.

This only changes the default *input* to the write gate. Per-repo `allowWrites`,
`allowedProcedures`, and the ad hoc `buildExplicitConfig` floor in
`src/core/config/dysflow-config.ts` are unchanged and still apply on top of this
default — a repo can still be scoped to read-only with `"allowWrites": false` even
while the MCP process default is enabled. See `resolveMcpWriteAccessForInput` in
`dispatch-common.ts` for the unchanged precedence order.

## Per-repo write-gate config — `capabilities` block (v1.14.0+)

The `capabilities` block in `.dysflow/project.json` is the **canonical home** for
the per-repo write gate (`allowWrites`) and the procedure allowlist/denylist
(`procedures.allow` / `procedures.deny`). It supersedes the top-level
`allowWrites` and `allowedProcedures` fields, which are kept as **deprecated
read-through aliases** until v1.15.0. Reference implementation: the
`DysflowProjectCapabilities` type and the `resolveCapabilities` helper,
both in the dysflow-config module.

### Canonical form

```json
{
  "id": "project-abc",
  "accessPath": "src/ProjectABC.accdb",
  "capabilities": {
    "allowWrites": false,
    "procedures": {
      "allow": ["Refresh", "ExportReport", "RunMigration"]
    }
  }
}
```

### Precedence table

When BOTH the top-level aliases and the `capabilities` block are present in the
same `.dysflow/project.json`, the `capabilities` block wins and a **single**
deprecation warning is surfaced on `successResult.diagnostics` (source =
`project-config`, level = `warning`). The user is not pummeled with one warning
per field.

| Top-level fields present? | `capabilities` block present? | Effective `allowWrites` | Effective `allowedProcedures` | Warnings |
|---------------------------|-------------------------------|-------------------------|------------------------------|----------|
| no                        | no                            | `false` (default)       | `undefined`                  | none     |
| yes                       | no                            | top-level               | top-level                    | none     |
| no                        | yes                           | `capabilities.allowWrites` | `capabilities.procedures.allow` | none |
| yes                       | yes                           | `capabilities.allowWrites` | `capabilities.procedures.allow` | 1      |

`procedures.deny` is a **project-level advisory signal** reserved for a future
wire. The runtime gate stays `procedures.allow` only — `deny` is preserved in
the schema so a future PR can wire it without breaking `.dysflow/project.json`
consumers. See the `dysflow-config-capabilities-block.test.ts` suite for
the locked precedence contract.

### Migration plan

- **v1.14.0** (this PR, #657): add `capabilities` block; top-level aliases stay
  as deprecated read-through; single warning on conflict.
- **v1.15.0**: remove the top-level `allowWrites` / `allowedProcedures` fields
  from `DysflowProjectConfig`. `resolveCapabilities` and the deprecation
  warning go with them.

## What each adapter gates

| Operation | HTTP | MCP | Why |
|-----------|------|-----|-----|
| SQL writes (`exec_sql`, fixtures, maintenance writes) | gated on `writesEnabled` | gated on `writesEnabled` / write resolver | Same on both — destructive SQL is always gated. |
| `force` cleanup | gated | gated (the `force` branch of `handleMcpAccessCleanup` in `canonical-handlers.ts`) | Destructive escalation, gated on both. |
| **VBA execution** (`/vba/execute`, `dysflow_vba_execute`, `run_vba`) | gated on `writesEnabled` (the `POST /vba/execute` handler in `server.ts`) | **controlled by the `allowedProcedures` allowlist, NOT the write-gate** (`handleMcpVbaExecute` in `canonical-handlers.ts` takes no `writesEnabled`) | See below. |

## Why VBA on MCP is allowlist-controlled, not write-gated

On MCP, the control for VBA is the `allowedProcedures` allowlist. This is intentional
and is locked by tests:

- The `allowedProcedures` describe blocks in `test/adapters/mcp/tools.test.ts` lock the
  allowlist as the gate: a procedure not in the list is blocked; one in the list runs;
  an empty/unset list runs.
- VBA executes under the default (writes-disabled) MCP configuration across many of the
  modern-tool and `run_vba` tests in that same file.

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
