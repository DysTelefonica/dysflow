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

## Response projection contract

`structuredContent` is the canonical projection for large JSON results.

The stdio seam keeps the complete legacy text projection for payloads up to
16,384 UTF-8 bytes so small responses and text-only clients remain unchanged.

When a payload exceeds that threshold, the text projection becomes a bounded
JSON summary and the complete payload appears only in `structuredContent`.

Schema version, `isError`, `ok`, and typed error code/message metadata remain
available in both projections.

JSON-stringifying the complete envelope remains supported for host wrappers
that flatten SDK results.

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

## Issue #1460 evidence

The following deterministic comparison uses the #1457 baseline as the
before-side and the built runtime after the response projection change as the
after-side.

Logical payload parity remains true for all 94 advertised tools; the reduction
is in the duplicated JSON-RPC wire projection:

| Measurement | #1457 logical | #1460 logical | #1457 wire | #1460 wire | Wire reduction |
| --- | ---: | ---: | ---: | ---: | ---: |
| `tools/list` | 309,214 | 309,214 | 309,249 | 309,249 | 0.00% |
| `get_capabilities` | 62,754 | 62,738 | 201,703 | 63,565 | 68.49% |
| `schema` full | 780,365 | 780,365 | 2,497,004 | 780,817 | 68.73% |
| `schema` compact | 119,108 | 119,108 | 382,209 | 119,560 | 68.72% |
| `describe_tool` aggregate | 1,022,684 | 1,022,684 | 3,290,232 | 2,912,575 | 11.48% |
| **Total** | **2,251,625** | **2,251,609** | **6,680,397** | **4,185,766** | **37.34%** |

The after-side does not grow logical payload bytes and keeps the `tools/list`
surface unchanged.

The committed baseline records the exact runtime version and parent commit
used to generate the after-side, so the shrink-only CI gate cannot hide later
growth.

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
