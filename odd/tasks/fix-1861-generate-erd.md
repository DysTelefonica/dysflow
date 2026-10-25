# Issue 1861 — generate_erd without allowWrites, ERD as schema source
Branch: fix/1861-generate-erd-no-allowwrites (from origin/main); delivery: PR `Closes #1861`, merge when CI green, then release per docs/release-checklist.md.
Runner: pnpm exec vitest run (focused), pnpm test; PowerShell: pwsh -NoProfile -Command "Invoke-Pester -Path scripts/tests/dysflow-vba-manager.Tests.ps1".

## Specs
S1: "resuelve la issue 1861 end to end, luego cut release" (user, verbatim request in this session).
S2: Issue #1861 title, verbatim: "feat(generate_erd): generate the project ERD without allowWrites and make it the single schema source".
S3: Proposal 1, verbatim: "Do not require `allowWrites` for `generate_erd` when the only write is the ERD file inside the project root. Treat it as a documentation export, not a data or binary write. Keep `OUTSIDE_PROJECT_ROOT` for any other target."
S4: Proposal 2, verbatim: "Zero-argument default. `generate_erd({})` resolves the project, writes `docs/erd/ERD.md` (configurable in `.dysflow/project.json`), and needs no `destinationRoot` or `erdPath`."
S5: Proposal 3, verbatim: "Make the ERD the single source for schema questions. It must carry everything an agent needs to write SQL and fixtures without running anything: tables, field names and types, primary and foreign keys, relations, and required/optional flags."
S6: Proposal 4, verbatim: "Stamp the ERD with generation date and a fingerprint of the backend schema, so an agent can tell from the file alone whether it is stale, and only then regenerate."
S7: Proposal 5, verbatim: "Point `get_schema`'s documentation (and `dysflow-usage`) at the ERD as the first place to look, keeping `get_schema` for fields the ERD lacks."
S8: Acceptance, verbatim: "With `allowWrites: false`, `generate_erd({})` succeeds and creates `docs/erd/ERD.md`; it writes nothing else."
S9: Acceptance, verbatim: "The same call with a target outside the project root is still refused."
S10: Acceptance, verbatim: "The generated ERD contains the header stamp (date + schema fingerprint) and all columns, types, keys and relations."
S11: Acceptance, verbatim: "Docs and the `dysflow-usage` skill state: read the committed ERD first; regenerate when missing or stale; `get_schema` only for gaps."
S12: Issue evidence, verbatim: "`destinationRoot` must be passed explicitly or the dispatch seam refuses the call (#1226), so a bare call does not work either." -> the zero-arg call must not depend on destinationRoot.

## Decisions (parent, recorded for review)
D1: The write gate exemption applies only to generate_erd, and only when the resolved output file is inside the project root; the other gates (project config, OUTSIDE_PROJECT_ROOT) stay.
D2: Fingerprint = SHA-256 over the schema body (tables, fields, types, sizes, required, PK, relations), excluding the generation timestamp line, so identical schemas give identical fingerprints.
D3: The config key for the output path is optional; default is docs/erd/ERD.md relative to the project root. If adding a config key is not clean, document erdPath as the override and report it.

## Tasks
T1 [S8,S9] RED: dispatch gate test — generate_erd with writesEnabled=false succeeds for inside-root target and refuses outside-root. Route: inline/worker. Commit: -
T2 [S10,S5,S6] RED: Pester test for Export-DataStructure output: stamp line with date and `sha256:` fingerprint, PK/FK/relations present; fingerprint stable across two runs. Commit: -
T3 [S12,S4] RED: zero-arg generate_erd resolves default path docs/erd/ERD.md without destinationRoot. Commit: -
T4 GREEN: implement gate exemption (D1), default path (S4), stamp + fingerprint (S6), keep schema body complete (S5, S10). Commit: -
T5 [S7,S11] docs: docs/api/mcp-tools.md generate_erd entry, tool-parity-registry description (currently says "Read-only", which is wrong), get_schema description, skills/dysflow-usage (SKILL.md + assets/examples/generate-erd.md + example-hashes.json if the test requires). Commit: -
T6 full checks: pnpm test, biome check src/ test/, Pester focused run. Commit: -

## Log
L1: User request (verbatim): "resuelve la issue 1861 end to end, luego cut release" plus rules: worktree C:\00repos\codigo\dysflow-worktrees\fix-1861 on fix/1861-generate-erd-no-allowwrites from origin/main; test first RED then GREEN; conventional commits with no AI attribution; PR with `Closes #1861`; merge only if CI green; release per docs/release-checklist.md; do not touch gentle-ai managed files; do not run dysflow install against real home.
L2: Findings: write gate is in src/adapters/mcp/dispatch-factory.ts (isWriteGated includes isFilesystemWrite; generate_erd route in dispatch-routes.ts:152 has mutatesFilesystem:true, writeIntent always-gated). Writer is scripts/dysflow-vba-manager.ps1 Invoke-GenerateErdAction (line ~5483) and Export-DataStructure (~4363). Default path currently Parent(DestinationRoot)/ERD/<backend>.md. Schema in src/adapters/mcp/schemas/vba-sync-schemas.ts:856. Existing ERD already lists fields, sizes, required, PK and relations; no stamp.
