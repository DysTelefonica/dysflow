# Documentation Quality Gates

`scripts/check-documentation-quality.mjs` checks Markdown shape. No workflow runs it; run it locally before a docs change.

Every pull request runs the single `CI` job (lint, build, test), including docs-only changes.

## Local Check

```bash
node scripts/check-documentation-quality.mjs classify --base origin/main --head HEAD
node scripts/check-documentation-quality.mjs check --base origin/main --head HEAD
```

`classify` reports whether a diff is docs-only; `check` validates the applicable Markdown.

## Validation Scope

Validation covers root Markdown and `docs/**/*.md`, excluding `docs/archive/**`, `docs/prompts/**`, `openspec/**`, and operational artifacts.

New or renamed docs receive full validation; existing docs may reduce violations but may not increase them.

Relative links resolve against the compared Git tree, not the working directory, so runs from any working directory agree.

## Skill Mapping

| Documentation Alan Style v1.0 rules | Enforcement |
|---|---|
| One H1; maximum H3 without jumps; allowed fence languages; paragraphs up to 200 characters | Automated: full for new docs, ratcheted for existing docs |
| Relative links; up to six external links; root and `docs/` naming | Automated: new links must resolve, link counts ratchet, and new paths must conform |
| Audience, voice, useful next action, scanability, semantic accuracy, single source of truth, marketing, and emojis | Human review |
