# migrate_project_config

`migrate_project_config` reads `.dysflow/project.json` from the supplied
`cwd` and (with explicit `apply:true`) rewrites it in place. Drives legacy
config migrations deterministically so consumers do not have to hand-edit
`accessPath` vs `frontendFile` or top-level `allowWrites` vs
`capabilities.allowWrites`.

## TL;DR

## Call shape

```json
{
  "tool": "migrate_project_config",
  "arguments": {
    "cwd": "<worktree>",
    "apply": false
  }
}
```

```js
// 1) Preview (default — read-only).
const preview = await tools.dysflow.migrate_project_config({});
if (preview.isError) throw new Error(preview.error?.code);
const { current, proposed, diff, remediation, applied } = JSON.parse(
  preview.content[0].text,
);

// 2) Commit after the consumer reviews the diff.
const committed = await tools.dysflow.migrate_project_config({ apply: true });
```

`migrate_project_config` is one of the conditional-write tools. The default
empty call is a pure read-class diff preview; `apply:true` atomically rewrites
the file and is write-gated through `MCP_WRITES_DISABLED`. Idempotent: a
config that is already migrated returns an empty diff and `applied:false`.

## Parameters

```ts
{
  projectId?: string; // optional cross-check (currently informational)
  cwd?: string;       // per-call cwd override (#1057 F10)
  apply?: boolean;    // canonical commit signal (#1167 unification)
}
```

The schema composes the shared `ProjectIdentity` block (for `projectId`)
and the shared write-intent block (canonical `apply`, plus tool-declared legacy `diff`) so the
consumer-facing description matches every other modern tool that uses
those atoms. The validator enforces the apply / diff
contradiction rule before the handler reaches the filesystem.

## Read-only path — `migrate_project_config({})`

Returns `{ outcome: "ok", configPath, current, proposed, diff, remediation[],
applied: false }` without writing. Use this surface when a consumer wants
to:

- Surface the proposed changes in a UI for human review.
- Compute the diff for a downstream `commit` step that needs an external
  approver (PR bot, security gate, etc.).
- Re-derive an already-migrated config to confirm idempotence.

```jsonc
{
  "outcome": "ok",
  "configPath": "C:/repos/my-app/.dysflow/project.json",
  "current": {
    "id": "my-app",
    "accessPath": "C:/Users/alice/repos/my-app/frontend.accdb",
    "allowWrites": true
  },
  "proposed": {
    "id": "my-app",
    "frontendFile": "frontend.accdb",
    "capabilities": { "allowWrites": true }
  },
  "diff": "--- C:/repos/my-app/.dysflow/project.json\n+++ C:/repos/my-app/.dysflow/project.json\n@@\n-  \"id\": \"my-app\",\n-  \"accessPath\": \"C:/Users/alice/repos/my-app/frontend.accdb\",\n+  \"capabilities\": {\n+    \"allowWrites\": true\n+  },\n+  \"frontendFile\": \"frontend.accdb\",\n@@\n",
  "remediation": [
    {
      "field": "accessPath",
      "from": "accessPath",
      "to": "frontendFile",
      "reason": "basename-only frontendFile resolves against the worktree root (#1092)..."
    },
    {
      "field": "allowWrites",
      "from": "allowWrites",
      "to": "capabilities.allowWrites",
      "reason": "T18 caps-block migration: top-level allowWrites is deprecated..."
    }
  ],
  "applied": false
}
```

The `diff` is a contextual, line-based unified diff over the JSON
representation of `current` vs `proposed` (no Myers algorithm — small files
only, the consumer is reviewing one project.json). An empty `diff` plus
empty `remediation[]` is the canonical "already migrated" signal.

## Apply path — `migrate_project_config({ apply: true })`

Same shape as the read-only path, but with `applied: true` stamped on the
response after the atomic write succeeds. Refuses with `MCP_WRITES_DISABLED`
when the MCP process or the project capabilities disallow writes.

