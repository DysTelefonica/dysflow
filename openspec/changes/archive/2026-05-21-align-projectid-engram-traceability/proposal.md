# Proposal: Align projectId with Engram Traceability

## Issue

GitHub issue: #126

## Problem

Dysflow MCP tool schemas expose `projectId` and `contextId` in a way that encourages duplicate values. The user expects `projectId` to match the canonical project identity reported by Engram for traceability.

## Goal

Make the semantics explicit and test-backed:

- `projectId` is the canonical traceable project identity.
- `contextId` is optional call/run context.
- `contextId` may be a fallback only when no canonical project id is provided.

## Non-goals

- Hard dependency on Engram at runtime.
- Changing every legacy tool name in this patch.

## Acceptance Criteria

- Tool schema descriptions guide agents to avoid duplicate `projectId`/`contextId` values.
- Config resolution keeps explicit `projectId` precedence over `contextId`.
- Tests cover explicit `projectId`, context-only fallback, and schema wording.
- README documents the intended traceability contract.
