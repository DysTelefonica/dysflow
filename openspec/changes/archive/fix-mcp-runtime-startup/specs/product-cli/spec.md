## ADDED Requirements

### Requirement: OpenCode MCP config uses a Windows-safe runtime entrypoint

Dysflow MUST generate OpenCode MCP configuration that avoids directly spawning the Windows `.cmd` launcher for MCP startup while preserving a functional `dysflow mcp` server startup.

#### Scenario: Install writes a non-cmd OpenCode MCP command

- **Given** Dysflow is installed on Windows
- **When** the user runs the install flow with OpenCode integration selected
- **Then** the generated OpenCode MCP command MUST NOT directly reference `dysflow.cmd`
- **And** it MUST invoke the installed runtime entrypoint with the `mcp` argument.

#### Scenario: Integration refresh preserves the safe OpenCode command

- **Given** an existing OpenCode integration is refreshed from Dysflow
- **When** the integration selection is applied again
- **Then** Dysflow MUST write the same Windows-safe MCP startup shape
- **And** it MUST NOT regress the command back to direct `.cmd` spawning.

#### Scenario: Wrapper fallback still avoids direct cmd spawn

- **Given** a fallback wrapper is required to preserve runtime environment behavior
- **When** Dysflow writes the OpenCode MCP command
- **Then** the wrapper MUST be explicit and test-covered
- **And** the configured command MUST still avoid OpenCode directly spawning `dysflow.cmd`.

#### Scenario: Runtime entrypoint cannot be resolved

- **Given** Dysflow cannot resolve the installed runtime entrypoint for OpenCode
- **When** the integration writer attempts to generate the MCP config
- **Then** Dysflow MUST fail with an actionable error
- **And** it MUST NOT silently persist an invalid OpenCode MCP command.

### Requirement: Non-OpenCode agent launchers remain unchanged

Dysflow MUST keep existing launcher behavior for non-OpenCode agent integrations unless the user explicitly selects OpenCode.

#### Scenario: Other agent configs keep their existing launcher

- **Given** the user selects a non-OpenCode agent integration
- **When** Dysflow writes that agent config
- **Then** the generated command SHOULD remain compatible with the existing launcher behavior for that agent
- **And** the OpenCode-specific startup fix MUST NOT change unrelated agent config formats.
