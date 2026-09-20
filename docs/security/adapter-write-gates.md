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

This only changes the default *input* to the write gate. Per-repo
`capabilities.allowWrites`, `capabilities.procedures.allow`, and the ad hoc `buildExplicitConfig` floor in
`src/core/config/dysflow-config.ts` are unchanged and still apply on top of this
default — a repo can still be scoped to read-only with `"capabilities": { "allowWrites": false }` even
while the MCP process default is enabled. See `resolveMcpWriteAccessForInput` in
`dispatch-common.ts` for the unchanged precedence order.

## Per-repo write-gate config — `capabilities` block (v1.14.0+)

The `capabilities` block in `.dysflow/project.json` is the **canonical home** for
the per-repo write gate (`allowWrites`) and the procedure allowlist/denylist
(`procedures.allow` / `procedures.deny`). Top-level `allowWrites` and
`allowedProcedures` were removed in v1.15.0. The runtime rejects either with
`CONFIG_TOP_LEVEL_FIELDS_REMOVED`; use `migrate_project_config` to rewrite them
to `capabilities.allowWrites` and `capabilities.procedures.allow`. Reference implementation: the
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

### Removed-field behavior

| Top-level removed fields present? | `capabilities` block present? | Result |
|-----------------------------------|-------------------------------|--------|
| no                                | no                            | `allowWrites: false`; procedure allowlist unresolved |
| no                                | yes                           | Values resolve from `capabilities.allowWrites` and `capabilities.procedures.allow` |
| yes                               | no or yes                     | `CONFIG_TOP_LEVEL_FIELDS_REMOVED` |

`procedures.deny` is a **project-level advisory signal** reserved for a future
wire. The runtime gate reads `procedures.allow` only, and only under
`procedures.strictMode: true` — `deny` is preserved in
the schema so a future PR can wire it without breaking `.dysflow/project.json`
consumers. See the `dysflow-config-capabilities-block.test.ts` suite for
the locked precedence contract.

### Migration history

- **v1.14.0** (#657): added the `capabilities` block and deprecated the top-level fields.
- **v1.15.0**: removed the top-level runtime inputs. The TypeScript fields remain
  only so `migrate_project_config` can type and rewrite legacy JSON before normal
  config loading.

## What each adapter gates

| Operation | HTTP | MCP | Why |
|-----------|------|-----|-----|
| SQL writes (`exec_sql`, fixtures, maintenance writes) | gated on `writesEnabled` | gated on `writesEnabled` / write resolver | Same on both — destructive SQL is always gated. |
| `force` cleanup | gated | gated (the `force` branch of `handleMcpAccessCleanup` in `canonical-handlers.ts`) | Destructive escalation, gated on both. |
| **Arbitrary VBA execution** (`/vba/execute`, `run_vba`) | gated on `writesEnabled`; a populated `allowedProcedures` rejects procedures outside it, always | `run_vba` is default-allow; it enforces `allowedProcedures` only under `capabilities.procedures.strictMode: true` | The stdio caller owns the process; HTTP is a network surface and keeps enforcing. |
| **VBA tests** (`/vba/test`, `test_vba`) | `/vba/test` is default-deny when the allowlist is missing/empty, and rejects a procedure outside a populated one | stdio `test_vba` is default-allow; under `strictMode: true` a missing/empty list is unrestricted and a populated one is an atomic whitelist | The local parent process is the stdio trust boundary; HTTP remains stricter. |

## Why VBA on MCP is write-gated, not allowlist-controlled

On MCP the procedure gate is **default-allow and opt-in**. The resolved
allowlist from `capabilities.procedures.allow` is enforced only when the same
project declares `capabilities.procedures.strictMode: true`:

- Without `strictMode`, neither `run_vba` nor `test_vba` refuses on account of
  the allowlist, whatever `allow` contains.
- With `strictMode: true`, `run_vba` is default-deny again — a missing/empty
  list refuses execution and a populated list permits only its named
  procedures — and `test_vba` treats a missing/empty list as unrestricted while
  a populated one atomically rejects a plan containing any other test.
- `strictMode` is resolved per input, so one process serving several worktrees
  reads each project's own posture.
- A non-boolean `strictMode` resolves to `false`; a typo cannot silently re-arm
  the gate.
- `run_vba` is write-gated. It is an alias tool, so it never reaches
  `createDispatchTool` — the seam where every other write-class tool consults
  `isWriteAllowed` — and for that reason it used to execute compiled VBA under
  the default writes-disabled MCP configuration, with its procedure allowlist
  as the only backend control. The gate now runs inside `handleMcpVbaExecute`,
  ahead of the procedure gate. A non-executing `apply:false` plan is not a
  write and still passes. Pinned by
  `test/adapters/mcp/run-vba-write-gate.test.ts`.

The rationale: a stdio MCP server is launched by a trusted parent process. The operator
who wires `dysflow mcp` into their client is the same operator who controls what runs.
That operator's real per-deployment control is the WRITE gate —
`writesProcess.enabled`, `capabilities.allowWrites`, and `writeExecutionPolicy`
— plus `humanCompilePending` for stale p-code. A second allowlist the operator
had to extend for every production procedure and every newly written test cost
operational effort without adding a boundary the write gate did not already
hold, so it became opt-in. HTTP cannot make the trusted-parent assumption,
because a network caller is not necessarily the operator — hence its blanket
write-gate AND its unconditional allowlist enforcement.

The HTTP composition root
(`src/adapters/http/http-services-factory.ts`) pins `procedureStrictMode: true`
on the service it builds, so `strictMode` in a project config never relaxes the
network surface.

## Residual consideration (not a code change)

The case worth an operator's attention: with the default (no `strictMode`), any
procedure the write gate permits can run through stdio `run_vba` and any
manifest-selected test through stdio `test_vba`. The write, sandbox, manifest,
and human-compile gates remain intact, and on stdio there is no remote vector
because the client is the trust boundary. For projects that want a narrower
surface — CI, fleet automation, a shared non-interactive runner:

> Set `capabilities.procedures.strictMode: true` and configure a non-empty
> `capabilities.procedures.allow` list to opt into an enforced whitelist.

## Decision

The HTTP/MCP VBA gate asymmetry is **by design** and stays. Tracked as
[#522](https://github.com/DysTelefonica/dysflow/issues/522) (reclassified from bug to
documentation), with the `test_vba` refinement tracked by #1556.
