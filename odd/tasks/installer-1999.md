# Issue #1999: [Bug]: dysflow install fails with pnpm 12 (ERR_PNPM_LOCKFILE_CONFIG_MISMATCH) and leaves a stale install state
Owner: direct Codex session. Branch: fix/installer-1999. Delivery: single issue PR; forecast under 400 authored lines.
Tests: focused Vitest; no production runtime edits.

## Specs

- S1: "Atacalas todas poco a poco y al final cuando no quede nada pendiente sacamos release"
- S2: Issue acceptance quoted verbatim below.

### Verified symptom

On Windows, `dysflow install` (v4.5.7 release tarball, SHA256 verified) fails while installing the runtime dependencies when the `pnpm.cmd` on PATH is pnpm 12. The install stops after copying `app/`, so:

- `%LOCALAPPDATA%\dysflow\.dysflow-install-state.json` keeps the previous version (`"version": "4.5.4"`) although `dysflow --version` reports `4.5.7`.
- If the previous `app\node_modules` is broken, the runtime stays broken: in our case the 4.5.4 `node_modules` contained MSYS-style symlinks (`/c/Users/<user>/...`), Node threw `ERR_MODULE_NOT_FOUND: Cannot find package 'zod'` and the MCP server closed at start (`MCP error -32000: Connection closed`).

The install step runs `pnpm.cmd install --ignore-scripts --prod --force --frozen-lockfile`. pnpm 12 resolves `autoInstallPeers` differently from the value recorded in `pnpm-lock.yaml` (`settings.autoInstallPeers: true`) and refuses the frozen install. Setting `npm_config_auto_install_peers=true` in the environment does not change the result.

### Reproduction evidence

1. Windows, `pnpm.cmd --version` → `12.16.1` (a `pnpm` shell shim in the same folder reports `10.17.1`).
2. `gh release download v4.5.7 --repo DysTelefonica/dysflow -p 'dysflow-v4.5.7.tar.gz' -p SHA256SUMS`, `sha256sum -c` → OK, extract.
3. In the extracted folder: `pnpm install --prod --frozen-lockfile` (pnpm 10) → OK, then `node dist/cli/index.js install --agents pi --channel stable --no-tui`.

Actual output:

```
pnpm install --ignore-scripts --prod --force --frozen-lockfile failed: Command failed: C:\WINDOWS\system32\cmd.exe /d /s /c pnpm.cmd install --ignore-scripts --prod --force --frozen-lockfile
Error: ERR_PNPM_LOCKFILE_CONFIG_MISMATCH

  × installing dependencies
  ╰─▶ Cannot proceed with the frozen installation. The current
      "settings.autoInstallPeers" configuration doesn't match the value found
      in the lockfile
  help: Update your lockfile using "pnpm install --no-frozen-lockfile"
```

With the old broken `node_modules` still in place, running the same command by hand also failed with `ERR_PNPM_UNKNOWN: rename '...\app\node_modules\zod\node_modules' -> '...\app\node_modules\zod_tmp_<n>\node_modules'`.

Workaround that restored a working 4.5.7 runtime: move `app\node_modules` aside, then in `app\` run
`cmd /c "pnpm.cmd install --ignore-scripts --prod --frozen-lockfile --config.auto-install-peers=true --config.node-linker=hoisted"`.
After that, `dysflow --version` → `4.5.7` and `dysflow mcp` answers `initialize` with `serverInfo.version: 4.5.7`. The install state file still says `4.5.4`.

### Expected behavior

`dysflow install` / `dysflow upgrade` installs the runtime dependencies with any supported pnpm major (or pins the pnpm it needs), completes, and writes `.dysflow-install-state.json` with the installed version. A dependency-install failure should leave the previous runtime usable (or roll back), not a new `app/` with old or missing dependencies and a stale state file.

### RED test plan

- Installer unit test: with a fake pnpm whose frozen install fails on a lockfile settings mismatch unless `--config.auto-install-peers=true` is passed, the install step succeeds and the state file records the new version. Fails today (the step does not pass the setting).
- Installer test: when the dependency install fails, the state file is not left claiming the old version for a new `app/`, and the previous `node_modules` is restored or the command exits non-zero with a clear recovery message.

### Acceptance criteria

- [ ] `dysflow install --agents pi --channel stable --no-tui` succeeds on Windows with pnpm 12 and with pnpm 10.
- [ ] The dependency install passes the lockfile settings explicitly (at least `auto-install-peers`), so the frozen install does not depend on the user's pnpm defaults.
- [ ] `.dysflow-install-state.json` matches `dysflow --version` after a successful install.
- [ ] A failed dependency install leaves a usable runtime or rolls back, and says how to recover.
- [ ] `node_modules` links created by the installer are native Windows junctions, never MSYS-style symlinks.

### Pre-submission checks

- [x] I searched open and closed issues for an equivalent report.
- [x] I removed secrets and private environment details from this report.


## Tasks

- T1: S1-S2, delegated, verified; reason: independent installer and Pi units launched together; parent owns git; implementation commit f35360fe.

## Log

- L1: Explicit Bash and captured output; no coord or agent-coordination.

- L2: RED5 then GREEN106; realpnpm12 exposed ignored package.json overrides. Bounded correction RED2 then GREEN108 and source/test TypeScript/Biome passed. Parent focused spot5/5 passed.
- L3: Independent real nativepnpm10.17.1 and12.16.1 install AND forcedupdate passed; CLI/state versions agree; package/lock bytes unchanged; root/Pi hoisted graphs contain noMSYS links. Baseline10 fullresult differentials identical.
- L4: Both root/Pidependency failure probes preserve complete oldapp/deps/statehash and oldCLI still executes. Machine marker SHA unchanged after finaltests/nativeverification. Fixture isolation includes explicitfakeenvs and applyIntegrationSelection.
- L5: RDD globallyoff; not changed by agent. Risk item5 (installer/runtime promotion).
