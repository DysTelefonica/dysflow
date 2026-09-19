# Pi-Native Integration

[Back to setup](./SETUP.md)

This guide is the source of truth for the Dysflow package for Pi. It covers installation, ownership, release, verification, and failure recovery.

The [MCP tool reference](./api/mcp-tools.md) owns the operation contract.

## Quick Path

Install Dysflow and its Pi package:

```bash
dysflow install --agents pi --no-tui
```

Every installed runtime carries its own copy of the package at `<runtime>/app/plugin/pi`, with its production dependencies already installed. The installer activates that copy through Pi's package manager by local path:

```text
pi install <runtime>/app/plugin/pi
```

Do not run that command as the normal setup path. Dysflow must record whether it owns the installation.

In an active Pi session, enter `/reload`. Then ask Pi to call:

```text
dysflow({ tool: "bootstrap", args: {} })
```

A collapsed call starts with the literal product glyph `⚡ Dysflow`. Expand the result and verify that the structured payload contains the expected `adapterVersion`.

## Architecture

The package is `@aroman22/dysflow-pi`, sourced from `plugin/pi`. Its extension registers one native facade named `dysflow` and delegates each request through the official Dysflow MCP stdio boundary.

```text
Pi native facade → MCP SDK client → absolute Dysflow launcher → dysflow mcp
```

The package does not copy MCP schemas. Runtime discovery remains `bootstrap({})`, `schema({ view: "index" })`, and the relevant capability views.

Dysflow separately owns the global Pi MCP entry in `~/.pi/agent/mcp.json`. It uses the absolute installer-managed launcher and `directTools: false`.

The package has no `pi.mcp` field and ships no `mcp.json`, so it cannot add a duplicate MCP or override `mcp`, `mcp__dysflow`, or pi-mcp-adapter tools.

## Ownership and Reconciliation

The package ships inside the signed release archive, so it always matches the installed runtime and no package registry is involved. The runtime installer copies `plugin/pi` to `<runtime>/app/plugin/pi` and installs its production dependencies from the committed `plugin/pi/pnpm-lock.yaml`.

Pi loads a local-path package in place and never installs its dependencies, so they must be present first. `plugin/pi/.npmrc` disables peer installation, the same way Pi installs its own packages: Pi provides the `@earendil-works/pi-*` and `typebox` peers at load time.

Dysflow invokes Pi's canonical package manager instead of editing package settings. Pi stores a local path relative to its settings directory; Dysflow resolves each entry against that directory to recognize its own.

Dysflow stores its ownership record at `<runtime>/.dysflow-pi-package.json`. The record names the exact source Dysflow installed.

| Existing state | Install or update result |
| --- | --- |
| Package absent | Pi installs `<runtime>/app/plugin/pi` and Dysflow records ownership. |
| The same runtime path already added by the user | Dysflow preserves it and does not claim ownership. |
| A user-managed `npm:@aroman22/dysflow-pi@<version>` entry | Installation stops with a conflict and leaves it unchanged. |
| A Dysflow-owned `npm:@aroman22/dysflow-pi@<version>` entry from an earlier release | Pi removes it, then installs the runtime path. If the install fails, the previous entry is restored. |
| Ownership record and Pi settings disagree | Dysflow treats the package as user-managed and does not overwrite or remove it. |

Repeated reconciliation of an already-current installation is a byte-identical no-op. Unrelated packages, Pi settings, and MCP servers remain unchanged.

A foreign MCP entry named `dysflow` is a conflict; it is never overwritten.

If package installation fails after MCP reconciliation, Dysflow restores the exact prior MCP bytes or removes the file when reconciliation created it.

A package is not marked as owned until Pi reports the expected source in settings and the ownership record is written atomically.

## Update and Uninstall

Refresh the runtime and every Dysflow-owned Pi entry:

```bash
dysflow update
```

The update replaces `<runtime>/app/plugin/pi` together with the rest of the runtime, so the active package moves with it. Enter `/reload` in Pi afterwards.

Remove Dysflow:

```bash
dysflow uninstall
```

Uninstall calls `pi remove` with the owned source only when the current Pi setting matches Dysflow's ownership record.

A pre-existing package, a package changed later by the user, `pi-mcp-adapter`, and foreign MCP entries are preserved.

## Rendering Contract

Collapsed calls show one bounded status line. They never include arguments, secrets, paths, arbitrary operation names, or arbitrary MCP error text.

```text
⚡ Dysflow · importing 3 modules…
↳ ✓ imported 3 modules
```

Successful structured MCP content appears only when the result is expanded.

MCP failures use Pi's public thrown-error path with a bounded `Dysflow operation failed.` message, so arbitrary backend error text never enters Pi's tool result.

The package uses Pi's public extension and TUI APIs; it does not use private Pi APIs.

## Troubleshooting

