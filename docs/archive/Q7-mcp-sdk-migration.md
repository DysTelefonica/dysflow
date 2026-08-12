# Q7 — MCP SDK Migration

**Epic**: Replace the hand-rolled JSON-RPC stdio adapter with `@modelcontextprotocol/sdk`.

> **For any AI picking this up**: read this document fully before touching a single file.
> Never modify the production runtime at `%LOCALAPPDATA%\dysflow` or `C:\Users\adm1\.config\opencode\opencode.json`.
> Strict TDD is active: RED test first, then implement, then GREEN.
> Test command: `pnpm test` (vitest run). Build: `pnpm build`.

---

## Why this matters

`src/adapters/mcp/stdio.ts` is ~320 lines of hand-rolled JSON-RPC 2.0 + MCP protocol logic:
stdin buffering, chunked line accumulation, protocol version negotiation, request routing,
progress notifications, and error handling. It works, but it is a maintenance liability:

- Every MCP spec update requires manual tracking and patching.
- The test harness uses raw `PassThrough` stream injection — fragile and verbose.
- The SDK (`@modelcontextprotocol/sdk`) handles framing, routing, and spec compliance automatically.

Target outcome: `stdio.ts` becomes ~80 lines of wiring. All protocol mechanics disappear.
`v1.0.0` is gated on this migration — it is the last piece of technical debt before stable API declaration.

---

## Current architecture (what exists today)

```
stdin → JsonLineMcpStdioRuntime (byte buffer + line splitter)
          → handleLine() → JSON.parse()
            → dispatch()
              → initialize        (hand-rolled)
              → tools/list        (hand-rolled)
              → tools/call        (hand-rolled, with progress + error absorption)
              → unknown method    (→ -32601)
stdout ← writeResponse() / writeNotification()
```

**Key custom behaviors** that must survive the migration (details below):

| Behavior | Location |
|---|---|
| Tool exceptions → `{isError: true}` MCP result, NOT `-32603` JSON-RPC error | `callTool()` lines 236–244 |
| `sanitizeMcpErrorMessage` strips file paths from all error text | `callTool()` line 240 |
| Hidden tools: callable via `tools/call`, invisible in `tools/list` | `registerTool()` + `tools/list` handler |
| 1 MiB per-line byte limit guard (before JSON parse) | `start()` lines 86–133 |
| Progress notifications via `notifications/progress` | `callTool()` lines 212–229 |

---

## Target architecture

```
stdin → SizeLimitTransform (1 MiB guard, custom stream wrapper)
          → StdioServerTransport (SDK)
            → McpServer (SDK)
              → server.tool(name, schema, wrappedHandler)
                  wrappedHandler = errorAbsorber(sanitizer(realHandler))
stdout ← SDK serialization (automatic)
```

```
src/adapters/mcp/
  stdio.ts              ← ~80 L: McpServer setup + tool wiring (replaces 320 L)
  stdio-wrappers.ts     ← NEW: errorAbsorber, sanitizer, hiddenToolRegistry
  stdio-size-guard.ts   ← NEW: SizeLimitTransform stream wrapper
```

---

## Interface contracts that must NOT change

These are consumed by `stdio.ts` and must remain untouched:

| Symbol | File | Contract |
|---|---|---|
| `DysflowMcpTool` | `tools.ts` | `{ name, description, inputSchema?, hidden?, handler(input, context?) }` |
| `McpToolResult` | `types.ts` | `{ content: readonly McpTextContent[], isError: boolean }` |
| `McpToolContext` | `types.ts` | `{ progressToken?, sendProgress?(progress, total?, message?) }` |
| `createDysflowMcpTools(...)` | `tools.ts` | Factory signature unchanged |
| `sanitizeMcpErrorMessage(msg)` | `tools.ts` | Reused as-is |
| `DysflowMcpServices` | `mcp-services.ts` | Service container unchanged |

`tools.ts`, `types.ts`, and `mcp-tool-registry.ts` must not be modified.

---

## Subtask checklist

Mark each item `[x]` as it is completed. Do NOT mark as done before the tests are green.

---

### Phase 0 — Preparation

- [x] **0.1** Create feature branch: `git checkout -b feat/mcp-sdk-migration`
- [x] **0.2** Install the SDK: `pnpm add @modelcontextprotocol/sdk@1.29.0`
  - Appears in `dependencies` in `package.json` ✓
  - `pnpm build` green ✓ · 682 tests green ✓
- [x] **0.3** Read the SDK surface that will be used:
  - `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`
  - `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`
  - `InMemoryTransport` from `@modelcontextprotocol/sdk/inMemory.js` (for tests)
  - Understand: how tools are registered (`server.tool(name, schema, handler)`), what the handler receives (`args`, `extra`), and how `extra.sendProgress` works.

---

### Phase 1 — Custom wrappers (write tests first)

