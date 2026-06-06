# Design: VbaFormService Real Dependencies

## Technical Approach

Resolve issue #441 by replacing fake constructor injection with real, typed I/O ports. `VbaFormService` remains core/protocol-neutral and keeps the four form operations unchanged at the MCP/VbaSyncAdapter boundary. The service will no longer accept `executor`, `resolveExecutionTarget`, or `validateStrictContext`; those are runner concerns used by `generate_erd`, not form JSON/catalog behavior.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Dependency model | Remove all dead deps only; or add real DI for used I/O | Add `FormFileSystemPort` and `FormClockPort`, remove runner deps | Removing dead deps alone leaves direct filesystem/time I/O in core and keeps tests reliant on temp files. Typed ports make observable behavior testable while preserving hexagonal boundaries. |
| Port ownership | Put ports in adapter; define in core | Define interfaces in `src/core/services/vba-form-service.ts` or adjacent core port file; adapter supplies Node implementation | Core owns the required capabilities, not Node details. Adapters depend inward and wire concrete I/O. |
| Adapter scope | Inject whole `VbaFormService`; or just wire ports | Keep `VbaFormsAdapter` owning service construction and wire Node ports there | Avoid broad adapter redesign. Public tool names/result shapes stay unchanged. |
| Backward compatibility | Preserve fake constructor fields; or delete them | Delete unused fields from `VbaFormServiceOptions` and update internal tests/callers | The fake API is the debt. Compatibility requirement applies to MCP/VbaSyncAdapter behavior, not unused test-only constructor props. |

## Data Flow

```text
MCP/VbaSyncAdapter ─→ VbaFormsAdapter ─→ VbaFormService(core)
                         │                    │
                         └─ wires Node ports ─┘
                                              ├─ FormFileSystemPort
                                              └─ FormClockPort
```

`generate_erd` continues through `executeMappedTool`; form JSON/catalog operations use only the form service ports.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/services/vba-form-service.ts` | Modify | Define/use typed `FormFileSystemPort` and `FormClockPort`; remove unused `unknown` deps and direct `node:fs/promises`/`Date` calls from behavior. |
| `src/adapters/vba-sync/vba-forms-adapter.ts` | Modify | Stop passing runner deps into form service; wire concrete Node filesystem/clock ports for form operations. |
| `test/core/services/vba-form-service.test.ts` | Modify | Strict-TDD port-level tests with fake filesystem/clock ports; assert returned results and written payloads without real FS. |
| `test/adapters/vba-sync/vba-forms-adapter.test.ts` | Modify | Characterize adapter behavior and ensure form tools do not call runner-only dependencies. |
| `test/adapters/vba-sync/vba-sync-adapter.test.ts` | Modify | Keep re-export/delegation compatibility assertions green if constructor call sites change. |

## Interfaces / Contracts

```ts
export interface FormFileSystemPort {
  mkdir(path: string, options: { recursive: true }): Promise<void>;
  readdir(path: string): Promise<string[]>;
  readJson<T>(path: string): Promise<T>;
  writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
}

export interface FormClockPort {
  nowIso(): string;
}

export type VbaFormServiceOptions = {
  cwd?: string;
  fileSystem: FormFileSystemPort;
  clock?: FormClockPort;
};
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Core | Spec validation, generated payload/path, catalog append/write failure, harvest filtering | Strict TDD: first add failing fake-port tests; mock only `FormFileSystemPort`/clock; assert protocol-neutral `OperationResult` and port-observable writes. |
| Adapter | `VbaFormsAdapter` routes form tools and keeps `generate_erd` runner path separate | Fake orchestrator; assert form tools return same results and do not call runner-only functions. |
| Full suite | No public MCP/tool regression | Run `pnpm test`; later verify with `pnpm build` in apply/verify phases. |

## Migration / Rollout

No migration required. No MCP schema, CLI flag, runtime install, Access binary, or config change.

## Open Questions

None.
