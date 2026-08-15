# Dysflow Codebase Guide

Dysflow is organized from the inside out: core defines behavior, adapters translate it, and the CLI selects an executable boundary.

[Back to Documentation](./DOCS.md)

## Who This Is For

| Reader | Use this guide to |
|---|---|
| New contributor | Build the mental model before opening a source file. |
| Maintainer | Find the layer that owns a behavior. |
| Reviewer | Check whether a change landed in the right layer. |
| Agent | Resolve where to edit without exploring the whole tree. |

## 90-Second Mental Model

```text
Users, agents, and scripts
          |
          v
  CLI / MCP / HTTP inputs
          |
          v
  src/cli + src/adapters
  translate protocols and I/O
          |
          v
       src/core
  domain rules and use cases
          |
          v
  runner ports and adapters
          |
          v
PowerShell / Access / filesystem
```

Dependencies point inward. Protocol and infrastructure details stay outside `src/core`; typed, protocol-neutral results flow back out.

For the complete boundary contract, read [Dysflow Core and Adapters](./docs/architecture/dysflow-core-and-adapters.md).

## Ownership Map

| Area | Owns | Does not own |
|---|---|---|
| `src/core/` | Domain rules, use cases, contracts, typed results, and runner abstractions | MCP, HTTP, or CLI presentation |
| `src/adapters/` | MCP, HTTP, VBA sync, filesystem, process, and other I/O boundaries | Product rules that belong in core |
| `src/cli/` | Command dispatch, argument handling, and human-readable command output | Protocol-neutral business behavior |

## Recommended Reading Path

| Step | Page | Read this when |
|---|---|---|
| 1 | [README](./README.md) | You need the product, safety, and workflow overview. |
| 2 | [Core and adapters architecture](./docs/architecture/dysflow-core-and-adapters.md) | You need the dependency rules before editing code. |
| 3 | [Testing philosophy](./docs/testing/testing-philosophy.md) | You are designing tests or reviewing test quality. |
| 4 | [Project config runtime contract](./docs/project-config-runtime-contract.md) | Your change resolves projects, worktrees, or paths. |
| 5 | [MCP protocol](./docs/mcp-protocol.md) or [HTTP API](./docs/api/http-api.md) | Your change touches an external boundary. |

## Quick Map

| If you need to change... | Open first | Then check |
|---|---|---|
| Domain behavior or an operation result | `src/core/` | [Architecture boundaries](./docs/architecture/dysflow-core-and-adapters.md) |
| MCP tool registration or envelopes | `src/adapters/mcp/` | [MCP protocol](./docs/mcp-protocol.md) and [extension guide](./docs/dev/mcp-tool-extension.md) |
| HTTP routes or status mapping | `src/adapters/http/` | [HTTP API](./docs/api/http-api.md) |
| CLI commands | `src/cli/` | Existing command handlers and core contracts |
| Access/VBA synchronization | `src/adapters/vba-sync/` | README safety rules and focused integration tests |
| Tests or quality gates | `test/` and the relevant source port | [Testing philosophy](./docs/testing/testing-philosophy.md) and [quality gates](./docs/testing/repo-quality-gates.md) |
| Release or update behavior | `scripts/` and release workflows | [Release checklist](./docs/release-checklist.md) and [update trust model](./docs/security/update-trust-model.md) |

## Core Invariants

- **Core owns behavior**: business logic stays in `src/core`. Adapters translate protocols and perform I/O, nothing more.
- **No adapter-to-adapter edges**: put protocol-neutral shared validation in `src/shared/`, or move the domain behavior into core.
- **Test at the ports**: assert observable behavior. Mock I/O boundaries, never internal collaborators.
- **Safety surfaces survive refactors**: operation ownership, write gates, explicit cleanup, and the signed release update path are preserved by every change.
- **Focused before broad**: run the repository's focused tests and quality gates before broad verification.
- **`AGENTS.md` is the operating contract**: it is authoritative for agents working in this repository.

## Existing References

| Reference | Focus |
|---|---|
| [Core and adapters architecture](./docs/architecture/dysflow-core-and-adapters.md) | Dependency direction, adapter boundaries, and CLI wiring |
| [Project config runtime contract](./docs/project-config-runtime-contract.md) | Configuration and worktree resolution |
| [Testing philosophy](./docs/testing/testing-philosophy.md) | Refactor-safe testing at ports |
| [Repository quality gates](./docs/testing/repo-quality-gates.md) | Current automated verification thresholds |
| [Update trust model](./docs/security/update-trust-model.md) | Release archive integrity and process-spawn safety |
| [Absent by design](./docs/architecture/absent-by-design.md) | Capabilities this repository deliberately does not have |
| [Documentation index](./DOCS.md) | Task-oriented navigation across all documentation |

## Contributor Checklist

- [ ] Name the observable behavior before naming the file you will edit.
- [ ] Decide whether the change belongs to core, an adapter, or the CLI.
- [ ] Confirm the capability exists before documenting it — see [Absent by design](./docs/architecture/absent-by-design.md).
- [ ] Read the tests next to the port you are changing before adding a new pattern.
- [ ] Link an existing doc instead of restating it.

## Next Step

Read [Core and adapters architecture](./docs/architecture/dysflow-core-and-adapters.md) next.
