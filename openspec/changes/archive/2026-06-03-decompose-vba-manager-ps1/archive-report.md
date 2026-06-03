# Archive Report: Decompose dysflow-vba-manager.ps1 Dispatcher

| Field | Value |
|-------|-------|
| Change Name | `decompose-vba-manager-ps1` |
| Status | CLOSED |
| Archive Date | 2026-06-03 |
| Delivery | 7 PRs (stacked-to-main) |

## Summary

Refactored the monolithic 3,263-line `scripts/dysflow-vba-manager.ps1` by extracting all ten action handler arms (`Export`, `Import`, `Delete`, `List-Objects`, `Exists`, `Run-Procedure`, `Run-Tests`, `Compile`, `Generate-ERD`, `Fix-Encoding`) into independent, testable `Invoke-*` functions. State is passed via explicit parameters rather than script-scoped globals, and the dispatcher has been reduced to a thin router. Brittle raw source-text assertions in Pester and `split("\n")` assertions in Vitest were replaced with behavior-preserving AST extraction and wiring change-detectors, satisfying the P6 test pattern while preserving byte-for-byte observable execution behavior.

## PRs

| PR | Title | Status |
|----|-------|--------|
| PR #386 | refactor/decompose-vba-manager-s1-export | Merged |
| PR #388 | refactor/decompose-vba-manager-s2-list-exists | Merged |
| PR #397 | refactor/decompose-vba-manager-s3-generate-erd | Merged |
| PR #392 | refactor/decompose-vba-manager-s4-delete | Merged |
| PR #394 | refactor/decompose-vba-manager-s5-compile-run | Merged |
| PR #396 | refactor/decompose-vba-manager-s6-run-tests-fix-encoding | Merged |
| PR #399 | refactor/decompose-vba-manager-s7-import | Merged |

## Key Artifacts

- `scripts/dysflow-vba-manager.ps1` — Refactored monolithic script into modular `Invoke-*` functions and a thin dispatcher.
- `scripts/tests/dysflow-vba-manager.Tests.ps1` — Added behavioral Pester tests using AST parsing and override seams; eliminated brittle string matching.
- `test/scripts-vba-manager.test.ts` — Replaced line-splitting assertions with clean wiring change-detectors.
- `openspec/specs/vba-manager-actions/spec.md` — Specification documenting requirements and scenarios for the ten extracted actions.
