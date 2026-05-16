# MCP stdio adapter spec delta

## ADDED Requirements

### Requirement: MCP errors MUST redact local paths
MCP tool error content MUST NOT expose absolute local filesystem paths.

#### Scenario: Windows path in core error
- **Given** a core service returns an error message containing `C:\Proyectos\dysflow\NoConformidades.accdb`
- **When** the MCP adapter translates the result
- **Then** the content includes the stable error code
- **And** the absolute path is replaced with `[PATH]`

#### Scenario: existing secret redaction remains intact
- **Given** a core service returns a message with already-redacted secrets
- **When** the MCP adapter translates the result
- **Then** `[REDACTED]` remains present
- **And** diagnostics metadata is not emitted as MCP content
