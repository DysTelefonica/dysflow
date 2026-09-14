# Exploration: dysflow-pi-branding — Pi-native Dysflow facade (#1723)

> Issue #1723. The implementation is already in the working tree at HEAD `f7b94a3f`
> on branch `fix/issue-1723-pi-native-rendering`. This exploration records what is
> in the tree today; no design proposal is made here.

## Plugin source tree (`plugin/pi/`)

| File | Role |
|---|---|
| `plugin/pi/index.ts` | Default-exported `dysflowPiExtension(pi: ExtensionAPI)`. Registers one native tool via `pi.registerTool({ name, renderShell: "self", execute, renderCall, renderResult })`. Wires `session_start` → `setStatus("⚡ Dysflow · ready")` and `session_shutdown` → `client.close()`. |
| `plugin/pi/native-tool.ts` | `createDysflowNativeTool(options)` factory. Returns the tool metadata (`name: "dysflow"`, `label: "Dysflow"`, `description`, `promptSnippet`, `promptGuidelines`) plus the `execute` closure. The execute closure validates the tool name with `/^[a-z][a-z0-9_]{0,63}$/`, sets `⚡ Dysflow · running` via `setStatus`, calls the injected `DysflowMcpPort.callTool`, throws the bounded `"Dysflow operation failed."` on `isError:true`, and returns `{ content: PiContent[], details: { mcpResult } }`. |
| `plugin/pi/dysflow-tool-chrome.ts` | Chrome (status / expanded result text) generators. Exports `operationLabel(toolName, args)` (no `args` ever rendered), `renderDysflowCallText(toolName, args)` (`⚡ Dysflow · <label>…`), `compactDysflowResultStatus(toolName, result, options)`, `renderDysflowResultText(toolName, result, options)`. The `isError` path collapses to `"✗ Dysflow failed"` regardless of the raw MCP error text. |
| `plugin/pi/dysflow-mcp-client.ts` | Stdout MCP client wrapper. `resolveDysflowCommand(moduleUrl, env)` reads `DYSFLOW_BIN` → `DYSFLOW_HOME` → system marker (`%ProgramData%/dysflow/.dysflow-marker`) → `%LOCALAPPDATA%/dysflow`. Returns the absolute launcher (`<runtime>/bin/dysflow.cmd` on win32). `createDysflowMcpClient({ cwd, command?, env? })` lazily connects through `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport`, calling `<launcher> mcp` and forwarding `callTool(name, args, { signal, onProgress })`. |
| `plugin/pi/package.json` | npm manifest. `name: "@aroman22/dysflow-pi"`, `version: "4.3.2"` (pinned equal to root release). `pi.extensions: ["./index.ts"]`, `pi.image` URL, no `pi.mcp` field. `typebox` is a `peerDependency: "*"` (NOT in `dependencies`). Files manifest ships `index.ts`, `native-tool.ts`, `dysflow-mcp-client.ts`, `dysflow-tool-chrome.ts`, `README.md`, `package.json`, `assets/` — no `mcp.json`. |
| `plugin/pi/tsconfig.json` | `target: ES2022`, `module/moduleResolution: NodeNext`, `strict: true`, `noEmit: true`, `types: ["node"]`, includes `*.ts`. `pnpm --dir plugin/pi typecheck` runs `tsc --noEmit`. |
| `plugin/pi/README.md` | Public package README. Names the `dysflow install --agents pi --no-tui` owner-aware path, points at `docs/pi-native-integration.md`, asserts the package "does not register another MCP, replace adapter-owned tools, or expose parameters, paths, secrets, and arbitrary MCP errors in collapsed output". |

## Installer integration (`src/cli/commands/install/`)

### MCP configurator (`mcp-configurator.ts`)

