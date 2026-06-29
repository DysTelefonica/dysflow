# Delta for product-cli

## ADDED Requirements

### Requirement: Update Path MUST Verify SHA-256 and MUST NOT Fall Back to Source Build

The Dysflow self-update mechanism MUST download a GitHub Release tar.gz archive and
verify it against the SHA-256 checksums published in the same release before installing.
There MUST be no source-build or git-clone fallback path. If the release archive is
unavailable (HTTP 404), the update MUST fail with a hard error.

#### Scenario: Archive download and checksum verification

- GIVEN the user runs `dysflow update` (or `dysflow install`)
- WHEN the release package is prepared
- THEN the runtime MUST download the tar.gz archive from the GitHub Release
- AND MUST fetch `SHA256SUMS` from the same release
- AND MUST compute the SHA-256 hash of the downloaded archive
- AND MUST compare it against the expected hash from `SHA256SUMS`
- AND MUST fail with an actionable error if the hashes do not match
- AND MUST NOT proceed with installation after a checksum mismatch

#### Scenario: Archive not available (HTTP 404)

- GIVEN the target release tag exists but the archive asset is absent
- WHEN the downloader attempts to fetch the archive
- THEN the runtime MUST throw immediately with an error indicating HTTP 404
- AND MUST NOT attempt any fallback download or source build

#### Scenario: No git-clone fallback

- GIVEN the update command runs under any conditions (network error, 404, auth failure)
- WHEN the archive download fails
- THEN the runtime MUST surface a clear error to the user
- AND MUST NOT attempt to `git clone` the repository as a fallback
- AND MUST NOT attempt to build from source as a fallback

### Requirement: PowerShell Spawn MUST Use shell:false and an Env Allowlist

All PowerShell and Access runner processes spawned by `spawnPowerShellProcess` MUST be
launched with `shell: false` (args as an array, not a shell-interpolated string) and
MUST inherit only the keys listed in `POWERSHELL_SYSTEM_ENV_KEYS` from the host
environment.

#### Scenario: Spawn uses shell:false

- GIVEN `spawnPowerShellProcess` is called with any `args` array
- WHEN the OS `spawn` call is made
- THEN it MUST receive `shell: false` in the spawn options
- AND each element of `args` MUST be passed as a discrete argument, not as a
  shell-interpolated string

#### Scenario: Host secrets are not forwarded

- GIVEN the host environment contains variables outside `POWERSHELL_SYSTEM_ENV_KEYS`
  (e.g. API tokens, passwords, arbitrary secrets)
- WHEN `spawnPowerShellProcess` is called without an explicit `options.env` override
- THEN the child process environment MUST NOT contain those variables
- AND only the allowlisted system keys that are present in the host environment SHALL
  be forwarded

#### Scenario: Caller-supplied env overrides are forwarded

- GIVEN the caller passes `options.env` with specific key-value pairs
- WHEN the child process is spawned
- THEN those key-value pairs MUST be present in the child process environment
- AND the allowlist filtering MUST still exclude non-override, non-allowlisted host keys
