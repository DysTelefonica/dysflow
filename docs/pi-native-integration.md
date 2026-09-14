# Pi-Native Integration

[Back to setup](./SETUP.md)

This guide is the source of truth for the Dysflow package for Pi. It covers installation, ownership, release, verification, and failure recovery.

The [MCP tool reference](./api/mcp-tools.md) owns the operation contract.

## Quick Path

Install Dysflow and the matching Pi package:

```bash
dysflow install --agents pi --no-tui
```

The installer delegates package installation to Pi with an exact release-matched source such as:

```text
pi install npm:@aroman22/dysflow-pi@4.3.2
```

Do not run that command as the normal setup path. Dysflow must record whether it owns the installation.

In an active Pi session, enter `/reload`. Then ask Pi to call:

```text
dysflow({ tool: "bootstrap", args: {} })
```

A collapsed call starts with the literal product glyph `⚡ Dysflow`. Expand the result and verify that the structured payload contains the expected `adapterVersion`.

## Architecture

The public package is `@aroman22/dysflow-pi`. Its extension registers one native facade named `dysflow` and delegates each request through the official Dysflow MCP stdio boundary.

```text
Pi native facade → MCP SDK client → absolute Dysflow launcher → dysflow mcp
```

The package does not copy MCP schemas. Runtime discovery remains `bootstrap({})`, `schema({ view: "index" })`, and the relevant capability views.

Dysflow separately owns the global Pi MCP entry in `~/.pi/agent/mcp.json`. It uses the absolute installer-managed launcher and `directTools: false`.

The npm package has no `pi.mcp` field and ships no `mcp.json`, so it cannot add a duplicate MCP or override `mcp`, `mcp__dysflow`, or pi-mcp-adapter tools.

## Ownership and Reconciliation

Pi owns package settings and dependencies under `~/.pi/agent/npm/`. Dysflow invokes Pi's canonical package manager instead of editing package settings or copying `plugin/pi` into the runtime.

Dysflow stores its ownership record at `<runtime>/.dysflow-pi-package.json`. The record names the exact npm spec Dysflow installed.

| Existing state | Install or update result |
| --- | --- |
| Package absent | Pi installs `npm:@aroman22/dysflow-pi@<dysflow-version>` and Dysflow records ownership. |
| Exact package already installed by the user | Dysflow preserves it and does not claim ownership. |
| Different user-managed version installed | Installation stops with a conflict and leaves it unchanged. |
| Dysflow-owned older version | Pi replaces it with the exact version matching the new Dysflow release. |
| Ownership record and Pi settings disagree | Dysflow treats the package as user-managed and does not overwrite or remove it. |

Repeated reconciliation of an already-current installation is a byte-identical no-op. Unrelated packages, Pi settings, and MCP servers remain unchanged.

A foreign MCP entry named `dysflow` is a conflict; it is never overwritten.

If package installation fails after MCP reconciliation, Dysflow restores the exact prior MCP bytes or removes the file when reconciliation created it.

A package is not marked as owned until Pi reports the exact pinned source in settings and the ownership record is written atomically.

## Update and Uninstall

Refresh the runtime and every Dysflow-owned Pi entry:

```bash
dysflow update
```

The updater reads the version that actually landed in the runtime and asks Pi to install the matching pinned package. Pi's broad package update commands cannot move this pin.

Remove Dysflow:

```bash
dysflow uninstall
```

Uninstall calls `pi remove npm:@aroman22/dysflow-pi` only when the current Pi setting exactly matches Dysflow's ownership record.

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
| npm or npmjs is unavailable | Restore registry access and rerun. Dysflow does not write a partial ownership claim. |
| The pinned package version is missing | Stop. The release workflow must publish and verify the matching package before creating the GitHub release. |
| A different package version is already present | Decide which installation owns the package. Dysflow preserves the user installation until the conflict is resolved explicitly. |
| Pi does not show `dysflow` | Run `/reload`, then rerun the bootstrap check. |
| The call lacks `⚡ Dysflow` | Rerun `dysflow install --agents pi --no-tui`, resolve any reported conflict, and reload. |
| The MCP child cannot start | Run `dysflow doctor` and verify the configured runtime or `DYSFLOW_BIN` resolves to an absolute launcher. |
| A protected Access operation fails | Set the required Dysflow password environment variable before starting Pi, then reload. |

