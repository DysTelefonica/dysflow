# Proposal: remove-e2e-mcp-shadow-copy

## Summary
Stop `E2E_testing` from hiding or carrying independent MCP adapter source code. Real E2E checks must exercise the production Dysflow MCP implementation rather than a copied adapter.

## Problem
A local ignored `E2E_testing/src/adapters/mcp` tree diverged from production behavior: hardcoded server version, broad fake tool schemas, and config not propagated to MCP startup. Because `.gitignore` ignored all of `E2E_testing/`, this divergence could remain invisible to review and CI.

## Scope
- Replace the blanket `E2E_testing/` ignore with binary Access fixture ignore patterns.
- Add an architecture guard that fails if a shadow MCP adapter appears under `E2E_testing`.
- Document that E2E must invoke/import production MCP code.

## Non-goals
- Do not add real Access E2E execution to CI.
- Do not rewrite the production MCP adapter.
- Do not track local `.accdb` fixture binaries.

## Rollback
Revert this change to restore the previous ignore behavior, but doing so reopens the risk of unreviewed shadow source drift.
