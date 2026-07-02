# Tasks: MCP stdio writes-enabled by default

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150-220 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Default flip + tests + docs | PR 1 (single) | 2 code files, 1 test file, 5 doc files; under 400 lines but `single-pr` strategy requires `size:exception` sign-off before apply. |

## Phase 1: RED — Failing Tests (`test/cli/commands.test.ts`)

- [x] 1.1 Pin bare `runCli(["mcp"], ...)`: injected `startMcpAdapter` must receive `{ writesEnabled: true }` (extend test ~line 194 or add new; currently unpinned).
- [x] 1.2 Add test: `runCli(["mcp", "--disable-writes"], ...)` → `startMcpAdapter` called with `{ writesEnabled: false }`.
- [x] 1.3 Add test: `runCli(["mcp", "--enable-writes"], ...)` → `writesEnabled: true`, `exitCode: 0`, `stderr: ""` (no-op).
- [x] 1.4 Add test: both flags together (either order) → `exitCode: 1`, `stderr` has mutual-exclusion message + `MCP_USAGE`, adapter NOT started.
- [x] 1.5 `pnpm test -- commands.test.ts`: confirm 1.1-1.4 fail RED, others pass.

## Phase 2: GREEN — Implementation

- [x] 2.1 `src/cli/commands/mcp.ts`: parse `enableWrites`/`disableWrites`; compute `const writesEnabled = !disableWrites;`; keep unknown-arg rejection.
- [x] 2.2 Add mutual-exclusion check before unknown-arg check: both flags present → `exitCode: 1`, `stderr: "--enable-writes and --disable-writes are mutually exclusive. Cannot use both at the same time.\n" + MCP_USAGE`, no adapter start.
- [x] 2.3 Update `MCP_USAGE` to `"Usage: dysflow mcp [--disable-writes | --enable-writes]"`.
- [x] 2.4 `src/adapters/mcp/stdio.ts:96`: flip `options?.writesEnabled ?? false` to `?? true`.
- [x] 2.5 `pnpm test -- commands.test.ts`: confirm 1.1-1.4 GREEN, no `mcp`/`subcommand-help` regression.

## Phase 3: Regression Guard

- [x] 3.1 Re-run `serve`/HTTP tests (`test/cli/commands.test.ts` ~326-385) and `test/cli/subcommand-help.test.ts`: unchanged pass — no coupling to the stdio flip.
- [x] 3.2 `pnpm test` (full suite) green.

## Phase 4: Docs

- [x] 4.1 `README.md` ~476, ~487-491, ~760: state new default (stdio writes enabled; `--disable-writes` opts out); fix stale "Option 2" wording.
- [x] 4.2 `AGENTS.md` / `docs/architecture/dysflow-core-and-adapters.md:35`: reflect stdio defaulting to enabled.
- [x] 4.3 `docs/security/adapter-write-gates.md`: insert `## Process-wide write default` section after the adapter-exposure table — stdio=enabled (operator-trusted), HTTP=disabled (network-untrusted); note `allowWrites`/`allowedProcedures`/ad hoc floor unchanged.
- [x] 4.4 `CHANGELOG.md`: add entry noting the stdio trust-posture flip and `--disable-writes` opt-out.

## Phase 5: Final Verification Gate

- [x] 5.1 `pnpm test` full suite green.
- [x] 5.2 `pnpm build` succeeds, no type errors.
- [x] 5.3 Confirm all Success Criteria in `proposal.md` are checked.
