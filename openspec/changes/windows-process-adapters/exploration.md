# Exploration: windows-process-adapters

### Current State
`src/core/operations/windows-processes.ts` mixes pure parsing helpers with concrete Windows process implementations. It imports `node:child_process` and owns `WindowsMsAccessProcessInspector`, `WindowsProcessKiller`, and `WindowsMsAccessProcessScanner`, while the port types already live in `src/core/operations/access-operation-cleanup.ts`.

The concrete classes are wired from three composition roots: `src/core/runner/access-runner.ts`, `src/adapters/http/http-services-factory.ts`, and `src/adapters/mcp/stdio.ts`, plus the VBA sync adapter default preflight path in `src/adapters/vba-sync/vba-operations-adapter.ts`. Current tests live in `test/core/operations/windows-processes.test.ts` and mock `node:child_process` there.

### Affected Areas
- `src/core/operations/windows-processes.ts` — current concrete process implementations live here and must move out of core.
- `src/adapters/process/windows-processes.ts` — new home for the Windows-specific process inspector/killer/scanner.
- `src/core/runner/access-runner.ts` — imports and instantiates the concrete implementations today.
- `src/adapters/http/http-services-factory.ts` — composition root wiring must switch to the adapter module.
- `src/adapters/mcp/stdio.ts` — same wiring change for the MCP server path.
- `src/adapters/vba-sync/vba-operations-adapter.ts` — dynamic import for preflight cleanup must move.
- `test/core/operations/windows-processes.test.ts` — tests currently coupled to the core module and child_process mock.

### Approaches
1. **Direct module move** — create `src/adapters/process/windows-processes.ts`, move the concrete classes and their PowerShell/child_process helpers there, then update all call sites.
   - Pros: clean hexagonal boundary; removes all `node:child_process` usage from `src/core`; aligns implementation with adapter ownership.
   - Cons: more import churn; test file likely needs to move with the implementation.
   - Effort: Medium

2. **Keep helpers in core, move only classes** — leave pure parsing helpers in `src/core/operations/windows-processes.ts` and move only the three concrete classes to adapters.
   - Pros: smaller textual diff; can reuse current helper tests with fewer edits.
   - Cons: core still owns a Windows-specific module name and implementation-adjacent code; boundary stays muddy.
   - Effort: Low

### Recommendation
Use the direct module move. The current `windows-processes.ts` file is implementation detail, and the ports already exist in core, so the cleanest fix is to delete the core module, add the adapter-owned module, and repoint the four wiring sites plus the test file.

### Risks
- Hidden import paths may remain after the move, especially in tests or future re-exports.
- The test suite currently mixes pure parsing assertions with child_process mocking, so it may need a small split to keep the adapter boundary clear.
- The new adapter path must preserve the existing PowerShell fallback behavior exactly; any script string drift could change cleanup semantics.

### Ready for Proposal
Yes — this is narrow enough for a proposal/spec slice. Tell the user the change can be done as a small adapter extraction with no behavior change, but it needs a focused import/wiring pass plus test relocation.
