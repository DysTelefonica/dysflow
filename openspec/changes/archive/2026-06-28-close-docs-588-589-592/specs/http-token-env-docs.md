# HTTP Token Env Docs Spec

## Requirement

HTTP authentication docs MUST prefer environment-based token configuration via `httpTokenEnv` and `DYSFLOW_HTTP_TOKEN`; inline `httpToken` MUST be documented as local-only and not committed.

## Scenarios

### Scenario: README uses env-first HTTP auth config

Given a user copies the project config example from the README
When they configure HTTP authentication
Then the example MUST use `httpTokenEnv` with `DYSFLOW_HTTP_TOKEN`.

### Scenario: HTTP API docs explain precedence and local-only inline tokens

Given a user reads the HTTP API authentication section
When both env and inline token options are described
Then the docs MUST state env-first precedence and warn that inline `httpToken` is only for local uncommitted configs.
