# Dysflow Pi Plugin Specification

## Purpose

Defines the contract for the Pi-native Dysflow package (`@aroman22/dysflow-pi`)
and its installer reconciliation. Covers the native tool registration shape,
the bounded chrome glyph contract, the `directTools: false` MCP compatibility
path, npm spec pinning to the root release, and the ownership-aware install
/ update / uninstall lifecycle that yields clean-Pi activation without
modifying `gentle-pi`.

## Requirements

### Requirement: Native facade registration

The Pi extension MUST register exactly one native tool whose `name` is
`"dysflow"`. The name MUST be distinct from `mcp` and `mcp__dysflow`. The tool
MUST be registered through `pi.registerTool` with `renderShell: "self"` and
MUST expose `renderCall` and `renderResult` closures that produce the chrome
defined by REQ-2.

#### Scenario: one facade, distinct from mcp / mcp__dysflow

- GIVEN the plugin extension is loaded into a Pi session
- WHEN the extension calls `pi.registerTool`
- THEN the registered tool's `name` is `"dysflow"`
- AND `name !== "mcp"`
- AND `name !== "mcp__dysflow"`

#### Scenario: native facade delegates through the injected MCP port

- GIVEN the extension is loaded with an MCP client that records every call
- WHEN the facade's `execute` is invoked with `{ tool: "bootstrap", args: {} }`
- THEN the MCP client receives exactly one `callTool("bootstrap", {}, ...)`
- AND the facade returns `{ content: PiContent[], details: { mcpResult } }`

### Requirement: Chrome glyph contract

Collapsed chrome MUST start with the literal product glyph `⚡ Dysflow · `
followed by a fixed verb phrase returned by `operationLabel`. The chrome MUST
NEVER include the call's original `args`, `args.moduleNames` content, paths,
secrets, or arbitrary backend error text. Errors MUST collapse to the bounded
status `✗ Dysflow failed`. Successful structured MCP content MUST appear only
when the result is expanded.

#### Scenario: chrome for bootstrap

- GIVEN an `execute({ tool: "bootstrap", args: { secret: "must-not-render" } })` call
- WHEN `renderDysflowCallText` is invoked
- THEN the returned text is `⚡ Dysflow · bootstrap…`
- AND `secret` is not present in the returned text

#### Scenario: chrome for import_modules with a count

- GIVEN an `execute({ tool: "import_modules", args: { moduleNames: ["One", "Two", "Three"], accessPath: "C:/private/frontend.accdb" } })` call
- WHEN `renderDysflowCallText` is invoked
- THEN the returned text is `⚡ Dysflow · importing 3 modules…`
- AND `accessPath` is not present in the returned text

#### Scenario: chrome for an unknown operation

- GIVEN an `execute({ tool: "internal_secret_operation", args: {} })` call
- WHEN `renderDysflowCallText` is invoked
- THEN the returned text is `⚡ Dysflow · operation…`
- AND the original tool name is not present in the returned text

#### Scenario: chrome for a path-shaped tool name

- GIVEN an `execute({ tool: "C:/private/token=abc", args: {} })` call
- WHEN `renderDysflowCallText` is invoked
- THEN the returned text is `⚡ Dysflow · operation…`
- AND the original tool name is not present in the returned text

#### Scenario: collapsed result is one bounded status line

- GIVEN an `import_modules` success result with structured content
- WHEN `renderDysflowResultText` is invoked with `{ expanded: false }`
- THEN the returned text is `↳ ✓ imported 2 modules`
- AND no additional lines are appended

#### Scenario: expanded result includes the structured payload

- GIVEN the same `import_modules` success result
- WHEN `renderDysflowResultText` is invoked with `{ expanded: true }`
- THEN the returned text begins with `↳ ✓ imported 2 modules`
- AND the returned text includes the structured JSON payload as a second block

#### Scenario: partial result uses a warning marker

- GIVEN a `bootstrap` result with no payload yet
- WHEN `renderDysflowResultText` is invoked with `{ isPartial: true }`
- THEN the returned text is `↳ ⚠ bootstrap…`

#### Scenario: error result collapses to a bounded message

- GIVEN a `verify_code` result whose text content carries a leaked secret
- WHEN `renderDysflowResultText` is invoked with `{ isError: true }`
- THEN the returned text is `↳ ✗ Dysflow failed`
- AND the secret text is not present in the returned text

### Requirement: Bounded facade error path

When the MCP port returns a result with `isError: true`, the facade's
`execute` MUST throw the bounded message `Dysflow operation failed.` through
Pi's public tool-error path. The facade MUST NOT include the raw MCP error
text, paths, or secrets in the thrown error.

#### Scenario: isError:true throws a bounded error

