## Testing Capabilities

**Strict TDD Mode**: enabled
**Detected**: 2026-05-15
**Updated**: 2026-05-15 after Dysflow HTTP API Foundation implementation
**Project**: dysflow

### Test Runner

- Command: `pnpm test`
- Framework: Vitest
- Status: Available. Strict TDD remains enabled; implementation work must write failing tests first, make them pass, then refactor.

### Test Layers

| Layer | Available | Tool |
| --- | --- | --- |
| Unit | yes | Vitest |
| Integration | yes | Vitest + in-process adapters/fetch |
| E2E | no | — |

### Coverage

- Available: no
- Command: `—`

### Quality Tools

| Tool | Available | Command |
| --- | --- | --- |
| Linter | no | — |
| Type checker | yes | `pnpm build` |
| Formatter | no | — |

### Strict TDD Resolution

- Source: user/project instruction marker says Strict TDD Mode is enabled.
- Effective value: `strict_tdd: true`.
- Runner caveat: resolved. The project now has `pnpm test` and `pnpm build`; future `sdd-apply` phases must use them.
