# Delta for access-core-runner

## ADDED Requirements

### Requirement: Child Process Environment Isolation

The system MUST construct the PowerShell child process environment from an
explicit allowlist of Windows system variables drawn from `process.env`, then
overlay caller-supplied `options.env` on top. It MUST NOT propagate the full
host `process.env` to the child.

`POWERSHELL_SYSTEM_ENV_KEYS` MUST be exported from the runner module so callers
and tests can inspect the exact set of forwarded keys.

No new npm dependencies MAY be introduced. Existing call sites MUST NOT require
changes.

#### Scenario: Host secret filtered from child env

- GIVEN `process.env` contains a non-allowlisted variable (e.g. `SECRET_TOKEN=abc`)
- WHEN `spawnPowerShellProcess` builds the child environment
- THEN `SECRET_TOKEN` MUST NOT be present in the child process env

#### Scenario: Caller override always forwarded

- GIVEN `options.env` includes a variable (e.g. `DYSFLOW_ACCESS_PASSWORD=pass`)
- WHEN `spawnPowerShellProcess` builds the child environment
- THEN `DYSFLOW_ACCESS_PASSWORD` MUST be present in the child process env
- AND its value MUST equal the value supplied in `options.env`

#### Scenario: Allowlisted system var forwarded when present on host

- GIVEN `process.env` contains an allowlisted variable (e.g. `SystemRoot=C:\Windows`)
- WHEN `spawnPowerShellProcess` builds the child environment
- THEN `SystemRoot` MUST be present in the child process env

#### Scenario: Allowlisted var absent from host is omitted

- GIVEN an allowlisted variable is not set in `process.env`
- WHEN `spawnPowerShellProcess` builds the child environment
- THEN that variable MUST NOT appear in the child process env
- AND the child env MUST NOT contain an entry with value `undefined`

#### Scenario: Override can supply vars outside the allowlist

- GIVEN `options.env` contains a variable that is NOT in `POWERSHELL_SYSTEM_ENV_KEYS`
- WHEN `spawnPowerShellProcess` builds the child environment
- THEN that variable MUST be present in the child process env
- AND its value MUST equal the value supplied in `options.env`

#### Scenario: POWERSHELL_SYSTEM_ENV_KEYS is a named export

- GIVEN the runner module is imported
- WHEN a consumer reads `POWERSHELL_SYSTEM_ENV_KEYS`
- THEN it MUST be a non-empty readonly array of strings
- AND it MUST include at minimum: `SystemRoot`, `windir`, `PATH`, `PATHEXT`,
  `TEMP`, `TMP`, `USERPROFILE`, `USERNAME`, `COMPUTERNAME`, `LOCALAPPDATA`,
  `APPDATA`, `HOMEDRIVE`, `HOMEPATH`