- GIVEN a `callTool` mock that returns `isError: true` with a leaked secret in the text content
- WHEN the facade's `execute` is invoked with `{ tool: "verify_code", args: {} }`
- THEN `execute` rejects with the message `Dysflow operation failed.`
- AND the rejected error message does not contain the leaked secret

### Requirement: Operation name validation

The facade's `execute` MUST validate `params.tool` against the pattern
`^[a-z][a-z0-9_]{0,63}$` BEFORE delegating to the MCP port. A name that fails
the pattern MUST cause `execute` to reject with a bounded error that does not
echo the offending value.

#### Scenario: tool name with non-lowercase characters is rejected

- GIVEN `execute` is invoked with `{ tool: "ImportModules", args: {} }`
- WHEN the facade validates the name
- THEN `execute` rejects before invoking the MCP port
- AND the rejected message does not echo `ImportModules`

### Requirement: MCP compatibility path uses `directTools: false`

The Dysflow installer MUST write a single MCP entry named `dysflow` into
`~/.pi/agent/mcp.json` whose shape is
`{ command: <absolute-launcher>, args: ["mcp"], directTools: false, type:
"local", lifecycle: "lazy" }`. The entry MUST be reachable as a diagnostics
surface but MUST NOT appear as a native tool in Pi's tool inventory. Every
subsequent reconciliation MUST keep `directTools === false`.

#### Scenario: first-time install writes the managed entry

- GIVEN `~/.pi/agent/mcp.json` does not exist
- WHEN `reconcilePiIntegration({ mcpConfigPath, commandPath })` is called
- THEN `mcp.json` exists with exactly one `mcpServers.dysflow` entry
- AND the entry's `command` equals `commandPath` (the installer-managed absolute launcher)
- AND `directTools === false`
- AND `args === ["mcp"]`
- AND `type === "local"`
- AND `lifecycle === "lazy"`
- AND the function returns `{ status: "added", active: true }`

#### Scenario: re-reconciliation is byte-identical

- GIVEN `reconcilePiIntegration` has already created the managed entry
- WHEN it is called again with the same inputs
- THEN the file on disk is byte-identical to its prior contents
- AND the function returns `{ status: "unchanged", active: true }`

#### Scenario: foreign MCP entry named dysflow is refused

- GIVEN `mcp.json` already contains `mcpServers.dysflow` whose `command`
  does NOT match the installer-managed shape (e.g. a foreign executable)
- WHEN `reconcilePiIntegration` is called
- THEN it rejects with an error mentioning a foreign MCP entry
- AND the file on disk is unchanged

#### Scenario: installer-owned remove removes only the managed entry

- GIVEN `mcp.json` contains a Dysflow-managed entry
- WHEN `reconcilePiIntegration({ mode: "remove" })` is called
- THEN the entry is removed from `mcpServers.dysflow`
- AND the function returns `{ status: "changed", active: false }`

#### Scenario: non-managed entry is not removed

- GIVEN `mcp.json` contains a `mcpServers.dysflow` entry that the installer does NOT own
- WHEN `reconcilePiIntegration({ mode: "remove" })` is called
- THEN the entry is left untouched
- AND the function returns `{ status: "unchanged", active: true }`

### Requirement: npm spec pin equals root release version

The npm package manifest MUST name `@aroman22/dysflow-pi` and MUST pin its
`version` to the same value as the root Dysflow `package.json`. The pin MUST
be updated by the release workflow (`.github/scripts/set-release-package-version.mjs`).
A drift between the two versions MUST be caught by the release-version
quality gate.

#### Scenario: package version equals repository version

- GIVEN `plugin/pi/package.json` and the root `package.json` are both present
- WHEN the version drift test reads both manifests
- THEN `plugin/pi/package.json.version === root.package.json.version`

#### Scenario: package manifest has no pi.mcp field

- GIVEN the npm package manifest is shipped
- WHEN the manifest invariant test reads it
- THEN `pi.mcp` is undefined
- AND `dependencies.typebox` is undefined
- AND `peerDependencies.typebox` is `"*"`

### Requirement: npm package ships without an `mcp.json`

The npm package MUST NOT include an `mcp.json` file. The package MUST
NOT declare a `pi.mcp` field. `npm pack --dry-run` from `plugin/pi/` MUST
list every runtime file (`index.ts`, `native-tool.ts`, `dysflow-mcp-client.ts`,
`dysflow-tool-chrome.ts`, `README.md`) and MUST NOT list `mcp.json`.

#### Scenario: npm pack dry-run omits mcp.json

- GIVEN a sandbox HOME, USERPROFILE, npm cache, and npm prefix
- WHEN `npm pack --dry-run --json` is executed in `plugin/pi/`
- THEN the reported file list contains `index.ts`, `native-tool.ts`,
  `dysflow-mcp-client.ts`, `dysflow-tool-chrome.ts`, and `README.md`
