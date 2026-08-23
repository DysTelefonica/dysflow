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
| `access-vba-sync` | The per-workflow dysflow skills: `vba-binary-sync`, `vba-binary-drift`, `vba-run-tests`, `vba-validate-manifest`, `vba-extract-candidates`, `vba-symbol-rename`, `vba-form-repair`, `vba-form-metadata-repair`, `vba-control-rename-safe`, `vba-blast-radius`, `vba-source-impact`, `vba-event-tracer`, `vba-handler-backtrace`, `vba-sql-impact`, `vba-query-decoupler`. |
| `access-vba-impact`, `access-vba-test-runner`, `vba-refactor-planner` | Same decomposition — use the specific per-workflow skill above. |
