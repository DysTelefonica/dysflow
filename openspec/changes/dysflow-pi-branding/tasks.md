# Tasks: dysflow-pi-branding — Pi-native Dysflow facade

> Implementation is already in the working tree at HEAD `f7b94a3f` on
> `fix/issue-1723-pi-native-rendering`. Each task references the verification
> gate (existing test or typecheck / CHANGELOG check the parent will run
> later) so the apply-phase audit is a single-pass walk through this list.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~600-700 across `plugin/pi/` (new) + `src/cli/commands/install/` (new + modified) + 3 test files + `docs/pi-native-integration.md` + CHANGELOG |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR (the change is one cohesive install surface; per-file budgets already sit under the 400-line gate) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Single PR: plugin/pi + installer + tests + docs + CHANGELOG | PR 1 | `pnpm vitest run test/quality-gates/pi-native-package-1723.test.ts test/cli/commands/install/pi-integration-1723.test.ts test/cli/commands/install/pi-package-manager-1723.test.ts` | Existing Pi-less sandbox fixtures in `test/cli/commands/install/` (HOME / USERPROFILE / npm cache / npm prefix via `mkdtemp`) | `plugin/pi/` is additive (delete directory); the four installer files are additive on `pi` only (revert removes `pi` from the agent allowlist) |

## Phase 1: Plugin package (`plugin/pi/`)

- [x] T-001 Create `plugin/pi/index.ts` — default-exported `dysflowPiExtension(pi)`; one `pi.registerTool({ name, renderShell: "self", execute, renderCall, renderResult })`; `session_start` sets status `⚡ Dysflow · ready`; `session_shutdown` closes the MCP client. **Verification**: `test/quality-gates/pi-native-package-1723.test.ts` "registers one unique native facade and delegates over the injected MCP port" + `pnpm --dir plugin/pi typecheck`.
- [x] T-002 Create `plugin/pi/native-tool.ts` — `createDysflowNativeTool({ callTool, setStatus })`; `name: "dysflow"`; name validation `/^[a-z][a-z0-9_]{0,63}$/`; bounded error `"Dysflow operation failed."` on `isError:true`. **Verification**: `test/quality-gates/pi-native-package-1723.test.ts` "registers one unique native facade" + "throws only a bounded error through Pi's public tool-error path".
- [x] T-003 Create `plugin/pi/dysflow-tool-chrome.ts` — `operationLabel(toolName, args)`, `renderDysflowCallText`, `compactDysflowResultStatus`, `renderDysflowResultText`. Collapsed status never includes `args`; `isError` collapses to `"✗ Dysflow failed"`. **Verification**: `test/quality-gates/pi-native-package-1723.test.ts` "renders characteristic calls without dumping parameters" + "keeps collapsed results to one status line and expands full details".
- [x] T-004 Create `plugin/pi/dysflow-mcp-client.ts` — `resolveDysflowCommand(moduleUrl, env?)` honours `DYSFLOW_BIN` (must be absolute) → `DYSFLOW_HOME` → `%ProgramData%/dysflow/.dysflow-marker` (or `DYSFLOW_RUNTIME_MARKER_PATH`) → `%LOCALAPPDATA%/dysflow`; `dysflowChildEnvironment` drops `undefined` env entries; `createDysflowMcpClient({ cwd, command?, env? })` lazy-connects via `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport` with `<absolute-launcher> mcp` and `stderr: "inherit"`. **Verification**: `test/quality-gates/pi-native-package-1723.test.ts` "pins the native MCP child to the installer-managed absolute launcher".
- [x] T-005 Create `plugin/pi/package.json` — `name: "@aroman22/dysflow-pi"`, `version: "4.3.2"`, `pi.extensions: ["./index.ts"]`, `pi.image: <URL>`, NO `pi.mcp`, `typebox` is `peerDependencies: "*"` (NOT in `dependencies`), `files` ships `assets/`, `index.ts`, `native-tool.ts`, `dysflow-mcp-client.ts`, `dysflow-tool-chrome.ts`, `README.md`, `package.json` (no `mcp.json`). **Verification**: `test/quality-gates/pi-native-package-1723.test.ts` "ships a public Pi package without a package-scoped duplicate MCP" + "keeps the canonical Pi guide aligned with package and repository contracts" + `test/quality-gates/release-package-version.test.ts`.
- [x] T-006 Create `plugin/pi/tsconfig.json` — `strict: true`, `noEmit: true`, `NodeNext`, `types: ["node"]`, `include: ["*.ts"]`. **Verification**: `pnpm --dir plugin/pi typecheck` is green (referenced from `docs/pi-native-integration.md:149`).
- [x] T-007 Create `plugin/pi/README.md` — names the `dysflow install --agents pi --no-tui` owner-aware path, points at `docs/pi-native-integration.md`, asserts the facade does not register another MCP, replace adapter-owned tools, or expose parameters, paths, secrets, or arbitrary MCP errors in collapsed output. **Verification**: `test/quality-gates/pi-native-package-1723.test.ts` "keeps the canonical Pi guide aligned with package and repository contracts" reads `docs/pi-native-integration.md` and `docs/SETUP.md`.
- [x] T-008 Create `plugin/pi/assets/dysflow-pi.png` (icon referenced by `plugin/pi/package.json:23`). **Verification**: `test/quality-gates/pi-native-package-1723.test.ts` "ships a public Pi package without a package-scoped duplicate MCP" asserts `pi.image` matches `^https://.*\.(?:png|jpe?g|gif|webp)$`.

