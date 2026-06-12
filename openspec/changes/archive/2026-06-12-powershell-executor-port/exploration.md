## Exploration: powershell-executor-port

### Current State
`AccessPowerShellRunner` still imports `POWERSHELL_EXE` and `spawnPowerShellProcess` from `src/core/runner/powershell-executor.ts`, then wraps that concrete spawn path in a local `spawnPowerShell` function. The executor contract is already type-shaped in the runner file, so tests can inject a fake executor, but the port is not yet formalized in `src/core/contracts`. The same core PowerShell helper is also imported directly by `src/adapters/vba-sync/vba-sync-adapter.ts`, so concrete spawn knowledge still leaks into core and adapter code.

### Affected Areas
- `src/core/contracts/index.ts` — best place to formalize the PowerShell executor port/types so core no longer owns the ad-hoc runner contract.
- `src/core/runner/access-runner.ts` — removes the direct concrete PowerShell import and consumes the port via injection.
- `src/core/runner/powershell-executor.ts` — concrete spawn/executable logic should move out of core ownership.
- `src/adapters/vba-sync/vba-sync-adapter.ts` — also imports the core concrete PowerShell helper directly, so it needs the same adapter-side replacement.
- `src/cli/commands/access.ts`, `src/cli/commands/doctor.ts`, `src/adapters/http/http-services-factory.ts`, `src/adapters/mcp/stdio.ts` — composition roots that currently instantiate `AccessPowerShellRunner` without an injected executor.
- `test/core/runner/access-runner-*.test.ts`, `test/core/runner/powershell-executor.test.ts`, `test/adapters/vba-sync/vba-sync-adapter.test.ts` — port tests and any module-path assertions will need to follow the new contract boundaries.

### Approaches
1. **Core port + adapter-owned default executor** — define `PowerShellExecutor` in core contracts, move the default `powershell.exe`/`spawnPowerShellProcess` implementation to an adapter module, and inject that executor at each composition root.
   - Pros: clean hexagonal boundary, core stops knowing executable details, behavior stays unchanged.
   - Cons: touches several composition sites and requires re-pointing existing tests.
   - Effort: Medium

2. **Thin compatibility shim around the old core helper** — keep a core wrapper for now and re-export the port while gradually moving the concrete spawn logic elsewhere.
   - Pros: fewer immediate call-site changes.
   - Cons: keeps concrete PowerShell knowledge in core longer; weaker alignment with the acceptance criteria.
   - Effort: Low/Medium

### Recommendation
Use approach 1. It matches the issue exactly: formalize the port in core contracts, move concrete executable/spawn details to an adapter-owned implementation, and inject the executor into `AccessPowerShellRunner` without changing runtime behavior.

### Risks
- Hidden call sites may still import the old concrete helper after the obvious composition roots are updated.
- `powerShell-executor` tests may need to move with the implementation, not just be renamed.
- The change can accidentally alter timeout/env/progress behavior if the adapter helper is not kept byte-for-byte equivalent.

### Ready for Proposal
Yes — proceed to `sdd-propose` for `powershell-executor-port` with a small, adapter-facing composition change and a matching port extraction in core.
