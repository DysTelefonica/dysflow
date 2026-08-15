# Dysflow Documentation

Dysflow documentation is organized by the task you need to complete. Start here, then follow the linked source of truth for details.

[Back to README](./README.md)

## Quick Navigation

| If you need to... | Start here | Audience |
|---|---|---|
| Install Dysflow or configure a project | [Install and verify Dysflow](./docs/SETUP.md) | Operators, contributors |
| Call the local HTTP API | [HTTP API reference](./docs/api/http-api.md) | Integration authors |
| Integrate through MCP | [MCP protocol](./docs/mcp-protocol.md) and [real-world examples](./docs/mcp-examples.md) | Agent and plugin authors |
| Look up an MCP tool's parameters or result contract | [MCP tool reference](./docs/api/mcp-tools.md) | Agent and plugin authors |
| Understand the repository before changing code | [Codebase guide](./CODEBASE-GUIDE.md) | Contributors, maintainers |
| Understand dependency direction and boundaries | [Core and adapters architecture](./docs/architecture/dysflow-core-and-adapters.md) | Contributors, maintainers |
| Write or review tests | [Testing philosophy](./docs/testing/testing-philosophy.md) and [quality gates](./docs/testing/repo-quality-gates.md) | Contributors, reviewers |
| Review update and write safety | [Update trust model](./docs/security/update-trust-model.md) and [adapter write gates](./docs/security/adapter-write-gates.md) | Security reviewers, maintainers |
| Prepare a release | [Pre-release checklist](./docs/release-checklist.md) | Maintainers |
| Diagnose an Access failure | [AI agent onboarding](./docs/ai-agent-onboarding.md), [HRESULT guide](./docs/diagnostics/hresult-guide.md), and [form import failures](./docs/diagnostics/form-import-gate-failures.md) | Operators, agent authors |
| Inspect tool-specific behavior | [Tool documentation](./docs/tools/) and [MCP examples](./docs/mcp-examples.md) | Operators, contributors |

## Documentation Boundaries

- `README.md` explains the product and its primary workflows.
- `CODEBASE-GUIDE.md` orients contributors inside the repository.
- `docs/` owns detailed operational, architectural, testing, security, and release references.
- `CHANGELOG.md` records released and unreleased changes.

[Next: Codebase Guide](./CODEBASE-GUIDE.md)
