# Proposal: centralize-legacy-tool-metadata

## Summary
Move maintenance query read/write mode metadata into the legacy parity registry and document the MCP operation registry fallback.

## Problem
Maintenance query tools used name-specific adapter conditionals to decide read vs write mode. That duplicated metadata outside the parity registry and made future tool additions easy to misclassify.

## Scope
- Add `queryMode` metadata for maintenance query tools in the parity registry.
- Use registry metadata when building maintenance query requests.
- Document the optional `operationRegistry` fallback in MCP service dependencies.
