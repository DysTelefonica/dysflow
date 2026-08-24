# dysflow doctor — focused diagnosis

Run the CLI doctor without mutating the project. Use categories to narrow failures while preserving a full all pass for release checks.

```powershell
dysflow doctor --cwd C:\path\to\worktree --category all
```

Categories are project config, VBA structure, runtime consumer, and external dependencies. Read each check's `severity`; only critical failures should control the failing exit status.

Use `resolve_project({"cwd":"<worktree>","projectId":"<id>"})` for MCP-side worktree selection. Doctor diagnoses configuration; it does not switch the active project or grant writes.
