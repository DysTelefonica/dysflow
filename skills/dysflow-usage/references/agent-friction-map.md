# Dysflow agent friction map

Use this map when the goal is clear but the right runtime tool is not. Start with the family that
matches the friction, then open the linked example before calling the tool. Runtime metadata wins
when it differs from this map.

## Start and route

| Friction | Use | Read before acting |
|---|---|---|
| Need the current runtime, write gates, or preferred phase | [`bootstrap`](../assets/examples/bootstrap.md) | `adapterVersion`, `humanCompilePending`, write policy, and preferred workflows |
| Need the callable inventory | [`schema`](../assets/examples/schema.md) | Start with `view:"index"`; expand only the selected capability |
| Need exact parameters for one tool | [`describe_tool`](../assets/examples/describe-tool.md) | Parameter names, required composition, defaults, and errors |
| Need to select or diagnose a worktree | [`resolve_project`](../assets/examples/resolve-project.md) | Returned project identity and ambiguity recovery; never guess a candidate |

## Query and schema reads

| Friction | Use | Read before acting |
|---|---|---|
| Need a table's columns and types | [`get_schema`](../assets/examples/get-schema.md) | Resolve the intended database target first |
| Need a table cardinality check | [`count_rows`](../assets/examples/count-rows.md) | `rows[0].RowCount`; this is read-only and has no `apply` flag |
| Need the observed values of one column | [`distinct_values`](../assets/examples/distinct-values.md) | `rows[].Value`; treat the result as data, not a schema contract |
| Need saved-query source for review | [`export_queries`](../assets/examples/export-queries.md) | Explicit export intent and destination behavior from the live schema |

## Source and binary investigation

| Friction | Use | Read before acting |
|---|---|---|
| Need to distinguish a document module from a standard module | [`exists`](../assets/examples/exists.md) | Both Access-object and VBE-component fields |
| Need the binary module inventory or source bytes | [`list_vba_modules`](../assets/examples/list-vba-modules.md) | Structured module entries; do not infer binary coverage from disk files |
| Need actionable source/binary drift | [`verify_code`](../assets/examples/verify-code.md) | Compact recommendation and bulk lists before diagnostic detail |
| Need binary/source orphan candidates | [`vba_orphan_audit`](../assets/examples/vba-orphan-audit.md) | Per-entry `isOrphan`, `isSuspicious`, and `sourcePath`; review before deletion |

## VBA reference analysis

| Friction | Use | Read before acting |
|---|---|---|
| Need call sites for a symbol | [`find_references`](../assets/examples/find-references.md) | Pagination fields and source/binary differences for `scope:"all"` |
| Need unreferenced procedures or declarations | [`detect_dead_code`](../assets/examples/detect-dead-code.md) | Evidence and risk tier; findings are review candidates, not delete commands |
| Need syntax and maintainability diagnostics in one module | [`lint_module`](../assets/examples/lint-module.md) | Severity and line evidence; lint does not prove runtime reachability |

## Forms and UI validation

| Friction | Use | Read before acting |
|---|---|---|
| Need to validate a declarative form specification | [`validate_form_spec`](../assets/examples/validate-form-spec.md) | Typed validation findings before any form-generation write |
| Need a process-free visual readback | [`render_form_preview`](../assets/examples/render-form-preview.md) | SVG/ASCII geometry from source; it does not open Access |
| Need form code diagnostics | [`lint_form_code`](../assets/examples/lint-form-code.md) | Code findings are separate from layout and binding verification |

## Configuration and diagnostics

| Friction | Use | Read before acting |
|---|---|---|
| Need to create a config with a procedure allowlist or inherit one from a sibling worktree | [`setup_project`](../assets/examples/setup-project.md) | Preview `resolvedConfig`; use `capabilities.procedures.allow` for a fresh allowlist or `fromCwd` + `overrideProjectRoot` for a sibling import |
| Need to remove obsolete project fields safely | [`migrate_project_config`](../assets/examples/migrate-project-config.md) | Preview with `apply:false`; commit only after reviewing the plan |
| Need environment or project health checks | [`doctor`](../assets/examples/doctor.md) | Critical findings block; warnings remain diagnostic evidence |
| Need bounded invocation evidence | [`logs`](../assets/examples/logs.md) | Filter by exact tool or group by tool; telemetry does not contain argument values |

## Shared guardrails

- Re-enter through [`bootstrap`](../assets/examples/bootstrap.md) at the start of a session and
  after an adapter-version change.
- Read [`describe_tool`](../assets/examples/describe-tool.md) immediately before a non-trivial
  call; do not memorize flags or result fields from this map.
- Read-only tools never accept invented `apply` intent. Write-capable tools use the live
  `canonicalCommitFlag` and an explicit preview/commit choice.
- An analysis result is evidence, not mutation authority. Orphan and dead-code findings require
  source readback and human-reviewed intent before a destructive operation.
