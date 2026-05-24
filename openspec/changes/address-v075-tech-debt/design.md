# Design: Address v0.7.5 Technical Debt

## Technical Approach

Four independent, stacked-to-main PR slices under a 400-line budget. Each slice is a pure refactor or a contained bugfix with red→green TDD. No public API or MCP tool surface change (the only observable behavior change is the `dryRun` write-guard correction in PR1, which restores documented contract). Order is dictated by risk × leverage: smallest/highest-impact first, largest/most-isolated last.

## Architecture Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|----------|--------|----------|-----------|
| 1 | `dryRun` canonicalization | Module-level `resolveIsDryRun(input): boolean` in `tools.ts`; replace the 4 inline checks and the existing `isLegacyWriteDryRun` (alias removal). | Keep inline checks; or extract into `core/utils`. | One source of truth at adapter boundary; not core because the semantics (`apply` override, default-true) are MCP-adapter contract. |
| 2 | `process.env` bypass in `toLegacyMaintenanceRequest` | Add `env: Record<string, string \| undefined>` parameter; thread from `createDysflowMcpTools`. `McpToolContext` does NOT carry env, so we pipe it via a new optional parameter on `createDysflowMcpTools(services, writesEnabled, writeAccessResolver, env = process.env)`. Default keeps backwards compat. | Read `process.env` only at MCP server bootstrap and pass via `services`. | Smallest blast radius; mirrors how `loadDysflowConfig(input.env)` already accepts env. Avoids reshaping `DysflowMcpServices` shape. |
| 3 | Schema context props unification | Keep `SCHEMA_PROPS` as sole source. Delete `CONTEXT_PROPERTIES` (lines 59–62) and the `CTX` alias (line 288); inline `{ projectId: SCHEMA_PROPS.projectId, contextId: SCHEMA_PROPS.contextId }` via a single helper `const CTX_PROPS = { projectId: SCHEMA_PROPS.projectId, contextId: SCHEMA_PROPS.contextId }`. Migrate `VBA_EXECUTE_SCHEMA`, `QUERY_EXECUTE_SCHEMA`, `DOCTOR_SCHEMA` to use `CTX_PROPS`. | Merge `CONTEXT_PROPERTIES` into `SCHEMA_PROPS` literally; leave `CTX` as-is. | A single named constant (`CTX_PROPS`) is consumed by all schemas; descriptions converge to one canonical version. |
| 4 | Sanitizer UNC regex | Split the megapattern into a small array of alternatives sanitized in sequence (one `String.prototype.replace` per alternative). UNC alternative becomes `\\\\[^\\\\\s]+\\[^\\\\\s]+(?:\\[^\\\\\s]+)*\\?`. No nested optional repetition; no character class with `\s` AND `*` quantifier inside an outer `*`. | Rewrite as a single tightly-quantified pattern. | Sequential `replace` calls are linear in input length, immune to catastrophic backtracking, and trivially testable per alternative. |
| 5 | Test cleanup `release-matrix-gate.test.ts` | Drop `console.log` lines 33–37; the `expect(...).toBe(...)` lines below already assert the same numbers. Replace `as any` at line 29 with `as LegacyDysflowMcpToolName` (the inventory type already exported from `legacy-tool-inventory.ts`). | Gate `console.log` behind `process.env.VERBOSE`. | Counts ARE the contract; the assertion is the documentation. Console noise hides real failures in CI. |
| 6 | Non-null assertion `access-operation-preflight.ts:120` | Change `scanAndCleanOrphans` to accept `processScanner: ProcessScanner` as a parameter. Caller in `cleanup()` only invokes when `this.options.processScanner !== undefined` (line 59 guard already exists), passes it explicitly. | Convert to early throw; or use `if (!scanner) return`. | Type-system proof beats runtime check; caller already gates the call so this is a refactor that exposes existing invariant. |
| 7 | `InMemoryRegistry` purge parity | In `create()`: after building `stored`, `if (PURGED_PERSISTENT_STATUSES.has(stored.status)) return { ...stored, metadata: { ...stored.metadata } };` WITHOUT inserting into `this.records`. In `update()`: after patching, if status is in `PURGED_PERSISTENT_STATUSES`, `this.records.delete(operationId)` and return the patched object (caller observes the final state). | Skip `create` for completed/cleaned (always insert then maybe-evict); separate retention sweep. | Matches `FileRegistry` semantics exactly. `PURGED_PERSISTENT_STATUSES` already exported as module const (line 61). |
| 8 | Config sync/async dedup | Extract `loadDysflowConfigCore<T>(input, repoConfig)` that takes a resolved repo-config result and returns the build. Both `loadDysflowConfig` (sync) and `loadDysflowConfigAsync` are thin wrappers around `findRepoProjectConfigPath{,Async}` + `loadProjectConfigFromPath{,Async}` + this shared core. The `loadProjectConfigFromPath{,Async}` pair is split so the JSON-read step (the only sync/async difference) is injected. | Make sync wrap async via `deasync` or remove sync API. | Sync API is consumed at CLI startup; preserving it is mandatory. Injecting just the JSON reader keeps the diff small and the duplication zero. |
| 9 | VBA service split | Two new files under `src/core/services/`: `vba-form-service.ts` (form spec/catalog/generate paths, ~150 lines) and `vba-source-comparison.ts` (verify/reconcile pure functions, ~130 lines). `VbaSyncLegacyService` keeps its constructor and `execute()`; it INSTANTIATES `VbaFormService` and DELEGATES form/spec/catalog branches to it; comparison helpers are imported as free functions. Re-export both modules' public surface from `vba-sync-legacy-service.ts` (`export * from "./vba-form-service.js"` and selective re-exports for comparison) for one release cycle, so any direct test imports survive. | Extract everything into multiple new services; or split `VbaSyncLegacyService` class itself into N services. | Coordinator pattern preserves public surface (zero downstream import churn) while shrinking the monster file under 700 LOC. |
| 10 | install/uninstall helper extraction | New file `src/cli/commands/install-utils.ts` (note: under `src/cli/commands/`, not `src/cli/`, because that is where the actual `install.ts` and `uninstall.ts` live). Exports: `fileExists`, `readJson`, `writeJson`, `ensureObject`, `runCommand`, `runCommandOutput`. Both `install.ts` and `uninstall.ts` import from there. `install.ts` keeps temporary re-exports of `fileExists` (currently re-exported and consumed by `uninstall.ts`) for one release cycle; new code MUST import from `install-utils.ts`. | Move helpers into `core/utils/index.ts`. | These are CLI-layer concerns (child_process exec, JSON IO with CLI ergonomics). Core utils stay free of `child_process`. |

