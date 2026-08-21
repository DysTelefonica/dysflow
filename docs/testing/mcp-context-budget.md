# MCP context budget

The built-runtime context gate measures the model-visible and transport cost of
the advertised MCP surface.

It is intentionally separate from token estimates. Providers and clients
tokenize JSON differently, so no estimator is treated as universal truth.

## Reproducible command

Build first, then run the shrink-only check from the repository root:

```text
pnpm build
pnpm mcp:context-budget
```

The command starts `dist/cli/index.js mcp --disable-writes` in the committed
fixture directory `scripts/fixtures/mcp-context-budget`.

It performs the MCP initialize handshake over stdio and measures `tools/list`,
`get_capabilities`, full and compact `schema`, and every `describe_tool` call.

The fixture has no Access paths, credentials, network dependency, or mutable
project state.

## Measurements

- **Logical bytes** are UTF-8 bytes of recursively key-sorted JSON after
  decoding the model-visible tool result.
- **Wire bytes** are the exact UTF-8 bytes of each JSON-RPC response line,
  including its newline delimiter.
- **Contributors** report the largest input schemas, descriptions, metadata,
  schema entries, and `describe_tool` responses by logical bytes.
- **Parity** requires the stdio `tools/list` names to equal the full schema and
  `describe_tool` name sets.

The report also records the built runtime version and Git commit.

The committed baseline in `scripts/baselines/mcp-context-budget.json` was
generated from that command and is a ceiling: unchanged values pass, shrinkage
passes, and any unexplained growth fails CI.

A reviewed shrinkage can update the baseline with:

```text
pnpm build
node scripts/mcp-context-budget.mjs --write-baseline
```

That update must be accompanied by the change that explains the reduced
surface. Do not update the baseline to hide growth.

Do not add a tokenizer estimate as if it were a provider-independent fact.
