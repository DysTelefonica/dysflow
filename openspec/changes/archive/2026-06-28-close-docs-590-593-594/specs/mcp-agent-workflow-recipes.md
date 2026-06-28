# Spec: MCP Agent Workflow Recipes

## Requirement

Agent-facing documentation MUST include concise MCP workflow recipes so agents do not infer dangerous sequences from individual tool descriptions.

## Scenarios

### Scenario: agent can bootstrap and verify project context

- **Given** an agent starts work in an Access project
- **When** it reads the workflow recipes
- **Then** it MUST see setup/doctor/config verification steps before tool calls

### Scenario: agent can run the safe VBA sync loop

- **Given** an agent edits VBA source on disk
- **When** it reads the workflow recipes
- **Then** it MUST see the export/edit/import/compile/verify_code sequence and the form/report `.cls` versus `.form.txt` ownership rule

### Scenario: agent can recover from timeouts without process-name kills

- **Given** a Dysflow operation times out or is interrupted
- **When** the agent reads the workflow recipes
- **Then** it MUST see list/reconcile/orphan-discovery steps and an explicit warning not to kill `MSACCESS.EXE` by process name

### Scenario: agent can enable writes safely

- **Given** a task requires a write-capable MCP tool
- **When** the agent reads the workflow recipes
- **Then** it MUST see dry-run-first behavior, the `allowWrites`/`--enable-writes` choices, and the requirement to use `apply: true` only for intentional writes

### Scenario: agent can choose frontend versus backend query target

- **Given** a query or schema task can target either frontend or backend
- **When** the agent reads the workflow recipes
- **Then** it MUST see explicit guidance for `accessPath`, `backendPath`, `databasePath`, and `sourcePath`