## Data Flow

**PR1 — `dryRun` resolution**

    handler input → resolveIsDryRun(input) → isDryRun boolean
                                          ↓
                            isWriteAllowed(input, writesEnabled, resolver)?
                                          ↓
                              translateCoreResultToMcpContent

**PR1 — env propagation**

    createDysflowMcpTools(services, writesEnabled, resolver, env=process.env)
                          ↓
                   buildLegacyParityTool(name, ..., env)
                          ↓
                   toLegacyMaintenanceRequest(name, input, env)
                          ↓
                   env[passwordEnv] resolves backendPassword

**PR3 — VBA coordinator**

    VbaSyncLegacyService.execute(toolName, input)
        ├── form/spec/catalog/erd → VbaFormService.{validateFormSpec, generateForm, ...}
        ├── verify/reconcile      → compareSourceAgainstBinary(...) (free fn)
        └── DIRECT_MAPPINGS       → executeMappedTool (stays in legacy service)

## File Changes

| File | Action | PR | Description |
|------|--------|----|-------------|
| `src/adapters/mcp/tools.ts` | Modify | 1 | env param threaded through `createDysflowMcpTools` → `toLegacyMaintenanceRequest`; `resolveIsDryRun` helper replaces 4 inline checks + `isLegacyWriteDryRun`; `CONTEXT_PROPERTIES` removed; `CTX_PROPS` consolidated; `sanitizeErrorMessage` rewritten as sequential `replace` calls |
| `test/adapters/mcp/release-matrix-gate.test.ts` | Modify | 1 | Remove `console.log` (lines 33–37); replace `as any` with `as LegacyDysflowMcpToolName` |
| `test/adapters/mcp/tools.dry-run.test.ts` | Create | 1 | Regression test: `apply: true` and `dryRun: false` both produce `dryRun: false` in `toLegacyMaintenanceRequest`; missing → `true`. **TDD red first.** |
| `test/adapters/mcp/tools.env.test.ts` | Create | 1 | `passwordEnv` resolves against injected env, NOT `process.env`. **TDD red first.** |
| `test/adapters/mcp/sanitize-error-message.test.ts` | Create | 1 | UNC, drive, posix, mixed inputs; perf test (long string, sub-50ms). **TDD red first.** |
| `src/core/operations/access-operation-preflight.ts` | Modify | 1 | `scanAndCleanOrphans(scanner: ProcessScanner, ...)`; non-null assertion removed |
| `src/core/operations/access-operation-registry.ts` | Modify | 1 | `InMemoryAccessOperationRegistry.create/update` purge `completed`/`cleaned` via existing `PURGED_PERSISTENT_STATUSES` |
| `test/core/operations/in-memory-registry-purge.test.ts` | Create | 1 | Mirrors `FileRegistry` purge test. **TDD red first.** |
| `src/core/config/dysflow-config.ts` | Modify | 2 | Extract `loadProjectConfigCore` (build step is common); both sync/async `loadDysflowConfig*` and both `loadProjectConfigFromPath*` become thin wrappers around it |
| `src/core/services/vba-form-service.ts` | Create | 3 | `class VbaFormService`: `validateFormSpec`, `generateForm`, `catalogAddControl`, `harvestFormCatalog`, `generateErd`-related helpers |
| `src/core/services/vba-source-comparison.ts` | Create | 3 | Free functions: `compareSourceAgainstBinary(toolName, params, ctx)`, `planReconcileBinary(params, ctx)`, internal `VbaSourceComparisonFile`/`Entry` types |
| `src/core/services/vba-sync-legacy-service.ts` | Modify | 3 | Slim to coordinator: instantiates `VbaFormService`, imports comparison functions, delegates branches; re-exports moved API for one release |
| `src/cli/commands/install-utils.ts` | Create | 4 | `fileExists`, `readJson`, `writeJson`, `ensureObject`, `runCommand`, `runCommandOutput` |
| `src/cli/commands/install.ts` | Modify | 4 | Imports the six helpers from `install-utils.ts`; keeps temporary `export { fileExists } from "./install-utils.js"` for back-compat |
| `src/cli/commands/uninstall.ts` | Modify | 4 | Imports `fileExists` from `install-utils.ts` directly; no longer pulls from `install.ts` |
| `test/cli/install-utils.test.ts` | Create | 4 | Per-helper unit tests; **TDD red first** |

