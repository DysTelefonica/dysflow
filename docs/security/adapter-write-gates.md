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
wire. The runtime gate stays `procedures.allow` only — `deny` is preserved in
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
| **Arbitrary VBA execution** (`/vba/execute`, `dysflow_vba_execute`, `run_vba`) | gated on `writesEnabled`; configured lists reject procedures outside them | `run_vba` is default-deny and requires a non-empty `allowedProcedures` list for execution | Arbitrary compiled VBA keeps the strongest procedure gate. |
| **VBA tests** (`/vba/test`, `test_vba`) | `/vba/test` is default-deny when the allowlist is missing/empty | stdio `test_vba` is unrestricted when the list is missing/empty; a non-empty list is an opt-in whitelist | The local parent process is the stdio trust boundary; HTTP remains stricter. |

## Why VBA on MCP is allowlist-controlled, not write-gated

On MCP, the resolved allowlist from `capabilities.procedures.allow` has two intentional contracts, locked by tests:

- `run_vba` is default-deny: a missing/empty list refuses execution, while a
  configured list permits only named procedures.
- `test_vba` treats a missing/empty list as unrestricted. A non-empty list is
  an opt-in whitelist and atomically rejects a plan containing any other test.
- VBA executes under the default (writes-disabled) MCP configuration across many of the
  modern-tool and `run_vba` tests in that same file.

The rationale: a stdio MCP server is launched by a trusted parent process. The operator
who wires `dysflow mcp` into their client is the same operator who controls what runs.
The meaningful, per-deployment control over *which* VBA can run is the allowlist, which
an operator sets in `.dysflow/project.json` / config. HTTP cannot make that assumption,
because a network caller is not necessarily the operator — hence its blanket write-gate.

## Residual consideration (not a code change)

The one case worth an operator's attention: **no `capabilities.procedures.allow` configured** means
any manifest-selected test can run through stdio `test_vba`. It does not open arbitrary
`run_vba`, and the write, sandbox, manifest, and human-compile gates remain intact. On
stdio there is no remote vector because the client is the trust boundary. For projects
that want a narrower test surface:

> Configure a non-empty `capabilities.procedures.allow` list to opt into a test whitelist.

## Decision

The HTTP/MCP VBA gate asymmetry is **by design** and stays. Tracked as
[#522](https://github.com/DysTelefonica/dysflow/issues/522) (reclassified from bug to
documentation), with the `test_vba` refinement tracked by #1556.
