# Design — #407 AccessOperationRegistry ownership

## Context

`src/core/runner/access-runner.ts` declares a module-global singleton:

```ts
const defaultRegistry = new InMemoryAccessOperationRegistry();          // ~line 118
export function getDefaultAccessOperationRegistry() { return defaultRegistry; } // ~line 121
```

and the runner constructor falls back to it:

```ts
this.operationRegistry = options.operationRegistry ?? defaultRegistry;  // ~line 137
```

Verified call sites of the global / fallback:

| Site | File:line | Role |
| --- | --- | --- |
| Runner default | `core/runner/access-runner.ts:137` | fallback when no registry injected |
| MCP list (generic) | `adapters/mcp/tools.ts:211` | `services.operationRegistry ?? global` |
| MCP list (alias) | `adapters/mcp/tools.ts:308` | `services.operationRegistry ?? global` |
| HTTP list | `adapters/http/server.ts:148` | `context.services.operationRegistry ?? global` |
| HTTP degraded | `adapters/http/http-services-factory.ts:64` | `createUnavailableHttpServices` |
| CLI access | `cli/commands/access.ts:41` | `new AccessPowerShellRunner()` (no registry) |
| CLI doctor | `cli/commands/doctor.ts:43` | `new AccessPowerShellRunner()` (no registry) |

Hexagonal boundary: the `AccessOperationRegistry` port and both implementations
(`InMemoryAccessOperationRegistry`, `FileAccessOperationRegistry`) live in `src/core`. Composition
(which concrete registry, which file path) lives in adapters. `core` must NOT import adapters
(enforced by `test/architecture/core-boundary.test.ts`). This design keeps that intact: we delete
core's hidden composition (the global) and push the choice to the adapters' composition roots.

## The shared-vs-separate decision

### What "shared" means today (verified, not assumed)

The MCP and HTTP adapters do **not** share the in-memory global in normal runs. Each composition
root builds its own `FileAccessOperationRegistry` pointing at the **same file path**
`<projectRoot>/.dysflow/runtime/operations.json`:

- MCP `createConfiguredServices` → `createProjectOperationRegistry(config)` (`stdio.ts:166,305`)
- HTTP `createHttpServices` → `new FileAccessOperationRegistry({ filePath: resolveProjectOperationRegistryPath(config) })` (`http-services-factory.ts:34`)

The observable cross-adapter sharing — an operation created via MCP appearing in HTTP's
`GET /access/operations` (and `list_access_operations`) and vice-versa — is delivered by the
**shared file path**, serialized by `FileAccessOperationRegistry.withFileLock`. The in-memory
global is reached only on `?? fallback` paths and never participates when a composition root
supplies a registry.

### Decision: Option (a) — explicit injection, behavior-preserving

**We remove the global and inject explicitly. We preserve the shared-file-path semantics.**

