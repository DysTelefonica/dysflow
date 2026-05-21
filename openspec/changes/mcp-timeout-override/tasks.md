# Tasks: MCP Timeout Override

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | <100 |
| 400-line budget risk | Low |
| Chained PRs recommended | No, this is one chained slice |

## Tasks

- [x] Add schema coverage proving legacy VBA runner tools accept `timeoutMs`.
- [x] Add `timeoutMs` schema property to relevant legacy VBA tools.
- [x] Verify existing service behavior passes explicit `timeoutMs` through to the runner.
- [x] Run focused tests.
- [x] Run build.
