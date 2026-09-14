# Proposal: dysflow-pi-branding — Pi-native Dysflow facade

SDD: `dysflow-pi-branding`
GitHub issue: https://github.com/DysTelefonica/dysflow/issues/1723
Branch: `fix/issue-1723-pi-native-rendering` (HEAD `f7b94a3f`)
Strict TDD: ACTIVE

## Intent

Integrate a Pi-native Dysflow package so that a clean Pi install — no manual
edits, no `gentle-pi` patching — exposes Dysflow Access/VBA operations through a
single native tool with a characteristic `⚡ Dysflow` chrome, comparable to
Engram's native execution chrome. The package keeps the official Dysflow MCP
stdio boundary as its transport and a `directTools: false` MCP entry as its
diagnostics surface; it does NOT register a second MCP, does NOT duplicate MCP
schemas, does NOT modify `gentle-pi`, and does NOT expose parameters, paths,
secrets, or arbitrary backend error text in collapsed rendering.

## Scope

### In scope

- `plugin/pi/` ships a public npm package `@aroman22/dysflow-pi` whose version
  equals the root release version (e.g. `4.3.2`). It registers exactly one
  native tool named `dysflow` (distinct from `mcp` / `mcp__dysflow`) and delegates
  every call through the official Dysflow MCP stdio boundary
  (`plugin/pi/index.ts`, `native-tool.ts`, `dysflow-mcp-client.ts`,
  `dysflow-tool-chrome.ts`).
- `src/cli/commands/install/mcp-configurator.ts` writes / refreshes the global
  Pi MCP entry at `~/.pi/agent/mcp.json` with `directTools: false` so that the
  MCP server is reachable for diagnostics but is NOT a second native tool in Pi's
  inventory.
- `src/cli/commands/install/pi-package-manager.ts` owns the npm spec
  reconciliation against `~/.pi/agent/settings.json`, with the ownership record
  at `<runtimeDir>/.dysflow-pi-package.json`. Install / update / owned uninstall
  / user-preservation / conflict / rollback paths are explicit (see
  `explore.md`).
