# Design: projectId Form Source Resolution

> Issue #718 — Phase 0 of epic #811 "AI-first Access form UI".

## Technical Approach

Introduce ONE pure resolver in `src/core/config` that produces an ordered list of
candidate on-disk paths for a form/report from `{ sourceRoot, projectRoot?, formName?,
sourcePath?, kind? }`. It performs NO I/O. Adapters load config via the canonical
`resolveExecutionTarget` / `loadDysflowConfigAsyncWith` stack (never `tryResolveProject`),
run the existence check, and on all-miss build a path-free typed diagnostic. Groups A, B,
and C all route source resolution through this single contract. Every new input is additive;
raw `destinationRoot`/`sourceRoot` callers keep their exact behavior.

## Architecture Decisions

### Decision: Pure candidate resolver, adapter owns I/O
**Choice**: Two pure functions in `src/core/config/form-source-resolver.ts` —
`resolveFormSourceCandidates(input): FormSourceCandidate[]` (ordered) and
`buildResolutionDiagnostic(input, candidates): FormSourceDiagnostic` (path-free).
**Alternatives**: resolver does its own `fs.exists`; build on `tryResolveProject`.
**Rationale**: Keeps `src/core` free of adapter I/O (hexagonal), makes candidate ordering
unit-testable with a mock fs at the port, and reuses validated config discovery instead of the
single-level naive reader that reads a nonexistent field.

