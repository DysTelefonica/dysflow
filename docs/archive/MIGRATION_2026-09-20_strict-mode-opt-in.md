# Migration — `capabilities.procedures.strictMode` opt-in

**Applies to**: every project with a `.dysflow/project.json`.
**Introduced**: the release following v4.4.5.
**Action required**: none for most projects. Read the checklist below to confirm.

## What changed

The MCP procedure gate is now **default-allow**. `run_vba` and stdio `test_vba`
enforce `capabilities.procedures.allow` only when the same project declares:

```json
{ "capabilities": { "procedures": { "strictMode": true } } }
```

Without that flag, a populated `allow` list is documentation: every procedure
the write gate permits will run.

The gate had been default-deny since PR1a #621 (v2.20.0). In practice that
meant a project had to register every production procedure and every newly
written test atom in `.dysflow/project.json` before it could run them — a list
that had to be edited on each fix. That cost bought no boundary the write gate
(`writesProcess.enabled`, `writesProject.allowWrites`, `writeExecutionPolicy`)
and `humanCompilePending` did not already hold, so enforcement became opt-in.

## What did NOT change

- The write gate. It is still authoritative and decides whether a write-class
  call executes at all — and it now covers `run_vba` too, which it previously
  did not. A project that calls `run_vba` with `apply: true` while writes are
  disabled will now get `MCP_WRITES_DISABLED` where it used to execute.
  `apply: false` previews are unaffected.
- `humanCompilePending`. The human still compiles in Access.
- The error codes `MCP_PROCEDURE_NOT_ALLOWED` and
  `MCP_ALLOWLIST_NOT_CONFIGURED`, their envelopes, and their structured
  `allowedProcedures` / `remediation` fields. A consumer that branches on them
  keeps working; under the default they simply stop firing on MCP.
- `capabilities.procedures.allow` in the schema. It remains the authoritative
  allowlist wherever the gate is enforced.
- `capabilities.procedures.deny`. Still advisory, still unwired.
- **Both HTTP routes.** `POST /vba/execute` still rejects a procedure outside a
  populated allowlist with `HTTP_PROCEDURE_NOT_ALLOWED`, and `POST /vba/test`
  keeps its missing/empty default-deny. HTTP ignores `strictMode` entirely: the
  composition root pins strict enforcement on, so a project config can never
  relax the network surface.
- The gate order: write gate is level 1, procedure gate level 2,
  `humanCompile` level 3.
- `discoverAllowedProcedures`. Still a standalone utility, never auto-wired.

## The three states

```jsonc
// 1. Default — no procedures block at all. Everything the write gate
//    permits runs. Recommended for single-developer projects and local
//    worktrees.
{
  "capabilities": { "allowWrites": true }
}

// 2. Documentation only — the list is kept for readers, enforced by nobody
//    on MCP. HTTP still enforces it.
{
  "capabilities": {
    "allowWrites": true,
    "procedures": { "allow": ["Test_A", "Test_B"] }
  }
}

// 3. Enforced — the pre-change behavior, restored exactly. Recommended for
//    CI, fleet automation, and shared non-interactive runners.
{
  "capabilities": {
    "allowWrites": true,
    "procedures": { "allow": ["Test_A", "Test_B"], "strictMode": true }
  }
}
```

A non-boolean `strictMode` (`"true"`, `1`, `{}`) resolves to `false`. Config
loading does not fail on it: a typo must not silently re-arm a gate a project
deliberately left open, and it must not brick config loading either.

## Checklist — five questions before you upgrade

1. **Does this project have `capabilities.procedures.allow` populated?** If
   not, nothing changes for you. Stop here.
2. **Was that list there to restrict what can run, or is it a leftover test
   registry?** A list of `Test_*` atoms that grew one entry per fix is the
   second kind — that is the anti-pattern this change removes. Delete it or
   leave it as documentation.
3. **Does anything non-interactive call this project — CI, a fleet runner, a
   scheduled job?** If yes, set `strictMode: true` and keep the list.
4. **Does any consumer branch on `MCP_PROCEDURE_NOT_ALLOWED` or
   `MCP_ALLOWLIST_NOT_CONFIGURED` from an MCP call?** Those branches become
   unreachable without `strictMode`. Confirm the consumer degrades sensibly or
   set `strictMode: true`.
5. **Does anything reach this project over HTTP?** Then nothing changed for
   that path — it was never governed by `strictMode` and still is not.

## Verifying the result

`get_capabilities` reports the resolved allowlist. To confirm the posture that
is actually in force, read `capabilities.procedures.strictMode` in
`.dysflow/project.json` — that value, resolved per call, is what decides.