## Phase 2: Installer integration

- [x] T-009 Modify `src/cli/commands/install/agent-config.ts` — `AgentName` includes `"pi"`; `resolveAgentConfigPaths(home)` exposes `pi: <home>/.pi/agent/mcp.json` and `piSettings: <home>/.pi/agent/settings.json`. **Verification**: `test/cli/commands/install/pi-integration-1723.test.ts` resolves `mcpConfigPath` to `<root>/home/.pi/agent/mcp.json`; `pi-package-manager-1723.test.ts` resolves `settingsPath` to `<root>/home/.pi/agent/settings.json`.
- [x] T-010 Create `src/cli/commands/install/pi-package-manager.ts` — `PI_PACKAGE_NAME = "@aroman22/dysflow-pi"`; `piPackageSpec(version)` validates `/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/` and returns `npm:@aroman22/dysflow-pi@<version>`; `reconcilePiPackage({ settingsPath, runtimeDir, packageVersion, env, mode?, runPiCommand?, writeOwnershipFile? })` implements all 8 branches (install / exact pre-existing user / differently pinned user / owned upgrade / owned remove / non-owned remove / install-failure rollback / stale-ownership user-modified); ownership record at `<runtimeDir>/.dysflow-pi-package.json` (`{ packageName, spec, version, owned: true }`). **Verification**: `test/cli/commands/install/pi-package-manager-1723.test.ts` covers all 8 atoms.
- [x] T-011 Modify `src/cli/commands/install/mcp-configurator.ts` — `reconcilePiIntegration({ mcpConfigPath, commandPath, mode? })` writes the managed `mcpServers.dysflow = { command, args: ["mcp"], directTools: false, type: "local", lifecycle: "lazy" }` on first install, normalises `command === commandPath` and `directTools === false` on subsequent runs, refuses foreign entries; `configureAgent("pi", …)` branch in `configureAgent` (around `:286`); `capturePiIntegration` / `restorePiIntegration` snapshot helpers. **Verification**: `test/cli/commands/install/pi-integration-1723.test.ts` "creates only the global absolute-launcher MCP entry" + "is byte-identical and reports unchanged on repeated reconciliation" + "preserves compatible user MCP options and unrelated servers" + "fails safely when a foreign executable lives inside a dysflow directory" + "removes only an installer-managed MCP entry".
- [x] T-012 Modify `src/cli/commands/install/updater.ts` — `refreshInstalledPiIntegration(runtimeDir, packageVersion, env, runPiCommand?)` snapshots Pi MCP bytes, calls `reconcilePiIntegration` then `reconcilePiPackage`, on package failure restores the MCP snapshot. **Verification**: `test/cli/commands/install/pi-integration-1723.test.ts` source-text pins on `updater.ts` (calls `reconcilePiIntegration({`, `reconcilePiPackage({`, `capturePiIntegration(`, `restorePiIntegration(`).
- [x] T-013 Modify `src/cli/commands/install.ts` — `applyIntegrationSelection` wires `pi` through `capturePiIntegration` → `configureAgent("pi", …)` → `reconcilePiPackage` with the same rollback wrapper; non-selected `pi` runs `mode: "remove"` for both MCP and package. **Verification**: `test/cli/commands/install/pi-integration-1723.test.ts` source-text pins on `install.ts`.

