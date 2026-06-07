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
| `AccessRunner` | `src/core/runner/access-runner.ts:596-608` | Built as a `string[]` from typed config + fixed script paths |
| `VbaSyncAdapter` | `src/adapters/vba-sync/vba-sync-adapter.ts:524-531` | Built as a `string[]` from typed config + fixed script paths |

Both callers construct argument arrays from typed configuration values and known script
paths, not from raw user input.