- AND the reported file list does NOT contain `mcp.json`

### Requirement: npm spec reconciliation is ownership-aware

`reconcilePiPackage` MUST recognise exactly eight behaviours: install from
absent, exact pre-existing user package (preserve), differently pinned user
package (refuse), owned upgrade, owned remove, non-owned remove (no-op),
install-failure rollback, and stale-ownership / user-modified (no-op remove).
The ownership record at `<runtimeDir>/.dysflow-pi-package.json` is the only
source of "Dysflow owns this install".

#### Scenario: absent → install records ownership

- GIVEN `~/.pi/agent/settings.json` has no `@aroman22/dysflow-pi` entry
- AND `<runtimeDir>/.dysflow-pi-package.json` does not exist
- WHEN `reconcilePiPackage({ packageVersion: "4.3.2" })` is called
- THEN the injected Pi runner receives `["install", "npm:@aroman22/dysflow-pi@4.3.2"]`
- AND `settings.json` now lists that spec
- AND `<runtimeDir>/.dysflow-pi-package.json` is written with
  `{ packageName: "@aroman22/dysflow-pi", spec, version: "4.3.2", owned: true }`
- AND the function returns `{ status: "added", active: true, owned: true, spec }`

#### Scenario: exact pre-existing user package is preserved without claiming ownership

- GIVEN `settings.json` lists `npm:@aroman22/dysflow-pi@4.3.2` already
- AND the ownership record does NOT exist
- WHEN `reconcilePiPackage({ packageVersion: "4.3.2" })` is called
- THEN the injected Pi runner is NOT called
- AND no ownership record is written
- AND the function returns `{ status: "unchanged", active: true, owned: false, spec }`

#### Scenario: differently pinned pre-existing user package is refused

- GIVEN `settings.json` lists `npm:@aroman22/dysflow-pi@4.2.0`
- WHEN `reconcilePiPackage({ packageVersion: "4.3.2" })` is called
- THEN it rejects with an error mentioning a pre-existing Pi package
- AND `settings.json` is unchanged
- AND the injected Pi runner is NOT called

#### Scenario: owned upgrade replaces the spec and the record

- GIVEN `settings.json` lists `npm:@aroman22/dysflow-pi@4.2.0`
- AND the ownership record lists the same spec at version `4.2.0`
- WHEN `reconcilePiPackage({ packageVersion: "4.3.2" })` is called
- THEN the injected Pi runner receives `["install", "npm:@aroman22/dysflow-pi@4.3.2"]`
- AND `settings.json` now lists the new spec
- AND the ownership record is rewritten to the new spec at version `4.3.2`
- AND the function returns `{ status: "changed", owned: true, ... }`

#### Scenario: owned remove deletes the package and the record

- GIVEN the ownership record matches `settings.json` for the current package
- WHEN `reconcilePiPackage({ mode: "remove" })` is called
- THEN the injected Pi runner receives `["remove", "npm:@aroman22/dysflow-pi"]`
- AND `settings.json` no longer lists the package
- AND the ownership record is removed
- AND the function returns `{ status: "changed", active: false, owned: false, spec }`

#### Scenario: non-owned remove is a no-op

- GIVEN `settings.json` lists the package
- AND the ownership record does NOT exist
- WHEN `reconcilePiPackage({ mode: "remove" })` is called
- THEN the injected Pi runner is NOT called
- AND `settings.json` is unchanged
- AND the function returns `{ status: "unchanged", active: true, owned: false, spec }`

#### Scenario: install-failure rolls back the package step

- GIVEN the injected Pi runner installs the spec successfully
- AND the ownership record write fails
- WHEN `reconcilePiPackage({ packageVersion: "4.3.2" })` is called
- THEN it rejects with the ownership-write error
- AND the injected Pi runner then receives `["remove", "npm:@aroman22/dysflow-pi"]` as rollback
- AND `settings.json` is empty of the Dysflow package entry
- AND the ownership record is NOT written

#### Scenario: stale ownership + user-modified package is preserved

- GIVEN the ownership record says `npm:@aroman22/dysflow-pi@4.3.2`
- AND `settings.json` lists `npm:@aroman22/dysflow-pi@5.0.0` (user-modified)
- WHEN `reconcilePiPackage({ mode: "remove" })` is called
- THEN the injected Pi runner is NOT called
- AND `settings.json` is unchanged
- AND the function returns `{ status: "unchanged", active: true, owned: false, spec }`

### Requirement: Transactional install + update wrappers

