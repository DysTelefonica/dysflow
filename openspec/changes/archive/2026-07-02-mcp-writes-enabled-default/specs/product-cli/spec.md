# Delta for product-cli

## ADDED Requirements

### Requirement: `dysflow mcp` Writes-Enabled-By-Default Flag Semantics

`dysflow mcp` MUST enable writes by default when invoked with no write-related flags. `--disable-writes` MUST opt out to read-only. `--enable-writes` MUST remain accepted as a no-op for backward compatibility (writes stay enabled; no error). Passing both `--enable-writes` and `--disable-writes` together MUST be rejected with a non-zero exit code and the `MCP_USAGE` usage message — the CLI MUST NOT silently resolve the conflict to either state.

#### Scenario: Bare invocation enables writes
- GIVEN `dysflow mcp` is invoked with no arguments
- WHEN the command handler resolves its write default
- THEN it MUST start the MCP stdio adapter with writes enabled
- AND it MUST exit successfully

#### Scenario: `--disable-writes` opts out to read-only
- GIVEN `dysflow mcp --disable-writes` is invoked
- WHEN the command handler resolves its write default
- THEN it MUST start the MCP stdio adapter with writes disabled

#### Scenario: `--enable-writes` alone is an accepted no-op
- GIVEN `dysflow mcp --enable-writes` is invoked
- WHEN the command handler resolves its write default
- THEN it MUST start the MCP stdio adapter with writes enabled
- AND it MUST NOT return an error or non-zero exit code

#### Scenario: Both flags together are rejected
- GIVEN `dysflow mcp --enable-writes --disable-writes` is invoked (in either order)
- WHEN the command handler parses its arguments
- THEN it MUST return exit code `1`
- AND it MUST print the `MCP_USAGE` usage message on stderr
- AND it MUST NOT start the MCP stdio adapter
