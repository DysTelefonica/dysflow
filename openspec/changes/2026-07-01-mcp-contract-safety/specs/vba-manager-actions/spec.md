# Delta for `vba-manager-actions` — `2026-07-01-mcp-contract-safety`

Scope: Finding #5 — the VBA execution default-deny at the MCP adapter is the
*only* gate implemented by this PR (PR1). This delta encodes the
**observable contract** that consumers expect across MCP and CLI paths so that
when the PowerShell layer is eventually brought to parity (in a separate PR),
the requirement is the regression guard.

> **Scoping note.** The proposal grouped Finding #5 under
> `vba-manager-actions`, but PR1's listed code changes are entirely in
> `src/adapters/mcp/**`. The actual gate (`ensureProcedureAllowed` →
> `handleMcpVbaExecute` default-deny) lives at the MCP adapter and is
> pinned in `openspec/changes/2026-07-01-mcp-contract-safety/specs/mcp-stdio-adapter/spec.md`.
> This delta encodes CLI parity as the **target contract**; the consumer
> behavior is identical today (the MCP gate returns "not allowed"; the
> PowerShell layer uses a separate code path that does not yet check the
> same allowlist — making the MCP guard the only enforcement today).

## ADDED Requirements

### Requirement: CLI Invoke-RunProcedureAction Honors the Same Allowlist as MCP `run_vba`

`Invoke-RunProcedureAction` MUST refuse to call `Invoke-AccessProcedure`
when the project config declares a non-empty `allowedProcedures` list AND
the requested procedure is not in that list. This mirrors the MCP adapter's
default-deny gate so consumers observe identical gate behavior across CLI
and MCP. **This is a forward-looking requirement; no PowerShell code is
changed in PR1.** A separate capability change is required to bring the
PowerShell layer to parity; until then, the MCP adapter gate is the only
enforcement point.

#### Scenario: CLI with allowlist configured — procedure outside the list is refused

- GIVEN `.dysflow/project.json` declares `allowedProcedures: ["Refresh"]`
- WHEN `Invoke-RunProcedureAction` runs with `-ProcedureName "DeleteAll"`
- THEN the action MUST return an error result whose message contains
  the literal substring `allowedProcedures`
- AND `Invoke-AccessProcedure` MUST NOT be invoked
- (Pin: a future Pester test in `test/scripts-vba-manager.Tests.ps1` —
  `Invoke-RunProcedureAction refuses procedure outside allowedProcedures`.
  This test does NOT exist yet; PR1 does not write it. The scenario
  documents the contract for the eventual follow-up PR.)

#### Scenario: CLI with allowlist configured — procedure inside the list is honored

- GIVEN the same `allowedProcedures: ["Refresh"]`
- WHEN `Invoke-RunProcedureAction` runs with `-ProcedureName "Refresh"`
- THEN `Invoke-AccessProcedure` MUST be called exactly once with the
  same procedure name and converted args
- AND the action MUST pass the return value through unchanged
- (Pin: future test mirror; covered for the **MCP** path by
  `test/adapters/mcp/tools.test.ts` `allowedProcedures — procedureName
  allowlist for run_vba alias`.)

#### Scenario: CLI with no allowlist — explicit dryRun is recognized (forward-looking)

- GIVEN `.dysflow/project.json` does NOT declare `allowedProcedures`
- WHEN `Invoke-RunProcedureAction` runs with `-ProcedureName "Anything"`
- THEN the action MUST proceed (today: it always proceeds; the future
  contract asserts that any default-deny introduced for parity offers a
  dry-run-class escape hatch consistent with the MCP adapter)
- (Pin: future test; PR1 does not write it.)
