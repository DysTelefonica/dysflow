# Tasks: projectId Form Source Resolution

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 550-750 (new resolver ~180 + tests ~250 + 6 adapter files ~40-60 each + 1 E2E ~50) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (resolver+tests) -> PR 2 (Group B) -> PR 3 (Group A) -> PR 4 (Group C + resolve-project-tool + E2E) |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Pure resolver + full unit-test suite | PR 1 | base: feat/718-projectid-form-source-resolution (tracker). No adapter changes. |
| 2 | Group B double-`src` fix wired to resolver | PR 2 | base: PR 1 branch. Depends on PR 1. |
| 3 | Group A retrofit (4 tools, 3 files) | PR 3 | base: PR 2 branch. Depends on PR 1; independent of PR 2 logic but stacked for review flow. |
| 4 | Group C realign + resolve-project-tool fix + E2E | PR 4 | base: PR 3 branch. Depends on PR 1; closes the change. |

## Phase 1: Core Resolver (Foundation) — PR 1

- [x] 1.1 RED: unit test — `projectId`+`formName` resolves correct absolute path + candidate list (spec: projectId-driven resolution).
- [x] 1.2 RED: unit test — Case B idempotent join, no double-`src` nesting, `path.normalize` pre-step (`./src`, `src//forms`, `\`).
- [x] 1.3 RED: unit test — non-split basename-collision guard: `destinationRoot === projectRoot` never strips leading segment.
- [x] 1.4 RED: unit test — raw `destinationRoot`/`sourceRoot` caller (no `projectId`/`formName`) matches pre-existing join, no diagnostic.
- [x] 1.5 RED: unit test — literal `sourcePath` passthrough scenario reserved for Group A tools (documents expected resolver non-involvement).
- [x] 1.6 RED: unit test — failure diagnostic shape (`projectId`, `attemptedRelative`, `sourceRootRelative`, `remediation`) contains no absolute path substring.
- [x] 1.7 RED: unit test — resolver purity: identical inputs (mock config, no fs) produce identical output, zero I/O calls.
- [x] 1.8 GREEN: implement `src/core/config/form-source-resolver.ts` — `resolveFormSourceCandidates`, `buildResolutionDiagnostic`, `FormSourceInput`/`FormSourceCandidate`/`FormSourceDiagnostic` types.
- [x] 1.9 REFACTOR: confirm all Phase 1 tests green under `pnpm test`; no leaked fs/network calls.

## Phase 2: Group B Wiring — PR 2 (base: PR 1)

- [x] 2.1 RED: test — `form_add_control`/`form_deserialize` caller with `sourcePath: "src/forms/X.form.txt"` resolves without double-nesting (Case B regression).
- [x] 2.2 GREEN: modify `src/adapters/vba-sync/vba-forms-paths.ts` — replace blind `resolveMutationPath` concat with delegation to `resolveFormSourceCandidates`.
- [x] 2.3 GREEN: modify `src/adapters/vba-sync/vba-forms-managed-source.ts` — route Group B tools through the updated path helper.
- [x] 2.4 Verify: `pnpm test` green for Group B call sites; non-`src`-prefixed `sourcePath` callers unaffected.

## Phase 3: Group A Retrofit — PR 3 (base: PR 2)

- [x] 3.1 RED: test — `lint_form_code` additive `projectId` resolves `formName` vs `destinationRoot`; raw-path parity when `projectId` absent.
- [x] 3.2 GREEN: modify `src/adapters/vba-sync/vba-forms-lint-adapter.ts` (~336-344) — additive `projectId`/`formName`, delegate to resolver, preserve raw join byte-for-byte otherwise.
- [x] 3.3 RED: test — `inspect_form`/`compare_form` literal `sourcePath`/`targetPath` passthrough unchanged with no `projectId`/`formName`; new resolver path when supplied.
- [x] 3.4 GREEN: modify `src/adapters/vba-sync/vba-forms-read-tools.ts` (`inspect_form` :24,37; `compare_form` :87-88,111,121) — additive inputs, literal passthrough preserved, aliases `path`/`target` kept.
- [x] 3.5 RED: test — `form_serialize` literal `sourcePath` passthrough unchanged; new resolver path when `projectId`/`formName` supplied.
- [x] 3.6 GREEN: modify `src/adapters/vba-sync/vba-forms-serialization-tools.ts` (:47,59) — additive inputs, passthrough preserved.
- [x] 3.7 Verify: `pnpm test` green for all 4 Group A tools; zero raw-path/literal-path regressions.

## Phase 4: Group C + resolve-project-tool + E2E — PR 4 (base: PR 3)

- [ ] 4.1 RED: test — Group C projectRoot fallback realigned to `destinationRoot`; bench-cache tier untouched.
- [ ] 4.2 GREEN: modify `src/adapters/vba-sync/vba-forms-clone-tools.ts` — replace `resolveMutationPath(projectRoot, 'forms/{name}')` fallback with resolver against `destinationRoot`.
- [ ] 4.3 RED: test — `resolve-project-tool.ts` reads `destinationRoot` (fallback deprecated `sourceRoot`), output field name stable.
- [ ] 4.4 GREEN: modify `src/adapters/mcp/resolve-project-tool.ts` — fix nonexistent-field read.
- [ ] 4.5 Write one E2E test in `E2E_testing/mcp-e2e.mjs` — real `projectId` resolution vs `E2E_testing/.dysflow/project.json`; assert resolved path AND miss-remediation has no `[PATH]` substring.
- [ ] 4.6 Verify: full `pnpm test` + E2E green; confirm all Success Criteria in `proposal.md` are met.
