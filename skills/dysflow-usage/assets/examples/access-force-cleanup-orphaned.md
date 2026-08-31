# access_force_cleanup_orphaned — dysflow MCP

## When to use

Safely identify (and optionally kill) `MSACCESS.EXE` processes that hold the project's `accessPath` and are not in dysflow's operation registry. Use when a `run_vba` / `test_vba` / `import_modules` op was interrupted and left an orphan.

## Prerequisites

- Multi-tenant host. Never use `Stop-Process -Name MSACCESS`, `taskkill /F /IM MSACCESS.EXE`, `pkill MSACCESS`, or `kill -9 <pid>` — that path is banned across all projects.
- The user's `accessPath` (the project's locked `.accdb`). The tool refuses any PID that doesn't hold this path.

## Step 1 — list candidates (read-only)

```json
{
  "tool": "access_force_cleanup_orphaned",
  "arguments": {
    "projectId": "<project-id>",
    "accessPath": "<repo>/Gestion_Riesgos.accdb",
    "pid": null
  }
}
```

Response: array of orphan `MSACCESS.EXE` candidates that hold this path and are not in the registry.

## Step 2 — kill a specific PID (gated)

```json
{
  "tool": "access_force_cleanup_orphaned",
  "arguments": {
    "projectId": "<project-id>",
    "accessPath": "<repo>/Gestion_Riesgos.accdb",
    "pid": 12345,
    "implements_check": "orphans_msaccess",
    "confirmedRequiresConfirmation": true
  }
}
```

The tool enforces: headless only; correct `accessPath`; not in registry. Refusal is a signal to leave that PID alone.

## Anti-patterns for this call

- Don't pass a `pid` that didn't appear in step 1's listing. The tool's safety checks catch this; treat a refusal as authoritative.
- Don't pass `force:true` to `cleanup_access_operation` to "skip" registry checks. `force` is escalation, not opt-out.
- Don't use `Get-Process -Name MSACCESS` as a basis for `pid`. That command cannot distinguish dysflow's spawn from a foreign one.
- Don't assume step 1 alone clears locks. The candidate PID stays alive until you re-call with the confirmed `pid`.
- Don't use this tool when `cleanup_access_operation` (without `force`) suffices — it retires a record by reconciling the PID to `cleaned` without killing anything.

## Result shape (what the agent reads back)

- Step 1: `orphans[]` plus `totalCount`. Each orphan includes `{ pid, accessPath, kind, startTime, ageSeconds, mainWindowHandle }`.
- Step 2: `killed[]`, `refused[]`, `errors[]`, and optional `syntheticOperationId`.

## Live verification

```bash
get_capabilities  # confirm writes enabled before the kill step
```

## Cross-reference

- Anti-patterns: `assets/anti-patterns.md#dysflow-only-msaccess-cleanup`
- Error codes: `references/error-codes.md#MCP_INPUT_INVALID`, `references/error-codes.md#MCP_WRITES_DISABLED`
