# Design: Fix VBA Manager Hardness

## Technical Approach

Address 7 critical integration points across PowerShell and Node.js components:
1. **Post-Deletion Verification (Issue #1)**: In `Remove-AccessObjectOrComponent`, execute `Resolve-AccessObjectInfo` / `Resolve-ExistingComponentName` immediately after deletion. Throw explicit exit code exceptions if objects persist (active-lock).
2. **Parameterless Guard (Issue #2)**: In `Invoke-AccessProcedure`, check if `$ProcedureArgs.Count -eq 0 -and $metadata.Count -eq 0`. If so, directly call `$AccessApplication.Run` bypassing `ByRef` reference retry loops.
3. **Inline Execution Packaging (Issue #3)**: Use a stable module name `__dysflow_inline__`. Delete any preexisting instances, import, compile, run, and guarantee clean up via database `delete_module` and filesystem removal in a `finally` block.
4. **Zombie Process Pre-emptive Reap & Scan (Issues #4 & #7)**: In `AccessOperationPreflightCleanupService`, modify `retireUnownedRecord` and `scanAndCleanOrphans` to terminate processes that match the `accessPath` and are headless (containing `-Embedding`).
5. **Headless VBE Visibility Toggle (Issue #5)**: Temporarily set `$vbe.MainWindow.Visible = $true` inside `Get-ActiveVbeLocation` to force editor initialization. Restore original visibility state post-query. As a fallback, scan `VBComponents` for dirty modules where `.Saved` is `$false`.
6. **Strict JSON Sanitization (Issue #6)**: Strip leading BOMs (`\uFEFF`), trim whitespace, and clean markdown code fences (e.g., ` ```json `) from `proceduresJson` payloads prior to JSON parsing.

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| **VBE Visibility Toggle** | Briefly flashes VBE window, but initializes COM selections for precise error reports. | Toggle visibility and restore immediately. Fallback to scanning dirty `.Saved = $false` components. |
| **Zombie Killing Scope** | Killing interactive processes risks user data loss; checking `-Embedding` limits impact to headless instances. | Only kill processes running with the `-Embedding` flag. |
| **Inline Module Re-use** | Stable module name `__dysflow_inline__` prevents binary bloat, but concurrency needs serialization. | Use stable name with strict serial setup / teardown. |

## Data Flow

```text
vba_inline_execution (Node) ──→ Write __dysflow_inline__.bas
                                        │
Application.Run ────────────────────→ Import & Compile
                                        │
Finally Teardown ───────────────→ Delete & File Unlink
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/dysflow-vba-manager.ps1` | Modify | Implement post-deletion checks, arity 0 guard, VBE visibility toggle, and `.Saved` component fallback. |
| `src/adapters/vba-sync/vba-execution-adapter.ts` | Modify | Use stable inline module, compilation step, and strict JSON sanitization for test procedures. |
| `src/core/operations/access-operation-preflight.ts` | Modify | Support process killing for headless (`-Embedding`) unowned and matching processes. |

## Interfaces / Contracts

No changes to external interfaces. The internal `proceduresJson` parsing is made tolerant to leading BOMs and code fences.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `validateTestProceduresJson` parsing under dirty payloads (BOM, whitespace, code blocks) | Vitest unit tests in `test/adapters/vba-execution-adapter.test.ts` |
| Integration | Active-lock deletion failure behavior, parameterless run, and VBE visibility compiler resolution | PowerShell verification run / mock COM test verification |
| E2E | Timeout reaping of headless Access, inline execution compilation | Automated test harness verification |

## Migration / Rollout

No migration required.
