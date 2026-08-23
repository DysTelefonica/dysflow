# First-call pre-flight checklist — dysflow

Five checks to hold in working memory before EVERY dysflow tool call.
A single failure means **stop and resolve** before calling.

The whole skill is designed around these five checks: if you internalise
them, you stop tripping the same `MCP_INPUT_INVALID`,
`ACCESS_DATABASE_LOCKED`, `MCP_TOOL_NOT_FOUND`, and "I thought I committed but nothing
happened" failure modes that account for most agent friction.

## The five checks

1. **Runtime snapshot is current.** Take the bootstrap snapshot
   (`get_capabilities`-family) and read the live `adapterVersion`
   literally. Do not cite a version from memory or from a previous
   turn. A skill's `requires:` floor that is newer than the live
   version is a hard stop.

2. **The per-tool effective dry-run default matches your intent.** In
   `safe-by-default` mode the global `dryRunDefault` is `true`; pass
   the live `canonicalCommitFlag` explicitly to commit (normally
   `apply:true`; do not invent removed aliases).
   In `developer` mode (v2.1.0+, issue #779), check
   `effectiveDryRunDefault[toolName]` — `routine-dev-write` tools
   (`import_modules`, `test_vba`, `link_tables`, `generate_form`, ...)
   flip to `false` and execute by default. Everything else
   (`destructive-write`, `protected-write`, `arbitrary-write`,
   `process-control`) stays at `true` regardless of policy. Mental
   model from older runtimes (`dryRunDefault:false`) is wrong; see
   anti-pattern #10.

3. **Writes are enabled for write-class calls.** The runtime's
   `writesProcess.enabled` and the project's `writesProject.allowWrites`
   must both be `true`. Either being `false` returns `MCP_WRITES_DISABLED`
   — fix the env, do not bypass.

4. **`humanCompilePending:false`** before any `test_vba` or `run_vba`
   call. If `true`, ask the user to compile in Access (Debug > Compile),
   then re-verify the snapshot before proceeding. The runtime enforces
   this gate; you should too.

5. **The tool name is advertised.** Check `tools[toolName]` as well as the `toolsVisible` count. An unknown name returns `MCP_TOOL_NOT_FOUND`; do not invent aliases.
6. **Input failures are classified.** `missingParam` means supply the named required field; `rejectedFlag(s)` plus `toolCommitFlag` means resolve conflicting write intent.

## Why these five

Without (1), you ship calls against an outdated schema and trip
`MCP_INPUT_INVALID` from tool names that no longer exist.

Without (2), every call is plan-only — easy to think you committed when
you didn't.

Without (3), every write returns `MCP_WRITES_DISABLED` and you waste a
loop figuring out "why nothing happened".

Without (4), you run tests against a stale binary and the failure is
opaque — the line numbers and assertions will look right but mean
nothing.

Without (5), you cite a number that drifted between releases and the
reader cannot reproduce it.

## What to do on a single failure

| Check failed | First action |
|---|---|
| (1) adapterVersion < floor | Re-run `get_capabilities`; if still behind, ask user to restart the MCP client. Do NOT cite the newer floor in skill text. |
| (2) dryRunDefault mismatch (or per-tool effective mismatch) | Verify against the read-back; pass the explicit commit flag; re-check on next call. In `developer` mode, the per-tool `effectiveDryRunDefault` is the source of truth. |
| (3) writes disabled | Inspect `~/.config/opencode/opencode.json` `allowWrites` and `dysflow mcp --enable-writes` flag. Ask the human if the disablement was intentional. |
| (4) humanCompilePending:true | ASK the user to compile. Wait for "ya está". Re-verify `get_capabilities` before retrying. |
| (5) toolsVisible or tool-map drift | Re-snapshot, then update the citation or canonical tool name. |
| (6) missingParam | Add the named required field from `describe_tool`; do not trial-and-error aliases. |

## Verification

The checklist is enforced mechanically by `get_capabilities`. If you
cannot produce a snapshot, the runtime is the thing that is wrong — not
your checklist. Surface the runtime error to the user, do not proceed
by guessing defaults.
