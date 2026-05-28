# Dysflow HTTP API Foundation Implementation Plan

> **Status (2026-05-28): ALL PHASES COMPLETE.** v0.9.17 released. 48 MCP tools. 646 tests passing. Zero pending tasks.

> **For agentic workers:** All tasks are complete (`- [x]`). This document is now a historical record of the implementation plan.

**Goal:** Convert Dysflow into a product with a reusable internal execution core that can later expose Access/VBA operations through an HTTP API for production scripts.

**Architecture:** Build the system from the inside out: first define the product CLI and configuration, then isolate Access/VBA operations behind internal services, then expose those services through MCP stdio, setup/doctor/TUI commands, and only in the final phase add the `http-api` adapter. This avoids duplicating protocol logic and prevents HTTP endpoints from being coupled directly to PowerShell or Access implementation details.

**Tech Stack:** Node.js/TypeScript, pnpm, `@modelcontextprotocol/sdk`, PowerShell integration for Access/VBA, Vitest or Node test runner, local HTTP server adapter, JSON request/response contracts.

---

## Epic Intent

Dysflow must eventually serve two clients:

1. AI/MCP clients such as Codex, OpenCode, Claude Code, and future agent tools.
2. Non-agent automation scripts that call Dysflow over HTTP to execute safe, production-oriented Access/VBA operations.

The important architectural rule is this:

> HTTP is not the product core. HTTP is only one adapter over the Dysflow core.

If we violate that, we get a fragile API that knows too much about Access, PowerShell, file paths, passwords, locks, and MCP behavior. That is exactly the kind of shortcut that feels fast and then burns months later. NO. We build foundations first.

---

## Target Command Surface

```bash
dysflow mcp
dysflow setup
dysflow doctor
dysflow tui
dysflow serve
```

`dysflow serve` is intentionally last. It exposes the already-tested internal service layer over HTTP.

---

## Planned File Structure

- `package.json` — package metadata, bin entry, scripts.
- `pnpm-workspace.yaml` — workspace definition if packages are split later.
- `tsconfig.json` — TypeScript build configuration.
- `src/cli/main.ts` — command dispatcher for `dysflow`.
- `src/cli/commands/mcp.ts` — starts MCP stdio adapter.
- `src/cli/commands/setup.ts` — writes/prints agent configuration.
- `src/cli/commands/doctor.ts` — runs diagnostics.
- `src/cli/commands/tui.ts` — launches terminal UI later.
- `src/cli/commands/serve.ts` — final phase HTTP adapter entrypoint.
- `src/core/config/dysflow-config.ts` — resolves Access paths, passwords, timeouts, project settings.
- `src/core/contracts/tool-contracts.ts` — stable internal operation contracts.
- `src/core/services/access-vba-service.ts` — internal API for VBA export/import/test operations.
- `src/core/services/access-query-service.ts` — internal API for Access SQL/query operations.
- `src/core/services/diagnostics-service.ts` — checks Access, COM, bitness, file locks, config.
- `src/adapters/mcp/register-tools.ts` — maps core services to MCP tools.
- `src/adapters/http/http-server.ts` — final adapter; maps HTTP routes to core services.
- `src/adapters/http/routes.ts` — final route definitions.
- `src/adapters/http/http-contracts.ts` — final public HTTP request/response schemas.
- `test/core/*.test.ts` — core tests.
- `test/adapters/mcp/*.test.ts` — MCP adapter tests.
- `test/adapters/http/*.test.ts` — final HTTP adapter tests.
- `docs/architecture/dysflow-core-and-adapters.md` — product architecture decision.
- `docs/api/http-api.md` — final HTTP API reference.

---

## Phase 1: Product Skeleton and CLI Contract

