# Skill Registry — dysflow

Generated: 2026-05-15

## Purpose

Compact project registry for orchestrators to inject only the relevant standards into sub-agent prompts.

## Project Convention Sources

- AGENTS.md instructions supplied in session context for `C:\Proyectos\dysflow`.
- Repository README and SDD plan under `docs/superpowers/plans/`.

## User Skills

| Skill | Trigger | Path |
| --- | --- | --- |
| access-module-encoding | Check encoding consistency and mojibake risks for Access/VBA exported modules (.bas/.cls) and related files, and fix common mojibake. Use when asked to review codificacion/encoding | `C:\Users\adm1\.codex\skills\access-module-encoding\SKILL.md` |
| access-query | Ejecuta SQL (lectura Y escritura) contra backends Access (.accdb) de proyectos VBA. Usar cuando necesites: ejecutar SQL libre (SELECT, INSERT, UPDATE, DELETE), obtener el esquema d | `C:\Users\adm1\.codex\skills\access-query\SKILL.md` |
| access-vba-sync | Definir un **skill** que automatice el workflow de desarrollo y documentación en un proyecto Microsoft Access/VBA: | `C:\Users\adm1\.codex\skills\access-vba-sync\SKILL.md` |
| branch-pr | Create Gentle AI pull requests with issue-first checks. Trigger: creating, opening, or preparing PRs for review. | `C:\Users\adm1\.codex\skills\branch-pr\SKILL.md` |
| chained-pr | Trigger: PRs over 400 lines, stacked PRs, review slices. Split oversized changes into chained PRs that protect review focus. | `C:\Users\adm1\.codex\skills\chained-pr\SKILL.md` |
| cognitive-doc-design | Design docs that reduce cognitive load. Trigger: writing guides, READMEs, RFCs, onboarding, architecture, or review-facing docs. | `C:\Users\adm1\.codex\skills\cognitive-doc-design\SKILL.md` |
| comment-writer | Write warm, direct collaboration comments. Trigger: PR feedback, issue replies, reviews, Slack messages, or GitHub comments. | `C:\Users\adm1\.codex\skills\comment-writer\SKILL.md` |
| defuddle | Extract clean markdown content from web pages using Defuddle CLI, removing clutter and navigation to save tokens. Use instead of WebFetch when the user provides a URL to read or an | `C:\Users\adm1\.codex\skills\defuddle\SKILL.md` |
| docker-expert | You are an advanced Docker containerization expert with comprehensive, practical knowledge of container optimization, security hardening, multi-stage builds, orchestration patterns | `C:\Users\adm1\.agents\skills\docker-expert\SKILL.md` |
| find-skills | Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending c | `C:\Users\adm1\.agents\skills\find-skills\SKILL.md` |
| go-testing | Trigger: Go tests, go test coverage, Bubbletea teatest, golden files. Apply focused Go testing patterns. | `C:\Users\adm1\.codex\skills\go-testing\SKILL.md` |
| imagegen | Generate or edit raster images when the task benefits from AI-created bitmap visuals such as photos, illustrations, textures, sprites, mockups, or transparent-background cutouts. U | `C:\Users\adm1\.codex\skills\.system\imagegen\SKILL.md` |
| issue-creation | Create Gentle AI issues with issue-first checks. Trigger: creating GitHub issues, bug reports, or feature requests. | `C:\Users\adm1\.codex\skills\issue-creation\SKILL.md` |
| jira-confluence-sdd | Operate Jira and Confluence together for SDD, PRDs, specs, tasks, and linked documentation using the community CLIs already installed on this machine. Trigger: When reading or upda | `C:\Users\adm1\.codex\skills\jira-confluence-sdd\SKILL.md` |
| json-canvas | Create and edit JSON Canvas files (.canvas) with nodes, edges, groups, and connections. Use when working with .canvas files, creating visual canvases, mind maps, flowcharts, or whe | `C:\Users\adm1\.codex\skills\json-canvas\SKILL.md` |
| judgment-day | Trigger: judgment day, dual review, adversarial review, juzgar. Run blind dual review, fix confirmed issues, then re-judge. | `C:\Users\adm1\.codex\skills\judgment-day\SKILL.md` |
| obsidian-bases | Create and edit Obsidian Bases (.base files) with views, filters, formulas, and summaries. Use when working with .base files, creating database-like views of notes, or when the use | `C:\Users\adm1\.codex\skills\obsidian-bases\SKILL.md` |
| obsidian-cli | Use the obsidian CLI to interact with a running Obsidian instance. Use when the user wants to create, read, append, or search notes in Obsidian, manage daily notes, set properties, | `C:\Users\adm1\.codex\skills\obsidian-cli\SKILL.md` |
| obsidian-markdown | Create and edit Obsidian Flavored Markdown with wikilinks, embeds, callouts, properties, and other Obsidian-specific syntax. Use when working with .md files in Obsidian, or when th | `C:\Users\adm1\.codex\skills\obsidian-markdown\SKILL.md` |
| openai-docs | Use when the user asks how to build with OpenAI products or APIs and needs up-to-date official documentation with citations, help choosing the latest model for a use case, or model | `C:\Users\adm1\.codex\skills\.system\openai-docs\SKILL.md` |
| pdf | Use this skill whenever the user wants to do anything with PDF files. This includes reading or extracting text/tables from PDFs, combining or merging multiple PDFs into one, splitt | `C:\Users\adm1\.agents\skills\pdf\SKILL.md` |
| plugin-creator | Create and scaffold plugin directories for Codex with a required `.codex-plugin/plugin.json`, optional plugin folders/files, and baseline placeholders you can edit before publishin | `C:\Users\adm1\.codex\skills\.system\plugin-creator\SKILL.md` |
| skill-creator | Trigger: new skills, agent instructions, documenting AI usage patterns. Create LLM-first skills with valid frontmatter. | `C:\Users\adm1\.codex\skills\skill-creator\SKILL.md` |
| skill-installer | Install Codex skills into $CODEX_HOME/skills from a curated list or a GitHub repo path. Use when a user asks to list installable skills, install a curated skill, or install a skill | `C:\Users\adm1\.codex\skills\.system\skill-installer\SKILL.md` |
| telefonica-brand-design | Apply Telefónica Brand Factory and Mística design-system guidance to frontend projects, React apps, design systems, landing pages, apps, emails, decks, or documentation. Use when a | `C:\Users\adm1\.codex\skills\telefonica-brand-design\SKILL.md` |
| work-unit-commits | Plan commits as reviewable work units. Trigger: implementation, commit splitting, chained PRs, or keeping tests and docs with code. | `C:\Users\adm1\.codex\skills\work-unit-commits\SKILL.md` |
| writing-plans | Use when you have a spec or requirements for a multi-step task, before touching code | `C:\Users\adm1\.agents\skills\writing-plans\SKILL.md` |