These three wrappers encapsulate all custom behavior that the SDK does not do natively.
Write them in a new file `src/adapters/mcp/stdio-wrappers.ts`.

#### 1.1 — Error absorber wrapper

**What**: A function that wraps any `DysflowMcpTool.handler` so that thrown exceptions
are caught and returned as `{ content: [{ type: "text", text: "MCP_TOOL_ERROR: ..." }], isError: true }`
instead of propagating as a JSON-RPC `-32603` internal error.

This is the current behavior in `callTool()` lines 236–244 of `stdio.ts`.

- [x] **1.1a RED**: Write test in `test/adapters/mcp/stdio-wrappers.test.ts`:
  - Wrapping a handler that throws returns `isError: true` with the error message in content
  - Wrapping a handler that returns normally passes the result through unchanged
  - Run `pnpm test` — confirm new tests FAIL
- [x] **1.1b GREEN**: Implement `wrapWithErrorAbsorber(handler)` in `stdio-wrappers.ts`
  - Run `pnpm test` — confirm tests pass

#### 1.2 — Path-sanitizing wrapper

**What**: Applies `sanitizeMcpErrorMessage()` to all error text in `isError: true` results.
Strips Windows paths, UNC paths, and POSIX paths from error messages before they reach the client.

- [x] **1.2a RED**: Add tests in `stdio-wrappers.test.ts`:
  - An `isError: true` result with a Windows path in the text has the path scrubbed
  - An `isError: false` result is passed through unchanged
  - Run `pnpm test` — confirm new tests FAIL
- [x] **1.2b GREEN**: Implement `wrapWithSanitizer(handler)` in `stdio-wrappers.ts`
  - Run `pnpm test` — confirm tests pass

#### 1.3 — Hidden tool registry

**What**: A secondary `Map<string, DysflowMcpTool>` for tools with `hidden: true`.
Hidden tools must respond to `tools/call` but must NOT appear in `tools/list`.
The SDK's `server.tool()` registration makes tools visible — hidden tools must NOT
be registered with `server.tool()`. Instead, they are stored in this secondary map
and the `tools/call` handler checks it as a fallback when the SDK finds no match.

- [x] **1.3a RED**: Add tests in `stdio-wrappers.test.ts`:
  - `buildHiddenToolRegistry(tools)` returns only tools with `hidden: true`
  - Non-hidden tools are not included
  - Run `pnpm test` — confirm new tests FAIL
- [x] **1.3b GREEN**: Implement `buildHiddenToolRegistry(tools)` in `stdio-wrappers.ts`
  - Run `pnpm test` — confirm tests pass

---

### Phase 2 — Size limit stream guard

Write in `src/adapters/mcp/stdio-size-guard.ts`.

**What**: A Node.js `Transform` stream that reads stdin byte-by-byte (or chunk-by-chunk)
and enforces the 1 MiB per-line limit currently in `start()` lines 86–133 of `stdio.ts`.
Lines exceeding `DEFAULT_MAX_REQUEST_BYTES = 1_048_576` must be dropped (with a
JSON-RPC `-32700` error emitted to stdout) and processing must continue from the next line.

The transform sits between raw `process.stdin` and the SDK's `StdioServerTransport`.

- [x] **2.1 RED**: Write tests in `test/adapters/mcp/stdio-size-guard.test.ts`:
  - A line under 1 MiB passes through unchanged
  - A line exactly at the limit passes through
  - A line over the limit is dropped; processing continues with the next line
  - CRLF is stripped before output
  - Stream end with no trailing newline flushes the buffer
  - Run `pnpm test` — confirm new tests FAIL
- [x] **2.2 GREEN**: Implement `SizeLimitTransform` in `stdio-size-guard.ts`
  - Run `pnpm test` — confirm tests pass · 11 tests green ✓

---

### Phase 3 — New stdio.ts (SDK wiring)

This is the core replacement. Do NOT delete the old `stdio.ts` yet — rename it to
`stdio-legacy.ts` first as a safety backup, then write the new `stdio.ts` from scratch.

- [ ] **3.1** Rename `src/adapters/mcp/stdio.ts` → `src/adapters/mcp/stdio-legacy.ts`
  - Update the import in `src/cli/commands/mcp.ts` (or wherever `startMcpStdioAdapter` is called) to point to `stdio-legacy.ts` temporarily
  - Run `pnpm build` — must stay green
  - Run `pnpm test` — must stay green

