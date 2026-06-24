# Update Trust Model

This document describes the security properties of the Dysflow self-update path and the
PowerShell process spawn boundary.

## Update mechanism

The only supported update mechanism is downloading a GitHub Release tar.gz archive and
verifying it against the SHA-256 checksums published in the same release.

| Property | Detail |
|----------|--------|
| Release source | `https://github.com/DysTelefonica/dysflow/releases/download/<tag>/dysflow-<tag>.tar.gz` |
| Integrity check | SHA-256 of the downloaded archive is compared against the matching entry in `SHA256SUMS` (fetched from the same release). Mismatch is a hard error — the install does not proceed. |
| HTTP 404 | If the archive is not available for the requested tag, the downloader throws immediately. There is no silent fallback. |
| No gh CLI fallback | The latest-release lookup uses only the GitHub REST API. There is no `gh` CLI fallback when the API returns non-OK. |
| Checksum bypass | `--skip-checksum` is available for development/testing. It MUST NOT be used in production installs. |

**No git-clone / source-build fallback exists.** The git-clone update path was removed in
commit `499d5e4`. Any attempt to introduce a source-build fallback reintroduces the
supply-chain risk that audit finding #436 identified.

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
| Trust anchor | `RELEASE_SIGNING_PUBLIC_KEY_PEM` (SPKI PEM) embedded in `downloader.ts`. Empty by default. |
| Signature asset | `SHA256SUMS.sig` (base64 detached Ed25519 signature) published in the same release. |
| Verification | `verifyChecksumsSignature(checksums, signatureBase64, publicKeyPem)` — verifies before the hash is matched. |
| Fail-closed | When the key is configured, a missing or invalid signature is a hard error; the update aborts. |
| Disabled state | While the key is empty, verification is skipped and the model is checksum-only (unchanged behavior). |

**To enable release signing (maintainer action required):**

1. Generate the Ed25519 keypair with the helper script:
   ```
   .github/scripts/generate-release-signing-key.sh
   ```
   This writes `dysflow-release.key` (private, keep offline) and `dysflow-release.pub`
   (public, SPKI PEM), and self-verifies the pair.
2. Store the private key as the GitHub Actions secret `RELEASE_SIGNING_KEY`:
   ```
   gh secret set RELEASE_SIGNING_KEY < dysflow-release.key
   ```
   The release workflow (`.github/workflows/release.yml`) already has a **Sign checksums
   (Ed25519)** step that runs only when this secret is present; it signs `SHA256SUMS`,
   self-verifies the signature, and publishes `SHA256SUMS.sig`.
3. Paste the contents of `dysflow-release.pub` into `RELEASE_SIGNING_PUBLIC_KEY_PEM`
   (`src/cli/commands/install/downloader.ts`), commit, and cut a release.

Until step 3 is done the embedded key is empty and the gate is inert by design. Steps 2 and
3 must land together for the first signed release: the secret enables signing, the embedded
public key enables verification. Then delete the local private key copy.

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
