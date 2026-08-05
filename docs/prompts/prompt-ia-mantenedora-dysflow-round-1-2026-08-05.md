# Maintainer round 1 — skill discoverability and error remediation

Source: [GitHub issue #1403](https://github.com/DysTelefonica/dysflow/issues/1403).

The consumer reported that agents diagnosed Dysflow failures from static files
before loading the canonical operating skills or contacting the live runtime.
The observed runtime behavior itself was correct: `get_capabilities`,
multi-worktree ambiguity, recovery tokens, safe-by-default writes,
`schemaVersion: "dysflow.result/v1"`, and `humanCompilePending` required no
behavioral change.

## Repository-owned scope

This repository does not own an agent host's `<available_skills>` ranking API.
It owns the bytes that those hosts discover and install. The fix therefore
strengthens the bundled skill frontmatter, ships a canonical pointer template,
keeps the embedded project harness aligned, and adds structured skill/tool
guidance at the central MCP error-envelope seam.

Typed errors in v2.36.0 expose an additive `remediationHint` agent-guidance object with
`skill`, `section`, optional `tool`, and `hint`. The original plain-text
`remediation` instruction remains byte-for-byte compatible. This repository
already has many callers that consume it as a string, so replacing that field
with an object would be a breaking change rather than a minor addition.