Justification (one paragraph): the genuine, observable sharing channel between MCP and HTTP is the
common file path, which both composition roots already construct from
`resolveProjectOperationRegistryPath(config)`; the in-memory global was never that channel — it is
a fallback that only activates when a composition root forgets to inject, which is exactly the
hidden coupling #407 targets. Removing the global therefore does NOT change cross-adapter observable
behavior: two `FileAccessOperationRegistry` instances over the same file remain the contract, and
that is what we pin with a port-level test. Option (b) ("keep a deliberate shared in-memory
singleton") is rejected because it would re-introduce a module-level mutable global to solve a
sharing problem that is already solved, more robustly and cross-process-safely, by the file path.

Because behavior is preserved, **no behavioral spec delta is required.** The change is recorded as
a composition-root invariant (below), pinned by a test.

## Chosen wiring

### Core: `AccessPowerShellRunner` registry contract

Delete `defaultRegistry` and `getDefaultAccessOperationRegistry()`. Change the runner so it no
longer reaches a shared global. Two acceptable shapes — pick the first:

**Preferred — runner owns a private fresh in-memory fallback (no shared state):**

```ts
constructor(options: AccessPowerShellRunnerOptions = {}) {
  // ...
  this.operationRegistry = options.operationRegistry ?? new InMemoryAccessOperationRegistry();
  // ...
}
```

This keeps `new AccessPowerShellRunner()` valid (CLI, bare-runner tests still compile) but each
runner gets its OWN isolated registry — never a process-wide shared one. The fallback is local and
explicit, not a hidden global. This is behavior-preserving for the CLI commands, which never expose
`list_access_operations` and only need the runner to record somewhere.

Rejected alternative — make `operationRegistry` strictly required: larger blast radius (every bare
`new AccessPowerShellRunner()` in CLI and ~25 test sites must change) for no behavioral gain. The
private-fallback shape removes the GLOBAL (the actual defect) without forcing required injection.

### MCP adapter

`createConfiguredServices` already constructs and injects a `FileAccessOperationRegistry` into both
the runner and `services.operationRegistry` (`stdio.ts:166-178`). No change there. In `tools.ts`,
drop the fallback:

```ts
// tools.ts:211 and :308 — before
const registry = services.operationRegistry ?? getDefaultAccessOperationRegistry();
// after
const registry = services.operationRegistry;   // always supplied by the composition root
```

`DysflowMcpServices.operationRegistry` should become required (non-optional) so the removed
fallback is provably unreachable. Verify all `DysflowMcpServices` constructions supply it
(`createConfiguredServices` does; `createUnavailableServices` must be checked/updated — note it
does not currently set `operationRegistry`, so the list handlers there must get one or the field
stays optional with a local explicit fallback constructed in `tools.ts`). Resolve during apply by
reading the live `DysflowMcpServices` type and `createUnavailableServices`.

### HTTP adapter

`server.ts:148` — drop the fallback the same way; rely on `context.services.operationRegistry`
constructed by `createHttpServices`. For degraded mode, `createUnavailableHttpServices`
(`http-services-factory.ts:52-66`) replaces `getDefaultAccessOperationRegistry()` with an explicit
local instance:

```ts
operationRegistry: new InMemoryAccessOperationRegistry(),
```

This is an empty in-memory registry returning `[]` from `listRecent` — identical observable result
to today's degraded path (the global is empty in a degraded HTTP-only process). Add the
`InMemoryAccessOperationRegistry` import from core.

### CLI commands

`access.ts:41` and `doctor.ts:43` keep `new AccessPowerShellRunner()`. With the preferred runner
shape they get a private fresh in-memory registry — same observable behavior as today (these
commands do not surface operation listings). No explicit registry construction needed unless we
later want them to share the project file; out of scope for #407.

## Composition-root invariant (documented, test-pinned)

Both adapters MUST, when configured (non-degraded):

1. Load `DysflowConfig`.
2. Construct ONE `FileAccessOperationRegistry` from `resolveProjectOperationRegistryPath(config)`.
3. Inject that same instance into the runner AND expose it as `operationRegistry` AND pass it to
   the cleanup service.

Degraded mode constructs an explicit empty `InMemoryAccessOperationRegistry`.

The cross-adapter sharing contract: an operation persisted by one adapter's registry is visible via
the other adapter's `listRecent` when both point at the same file path.

## Alternatives considered

- **(b) Deliberate shared in-memory singleton + pinning test** — rejected; re-introduces a global
  to solve an already-solved sharing problem and is not cross-process safe.
- **Required `operationRegistry` on the runner** — rejected; unnecessary blast radius vs. the
  private-fallback shape (see above).
- **Per-adapter separate file paths (true isolation)** — rejected; that WOULD be an observable
  behavior change (MCP ops no longer visible to HTTP), and the task default is to preserve behavior.

## Migration steps (high level — see tasks.md for TDD ordering)

1. Add/confirm a port-level test pinning shared-file-path semantics (two registries, same path,
   write via one, read via the other).
2. Change the runner: replace `?? defaultRegistry` with `?? new InMemoryAccessOperationRegistry()`;
   delete `defaultRegistry` and `getDefaultAccessOperationRegistry()`.
3. Update MCP `tools.ts` (remove fallback; tighten `DysflowMcpServices.operationRegistry`).
4. Update HTTP `server.ts` and `http-services-factory.ts` (remove fallback; explicit degraded
   registry).
5. Update any bare-runner tests/imports referencing the removed export.
6. Run `pnpm test`, `tsc --noEmit`, `biome check`, and the architecture boundary test.

## Open items to resolve during apply

- Exact shape of `DysflowMcpServices.operationRegistry` (optional vs required) given
  `createUnavailableServices` does not set it today.
- Whether `getDefaultAccessOperationRegistry` is referenced anywhere outside `src/` (it is in
  `docs/tech-debt/TRACKING.md` and the archive — docs only, no code update needed beyond the
  tracking note).