- `reconcilePiIntegration({ mcpConfigPath, commandPath, mode? })` is the only writer of the global `~/.pi/agent/mcp.json` MCP entry for Dysflow. It writes `{ mcpServers: { dysflow: { command, args: ["mcp"], directTools: false, type: "local", lifecycle: "lazy" } } }` on first install and on subsequent reconciliations normalises the same shape: `command === commandPath` AND `directTools === false`.
- A foreign MCP entry named `dysflow` (anything not matching the managed shape) is rejected with `"Pi already has a foreign MCP entry named dysflow; Dysflow left Pi configuration unchanged."`. This is the conflict guard.
- `configureAgent("pi", …)` is the entry point invoked from `applyIntegrationSelection` in `src/cli/commands/install.ts:133-162`. It snapshots Pi MCP bytes (`capturePiIntegration`) BEFORE `configureAgent`, then `reconcilePiPackage`; on package failure it `restorePiIntegration` (the snapshot-or-remove pair is what makes the install transactional).

### Package manager (`pi-package-manager.ts`)

- Constant `PI_PACKAGE_NAME = "@aroman22/dysflow-pi"`. The ownership record lives at `<runtimeDir>/.dysflow-pi-package.json` (`PI_PACKAGE_OWNERSHIP_FILE`).
- `piPackageSpec(version)` returns `npm:@aroman22/dysflow-pi@<version>` after a `/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/` validation — only `4.3.2`-shape strings pass.
- `reconcilePiPackage({ settingsPath, runtimeDir, packageVersion, env, mode?, runPiCommand?, writeOwnershipFile? })` is the npm-spec manager. Behaviour matrix (verified by tests, see below):
  - **Absent → install**: `runPiCommand(["install", spec])` → assert Pi reports the same spec → write the ownership record (`packageName`, `spec`, `version`, `owned: true`).
  - **Exact match present, owned**: byte-identical `unchanged` no-op, no Pi call.
  - **Exact match present, NOT owned** (user-installed the exact version): return `unchanged / owned:false`, do NOT claim ownership, do NOT remove on uninstall.
  - **Different pinned version, NOT owned**: reject with `"Pi already has a pre-existing Pi package for @aroman22/dysflow-pi; Dysflow left it unchanged."` — Dysflow refuses to overwrite a user-installed version.
  - **Owned older version**: install the new spec, replace the ownership record.
  - **Removal, owned and current**: `runPiCommand(["remove", baseSpec])` → assert absent → delete the ownership record.
  - **Removal, NOT owned** (user-installed or pre-existing): no-op, do not call Pi.
  - **Install failure**: rollback the package step (`remove` for first install, `install previousSpec` for upgrade), rethrow.
- `PiPackageCommandRunner` is the injected seam. The default calls `runCommand("pi", args, cwd, { timeoutMs: 120_000, env })` from `command-runner.ts`. Tests use a mock.

### Wiring (`updater.ts` + `install.ts`)

- `src/cli/commands/install/updater.ts:59-99` defines `refreshInstalledPiIntegration(runtimeDir, packageVersion, env, runPiCommand?)`. Called from `handleUpdateCommand` at lines 478 (no-op update branch) and 543 (downloaded-update branch). Snapshots Pi MCP bytes before reconciling MCP, then reconciles package; on package failure restores the MCP snapshot.
- `src/cli/commands/install.ts:108-229` defines `applyIntegrationSelection(selectedAgents, …)` for `dysflow install`. For `agent === "pi"`: snapshot MCP → `configureAgent` → `reconcilePiPackage` (with the same rollback wrapper). Non-selected `pi` runs `mode: "remove"` for both MCP and package.

## Install / update / uninstall commands

| Command | Behaviour for `--agents pi` |
|---|---|
| `dysflow install --agents pi --no-tui` | Snapshots MCP, calls `configureAgent("pi", …)`, then `reconcilePiPackage(...)` with the just-installed runtime's `package.json` version. Writes `mcp.json` (managed MCP) and `~/.pi/agent/settings.json` (npm spec) + `<runtime>/.dysflow-pi-package.json` (ownership). On package-step failure restores MCP bytes (or removes a newly-created MCP file). |
| `dysflow update` | Refreshes the runtime to the latest release, then `refreshInstalledPiIntegration(runtimeDir, landedVersion, env, runPiCommand?)` reconciles the npm pin to match the new version. |
| `dysflow uninstall` | For `pi` (when selected): `reconcilePiIntegration({ mode: "remove" })` + `reconcilePiPackage({ mode: "remove" })`. Both refuse to touch a package / entry they do not own. |