## Phase 3: Tests

- [x] T-014 Create `test/quality-gates/pi-native-package-1723.test.ts` — chrome-rendering tests, manifest invariant tests, launcher-resolver tests, native-facade contract test, bounded-error test, `npm pack --dry-run` shape test, doc-alignment test. **Verification**: `pnpm vitest run test/quality-gates/pi-native-package-1723.test.ts` is green.
- [x] T-015 Create `test/cli/commands/install/pi-integration-1723.test.ts` — source-text pins on `install.ts` / `updater.ts` / `uninstall.ts`; managed MCP entry shape; byte-identical re-reconciliation; compatible-options preservation; foreign-entry rejection; remove round-trip; rollback round-trip; new-file removal. **Verification**: `pnpm vitest run test/cli/commands/install/pi-integration-1723.test.ts` is green.
- [x] T-016 Create `test/cli/commands/install/pi-package-manager-1723.test.ts` — all 8 branches of `reconcilePiPackage`; uses an injected `PiPackageCommandRunner` that simulates `~/.pi/agent/settings.json`. **Verification**: `pnpm vitest run test/cli/commands/install/pi-package-manager-1723.test.ts` is green.

## Phase 4: Docs + CHANGELOG

- [x] T-017 Create `docs/pi-native-integration.md` — quick-path, architecture, ownership and reconciliation matrix, update / uninstall, rendering contract (with the bounded chrome example), troubleshooting, release contract, sandboxed contributor checks, clean-Pi visual acceptance, contributor checklist. **Verification**: `test/quality-gates/pi-native-package-1723.test.ts` "keeps the canonical Pi guide aligned with package and repository contracts" reads the guide and asserts it contains `dysflow install --agents pi --no-tui`, `npm:@aroman22/dysflow-pi@`, and `directTools: false`.
- [x] T-018 Modify `CHANGELOG.md` `[Unreleased]` — entry at line 115: `feat(pi): add public @aroman22/dysflow-pi with compact redacted rendering, Pi-managed pinned installation, ownership-safe update/uninstall, and release publication gates (#1723)`. **Verification**: manual grep `CHANGELOG.md` for `#1723` returns the entry; release-version drift gate covers the package version pin.

## Phase 5: Apply-phase verification gates (run by the parent later)

- [x] T-019 `pnpm --dir plugin/pi typecheck` is green. **Verification**: `tsc --noEmit` with `strict: true`; referenced from `docs/pi-native-integration.md:149`.
- [x] T-020 `pnpm vitest run test/quality-gates/pi-native-package-1723.test.ts` is green. **Verification**: 8 atoms in the file.
- [x] T-021 `pnpm vitest run test/cli/commands/install/pi-integration-1723.test.ts` is green. **Verification**: 9 atoms in the file.
- [x] T-022 `pnpm vitest run test/cli/commands/install/pi-package-manager-1723.test.ts` is green. **Verification**: 8 atoms in the file.
- [x] T-023 Repository-wide grep `gentle-pi` across `plugin/pi/`, `src/cli/commands/install/pi-package-manager.ts`, and `src/cli/commands/install/mcp-configurator.ts` returns zero matches. **Verification**: explicit grep per `explore.md` § "Boundaries confirmed by the source".
- [x] T-024 CHANGELOG entry carries `#1723`. **Verification**: `grep '#1723' CHANGELOG.md` returns line 115.
- [x] T-025 `plugin/pi/package.json` version equals root `package.json` version. **Verification**: `test/quality-gates/release-package-version.test.ts` + `test/quality-gates/pi-native-package-1723.test.ts` "keeps the canonical Pi guide aligned with package and repository contracts".

## Out of scope (explicit)

- Editing `gentle-pi` in any way (verified by `explore.md` § "Boundaries confirmed by the source").
- Embedding MCP schemas in the npm package.
- The clean-Pi visual acceptance ritual (owned by issue #1723's closure runbook, not by this branch).
- npm Trusted Publisher bootstrap for `DysTelefonica/dysflow` (one-time manual step documented in `docs/pi-native-integration.md` § "One-time npm bootstrap").
- Any `dysflow update` change beyond the `refreshInstalledPiIntegration` wiring.
- Any non-`pi` agent config (`codex`, `opencode`, `claude`).
