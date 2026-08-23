# Update Trust Model

This document describes the security properties of the Dysflow self-update path and the
PowerShell process spawn boundary.

## Update mechanism

The only supported update mechanism is downloading a GitHub Release archive (`tar.gz`),
verifying the Ed25519 signature over `SHA256SUMS`, and then verifying the archive against
the signed SHA-256 checksum entry.

| Property | Detail |
|----------|--------|
| Release source | `https://github.com/DysTelefonica/dysflow/releases/download/<tag>/dysflow-<tag>.tar.gz` |
| Integrity check | SHA-256 of the downloaded archive is compared against the matching entry in `SHA256SUMS` only after `SHA256SUMS.sig` verifies against the embedded Ed25519 public key. Mismatch is a hard error — the install does not proceed. |
| HTTP 404 | If the archive is not available for the requested tag, the downloader throws immediately. There is no silent fallback. |
| No gh CLI fallback | The latest-release lookup uses only the GitHub REST API. There is no `gh` CLI fallback when the API returns non-OK. |
| Checksum bypass | `--skip-checksum` is available for development/testing. It MUST NOT be used in production installs. |

If the release archive is missing, the signature asset is missing/invalid, the checksum entry is absent, or the SHA-256 comparison fails, the update aborts before extraction. Retry after the release asset/checksum/signature is fixed or report the broken release; on `stable` and `beta` there is no source-build or git-clone fallback.

**No git-clone / source-build fallback exists on `stable` or `beta`.** The git-clone update
path was removed in commit `499d5e4`.

Neither channel may degrade into building from source when a download or checksum fails. That
removal was not cosmetic.

A source build reintroduces the supply-chain risk that audit finding #436 identified, and that
risk is unchanged today.

The `main` channel reintroduces a source build deliberately. It is gated behind
`DYSFLOW_ALLOW_INSECURE_UPDATE=1`, is never reachable by default, and verifies nothing.

An operator who sets that variable accepts exactly the risk #436 named: code from the branch
archive is built and executed locally, with no signature and no checksum to detect tampering.

## Archive extraction (tar-slip defense)

Before extracting, the downloader lists the archive entries (`tar -tzf`) and refuses any
entry that is an absolute path (POSIX, Windows drive-letter, or UNC) or contains a `..`
parent segment (`assertSafeArchiveEntries` in `downloader.ts`). This is defense-in-depth:
the archive is already SHA-256 verified, but the guard ensures a tampered or malicious
archive cannot write outside the extraction root even if the system `tar` would allow it.

## Authenticity: SHA256SUMS signature

Integrity (SHA-256) only proves the archive matches whatever `SHA256SUMS` was served from
the release. A compromised publisher controls *both* the archive and `SHA256SUMS`, so the
checksum alone does not establish authenticity. To close that gap the downloader supports a
detached **Ed25519 signature** over `SHA256SUMS`:

| Property | Detail |
|----------|--------|
| Trust anchor | `RELEASE_SIGNING_PUBLIC_KEY_PEM` (SPKI PEM) embedded in `downloader.ts`. This public key is safe to version. |
| Signature asset | `SHA256SUMS.sig` (base64 detached Ed25519 signature) published in the same release. |
| Verification | `verifyChecksumsSignature(checksums, signatureBase64, publicKeyPem)` — verifies before the hash is matched. |
| Fail-closed | A missing signature, invalid signature, or invalid configured public key is a hard error; the update aborts before checksum entries are trusted. |
| Checksum-only escape hatch | Tests and development-only callers may inject an empty signing key or use the explicit insecure checksum bypass. Production updates use the embedded public key. |

**To enable release signing (maintainer action required):**

1. Generate the Ed25519 keypair with the helper script:
   ```
   .github/scripts/generate-release-signing-key.sh
   ```
   By default this writes `dysflow-release.key` (private, keep offline) and
   `dysflow-release.pub` (public, SPKI PEM) to a new temporary directory, not to
   the repository. It self-verifies the pair before printing next steps. You may
   pass an explicit output directory. Do not commit the private key.
2. Store the private key as the GitHub Actions secret `RELEASE_SIGNING_KEY`:
   ```
   gh secret set RELEASE_SIGNING_KEY < dysflow-release.key
   ```
   The release workflow (`.github/workflows/release.yml`) requires this secret before
   publishing; it signs `SHA256SUMS`, self-verifies the signature, and publishes
   `SHA256SUMS.sig`.
3. Paste the contents of `dysflow-release.pub` into `RELEASE_SIGNING_PUBLIC_KEY_PEM`
   (`src/cli/commands/install/downloader.ts`), commit, and cut a release. The public
   key may be committed; the private key must only live in GitHub Secrets / offline
   operator storage.

The current repository key was generated specifically for issue #572, and the matching
private key was installed as the `RELEASE_SIGNING_KEY` GitHub Actions secret. If the secret
is ever rotated, update the embedded public key in the same change. Then delete any local
private key copy.