The Dysflow install and update commands for `--agents pi` MUST snapshot the
Pi MCP file BEFORE reconciling the npm package. If the package step fails,
the wrapper MUST restore the MCP file to its exact prior bytes (or remove it
when reconciliation created it). The `dysflow uninstall` path for `pi` MUST
snapshot and roll back in the same way.

#### Scenario: package-step failure restores prior MCP bytes

- GIVEN `mcp.json` existed with non-Dysflow contents before reconciliation
- AND `reconcilePiPackage` is configured to fail
- WHEN `applyIntegrationSelection` runs the install for `pi`
- THEN `mcp.json`'s contents on disk equal the prior bytes byte-for-byte

#### Scenario: package-step failure removes a newly created MCP file

- GIVEN `mcp.json` did NOT exist before reconciliation
- AND `reconcilePiPackage` is configured to fail
- WHEN `applyIntegrationSelection` runs the install for `pi`
- THEN `mcp.json` does NOT exist on disk after the failure

### Requirement: Launcher resolver is absolute-path only

`resolveDysflowCommand` MUST return an absolute launcher path. A relative
`DYSFLOW_BIN` MUST cause the resolver to reject. The resolver MUST honour, in
order: `DYSFLOW_BIN` (absolute only), `DYSFLOW_HOME`, the system marker at
`%ProgramData%/dysflow/.dysflow-marker` (or `DYSFLOW_RUNTIME_MARKER_PATH`),
and a final fallback to `%LOCALAPPDATA%/dysflow`. The resolved launcher path
MUST end in `bin/dysflow.cmd` on Windows and `bin/dysflow` on POSIX.

#### Scenario: DYSFLOW_BIN absolute override wins

- GIVEN `DYSFLOW_BIN` is set to `C:/trusted/dysflow.cmd`
- WHEN `resolveDysflowCommand` is called
- THEN the returned path is `C:/trusted/dysflow.cmd`

#### Scenario: relative DYSFLOW_BIN is rejected

- GIVEN `DYSFLOW_BIN` is set to `dysflow`
- WHEN `resolveDysflowCommand` is called
- THEN it throws an error mentioning an absolute path

#### Scenario: marker fallback when DYSFLOW_HOME is unset

- GIVEN no `DYSFLOW_BIN` and no `DYSFLOW_HOME`
- AND `DYSFLOW_RUNTIME_MARKER_PATH` points to a missing marker file
- AND `LOCALAPPDATA` is `C:/runtime-home`
- WHEN `resolveDysflowCommand` is called
- THEN the returned path matches
  `^C:[\\/]runtime-home[\\/]dysflow[\\/]bin[\\/]dysflow\.cmd$`

### Requirement: Child environment inherits only string entries

`dysflowChildEnvironment` MUST return an env object whose values are all
strings, omitting entries whose value is `undefined`. This guarantees the
stdio child sees the operator's auth variables (e.g. `ACCESS_VBA_PASSWORD`)
without the runtime leaking `undefined`-valued keys into the subprocess.

#### Scenario: undefined-valued env entries are dropped

- GIVEN the parent env contains `{ ACCESS_VBA_PASSWORD: "inherited", OMITTED: undefined }`
- WHEN `dysflowChildEnvironment(parentEnv)` is called
- THEN the returned object equals `{ ACCESS_VBA_PASSWORD: "inherited" }`

### Requirement: Clean-Pi activation without editing `gentle-pi`

A clean Pi install followed by `dysflow install --agents pi --no-tui` MUST
register the npm package and configure the MCP compatibility path WITHOUT
modifying the `gentle-pi` repository or any package settings outside the two
JSON files (`~/.pi/agent/mcp.json`, `~/.pi/agent/settings.json`) and the
Dysflow ownership record (`<runtimeDir>/.dysflow-pi-package.json`). A
repository-wide grep for the substring `gentle-pi` across `plugin/pi/`,
`src/cli/commands/install/pi-package-manager.ts`, and
`src/cli/commands/install/mcp-configurator.ts` MUST return zero matches.

#### Scenario: no gentle-pi references in the change

- GIVEN the working tree at HEAD `f7b94a3f`
- WHEN `grep -r gentle-pi plugin/pi src/cli/commands/install/pi-package-manager.ts src/cli/commands/install/mcp-configurator.ts` is run
- THEN no matches are returned

#### Scenario: install leaves only the documented JSON files

- GIVEN a clean HOME with no `~/.pi/agent/`
- WHEN `dysflow install --agents pi --no-tui` completes successfully
- THEN `~/.pi/agent/mcp.json` exists with one Dysflow-managed entry
- AND `~/.pi/agent/settings.json` exists with the Dysflow package spec
- AND `<runtimeDir>/.dysflow-pi-package.json` exists with `{ owned: true, ... }`
- AND no other file under `~/.pi/agent/` was created by the installer
