# Absent by Design

[Back to Codebase Guide](../../CODEBASE-GUIDE.md)

Dysflow deliberately does not implement the capabilities below.

This page exists so a reader — human or agent — does not invent them, reintroduce them, or file their absence as a defect.

## Source Validation Result

| Expected capability | Status in this repository |
|---|---|
| `compile_vba` MCP tool | Removed in v1.19.0 (`feat-759-no-compile`). Guard entries remain so a legacy `compile: true` fails loudly. |
| `vba_inline_execution` MCP tool | Removed in v4.0.0. Use the version-controlled [`_Temp_*.bas` workflow](../vba-execution.md) with `import_modules`, the human compile checkpoint, and `run_vba`. |
| Top-level project-config `allowWrites` / `allowedProcedures` | Removed in v1.15.0. Config loading rejects them with `CONFIG_TOP_LEVEL_FIELDS_REMOVED`; see the [v4.0.3 migration note](../migrations/v4-0-3.md). |
| Web dashboard or server-rendered UI | Not found. No HTMX, template, or UI route exists. |
| Auth, login, OAuth, session, or tenant boundary | Not implemented. |
| Git-clone or source-build update *fallback* | Not found. No failure ever falls back to a source build. The `main` channel builds from source only when an operator names it and sets `DYSFLOW_ALLOW_INSECURE_UPDATE=1`. |
| Termination of `MSACCESS.EXE` by process name | Not implemented. |

## What Exists Instead

| Need | Owner in this repo |
|---|---|
| Compilation | The human compiles in Access (Debug > Compile). `src/core/runtime/human-compile-state.ts` tracks the pending state. |
| Interactive UI | `src/cli/tui/` renders a terminal dashboard through the `dysflow` command. It is terminal-only. |
| Local HTTP surface | `src/adapters/http/server.ts` serves a JSON API bound to `127.0.0.1`, writes-disabled by default. |
| Update path | The signed GitHub Release archive with SHA-256 verification on `stable`. `beta` is checksum-only and `main` is a gated, unverified source build. See [update trust model](../security/update-trust-model.md) and [installation channels](../installation-channels.md). |
| Orphan reaping | `access_force_cleanup_orphaned` terminates one PID-verified orphan, and only after an explicit `confirmPid`. |
| Project write and procedure gates | Use `capabilities.allowWrites` and `capabilities.procedures.allow`; `migrate_project_config` rewrites removed top-level fields. |

## Invariants for Future Work

- **The human compiles**: no code path may reintroduce an automated compile step. The runtime persists modules with save-only and blocks until the human confirms.
- **Local-only HTTP**: the HTTP adapter binds to loopback and starts writes-disabled. It is a maintenance surface, not a hosted service.
- **No implicit or fallback source build**: `stable` and `beta` install published release archives and never build from source. `main` builds from source only when the operator names the channel and sets `DYSFLOW_ALLOW_INSECURE_UPDATE=1`; it verifies nothing. What stays absent is an *ungated* source build, a *default* one, and any build reached by a failed download — each would bypass the trust model.
- **PID-verified termination**: a process is reaped by verified PID, never by image name. Name-based termination kills the operator's own Access session.
- **Absence is documented, not silent**: when a capability is removed, add a row above and name the release that removed it.

## Contributor Checklist

- [ ] Search the source tree before documenting a capability as present or absent.
- [ ] Mark an absent capability as absent instead of filling the gap with an assumption.
- [ ] Record the removing release when a capability leaves the tool surface.
- [ ] Keep terminal UI claims separate from web UI claims.

## Navigation

Previous: [Core and adapters](./dysflow-core-and-adapters.md) | Back: [Codebase Guide](../../CODEBASE-GUIDE.md)
