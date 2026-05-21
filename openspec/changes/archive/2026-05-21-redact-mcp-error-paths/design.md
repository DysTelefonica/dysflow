# Design: redact MCP error paths

## Boundary
Redaction belongs at the MCP adapter boundary because core services should keep structured errors and local diagnostics. The MCP adapter serializes user-facing protocol content and is the final point before exposure.

## Redaction rule
The adapter replaces absolute Windows paths like `C:\repo\file.accdb` and POSIX-like paths like `/repo/file.accdb` with `[PATH]`. It preserves the error code prefix and non-path message text.

## Production messages
Legacy service messages should not mention transient GitHub issue numbers. They should describe the unavailable capability in stable product terms.
