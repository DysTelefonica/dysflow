# Incident — OpenCode cannot connect to the Dysflow MCP (2026-05-30)

> Living handoff doc. Any agent can resume from here. Update the checkboxes as you go:
> `[ ]` todo · `[~]` in progress · `[x]` done. Keep the "Current state" line accurate.

**Current state:** LOCAL FIX DONE & VERIFIED (both repos handshake OK, 48 tools). Pending: user restarts OpenCode; Phase 2 (remote doctor check) not started.

---

## Symptom

OpenCode fails to connect to the `dysflow` MCP server. Reported specifically in repo
`C:\00repos\codigo\00_NO_CONFORMIDADES_staging` (and the sibling `00_NO_CONFORMIDADES`).

## Root cause (CONFIRMED)

OpenCode merges global + project-local config; **project-local MCP config wins**. Both affected
repos have a project-local `opencode.json` that overrides the `dysflow` MCP `command` with a
**dead entrypoint from the pre-SDK architecture**:

```json
"command": ["node", "C:\\Proyectos\\dysflow\\skills\\dysflow\\mcp.js"]
```

`C:\Proyectos\dysflow\skills\dysflow\mcp.js` does not exist (there is no `skills/` dir in the
repo anymore — the entrypoint is `dist/cli/index.js`). OpenCode spawns a process against a
missing file → the MCP never initializes → "cannot connect".

### Ruled out (verified healthy)
- Installed runtime MCP server starts and answers `initialize` correctly (v1.1.0, Node 25.2.1).
- `@modelcontextprotocol/sdk` and its deps are present in the runtime `node_modules`.
- The canonical shim `C:\Users\adm1\AppData\Local\dysflow\bin\dysflow.cmd mcp` works (returns a
  valid `initialize` result).
- The **global** OpenCode config (`~/.config/opencode/opencode.json`) is correct — it points at
  the working `dysflow.cmd`.

### Secondary problems in the same stale files
- `NODE_PATH` → `C:\Proyectos\dysflow\skills\access-vba-sync\node_modules` (DEAD path).
- Plaintext password `ACCESS_VBA_PASSWORD: "dpddpd"` (files are gitignored/untracked, so **not**
  leaked to git — local risk only).
- Redundant `ACCESS_DB_PATH` / `ACCESS_FRONTEND_PATH` / `ACCESS_BACKEND_PATH` env vars that the
  current dysflow does not read (it resolves paths from `.dysflow/project.json`).
- Who wrote them: a **legacy PowerShell setup script** (BOM + `ConvertTo-Json` formatting). The
  current `dysflow install` only writes the GLOBAL config (`agent-config.ts`), never per-repo —
  so current dysflow is not the culprit.

## Affected files (scan of `C:\00repos\codigo`, maxdepth 3, excl. node_modules)
- [x] `C:\00repos\codigo\00_NO_CONFORMIDADES\opencode.json` — broken (dead command)
- [x] `C:\00repos\codigo\00_NO_CONFORMIDADES_staging\opencode.json` — broken (dead command)
- [x] No other `opencode.json` found under `C:\00repos\codigo`

---

## Phase 1 — Stabilize LOCAL (priority)

Target clean shape per project-local `opencode.json` (point at the working shim, drop dead/noise
entries, keep the per-project password since the DB is password-protected and the file is
gitignored):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "dysflow": {
      "command": ["C:/Users/adm1/AppData/Local/dysflow/bin/dysflow.cmd", "mcp"],
      "type": "local",
      "enabled": true,
      "env": { "ACCESS_VBA_PASSWORD": "dpddpd" }
    }
  }
}
```

- [x] Back up both files (`.bak-mcp-fix-2026-05-30`) before editing
- [x] Repair `00_NO_CONFORMIDADES_staging\opencode.json`
- [x] Repair `00_NO_CONFORMIDADES\opencode.json`
- [x] Verify: launch `dysflow.cmd mcp` with cwd = each repo — `initialize` OK + `tools/list` returns 48 tools (both repos)
- [ ] Tell the user to restart OpenCode (MCP processes are spawned at startup; config is read once)

## Phase 2 — Fix REMOTE (so a future release install surfaces/avoids this)

The current installer does not write these stale files, so there is nothing to "stop writing".
The durable remote fix is **detection**: make `dysflow doctor` flag an OpenCode `dysflow` MCP
command whose entrypoint does not exist, so a dead override becomes an actionable diagnostic
instead of a silent connection failure.

- [x] Decide scope with user: **doctor warning only** (no `--fix`)
- [x] (TDD) Add failing test → `test/cli/commands/opencode-mcp-wiring.test.ts` (12 tests)
- [x] Implement: new `src/cli/commands/opencode-mcp-wiring.ts` (pure, injectable fs) + wired into `src/cli/commands/doctor.ts`; `CliCommandContext.checkMcpWiring` added in `types.ts`
- [x] `pnpm test` (705 passed) + `pnpm build` green. `pnpm lint` has 2 **pre-existing** CRLF errors in `extractor.ts` + `access-runner.test.ts` (NOT in this diff — verified via git status); new files are Biome-clean
- [ ] CHANGELOG entry
- [ ] Ship in next release; verify on install
- [ ] (separate) Fix the 2 pre-existing CRLF lint errors so `pnpm lint` is green on Windows

## Cleanup (user asked: "limpia lo que no deba estar en local")
- [ ] Confirm with user before deleting the pile of `~/.config/opencode/opencode.json.bak-*` backups (10+ stale backups)
- [ ] Remove temp `.bak-mcp-fix-*` files once the fix is verified and accepted

---

## Evidence log
- Runtime dir: `C:\Users\adm1\AppData\Local\dysflow` (app/dist, app/node_modules, bin shims). Version 1.1.0 (repo is at 1.2.2 — runtime is one minor behind, unrelated to this incident).
- Global config dysflow block: `command: ["C:/Users/adm1/AppData/Local/dysflow/bin/dysflow.cmd","mcp"]` — correct.
- `initialize` response from shim: `{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"dysflow","version":"1.1.0"}}`.