**Objective:** Make Dysflow installable and runnable as a real product, even if commands are initially thin.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/cli/main.ts`
- Create: `src/cli/commands/mcp.ts`
- Create: `src/cli/commands/setup.ts`
- Create: `src/cli/commands/doctor.ts`
- Create: `src/cli/commands/tui.ts`
- Test: `test/cli/main.test.ts`

### Task 1.1: Define the package entrypoint

- [x] Write a failing test that runs `dysflow --help` and asserts the command list includes `mcp`, `setup`, `doctor`, `tui`, and `serve`.
- [x] Implement the minimal CLI dispatcher.
- [x] Keep `serve` visible but not operational yet. Expected behavior: exits with a clear message saying HTTP adapter is not implemented in this phase.
- [x] Run CLI tests.
- [x] Commit:

```bash
git add package.json tsconfig.json src/cli test/cli
git commit -m "feat: add dysflow cli skeleton"
```

### Task 1.2: Preserve product vision in docs

- [x] Update `README.md` with the command surface.
- [x] Explicitly document that `dysflow serve` is planned as the final adapter phase.
- [x] Commit:

```bash
git add README.md
git commit -m "docs: document dysflow command surface"
```

---

## Phase 2: Configuration Core

**Objective:** Centralize all project and Access configuration before exposing any protocol.

**Files:**
- Create: `src/core/config/dysflow-config.ts`
- Test: `test/core/dysflow-config.test.ts`
- Modify: `src/cli/commands/setup.ts`
- Modify: `src/cli/commands/doctor.ts`

### Task 2.1: Resolve Access paths and timeouts

- [x] Write failing tests for config precedence:
  - explicit options beat environment variables;
  - `ACCESS_DB_PATH` can feed frontend path;
  - invalid timeout values fail loudly;
  - password is never printed in plain diagnostic output.
- [x] Implement `resolveDysflowConfig()`.
- [x] Run core config tests.
- [x] Commit:

```bash
git add src/core/config test/core/dysflow-config.test.ts
git commit -m "feat: add dysflow configuration core"
```

### Task 2.2: Generate client setup config from core config

- [x] Move current Codex MCP TOML generation behavior from the old workflow skill into the new product shape.
- [x] Test that `startup_timeout_sec` and `tool_timeout_sec` are written under `[mcp_servers.dysflow]`, not under env.
- [x] Commit:

```bash
git add src/cli/commands/setup.ts test/cli
git commit -m "feat: generate codex mcp setup config"
```

---

## Phase 3: Internal Operation Contracts

**Objective:** Define stable internal contracts before protocols exist.

**Files:**
- Create: `src/core/contracts/tool-contracts.ts`
- Create: `src/core/contracts/result.ts`
- Test: `test/core/tool-contracts.test.ts`

### Task 3.1: Define operation result shape

- [x] Write tests for a standard result envelope:

```ts
type DysflowResult<T> =
  | { ok: true; data: T; warnings: string[] }
  | { ok: false; error: { code: string; message: string; details?: unknown }; warnings: string[] };
