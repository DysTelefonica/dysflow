# Design: centralize legacy tool metadata

The legacy parity registry remains the source of truth for legacy tool name, slice, implementation status, description, and maintenance query mode. The MCP adapter can still own request mapping, but it must not infer maintenance access mode from hardcoded name checks.

`operationRegistry` stays optional for embedded tests and simple runtime setup. When omitted, operation-list tools intentionally use the default process-local Dysflow registry.
