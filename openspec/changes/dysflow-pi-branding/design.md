# Design: dysflow-pi-branding — Pi-native Dysflow facade

> Issue #1723 · Branch `fix/issue-1723-pi-native-rendering` (HEAD `f7b94a3f`)
> · Strict TDD. Implementation is already in the working tree; this design
> records the contract for the spec and the apply-phase audit. `gentle-pi` is
> not modified.

## Technical Approach

Two independent surfaces, joined by the npm package boundary:

- **`plugin/pi/`** is a self-contained npm package (`@aroman22/dysflow-pi`)
  that registers one native Pi tool named `dysflow`. Every call is delegated
  through the official Dysflow MCP stdio boundary. The package never registers
  a second MCP and never embeds MCP schemas.
- **`src/cli/commands/install/`** owns the integration: `mcp-configurator.ts`
  writes a managed `directTools: false` MCP entry into `~/.pi/agent/mcp.json`;
  `pi-package-manager.ts` reconciles the npm spec in
  `~/.pi/agent/settings.json` and records ownership at
  `<runtimeDir>/.dysflow-pi-package.json`. `install.ts` and `updater.ts` wrap
  both with a snapshot+rollback pair so a package-step failure can never leave
  the user with a partial Pi state.

The compatibility path is the MCP server behind `directTools: false`: the
launcher is the same absolute path the installer-managed entry points at, so
diagnostic tooling can still reach `dysflow mcp` through MCP while Pi's native
tool inventory exposes only the `dysflow` facade.

## Architecture Decisions

### Decision: One native facade, one managed MCP entry, no overlap

**Choice**: `plugin/pi/index.ts` registers a single native tool whose `name` is
literally `"dysflow"` (`plugin/pi/native-tool.ts:46`); `mcp-configurator.ts`
writes a single MCP entry named `dysflow` with `directTools: false`
(`mcp-configurator.ts:112-118`). The npm package ships no `pi.mcp` field and no
`mcp.json` (`plugin/pi/package.json`).
**Alternatives**: register two native tools (one per MCP operation); embed MCP
schemas in the npm package.
**Rationale**: A single facade is the smallest surface that satisfies the
acceptance criterion ("`dysflow({ tool: "bootstrap", args: {} })`"); embedding
schemas would create drift between the bundled copy and the live runtime;
exposing two tools would force callers to pick between `mcp__dysflow` and the
facade, breaking the "one canonical way" contract.

### Decision: Chrome prefix is `⚡ Dysflow · <operationLabel>`, never includes args

**Choice**: `plugin/pi/dysflow-tool-chrome.ts` exposes `operationLabel(toolName,
args)` which reads `args.moduleNames.length` for `import_modules` /
`export_modules` and otherwise returns a fixed verb phrase. `renderDysflowCallText`
returns `⚡ Dysflow · <label>…`. `renderDysflowResultText` returns
`↳ <compactStatus>` and includes the structured payload only when
`options.expanded === true`. `isError` collapses to `"✗ Dysflow failed"`
(`dysflow-tool-chrome.ts:85`).
**Alternatives**: surface the original MCP operation name verbatim; include a
human-friendly summary of `args`; pass through MCP error text.
**Rationale**: Verbatim names leak the operation surface; args contain paths
and secrets; raw MCP error text is unbounded. The bounded label is comparable
to Engram's native chrome and is what the clean-Pi acceptance ritual verifies
visually (`docs/pi-native-integration.md:158-171`).

### Decision: Facade name validation is local; transport is the live MCP

**Choice**: `native-tool.ts:60` validates `params.tool` against
`/^[a-z][a-z0-9_]{0,63}$/` and throws a bounded error if the regex fails.
Schema validation for the operation arguments stays on the live Dysflow MCP
server, accessed through `dysflow-mcp-client.ts`'s
`DysflowMcpPort.callTool(name, args, { signal, onProgress })`. The Typebox
parameter shell in `plugin/pi/index.ts:23-30` is `{ tool: Type.String, args:
Type.Optional(Type.Record(Type.String(), Type.Unknown())) }`.
**Alternatives**: embed every MCP tool's Zod schema in the npm package; do
client-side schema validation in the facade.
**Rationale**: Embedding schemas creates drift and bloats the npm payload;
client-side validation would diverge from the runtime. The facade stays a thin
delegate.

### Decision: Launcher resolution honours `DYSFLOW_BIN` → `DYSFLOW_HOME` → marker → default