## Trust across channels

Everything above describes the `stable` channel, which is the default and the only one with a cryptographic trust anchor. Two further channels exist, and each weakens a different link in that chain.

| Channel | Source | Verified against | Establishes |
|---|---|---|---|
| `stable` | `releases/latest` | Ed25519 signature over `SHA256SUMS`, then SHA-256 of the archive | Integrity and authenticity |
| `beta` | Newest prerelease release tarball | SHA-256 against the published `SHA256SUMS` | Integrity only |
| `main` | `archive/refs/heads/main.tar.gz` | Nothing | Neither |

Operator recipes for each channel live in [installation channels](../installation-channels.md). This section covers only what each one is worth trusting.

### Why beta and main are gated

Both non-stable channels require `DYSFLOW_ALLOW_INSECURE_UPDATE=1`. The gate is the one that already guards `--skip-checksum`, in `src/cli/commands/install/updater.ts`.

The variable is satisfied by `1` or `true`, matched case-insensitively. Anything else fails closed and the install does not proceed.

The gate exists because these channels cannot fail closed on authenticity the way `stable` does. It converts a silent downgrade in trust into a deliberate, auditable act by the operator.

### stable: signature trust

`stable` is the only channel where a forged archive is detectable. Integrity alone is insufficient, because a publisher who controls the archive also controls `SHA256SUMS`.

The detached Ed25519 signature closes that gap: the archive is trusted only after `SHA256SUMS.sig` verifies against the embedded public key. A tampered mirror cannot forge one.

Threat covered: a compromised release host, a hostile network position, and a corrupted download.

### beta: SHA-256 trust

`beta` verifies the archive against the published `SHA256SUMS`, but does not require a signature over that manifest. A corrupted or truncated download still fails closed.

Threat covered: transport corruption and an incomplete download.

Threat not covered: an attacker who can publish or rewrite the release assets. Such an attacker serves a matching manifest alongside a malicious archive, and the checksum agrees.

### main: unsigned and unverified

`main` has no cryptographic verification at any step. GitHub publishes no `SHA256SUMS` for branch archives, and their bytes are not reproducible, so there is no fixed digest to compare.

The runtime is built locally from the downloaded source. Anyone able to influence the branch, the archive endpoint, or the connection influences what executes on the operator's machine.

Threat covered: none.

In practice, installing from `main` runs unreviewed code with the operator's own privileges. It is a development affordance, not a distribution channel.

### Operator guidance

Use `stable` for anything that matters. Reach for `beta` to validate a release candidate, and for `main` only to reproduce a change that has not shipped.

Return to `stable` when the test is finished. `dysflow doctor` reports the active channel and warns when it is not `stable`, so a weakened machine stays visible.

## Authentication for GitHub API requests

The `resolveLatestRelease` function reads `GH_TOKEN` or `GITHUB_TOKEN` from the
environment and includes it as a Bearer token in GitHub API and asset download requests.
If no token is present, requests are made unauthenticated (public releases only).
Tokens are read from the environment at call time and are NOT forwarded to any spawned
child process (see env sandbox below).

## PowerShell spawn trust model

All PowerShell (and Access runner) processes are launched through
`spawnPowerShellProcess` in `src/core/runner/powershell-executor.ts`.

### shell: false — no shell-metacharacter injection

The `spawn` call uses `shell: false` and receives `args` as a `readonly string[]`.
The OS receives the executable path and each argument as a discrete value; no shell
parses the argument list. Shell metacharacters (spaces, quotes, pipes, semicolons,
backticks) in argument values are therefore inert and cannot inject additional commands.

Callers that supply externally-derived values in `args` (e.g. user-supplied SQL,
file paths from config) remain responsible for validating those values before passing
them to the spawn call. `shell: false` eliminates shell injection at the OS boundary;
it does not validate argument semantics.

### Environment sandbox

The child process inherits only the keys listed in `POWERSHELL_SYSTEM_ENV_KEYS`:

```
SystemRoot, windir, PATH, PATHEXT, TEMP, TMP, USERPROFILE, USERNAME,
COMPUTERNAME, LOCALAPPDATA, APPDATA, HOMEDRIVE, HOMEPATH, HOME, USER
```

All other host variables — API tokens, secrets, credentials — are excluded from the
child's environment unless the caller explicitly passes them via `options.env`. The
`buildChildEnv` function enforces this allowlist; callers cannot accidentally forward
the full host environment by omission.

## Callers

| Caller | File | Args source |
|--------|------|-------------|
| `AccessRunner` | `buildPowerShellArguments` in `src/core/runner/access-runner.ts` | Built as a `string[]` from typed config + fixed script paths |
| `VbaSyncAdapter` | `spawnVbaManager` in `src/adapters/vba-sync/vba-sync-adapter.ts` (arg array is the first 10 lines of the executor) | Built as a `string[]` from typed config + fixed script paths |

Both callers construct argument arrays from typed configuration values and known script
paths, not from raw user input.
