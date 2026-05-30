## Testing Capabilities

**Strict TDD Mode**: enabled
**Detected**: 2026-05-30
**Updated**: 2026-05-30 after active workspace scanning
**Project**: dysflow

### Test Runner

- Command: `pnpm test`
- Framework: Vitest
- Status: Available. Strict TDD remains enabled; implementation work must write failing tests first, make them pass, then refactor.

### Test Layers

| Layer | Available | Tool |
| --- | --- | --- |
| Unit | yes | Vitest |
| Integration | yes | Vitest |
| E2E | yes | Vitest + node E2E + Pester |

### Coverage

- Available: yes
- Command: `pnpm coverage`

### Quality Tools

| Tool | Available | Command |
| --- | --- | --- |
| Linter | yes | `pnpm lint` |
| Type checker | yes | `pnpm build` |
| Formatter | yes | `pnpm format:check` |

### Strict TDD Resolution

- Source: user/project instruction marker says Strict TDD Mode is enabled.
- Effective value: `strict_tdd: true`.
- Runner caveat: resolved. The project has `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm format:check`, and `pnpm coverage` available.