**Choice**: `dysflow-mcp-client.ts:30-66` (`resolveDysflowCommand`) reads, in
order: `DYSFLOW_BIN` (must be absolute; relative throws), `DYSFLOW_HOME`, the
system marker at `%ProgramData%/dysflow/.dysflow-marker` (or
`DYSFLOW_RUNTIME_MARKER_PATH`), and falls back to
`%LOCALAPPDATA%/dysflow`. The final path is `<runtimeDir>/bin/dysflow.cmd` on
win32. `dysflowChildEnvironment` drops `undefined` env entries
(`dysflow-mcp-client.ts:68-74`) so the child sees the operator's auth vars.
**Alternatives**: hardcode `%LOCALAPPDATA%/dysflow`; rely on PATH.
**Rationale**: Hardcoding breaks the rolling `main` channel's "whatever HEAD
builds to" promise; relying on PATH is fragile on Windows. The marker is
written by `writeRuntimeMarker` in `extractor.ts` and is the source of truth
on the operator's machine.

### Decision: MCP compatibility path uses `directTools: false`

**Choice**: `mcp-configurator.ts:112-118` writes `{ command, args: ["mcp"],
directTools: false, type: "local", lifecycle: "lazy" }`. `mcp-configurator.ts:104-107`
normalises any future reconciliation to `directTools === false`.
**Alternatives**: expose the MCP server as a Pi tool inventory entry
(`directTools: true`); drop the MCP entry and rely solely on the npm package.
**Rationale**: `directTools: false` keeps the MCP server reachable for
diagnostics (`dysflow doctor` and similar) without adding a second native tool
to Pi's inventory. Dropping the MCP entry entirely would force the operator
to fall back to raw stdio when debugging.

### Decision: Version is pinned to the root release; `typebox` is a peer dep

**Choice**: `plugin/pi/package.json` pins `version: "4.3.2"` equal to the root
release (`@aroman22/dysflow-pi@4.3.2` — see `docs/pi-native-integration.md:18`).
`typebox` is `peerDependencies: "*"` and NOT a `dependencies` entry
(`pi-native-package-1723.test.ts:76-77` asserts both).
**Alternatives**: version the npm package independently; pin `typebox` to an
exact version.
**Rationale**: Pinning the npm package to the root release guarantees the
facade matches the MCP contract it talks to; an exact `typebox` pin would
duplicate Pi's own bundled version and inflate the install.

### Decision: npm spec reconciliation is ownership-aware, with 8 explicit branches

**Choice**: `pi-package-manager.ts:122-201` (`reconcilePiPackage`) implements
the eight branches documented in `explore.md`. The ownership record at
`<runtimeDir>/.dysflow-pi-package.json` (`{ packageName, spec, version, owned:
true }`) is the single source of truth for "Dysflow owns this install".
**Alternatives**: trust `settings.json` alone; trust a sentinel file in `~/.pi/`.
**Rationale**: A file under `<runtimeDir>` survives `dysflow update` in place
and is co-located with the runtime it describes. Settings alone is ambiguous
when a user pre-installs the package manually; a sentinel in `~/.pi/` couples
runtime identity to global state.

### Decision: Install + update are transactional; uninstall refuses to remove user installs

**Choice**: `install.ts:131-160` and `updater.ts:78-98` snapshot the Pi MCP
bytes (`capturePiIntegration`) BEFORE `reconcilePiPackage`; on package failure
they `restorePiIntegration`. `pi-package-manager.ts:156-163` refuses to
overwrite a pre-existing user install (`"Pi already has a pre-existing Pi
package for @aroman22/dysflow-pi; Dysflow left it unchanged."`).
`pi-package-manager.ts:145-154` only removes when the ownership record matches
the current Pi settings.
**Alternatives**: install the npm package without snapshotting MCP; rely on
the user to fix a partial state manually.
**Rationale**: The user-visible acceptance is "clean-Pi activation". A partial
state is the bug we are paying to avoid.

### Decision: `gentle-pi` is not modified

