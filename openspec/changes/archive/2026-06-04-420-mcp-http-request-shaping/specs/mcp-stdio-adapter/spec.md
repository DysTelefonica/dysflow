# Delta for mcp-stdio-adapter

## ADDED Requirements

### Requirement: Consolidated SQL Validation for MCP Read Tools

The MCP stdio adapter MUST reject write SQL statements in read-only tools by validating SQL input using the consolidated read-only heuristic (`looksLikeReadOnlySql`). This validation MUST allow read-only Common Table Expression (CTE) statements (starting with `WITH ... SELECT`) while rejecting write statements and multi-statement queries.

#### Scenario: MCP read tool execution succeeds with SELECT
- GIVEN the MCP adapter is active
- WHEN a read-only query tool is invoked with a standard SELECT query
- THEN it SHALL allow query execution and return the result

#### Scenario: MCP read tool execution succeeds with CTE
- GIVEN the MCP adapter is active
- WHEN a read-only query tool is invoked with a CTE query starting with `WITH ... SELECT`
- THEN it SHALL allow query execution and return the result

#### Scenario: MCP read tool execution rejects write statement
- GIVEN the MCP adapter is active
- WHEN a read-only query tool is invoked with SQL containing write keywords (e.g., `INSERT`, `UPDATE`, `DELETE`)
- THEN it MUST reject the request and return an `MCP_INPUT_INVALID` error

### Requirement: Declarative Parameter Mapping

The MCP stdio adapter MUST map tool input arguments to core operation payloads using declarative mapping helpers that handle fallbacks (such as mapping `table` or `tableName`, `query` or `sql`, etc.) consistently and type-safely.

#### Scenario: Parameter fallback resolves tableName from table
- GIVEN a tool invocation with parameter `table` but no `tableName`
- WHEN the argument mapper processes the input
- THEN it MUST map the value to `tableName` in the target operation payload

#### Scenario: Parameter fallback resolves sql from query
- GIVEN a tool invocation with parameter `query` but no `sql`
- WHEN the argument mapper processes the input
- THEN it MUST map the value to `sql` in the target operation payload

## MODIFIED Requirements

None

## REMOVED Requirements

None
