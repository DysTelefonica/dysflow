# Deprecating a skill

When a skill is obsolete (the runtime no longer exposes what it depended on, or a higher-level
skill supersedes it):

1. Reduce `SKILL.md` to a banner + a migration table — do not keep or fix the old body (git
   holds the history):
   ```markdown
   # <skill-name> (DEPRECATED — DO NOT USE)
   > ## ⚠️ THIS SKILL IS DEPRECATED. DO NOT INVOKE. DO NOT INSTRUMENT. REMOVE FROM REGISTRY.
   ```
2. The `description` frontmatter starts with `⚠️ DEPRECATED — DO NOT USE — REMOVE FROM REGISTRY.`
   so trigger-matching de-prioritizes it.
3. Include a migration table with the modern equivalent (skill or tool), verified against
   `get_capabilities` / the replacement skill's current SKILL.md — not memory.
4. Remove the skill from the `available_skills` listing so it does not appear in future sessions.

## Deprecated skills (verify against the live runtime)

| Deprecated skill | Modern equivalent |
|---|---|
| `access-query` | `query_execute` (read/write) + `list_tables`, `get_schema`, `count_rows`, etc. Its whole surface duplicates dysflow. |
| `access-vba-sync` | The per-workflow dysflow skills: `vba-workflow`, `vba-binary-drift`, `vba-run-tests`, `vba-extract-candidates`, `vba-symbol-rename`, `vba-form-repair`, `vba-control-rename-safe`, `vba-source-impact`, `vba-event-tracer`, `vba-handler-backtrace`, `vba-sql-impact`, `vba-query-decoupler`. |
| `access-vba-impact`, `access-vba-test-runner`, `vba-refactor-planner` | Same decomposition — use the specific per-workflow skill above. |
| `vba-binary-sync`, `vba-module-source-readback` | `vba-workflow` for syncing source and binary (selective `import_modules` / `export_modules`, the drift gate before tests); `vba-binary-drift` for auditing and reporting drift. |
| `vba-validate-manifest` | `vba-run-tests`, which runs `validate_manifest` before every manifest-driven `test_vba` call. |
| `vba-form-metadata-repair` | `vba-form-repair` for broken forms; `import_modules` self-heals missing `AutoResize` and stale or absent `Attribute VB_Name` metadata. |
| `vba-blast-radius` | `vba-source-impact` for the source-tree impact of a symbol. |

A bundled skill may name a retired skill only here, or on a line that says it is retired;
`test/docs/bundled-skill-references-1964.test.ts` fails on any other reference that does not
resolve to `skills/<name>/SKILL.md`.