Do not repair activation by editing Pi JSON, copying package files, registering another MCP, installing into global npm, or changing gentle-pi.

## Release Contract

Dysflow and `@aroman22/dysflow-pi` use the same semantic version. `.github/scripts/set-release-package-version.mjs` stamps both manifests from the release tag, and the quality gate rejects drift.

The tag workflow performs this order:

1. Complete exact-SHA quality authority and Access E2E validation.
2. Stamp both package versions and verify that the runner has an npm client that supports Trusted Publishing.
3. Build and sign the Dysflow release archive.
4. Run the dry-run, then pack one exact tarball and retain its reported `dist.integrity` value.
5. Exchange the GitHub Actions OIDC identity for a short-lived npm credential and publish that exact tarball.
6. Verify both the exact version and registry `dist.integrity` through `npm view`.
7. Create and verify the GitHub release.

A retry first checks whether the immutable npm version already exists.

It continues only when the registry `dist.integrity` equals the freshly packed candidate; a same-version artifact with different bytes fails closed before the GitHub release.

The workflow never unpublishes automatically. If verification fails after publication, stop the GitHub release and fix forward with a new version; do not reuse or replace published bytes.

### One-time npm bootstrap

npm requires the scoped package to exist before its Trusted Publisher can be configured. The release owner therefore performs the first publication manually from the reviewed, exact release source:

1. Wait for the implementation to be merged, pushed, and green at the exact commit. Do not publish from an implementation worktree.
2. Use `npm login` locally with the owning npm account and complete 2FA.
3. Re-run the package dry-run, pack the approved artifact, and publish that exact tarball with `npm publish <tarball> --access public --registry=https://registry.npmjs.org`.
4. Configure npm Trusted Publishing for repository `DysTelefonica/dysflow` and workflow `.github/workflows/release.yml`.
5. Remove the local npm session when finished. Do not create an `NPM_TOKEN` repository secret.
6. Trigger later releases only after the trusted-publisher identity matches the repository and workflow.

The manual bootstrap is a one-time package-creation exception, not the recurring release path. It requires explicit operator approval after repository gates are green.

No package is published during implementation, review, or testing.

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

After the authorized tag workflow has published the matching npm version:

1. Open a completely new Pi process and session.
2. Install through the canonical owner-aware path: `dysflow install --agents pi --no-tui`.
3. Start another fresh Pi session so package and MCP configuration load from disk.
4. Call `dysflow({ tool: "bootstrap", args: {} })`.
5. Verify visually that the collapsed call and result use the package-owned `⚡ Dysflow` chrome, comparable to Engram's native execution chrome, and that expanding the result exposes the structured Dysflow payload.
6. Record the installed Dysflow/package version and the visual result before closing issue #1723.

If the npm version is not yet published, stop rather than substituting a local path, editing Pi settings, or copying package files.

This acceptance belongs to the fresh consumer session, not to the implementation session.

## Contributor Checklist

- [ ] Keep the package name `@aroman22/dysflow-pi` and its version equal to the root release version.
- [ ] Keep `typebox` at peer range `"*"`; an exact version belongs only in development dependencies.
- [ ] Keep the facade name distinct from `mcp` and `mcp__dysflow`.
- [ ] Keep the package free of `pi.mcp` and `mcp.json`.
- [ ] Preserve the global absolute-launcher MCP entry with `directTools: false`.
- [ ] Cover install, update, owned uninstall, user preservation, conflicts, rollback, and repeated-install identity.
- [ ] Keep collapsed rendering bounded and redacted.
- [ ] Test package commands only through the injected sandbox runner.
- [ ] Run `npm pack --dry-run` and never publish from a development session.
- [ ] Hand off final visual acceptance to a completely new Pi session after remote upload and authorized publication.
- [ ] Update this guide with any Pi integration or release-contract change.

## Navigation

Previous: [Install and verify Dysflow](./SETUP.md) | Next: [Plugin author guide](./PLUGIN-AUTHORS.md)