- Three test files gate the change (see `explore.md` § "Tests that gate the
  change"): `test/quality-gates/pi-native-package-1723.test.ts`,
  `test/cli/commands/install/pi-integration-1723.test.ts`,
  `test/cli/commands/install/pi-package-manager-1723.test.ts`. Plus the
  release-version drift gate already referenced from
  `docs/pi-native-integration.md`.
- `CHANGELOG.md` `[Unreleased]` already records the entry (line 115).
- `docs/pi-native-integration.md` is the operator source of truth for install,
  ownership, conflict resolution, release contract, and visual acceptance.

### Out of scope

- Modifying `gentle-pi` in any way. This proposal keeps `gentle-pi` untouched
  by construction: the npm package is installed into `~/.pi/agent/npm/`, not
  into the `gentle-pi` checkout, and Dysflow never edits Pi settings beyond the
  two JSON files already documented.
- Embedding MCP schemas in the npm package. Runtime discovery stays on the live
  MCP (`bootstrap({})` + `schema({ view: "index" })` + capability views).
- Registering a second MCP under any name from the npm package
  (`plugin/pi/package.json` has no `pi.mcp` field and ships no `mcp.json`).
- Renaming the facade. The facade stays `dysflow`; the MCP stays
  `mcpServers.dysflow`; the diagnostic surface is the MCP server behind
  `directTools: false`.
- The visual acceptance ritual (a fresh Pi session opens after remote upload
  and authorized publication). This belongs to issue #1723's closure runbook
  (`docs/pi-native-integration.md` § "Clean-Pi Visual Acceptance") and is not
  inside the implementation branch.

## Capabilities

### New capabilities

- `dysflow-pi-plugin`: the Pi-native Dysflow facade and its installer
  reconciliation contract — facade registration shape, bounded chrome,
  `directTools: false` MCP compatibility, npm spec pinning, ownership / rollback
  lifecycle, clean-Pi activation.

### Modified capabilities

- None. No existing requirement is redefined; every change in
  `src/cli/commands/install/` is additive on the MCP side and the
  npm-spec reconciliation is brand new.

## Approach

1. **Plugin (`plugin/pi/`).** One default-exported extension
   `dysflowPiExtension(pi)` registers one native tool with `renderShell: "self"`,
   a `renderCall(args, theme, context)` that emits `⚡ Dysflow · <operationLabel>…`,
   and a `renderResult(result, options, theme, context)` that emits
   `↳ <status>` (and the structured payload only when `expanded:true`). The
   `execute` closure validates the tool name (`/^[a-z][a-z0-9_]{0,63}$/`), sets
   the status line, calls the injected MCP port, and on `isError:true` throws
   the bounded `"Dysflow operation failed."` so arbitrary MCP error text never
   reaches Pi's tool result.
2. **Chrome (`plugin/pi/dysflow-tool-chrome.ts`).** `operationLabel` is the
   only function that maps an MCP operation name to a label. It reads a count
   from `args.moduleNames` for `import_modules` / `export_modules` and otherwise
   returns a fixed verb phrase; `args` themselves (parameters, paths, secrets)
   never reach the output. Errors collapse to `"✗ Dysflow failed"`.
3. **MCP port (`plugin/pi/dysflow-mcp-client.ts`).** `resolveDysflowCommand`
   honors an absolute `DYSFLOW_BIN` (rejects non-absolute), then `DYSFLOW_HOME`,
   then reads the system marker (`%ProgramData%/dysflow/.dysflow-marker`), then
   falls back to `%LOCALAPPDATA%/dysflow`. `createDysflowMcpClient` lazily
   connects `<absolute-launcher> mcp` over stdio through `@modelcontextprotocol/sdk`.
4. **Installer — MCP (`mcp-configurator.ts`).** `reconcilePiIntegration`
   creates the managed `~/.pi/agent/mcp.json` entry on first install and
   normalises `command === <absolute launcher>` AND `directTools === false` on
   every subsequent run. Foreign MCP entries named `dysflow` are refused
   (`"Pi already has a foreign MCP entry named dysflow; Dysflow left Pi
   configuration unchanged."`).
5. **Installer — npm (`pi-package-manager.ts`).** `reconcilePiPackage` owns the
   eight behavioural branches listed in `explore.md`. The ownership record at
   `<runtimeDir>/.dysflow-pi-package.json` is the only source of "Dysflow owns
   this install". A pre-existing exact-match package is left unchanged; a
   differently-pinned package is a conflict and aborts.
6. **Transactional wrapper (`install.ts`, `updater.ts`).** Both `install` and
   `update` snapshot the Pi MCP bytes (`capturePiIntegration`) BEFORE
   `reconcilePiPackage`; on package failure they restore (`restorePiIntegration`)
   so the user never sees a partial state.
7. **Why `gentle-pi` is untouched.** The npm package is installed into Pi's
   package directory (`~/.pi/agent/npm/`) by Pi itself, not by Dysflow. Dysflow
   only edits two JSON files (`mcp.json` and `settings.json`) plus its own
   ownership record. There is no path where Dysflow would clone, edit, or
   re-register `gentle-pi`.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `plugin/pi/index.ts` | New | Default-exported extension; `pi.registerTool` + `session_start`/`session_shutdown` hooks. |
| `plugin/pi/native-tool.ts` | New | Native tool factory: `name: "dysflow"`, execute closure, name validation. |
| `plugin/pi/dysflow-tool-chrome.ts` | New | `operationLabel`, `renderDysflowCallText`, `renderDysflowResultText`. |
| `plugin/pi/dysflow-mcp-client.ts` | New | `resolveDysflowCommand`, `createDysflowMcpClient`, launcher env. |
| `plugin/pi/package.json` | New | `@aroman22/dysflow-pi@4.3.2`, `pi.extensions`, `pi.image`, no `pi.mcp`, `typebox` peer. |
| `plugin/pi/tsconfig.json` | New | `strict: true`, `noEmit: true`, `NodeNext`. |
| `plugin/pi/README.md` | New | Public README pointing at `docs/pi-native-integration.md`. |
| `src/cli/commands/install/mcp-configurator.ts` | Modified | `reconcilePiIntegration` (managed MCP entry, `directTools: false`); `configureAgent("pi", …)` branch. |
| `src/cli/commands/install/pi-package-manager.ts` | New | npm-spec manager + ownership record. |
| `src/cli/commands/install/updater.ts` | Modified | `refreshInstalledPiIntegration` wires `reconcilePiIntegration` + `reconcilePiPackage` for `dysflow update`. |
| `src/cli/commands/install.ts` | Modified | `applyIntegrationSelection` selects `pi` and wires the snapshot+rollback wrapper. |
| `src/cli/commands/install/agent-config.ts` | Modified | `pi` listed as an `AgentName`; `resolveAgentConfigPaths` exposes `~/.pi/agent/{mcp,settings}.json`. |
| `test/quality-gates/pi-native-package-1723.test.ts` | New | Chrome / manifest / launcher / facade / bounded-error / pack assertions. |
| `test/cli/commands/install/pi-integration-1723.test.ts` | New | MCP reconciliation + transactional source-text pins. |
| `test/cli/commands/install/pi-package-manager-1723.test.ts` | New | All eight branches of `reconcilePiPackage`. |
| `docs/pi-native-integration.md` | New | Operator source of truth for install, ownership, release, visual acceptance. |
| `CHANGELOG.md` `[Unreleased]` | Modified | Line 115 records the entry (already in the working tree). |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Plugin accidentally registers a second MCP (`pi.mcp` field or `mcp.json` shipped) | Med | `plugin/pi/package.json` omits `pi.mcp`; `files` manifest does NOT list `mcp.json`; both invariants are pinned by `test/quality-gates/pi-native-package-1723.test.ts`. |
| Plugin facade name collides with `mcp` / `mcp__dysflow` | Low | `native-tool.ts:46` pins `name: "dysflow"`; `pi-native-package-1723.test.ts` asserts `name !== "mcp"` and `name !== "mcp__dysflow"`. |
| `dysflow update` upgrades the npm package without the ownership path | Med | `refreshInstalledPiIntegration` (`updater.ts:59-99`) is the only entry point; it always snapshots MCP bytes before reconciling the package. The transactionality is pinned by `pi-integration-1723.test.ts` source-text assertions on `install.ts` / `updater.ts` / `uninstall.ts`. |
| User pre-installed the exact pinned version — Dysflow must not claim ownership | Med | `pi-package-manager.ts:156-163` checks `current !== undefined && !ownsCurrent` and refuses with `"Pi already has a pre-existing Pi package for @aroman22/dysflow-pi; Dysflow left it unchanged."`. Pinned by `pi-package-manager-1723.test.ts` "preserves an exact pre-existing user package". |
| User pre-installed a differently-pinned version — Dysflow must not overwrite | Med | Same branch as above; pinned by `pi-package-manager-1723.test.ts` "fails safely on a differently pinned pre-existing user package". |
| Foreign MCP entry named `dysflow` is overwritten silently | Low | `mcp-configurator.ts:92-98` rejects with `"Pi already has a foreign MCP entry named dysflow; Dysflow left Pi configuration unchanged."`; pinned by `pi-integration-1723.test.ts` "fails safely when a foreign executable lives inside a dysflow directory". |
| Package install fails AFTER the MCP entry was created, leaving a partial state | Med | Snapshot-rollback pair in `install.ts` / `updater.ts`; `restorePiIntegration` writes the exact prior bytes or removes the file if reconciliation created it. Pinned by `pi-integration-1723.test.ts` "restores the exact prior MCP bytes after a later package step fails" and "removes a newly created MCP file when a later package step fails". |
| Version drift between `plugin/pi/package.json` and root `package.json` | Med | `.github/scripts/set-release-package-version.mjs` stamps both manifests from the release tag; `test/quality-gates/release-package-version.test.ts` rejects drift; `pi-native-package-1723.test.ts` asserts `manifest.version === repositoryManifest.version`. |
| Collapsed rendering leaks parameters, paths, secrets, or arbitrary backend error text | Med | `operationLabel` reads only `args.moduleNames.length` for the count; all other branches return fixed verb phrases; `isError` collapses to `"✗ Dysflow failed"`; the test `pi-native-package-1723.test.ts` "renders characteristic calls without dumping parameters" and "throws only a bounded error through Pi's public tool-error path" pin the contract. |

## Rollback Plan

1. **MCP side.** Revert the MCP entry through `dysflow uninstall --agents pi` —
   `removeAgentConfig` and `reconcilePiIntegration({ mode: "remove" })` remove
   the managed `~/.pi/agent/mcp.json` entry. Owned remove of the npm package
   calls `pi remove npm:@aroman22/dysflow-pi`; non-owned packages are left
   untouched.
2. **npm side.** A non-owned remove is a no-op by design, so the user can also
   `pi remove npm:@aroman22/dysflow-pi` manually. `<runtimeDir>/.dysflow-pi-package.json`
   is the only Dysflow-written record and is removed on owned uninstall.
3. **Code side.** The plugin folder and the four installer files are additive
   to the runtime. Reverting the four installer files removes `pi` from the
   agent allowlist; `applyIntegrationSelection` no longer routes Pi.

## Dependencies

- `@modelcontextprotocol/sdk@1.29.0` (npm dep of the plugin, declared in
  `plugin/pi/package.json:41`).
- `@earendil-works/pi-coding-agent@0.85.1`, `@earendil-works/pi-tui@0.85.1`,
  `typebox@1.3.30` (dev deps; `typebox` is `peerDependencies: "*"`).
- Node `~26.2.0` types (dev dep).
- npm Trusted Publisher configured for `DysTelefonica/dysflow` + workflow
  `.github/workflows/release.yml` — one-time bootstrap, recorded in
  `docs/pi-native-integration.md` § "Release Contract".
- The Dysflow runtime launcher (`<runtimeDir>/bin/dysflow.cmd` on win32) — the
  absolute path that `resolveDysflowCommand` returns and that
  `mcp-configurator.ts` writes into `mcpServers.dysflow.command`.

## Success criteria

- [ ] A clean Pi install followed by `dysflow install --agents pi --no-tui`
      leaves `~/.pi/agent/mcp.json` with exactly one Dysflow MCP entry whose
      `command` is the installer-managed absolute launcher and whose
      `directTools === false` (asserted by `test/cli/commands/install/pi-integration-1723.test.ts`
      "creates only the global absolute-launcher MCP entry").
- [ ] `plugin/pi/package.json` ships without `pi.mcp` and without `mcp.json`,
      and `npm pack --dry-run` from `plugin/pi/` lists every runtime file and
      does NOT list `mcp.json` (asserted by `test/quality-gates/pi-native-package-1723.test.ts`
      "ships a public Pi package without a package-scoped duplicate MCP" and
      "packs every runtime artifact required by a clean Pi installation").
- [ ] `plugin/pi/package.json` version equals root `package.json` version
      (asserted by `test/quality-gates/pi-native-package-1723.test.ts`
      "keeps the canonical Pi guide aligned with package and repository contracts").
- [ ] `pi.registerTool` registers exactly one tool named `dysflow`, distinct
      from `mcp` and `mcp__dysflow` (asserted by
      `test/quality-gates/pi-native-package-1723.test.ts` "registers one unique
      native facade and delegates over the injected MCP port").
- [ ] Collapsed rendering never includes the original operation name verbatim,
      never includes arguments, paths, or secrets, and collapses every error
      to `"✗ Dysflow failed"` (asserted by the chrome-rendering tests).
- [ ] `reconcilePiPackage` honours all eight behaviour branches listed in
      `explore.md` § "Installer integration" / "Package manager", including the
      install-failure rollback (`pi-package-manager-1723.test.ts` "rolls back
      the Pi install when the ownership record cannot be committed").
- [ ] The Dysflow installer code never edits `gentle-pi`. A repository-wide
      grep of `gentle-pi` across `plugin/pi/`, `src/cli/commands/install/pi-package-manager.ts`,
      and `src/cli/commands/install/mcp-configurator.ts` returns zero matches
      (confirmed in `explore.md` § "Boundaries confirmed by the source").
- [ ] The transactionality of `install` / `update` for `pi` is source-text
      pinned (`pi-integration-1723.test.ts` "routes install, upgrade, and
      uninstall through shared MCP and package reconcilers" + "captures /
      restores the snapshot pair in transactional sources").
- [ ] `pnpm --dir plugin/pi typecheck` is green (referenced from
      `docs/pi-native-integration.md:149` and asserted in the
      `pi-native-package-1723.test.ts` chrome test which imports the package
      directly).
- [ ] `pnpm vitest run test/quality-gates/pi-native-package-1723.test.ts`,
      `test/cli/commands/install/pi-integration-1723.test.ts`, and
      `test/cli/commands/install/pi-package-manager-1723.test.ts` are all
      green.
- [ ] `CHANGELOG.md` `[Unreleased]` carries the `#1723` entry (already at
      `CHANGELOG.md:115`).