`docs/pi-native-integration.md` is the operator-facing source of truth for installation, ownership, conflict resolution, release contract, and visual acceptance. Section "Clean-Pi Visual Acceptance" defines the user-visible acceptance criterion: a fresh Pi session, after `dysflow install --agents pi --no-tui`, must show `⚡ Dysflow` chrome comparable to Engram's native chrome.

## Tests that gate the change

| File | Coverage |
|---|---|
| `test/quality-gates/pi-native-package-1723.test.ts` | Chrome rendering (`renderDysflowCallText` / `renderDysflowResultText`); package manifest invariants (no `pi.mcp`, no `mcp.json`, `typebox` peer only); launcher resolver (`DYSFLOW_BIN` absolute guard, marker fallback); native facade contract (`name !== "mcp"` / `"mcp__dysflow"`); bounded error path on `isError:true`; `npm pack --dry-run` shape (every runtime file present, `mcp.json` absent). |
| `test/cli/commands/install/pi-integration-1723.test.ts` | Source-text pins: `reconcilePiIntegration` + `reconcilePiPackage` appear in `install.ts` / `updater.ts` / `uninstall.ts`; snapshot+rollback pair in transactional sources; managed entry shape (`directTools: false`, `lifecycle: "lazy"`, `type: "local"`); byte-identical re-reconciliation; foreign-entry rejection; install/remove round-trip; never creates `settings.json`. |
| `test/cli/commands/install/pi-package-manager-1723.test.ts` | All eight branches of `reconcilePiPackage` (install, exact pre-existing user package, differently pinned user package, owned upgrade, owned remove, non-owned remove, install-failure rollback, stale-ownership / user-modified). Uses an injected `PiPackageCommandRunner` that simulates `~/.pi/agent/settings.json`. |
| `test/quality-gates/release-package-version.test.ts` (referenced in `docs/pi-native-integration.md:153`) | Asserts `plugin/pi/package.json` version equals root `package.json` version. |

## `CHANGELOG.md` `[Unreleased]`

`CHANGELOG.md:115` already records the change:

> `feat(pi): add public @aroman22/dysflow-pi with compact redacted rendering, Pi-managed pinned installation, ownership-safe update/uninstall, and release publication gates (#1723)`

## Boundaries confirmed by the source

- The plugin does NOT register another MCP: `plugin/pi/package.json` has no `pi.mcp` field and ships no `mcp.json` (verified by `pi-native-package-1723.test.ts` "ships a public Pi package without a package-scoped duplicate MCP" and "packs every runtime artifact required by a clean Pi installation").
- `gentle-pi` is NOT modified: a repository-wide grep of `plugin/pi/`, `src/cli/commands/install/pi-package-manager.ts`, and `mcp-configurator.ts` for the substring `gentle-pi` returns no matches.
- The package never embeds MCP schemas: `docs/pi-native-integration.md` says so explicitly, and `native-tool.ts` defines a Typebox `Type.Object({ tool: Type.String, args: Type.Optional(...) })` shell — schema discovery stays on the live MCP via `bootstrap({})` / `schema({ view: "index" })`.
- Compatibility path: `mcp-configurator.ts:112-118` always writes `directTools: false`, so the `dysflow` MCP server is reachable as the diagnostics surface but is NOT directly exposed to Pi's tool inventory; the native `dysflow` facade is the user-facing tool.

## Ready for Proposal

**Yes.** The plugin folder is small, the install/uninstall wiring is owned by `reconcilePiIntegration` + `reconcilePiPackage`, and the three test files above already pin every behaviour the design must preserve. The proposal needs only to commit to: (a) no edit to `gentle-pi`, (b) the facade name `dysflow` and the bounded chrome contract, (c) `directTools: false` as the MCP compatibility path.