## Interfaces / Contracts

```ts
// PR1 — tools.ts
function resolveIsDryRun(input: unknown): boolean;

export function createDysflowMcpTools(
  services: DysflowMcpServices,
  writesEnabled?: boolean,
  writeAccessResolver?: McpWriteAccessResolver,
  env?: Record<string, string | undefined>,    // NEW; default process.env
): DysflowMcpTool[];

function toLegacyMaintenanceRequest(
  name: LegacyDysflowMcpToolName,
  input: unknown,
  env: Record<string, string | undefined>,     // NEW
): AccessQueryRequest;

// PR1 — access-operation-preflight.ts
private async scanAndCleanOrphans(
  scanner: ProcessScanner,                     // NEW (was this.options.processScanner!)
  request: AccessOperationPreflightCleanupRequest,
  result: AccessOperationPreflightCleanupResult,
  handledPids: Set<number>,
): Promise<void>;

// PR2 — dysflow-config.ts
type ProjectConfigReader = {
  readJson<T>(path: string): T | Promise<T>;
  exists(path: string): boolean | Promise<boolean>;
};
function loadProjectConfigCore(
  resolvedPath: string,
  raw: DysflowProjectConfig,
  input: DysflowConfigInput,
  env: Record<string, string | undefined>,
  configSource: DysflowConfigSource,
  projectId: string | undefined,
): OperationResult<DysflowConfig>;
// sync wrapper uses readJsonFileSync + existsSync; async wrapper uses readJsonFileAsync + pathExists.

// PR3 — vba-form-service.ts
export class VbaFormService {
  constructor(options: { executor: VbaManagerExecutor; env: Record<string,string|undefined>; /* ...resolution context */ });
  validateFormSpec(params: Record<string, unknown>): Promise<OperationResult<unknown>>;
  generateForm(params: Record<string, unknown>): Promise<OperationResult<unknown>>;
  catalogAddControl(params: Record<string, unknown>): Promise<OperationResult<unknown>>;
  harvestFormCatalog(params: Record<string, unknown>): Promise<OperationResult<unknown>>;
}

// PR3 — vba-source-comparison.ts
export function compareSourceAgainstBinary(
  toolName: "verify_code" | "verify_binary",
  params: Record<string, unknown>,
  ctx: VbaComparisonContext,
): Promise<OperationResult<VbaVerifyResult>>;

export function planReconcileBinary(
  params: Record<string, unknown>,
  ctx: VbaComparisonContext,
): Promise<OperationResult<VbaReconcilePlanResult>>;

// PR4 — install-utils.ts
export function fileExists(filePath: string): Promise<boolean>;
export function ensureObject(value: unknown): Record<string, unknown>;
export function readJson(filePath: string): Promise<Record<string, unknown>>;
export function writeJson(filePath: string, value: unknown): Promise<void>;
export function runCommand(cmd: string, args: readonly string[], cwd: string): Promise<void>;
export function runCommandOutput(cmd: string, args: readonly string[], cwd: string): Promise<string>;
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit (PR1) | `resolveIsDryRun` truth table; `toLegacyMaintenanceRequest` env injection; `sanitizeErrorMessage` per-alternative + linear-time guard; `InMemoryRegistry.create/update` purge | Vitest, table-driven, no IO mocks needed |
| Unit (PR1) | `scanAndCleanOrphans` accepts injected scanner; preflight `cleanup` still wires it | Existing preflight tests cover; one new test for explicit scanner injection |
| Unit (PR2) | `loadProjectConfigCore` returns identical `DysflowConfig` for same inputs across sync/async wrappers | Property test: same fixture, both code paths, deep-equal |
| Unit (PR3) | `VbaFormService` methods called directly; `compareSourceAgainstBinary` called directly | Move existing tests off `VbaSyncLegacyService` where they only exercise form/comparison paths |
| Integration (PR3) | `VbaSyncLegacyService.execute("validate_form_spec", ...)` still routes correctly | Keep existing behavior tests as smoke; they MUST stay green untouched |
| Unit (PR4) | Each helper in isolation against a temp dir | Vitest with `mkdtemp` |
| Integration (PR4) | `uninstall.ts` no longer imports from `install.ts` (other than back-compat re-exports), proven by a static-analysis test | `import.meta`-based check or a small AST test |
| Regression | Full Vitest suite green after each PR | `pnpm test` |

Strict TDD per PR: red test demonstrating bug/missing-behavior first, implement, verify, repeat.

## Migration / Rollout

No data migration. No config schema change. No public API change. The four PRs land in order to main (stacked-to-main). Each is independently revertable via `git revert <merge-commit>`. PR1's `dryRun` fix closes a write-guard hole — released as a fix in the next patch version with a release note in CHANGELOG.

## Open Questions

- [ ] Should `install.ts` keep the `fileExists` re-export indefinitely or drop it the next minor? **Recommendation**: drop after v0.7.7 if no external consumer surfaces.
- [ ] `VbaFormService` constructor shape — does it need its own `resolveExecutionTarget`/`validateStrictContext`, or do those stay on the coordinator and get passed in? **Recommendation**: pass them as collaborators (constructor injection) to keep the new file pure.
