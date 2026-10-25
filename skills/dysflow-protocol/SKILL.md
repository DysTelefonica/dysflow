---
name: dysflow-protocol
description: "Retired (#1871). Points to dysflow-arnes (rules) and dysflow-usage (facts). Do not load for new work."
license: Apache-2.0
metadata:
  author: "Andrés Román"
  version: "3.0.0"
  status: retired
  last_verified: "2026-10-25"
  last_dysflow_version: "4.4.15"
  replaced_by: "dysflow-arnes (rules), dysflow-usage (consultation)"
  managed_by: "dysflow install / dysflow update"
---

# dysflow-protocol — retired

This skill is retired by #1871. Its hard rules now live in `dysflow-arnes`, and
its tool, flag and error facts live in `dysflow-usage`.

The directory is kept so that existing user-global symlinks to it keep
resolving. Remove the symlink once the agent has loaded the two replacements.

- Rules: `skills/dysflow-arnes/SKILL.md`
- Facts: `skills/dysflow-usage/SKILL.md`