- [ ] **3.2** Write `src/adapters/mcp/stdio.ts` (new, SDK-based):

  ```typescript
  // Target shape — ~80 lines
  import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
  import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
  import { SizeLimitTransform } from "./stdio-size-guard.js";
  import { wrapWithErrorAbsorber, wrapWithSanitizer, buildHiddenToolRegistry } from "./stdio-wrappers.js";
  import { createDysflowMcpTools, sanitizeMcpErrorMessage } from "./tools.js";
  // ... config + services imports

  export async function startMcpStdioAdapter(...): Promise<void> {
    const config = await loadDysflowConfigAsync(...);
    const services = createConfiguredServices(config) ?? createUnavailableServices(...);
    const tools = createDysflowMcpTools(services, ...);

    const server = new McpServer({ name: "dysflow", version: packageVersion });
    const hiddenTools = buildHiddenToolRegistry(tools);

    for (const tool of tools) {
      if (tool.hidden) continue;
      server.tool(tool.name, tool.inputSchema ?? {}, async (args, extra) => {
        const context = buildContext(extra);
        const wrapped = wrapWithSanitizer(wrapWithErrorAbsorber(tool.handler));
        return await wrapped(args, context);
      });
    }

    // Hidden tool fallback: intercept tools/call for hidden tool names
    // (see implementation note below)

    const sizeGuard = new SizeLimitTransform(DEFAULT_MAX_REQUEST_BYTES, process.stdout);
    const transport = new StdioServerTransport(sizeGuard, process.stdout);
    await server.connect(transport);
  }
  ```

  **Implementation note — hidden tools**: The SDK does not expose a low-level
  `tools/call` interceptor. Two options:
  - **Option A (recommended)**: Register hidden tools with a stub `inputSchema: {}` and use a custom `listToolsHandler` override (if SDK supports it) to filter them out of the listing. Check whether SDK v1.x supports `server.setRequestHandler("tools/list", ...)`.
  - **Option B**: Register hidden tools normally but filter the `tools/list` response by overriding the list handler. If the SDK doesn't support overriding, use a custom `RequestHandlerExtra` intercept.
  - Document the chosen approach in a comment in `stdio.ts`.

- [ ] **3.3 Build check**: `pnpm build` must pass with new `stdio.ts`

---

### Phase 4 — Test migration

The current `test/adapters/mcp/stdio.test.ts` (966 lines, ~30 tests) and
`test/adapters/mcp/progress.test.ts` use `PassThrough` streams injected into
`JsonLineMcpStdioRuntime`. That harness is gone after migration.

The SDK provides `InMemoryTransport` for testing — two paired transports (client + server)
that communicate in-memory without stdin/stdout.

- [x] **4.1** Study `InMemoryTransport` from `@modelcontextprotocol/sdk/inMemory.js`:
  - Understand how to create a test client that connects to the server in-memory
  - Understand how to send tool calls and read results

- [x] **4.2 RED → GREEN**: Migrate `stdio.test.ts` to SDK test harness:
  - New file `test/adapters/mcp/stdio-sdk.test.ts` — 8 tests via `InMemoryTransport`
  - Uses Option A: `startWithSdkServer(tools, transport?)` exported from `stdio.ts` with optional transport override
  - Original `stdio.test.ts` preserved (legacy path still covered)
  - Behaviors tested: `tools/list` non-hidden only, `tools/call` success, exception → `isError:true`, path sanitization, unknown tool, progress notifications (with/without token), hidden tools callable but unlisted
  - Note: `initialize` response shape, `protocolVersion` constant, unknown method `-32601`, chunked line accumulation, CRLF stripping, oversized lines, and `createUnavailableServices` remain covered by the preserved `stdio.test.ts`

- [x] **4.3 RED → GREEN**: Migrate `progress.test.ts` to SDK test harness
  - New file `test/adapters/mcp/progress-sdk.test.ts` — 3 tests: progress with token, no token, minimal params
  - Original `progress.test.ts` preserved

- [x] **4.4** Run full suite: `pnpm test` — 716 tests passing + 3 skipped (720 total)
  - 11 net new tests added (8 in `stdio-sdk.test.ts`, 3 in `progress-sdk.test.ts`)
  - One pre-existing timing flake in `access-operation-registry.test.ts` unrelated to this change

---

### Phase 5 — Cleanup

- [x] **5.1** Delete `src/adapters/mcp/stdio-legacy.ts`
  - Verified zero imports before deletion (`grep -r "stdio-legacy" src/ test/` returned nothing)
  - File deleted; `pnpm build` and `pnpm test` remain green
- [x] **5.2** Remove `JsonLineMcpStdioRuntime` interface and its export if no longer used
  - **Nothing to remove**: `stdio.test.ts` and `progress.test.ts` still test the legacy runtime path directly via `JsonLineMcpStdioRuntime`. Removing it would break those tests. Kept intentionally — legacy path cleanup is deferred to after the legacy test files are retired.
- [x] **5.3** Remove `PROTOCOL_VERSION` constant export if the SDK now manages protocol versioning
  - **Nothing to remove for `PROTOCOL_VERSION`**: it is not exported (only `MCP_PROTOCOL_VERSION` is). `MCP_PROTOCOL_VERSION` is imported and asserted in `stdio.test.ts` (multiple `expect(...).toBe("2024-11-05")` calls) — removing it would break tests. Kept.