## Compact Rules

### access-module-encoding
Trigger: Check encoding consistency and mojibake risks for Access/VBA exported modules (.bas/.cls) and related files, and fix common mojibake. Use when asked to review codificacion/encoding issues, to verify UTF-8 vs ANSI, to fix mojibake, or to detect BOM/UTF-16 problems before importing into Access.

- Use for Access/VBA-specific work and verify paths/encoding before import/export.

### access-query
Trigger: Ejecuta SQL (lectura Y escritura) contra backends Access (.accdb) de proyectos VBA. Usar cuando necesites: ejecutar SQL libre (SELECT, INSERT, UPDATE, DELETE), obtener el esquema de una tabla, listar tablas (locales o linked), contar registros, explorar valores únicos, comparar resultados entre backends, sembrar fixtures de test con guardas de seguridad, ejecutar scripts .sql, o hacer cleanup de datos de sandbox. Incluye: bloqueo de tablas linked, deny-list con wildcards, allow-list, dry-run, -StrictWrite, -Json para automatización, fixture log acumulativo, y resolución de passwords sin hardcoding.

- Use for matching test workflows; preserve existing project test conventions.

### access-vba-sync
Trigger: Definir un **skill** que automatice el workflow de desarrollo y documentación en un proyecto Microsoft Access/VBA:

- Use for Access/VBA-specific work and verify paths/encoding before import/export.

### branch-pr
Trigger: Create Gentle AI pull requests with issue-first checks. Trigger: creating, opening, or preparing PRs for review.

- Use issue-first, reviewable work units, and avoid oversized PRs.

### chained-pr
Trigger: Trigger: PRs over 400 lines, stacked PRs, review slices. Split oversized changes into chained PRs that protect review focus.

