# Proposal: clarify-mcp-write-timeouts

## Summary
Clarify legacy write dry-run semantics and make VBA manager timeout cancellation deterministic.

## Problem
Write tools use both `apply` and `dryRun` inputs. The safe default is correct, but tests should lock the compatibility aliases. VBA manager execution also had a service-level timeout plus a child-process kill timer; cancellation should have one owner.

## Scope
- Add regression coverage for `apply: true` and `dryRun: false` disabling dry-run while preserving safe default.
- Add a cancellation signal from `executeWithTimeout` to the executor.
- Let `spawnVbaManager` kill the child only when that signal aborts.