| Symptom | Safe action |
| --- | --- |
| `pi` is not available | Install Pi through its supported distribution, then rerun the Dysflow command. Dysflow does not emulate Pi's package manager. |
| `<runtime>/app/plugin/pi` is missing | Reinstall the runtime from the signed GitHub Release (`dysflow update --force`). |
| The runtime install cannot fetch the facade's dependencies | Restore network access to the public package registry and rerun. No account is needed. |
| A user-managed package entry is already present | Decide which installation owns the package. Dysflow preserves the user installation until the conflict is resolved explicitly. |
| Pi does not show `dysflow` | Run `/reload`, then rerun the bootstrap check. |
| The call lacks `⚡ Dysflow` | Rerun `dysflow install --agents pi --no-tui`, resolve any reported conflict, and reload. |
| The MCP child cannot start | Run `dysflow doctor` and verify the configured runtime or `DYSFLOW_BIN` resolves to an absolute launcher. |
| A protected Access operation fails | Set the required Dysflow password environment variable before starting Pi, then reload. |

Do not repair activation by editing Pi JSON, copying package files, registering another MCP, installing into global npm, or changing gentle-pi.

## Release Contract

Dysflow and `@aroman22/dysflow-pi` use the same semantic version. `.github/scripts/set-release-package-version.mjs` stamps both manifests from the release tag, and the quality gate rejects drift.

The facade reaches users inside the signed release archive; no registry publication is required. The tag workflow performs this order:

1. Complete exact-SHA quality authority and Access E2E validation.
2. Stamp both package versions.
3. Build and sign the Dysflow release archive, which contains `plugin/pi` and its lockfile.
4. Create and verify the GitHub release.
5. Optionally publish the same package to npm, only when the `NPM_TOKEN` secret is set. These steps run after the GitHub release, and a failure there neither fails the job nor removes the release.

When the npm steps run, they pack one exact tarball, publish it, and verify its version and registry `dist.integrity`. A retry continues only when an existing same-version artifact has the same integrity. The workflow never unpublishes.

## Sandboxed Contributor Checks

Tests must not invoke real Pi, mutate a real user profile, use a global npm prefix, or write to a production Dysflow runtime.

Use temporary paths for every mutable boundary:

- `HOME` and `USERPROFILE`;
- Pi agent directory and settings;
- Dysflow runtime and system-marker override;
- npm cache and prefix;
- an injected Pi package-command runner.

Run the package and focused integration checks:

```bash
pnpm --dir plugin/pi typecheck
pnpm vitest run test/quality-gates/pi-native-package-1723.test.ts
pnpm vitest run test/cli/commands/install/pi-integration-1723.test.ts
pnpm vitest run test/cli/commands/install/pi-package-manager-1723.test.ts
pnpm vitest run test/quality-gates/release-package-version.test.ts
```

The pack test supplies temporary HOME, USERPROFILE, npm cache, and npm prefix paths. It runs `npm pack --dry-run`; it never runs `npm publish`.

## Clean-Pi Visual Acceptance

Automated tests do not certify the final TUI appearance. After the implementation is green and uploaded to the Dysflow remote, stop the implementation session.

Do not reuse it or treat `/reload` in that session as acceptance evidence.

After the authorized tag workflow has published the GitHub release:

1. Open a completely new Pi process and session.
2. Install through the canonical owner-aware path: `dysflow install --agents pi --no-tui`.
3. Start another fresh Pi session so package and MCP configuration load from disk.
4. Call `dysflow({ tool: "bootstrap", args: {} })`.
5. Verify visually that the collapsed call and result use the package-owned `⚡ Dysflow` chrome, comparable to Engram's native execution chrome, and that expanding the result exposes the structured Dysflow payload.
6. Record the installed Dysflow/package version and the visual result.

This acceptance belongs to the fresh consumer session, not to the implementation session.

## Contributor Checklist

- [ ] Keep the package name `@aroman22/dysflow-pi` and its version equal to the root release version.
- [ ] Keep `typebox` at peer range `"*"`; an exact version belongs only in development dependencies.
- [ ] Keep `plugin/pi/pnpm-lock.yaml` current and peer installation disabled in `plugin/pi/.npmrc`.
- [ ] Keep the facade name distinct from `mcp` and `mcp__dysflow`.
- [ ] Keep the package free of `pi.mcp` and `mcp.json`.
- [ ] Preserve the global absolute-launcher MCP entry with `directTools: false`.
- [ ] Cover install, update, owned uninstall, user preservation, conflicts, rollback, and repeated-install identity.
- [ ] Keep collapsed rendering bounded and redacted.
- [ ] Test package commands only through the injected sandbox runner.
- [ ] Run `npm pack --dry-run` and never publish from a development session.
- [ ] Hand off final visual acceptance to a completely new Pi session after remote upload and publication.
- [ ] Update this guide with any Pi integration or release-contract change.

## Navigation

Previous: [Install and verify Dysflow](./SETUP.md) | Next: [Plugin author guide](./PLUGIN-AUTHORS.md)