- Split PRs over **400 changed lines** unless a maintainer explicitly accepts `size:exception`.
- Keep each PR reviewable in about **≤60 minutes**.
- Use one deliverable work unit per PR; keep tests/docs with the unit they verify.
- State start, end, prior dependencies, follow-up work, and out-of-scope items in every chained PR.
- Every child PR must include a dependency diagram marking the current PR with `📍`.
- In Feature Branch Chain, create a draft/no-merge tracker PR; child PR #1 targets the tracker branch, later children target the immediate parent branch.
- Treat polluted diffs as base bugs: retarget or rebase until only the current work unit appears.
- Do not mix chain strategies after the user chooses one.

### cognitive-doc-design
Trigger: Design docs that reduce cognitive load. Trigger: writing guides, READMEs, RFCs, onboarding, architecture, or review-facing docs.

- Apply when the task trigger matches the skill description; keep context focused and follow local skill instructions.

### comment-writer
Trigger: Write warm, direct collaboration comments. Trigger: PR feedback, issue replies, reviews, Slack messages, or GitHub comments.

- Use issue-first, reviewable work units, and avoid oversized PRs.

### defuddle
Trigger: Extract clean markdown content from web pages using Defuddle CLI, removing clutter and navigation to save tokens. Use instead of WebFetch when the user provides a URL to read or analyze, for online documentation, articles, blog posts, or any standard web page.

- Use issue-first, reviewable work units, and avoid oversized PRs.

### docker-expert
Trigger: You are an advanced Docker containerization expert with comprehensive, practical knowledge of container optimization, security hardening, multi-stage builds, orchestration patterns, and production deployment strategies based on current industry best practices.

- Use current Docker best practices for image size, cache, security, and runtime separation.

### find-skills
Trigger: Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill.

- Use issue-first, reviewable work units, and avoid oversized PRs.

### go-testing
Trigger: Trigger: Go tests, go test coverage, Bubbletea teatest, golden files. Apply focused Go testing patterns.

- Prefer table-driven tests for multiple cases; use `t.Run(tt.name, ...)`.
- Test behavior and state transitions, not implementation trivia.
- Use `t.TempDir()` for filesystem tests; never rely on a real home directory.
- Keep integration tests skippable with `testing.Short()` when they run external commands or slow flows.
- For Bubbletea, test `Model.Update()` directly for state changes; use `teatest` only for interactive flows.
- Golden files must be deterministic; update only through the repo's `-update` path and rerun tests without `-update`.
- Use small mocks/interfaces around system or command execution boundaries.

### imagegen
Trigger: Generate or edit raster images when the task benefits from AI-created bitmap visuals such as photos, illustrations, textures, sprites, mockups, or transparent-background cutouts. Use when Codex should create a brand-new image, transform an existing image, or derive visual variants from references, and the output should be a bitmap asset rather than repo-native code or vector. Do not use when the task is better handled by editing existing SVG/vector/code-native assets, extending an established icon or logo system, or building the visual directly in HTML/CSS/canvas.

- Use issue-first, reviewable work units, and avoid oversized PRs.

### issue-creation
Trigger: Create Gentle AI issues with issue-first checks. Trigger: creating GitHub issues, bug reports, or feature requests.

- Use issue-first, reviewable work units, and avoid oversized PRs.

### jira-confluence-sdd
Trigger: Operate Jira and Confluence together for SDD, PRDs, specs, tasks, and linked documentation using the community CLIs already installed on this machine. Trigger: When reading or updating Jira issues, creating or updating Confluence pages, linking tickets with docs, or maintaining SDD/PRD artifacts across both tools.

- Use issue-first, reviewable work units, and avoid oversized PRs.

### json-canvas
Trigger: Create and edit JSON Canvas files (.canvas) with nodes, edges, groups, and connections. Use when working with .canvas files, creating visual canvases, mind maps, flowcharts, or when the user mentions Canvas files in Obsidian.

- Use for Obsidian-specific markdown, vault, note, canvas, or base work.

### judgment-day
Trigger: Trigger: judgment day, dual review, adversarial review, juzgar. Run blind dual review, fix confirmed issues, then re-judge.

- Resolve project skills before launching agents: read skill registry, match compact rules by target files/task, and inject the same `Project Standards` block into both judge prompts and fix prompts.
- Launch **two blind judges in parallel** with identical target and criteria; never review the code yourself.
- Wait for both judges before synthesis; never accept a partial verdict.
- Classify warnings as `WARNING (real)` only if normal intended use can trigger them; otherwise downgrade to INFO as `WARNING (theoretical)`.
- Ask before fixing Round 1 confirmed issues.
- After any fix agent runs, immediately re-launch both judges in parallel before commit/push/done/session summary.
- Terminal states are only `JUDGMENT: APPROVED` or `JUDGMENT: ESCALATED`.
- After 2 fix iterations with remaining issues, ask the user whether to continue.

