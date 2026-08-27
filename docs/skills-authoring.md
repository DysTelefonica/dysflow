# Dysflow Skill Authoring & Bundling Guide

This guide describes the structure, frontmatter metadata, and maintenance lifecycle for bundled skills shipped with Dysflow.

## Skill Locations

Bundled skills live under `skills/` at the repository root:

- `skills/access-form-ui-builder/SKILL.md` — Access form perceive → act → verify workflow.
- `skills/dysflow-usage/SKILL.md` — Canonical MCP tool reference and operational guide.
- `skills/dysflow-arnes/SKILL.md` — Test harness / assertion rules.
- `skills/dysflow-codegraph-update/SKILL.md` — CodeGraph indexing workflow.
- `skills/dysflow-pointer-rollout/SKILL.md` — Pointer migration & rollout guide.
- `skills/dysflow-examples-sync/SKILL.md` — Synchronization examples.

## Frontmatter Metadata Specification

Every `SKILL.md` contains a YAML frontmatter header conforming to the schema below:

```yaml
---
name: dysflow-usage
description: "Operational guide for the dysflow MCP..."
license: Apache-2.0
metadata:
  author: "Andrés Román"
  version: "1.15.0"
  status: active
  last_verified: "2026-08-03"
  last_dysflow_version: "2.34.2"
  requires: "dysflow MCP >= 2.34"
  managed_by: "`dysflow install` / `dysflow update` ship this skill..."
---
```

### Field Semantics

| Field | Type | Description |
| --- | --- | --- |
| `name` | string | Unique skill identity matching its folder name. |
| `description` | string | Trigger conditions and concise description of the skill surface. |
| `license` | string | SPDX license expression (default: `Apache-2.0`). |
| `metadata.author` | string | Skill author or maintainer name. |
| `metadata.version` | string | SemVer version of the skill file itself. |
| `metadata.status` | string | `active` \| `deprecated` \| `experimental`. |
| `metadata.last_verified` | string | ISO date (`YYYY-MM-DD`) when the skill content was last audited. |
| `metadata.last_dysflow_version` | string | **The last dysflow release version this skill was explicitly validated against.** |
| `metadata.requires` | string | Minimum supported dysflow MCP version constraint. |
| `metadata.managed_by` | string | Installation and distribution note for consumer agents. |

> [!NOTE]
> **`last_dysflow_version` vs Runtime Release Version**:
> `last_dysflow_version` records the specific Dysflow runtime release against which the skill's instructions and contract assertions were last verified. It is **not** required to equal the current runtime release version. A skill whose `last_dysflow_version` trails the active release version remains valid; the field indicates soak/validation history rather than a hard version requirement.

## Maintenance and Release Bumping

1. **When updating skill logic**: Bump `metadata.version` (the skill's own version) and refresh `metadata.last_verified`.
2. **When validating against a new release**: After validating the skill against a new Dysflow release (e.g. via `fix(skills): align bundled metadata`), update `metadata.last_dysflow_version` to record the validated release tag.
3. **For release-owned skills**: Keep the skill in the installer, release archive, release preparation, and integrity-gate manifests. Release preparation advances its `last_dysflow_version` with the package version after the semantic audit passes.
