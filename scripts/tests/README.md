# Offline Pester tests

These tests run offline: no Access, no real COM, no process is ever killed.

Run them with `pnpm test:ps1` (entry point: [`Invoke-OfflinePester.ps1`](./Invoke-OfflinePester.ps1)).

## The guard (#1948, #1958)

The seams in [`../lib/dysflow-access-com.ps1`](../lib/dysflow-access-com.ps1) refuse real side effects under Pester.

A refusal throws `DYSFLOW_PESTER_GUARD: ...`, and fails the test loudly:

- The default `Open-CanonicalAccess -ComSpawnAction` refuses to create `Access.Application`, unless `DYSFLOW_MOCK_COM=1`.
- `Stop-AccessPidAndWait` refuses a real `Stop-Process` and the real `taskkill` last resort. A test override or a Pester `Mock` of `Stop-Process` / `Start-Process` is allowed.

The guard is active when either condition holds:

- the Pester module is loaded, so a direct `Invoke-Pester -Path scripts/tests` is covered;
- `DYSFLOW_PESTER_GUARD=1`, set by the entry point and inherited by child processes.

`DYSFLOW_PESTER_ALLOW_REAL_ACCESS=1` disables it. Set it only for an integration run that really drives Access.

[`dysflow-pester-guard-1948-1958.Tests.ps1`](./dysflow-pester-guard-1948-1958.Tests.ps1) proves the guard.

## Override-scoping rule

A stub replaces a library function only if it is defined AFTER the library is dot-sourced, in the scope the code under test resolves from.

Dot-sourcing `dysflow-access-com.ps1` redefines every library function. A stub defined before it is silently overwritten, and the real code path runs.

Prefer, in this order:

1. Inject the seam parameter: `-ComSpawnAction`, `-KillPidAction`, `-ExitWaitAction`, `-WmiSnapshotAction`.
2. Use Pester `Mock` after the dot-source.
3. Define `function script:<Name>` after the dot-source, in the `It` or `BeforeEach` that needs it.

A `function script:` override persists for the rest of the file. A later test that expects the real command must not rely on it.
