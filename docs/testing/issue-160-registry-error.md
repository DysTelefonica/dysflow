# Issue #160: setup registry error

Status: update/close as already fixed.

`dysflow setup --set-project-id` reports malformed project registry JSON as
`Invalid Dysflow project registry JSON`. The setup command must not expose filesystem paths in this error because the registry can live under a user-local application data directory.

The behavior is covered by `test/cli/commands.test.ts`, including assertions that the error omits both the full registry file path and its parent home directory.

Follow-up: none unless the sanitized behavior regresses.
