# Proposal: redact-mcp-error-paths

## Summary
Redact local filesystem paths from MCP tool error content while preserving stable error codes and existing secret redaction behavior.

## Problem
`translateCoreResultToMcpContent` exposed raw core error messages. Those messages can contain absolute paths such as Access database locations. Secrets are already redacted, but infrastructure paths should not be exposed through the MCP protocol boundary.

## Scope
- Redact Windows and POSIX-like absolute paths in MCP error messages.
- Preserve `error.code` and useful non-path diagnostic text.
- Remove stale GitHub issue-number references from production-facing legacy service messages.

## Non-goals
- Do not remove detailed internal diagnostics from non-MCP internal metadata.
- Do not change PowerShell execution behavior.
