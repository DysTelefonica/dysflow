# Tasks: Align projectId with Engram Traceability

## Strict TDD

- [x] RED: schema describes `projectId` as canonical project identity and `contextId` as optional run context.
- [x] RED: explicit `projectId` wins over `contextId` when both are present.
- [x] RED: context-only calls still fall back safely.
- [x] RED: `dysflow setup --set-project-id` updates `.dysflow/project.json`.
- [x] RED: malformed `.dysflow/project.json` returns a CLI error instead of throwing.
- [x] GREEN: update schema descriptions/docs and config/setup tests as needed.
- [ ] Verify: `pnpm test && pnpm build`.
