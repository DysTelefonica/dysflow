# Tasks: Fix MCP Runtime Startup

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 180-300 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | PR 1: OpenCode startup tests + implementation + docs |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Pin OpenCode MCP config contract with failing Vitest coverage | PR 1 | Base `main`; RED before code |
| 2 | Emit direct Node runtime entrypoint only for OpenCode | PR 1 | Keep non-OpenCode launchers unchanged |
| 3 | Align README and verify SDD scenarios | PR 1 | Docs and verification with same slice |

## Phase 1: RED Tests

- [x] 1.1 In `test/cli/install.test.ts`, add a failing assertion that `handleInstallCommand()` writes OpenCode `command` as `node`, `<runtimeDir>/app/dist/cli/index.js`, `mcp`.
- [x] 1.2 In `test/cli/install.test.ts`, assert the OpenCode command does not contain `dysflow.cmd` or any direct `.cmd` launcher reference.
- [x] 1.3 In `test/cli/install.test.ts`, add the same failing contract for `applyIntegrationSelection(["opencode"])` refresh behavior.
- [x] 1.4 In `test/cli/install.test.ts`, pin a non-OpenCode agent path so Codex/Claude/Pi launcher behavior remains unchanged.

## Phase 2: GREEN Implementation

- [x] 2.1 In `src/cli/commands/install.ts`, derive an OpenCode-specific runtime entrypoint from `runtimeDir` as `app/dist/cli/index.js` with slash-normalized config output.
- [x] 2.2 In `src/cli/commands/install.ts`, pass the OpenCode entrypoint command only into `configureOpencode()` with the `mcp` argument.
- [x] 2.3 In `src/cli/commands/install.ts`, leave `commandPathForConfig()` and non-OpenCode integration writers on their existing launcher shape.
- [x] 2.4 In `src/cli/commands/install.ts`, fail with an actionable error if the OpenCode runtime entrypoint cannot be resolved.

## Phase 3: Docs And Verification

- [x] 3.1 Update `README.md` OpenCode MCP examples to show the direct Node runtime entrypoint and `--runtime-dir` path substitution.
- [x] 3.2 Verify `openspec/changes/fix-mcp-runtime-startup/specs/product-cli/spec.md` scenarios are covered by tests or documented rollout notes.
- [x] 3.3 Run `pnpm test` only after RED and GREEN phases are complete; expected runner is Vitest.
- [x] 3.4 Optionally run `pnpm build` during verify to catch TypeScript regressions before review.
