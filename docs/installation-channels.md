# Installation channels

`dysflow install` and `dysflow update` accept `--channel {stable|beta|main}`. The default is `stable`, and every command shape that omits `--channel` keeps its current behaviour.

[Back to documentation index](../DOCS.md)

## When to use which

| Channel | Use it when | Verification | Prerequisite gate |
|---|---|---|---|
| `stable` | Production and everyday use. | Ed25519 signature over `SHA256SUMS`, then SHA-256 of the archive. | None |
| `beta` | You are validating a release candidate before it is promoted. | SHA-256 against the published `SHA256SUMS`. No signature is required. | `DYSFLOW_ALLOW_INSECURE_UPDATE=1` |
| `main` | You are testing a change that is not part of any release. | None. The archive is unverified by design. | `DYSFLOW_ALLOW_INSECURE_UPDATE=1` |

Pick `stable` unless you have a reason not to. The other channels trade verification for reach, and [the trust model](./security/update-trust-model.md) explains what each gives up.

## What install and update each do

The flag does not mean the same thing on both commands. Read this before assuming that `install` fetches anything.

| Command | `stable` | `beta` and `main` |
|---|---|---|
| `dysflow install` | Installs the package the invoked CLI was started from. No download. | Downloads from the network, then installs. |
| `dysflow update` | Downloads the latest published release. | Downloads from the network, then installs. |

`dysflow install` and `dysflow install --channel stable` do not reach the network. They install the package the running CLI was started from, which is the existing behaviour and is unchanged.

An operator who wants the latest published build wants `dysflow update`. That command fetches on every channel.

## Channel resolution order

Dysflow resolves the active channel from the first source that supplies one:

1. The explicit `--channel <name>` flag.
2. The `DYSFLOW_CHANNEL` environment variable.
3. The channel persisted in `<runtimeDir>/.dysflow-install-state.json`.
4. The `stable` default.

Both `--channel <name>` and `--channel=<name>` are accepted. Values are trimmed and lowercased, so a padded or capitalised value still resolves.

An empty or whitespace-only `DYSFLOW_CHANNEL` is ignored rather than rejected. Resolution falls through to the next source.

The persisted value is what makes `dysflow update` sticky: once you install from a channel, later updates stay on it until you switch deliberately.

## Stable channel

This is the default and the only channel with a cryptographic trust anchor:

```text
dysflow install
dysflow update
```

Naming the channel explicitly is equivalent, and is worth doing in scripts so the intent survives a change of environment:

```text
dysflow install --channel stable
```

`--skip-checksum` is accepted on `stable` only. It still requires `DYSFLOW_ALLOW_INSECURE_UPDATE=1`, which is the same guard that protects it today in `src/cli/commands/install/updater.ts`.

## Beta channel

The `beta` channel resolves the newest prerelease tag and downloads its release tarball together with the published `SHA256SUMS`. Accepted tag shapes are `rc`, `beta`, `alpha`, and `prerelease`:

```text
v2.39.0-rc.1
v2.39.0-beta.3
v2.39.0-alpha.2
```

Because prereleases are not signed, the channel is gated:

```text
$env:DYSFLOW_ALLOW_INSECURE_UPDATE = "1"
dysflow install --channel beta
```

The archive is still checked against the published manifest, so a corrupted download fails closed. What you give up is authenticity: nothing proves the manifest came from the maintainers.

## Development channel (main)

**Unreleased development channel — use only to test changes that are not part of a release.**

The `main` channel downloads `https://github.com/DysTelefonica/dysflow/archive/refs/heads/main.tar.gz` and builds the runtime locally from source:

```text
$env:DYSFLOW_ALLOW_INSECURE_UPDATE = "1"
dysflow install --channel main
```

This channel has no cryptographic verification at all. GitHub publishes no `SHA256SUMS` for branch archives, and their bytes are not reproducible, so there is nothing to verify against.

The build runs `pnpm install --ignore-scripts --frozen-lockfile` and then `pnpm run build`. A working pnpm toolchain is a hard prerequisite for this channel, and for no other.

Treat it as running unreviewed code on your machine. Use it to reproduce a fix before it ships, then return to `stable`.

## Switching channels