**Choice**: No file in this change references `gentle-pi`. The npm package
lives in `~/.pi/agent/npm/` (Pi's canonical location); Dysflow only edits
`~/.pi/agent/{mcp,settings}.json` plus its own ownership record at
`<runtimeDir>/.dysflow-pi-package.json`.
**Alternatives**: clone `gentle-pi` and register the plugin through its
extension surface; fork `gentle-pi`.
**Rationale**: Cloning or forking couples Dysflow's release cadence to
`gentle-pi`'s and forces the operator to track two package streams. The npm
package is the upstream-stable way to add Pi extensions.

## Data Flow

### Install (`dysflow install --agents pi --no-tui`)

    `install.ts:108-229 applyIntegrationSelection`
       ├── installRuntime(...)                              # writes the Dysflow runtime
       ├── for agent === "pi":
       │     ├── capturePiIntegration(mcpConfigPath)         # snapshot
       │     ├── configureAgent("pi", ..., commandPath)      # reconcilePiIntegration → mcp.json
       │     └── reconcilePiPackage({ packageVersion })      # settings.json + ownership
       │           └── on error: restorePiIntegration        # rollback the snapshot
       └── installBundledSkills / refreshBundledAgentPlugins

### Bootstrap inside Pi

    `plugin/pi/index.ts:53 session_start`
       └── ctx.ui.setStatus("dysflow", "⚡ Dysflow · ready")

    Pi user → dysflow({ tool: "bootstrap", args: {} })
       ├── pi.registerTool.renderCall(args, theme, ctx)
       │     └── native.renderCallText(tool, args)
       │           └── operationLabel(tool, args)            # args only read for count
       │                 → "⚡ Dysflow · bootstrap…"
       ├── native.execute(toolCallId, params)
       │     ├── validate(params.tool)
       │     ├── setStatus("⚡ Dysflow · running")
       │     ├── mcpClient.callTool("bootstrap", {}, { signal, onProgress })
       │     │     └── <absolute-launcher> mcp stdio
       │     │           └── Dysflow MCP server
       │     └── setStatus("⚡ Dysflow · ready")
       └── pi.registerTool.renderResult(result, options, theme, ctx)
             └── native.renderResultText(tool, result, options)
                   → "↳ ✓ ready" (collapsed)
                   → "↳ ✓ ready\n\n{...structuredContent}" (expanded)

### Update (`dysflow update`)

    `updater.ts:347 handleUpdateCommand`
       ├── provider.resolveLatestRelease()
       ├── provider.preparePackage + installRuntime          # new runtime on disk
       └── refreshInstalledPiIntegration(runtimeDir, landedVersion, env)
             ├── capturePiIntegration(mcpConfigPath)          # snapshot
             ├── reconcilePiIntegration                       # refresh MCP command + directTools
             ├── reconcilePiPackage({ packageVersion })       # upgrade the npm pin
             │     └── on error: restorePiIntegration         # rollback
             └── return result

### Uninstall (`dysflow uninstall` for `--agents pi`)

    `install.ts:165-198 applyIntegrationSelection` (pi NOT selected)
       ├── capturePiIntegration(mcpConfigPath)
       ├── reconcilePiIntegration({ mode: "remove" })
       └── reconcilePiPackage({ mode: "remove" })
             └── only if ownership record === current Pi spec; otherwise no-op

## File Changes

| File | Action | Description |
|---|---|---|
| `plugin/pi/index.ts` | Create | Default-exported extension; one `pi.registerTool` + `session_start` + `session_shutdown`. |
| `plugin/pi/native-tool.ts` | Create | Native tool factory: `name: "dysflow"`, name validation, execute closure, status hooks. |
| `plugin/pi/dysflow-tool-chrome.ts` | Create | `operationLabel`, `renderDysflowCallText`, `compactDysflowResultStatus`, `renderDysflowResultText`. |
| `plugin/pi/dysflow-mcp-client.ts` | Create | `resolveDysflowCommand`, `dysflowChildEnvironment`, `createDysflowMcpClient`. |
| `plugin/pi/package.json` | Create | `@aroman22/dysflow-pi@4.3.2`, `pi.extensions`, `pi.image`, no `pi.mcp`, `typebox` peer. |
| `plugin/pi/tsconfig.json` | Create | `strict: true`, `noEmit: true`, `NodeNext`, `types: ["node"]`. |
| `plugin/pi/README.md` | Create | Public README. |
| `plugin/pi/assets/dysflow-pi.png` | Create | Icon referenced by `pi.image` URL. |
| `src/cli/commands/install/mcp-configurator.ts` | Modify | `reconcilePiIntegration` (managed entry, `directTools: false`); `configureAgent("pi", …)` branch. |
| `src/cli/commands/install/pi-package-manager.ts` | Create | npm-spec manager + ownership record. |
| `src/cli/commands/install/updater.ts` | Modify | `refreshInstalledPiIntegration` (snapshot + reconcile MCP + reconcile package + rollback). |
| `src/cli/commands/install.ts` | Modify | `applyIntegrationSelection` wires the same snapshot+rollback for `pi`. |
| `src/cli/commands/install/agent-config.ts` | Modify | `AgentName` includes `pi`; `resolveAgentConfigPaths` exposes `~/.pi/agent/{mcp,settings}.json`. |
| `test/quality-gates/pi-native-package-1723.test.ts` | Create | Chrome / manifest / launcher / facade / bounded-error / pack. |
| `test/cli/commands/install/pi-integration-1723.test.ts` | Create | MCP reconciliation + source-text pins for transactional wrappers. |
| `test/cli/commands/install/pi-package-manager-1723.test.ts` | Create | All 8 branches of `reconcilePiPackage`. |
| `docs/pi-native-integration.md` | Create | Operator source of truth. |
| `CHANGELOG.md` `[Unreleased]` | Modify | Line 115 records the entry. |

## Interfaces / Contracts

```ts
// plugin/pi/native-tool.ts
export type DysflowFacadeInput = {
  tool: string;
  args?: Record<string, unknown>;
};
export function createDysflowNativeTool(options: {
  callTool: DysflowMcpPort["callTool"];
  setStatus?: (text: string | undefined) => void;
}): {
  name: "dysflow";
  label: "Dysflow";
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  execute(toolCallId, params, signal?, onUpdate?): Promise<{ content: PiContent[]; details: { mcpResult: DysflowMcpResult } }>;
  renderCallText: typeof renderDysflowCallText;
  renderResultText: typeof renderDysflowResultText;
};

// plugin/pi/dysflow-mcp-client.ts
export type DysflowMcpPort = {
  callTool(name: string, args: Record<string, unknown>, options?: {
    signal?: AbortSignal;
    onProgress?: (progress: unknown) => void;
  }): Promise<DysflowMcpResult>;
  close(): Promise<void>;
};
export function resolveDysflowCommand(
  moduleUrl: string,
  env?: NodeJS.ProcessEnv,
): string;  // absolute launcher path
export function createDysflowMcpClient(options: {
  command?: string;
  cwd: () => string;
  env?: NodeJS.ProcessEnv;
}): DysflowMcpPort;

// src/cli/commands/install/pi-package-manager.ts
export const PI_PACKAGE_NAME = "@aroman22/dysflow-pi";
export type PiPackageCommandRunner = (
  args: readonly string[],
  context: { cwd: string; env: NodeJS.ProcessEnv },
) => Promise<void>;
export function piPackageSpec(version: string): string;
export function reconcilePiPackage(input: {
  settingsPath: string;
  runtimeDir: string;
  packageVersion?: string;
  env: NodeJS.ProcessEnv;
  cwd?: string;
  mode?: "install" | "remove";
  runPiCommand?: PiPackageCommandRunner;
  writeOwnershipFile?: typeof writeJson;
}): Promise<{
  status: "added" | "changed" | "unchanged";
  active: boolean;
  owned: boolean;
  spec: string;
}>;
export function resolvePiPackageOwnershipPath(runtimeDir: string): string;

// src/cli/commands/install/mcp-configurator.ts
export async function reconcilePiIntegration(input: {
  mcpConfigPath: string;
  commandPath: string;
  mode?: "install" | "remove";
}): Promise<{ status: "added" | "changed" | "unchanged"; active: boolean }>;
export async function capturePiIntegration(mcpConfigPath: string): Promise<PiIntegrationSnapshot>;
export async function restorePiIntegration(
  mcpConfigPath: string,
  snapshot: PiIntegrationSnapshot,
): Promise<void>;
```

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit — chrome | `operationLabel`, `renderDysflowCallText`, `renderDysflowResultText`, `compactDysflowResultStatus` | Pure inputs (operation name + args + a result shape) → expected string. Asserted by `pi-native-package-1723.test.ts` "renders characteristic calls without dumping parameters" and "keeps collapsed results to one status line and expands full details". |
| Unit — facade | `createDysflowNativeTool` name, execute delegation, bounded error path | Injected `callTool` mock collects calls; `execute` calls it with the validated name. Asserted by `pi-native-package-1723.test.ts` "registers one unique native facade and delegates over the injected MCP port" and "throws only a bounded error through Pi's public tool-error path". |
| Unit — launcher | `resolveDysflowCommand` honours `DYSFLOW_BIN`, rejects relative, falls back to marker / `LOCALAPPDATA` | Asserted by `pi-native-package-1723.test.ts` "pins the native MCP child to the installer-managed absolute launcher". |
| Unit — manifest | `plugin/pi/package.json` shape (no `pi.mcp`, no `typebox` dep, `typebox` peer only, version equals root, image URL well-formed) | Asserted by `pi-native-package-1723.test.ts` "ships a public Pi package without a package-scoped duplicate MCP" and "keeps the canonical Pi guide aligned with package and repository contracts". |
| Unit — pack | `npm pack --dry-run --json` lists every runtime file, omits `mcp.json` | Asserted by `pi-native-package-1723.test.ts` "packs every runtime artifact required by a clean Pi installation" (sandboxed HOME/USERPROFILE/npm cache/npm prefix). |
| Integration — MCP | `reconcilePiIntegration` create / re-reconcile (byte-identical) / preserves compatible options / foreign-entry rejection / remove round-trip | Asserted by `pi-integration-1723.test.ts` "creates only the global absolute-launcher MCP entry" / "is byte-identical and reports unchanged on repeated reconciliation" / "preserves compatible user MCP options and unrelated servers" / "fails safely when a foreign executable lives inside a dysflow directory" / "removes only an installer-managed MCP entry" / "does not create package settings as a substitute for Pi install". |
| Integration — source text | `install.ts`, `updater.ts`, `uninstall.ts` reference both reconcilers; transactional sources also call `capturePiIntegration` + `restorePiIntegration` | Asserted by `pi-integration-1723.test.ts` "routes install, upgrade, and uninstall through shared MCP and package reconcilers". |
| Integration — rollback | Snapshot-restore round-trip and new-file removal | Asserted by `pi-integration-1723.test.ts` "restores the exact prior MCP bytes after a later package step fails" and "removes a newly created MCP file when a later package step fails". |
| Integration — package manager | All 8 branches of `reconcilePiPackage` (install / exact pre-existing user / differently pinned user / owned upgrade / owned remove / non-owned remove / install-failure rollback / stale-ownership user-modified) | Asserted by `pi-package-manager-1723.test.ts` (8 atoms). |
| Typecheck | `pnpm --dir plugin/pi typecheck` | `tsc --noEmit` with `strict: true`, `noEmit: true`. |
| Manual / clean-Pi | Visual acceptance (`⚡ Dysflow · …` chrome, comparable to Engram) | `docs/pi-native-integration.md` § "Clean-Pi Visual Acceptance" — owned by issue #1723 closure, not by this branch. |

## Threat Matrix

| Boundary | Applicable | Notes |
|---|---|---|
| Routing (process spawn, stdin/stdout child) | Applicable | `StdioClientTransport` connects to `<absolute-launcher> mcp`; `signal` and `onProgress` are passed through. The launcher path is computed from `DYSFLOW_BIN` (must be absolute) or the runtime marker, so the spawn target is constrained. The transport's `stderr: "inherit"` is intentional. Tests cover the launcher resolution but not the live stdio round-trip (the E2E harness in `docs/pi-native-integration.md` § "Sandboxed Contributor Checks" covers it indirectly). |
| Subprocess / `runCommand("pi", …)` | Applicable | `pi-package-manager.ts:95-97` (`defaultPiPackageCommandRunner`) calls `runCommand("pi", args, cwd, { timeoutMs: 120_000, env })`. The timeout is 120s; `cwd` defaults to `dirname(runtimeDir)`; `env` is the filtered child env. Tests use an injected runner; the live path is gated by `docs/pi-native-integration.md` § "Sandboxed Contributor Checks". |
| Shell command surface | N/A | No shell is invoked; `runCommand` is a direct `child_process` exec through `command-runner.ts`. |
| VCS / PR automation | N/A | No git operations, no PR creation, no release automation in this change. The release workflow is owned by `.github/workflows/release.yml` and is invoked separately. |
| Executable-file classification | Applicable | `dysflow.cmd` is the only launcher; resolved to absolute via `resolveDysflowCommand`. `DYSFLOW_BIN` must be absolute or throws. `plugin/pi/package.json` does not declare a `bin` entry, so the npm package never installs an executable. |
| Process integration (process-table snapshot / descendant detection) | N/A | The plugin is a single Node process; no descendants are spawned beyond the stdio child. |

## Migration / Rollout

No data migration. The activation path is:

1. `dysflow install --agents pi --no-tui` (or `dysflow update` if the runtime
   already exists) writes `~/.pi/agent/mcp.json`, `~/.pi/agent/settings.json`,
   and `<runtimeDir>/.dysflow-pi-package.json`. No Pi JSON is touched outside
   the two files above.
2. The user enters `/reload` in an active Pi session.
3. The user calls `dysflow({ tool: "bootstrap", args: {} })` and visually
   verifies the `⚡ Dysflow · bootstrap…` chrome.

Rollback path: `dysflow uninstall --agents pi` removes the MCP entry, removes
the npm package if and only if Dysflow owns it, and removes the ownership
record. The npm package can also be removed manually with
`pi remove npm:@aroman22/dysflow-pi`.

## Open Questions

- None. Every contract decision above is locked by an existing test in the
  working tree.
