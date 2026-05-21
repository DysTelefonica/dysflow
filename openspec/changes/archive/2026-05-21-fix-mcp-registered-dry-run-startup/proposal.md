# Proposal: MCP Registered Dry-run after Startup Config Failure

## Issue

GitHub issue: #133

## Problem

If `dysflow mcp` starts outside a Dysflow repo, startup config resolution fails and all services become unavailable. That also disables import dry-run calls that could otherwise resolve a registered `projectId` / `contextId` safely from the global registry.

## Goal

Allow `import_all` / `import_modules` dry-run to resolve registered projects per call even when startup config was unavailable.

## Acceptance Criteria

- Startup outside repo + registered context dry-run returns plan.
- Plan includes resolved project id and paths.
- No Access executor is called.
- Unregistered context still fails clearly.
