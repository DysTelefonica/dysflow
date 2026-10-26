# generate_erd — dysflow MCP

## When to use

The committed ERD at `docs/erd/ERD.md` is the project's schema source. Read it
first for any schema question: tables, field names and types, sizes,
required flags, primary and foreign keys, and relations. Call `generate_erd`
only when the file is missing or stale.

## Contract

Documentation export. The tool has no `apply` argument and writes exactly one
Markdown file.

- When the resolved output file is inside the project root, the call runs with
  writes disabled (`allowWrites: false` or `dysflow mcp --disable-writes`).
- With writes disabled, a target outside the project root is refused with
  `OUTSIDE_PROJECT_ROOT`.
- `erdPath` is optional and resolves against the project root. An
  extension-less value gets `.md`; it is never a directory.
- The backend is the explicit `backendPath` argument, else the project
  config's `backendPath`, even outside the project root. When neither
  resolves, the error names the missing `backendPath`.

## Step 1 — regenerate the committed ERD (zero arguments)

```json
{
  "tool": "generate_erd",
  "arguments": {}
}
```

Writes `<projectRoot>/docs/erd/ERD.md`. No `destinationRoot` is needed.

## Step 2 — write to another file inside the project

```json
{
  "tool": "generate_erd",
  "arguments": {
    "projectId": "<project-id>",
    "erdPath": "docs/erd/Backend"
  }
}
```

Writes `<projectRoot>/docs/erd/Backend.md`.

## Is the ERD stale?

The header carries two stamp lines:

```text
Generado: 2026-10-25
Fingerprint: sha256:<64 hex>
```

The fingerprint is a SHA-256 over the schema body (tables, fields, types,
sizes, required flags, keys and relations). The generation date is excluded,
so an unchanged schema keeps the same fingerprint. Regenerate when the file is
missing, when a schema change landed after the `Generado` date, or when a
regenerated ERD shows a different fingerprint; commit the result.

## Anti-patterns for this call

- Don't call `get_schema` table by table before reading the ERD. Use
  `get_schema` only for a property the ERD does not carry.
- Don't pass `destinationRoot` to choose the ERD location; use `erdPath`.
- Don't point `erdPath` outside the project root to dodge the write gate; that
  target still needs writes enabled.

## Result shape (what the agent reads back)

- `markdownFile` — absolute path of the written ERD.
