# Tasks: Fix Critical Audit Findings

## Strict TDD

- [x] RED: concurrent FileAccessOperationRegistry creates lose records.
- [x] RED: Access runner records project/destination roots as process cwd.
- [x] RED: legacy fallback reports `repo-config` without a loaded project file.
- [x] GREEN: serialize registry mutations per instance/file.
- [x] GREEN: record config roots in operation metadata.
- [x] GREEN: report truthful fallback source.
- [x] Verify: `pnpm test && pnpm build`.