```js
const result = await tools.dysflow.migrate_project_config({ apply: true });
if (result.isError) {
  switch (result.error?.code) {
    case "MCP_WRITES_DISABLED":
      // Either restart with --enable-writes or set
      // `capabilities.allowWrites: true` in .dysflow/project.json.
      throw new Error(result.error.message);
    case "PROJECT_CONFIG_NOT_FOUND":
      // Run `dysflow setup --cwd <cwd>` first.
      throw new Error(result.error.message);
    case "PROJECT_CONFIG_INVALID":
      // Repair the JSON in the config file, then retry.
      throw new Error(result.error.message);
    case "PROJECT_CONFIG_WRITE_FAILED":
      // The file is locked or not writable; retry once the lock is released.
      throw new Error(result.error.message);
  }
}
const payload = JSON.parse(result.content[0].text);
if (payload.applied) {
  // Atomic write succeeded; the on-disk file now matches `payload.proposed`.
} else {
  // Diff was empty; the on-disk file was already migrated.
}
```

The write is atomic: the proposed JSON is written to a sibling `.tmp` file
and renamed over the target so a half-written file never replaces the
original. If the rename fails, the `.tmp` is best-effort cleaned up before
the error surfaces.

## Idempotence contract

A config that is already migrated returns `diff: ""` and
`remediation: []` on a re-run. The apply path on a re-run returns
`applied: false` and leaves the file byte-identical. Consumers can
poll `migrate_project_config({ apply: true })` in a CI step without
producing spurious diffs.

```js
// First pass on a legacy config
await tools.dysflow.migrate_project_config({ apply: true });
// Second pass on the same (now-migrated) config
const second = await tools.dysflow.migrate_project_config({ apply: true });
const payload = JSON.parse(second.content[0].text);
expect(payload.applied).toBe(false);   // no-op on the second pass
expect(payload.diff).toBe("");         // empty diff → already migrated
```

## Migrations covered

The current revision handles three legacy shapes:

| Legacy field                                  | Migrated to                                      | Reference |
|-----------------------------------------------|--------------------------------------------------|-----------|
| `accessPath` (absolute or non-basename path)  | `frontendFile` (basename only)                   | #1092 / v2.23.1 |
| top-level `allowWrites: boolean`              | `capabilities.allowWrites: boolean`              | T18 caps-block |
| top-level `allowedProcedures: string[]`       | `capabilities.procedures.allow: string[]`        | deprecation read-through until v1.15.0 |

Future migrations are additive and reviewed here. Add the new entry to the
migration engine in `src/adapters/mcp/migrate-project-config-tool.ts`,
extend the test atoms in
`test/adapters/mcp/migrate-project-config-tool.test.ts`, and bump the
`remediation` payload's documented shape.

## Anti-patterns

- **Do NOT** pass `apply: true` without first calling the read-only
  preview on a non-trivial migration. The default path is intentionally
  cheap and never writes — use it as the review surface.
- **Do NOT** assume the migration engine rewrites every legacy shape in
  one pass. Check the `MIGRATIONS COVERED` table above before claiming a
  config is "fully migrated".
- **Do NOT** hand-edit the migration logic when a new legacy shape shows
  up — add the migration as a third branch in the engine and extend the
  test atoms instead.
- **Do NOT** skip the `apply: false` preview when you intend to run
  `apply: true`. `apply: true` is unconditional; the only safe review
  surface is the read-only diff.

## Cross-references

- `dysflow-usage` SKILL.md § "Self-check before any dysflow call" —
  point 7 cross-references this tool as the deterministic way to migrate
  a legacy `.dysflow/project.json`.
- `resolve_project` companion tool — re-checks the project config on
  disk; use it before `migrate_project_config` to confirm the active
  projectId / accessPath / projectRoot.
- `get_capabilities` — confirms `writesProject.allowWrites` is `true`
  before any `apply: true` call; the handler still surfaces
  `MCP_WRITES_DISABLED` for a defensive fail-closed.
- `diagnose` — full project health snapshot; surfaces the same project
  config shape the migration engine reads.