### Decision: Idempotent join for Group B double-`src`, gated on split-project detection
**Choice**: When `sourcePath` is project-relative, first `path.normalize` it (collapses `./`,
doubled separators `src//forms`, and unifies `\`→`/`), then strip a leading segment equal to
the source-root sub-segment ONLY when the project is split — i.e. `destinationRoot !== projectRoot`
AND the stripped segment equals `relative(projectRoot, destinationRoot)`'s first segment (e.g.
`src`). Compare case-insensitively on Windows. When `projectRoot === destinationRoot`
(non-split), NEVER strip. Candidate order: `identity`/`idempotent-join` first, `naive-join`
retained as a trailing backward-compat candidate.
**Alternatives**: bare `basename(sourceRoot)` case-insensitive match (rejected — see below);
resolve project-relative paths against `projectRoot`; blind concat (status quo).
**Rationale**: `destinationRoot` = `<projectRoot>/src`, so a caller-supplied
`src/forms/X.form.txt` double-nests. But a bare `basename(sourceRoot)` strip is unsafe: in a
NON-split project `projectRoot === destinationRoot`, so `basename(sourceRoot)` is just the project
folder's own name — a project dir literally named `Forms` with a caller passing `forms/X.form.txt`
would get its leading segment wrongly stripped. Gating the strip on real split detection
(`destinationRoot !== projectRoot`, matching the actual `relative()` sub-segment) removes that
false-positive. The `normalize` step also prevents `./src/...` and `src//forms` from silently
degrading past the strip check into the slower naive-join probe. Non-prefixed inputs (`forms/X`)
stay untouched.

### Decision: [PATH]-safe diagnostic channel (CRITICAL gate)
**Choice**: The failure message is built from **relative** candidate paths + `projectId` +
remediation only — it carries NO absolute path. Absolute candidates go into structured
`error.details` (for the deferred issue to surface later).
**Alternatives**: return resolution miss as a `successResult` payload (unsanitized `stringifyForMcp`);
touch the sanitizer now.
**Rationale**: `sanitizeMcpErrorMessage` (`result-translation.ts:164`) collapses only *absolute*
paths. A path-free-absolute message has nothing for the regex to eat, so "no user-facing `[PATH]`"
holds WITHOUT modifying the deferred sanitizer, and the failure stays a real `isError:true` (no
error-semantics regression). The `details` drop is out of scope but harmless — the message is
already actionable.

### Decision: Group C — keep bench tier, realign projectRoot fallback
**Choice**: Preserve the bench-cache first tier (curated template library — an intentional,
separate source, not a path convention). Realign ONLY the projectRoot fallback: replace
`resolveMutationPath(projectRoot, 'forms/{name}')` with the shared resolver against
`destinationRoot` (yields `destinationRoot/forms/...`). Target write path mirrors the resolved
source tier.
**Rationale**: The current `<projectRoot>/forms` fallback misses the `src` segment for split
projects. Bench-first is deliberate and kept; only the divergent projectRoot path convention is
folded into the shared resolver. Backward-compatible when `projectRoot === destinationRoot`.

### Decision: Group A is NOT uniform — two distinct retrofit contracts
**Choice**: `lint_form_code` (`vba-forms-lint-adapter.ts:336-344`) is the ONLY tool that today
joins roots via `resolveRoot(destinationRoot, sourceRoot)` + `resolve(sourceRoot, folder, name)`.
The other three take a **literal** path handed straight to `fileSystem.readFile` with NO root join:
`inspect_form` (`vba-forms-read-tools.ts:24,37`, `sourcePath`), `compare_form`
(`vba-forms-read-tools.ts:87-88,111,121`, `sourcePath`+`targetPath`), `form_serialize`
(`vba-forms-serialization-tools.ts:47,59`, `sourcePath`).
- **`lint_form_code`**: additive `projectId`; when supplied, load config and resolve `formName`
  against config-derived `destinationRoot` via the shared resolver. When absent, keep the existing
  raw `destinationRoot`/`sourceRoot` root-join behavior byte-for-byte.
- **`inspect_form` / `compare_form` / `form_serialize`**: `sourcePath`/`targetPath` MUST remain a
  **literal-path passthrough** when neither `projectId` nor `formName` is supplied — it must NEVER
  be re-joined against `destinationRoot`. ONLY when `projectId`/`formName` IS supplied do they load
  config and delegate to the resolver. Aliases `path`/`target` preserved.
**Alternatives**: uniformly route all four through the resolver (rejected — breaks existing
literal-path callers of the three read tools).
**Rationale**: The three read tools have no root-join today; forcing one would re-root existing
absolute/literal callers and break them. Backward compat is a MANDATORY success criterion, so the
resolver is strictly additive and only engages on the new identity inputs.

### Decision: `resolve-project-tool.ts` field fix, stable output
**Choice**: Read `destinationRoot` from `project.json` (fallback to deprecated `sourceRoot`
alias). Keep the public output field name `sourceRoot` unchanged.
**Rationale**: The current read targets a nonexistent field; fixing the input read is correct.
Renaming the output would break dashboard consumers — keep it stable, source its value correctly.

## Data Flow

    MCP tool params ──► adapter: resolveExecutionTarget (config load, I/O)
                              │  {destinationRoot, projectRoot, projectId}
                              ▼
              resolveFormSourceCandidates (PURE, src/core) ──► ordered candidates[]
                              │
             adapter existence-check loop (fs port)
                    ├─ hit  ─► absolutePath
                    └─ miss ─► buildResolutionDiagnostic (PURE, relative-only)
                                   └─► failureResult(FORM_NOT_FOUND, msg, {details})

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/config/form-source-resolver.ts` | Create | Pure candidate resolver + typed diagnostic. |
| `src/adapters/vba-sync/vba-forms-paths.ts` | Modify | Idempotent join helper (strip redundant source-root segment). |
| `src/adapters/vba-sync/vba-forms-managed-source.ts` | Modify | Group B: route through shared resolver. |
| `src/adapters/vba-sync/vba-forms-lint-adapter.ts` | Modify | `lint_form_code`: additive `projectId`; resolve `formName` vs `destinationRoot`. Raw root-join preserved when absent. |
| `src/adapters/vba-sync/vba-forms-read-tools.ts` | Modify | `inspect_form` + `compare_form`: additive `projectId`/`formName`; literal-path passthrough when absent (NEVER re-join). |
| `src/adapters/vba-sync/vba-forms-serialization-tools.ts` | Modify | `form_serialize`: additive `projectId`/`formName`; literal-path passthrough when absent (NEVER re-join). |
| `src/adapters/vba-sync/vba-forms-clone-tools.ts` | Modify | Group C: realign projectRoot fallback to `destinationRoot`. |
| `src/adapters/mcp/resolve-project-tool.ts` | Modify | Read `destinationRoot` (alias `sourceRoot`); output field stable. |

## Interfaces / Contracts

```ts
export type FormSourceInput = {
  sourceRoot: string;          // resolved destinationRoot (absolute)
  projectRoot?: string;
  formName?: string;           // identity-based lookup
  sourcePath?: string;         // project-relative OR absolute raw path
  kind?: "form" | "report";    // default "form"
};
export type FormSourceCandidate = {
  absolutePath: string;
  relativePath: string;        // relative to sourceRoot — path-free messaging
  strategy: "identity" | "idempotent-join" | "naive-join" | "absolute";
};
export type FormSourceDiagnostic = {
  projectId?: string;
  sourceRootRelative: string;
  attemptedRelative: string[]; // NO absolute paths
  remediation: string;
};
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (ports) | projectId→path; Case B idempotent join (no double-`src`) AND non-split guard (project dir named `Forms` + `forms/X` NOT stripped); `lint_form_code` raw root-join parity; `inspect_form`/`compare_form`/`form_serialize` literal-path passthrough unchanged when no `projectId`/`formName`; `normalize` handles `./src`, `src//forms`, `\` vs `/`; diagnostic carries only relative paths | `pnpm test`, mock fs at the port |
| E2E | Real `projectId` resolution vs `E2E_testing/.dysflow/project.json`; assert resolved absolute path AND that a miss surfaces remediation with NO `[PATH]` | one E2E |

Strict TDD: write failing port tests first (resolver candidate ordering + path-free diagnostic), then the adapter wiring.

## Migration / Rollout

No migration required. All inputs additive; raw-path behavior preserved; revert = delete change folder + revert deltas.

## Open Questions

- [ ] None blocking. Group C realignment confirmed (keep bench tier, realign projectRoot fallback).
