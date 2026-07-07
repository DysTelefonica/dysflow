# Pre-release checklist

This checklist must be reviewed before tagging a new dysflow release. It exists
to make manual maintenance decisions auditable and visible in CI.

## Automation

The canonical release workflow is `scripts/release-prepare.ps1`. It:

  1. Refuses to start on a dirty working tree (so the release commit cannot
     bundle unrelated work).
  2. Refuses if local `main` is ahead of `origin/main` (so no un-CI'd commits
     land in the release).
  3. Bumps `package.json` and pre-pends a `## [vX.Y.Z] - YYYY-MM-DD` block to
     `CHANGELOG.md` from `git log <last-tag>..HEAD`.
  4. Pushes the `chore(release): prepare vX.Y.Z` commit to `origin/main`.
  5. **Polls `gh run list --workflow ci.yml` filtered by the release commit's
     SHA** — not by `latest run` — and refuses to tag unless the conclusion
     is `success`. The CI workflow (`pnpm test` + `pnpm test:ps1` + `pnpm build`
     + `pnpm lint`) does NOT run the heavy `node E2E_testing/mcp-e2e.mjs`
     battery, which takes ~30 minutes; see the E2E row below.
  6. On CI green: creates an annotated `vX.Y.Z` tag and pushes it. The
     `.github/workflows/release.yml` workflow fires on the tag push, builds
     the tarball, signs `SHA256SUMS` with Ed25519, and publishes the
     GitHub Release.

15 Pester tests in `scripts/tests/release-prepare.Tests.ps1` pin this contract
so a future refactor cannot regress to "tag unconditionally". Run them with:

    pwsh -NoProfile -Command "Invoke-Pester -Path scripts/tests/release-prepare.Tests.ps1"

**Operator workflow**:

    pwsh -File scripts/release-prepare.ps1 -Bump patch    # for v1.10.3 → v1.10.4
    pwsh -File scripts/release-prepare.ps1 -Bump minor    # for v1.10.x → v1.11.0
    pwsh -File scripts/release-prepare.ps1 -Version 1.11.2 # explicit override

The script exits with a non-zero status if any step fails, including the CI
gate. Watch progress with `gh run watch <id>`.

## MCP protocol compatibility

Dysflow's MCP server runs on the official `@modelcontextprotocol/sdk`, which
owns the `initialize` handshake and protocol-version negotiation.
`MCP_PROTOCOL_VERSION` in `src/adapters/mcp/stdio.ts` is **derived** from the
SDK's `DEFAULT_NEGOTIATED_PROTOCOL_VERSION` (it is not hand-pinned), so it
cannot drift from what the server actually negotiates. On any release that
upgrades the SDK, revalidate:

- [ ] `MCP_PROTOCOL_VERSION` / `MCP_PROTOCOL_VERSION_LATEST_SUPPORTED` still
  reflect the SDK's negotiated/latest versions after the bump. Cross-check
  against <https://modelcontextprotocol.io/specification>.
- [ ] `MCP_PROTOCOL_VERSION_REVIEW` in `src/adapters/mcp/stdio.ts` was updated
  in the same commit as any SDK/protocol change:
  - `version` equals `MCP_PROTOCOL_VERSION`
  - `reviewedAt` reflects the date of the last cross-check
  - `specRef` cites the upstream MCP spec revision
- [ ] Any new MCP capabilities introduced by the spec revision are reflected in
  the `capabilities` object exposed during `initialize`.
- [ ] The runtime still satisfies the JSON-RPC guards listed in
  `docs/testing/mcp-protocol-maintenance.md` (numeric/string ids, notifications
  with no `id`, explicit `id: null`, `-32601` for unsupported methods).

Reference: `docs/testing/mcp-protocol-maintenance.md`.

## Tests

- [ ] `pnpm test` passes locally.
- [ ] Integration/E2E (`vitest.integration.config.ts`) passes locally where the
  host platform supports it.
- [ ] Real MCP E2E (`node E2E_testing/mcp-e2e.mjs`) passes against the safe
  `test-runtime/` build, with `DYSFLOW_E2E_COMMAND` pointing at it. Never run
  E2E against `%LOCALAPPDATA%\dysflow` or `~/.config/opencode/opencode.json`.
  **Run the heavy E2E only at the very end, after every other issue on this
  checklist is closed and `release-prepare.ps1` is the next thing to run.**
  The full battery takes ~30 minutes; it is NOT run by CI.
- [ ] The optional-presence guard passes:
  `node scripts/check-optional-presence-guards.mjs`.
- [ ] `biome check src/ test/` passes.

### Cheap e2e-suite contract tests (run in <100ms total, in CI)

The mcp-e2e suite's structural invariants are pinned by cheap vitest tests
so the heavy E2E never has to catch a regression that could have been caught
in 100ms:

- `test/quality-gates/mcp-e2e-suite-contracts.test.ts` (9 tests) — pins
  `verify_code` timeout (≥180s), `tools/list` called before advertised, count =
  53, sandbox isolation, final lingering-access-check row, STOP-ON-FAIL
  invariant, `suiteOwnPids.add(childPid)`, ACCESS_VBA_PASSWORD pre-flight.
- `test/quality-gates/mcp-e2e-tool-existence.test.ts` (3 tests) — pins that
  every `record(area, tool, …)` call in `mcp-e2e.mjs` references a tool
  that exists in `createDysflowMcpTools()` (catches renames, removals,
  moves to the hidden registry).
- feat-759-no-compile (v1.19.0) — the compile_vba mojibake pin was
  removed; the suite no longer asserts the mojibake expectation.

If any of these cheap tests fail, fix them BEFORE running the heavy E2E.
If they pass and the heavy E2E still fails, the regression is in a runtime
contract these tests don't yet pin — extend the cheap tests, fix the
regression, then re-run.

## Release hygiene

- [ ] GitHub release **title equals the tag name exactly** (e.g. tag `v1.2.23`
  → title `v1.2.23`).
- [ ] Release notes mention the MCP adapter cleanup work and any
  compatibility/deprecation decisions made since the previous release.
- [ ] No secrets, raw passwords, or environment-specific paths are included in
  the tarball or release notes.
