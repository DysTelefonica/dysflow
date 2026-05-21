# Proposal: Fix Critical Audit Findings

## Issue

GitHub issue: #135

## Problem

The audit found three critical correctness issues before the next release:

- File access operation registry can lose records under concurrent read/modify/write.
- Access runner operation records write `projectRootAbs` and `destinationRootAbs` from `process.cwd()` instead of resolved config roots.
- Legacy fallback config source reports `repo-config` even when no repo config was loaded.

## Goal

Make operation tracking reliable and target metadata truthful.

## Acceptance Criteria

- Concurrent registry creates do not lose records.
- Runner operation records use config project/destination roots.
- Fallback target source is not falsely reported as `repo-config`.
- Strict TDD evidence captured.
