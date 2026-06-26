# Exploration: mcp-hardening

## Current State

The current system has four MCP adapter bugs and security vulnerabilities identified in the audit:
1. **Unsanitized Arbitrary Code Execution / OS Shell Access in `vba_inline_execution`**:
   The `vba_inline_execution` tool takes a string of VBA code, embeds it inside a temporary BAS file, imports it to MS Access, executes it, and deletes the temporary module. Currently, no input validation is performed on the code. A malicious caller or client could write VBA payloads (such as `Shell`, `CreateObject("WScript.Shell")`, or Win32 API `Declare` imports) to execute arbitrary OS commands and escape the sandbox.
2. **`dryRun` default mismatches in write tools (`import_modules`, `import_all`, `generate_form`)**:
   These write tools advertise a default of `dryRun: true` (plan mode) in their schemas. However, they internally check `truthy(params.dryRun)`. Since `truthy(undefined)` resolves to `false`, omitting both `apply` and `dryRun` flags defaults to executing the write (importing or generating) instead of planning.
3. **Client connection hangs on size limit violations in `SizeLimitTransform`**:
   The stdio size guard (`SizeLimitTransform`) enforces a 1 MiB line/payload limit. When a violation occurs, it writes a JSON-RPC error frame with `id: null` to the stream and continues. Clients receiving an error with `id: null` cannot associate it with their pending request, causing the client to hang indefinitely.
4. **Error leaks and raw throw in `listOrphans`**:
   `AccessOrphanCleanupService.listOrphans` returns `Promise<AccessOrphanCandidate[]>` and catches its own internal scanning errors, returning empty arrays. However, the MCP stdio wrapper in `stdio.ts` throws raw `Error` objects instead of returning `OperationResult`, bypassing standard error-absorption mechanisms and potentially leaking internal details.

## Affected Areas

- `src/adapters/vba-sync/vba-execution-adapter.ts` — Contains the `executeInline` logic for `vba_inline_execution`.
- `src/adapters/vba-sync/vba-modules-adapter.ts` — Handles `import_modules` and `import_all` dry-run checking.
- `src/core/services/vba-form-service.ts` — Handles `generateForm` dry-run checking.
- `src/adapters/mcp/stdio-size-guard.ts` — Contains the `SizeLimitTransform` implementation.
- `src/core/operations/access-orphan-cleanup.ts` — Contains the `listOrphans` implementation.
- `src/adapters/mcp/stdio.ts` — Stdio server wrapper throwing raw errors.
- `src/adapters/mcp/canonical-handlers.ts` — Invokes `listOrphans` directly.
- `src/adapters/mcp/result-translation.ts` — Declares typing/interfaces for `orphanCleanupService`.

## Approaches

### 1. VBA Inline Execution Sanitization
- **Approach 1 (Blocklist Regex)**: Scan the input `code` using a regex blocklist (blocking `Declare`, `Shell`, `CreateObject`, `GetObject`, `Lib`) and return `INVALID_INPUT` if any match.
- **Approach 2 (Access Group Policy / Sandbox)**: Rely on system-level settings. Hard to enforce or guarantee programmatically.

### 2. `dryRun` Defaults
- **Approach 1 (Handler-level defaults)**: Check `const isDryRun = params.apply === true ? false : params.dryRun !== false;` in the handlers.
- **Approach 2 (Pre-injection)**: Inject `dryRun: true` in `dispatch-factory.ts` if neither parameter is present.

### 3. SizeLimitTransform Hangs
- **Approach 1 (Destroy stream on violation)**: Write the error frame, then call `this.destroy()` to close the stdio channel, preventing client hangs.
- **Approach 2 (Parse ID)**: Parse the ID from the oversized chunk. Highly unsafe/unreliable.

### 4. `listOrphans` Signature Alignment
- **Approach 1 (OperationResult signature)**: Change the service and adapters to return `Promise<OperationResult<AccessOrphanCandidate[]>>` and replace raw throws in stdio with `failureResult`.
- **Approach 2 (Local stdio try-catch)**: Keep the core service signature but wrap the stdio adapter code to absorb exceptions.

## Recommendation

- **VBA Inline Execution**: Use **Approach 1 (Blocklist Regex)**. It provides robust defense-in-depth sanitization at the tool boundary.
- **`dryRun` Defaults**: Use **Approach 1 (Handler-level defaults)**. Ensures consistent dry-run-by-default behavior across both CLI, MCP, and HTTP layers.
- **SizeLimitTransform Hangs**: Use **Approach 1 (Destroy stream on violation)**. Properly handles transport protocol violations by terminating the connection instead of hanging.
- **`listOrphans` Signature**: Use **Approach 1 (OperationResult signature)**. Standardizes error propagation across the core operations.

## Risks

- **False Positives in VBA Sanitization**: Extremely rare cases where local variable names or strings match blocklist keywords (e.g. variable named `shell`). Clean blocklist regexes matching word boundaries (`\b`) will minimize this.
- **Breaking MCP Clients on Stream Close**: Closing the connection is the standard way to handle transport-level frame errors.
