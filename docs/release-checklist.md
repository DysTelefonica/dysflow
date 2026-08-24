# Pre-release checklist

This checklist must be reviewed before tagging a new dysflow release. It exists
to make manual maintenance decisions auditable and visible in CI.

## Automation

The canonical release workflow is `scripts/release-prepare.ps1`. It:

  1. Refuses to start on a dirty working tree (so the release commit cannot
     bundle unrelated work).
  2. Refuses if local `main` is ahead of `origin/main` (so no un-CI'd commits
     land in the release).
  3. Bumps `package.json` and prepends a `## [vX.Y.Z] - YYYY-MM-DD` block to
     `CHANGELOG.md`, with one physical bullet per non-merge commit from
     `git log <last-tag>..HEAD`.
  4. Runs `test/quality-gates/changelog-release-entry-format.test.ts` locally
     against the generated file. A malformed entry aborts before `git add`,
     commit, or push.
  5. Pushes the `chore(release): prepare vX.Y.Z` commit to `origin/main`.
  6. **Polls `gh run list --workflow ci.yml` for the release commit's exact
     SHA** — not the latest run — and refuses to tag unless exact-SHA `main` CI
     succeeds.
  7. On CI green, creates and pushes an annotated `vX.Y.Z` tag. That tag starts
     `.github/workflows/release.yml`, whose `e2e-validation` job runs
     `pnpm test:e2e:mcp:release` on the self-hosted Access runner.
  8. The GitHub Release is published only after `build`, `quality-authority`,
     and `e2e-validation` succeed. The publication job declares all three in
     its `needs` dependency.

Behavioral Pester tests in `scripts/tests/release-prepare.Tests.ps1` pin this
contract, including a generated entry that passes the real Vitest quality gate
and a deliberately collapsed entry that aborts before release Git writes. Run
them with:

    pwsh -NoProfile -Command "Invoke-Pester -Path scripts/tests/release-prepare.Tests.ps1"

**Operator workflow**:

    pwsh -File scripts/release-prepare.ps1 -Bump patch    # for v1.10.3 → v1.10.4
    pwsh -File scripts/release-prepare.ps1 -Bump minor    # for v1.10.x → v1.11.0
    pwsh -File scripts/release-prepare.ps1 -Version 1.11.2 # explicit override

The script exits with a non-zero status if any step fails, including the CI
gate. Watch progress with `gh run watch <id>`.

Review the non-merge commit subjects since the previous tag as consumer-facing
release text before running the script. The script turns them into `### Changes`
notes and preserves one physical bullet per commit, but the operator still owns
wording and grouping.

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
- [ ] The optional-presence guard passes:
  `node scripts/check-optional-presence-guards.mjs`.
- [ ] `biome check src/ test/` passes.

The tag-triggered `e2e-validation` job is the sole heavy release E2E authority.
It runs `pnpm test:e2e:mcp:release` against a safe, run-scoped build and blocks
publication on failure. Agents must not run it locally as a pre-tag gate.

### Cheap e2e-suite contract tests (run in <100ms total, in CI)

The mcp-e2e suite's structural invariants are pinned by cheap vitest tests
so the heavy E2E never has to catch a regression that could have been caught
in 100ms:

- `test/quality-gates/mcp-e2e-suite-contracts.test.ts` — pins `verify_code`
  timeout (≥180s), `tools/list` ordering, sandbox isolation, PID/zombie gates,
  release telemetry friction paths, privacy sentinels, and opt-out byte identity.
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

Local release packaging writes `SHA256SUMS` and `dysflow-v*.tar.gz` to the
repository root. Git ignores these generated root files.

Matching names under fixture or documentation directories remain visible and
trackable.

- [ ] GitHub release **title equals the tag name exactly** (e.g. tag `v1.2.23`
  → title `v1.2.23`).
- [ ] Release notes mention the MCP adapter cleanup work and any
  compatibility/deprecation decisions made since the previous release.
- [ ] No secrets, raw passwords, or environment-specific paths are included in
  the tarball or release notes.