### obsidian-bases
Trigger: Create and edit Obsidian Bases (.base files) with views, filters, formulas, and summaries. Use when working with .base files, creating database-like views of notes, or when the user mentions Bases, table views, card views, filters, or formulas in Obsidian.

- Use for Obsidian-specific markdown, vault, note, canvas, or base work.

### obsidian-cli
Trigger: Use the obsidian CLI to interact with a running Obsidian instance. Use when the user wants to create, read, append, or search notes in Obsidian, manage daily notes, set properties, or develop plugins.

- Use for Obsidian-specific markdown, vault, note, canvas, or base work.

### obsidian-markdown
Trigger: Create and edit Obsidian Flavored Markdown with wikilinks, embeds, callouts, properties, and other Obsidian-specific syntax. Use when working with .md files in Obsidian, or when the user mentions wikilinks, callouts, frontmatter, tags, embeds, or Obsidian notes.

- Use for Obsidian-specific markdown, vault, note, canvas, or base work.

### openai-docs
Trigger: Use when the user asks how to build with OpenAI products or APIs and needs up-to-date official documentation with citations, help choosing the latest model for a use case, or model upgrade and prompt-upgrade guidance; prioritize OpenAI docs MCP tools, use bundled references only as helper context, and restrict any fallback browsing to official OpenAI domains.

- Use for matching test workflows; preserve existing project test conventions.

### pdf
Trigger: Use this skill whenever the user wants to do anything with PDF files. This includes reading or extracting text/tables from PDFs, combining or merging multiple PDFs into one, splitting PDFs apart, rotating pages, adding watermarks, creating new PDFs, filling PDF forms, encrypting/decrypting PDFs, extracting images, and OCR on scanned PDFs to make them searchable. If the user mentions a .pdf file or asks to produce one, use this skill.

- Use when PDF files are created, read, split, merged, OCRed, or transformed.

### plugin-creator
Trigger: Create and scaffold plugin directories for Codex with a required `.codex-plugin/plugin.json`, optional plugin folders/files, and baseline placeholders you can edit before publishing or testing. Use when Codex needs to create a new local plugin, add optional plugin structure, or generate or update repo-root `.agents/plugins/marketplace.json` entries for plugin ordering and availability metadata.

- Use for matching test workflows; preserve existing project test conventions.

### skill-creator
Trigger: Trigger: new skills, agent instructions, documenting AI usage patterns. Create LLM-first skills with valid frontmatter.

- When working in this repo, first follow `docs/skill-style-guide.md` as the normative source before creating or updating skills.
- If that guide is unavailable, use the compact inline rules below.
- A skill is a runtime instruction contract for an LLM, not human documentation.
- Do not add a `Keywords` section; preserve essential trigger words in `description`.
- References must point to local files.
- Keep the skill body concise: target 180–450 tokens, recommended max 700, hard max 1000.

### skill-installer
Trigger: Install Codex skills into $CODEX_HOME/skills from a curated list or a GitHub repo path. Use when a user asks to list installable skills, install a curated skill, or install a skill from another repo (including private repos).

- Use issue-first, reviewable work units, and avoid oversized PRs.

### telefonica-brand-design
Trigger: Apply Telefónica Brand Factory and Mística design-system guidance to frontend projects, React apps, design systems, landing pages, apps, emails, decks, or documentation. Use when asked to make a project look like Telefónica, apply Telefónica/Telefonica/Mística/Mistica brand tokens, configure @telefonica/mistica with the Telefónica skin, create CSS variables/theme tokens, style components with Telefónica colors/typography/buttons/cards/forms, or review Spanish copy against Telefónica tone of voice.

- Use issue-first, reviewable work units, and avoid oversized PRs.

### work-unit-commits
Trigger: Plan commits as reviewable work units. Trigger: implementation, commit splitting, chained PRs, or keeping tests and docs with code.

- Use for matching test workflows; preserve existing project test conventions.

### writing-plans
Trigger: Use when you have a spec or requirements for a multi-step task, before touching code

- Apply when the task trigger matches the skill description; keep context focused and follow local skill instructions.
