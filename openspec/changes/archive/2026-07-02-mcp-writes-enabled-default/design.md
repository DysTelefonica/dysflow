# Design: MCP stdio writes-enabled by default

## Technical Approach

Flip the process-wide write default for the **stdio** surface only, in two
places, and document the stdio-vs-HTTP asymmetry as an intentional trust-model
decision. No gate/resolver logic changes: `isWriteAllowed` and
`resolveMcpWriteAccessForInput` keep their exact precedence; only the default
value of the `writesEnabled` input they OR against changes. This is a
default-value flip plus one additive CLI flag — trivially one-commit revertable.

## Architecture Decisions

### Decision: Compute `writesEnabled` from `--disable-writes`, not `--enable-writes`

**Choice**: `const writesEnabled = !disableWrites;` after parsing both flags.
`--enable-writes` becomes an accepted no-op (it can only re-assert the new
default). Neither flag → enabled. `--disable-writes` only → disabled.
**Alternatives**: keep `includes("--enable-writes")` and OR a default — rejected
because it makes the default implicit and scatters the truth table.
**Rationale**: a single derived boolean makes the truth table exhaustive and
readable; back-compat is preserved because passing `--enable-writes` still
yields `writesEnabled = true`.

### Decision: Reject both flags with an explicit mutual-exclusion message + usage

**Choice**: exit code `1`, printed to **stderr**, message
`--enable-writes and --disable-writes are mutually exclusive. Cannot use both at the same time.\n${MCP_USAGE}`.
**Alternatives**: silently prefer one flag (hides operator mistake); reuse the
bare `MCP_USAGE`-only path (loses the specific cause).
**Rationale**: matches the two established CLI conventions — the
mutual-exclusion wording from `access/relink-directory.ts` ("... are mutually
exclusive. Cannot use both at the same time.") and the "message + usage on
stderr, exit 1" shape from `serve.ts` (`${parsed.message}\n${SERVE_USAGE}`).

### Decision: Flip `stdio.ts:96` fallback `?? false` → `?? true`

**Choice**: change the adapter's own default so a direct
`startMcpStdioAdapter(config)` (no `options.writesEnabled`) defaults enabled,
matching the CLI default.
**Rationale**: keeps the two entry points consistent. Blast radius is empty in
practice (see Call Sites) — the CLI always passes an explicit boolean, and no
test constructs the real adapter — but leaving it `?? false` would create a
silent split-brain default between the two surfaces.

## Call Sites of `startMcpStdioAdapter` (for sdd-tasks)

| Caller | Passes `writesEnabled`? | Affected by fallback flip? |
|--------|-------------------------|----------------------------|
| `src/cli/commands/mcp.ts:25` (only production caller) | Yes — explicit `{ writesEnabled }` | No |
| `test/cli/commands.test.ts:200,225`, `test/cli/subcommand-help.test.ts:20` | Inject `context.startMcpAdapter` mock — real adapter never runs | No |
| Any direct no-arg `startMcpStdioAdapter()` | — none exist in `src/` or `test/` | (would be, if added) |

No test relies on the old `?? false` implicit default; the fallback flip needs
no test updates. New tests are additive (bare `mcp` default, `--disable-writes`,
both-flags rejection).

## Why the gate/resolver need no change

`dispatch-common.ts` `isWriteAllowed(input, writesEnabled, resolver)` is:

```
if (writesEnabled) return true;        // process-wide fast path (OR)
if (resolver === undefined) return false;
return await resolver(input);          // per-request per-repo allowWrites
```

Flipping the process-wide default only changes **which branch is taken by
default**: bare `dysflow mcp` now short-circuits at the first line. The
per-request path (`resolveMcpWriteAccessForInput` reading project
`allowWrites`) is untouched — its own logic is independent of the flag and stays
the ultimate control for any read-only session. This is an explicit non-goal:
`dispatch-common.ts` and `buildExplicitConfig`'s hardcoded-false floor are not
edited.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/cli/commands/mcp.ts` | Modify | Parse `--disable-writes`; `writesEnabled = !disableWrites`; reject both flags; update `MCP_USAGE` to `Usage: dysflow mcp [--disable-writes \| --enable-writes]`. |
| `src/adapters/mcp/stdio.ts` | Modify | `options?.writesEnabled ?? false` → `?? true` (line 96). |
| `docs/security/adapter-write-gates.md` | Modify | Add section (below). |

## Doc edit — `docs/security/adapter-write-gates.md`

Insert a new section **`## Process-wide write default`** immediately after the
"The two adapters have different exposure" table (before "What each adapter
gates"). It states: stdio (`dysflow mcp`) defaults to **writes enabled**
(opt out with `--disable-writes`); HTTP (`dysflow serve`) defaults to **writes
disabled**. Rationale ties to the existing trust-model table — process
ownership means the stdio caller is the operator (safe-on), while HTTP is a
network surface where any caller that reaches the port is untrusted (safe-off).
Note this changes only the default *input* to the gate; per-repo `allowWrites`,
`allowedProcedures`, and the ad hoc `buildExplicitConfig` floor still apply. The
existing "Decision" section stays valid (it covers VBA allowlist asymmetry, a
separate axis) — no contradiction.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit (CLI) | bare `mcp` → `writesEnabled true`; `--disable-writes` → false; `--enable-writes` → true (no-op); both → exit 1 + message | Assert the `writesEnabled` arg captured by injected `startMcpAdapter` mock (extend `commands.test.ts:194+`) |
| Unit (CLI) | usage/unknown-flag path unchanged | Existing `subcommand-help.test.ts` stays green |
| Regression | HTTP/`serve` default still disabled | Existing serve tests stay green (out of scope, guard only) |

Strict TDD: RED assertion per case before the mcp.ts edit.

## Migration / Rollout

No migration. One-commit revert restores the writes-disabled default (revert the
two edits + additive tests/docs). No schema, no data, no sequencing.

## Open Questions

None. Scope pre-locked; only residual is line-budget monitoring at apply.