```

- [x] Implement the shared result helpers.
- [x] Commit:

```bash
git add src/core/contracts test/core/tool-contracts.test.ts
git commit -m "feat: add dysflow core result contracts"
```

### Task 3.2: Define Access/VBA operation contracts

- [x] Define request/response types for the operations migrated from existing skills:
  - export VBA modules;
  - import VBA modules;
  - run VBA tests;
  - execute Access SQL;
  - list tables;
  - inspect schema;
  - run diagnostics.
- [x] Keep contracts protocol-neutral. No MCP-specific content blocks. No HTTP status codes.
- [x] Commit:

```bash
git add src/core/contracts test/core/tool-contracts.test.ts
git commit -m "feat: define access operation contracts"
```

---

## Phase 4: Core Services over Existing Runtime

**Objective:** Wrap the current working Access/VBA and Access-query implementation without rewriting everything.

**Files:**
- Create: `src/core/services/access-vba-service.ts`
- Create: `src/core/services/access-query-service.ts`
- Create: `src/core/services/diagnostics-service.ts`
- Create: `src/core/runtime/powershell-runner.ts`
- Test: `test/core/access-vba-service.test.ts`
- Test: `test/core/access-query-service.test.ts`
- Test: `test/core/diagnostics-service.test.ts`

### Task 4.1: Add PowerShell runner boundary

- [x] Write tests for command construction without executing production Access files.
- [x] Implement a runner interface that can be mocked in tests.
- [x] Ensure paths are passed safely and never interpolated into unsafe shell strings.
- [x] Commit:

```bash
git add src/core/runtime test/core
git commit -m "feat: add powershell runtime boundary"
```

### Task 4.2: Wrap VBA operations

- [x] Write failing tests for service methods using a fake runner.
- [x] Implement `AccessVbaService` as a protocol-neutral class.
- [x] Do not expose MCP or HTTP concepts here.
- [x] Commit:

```bash
git add src/core/services/access-vba-service.ts test/core/access-vba-service.test.ts
git commit -m "feat: wrap access vba operations"
```

### Task 4.3: Wrap query operations

- [x] Write failing tests for SQL execution, table listing, and schema inspection using a fake runner.
- [x] Implement `AccessQueryService`.
- [x] Add guardrails for write operations: dry-run, allow-list, deny-list, and linked-table protections.
- [x] Commit:

```bash
git add src/core/services/access-query-service.ts test/core/access-query-service.test.ts
git commit -m "feat: wrap access query operations"
```

### Task 4.4: Wrap diagnostics

- [x] Write tests for diagnostics result categories:
  - Access available;
  - frontend path exists;
  - backend path exists;
  - bitness is detectable;
  - lock files are reported;
  - MCP config is inspectable.
- [x] Implement `DiagnosticsService`.
- [x] Commit:

```bash
git add src/core/services/diagnostics-service.ts test/core/diagnostics-service.test.ts
git commit -m "feat: add dysflow diagnostics service"
```

---

## Phase 5: MCP stdio Adapter

**Objective:** Replace the old combined MCP wrapper with a product-owned MCP adapter over the core services.

**Files:**
- Create: `src/adapters/mcp/register-tools.ts`
- Modify: `src/cli/commands/mcp.ts`
- Test: `test/adapters/mcp/register-tools.test.ts`

### Task 5.1: Register MCP tools from core services

- [x] Write tests that assert expected MCP tool names are registered.
- [x] Map MCP tool inputs to core contracts.
- [x] Map core results to MCP content responses.
- [x] Preserve compatibility with the currently working Dysflow MCP tool names where possible.
- [x] Commit:

```bash
git add src/adapters/mcp src/cli/commands/mcp.ts test/adapters/mcp
git commit -m "feat: add dysflow mcp adapter"
```

### Task 5.2: Smoke-test MCP startup

- [x] Run `dysflow mcp` in a controlled smoke test.
- [x] Verify stdout is reserved for MCP protocol and logs go to stderr.
- [x] Commit:

```bash
git add test/adapters/mcp
git commit -m "test: add mcp startup smoke test"
```

---

## Phase 6: Doctor and Setup Product Flows

**Objective:** Make Dysflow useful before HTTP exists.

**Files:**
- Modify: `src/cli/commands/doctor.ts`
- Modify: `src/cli/commands/setup.ts`
- Test: `test/cli/doctor.test.ts`
- Test: `test/cli/setup.test.ts`
- Docs: `docs/architecture/dysflow-core-and-adapters.md`

### Task 6.1: Implement `dysflow doctor`

- [x] Write tests for readable diagnostics output.
- [x] Use `DiagnosticsService` internally.
- [x] Redact secrets.
- [x] Return non-zero only for blocking errors.
- [x] Commit:

```bash
git add src/cli/commands/doctor.ts test/cli/doctor.test.ts
git commit -m "feat: implement dysflow doctor"
```

### Task 6.2: Implement `dysflow setup`

- [x] Write tests for Codex config generation.
- [x] Add future placeholders in docs for OpenCode and Claude Code, but do not implement unsupported clients yet.
- [x] Commit:

```bash
git add src/cli/commands/setup.ts test/cli/setup.test.ts
git commit -m "feat: implement dysflow setup"
```

### Task 6.3: Document architecture before HTTP

- [x] Create `docs/architecture/dysflow-core-and-adapters.md`.
- [x] Include the dependency rule: adapters depend on core; core depends on no adapter.
- [x] Commit:

```bash
git add docs/architecture/dysflow-core-and-adapters.md
git commit -m "docs: describe dysflow core adapter architecture"
```

---

## Phase 7: TUI Placeholder or Minimal TUI

**Objective:** Decide whether `dysflow tui` ships as a placeholder or a minimal diagnostic UI before HTTP.

**Files:**
- Modify: `src/cli/commands/tui.ts`
- Test: `test/cli/tui.test.ts`

### Task 7.1: Add honest TUI behavior

- [x] If no TUI is ready, return a clear message and exit code `0` only when invoked with `--help`.
- [x] If implementing minimal TUI, use only core services; do not call MCP or HTTP.
- [x] Commit:

```bash
git add src/cli/commands/tui.ts test/cli/tui.test.ts
git commit -m "feat: add dysflow tui command behavior"
```

---

## Phase 8: Final Phase — HTTP API Adapter

**Objective:** Expose selected, safe Dysflow operations over HTTP for production scripts.

**Files:**
- Create: `src/adapters/http/http-contracts.ts`
- Create: `src/adapters/http/routes.ts`
- Create: `src/adapters/http/http-server.ts`
- Modify: `src/cli/commands/serve.ts`
- Test: `test/adapters/http/http-contracts.test.ts`
- Test: `test/adapters/http/http-server.test.ts`
- Docs: `docs/api/http-api.md`

### Task 8.1: Define HTTP API policy

- [x] Document that HTTP is opt-in and local-first by default.
- [x] Default bind address must be `127.0.0.1`, not `0.0.0.0`.
- [x] Require explicit configuration before exposing write operations.
- [x] Define authentication/token policy before allowing non-local binds.
- [x] Commit:

```bash
git add docs/api/http-api.md
git commit -m "docs: define dysflow http api policy"
```

### Task 8.2: Define public HTTP contracts

- [x] Write tests for JSON request/response schemas.
- [x] Map HTTP responses to core result envelope:
  - `200` for successful operations;
  - `400` for validation errors;
  - `401` for missing/invalid token when auth is enabled;
  - `403` for forbidden write operation;
  - `500` only for unexpected server failures.
- [x] Keep schema names stable because external scripts will depend on them.
- [x] Commit:

```bash
git add src/adapters/http/http-contracts.ts test/adapters/http/http-contracts.test.ts
git commit -m "feat: define dysflow http api contracts"
```

### Task 8.3: Implement health and diagnostics routes

- [x] Add `GET /health` returning service name, status, and version.
- [x] Add `GET /diagnostics` mapped to `DiagnosticsService`.
- [x] Test both routes without touching production Access files.
- [x] Commit:

```bash
git add src/adapters/http src/cli/commands/serve.ts test/adapters/http
git commit -m "feat: add dysflow http health diagnostics routes"
```

### Task 8.4: Implement read-only Access routes

- [x] Add route for listing tables.
- [x] Add route for inspecting schema.
- [x] Add route for read-only SQL execution.
- [x] Enforce read-only mode by default.
- [x] Commit:

```bash
git add src/adapters/http test/adapters/http
git commit -m "feat: add dysflow http read only access routes"
```

### Task 8.5: Implement controlled write routes

- [x] Add write routes only after allow-list and deny-list behavior is tested.
- [x] Require explicit config flag for write operations.
- [x] Return `403` when writes are disabled.
- [x] Log operation metadata, but never log passwords or full sensitive SQL payloads.
- [x] Commit:

```bash
git add src/adapters/http test/adapters/http
git commit -m "feat: add guarded dysflow http write routes"
```

### Task 8.6: Document script consumption examples

- [x] Add PowerShell example using `Invoke-RestMethod`.
- [x] Add Node.js example using `fetch`.
- [x] Include examples for health, diagnostics, read query, and guarded write call.
- [x] Commit:

```bash
git add docs/api/http-api.md
git commit -m "docs: add dysflow http api script examples"
```

---

## Release Readiness Checklist

- [x] `pnpm install` works from a clean clone.
- [x] `pnpm test` passes.
- [x] `pnpm build` passes.
- [x] `pnpm dlx @dystelefonica/dysflow setup` target flow is documented.
- [x] `dysflow mcp` starts without stdout pollution.
- [x] `dysflow doctor` redacts secrets.
- [x] `dysflow serve` binds to `127.0.0.1` by default.
- [x] HTTP write operations are disabled by default.
- [x] HTTP API docs include stable examples for production scripts.
- [x] Existing workflow MCP remains untouched until the product adapter is proven.

---

## Phase 9: Remove "legacy" naming — all 48 MCP tools are first-class

**Decision:** The 48 MCP tools are all first-class functionality. The word "legacy" never applied to them — it was a naming mistake. This phase renames all `legacy-*` files, `LEGACY_*` variables, and related identifiers without removing a single tool or any functionality.

One genuinely dead file exists and must be deleted: `src/core/services/vba-sync-legacy-service.ts` (zero imports, marked `@deprecated`).

**Context for a fresh AI picking this up:**

The MCP server exposes 48 tools. Historically they were split into "5 dysflow_* tools" and "43 compatibility tools" — but that distinction is wrong. All 48 are the official API. This refactor removes the `legacy` label from the codebase without changing any runtime behavior.

**Files to RENAME:**

| Current | Target |
|---------|--------|
| `src/adapters/mcp/legacy-tool-inventory.ts` | `src/adapters/mcp/mcp-tool-registry.ts` |
| `src/adapters/mcp/legacy-parity-registry.ts` | `src/adapters/mcp/tool-parity-registry.ts` |
| `src/adapters/vba-sync/vba-sync-legacy-adapter.ts` | `src/adapters/vba-sync/vba-sync-adapter.ts` |
| `test/adapters/mcp/legacy-tool-schemas-parity.test.ts` | `test/adapters/mcp/tool-schemas-parity.test.ts` |
| `test/core/contracts/legacy-vba-sync-port.test.ts` | `test/core/contracts/vba-sync-port.test.ts` |
| `test/adapters/mcp/legacy-parity.test.ts` | `test/adapters/mcp/tool-parity.test.ts` |
| `test/adapters/vba-sync/vba-sync-legacy-adapter.test.ts` | `test/adapters/vba-sync/vba-sync-adapter.test.ts` |
| `test/adapters/mcp/legacy-parity-registry.test.ts` | `test/adapters/mcp/tool-parity-registry.test.ts` |

**Files to DELETE:**

- `src/core/services/vba-sync-legacy-service.ts` — confirmed dead shim, zero imports anywhere

**Symbols to rename throughout the codebase:**

| Current | Target |
|---------|--------|
| `LEGACY_VBA_SYNC_TOOL_NAMES` | `VBA_SYNC_TOOL_NAMES` |
| `LEGACY_QUERY_TOOL_NAMES` | `QUERY_TOOL_NAMES` |
| `LEGACY_QUERY_MAINTENANCE_TOOL_NAMES` | `QUERY_MAINTENANCE_TOOL_NAMES` |
| `LEGACY_WRITE_FIXTURE_TOOL_NAMES` | `WRITE_FIXTURE_TOOL_NAMES` |
| `LEGACY_TOOL_ROUTES` | `MCP_TOOL_ROUTES` |
| `LEGACY_TOOL_SCHEMAS` | `MCP_TOOL_SCHEMAS` |
| `appendLegacyCompatibilityTools` | `registerMcpTools` |
| `createLegacyDispatchTool` | `createDispatchTool` |
| `getLegacyParityToolDefinition` | `getToolDefinition` |
| `LegacyVbaSyncPort` | `VbaSyncPort` |
| `VbaSyncLegacyAdapter` | `VbaSyncAdapter` |
| `VbaSyncLegacyService` | `VbaSyncService` (if still exists) |

**Tasks:**

- [x] Delete `src/core/services/vba-sync-legacy-service.ts`
- [x] Rename the 8 source/test files (create at new path, update all import paths, delete old file)
- [x] Rename all `LEGACY_*` / `Legacy*` symbols throughout `src/` and `test/`
- [x] Run `pnpm build` — must pass with zero errors
- [x] Run `pnpm run test -- --run` — all 646 tests must still pass
- [x] Verify: MCP still exposes exactly 48 tools
- [x] Verify: zero occurrences of `legacy` (case-insensitive) in `src/` and `test/`
- [x] Commit:

```bash
git commit -m "refactor(mcp): remove legacy naming — all 48 MCP tools are first-class"
```

**Completed:** 2026-05-28 — 3 source files renamed, 5 test files renamed, 1 dead file deleted, all symbols renamed. 646 tests passing. MCP exposes 48 tools.

**Acceptance criteria:**
- `pnpm build` passes
- `pnpm run test -- --run` — 646 tests passing
- MCP exposes exactly 48 tools (unchanged)
- Zero occurrences of `legacy` in `src/` and `test/`

---

## Self-Review

**Spec coverage:** The plan covers the user's future HTTP API goal, keeps HTTP as the final phase, protects production Access usage, and preserves MCP/productization work before HTTP.

**Placeholder scan:** No task depends on an undefined “do later” implementation. Future client support is explicitly documented as non-implemented until selected.

**Type consistency:** The same core/adapters terminology is used throughout: core services expose protocol-neutral contracts; MCP and HTTP are adapters.