`dysflow update` refuses to move a runtime between channels unless you say so. Pass `--force` to confirm the switch:

```text
$env:DYSFLOW_ALLOW_INSECURE_UPDATE = "1"
dysflow update --channel beta --force
```

Without `--force` the command fails with `DYSFLOW_CHANNEL_PIN_REQUIRES_FORCE` and changes nothing. Updating within the same channel never needs the flag.

## Install state

Each install records what it produced in `<runtimeDir>/.dysflow-install-state.json`:

```json
{
  "channel": "stable",
  "version": "2.38.2",
  "commitSha": "abc123",
  "installedAt": "2026-08-23T17:00:00.000Z"
}
```

The file is two-space JSON with a trailing newline. `installedAt` is an ISO-8601 timestamp carrying milliseconds.

`commitSha` is omitted entirely when the commit is unknown. It is never written as `null` or as an empty string, so read it as an optional key.

## Checking the active channel

`dysflow doctor` prepends the active channel to its report, naming the source that decided it:

```text
Dysflow install channel: stable (source: default)
```

The source is one of `flag`, `env`, `state`, or `default`, matching the resolution order above. On `beta` and `main` a second line follows:

```text
WARN: insecure channel, expect breakage
```

`doctor --help` lists `[--channel stable|beta|main]` alongside its other options.

## What update prints

On `main`, the usual upgrade line is replaced so the build is never mistaken for a release:

```text
Dysflow runtime update: installed main channel build v<version> (unverified development build)
```

Non-stable commands also print a leading `Dysflow install channel: <channel> (source: <source>)` line.

Stable output is byte-identical to previous releases. Nothing about the default path changed, which is the backward-compatibility promise of this feature.

## Error codes

These are the failures specific to channel selection. Every one ends its message with a pointer to `docs/security/update-trust-model.md`, so an operator is always sent to the reasoning.

| Code | Trigger | Next action |
|---|---|---|
| `DYSFLOW_UNKNOWN_CHANNEL` | The requested channel is not `stable`, `beta`, or `main`. | Retry with one of the three supported names. |
| `DYSFLOW_SKIP_CHECKSUM_REQUIRES_STABLE_CHANNEL` | `--skip-checksum` was combined with `beta` or `main`. | Drop the flag. Those channels enforce their gate differently. |
| `DYSFLOW_INSECURE_GATE_MISSING` | `beta` or `main` was requested without the gate. | Set `DYSFLOW_ALLOW_INSECURE_UPDATE=1`, after reading what the channel gives up. |
| `DYSFLOW_CHANNEL_PIN_REQUIRES_FORCE` | `update` requested a channel other than the persisted one. | Re-run with `--force` if the switch is intended. |
| `DYSFLOW_PRERELEASE_TAG_NOT_FOUND` | `beta` was requested and no tag matched the prerelease shapes. | Wait for a prerelease to be published, or use `stable`. |

The gate is satisfied by `1` or `true`, matched case-insensitively.

The table is ordered by the order the checks run: unknown channel, then `--skip-checksum`, then the insecure gate, then the channel pin.

That order matters when reproducing a failure. On `beta` or `main`, `DYSFLOW_CHANNEL_PIN_REQUIRES_FORCE` is unreachable unless `DYSFLOW_ALLOW_INSECURE_UPDATE=1` is already set: the gate fails first.

## Rolling back

There is no in-place downgrade. To return a machine to the stable runtime, remove the installed runtime and install again:

```text
dysflow uninstall
dysflow install --channel stable
```

`dysflow uninstall` reverts the adapter integrations and removes the runtime directory recursively, in `src/cli/commands/uninstall.ts`.

The install state lives inside that directory, so it is discarded with it. The following `install` writes a fresh state pinned to `stable`.

Because `install` does not download, this restores the runtime the invoked CLI carries. Run `dysflow update` afterwards to move to the latest published release.

Verify the result before trusting it:

```text
dysflow --version
dysflow doctor
```

## Related documentation

- [Update trust model](./security/update-trust-model.md) — what each channel proves, and the threat model behind the gate.
- [Install and verify Dysflow](./SETUP.md) — first-time setup and project configuration.
- [Error-code reference](../references/error-codes.md) — canonical meaning and remediation for every code.
