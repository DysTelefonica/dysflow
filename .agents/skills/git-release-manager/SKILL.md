---
name: git-release-manager
description: Create GitHub releases with automatic changelog generation and CHANGELOG.md management. Use this skill whenever the user wants to create a release, tag a version, generate or update a changelog, publish to GitHub, or automate their release workflow. Triggers on: "make a release", "create release", "tag version", "generate changelog", "update changelog", "publish release", "release v1.2.3", "cut a release", or any mention of versioning + GitHub releases. Works for any project type (Node, Python, .NET, Go, VBA, etc.) — language-agnostic.
---

# Git Release Manager

Automates GitHub releases with structured changelogs. Follows two industry standards:
- **[Keep a Changelog](https://keepachangelog.com)** — `CHANGELOG.md` in the repo
- **[Conventional Commits](https://www.conventionalcommits.org)** — auto-categorization from commit prefixes

## Prerequisites

- `git` installed and repo initialized
- `gh` CLI installed and authenticated (`gh auth status`)
- Remote origin pointing to a GitHub repository
- Commits using conventional prefixes (recommended, not required)

## Full Release Workflow

```
1.  Pre-flight checks (git, gh auth, clean tree, tag availability)
2.  Branch management: merge SourceBranch → TargetBranch (optional)
3.  Resolve previous tag for changelog range
4.  Auto-generate structured changelog from git log
5.  Open changelog in editor for review/edit        ← mixed step
6.  Prepend entry to CHANGELOG.md (create if missing)
7.  Commit CHANGELOG.md
8.  Create annotated git tag
9.  Push branch + tag to origin
10. Create GitHub Release with changelog as body
```

## Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `-Version` | ✅ | — | Semver tag, e.g. `v1.2.3` |
| `-SourceBranch` | ❌ | `develop` | Branch to merge from |
| `-TargetBranch` | ❌ | `main` | Branch to release on |
| `-NoMerge` | ❌ | `$false` | Skip merge, release current branch as-is |
| `-Draft` | ❌ | `$false` | Create GitHub Release as draft |
| `-Prerelease` | ❌ | `$false` | Mark as pre-release |
| `-AssetPath` | ❌ | — | File(s) to attach to the release |
| `-NoEdit` | ❌ | `$false` | Skip editor, use auto-generated changelog |
| `-Editor` | ❌ | auto | Override editor command (e.g. `"code --wait"`) |

**Editor auto-detection order**: `-Editor` param → `$env:EDITOR` → `code --wait` → `notepad++` → `notepad`

## Changelog Categories

Commits are categorized automatically by prefix:

| Prefix | Section |
|---|---|
| `feat!:`, `BREAKING CHANGE` in body | 💥 Breaking Changes |
| `feat:`, `feature:` | ✨ New Features |
| `fix:`, `bugfix:`, `hotfix:` | 🐛 Bug Fixes |
| `perf:` | ⚡ Performance |
| `refactor:` | ♻️ Refactoring |
| `docs:`, `doc:` | 📚 Documentation |
| `chore:`, `build:`, `ci:` | 🔧 Maintenance |
| *(uncategorized)* | 📦 Other Changes |

Merge commits and release chore commits are automatically excluded.

## CHANGELOG.md Format (Keep a Changelog)

If `CHANGELOG.md` doesn't exist, it's created with the standard header. Each release prepends a new entry:

```markdown
# Changelog

All notable changes to this project will be documented in this file.
...

## [v1.3.0] - 2026-03-12

### ✨ New Features
- feat: add export to JSON (`a1b2c3d`)

### 🐛 Bug Fixes
- fix: null pointer on empty list (`e4f5a6b`)

## [v1.2.0] - 2026-01-15
...
```

## Example Invocations

```powershell
# Release estándar: develop → main, abre editor para revisar
.\release.ps1 -Version v1.3.0

# Release sin merge (desde rama actual), sin editor
.\release.ps1 -Version v1.3.0 -NoMerge -NoEdit

# Pre-release desde feature branch
.\release.ps1 -Version v2.0.0-beta.1 -SourceBranch feature/nueva-ui -Prerelease

# Release borrador con asset adjunto
.\release.ps1 -Version v1.3.0 -Draft -AssetPath .\dist\app.zip

# Hotfix con editor específico
.\release.ps1 -Version v1.2.1 -SourceBranch hotfix/fix-crash -Editor "code --wait"
```

## Error Recovery

The script validates **before** making any destructive changes:
- Repo must be clean (no uncommitted changes)
- `gh auth` must pass
- Version tag must not already exist
- Source branch must exist (if merging)

If anything fails, exit is clean — no partial git state.

## Files in This Skill

- `SKILL.md` — This file
- `release.ps1` — Release automation script (PowerShell)
- `skill.json` — Skill metadata and trigger configuration