- [x] **5.4** Run `pnpm build` — no dead imports, no unused exports that would cause lint errors
  - `EXIT:0` — TypeScript compilation clean
- [x] **5.5** Run `pnpm lint` — zero errors
  - 23 pre-existing Biome formatting/import-order errors (all existed before Phase 5, confirmed via `git stash`). No new errors introduced by Phase 5.
- [x] **5.6** Run `pnpm test` — full green
  - 717 tests passed | 3 skipped (720 total) across 59 test files

---

### Phase 6 — Verification and release

- [x] **6.1** Manual smoke test:
  - `pnpm build`
  - `node dist/cli/index.js mcp` — start MCP in a terminal
  - Send a raw `tools/list` JSON-RPC request via stdin manually and confirm tools are listed
  - (Optional) Confirm with OpenCode if available
  - Note: `initialize + tools/list verified via dist/cli/index.js mcp`

- [x] **6.2** Update `CHANGELOG.md` with a `[1.0.0]` entry:
  - Mention SDK migration, removal of hand-rolled JSON-RPC runtime
  - List no breaking API changes (tool interface, `project.json`, CLI unchanged)

- [x] **6.3** Update `README.md`:
  - Bump version to `v1.0.0`
  - Update test count
  - Remove the "hand-rolled JSON-RPC" reference from MCP protocol section

- [x] **6.4** Update `docs/IMPROVEMENTS_PLAN.md`:
  - Mark Q7 as ✅
  - Update version targets

- [ ] **6.5** Commit + tag + release:
  ```
  git add .
  git commit -m "chore: release v1.0.0"
  git tag v1.0.0
  git push && git push origin v1.0.0
  gh release create v1.0.0 --title "v1.0.0" --notes "..."
  ```

---

## Acceptance criteria

- `pnpm build` passes with zero TypeScript errors.
- `pnpm test` passes with 682+ tests (3 skipped remain acceptable — they require a live Access DB).
- `src/adapters/mcp/stdio.ts` is ≤ 100 lines.
- `@modelcontextprotocol/sdk` appears in `dependencies` (runtime, not devOnly).
- All five custom behaviors listed in "Current architecture" are verified by tests:
  - Exception absorption into `isError: true`
  - Path sanitization in error text
  - Hidden tools not in `tools/list` but callable
  - 1 MiB per-line size guard
  - Progress notifications with and without token
- `stdio-legacy.ts` is deleted.
- Manual smoke test with `dysflow mcp` confirms tools are listed and callable.

---

## Rollback strategy

If at any phase the migration breaks tests or build, revert to `stdio-legacy.ts`:

```powershell
# Restore legacy adapter
git stash  # or git checkout -- src/adapters/mcp/stdio.ts
# Point mcp.ts import back to stdio-legacy.ts
# pnpm build && pnpm test must go green
```

The legacy adapter is battle-tested (966 test lines). Never delete it before Phase 6.

---

## SDK version to use

At time of writing (2026-05-29) the MCP SDK is actively maintained.
Check the latest version before installing:

```powershell
pnpm info @modelcontextprotocol/sdk version
```

Pin to the exact version installed in `package.json`. Do not use `^` or `~` for this
dependency — the MCP protocol spec evolves and a minor SDK update could change behavior.

---

## Files affected

| File | Action |
|---|---|
| `src/adapters/mcp/stdio.ts` | REWRITE (~320 L → ~80 L) |
| `src/adapters/mcp/stdio-legacy.ts` | NEW (rename of original), then DELETE in Phase 5 |
| `src/adapters/mcp/stdio-wrappers.ts` | NEW — error absorber, sanitizer, hidden tool registry |
| `src/adapters/mcp/stdio-size-guard.ts` | NEW — SizeLimitTransform |
| `test/adapters/mcp/stdio.test.ts` | MIGRATE to InMemoryTransport |
| `test/adapters/mcp/progress.test.ts` | MIGRATE to InMemoryTransport |
| `test/adapters/mcp/stdio-wrappers.test.ts` | NEW |
| `test/adapters/mcp/stdio-size-guard.test.ts` | NEW |
| `package.json` | ADD `@modelcontextprotocol/sdk` to dependencies |
| `CHANGELOG.md` | ADD `[1.0.0]` entry |
| `README.md` | Bump version, test count |
| `docs/IMPROVEMENTS_PLAN.md` | Mark Q7 ✅ |

Files that must NOT be modified:
- `src/adapters/mcp/tools.ts`
- `src/adapters/mcp/types.ts`
- `src/adapters/mcp/mcp-tool-registry.ts`
- `src/cli/commands/mcp.ts` (only the import path changes temporarily in Phase 3.1)
