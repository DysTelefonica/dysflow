# Documentation Quality Gates

Documentation-only pull requests skip code CI only when every changed path is a root Markdown file or a Markdown file under `docs/`.

## Local Check

```bash
node scripts/check-documentation-quality.mjs classify --base origin/main --head HEAD
node scripts/check-documentation-quality.mjs check --base origin/main --head HEAD
```

Unreadable, empty, ambiguous, mixed, and rename-to-non-doc diffs require code CI.

## Validation Scope

Validation covers root Markdown and `docs/**/*.md`, excluding `docs/archive/**`, `docs/prompts/**`, `openspec/**`, and operational artifacts.

Excluded paths still require code CI. New or renamed docs receive full validation; existing docs may reduce violations but may not increase them.

Relative links resolve against the compared Git tree, not the working directory, so local and CI runs agree.

## Skill Mapping

| Documentation Alan Style v1.0 rules | Enforcement |
|---|---|
| One H1; maximum H3 without jumps; allowed fence languages; paragraphs up to 200 characters | Automated: full for new docs, ratcheted for existing docs |
| Relative links; up to six external links; root and `docs/` naming | Automated: new links must resolve, link counts ratchet, and new paths must conform |
| Audience, voice, useful next action, scanability, semantic accuracy, single source of truth, marketing, and emojis | Human review |

`CI result` fails closed unless classification and required code jobs succeed. `Documentation quality` validates applicable Markdown and exits quickly for code-only changes.
